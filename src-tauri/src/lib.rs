use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, Url, WebviewUrl};

static WEBVIEW_COUNTER: AtomicU32 = AtomicU32::new(1);
static WEBVIEWS: Mutex<Option<HashMap<String, ()>>> = Mutex::new(None);

fn init_webviews() {
    let mut lock = WEBVIEWS.lock().unwrap();
    if lock.is_none() {
        *lock = Some(HashMap::new());
    }
}

#[tauri::command]
async fn create_tab(app: tauri::AppHandle, url: String) -> Result<String, String> {
    init_webviews();

    let id = WEBVIEW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let label = format!("tab-{}", id);

    let parsed_url: Url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;

    let window = app.get_window("main").ok_or("Main window not found")?;

    let physical_size = window.inner_size().map_err(|e| format!("{}", e))?;
    let scale_factor = window.scale_factor().unwrap_or(1.0);

    let logical_width = physical_size.width as f64 / scale_factor;
    let logical_height = physical_size.height as f64 / scale_factor;
    let toolbar_height = 76.0;

    let label_clone = label.clone();
    let app_clone = app.clone();

    let builder = tauri::webview::WebviewBuilder::new(&label, WebviewUrl::External(parsed_url))
        .auto_resize()
        .on_navigation(move |url| {
            let _ = app_clone.emit(
                "tab-url-changed",
                serde_json::json!({
                    "label": label_clone,
                    "url": url.to_string()
                }),
            );
            true
        });

    window
        .add_child(
            builder,
            LogicalPosition::new(0.0, toolbar_height),
            LogicalSize::new(logical_width, logical_height - toolbar_height),
        )
        .map_err(|e| format!("Failed to create webview: {}", e))?;

    if let Ok(mut lock) = WEBVIEWS.lock() {
        if let Some(ref mut map) = *lock {
            map.insert(label.clone(), ());
        }
    }

    Ok(label)
}

#[tauri::command]
async fn close_tab(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| format!("{}", e))?;
    }

    if let Ok(mut lock) = WEBVIEWS.lock() {
        if let Some(ref mut map) = *lock {
            map.remove(&label);
        }
    }

    Ok(())
}

