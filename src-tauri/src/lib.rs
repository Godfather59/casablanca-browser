use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{ContextMenu, Menu, MenuItem};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, Url, WebviewUrl};

const TOOLBAR_HEIGHT: f64 = 50.0;
const MAX_URL_LENGTH: usize = 8_192;
const MAX_TITLE_LENGTH: usize = 512;
const MAX_HISTORY_ENTRIES: usize = 1_000;
const MAX_DOWNLOAD_ENTRIES: usize = 500;

static WEBVIEW_COUNTER: AtomicU32 = AtomicU32::new(1);
static DATA_COUNTER: AtomicU32 = AtomicU32::new(1);
static WEBVIEWS: Mutex<Vec<String>> = Mutex::new(Vec::new());
static FULLSCREEN_WEBVIEWS: Mutex<Vec<String>> = Mutex::new(Vec::new());
static DATA_LOCK: Mutex<()> = Mutex::new(());

fn now_duration() -> std::time::Duration {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
}

fn unique_id(prefix: &str) -> String {
    format!(
        "{}-{}-{}",
        prefix,
        now_duration().as_millis(),
        DATA_COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

fn parse_browser_url(url: &str) -> Result<Url, String> {
    if url.len() > MAX_URL_LENGTH {
        return Err("URL is too long".to_string());
    }
    let parsed: Url = url
        .parse()
        .map_err(|error| format!("Invalid URL: {error}"))?;
    match parsed.scheme() {
        "about" | "blob" | "data" | "file" | "http" | "https" | "tauri" => Ok(parsed),
        scheme => Err(format!("Unsupported URL scheme: {scheme}")),
    }
}

fn parse_bookmark_url(url: &str) -> Result<Url, String> {
    let parsed = parse_browser_url(url)?;
    match parsed.scheme() {
        "file" | "http" | "https" => Ok(parsed),
        _ => Err("Only web pages and local files can be bookmarked".to_string()),
    }
}

fn parse_history_url(url: &str) -> Result<Url, String> {
    let parsed = parse_browser_url(url)?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        _ => Err("Only HTTP and HTTPS pages can be added to history".to_string()),
    }
}

fn bounded_text(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn tracked_webviews() -> Result<Vec<String>, String> {
    WEBVIEWS
        .lock()
        .map(|labels| labels.clone())
        .map_err(|_| "Webview state is unavailable".to_string())
}

fn ensure_tracked_webview(label: &str) -> Result<(), String> {
    let labels = WEBVIEWS
        .lock()
        .map_err(|_| "Webview state is unavailable".to_string())?;
    if labels.iter().any(|existing| existing == label) {
        Ok(())
    } else {
        Err(format!("Tab {label} is not managed by Casablanca"))
    }
}

fn set_tab_fullscreen(label: &str, fullscreen: bool) -> Result<(), String> {
    let mut labels = FULLSCREEN_WEBVIEWS
        .lock()
        .map_err(|_| "Fullscreen state is unavailable".to_string())?;
    labels.retain(|existing| existing != label);
    if fullscreen {
        labels.push(label.to_string());
    }
    Ok(())
}

fn is_tab_fullscreen(label: &str) -> bool {
    FULLSCREEN_WEBVIEWS
        .lock()
        .map(|labels| labels.iter().any(|existing| existing == label))
        .unwrap_or(false)
}

fn resize_tab(app: &tauri::AppHandle, label: &str, fullscreen: bool) -> Result<(), String> {
    let webview = app
        .get_webview(label)
        .ok_or_else(|| format!("Tab {label} not found"))?;
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let physical_size = window.inner_size().map_err(|error| error.to_string())?;
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let logical_width = physical_size.width as f64 / scale_factor;
    let logical_height = physical_size.height as f64 / scale_factor;
    let top = if fullscreen { 0.0 } else { TOOLBAR_HEIGHT };
    let height = (logical_height - top).max(0.0);

    webview
        .set_position(LogicalPosition::new(0.0, top))
        .map_err(|error| error.to_string())?;
    webview
        .set_size(LogicalSize::new(logical_width, height))
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn resize_tracked_tabs(app: &tauri::AppHandle) -> Result<(), String> {
    for label in tracked_webviews()? {
        if let Err(error) = resize_tab(app, &label, is_tab_fullscreen(&label)) {
            log::warn!("Failed to resize {label}: {error}");
        }
    }
    Ok(())
}

const TAB_INITIALIZATION_SCRIPT: &str = r#"
(() => {
    if (window.__casablancaInputBridgeInstalled) return;
    Object.defineProperty(window, '__casablancaInputBridgeInstalled', {
        value: true,
        configurable: false,
        writable: false
    });

    const bridgeToken = '__CASABLANCA_BRIDGE_TOKEN__';
    const sendAction = (action) => {
        window.location.assign(`casablanca-action://${action}?token=${bridgeToken}`);
    };

    window.addEventListener('keydown', (event) => {
        if (!event.isTrusted) return;
        const modifier = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        let action = null;

        if (modifier && event.shiftKey && key === 't') action = 'restore-tab';
        else if (modifier && event.shiftKey && key === 'j') action = 'open-downloads-folder';
        else if (modifier && key === 't') action = 'new-tab';
        else if (modifier && key === 'w') action = 'close-tab';
        else if (modifier && key === 'l') action = 'focus-address';
        else if (modifier && key === 'h') action = 'history';
        else if (modifier && key === 'b') action = 'bookmarks';
        else if (modifier && key === 'd') action = 'bookmark';
        else if (modifier && key === 'j') action = 'downloads';
        else if (modifier && key === 'r') action = 'reload';
        else if (modifier && key === 'tab') action = event.shiftKey ? 'previous-tab' : 'next-tab';
        else if (event.altKey && key === 'arrowleft') action = 'back';
        else if (event.altKey && key === 'arrowright') action = 'forward';
        else if (event.key === 'F5') action = 'reload';

        if (action) {
            event.preventDefault();
            event.stopPropagation();
            sendAction(action);
        }
    }, true);

    document.addEventListener('fullscreenchange', (event) => {
        if (!event.isTrusted) return;
        sendAction(document.fullscreenElement ? 'fullscreen-enter' : 'fullscreen-exit');
    });
})();
"#;

#[tauri::command]
async fn create_tab(app: tauri::AppHandle, url: String) -> Result<String, String> {
    let parsed_url = parse_browser_url(&url)?;
    let id = WEBVIEW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let label = format!("tab-{id}");
    let bridge_token = uuid::Uuid::new_v4().simple().to_string();
    let initialization_script =
        TAB_INITIALIZATION_SCRIPT.replace("__CASABLANCA_BRIDGE_TOKEN__", &bridge_token);
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let physical_size = window.inner_size().map_err(|error| error.to_string())?;
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let logical_width = physical_size.width as f64 / scale_factor;
    let logical_height = physical_size.height as f64 / scale_factor;
    let content_height = (logical_height - TOOLBAR_HEIGHT).max(0.0);

    let navigation_app = app.clone();
    let navigation_label = label.clone();
    let navigation_token = bridge_token;
    let title_app = app.clone();
    let title_label = label.clone();
    let load_app = app.clone();
    let load_label = label.clone();
    let popup_app = app.clone();
    let popup_label = label.clone();
    let download_app = app.clone();
    let download_label = label.clone();

    let builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed_url))
        .initialization_script(initialization_script)
        .on_navigation(move |next_url: &Url| {
            if next_url.scheme() == "casablanca-action" {
                let action = next_url.host_str().unwrap_or_default();
                let supplied_token = next_url
                    .query_pairs()
                    .find_map(|(key, value)| (key == "token").then(|| value.into_owned()));
                if supplied_token.as_deref() != Some(navigation_token.as_str()) {
                    log::warn!(
                        "Blocked an unauthenticated browser action from {}",
                        navigation_label
                    );
                    return false;
                }

                match action {
                    "fullscreen-enter" => {
                        let _ = set_tab_fullscreen(&navigation_label, true);
                        let _ = resize_tab(&navigation_app, &navigation_label, true);
                    }
                    "fullscreen-exit" => {
                        let _ = set_tab_fullscreen(&navigation_label, false);
                        let _ = resize_tab(&navigation_app, &navigation_label, false);
                    }
                    _ => {
                        let _ = navigation_app.emit(
                            "tab-shortcut",
                            serde_json::json!({
                                "label": navigation_label,
                                "action": action
                            }),
                        );
                    }
                }
                return false;
            }

            let allowed = matches!(
                next_url.scheme(),
                "about" | "blob" | "data" | "file" | "http" | "https" | "tauri"
            );
            if allowed {
                let _ = navigation_app.emit(
                    "tab-url-changed",
                    serde_json::json!({
                        "label": navigation_label,
                        "url": next_url.to_string()
                    }),
                );
            } else {
                let _ = navigation_app.emit(
                    "tab-navigation-blocked",
                    serde_json::json!({
                        "label": navigation_label,
                        "scheme": next_url.scheme()
                    }),
                );
            }
            allowed
        })
        .on_document_title_changed(move |_webview, title| {
            let _ = title_app.emit(
                "tab-title-changed",
                serde_json::json!({
                    "label": title_label,
                    "title": title
                }),
            );
        })
        .on_page_load(move |_webview, payload| {
            let state = match payload.event() {
                PageLoadEvent::Started => "started",
                PageLoadEvent::Finished => "finished",
            };
            let _ = load_app.emit(
                "tab-load-state",
                serde_json::json!({
                    "label": load_label,
                    "state": state,
                    "url": payload.url().to_string()
                }),
            );
        })
        .on_new_window(move |popup_url, _features| {
            let _ = popup_app.emit(
                "tab-new-window",
                serde_json::json!({
                    "label": popup_label,
                    "url": popup_url.to_string()
                }),
            );
            NewWindowResponse::Deny
        })
        .on_download(move |_webview, event| {
            match event {
                DownloadEvent::Requested { url, destination } => {
                    if let Err(error) = record_download_requested(&download_app, &url, destination)
                    {
                        log::error!("Failed to record download: {error}");
                    }
                    let _ = download_app.emit(
                        "download-event",
                        serde_json::json!({
                            "label": download_label,
                            "status": "started",
                            "url": url.to_string()
                        }),
                    );
                    let _ = download_app.emit("downloads-changed", ());
                }
                DownloadEvent::Finished { url, path, success } => {
                    if let Err(error) =
                        record_download_finished(&download_app, &url, path.as_deref(), success)
                    {
                        log::error!("Failed to update download: {error}");
                    }
                    let _ = download_app.emit(
                        "download-event",
                        serde_json::json!({
                            "label": download_label,
                            "status": "finished",
                            "url": url.to_string(),
                            "success": success
                        }),
                    );
                    let _ = download_app.emit("downloads-changed", ());
                }
                _ => {}
            }
            true
        });

    let webview = window
        .add_child(
            builder,
            LogicalPosition::new(-10_000.0, -10_000.0),
            LogicalSize::new(logical_width, content_height),
        )
        .map_err(|error| format!("Failed to create webview: {error}"))?;
    webview.hide().map_err(|error| error.to_string())?;

    WEBVIEWS
        .lock()
        .map_err(|_| "Webview state is unavailable".to_string())?
        .push(label.clone());

    Ok(label)
}

#[tauri::command]
async fn close_tab(app: tauri::AppHandle, label: String) -> Result<(), String> {
    ensure_tracked_webview(&label)?;
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|error| error.to_string())?;
    }
    WEBVIEWS
        .lock()
        .map_err(|_| "Webview state is unavailable".to_string())?
        .retain(|existing| existing != &label);
    set_tab_fullscreen(&label, false)?;
    Ok(())
}

