use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::Write,
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
    load_settings_from_path(&settings_path(&app))
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    save_settings_to_path(&settings_path(&app), &settings)
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

fn load_settings_from_path(path: &Path) -> AppSettings {
    match fs::read_to_string(path) {
        Ok(contents) => match serde_json::from_str(&contents) {
            Ok(settings) => settings,
            Err(error) => {
                eprintln!("Could not parse settings at {}: {error}", path.display());
                quarantine_corrupt_settings(path);
                load_settings_backup(path).unwrap_or_default()
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            load_settings_backup(path).unwrap_or_default()
        }
        Err(error) => {
            eprintln!("Could not read settings at {}: {error}", path.display());
            AppSettings::default()
        }
    }
}

fn load_settings_backup(path: &Path) -> Option<AppSettings> {
    let backup_path = settings_backup_path(path);
    match fs::read_to_string(&backup_path) {
        Ok(contents) => match serde_json::from_str(&contents) {
            Ok(settings) => Some(settings),
            Err(error) => {
                eprintln!(
                    "Could not parse settings backup at {}: {error}",
                    backup_path.display()
                );
                None
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => {
            eprintln!(
                "Could not read settings backup at {}: {error}",
                backup_path.display()
            );
            None
        }
    }
}

fn save_settings_to_path(path: &Path, settings: &AppSettings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create settings directory: {error}"))?;
    }
    let contents = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("Could not serialize settings: {error}"))?;

    write_settings_atomically(path, contents.as_bytes())
}

fn write_settings_atomically(path: &Path, contents: &[u8]) -> Result<(), String> {
    let temporary_path = settings_temporary_path(path);
    let backup_path = settings_backup_path(path);

    if temporary_path.exists() {
        fs::remove_file(&temporary_path)
            .map_err(|error| format!("Could not clear stale settings temporary file: {error}"))?;
    }

    let result = (|| -> Result<(), String> {
        let mut temporary = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary_path)
            .map_err(|error| format!("Could not create settings temporary file: {error}"))?;
        temporary
            .write_all(contents)
            .map_err(|error| format!("Could not write settings temporary file: {error}"))?;
        temporary
            .sync_all()
            .map_err(|error| format!("Could not flush settings temporary file: {error}"))?;
        drop(temporary);

        if path.exists() {
            fs::copy(path, &backup_path)
                .map_err(|error| format!("Could not create settings backup: {error}"))?;
            OpenOptions::new()
                .read(true)
                .open(&backup_path)
                .and_then(|file| file.sync_all())
                .map_err(|error| format!("Could not flush settings backup: {error}"))?;
        }

        fs::rename(&temporary_path, path)
            .map_err(|error| format!("Could not replace settings atomically: {error}"))?;
        sync_settings_directory(path);
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }

    result
}

fn settings_backup_path(path: &Path) -> PathBuf {
    append_file_name_suffix(path, ".bak")
}

fn settings_temporary_path(path: &Path) -> PathBuf {
    append_file_name_suffix(path, ".tmp")
}

fn append_file_name_suffix(path: &Path, suffix: &str) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("settings");
    path.with_file_name(format!("{file_name}{suffix}"))
}

fn quarantine_corrupt_settings(path: &Path) {
    let corrupt_path = unique_corrupt_settings_path(path);
    if let Err(error) = fs::rename(path, &corrupt_path) {
        eprintln!(
            "Could not preserve corrupt settings at {}: {error}",
            path.display()
        );
    } else {
        eprintln!("Preserved corrupt settings at {}", corrupt_path.display());
    }
}

fn unique_corrupt_settings_path(path: &Path) -> PathBuf {
    let base = append_file_name_suffix(path, ".corrupt");
    if !base.exists() {
        return base;
    }

    for index in 1.. {
        let candidate = append_file_name_suffix(path, &format!(".corrupt.{index}"));
        if !candidate.exists() {
            return candidate;
        }
    }

    unreachable!("unbounded corrupt settings suffix should always be available")
}

fn sync_settings_directory(path: &Path) {
    if let Some(parent) = path.parent() {
        if let Ok(directory) = OpenOptions::new().read(true).open(parent) {
            let _ = directory.sync_all();
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT_TEST_DIRECTORY: AtomicUsize = AtomicUsize::new(0);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let index = NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "mdview-settings-test-{}-{index}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create test directory");
            Self(path)
        }

        fn settings_path(&self) -> PathBuf {
            self.0.join("settings.json")
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn settings(theme: &str) -> AppSettings {
        AppSettings {
            theme: theme.to_string(),
            ..AppSettings::default()
        }
    }

    #[test]
    fn saves_settings_atomically_and_keeps_a_backup() {
        let directory = TestDirectory::new();
        let path = directory.settings_path();
        let first = settings("dark");
        let second = settings("light");

        save_settings_to_path(&path, &first).expect("save initial settings");
        save_settings_to_path(&path, &second).expect("replace settings");

        assert_eq!(load_settings_from_path(&path).theme, "light");
        let backup = fs::read_to_string(settings_backup_path(&path)).expect("read settings backup");
        let backup: AppSettings = serde_json::from_str(&backup).expect("parse settings backup");
        assert_eq!(backup.theme, "dark");
    }

    #[test]
    fn preserves_corrupt_settings_and_recovers_from_backup() {
        let directory = TestDirectory::new();
        let path = directory.settings_path();

        save_settings_to_path(&path, &settings("dark")).expect("save initial settings");
        save_settings_to_path(&path, &settings("light")).expect("replace settings");
        fs::write(&path, "{not valid json").expect("corrupt settings");

        let recovered = load_settings_from_path(&path);

        assert_eq!(recovered.theme, "dark");
        assert!(!path.exists());
        assert_eq!(
            fs::read_to_string(append_file_name_suffix(&path, ".corrupt"))
                .expect("read corrupt settings"),
            "{not valid json"
        );
    }

    #[test]
    fn stale_temporary_settings_do_not_replace_complete_settings() {
        let directory = TestDirectory::new();
        let path = directory.settings_path();
        save_settings_to_path(&path, &settings("dark")).expect("save initial settings");
        fs::write(settings_temporary_path(&path), "{partial settings")
            .expect("write temporary settings");

        assert_eq!(load_settings_from_path(&path).theme, "dark");

        save_settings_to_path(&path, &settings("light")).expect("replace settings");
        assert!(!settings_temporary_path(&path).exists());
        assert_eq!(load_settings_from_path(&path).theme, "light");
    }
}
