use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Serialize)]
struct ReadFileResponse {
    path: String,
    contents: String,
    lossy: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct AppSettings {
    theme: String,
    view_mode: String,
    recent_files: Vec<String>,
    sync_scroll: bool,
    trusted_html: bool,
    allow_remote_images: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            view_mode: "reader".to_string(),
            recent_files: Vec::new(),
            sync_scroll: true,
            trusted_html: false,
            allow_remote_images: false,
        }
    }
}

#[tauri::command]
fn read_markdown_file(path: String) -> Result<ReadFileResponse, String> {
    let path_buf = normalize_user_file_path(&path)?;
    ensure_markdown_like(&path_buf)?;
    let bytes = fs::read(&path_buf).map_err(|error| format!("Could not read file: {error}"))?;
    let lossy = std::str::from_utf8(&bytes).is_err();
    let contents = String::from_utf8_lossy(&bytes).to_string();

    Ok(ReadFileResponse {
        path: path_buf.to_string_lossy().to_string(),
        contents,
        lossy,
    })
}

#[tauri::command]
fn write_markdown_file(path: String, contents: String) -> Result<String, String> {
    let mut path_buf = normalize_user_file_path(&path)?;

    // Auto-append .md if no recognized extension
    let needs_extension = match path_buf
        .extension()
        .and_then(|v| v.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some(ext) => !["md", "markdown", "mdown", "mkd", "txt", "text"].contains(&ext),
        None => true,
    };

    if needs_extension {
        let mut name = path_buf.as_os_str().to_os_string();
        name.push(".md");
        path_buf = PathBuf::from(name);
    }

    ensure_markdown_like(&path_buf)?;

    if let Some(parent) = path_buf.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create directory: {error}"))?;
        }
    }

    fs::write(&path_buf, contents).map_err(|error| format!("Could not save file: {error}"))?;
    Ok(path_buf.to_string_lossy().to_string())
}

#[tauri::command]
fn load_settings(app: AppHandle) -> AppSettings {
    let path = settings_path(&app);
    match fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    }
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = settings_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create settings directory: {error}"))?;
    }
    let contents = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("Could not serialize settings: {error}"))?;
    fs::write(path, contents).map_err(|error| format!("Could not save settings: {error}"))
}

#[tauri::command]
fn startup_open_file() -> Option<String> {
    cli_file_argument(std::env::args_os().skip(1), None)
}

fn normalize_user_file_path(path: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path);
    if candidate.as_os_str().is_empty() {
        return Err("No file path was provided.".to_string());
    }
    Ok(candidate)
}

fn ensure_markdown_like(path: &Path) -> Result<(), String> {
    let allowed = ["md", "markdown", "mdown", "mkd", "txt", "text"];
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase);

    if extension
        .as_deref()
        .is_some_and(|value| allowed.contains(&value))
    {
        Ok(())
    } else {
        Err("Only Markdown or text-like files are supported.".to_string())
    }
}

fn settings_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("settings.json")
}

fn cli_file_argument<I, S>(args: I, cwd: Option<&Path>) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: Into<std::ffi::OsString>,
{
    args.into_iter().map(Into::into).find_map(|arg| {
        let arg = PathBuf::from(arg);
        let raw = arg.to_string_lossy();
        if raw.starts_with("--") {
            return None;
        }

        let candidate = if arg.is_absolute() {
            arg
        } else if let Some(cwd) = cwd {
            cwd.join(arg)
        } else {
            arg
        };

        ensure_markdown_like(&candidate)
            .ok()
            .map(|_| candidate.to_string_lossy().to_string())
    })
}

pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if let Some(file_path) = cli_file_argument(args, Some(Path::new(&cwd))) {
                let _ = app.emit("cli-open-file", file_path);
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            read_markdown_file,
            write_markdown_file,
            load_settings,
            save_settings,
            startup_open_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running mdview");
}