#[tauri::command]
async fn show_tab(app: tauri::AppHandle, label: String) -> Result<(), String> {
    ensure_tracked_webview(&label)?;
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Tab {label} not found"))?;

    for existing_label in tracked_webviews()? {
        if existing_label == label {
            continue;
        }
        if let Some(webview) = app.get_webview(&existing_label) {
            if let Err(error) = webview.hide() {
                log::warn!("Failed to hide {existing_label}: {error}");
            }
        }
    }

    resize_tab(&app, &label, is_tab_fullscreen(&label))?;
    webview.show().map_err(|error| error.to_string())?;
    webview.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn navigate_tab(app: tauri::AppHandle, label: String, url: String) -> Result<(), String> {
    ensure_tracked_webview(&label)?;
    let parsed_url = parse_browser_url(&url)?;
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Tab {label} not found"))?;
    webview
        .navigate(parsed_url)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_tab_url(app: tauri::AppHandle, label: String) -> Result<String, String> {
    ensure_tracked_webview(&label)?;
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Tab {label} not found"))?;
    webview
        .url()
        .map(|url| url.to_string())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn go_back(app: tauri::AppHandle, label: String) -> Result<(), String> {
    ensure_tracked_webview(&label)?;
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Tab {label} not found"))?;
    webview
        .eval("history.back()")
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn go_forward(app: tauri::AppHandle, label: String) -> Result<(), String> {
    ensure_tracked_webview(&label)?;
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Tab {label} not found"))?;
    webview
        .eval("history.forward()")
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn reload_tab(app: tauri::AppHandle, label: String) -> Result<(), String> {
    ensure_tracked_webview(&label)?;
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Tab {label} not found"))?;
    webview
        .eval("location.reload()")
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn minimize_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    window.minimize().map_err(|error| error.to_string())
}

#[tauri::command]
async fn maximize_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|error| error.to_string())
    } else {
        window.maximize().map_err(|error| error.to_string())
    }
}

#[tauri::command]
async fn close_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    window.close().map_err(|error| error.to_string())
}

fn data_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(file_name))
        .map_err(|error| format!("Failed to locate application data: {error}"))
}

