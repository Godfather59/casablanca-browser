# Casablanca Browser

Casablanca is a compact desktop browser built with [Tauri 2](https://tauri.app/) and the operating system webview. It keeps navigation, tabs, actions, and window controls in one toolbar without bundling a separate Chromium runtime.

> **Project status:** early beta. Casablanca is suitable for development and personal testing, but it has not yet received the security review expected for sensitive daily browsing.

## Current features

- Multiple native child-webview tabs with drag reordering
- Session restoration and recently closed tabs
- Address-and-search input with a configurable search engine
- Back, forward, reload, Home, and cross-webview keyboard shortcuts
- Real document titles and loading indicators
- Popup links opened as Casablanca tabs
- Persistent bookmarks, history, and download records
- Functional light, dark, and system themes
- Configurable home page
- Browsing-data clearing for history, downloads, cookies, cache, and site storage
- Native downloads-folder access

## Architecture

- `src/` — Vite frontend and bundled internal pages
- `src/js/browser.js` — tab state and browser UI orchestration
- `src/js/url.js` — URL/search normalization
- `src/js/preferences.js` — validated preferences
- `src-tauri/src/lib.rs` — Tauri webviews, native events, persistence, downloads, and window commands
- `tests/` — dependency-free Node tests for URL and preference logic

Casablanca uses WebView2 on Windows, WKWebView on macOS, and WebKitGTK on Linux. Website compatibility can therefore differ by operating system.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- Rust 1.85+
- The [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system
- WebView2 Runtime on Windows

## Development

```bash
npm ci
npm run tauri dev
```

Run the frontend checks:

```bash
npm run check
```

Check the Rust backend:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Create a desktop bundle:

```bash
npm run tauri build
```

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + T` | New tab |
| `Ctrl/Cmd + W` | Close tab |
| `Ctrl/Cmd + Shift + T` | Restore closed tab |
| `Ctrl/Cmd + L` | Focus address input |
| `Ctrl/Cmd + Tab` | Next tab |
| `Ctrl/Cmd + Shift + Tab` | Previous tab |
| `Ctrl/Cmd + D` | Add or remove bookmark |
| `Ctrl/Cmd + H` | History |
| `Ctrl/Cmd + J` | Downloads |
| `Alt + Left/Right` | Back/forward |
| `F5` or `Ctrl/Cmd + R` | Reload |

## Local data

Bookmarks, history, and download records are stored as JSON in Tauri's application-data directory. Website cookies and cache are managed by the platform webview.

Bookmarks are deliberately preserved when clearing browsing data.

## Known limitations

- No browser extensions, account sync, password manager, profiles, or private mode
- Download records do not currently expose pause/resume controls
- Rendering and media behavior depend on the platform webview
- Automated UI integration coverage is still limited

## Security

Unsupported URL schemes are blocked, bundled pages use a content security policy, and remote pages do not receive Casablanca's native command permissions. Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

No open-source license has been selected yet. Until one is added, normal copyright restrictions apply.
