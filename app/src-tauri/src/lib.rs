use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, State, WindowEvent};
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

/// Native Open dialog. Must not run on the macOS UI thread: a sync command
/// plus `blocking_pick_file` deadlocks NSOpenPanel (window spins until force
/// quit). Async + `spawn_blocking` keeps the event loop free for the panel.
#[tauri::command]
async fn open_plein_dialog(app: AppHandle) -> Result<Option<OpenedFile>, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("Plein model", &["plein"])
            .blocking_pick_file()
    })
    .await
    .map_err(|error| error.to_string())?;
    let Some(file) = picked else {
        return Ok(None);
    };
    Ok(Some(read_opened(path_from_dialog(file)?)?))
}

/// Native save panel for the current view. Async + `spawn_blocking`, same as
/// Open: a sync command plus `blocking_save_file` deadlocks NSSavePanel.
#[tauri::command]
async fn pick_export_path(
    app: AppHandle,
    suggested_name: String,
    format: String,
    directory: Option<String>,
) -> Result<Option<String>, String> {
    let stem = sanitize_export_name(&suggested_name);
    let (title, filter_name, extension) = match format.as_str() {
        "html" => ("Export HTML", "HTML", "html"),
        "svg" => ("Export SVG", "SVG", "svg"),
        "both" => ("Export HTML and SVG", "HTML", "html"),
        other => return Err(format!("unknown export format '{other}'")),
    };
    let file_name = format!("{stem}.{extension}");
    let title = title.to_string();
    let filter_name = filter_name.to_string();

    let picked = tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app
            .dialog()
            .file()
            .set_title(&title)
            .set_file_name(&file_name)
            .add_filter(&filter_name, &[extension]);
        if let Some(directory) = directory.filter(|dir| !dir.is_empty()) {
            dialog = dialog.set_directory(directory);
        }
        dialog.blocking_save_file()
    })
    .await
    .map_err(|error| error.to_string())?;

    let Some(file) = picked else {
        return Ok(None);
    };
    let path = path_from_dialog(file)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn write_export_file(path: String, contents: String) -> Result<(), String> {
    let path = PathBuf::from(path.trim());
    if path.as_os_str().is_empty() {
        return Err("export path is empty".to_string());
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|error| {
                format!("could not create {}: {error}", parent.display())
            })?;
        }
    }
    std::fs::write(&path, contents)
        .map_err(|error| format!("could not write {}: {error}", path.display()))
}

fn path_from_dialog(file: tauri_plugin_dialog::FilePath) -> Result<PathBuf, String> {
    match file {
        tauri_plugin_dialog::FilePath::Path(path) => Ok(path),
        tauri_plugin_dialog::FilePath::Url(url) => url
            .to_file_path()
            .map_err(|()| "could not convert the picked file to a path".to_string()),
    }
}

fn sanitize_export_name(name: &str) -> String {
    let stem = name
        .replace(['\\', '/'], "-")
        .trim()
        .trim_start_matches('.')
        .to_string();
    if stem.is_empty() {
        "view".to_string()
    } else {
        stem
    }
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

fn build_menu(app: &tauri::App) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", "Open…", true, Some("CmdOrCtrl+O"))?;
    let export = MenuItem::with_id(app, "export", "Export…", true, Some("CmdOrCtrl+Shift+E"))?;
    let reload = MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?;
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &open,
            &export,
            &reload,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = Submenu::with_items(
            app,
            "Plein",
            true,
            &[
                &PredefinedMenuItem::about(app, None, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::hide_others(app, None)?,
                &PredefinedMenuItem::show_all(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, None)?,
            ],
        )?;
        let edit_menu = Submenu::with_items(
            app,
            "Edit",
            true,
            &[
                &PredefinedMenuItem::undo(app, None)?,
                &PredefinedMenuItem::redo(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::cut(app, None)?,
                &PredefinedMenuItem::copy(app, None)?,
                &PredefinedMenuItem::paste(app, None)?,
                &PredefinedMenuItem::select_all(app, None)?,
            ],
        )?;
        let window_menu = Submenu::with_items(
            app,
            "Window",
            true,
            &[
                &PredefinedMenuItem::minimize(app, None)?,
                &PredefinedMenuItem::maximize(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::close_window(app, None)?,
            ],
        )?;
        return Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &window_menu]);
    }

    #[cfg(not(target_os = "macos"))]
    Menu::with_items(app, &[&file_menu])
}

fn emit_menu_action(app: &AppHandle, id: &str) {
    match id {
        "open" => {
            let _ = app.emit("open-dialog", ());
        }
        "export" => {
            let _ = app.emit("export-view", ());
        }
        "reload" => {
            let _ = app.emit("reload-file", ());
        }
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingPath(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            take_startup_path,
            read_plein_file,
            open_plein_dialog,
            pick_export_path,
            write_export_file
        ])
        .setup(|app| {
            let files = files_from_cli_args();
            if !files.is_empty() {
                remember_paths(app.handle(), files);
            }
            app.set_menu(build_menu(app)?)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            emit_menu_action(app, event.id().0.as_str());
        })
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                remember_paths(window.app_handle(), paths.clone());
            }
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