fn load_json<T>(path: &Path) -> Result<T, String>
where
    T: Default + DeserializeOwned,
{
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content)
            .map_err(|error| format!("Invalid data in {}: {error}", path.display())),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(T::default()),
        Err(error) => Err(format!("Failed to read {}: {error}", path.display())),
    }
}

fn save_json<T>(path: &Path, value: &T) -> Result<(), String>
where
    T: Serialize,
{
    if let Some(directory) = path.parent() {
        fs::create_dir_all(directory)
            .map_err(|error| format!("Failed to create {}: {error}", directory.display()))?;
    }
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Failed to serialize data: {error}"))?;
    fs::write(path, content).map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

#[derive(Serialize, Deserialize, Clone)]
struct Bookmark {
    id: String,
    url: String,
    title: String,
    timestamp: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct BookmarksData {
    bookmarks: Vec<Bookmark>,
}

#[derive(Serialize)]
struct BookmarkState {
    bookmarked: bool,
}

#[tauri::command]
fn toggle_bookmark(
    app: tauri::AppHandle,
    url: String,
    title: String,
) -> Result<BookmarkState, String> {
    parse_bookmark_url(&url)?;
    let _guard = DATA_LOCK
        .lock()
        .map_err(|_| "Bookmark storage is unavailable".to_string())?;
    let path = data_path(&app, "bookmarks.json")?;
    let mut data: BookmarksData = load_json(&path)?;

    if let Some(index) = data
        .bookmarks
        .iter()
        .position(|bookmark| bookmark.url == url)
    {
        data.bookmarks.remove(index);
        save_json(&path, &data)?;
        return Ok(BookmarkState { bookmarked: false });
    }

    data.bookmarks.push(Bookmark {
        id: unique_id("bm"),
        url,
        title: bounded_text(&title, MAX_TITLE_LENGTH),
        timestamp: now_duration().as_secs(),
    });
    save_json(&path, &data)?;
    Ok(BookmarkState { bookmarked: true })
}

#[tauri::command]
fn get_bookmarks(app: tauri::AppHandle) -> Result<Vec<Bookmark>, String> {
    let _guard = DATA_LOCK
        .lock()
        .map_err(|_| "Bookmark storage is unavailable".to_string())?;
    let mut data: BookmarksData = load_json(&data_path(&app, "bookmarks.json")?)?;
    data.bookmarks
        .sort_by_key(|bookmark| std::cmp::Reverse(bookmark.timestamp));
    Ok(data.bookmarks)
}

#[tauri::command]
fn delete_bookmark(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let _guard = DATA_LOCK
        .lock()
        .map_err(|_| "Bookmark storage is unavailable".to_string())?;
    let path = data_path(&app, "bookmarks.json")?;
    let mut data: BookmarksData = load_json(&path)?;
    data.bookmarks.retain(|bookmark| bookmark.id != id);
    save_json(&path, &data)
}

#[tauri::command]
fn is_bookmarked(app: tauri::AppHandle, url: String) -> Result<bool, String> {
    let _guard = DATA_LOCK
        .lock()
        .map_err(|_| "Bookmark storage is unavailable".to_string())?;
    let data: BookmarksData = load_json(&data_path(&app, "bookmarks.json")?)?;
    Ok(data.bookmarks.iter().any(|bookmark| bookmark.url == url))
}

#[derive(Serialize, Deserialize, Clone)]
struct HistoryEntry {
    id: String,
    url: String,
    title: String,
    timestamp: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct HistoryData {
    entries: Vec<HistoryEntry>,
}

#[tauri::command]
fn add_to_history(app: tauri::AppHandle, url: String, title: String) -> Result<(), String> {
    parse_history_url(&url)?;
    let _guard = DATA_LOCK
        .lock()
        .map_err(|_| "History storage is unavailable".to_string())?;
    let path = data_path(&app, "history.json")?;
    let mut data: HistoryData = load_json(&path)?;
    let timestamp = now_duration().as_secs();

    if let Some(latest) = data.entries.first_mut() {
        if latest.url == url && timestamp.saturating_sub(latest.timestamp) <= 5 {
            latest.title = bounded_text(&title, MAX_TITLE_LENGTH);
            latest.timestamp = timestamp;
            return save_json(&path, &data);
        }
    }

    data.entries.insert(
        0,
        HistoryEntry {
            id: unique_id("history"),
            url,
            title: bounded_text(&title, MAX_TITLE_LENGTH),
            timestamp,
        },
    );
    data.entries.truncate(MAX_HISTORY_ENTRIES);
    save_json(&path, &data)
}

#[tauri::command]
fn get_history(app: tauri::AppHandle, limit: Option<usize>) -> Result<Vec<HistoryEntry>, String> {
    let _guard = DATA_LOCK
        .lock()
        .map_err(|_| "History storage is unavailable".to_string())?;
    let data: HistoryData = load_json(&data_path(&app, "history.json")?)?;
    let requested = limit.unwrap_or(100).min(MAX_HISTORY_ENTRIES);
    Ok(data.entries.into_iter().take(requested).collect())
}

#[tauri::command]
fn clear_history(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = DATA_LOCK
        .lock()
        .map_err(|_| "History storage is unavailable".to_string())?;
    save_json(&data_path(&app, "history.json")?, &HistoryData::default())
}

#[derive(Serialize, Deserialize, Clone)]
struct DownloadEntry {
    id: String,
    url: String,
    file_name: String,
    path: String,
    status: String,
    timestamp: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct DownloadsData {
    entries: Vec<DownloadEntry>,
}

fn download_file_name(url: &Url, path: Option<&Path>) -> String {
    path.and_then(Path::file_name)
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| {
            url.path_segments()
                .and_then(|mut segments| segments.rfind(|segment| !segment.is_empty()))
                .map(ToOwned::to_owned)
        })
        .unwrap_or_else(|| "Download".to_string())
}

fn record_download_requested(
    app: &tauri::AppHandle,
    url: &Url,
    destination: &Path,
) -> Result<(), String> {
    let _guard = DATA_LOCK
        .lock()
        .map_err(|_| "Download storage is unavailable".to_string())?;
    let path = data_path(app, "downloads.json")?;
    let mut data: DownloadsData = load_json(&path)?;
    data.entries.insert(
        0,
        DownloadEntry {
            id: unique_id("download"),
            url: bounded_text(url.as_str(), MAX_URL_LENGTH),
            file_name: bounded_text(
                &download_file_name(url, Some(destination)),
                MAX_TITLE_LENGTH,
            ),
            path: destination.to_string_lossy().into_owned(),
            status: "in_progress".to_string(),
            timestamp: now_duration().as_secs(),
        },
    );
    data.entries.truncate(MAX_DOWNLOAD_ENTRIES);
    save_json(&path, &data)
}

fn record_download_finished(
    app: &tauri::AppHandle,
    url: &Url,
    completed_path: Option<&Path>,
    success: bool,
) -> Result<(), String> {
    let _guard = DATA_LOCK
        .lock()
        .map_err(|_| "Download storage is unavailable".to_string())?;
    let path = data_path(app, "downloads.json")?;
    let mut data: DownloadsData = load_json(&path)?;
    let url_string = bounded_text(url.as_str(), MAX_URL_LENGTH);
    let status = if success { "completed" } else { "failed" };

    if let Some(index) = pending_download_index(&data.entries, &url_string, completed_path) {
        let entry = &mut data.entries[index];
        entry.status = status.to_string();
        if let Some(completed_path) = completed_path {
            entry.path = completed_path.to_string_lossy().into_owned();
            entry.file_name = bounded_text(
                &download_file_name(url, Some(completed_path)),
                MAX_TITLE_LENGTH,
            );
        }
    } else {
        data.entries.insert(
            0,
            DownloadEntry {
                id: unique_id("download"),
                url: url_string,
                file_name: bounded_text(&download_file_name(url, completed_path), MAX_TITLE_LENGTH),
                path: completed_path
                    .map(|value| value.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                status: status.to_string(),
                timestamp: now_duration().as_secs(),
            },
        );
    }

    data.entries.truncate(MAX_DOWNLOAD_ENTRIES);
    save_json(&path, &data)
}

fn pending_download_index(
    entries: &[DownloadEntry],
    url: &str,
    completed_path: Option<&Path>,
) -> Option<usize> {
    completed_path
        .and_then(|path| {
            entries.iter().position(|entry| {
                entry.url == url && entry.status == "in_progress" && Path::new(&entry.path) == path
            })
        })
        .or_else(|| {
            entries
                .iter()
                .position(|entry| entry.url == url && entry.status == "in_progress")
        })
}

#[tauri::command]
fn get_downloads(
    app: tauri::AppHandle,
    limit: Option<usize>,
) -> Result<Vec<DownloadEntry>, String> {
    let _guard = DATA_LOCK
        .lock()
        .map_err(|_| "Download storage is unavailable".to_string())?;
    let data: DownloadsData = load_json(&data_path(&app, "downloads.json")?)?;
    let requested = limit.unwrap_or(100).min(MAX_DOWNLOAD_ENTRIES);
    Ok(data.entries.into_iter().take(requested).collect())
}

#[tauri::command]
fn clear_downloads(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = DATA_LOCK
        .lock()
        .map_err(|_| "Download storage is unavailable".to_string())?;
    save_json(
        &data_path(&app, "downloads.json")?,
        &DownloadsData::default(),
    )
}

#[tauri::command]
fn clear_browsing_data(app: tauri::AppHandle) -> Result<(), String> {
    {
        let _guard = DATA_LOCK
            .lock()
            .map_err(|_| "Browser storage is unavailable".to_string())?;
        save_json(&data_path(&app, "history.json")?, &HistoryData::default())?;
        save_json(
            &data_path(&app, "downloads.json")?,
            &DownloadsData::default(),
        )?;
    }

    let mut errors = Vec::new();
    for label in tracked_webviews()? {
        if let Some(webview) = app.get_webview(&label) {
            if let Err(error) = webview.clear_all_browsing_data() {
                errors.push(format!("{label}: {error}"));
            }
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Some browsing data could not be cleared: {}",
            errors.join(", ")
        ))
    }
}

#[tauri::command]
async fn show_app_menu(app: tauri::AppHandle) -> Result<(), String> {
    let new_tab = MenuItem::with_id(&app, "new-tab", "New Tab", true, Some("CmdOrCtrl+T"))
        .map_err(|error| error.to_string())?;
    let history = MenuItem::with_id(&app, "history", "History", true, Some("CmdOrCtrl+H"))
        .map_err(|error| error.to_string())?;
    let bookmarks = MenuItem::with_id(&app, "bookmarks", "Bookmarks", true, Some("CmdOrCtrl+B"))
        .map_err(|error| error.to_string())?;
    let downloads = MenuItem::with_id(&app, "downloads", "Downloads", true, Some("CmdOrCtrl+J"))
        .map_err(|error| error.to_string())?;
    let open_downloads = MenuItem::with_id(
        &app,
        "open-downloads-folder",
        "Open Downloads Folder",
        true,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    let settings = MenuItem::with_id(&app, "settings", "Settings", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let menu = Menu::with_items(
        &app,
        &[
            &new_tab,
            &history,
            &bookmarks,
            &downloads,
            &open_downloads,
            &settings,
        ],
    )
    .map_err(|error| error.to_string())?;
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    menu.popup(window).map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_downloads_folder(app: tauri::AppHandle) -> Result<(), String> {
    let download_dir = app
        .path()
        .download_dir()
        .map_err(|error| format!("Failed to locate downloads folder: {error}"))?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&download_dir)
        .spawn()
        .map_err(|error| format!("Failed to open downloads folder: {error}"))?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&download_dir)
        .spawn()
        .map_err(|error| format!("Failed to open downloads folder: {error}"))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&download_dir)
        .spawn()
        .map_err(|error| format!("Failed to open downloads folder: {error}"))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .on_menu_event(|app, event| {
            let _ = app.emit("menu-event", event.id().as_ref());
        })
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Resized(_)) {
                if let Err(error) = resize_tracked_tabs(window.app_handle()) {
                    log::warn!("Failed to resize browser tabs: {error}");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            create_tab,
            close_tab,
            show_tab,
            navigate_tab,
            get_tab_url,
            go_back,
            go_forward,
            reload_tab,
            minimize_window,
            maximize_window,
            close_window,
            toggle_bookmark,
            get_bookmarks,
            delete_bookmark,
            is_bookmarked,
            add_to_history,
            get_history,
            clear_history,
            get_downloads,
            clear_downloads,
            clear_browsing_data,
            show_app_menu,
            open_downloads_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Casablanca Browser");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pending_download(path: &str) -> DownloadEntry {
        DownloadEntry {
            id: path.to_string(),
            url: "https://example.com/file.zip".to_string(),
            file_name: "file.zip".to_string(),
            path: path.to_string(),
            status: "in_progress".to_string(),
            timestamp: 0,
        }
    }

    #[test]
    fn persisted_urls_reject_executable_and_inline_schemes() {
        assert!(parse_bookmark_url("https://example.com").is_ok());
        assert!(parse_bookmark_url("file:///tmp/example.html").is_ok());
        assert!(parse_bookmark_url("data:text/html,hello").is_err());
        assert!(parse_history_url("https://example.com").is_ok());
        assert!(parse_history_url("file:///tmp/example.html").is_err());
        assert!(parse_history_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn concurrent_downloads_are_matched_by_destination() {
        let entries = vec![
            pending_download("/downloads/second.zip"),
            pending_download("/downloads/first.zip"),
        ];

        assert_eq!(
            pending_download_index(
                &entries,
                "https://example.com/file.zip",
                Some(Path::new("/downloads/first.zip")),
            ),
            Some(1),
        );
    }

    #[test]
    fn bounded_text_counts_characters_instead_of_bytes() {
        assert_eq!(bounded_text("éclair", 2), "éc");
    }
}
