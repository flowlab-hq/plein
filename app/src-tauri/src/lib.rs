use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[derive(serde::Serialize)]
struct OpenedFile {
    path: String,
    contents: String,
}

struct PendingPath(Mutex<Option<String>>);

#[tauri::command]
fn take_startup_path(state: State<PendingPath>) -> Option<String> {
    state.0.lock().expect("pending path lock").take()
}

#[tauri::command]
fn read_plein_file(path: String) -> Result<OpenedFile, String> {
    read_opened(PathBuf::from(path))
}

#[tauri::command]
fn open_plein_dialog(app: AppHandle) -> Result<Option<OpenedFile>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Plein model", &["plein"])
        .blocking_pick_file();
    let Some(file) = picked else {
        return Ok(None);
    };
    let path = match file {
        tauri_plugin_dialog::FilePath::Path(path) => path,
        tauri_plugin_dialog::FilePath::Url(url) => url
            .to_file_path()
            .map_err(|()| "could not convert the picked file to a path".to_string())?,
    };
    Ok(Some(read_opened(path)?))
}

fn read_opened(path: PathBuf) -> Result<OpenedFile, String> {
    let contents = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    Ok(OpenedFile {
        path: path.to_string_lossy().into_owned(),
        contents,
    })
}

fn remember_paths(app: &AppHandle, paths: Vec<PathBuf>) {
    let Some(path) = paths.into_iter().find(|path| is_plein_path(path)) else {
        return;
    };
    let value = path.to_string_lossy().into_owned();
    *app.state::<PendingPath>().0.lock().expect("pending path lock") = Some(value.clone());
    let _ = app.emit("open-file", value);
}

fn is_plein_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("plein"))
}

fn files_from_cli_args() -> Vec<PathBuf> {
    std::env::args()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .filter_map(|arg| {
            if let Ok(url) = url::Url::parse(&arg) {
                url.to_file_path().ok()
            } else {
                Some(PathBuf::from(arg))
            }
        })
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingPath(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            take_startup_path,
            read_plein_file,
            open_plein_dialog
        ])
        .setup(|app| {
            let files = files_from_cli_args();
            if !files.is_empty() {
                remember_paths(app.handle(), files);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Plein")
        .run(|#[allow(unused_variables)] app, #[allow(unused_variables)] event| {
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = event {
                let files = urls
                    .into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .collect();
                remember_paths(app, files);
            }
        });
}