#[tauri::command]
async fn show_tab(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Ok(lock) = WEBVIEWS.lock() {
        if let Some(ref map) = *lock {
            for (existing_label, _) in map.iter() {
                if let Some(wv) = app.get_webview(existing_label) {
                    let _ = wv.set_position(LogicalPosition::new(-10000.0, -10000.0));
                }
            }
        }
    }

    if let Some(webview) = app.get_webview(&label) {
        let window = app.get_window("main").ok_or("Main window not found")?;

        let physical_size = window.inner_size().map_err(|e| format!("{}", e))?;
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let logical_width = physical_size.width as f64 / scale_factor;
        let logical_height = physical_size.height as f64 / scale_factor;
        let toolbar_height = 76.0;

        webview
            .set_position(LogicalPosition::new(0.0, toolbar_height))
            .map_err(|e| format!("{}", e))?;
        webview
            .set_size(LogicalSize::new(
                logical_width,
                logical_height - toolbar_height,
            ))
            .map_err(|e| format!("{}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn navigate_tab(app: tauri::AppHandle, label: String, url: String) -> Result<(), String> {
    let parsed_url: Url = url.parse().map_err(|e| format!("{}", e))?;

    if let Some(webview) = app.get_webview(&label) {
        webview.navigate(parsed_url).map_err(|e| format!("{}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn get_tab_url(app: tauri::AppHandle, label: String) -> Result<String, String> {
    if let Some(webview) = app.get_webview(&label) {
        return Ok(webview.url().map(|u| u.to_string()).unwrap_or_default());
    }
    Ok(String::new())
}

#[tauri::command]
async fn get_tab_title(app: tauri::AppHandle, label: String) -> Result<String, String> {
    if let Some(webview) = app.get_webview(&label) {
        // Execute JS to get document.title
        let result = webview.eval("document.title");
        if result.is_ok() {
            // Note: eval doesn't return value directly, we need to use evaluate_script
            // For now, return empty - will be handled by frontend
        }
    }
    Ok(String::new())
}

#[tauri::command]
async fn go_back(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        webview
            .eval("history.back()")
            .map_err(|e| format!("{}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn go_forward(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        webview
            .eval("history.forward()")
            .map_err(|e| format!("{}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn reload_tab(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        webview
            .eval("location.reload()")
            .map_err(|e| format!("{}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn minimize_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Main window not found")?;
    window.minimize().map_err(|e| format!("{}", e))?;
    Ok(())
}

#[tauri::command]
async fn maximize_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Main window not found")?;
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| format!("{}", e))?;
    } else {
        window.maximize().map_err(|e| format!("{}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn close_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Main window not found")?;
    window.close().map_err(|e| format!("{}", e))?;
    Ok(())
}

// ============= BOOKMARKS =============

use std::fs;
use std::path::PathBuf;

fn get_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct Bookmark {
    id: String,
    url: String,
    title: String,
    timestamp: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct BookmarksData {
    bookmarks: Vec<Bookmark>,
}

fn load_bookmarks(app: &tauri::AppHandle) -> BookmarksData {
    let data_dir = match get_data_dir(app) {
        Ok(d) => d,
        Err(_) => return BookmarksData::default(),
    };
    let path = data_dir.join("bookmarks.json");
    if let Ok(content) = fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        BookmarksData::default()
    }
}

fn save_bookmarks(app: &tauri::AppHandle, data: &BookmarksData) -> Result<(), String> {
    let data_dir = get_data_dir(app)?;
    fs::create_dir_all(&data_dir).map_err(|e| format!("{}", e))?;
    let path = data_dir.join("bookmarks.json");
    let content = serde_json::to_string_pretty(data).map_err(|e| format!("{}", e))?;
    fs::write(path, content).map_err(|e| format!("{}", e))?;
    Ok(())
}

#[tauri::command]
async fn add_bookmark(
    app: tauri::AppHandle,
    url: String,
    title: String,
) -> Result<Bookmark, String> {
    let mut data = load_bookmarks(&app);
    let bookmark = Bookmark {
        id: format!(
            "bm-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ),
        url,
        title,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    };
    data.bookmarks.push(bookmark.clone());
    save_bookmarks(&app, &data)?;
    Ok(bookmark)
}

#[tauri::command]
async fn get_bookmarks(app: tauri::AppHandle) -> Result<Vec<Bookmark>, String> {
    Ok(load_bookmarks(&app).bookmarks)
}

#[tauri::command]
async fn delete_bookmark(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut data = load_bookmarks(&app);
    data.bookmarks.retain(|b| b.id != id);
    save_bookmarks(&app, &data)?;
    Ok(())
}

#[tauri::command]
async fn is_bookmarked(app: tauri::AppHandle, url: String) -> Result<bool, String> {
    let data = load_bookmarks(&app);
    Ok(data.bookmarks.iter().any(|b| b.url == url))
}

// ============= HISTORY =============

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct HistoryEntry {
    id: String,
    url: String,
    title: String,
    timestamp: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct HistoryData {
    entries: Vec<HistoryEntry>,
}

fn load_history(app: &tauri::AppHandle) -> HistoryData {
    let data_dir = match get_data_dir(app) {
        Ok(d) => d,
        Err(_) => return HistoryData::default(),
    };
    let path = data_dir.join("history.json");
    if let Ok(content) = fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        HistoryData::default()
    }
}

fn save_history(app: &tauri::AppHandle, data: &HistoryData) -> Result<(), String> {
    let data_dir = get_data_dir(app)?;
    fs::create_dir_all(&data_dir).map_err(|e| format!("{}", e))?;
    let path = data_dir.join("history.json");
    let content = serde_json::to_string_pretty(data).map_err(|e| format!("{}", e))?;
    fs::write(path, content).map_err(|e| format!("{}", e))?;
    Ok(())
}

#[tauri::command]
async fn add_to_history(app: tauri::AppHandle, url: String, title: String) -> Result<(), String> {
    let mut data = load_history(&app);
    let entry = HistoryEntry {
        id: format!(
            "h-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ),
        url,
        title,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    };
    data.entries.insert(0, entry);
    // Keep only last 1000 entries
    data.entries.truncate(1000);
    save_history(&app, &data)?;
    Ok(())
}

#[tauri::command]
async fn get_history(
    app: tauri::AppHandle,
    limit: Option<usize>,
) -> Result<Vec<HistoryEntry>, String> {
    let data = load_history(&app);
    let limit = limit.unwrap_or(100);
    Ok(data.entries.into_iter().take(limit).collect())
}

#[tauri::command]
async fn clear_history(app: tauri::AppHandle) -> Result<(), String> {
    let data = HistoryData::default();
    save_history(&app, &data)?;
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
        .invoke_handler(tauri::generate_handler![
            create_tab,
            close_tab,
            show_tab,
            navigate_tab,
            get_tab_url,
            get_tab_title,
            go_back,
            go_forward,
            reload_tab,
            minimize_window,
            maximize_window,
            close_window,
            // Bookmarks
            add_bookmark,
            get_bookmarks,
            delete_bookmark,
            is_bookmarked,
            // History
            add_to_history,
            get_history,
            clear_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
