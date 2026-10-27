// Drafter in Tauri: the built static site (apps/web/.output/public) embedded as frontendDist and
// served from tauri://localhost. Spike code: the FileAccess commands, plus two test hooks.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

static STARTED: OnceLock<f64> = OnceLock::new();

/// Paths the writer picked this session. The page may only read or write these.
#[derive(Default)]
struct Granted(Mutex<HashSet<PathBuf>>);

#[derive(Serialize, Deserialize, Clone)]
struct FileRef {
    name: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Picked {
    #[serde(rename = "ref")]
    file_ref: FileRef,
    name: String,
    /// Plain text over JSON IPC for the spike; a real build would return raw bytes
    /// (tauri::ipc::Response) for PDFs.
    text: String,
    last_modified: f64,
}

fn stub() -> Option<PathBuf> {
    std::env::var_os("SPIKE_STUB_DIALOG").map(PathBuf::from)
}

fn ref_of(p: &PathBuf) -> FileRef {
    FileRef {
        name: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        path: p.to_string_lossy().into_owned(),
    }
}

fn mtime(p: &PathBuf) -> f64 {
    std::fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

#[tauri::command]
async fn pick_to_open(app: AppHandle, granted: State<'_, Granted>) -> Result<Option<Picked>, String> {
    let path = match stub() {
        Some(p) => Some(p),
        None => app
            .dialog()
            .file()
            .add_filter("Fountain script, Markdown document, or text", &["fountain", "txt", "md", "markdown"])
            .blocking_pick_file()
            .and_then(|f| f.into_path().ok()),
    };
    let Some(p) = path else { return Ok(None) };
    let text = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    granted.0.lock().unwrap().insert(p.clone());
    Ok(Some(Picked { file_ref: ref_of(&p), name: ref_of(&p).name, text, last_modified: mtime(&p) }))
}

#[tauri::command]
async fn pick_to_save(
    app: AppHandle,
    granted: State<'_, Granted>,
    suggested_name: String,
    kind: String,
) -> Result<Option<FileRef>, String> {
    let ext: &[&str] = match kind.as_str() {
        "markdown" => &["md", "markdown"],
        "pdf" => &["pdf"],
        "txt" => &["txt"],
        _ => &["fountain"],
    };
    let path = match stub() {
        Some(p) => Some(PathBuf::from(format!("{}.saved", p.display()))),
        None => app
            .dialog()
            .file()
            .set_file_name(&suggested_name)
            .add_filter(&kind, ext)
            .blocking_save_file()
            .and_then(|f| f.into_path().ok()),
    };
    let Some(p) = path else { return Ok(None) };
    granted.0.lock().unwrap().insert(p.clone());
    Ok(Some(ref_of(&p)))
}

#[tauri::command]
async fn read_file(granted: State<'_, Granted>, file_ref: FileRef) -> Result<serde_json::Value, String> {
    let p = PathBuf::from(&file_ref.path);
    if !granted.0.lock().unwrap().contains(&p) {
        return Err("not granted".into());
    }
    let text = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "text": text, "lastModified": mtime(&p) }))
}

#[tauri::command]
async fn write_file(granted: State<'_, Granted>, file_ref: FileRef, text: String) -> Result<(), String> {
    let p = PathBuf::from(&file_ref.path);
    if !granted.0.lock().unwrap().contains(&p) {
        return Err("not granted".into());
    }
    std::fs::write(&p, text).map_err(|e| e.to_string())
}

#[tauri::command]
fn dialog_info() -> serde_json::Value {
    serde_json::json!({ "plugin": "tauri-plugin-dialog", "stubbed": stub().is_some() })
}

/// Test hook: shows a real open dialog without waiting for it (CI screenshots it, then presses Escape).
#[tauri::command]
fn spike_show_dialog(app: AppHandle) {
    app.dialog().file().pick_file(|_| {});
}

/// When the process started (ms since the epoch), for the startup measurement.
#[tauri::command]
fn spike_started_at() -> f64 {
    *STARTED.get().unwrap_or(&0.0)
}

/// Test hook: a clean quit, so WebKit's storage process can finish writing.
#[tauri::command]
fn spike_quit(app: AppHandle) {
    app.exit(0);
}

fn main() {
    let _ = STARTED.set(
        std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs_f64() * 1000.0)
            .unwrap_or(0.0),
    );
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Granted::default())
        .setup(|app| {
            // The window is made here rather than in tauri.conf.json, to add the spike's
            // document-start script (bench/startup.js).
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
                .title("Drafter")
                .inner_size(1440.0, 900.0)
                .initialization_script(include_str!("../../../bench/startup.js"))
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_to_open,
            pick_to_save,
            read_file,
            write_file,
            dialog_info,
            spike_show_dialog,
            spike_started_at,
            spike_quit
        ])
        .run(tauri::generate_context!())
        .expect("error while running Drafter");
}
