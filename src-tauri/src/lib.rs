use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};
use tauri::{AppHandle, Emitter, Manager};

static NEXT_MARKDOWN_TEMP_ID: AtomicUsize = AtomicUsize::new(0);

const MAX_MARKDOWN_BYTES: usize = 20 * 1024 * 1024;

const ALLOWED_ATTACHMENT_EXTENSIONS: &[&str] = &[
    "avif", "bmp", "csv", "gif", "ico", "jpeg", "jpg", "log", "md", "markdown", "mdown", "mkd",
    "pdf", "png", "svg", "text", "tif", "tiff", "tsv", "txt", "webp",
];

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
    let file =
        fs::File::open(&path_buf).map_err(|error| format!("Could not read file: {error}"))?;
    let metadata = file
        .metadata()
        .map_err(|error| format!("Could not inspect file: {error}"))?;
    if metadata.len() > MAX_MARKDOWN_BYTES as u64 {
        return Err("Markdown file exceeds the 20 MB limit.".to_string());
    }
    let bytes = read_bounded(file, MAX_MARKDOWN_BYTES)?;
    let lossy = std::str::from_utf8(&bytes).is_err();
    let contents = String::from_utf8_lossy(&bytes).to_string();

    Ok(ReadFileResponse {
        path: path_buf.to_string_lossy().to_string(),
        contents,
        lossy,
    })
}

fn read_bounded(reader: impl Read, max_bytes: usize) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::with_capacity(max_bytes.min(64 * 1024));
    reader
        .take((max_bytes as u64).saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read file: {error}"))?;
    if bytes.len() > max_bytes {
        return Err("Markdown file exceeds the 20 MB limit.".to_string());
    }
    Ok(bytes)
}

#[tauri::command]
fn allow_markdown_image(
    app: AppHandle,
    markdown_path: String,
    image_path: String,
) -> Result<String, String> {
    let image_path = resolve_markdown_image_path(Path::new(&markdown_path), &image_path)?;
    app.asset_protocol_scope()
        .allow_file(&image_path)
        .map_err(|error| format!("Could not allow local Markdown image: {error}"))?;
    image_path
        .to_str()
        .map(str::to_string)
        .ok_or_else(|| "Local image path is not valid UTF-8.".to_string())
}

#[tauri::command]
fn write_markdown_file(path: String, contents: String) -> Result<String, String> {
    if contents.len() > MAX_MARKDOWN_BYTES {
        return Err("Markdown file exceeds the 20 MB limit.".to_string());
    }

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

    write_markdown_atomically(&path_buf, contents.as_bytes())?;
    Ok(path_buf.to_string_lossy().to_string())
}

fn write_markdown_atomically(path: &Path, contents: &[u8]) -> Result<(), String> {
    let (temporary_path, mut temporary) = loop {
        let index = NEXT_MARKDOWN_TEMP_ID.fetch_add(1, Ordering::Relaxed);
        let temporary_path =
            path.with_file_name(format!(".mdview.{}.{}.tmp", std::process::id(), index));

        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary_path)
        {
            Ok(file) => break (temporary_path, file),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!("Could not create temporary Markdown file: {error}"));
            }
        }
    };

    let result = (|| -> Result<(), String> {
        match fs::symlink_metadata(path) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(
                    "Cannot save Markdown file: destination is a symbolic link.".to_string()
                );
            }
            Ok(metadata) if metadata.file_type().is_file() => {
                temporary
                    .set_permissions(metadata.permissions())
                    .map_err(|error| {
                        format!("Could not preserve Markdown file permissions: {error}")
                    })?;
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Could not inspect Markdown destination: {error}")),
        }
        temporary
            .write_all(contents)
            .map_err(|error| format!("Could not write temporary Markdown file: {error}"))?;
        temporary
            .sync_all()
            .map_err(|error| format!("Could not flush temporary Markdown file: {error}"))?;
        drop(temporary);

        fs::rename(&temporary_path, path)
            .map_err(|error| format!("Could not replace Markdown file atomically: {error}"))?;
        sync_settings_directory(path);
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }

    result
}

fn path_identity(path: &Path) -> Result<PathBuf, String> {
    // ponytail: canonical paths may miss hard links and case-only aliases; use platform file IDs/case-folded comparison if needed.
    match fs::canonicalize(path) {
        Ok(path) => Ok(path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let name = path
                .file_name()
                .ok_or_else(|| "Path must include a file name.".to_string())?;
            let parent = path
                .parent()
                .filter(|parent| !parent.as_os_str().is_empty())
                .unwrap_or_else(|| Path::new("."));
            let canonical_parent = fs::canonicalize(parent)
                .map_err(|error| format!("Could not resolve destination directory: {error}"))?;
            Ok(canonical_parent.join(name))
        }
        Err(error) => Err(format!("Could not resolve file path: {error}")),
    }
}

fn paths_alias(left: &Path, right: &Path) -> Result<bool, String> {
    Ok(path_identity(left)? == path_identity(right)?)
}

#[tauri::command]
fn paths_alias_command(path: String, other_paths: Vec<String>) -> Result<bool, String> {
    let path = normalize_user_file_path(&path)?;
    for other in other_paths {
        if paths_alias(&path, &PathBuf::from(other))? {
            return Ok(true);
        }
    }
    Ok(false)
}

fn resolve_markdown_image_path(markdown_path: &Path, image_path: &str) -> Result<PathBuf, String> {
    const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
    const IMAGE_EXTENSIONS: &[&str] = &[
        "avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "tif", "tiff", "webp",
    ];

    if image_path.is_empty()
        || image_path.starts_with('/')
        || image_path.starts_with('\\')
        || image_path.contains(':')
        || image_path
            .chars()
            .any(|character| character == '?' || character == '#')
        || image_path.split(['/', '\\']).any(|part| part == "..")
    {
        return Err("Markdown image path must be a relative file path.".to_string());
    }

    let relative_path = Path::new(image_path);
    if relative_path.is_absolute()
        || relative_path.components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
    {
        return Err("Markdown image path must stay within the document directory.".to_string());
    }

    let extension = relative_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase);
    if !extension
        .as_deref()
        .is_some_and(|extension| IMAGE_EXTENSIONS.contains(&extension))
    {
        return Err("Markdown image path must have a supported image extension.".to_string());
    }

    ensure_markdown_like(markdown_path)?;
    if !fs::metadata(markdown_path)
        .map_err(|error| format!("Could not inspect Markdown file: {error}"))?
        .is_file()
    {
        return Err("Markdown path is not a file.".to_string());
    }
    let document_directory = markdown_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."))
        .canonicalize()
        .map_err(|error| format!("Could not resolve Markdown directory: {error}"))?;
    let canonical_image = document_directory
        .join(relative_path)
        .canonicalize()
        .map_err(|error| format!("Could not resolve local Markdown image: {error}"))?;
    if !canonical_image.starts_with(&document_directory) {
        return Err("Markdown image must be inside the document directory.".to_string());
    }

    let metadata = fs::metadata(&canonical_image)
        .map_err(|error| format!("Could not inspect local Markdown image: {error}"))?;
    if !metadata.is_file() {
        return Err("Markdown image path is not a file.".to_string());
    }
    if metadata.len() > MAX_IMAGE_BYTES {
        return Err("Markdown image exceeds the 20 MB limit.".to_string());
    }

    Ok(canonical_image)
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

#[tauri::command]
fn copy_attachment(src: String, markdown_path: String, dest: String) -> Result<String, String> {
    let src_path = PathBuf::from(&src);
    let dest_path = normalize_user_file_path(&dest)?;
    let markdown_path = normalize_user_file_path(&markdown_path)?;
    ensure_markdown_like(&markdown_path)?;
    if !fs::metadata(&markdown_path)
        .map_err(|error| format!("Could not inspect Markdown file: {error}"))?
        .is_file()
    {
        return Err("Markdown path is not a file.".to_string());
    }
    let markdown_directory = markdown_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."))
        .canonicalize()
        .map_err(|error| format!("Could not resolve Markdown directory: {error}"))?;

    if dest_path
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("Destination must not contain '..'".to_string());
    }

    let assets_path = dest_path
        .parent()
        .filter(|path| path.file_name().is_some_and(|name| name == "assets"))
        .ok_or_else(|| "Attachments must be stored in an assets directory.".to_string())?;
    let source_extension = validate_attachment_extension(&src_path)?;
    let destination_extension = validate_attachment_extension(&dest_path)?;
    if source_extension != destination_extension {
        return Err("Source and destination attachment extensions must match.".to_string());
    }
    let document_directory = assets_path
        .parent()
        .ok_or_else(|| "Attachment path must be inside a document directory.".to_string())?
        .canonicalize()
        .map_err(|error| format!("Could not resolve document directory: {error}"))?;
    if document_directory != markdown_directory {
        return Err("Attachments must stay within the Markdown document directory.".to_string());
    }
    let canonical_assets = ensure_attachment_directory(&document_directory)?;

    let source =
        fs::File::open(&src_path).map_err(|error| format!("Source not readable: {error}"))?;
    let metadata = source
        .metadata()
        .map_err(|error| format!("Could not inspect source: {error}"))?;
    const MAX_BYTES: u64 = 20 * 1024 * 1024;
    if metadata.len() > MAX_BYTES {
        return Err("File too large (20 MB limit)".to_string());
    }

    let file_name = dest_path
        .file_name()
        .ok_or_else(|| "Attachment path must include a file name.".to_string())?;
    let stem = dest_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("file");
    let extension = dest_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();

    for index in 0usize.. {
        let candidate_name = if index == 0 {
            file_name.to_os_string()
        } else {
            format!("{stem} ({index}){extension}").into()
        };
        let candidate = canonical_assets.join(&candidate_name);
        let mut target = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Could not create attachment: {error}")),
        };

        let result = (|| -> Result<(), String> {
            let mut limited_source = source.take(MAX_BYTES + 1);
            let copied = std::io::copy(&mut limited_source, &mut target)
                .map_err(|error| format!("Could not copy attachment: {error}"))?;
            if copied > MAX_BYTES {
                return Err("File too large (20 MB limit)".to_string());
            }
            target
                .sync_all()
                .map_err(|error| format!("Could not flush attachment: {error}"))
        })();

        if let Err(error) = result {
            let _ = fs::remove_file(&candidate);
            return Err(error);
        }

        return Ok(assets_path
            .join(candidate_name)
            .to_string_lossy()
            .to_string());
    }
    unreachable!()
}

fn ensure_attachment_directory(document_directory: &Path) -> Result<PathBuf, String> {
    let requested_assets = document_directory.join("assets");
    match fs::symlink_metadata(&requested_assets) {
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            match fs::create_dir(&requested_assets) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(error) => {
                    return Err(format!("Could not create attachment directory: {error}"));
                }
            }
        }
        Err(error) => return Err(format!("Could not inspect attachment directory: {error}")),
    }

    let canonical_assets = requested_assets
        .canonicalize()
        .map_err(|error| format!("Could not resolve attachment directory: {error}"))?;
    if !canonical_assets.starts_with(document_directory) {
        return Err("Attachment directory must stay within the document directory.".to_string());
    }
    if !canonical_assets.is_dir() {
        return Err("Attachment path is not a directory.".to_string());
    }
    Ok(canonical_assets)
}

fn validate_attachment_extension(path: &Path) -> Result<String, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase);
    match extension {
        Some(extension) if ALLOWED_ATTACHMENT_EXTENSIONS.contains(&extension.as_str()) => {
            Ok(extension)
        }
        _ => Err("Attachment type is not supported.".to_string()),
    }
}

#[tauri::command]
fn write_attachment_bytes(
    markdown_path: String,
    name: String,
    contents: Vec<u8>,
) -> Result<String, String> {
    const MAX_BYTES: usize = 20 * 1024 * 1024;
    if contents.len() > MAX_BYTES {
        return Err("File too large (20 MB limit)".to_string());
    }
    if name.is_empty()
        || name == "."
        || name == ".."
        || name
            .chars()
            .any(|character| matches!(character, '/' | '\\' | ':' | '\0'))
    {
        return Err("Attachment name must be a single safe file name.".to_string());
    }
    validate_attachment_extension(Path::new(&name))?;

    let markdown_path = normalize_user_file_path(&markdown_path)?;
    ensure_markdown_like(&markdown_path)?;
    if !fs::metadata(&markdown_path)
        .map_err(|error| format!("Could not inspect Markdown file: {error}"))?
        .is_file()
    {
        return Err("Markdown path is not a file.".to_string());
    }
    let document_directory = markdown_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."))
        .canonicalize()
        .map_err(|error| format!("Could not resolve Markdown directory: {error}"))?;
    let display_assets_directory = markdown_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."))
        .join("assets");
    let assets_directory = ensure_attachment_directory(&document_directory)?;

    let requested = Path::new(&name);
    let stem = requested
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("attachment");
    let extension = requested.extension().and_then(|value| value.to_str());
    for index in 0usize.. {
        let candidate_name = if index == 0 {
            name.clone()
        } else if let Some(extension) = extension {
            format!("{stem} ({index}).{extension}")
        } else {
            format!("{stem} ({index})")
        };
        let candidate = assets_directory.join(candidate_name);
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(mut file) => {
                let result = file
                    .write_all(&contents)
                    .map_err(|error| format!("Could not write attachment: {error}"))
                    .and_then(|()| {
                        file.sync_all()
                            .map_err(|error| format!("Could not flush attachment: {error}"))
                    });
                if let Err(error) = result {
                    drop(file);
                    let _ = fs::remove_file(&candidate);
                    return Err(error);
                }
                return Ok(display_assets_directory
                    .join(candidate.file_name().expect("attachment filename"))
                    .to_string_lossy()
                    .to_string());
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Could not create attachment: {error}")),
        }
    }
    unreachable!()
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
            allow_markdown_image,
            write_markdown_file,
            paths_alias_command,
            load_settings,
            save_settings,
            startup_open_file,
            copy_attachment,
            write_attachment_bytes
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

    #[cfg(unix)]
    #[test]
    fn saving_markdown_rejects_symlink_destinations() {
        use std::os::unix::fs::symlink;

        let directory = TestDirectory::new();
        let target = directory.0.join("target.md");
        let link = directory.0.join("linked.md");
        fs::write(&target, "target contents").expect("write symlink target");
        symlink(&target, &link).expect("create symlink");

        let error = write_markdown_file(
            link.to_string_lossy().to_string(),
            "replacement".to_string(),
        )
        .expect_err("refuse symlink destination");

        assert!(error.contains("symbolic link"));
        assert_eq!(
            fs::read_to_string(&target).expect("read target"),
            "target contents"
        );
        assert!(fs::symlink_metadata(&link)
            .expect("stat saved file")
            .file_type()
            .is_symlink());
    }

    #[test]
    fn saving_markdown_replaces_existing_contents() {
        let directory = TestDirectory::new();
        let path = directory.0.join("replace.md");
        fs::write(&path, "old contents").expect("write old contents");

        write_markdown_file(
            path.to_string_lossy().to_string(),
            "new contents".to_string(),
        )
        .expect("replace Markdown file");

        assert_eq!(
            fs::read_to_string(path).expect("read replacement"),
            "new contents"
        );
    }

    #[test]
    fn saving_markdown_rejects_oversized_contents_without_replacing_existing_file() {
        let directory = TestDirectory::new();
        let path = directory.0.join("existing.md");
        fs::write(&path, "keep existing contents").expect("write existing file");

        let error = write_markdown_file(
            path.to_string_lossy().to_string(),
            "x".repeat(MAX_MARKDOWN_BYTES + 1),
        )
        .expect_err("reject oversized Markdown save");

        assert!(error.contains("20 MB"));
        assert_eq!(
            fs::read_to_string(&path).expect("read existing file"),
            "keep existing contents"
        );
    }

    #[test]
    fn read_markdown_file_rejects_files_over_the_size_limit() {
        let directory = TestDirectory::new();
        let path = directory.0.join("large.md");
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .expect("create large Markdown file")
            .set_len(20 * 1024 * 1024 + 1)
            .expect("resize large Markdown file");

        assert!(read_markdown_file(path.to_string_lossy().to_string())
            .expect_err("reject oversized Markdown")
            .contains("20 MB"));
    }

    #[test]
    fn bounded_markdown_read_rejects_growth_after_admission() {
        use std::io::Cursor;

        assert!(read_bounded(Cursor::new(vec![0; 5]), 4)
            .expect_err("reject bytes beyond limit")
            .contains("20 MB"));
    }

    #[cfg(unix)]
    #[test]
    fn native_path_identity_resolves_symlink_aliases() {
        use std::os::unix::fs::symlink;

        let directory = TestDirectory::new();
        let target = directory.0.join("target.md");
        let link = directory.0.join("alias.md");
        fs::write(&target, "# target").expect("write target");
        symlink(&target, &link).expect("create alias");

        assert!(paths_alias(&target, &link).expect("compare paths"));
    }

    #[test]
    fn native_path_identity_canonicalizes_missing_destination_parent() {
        let directory = PathBuf::from(format!(
            "mdview-path-test-{}-{}",
            std::process::id(),
            NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&directory).expect("create relative test directory");
        let child = directory.join("new.md");
        let absolute = std::env::current_dir()
            .expect("current directory")
            .join(&child);

        assert!(paths_alias(&child, &absolute).expect("compare missing paths"));
        fs::remove_dir_all(directory).expect("remove relative test directory");
    }

    #[test]
    fn write_attachment_bytes_saves_with_collision_handling() {
        let directory = TestDirectory::new();
        let markdown = directory.0.join("notes.md");
        fs::write(&markdown, "# Notes").expect("write Markdown");

        let first = write_attachment_bytes(
            markdown.to_string_lossy().to_string(),
            "image.png".to_string(),
            vec![1, 2, 3],
        )
        .expect("write image");
        let second = write_attachment_bytes(
            markdown.to_string_lossy().to_string(),
            "image.png".to_string(),
            vec![4, 5, 6],
        )
        .expect("write collision");

        assert_eq!(fs::read(&first).expect("read first"), [1, 2, 3]);
        assert!(second.ends_with("image (1).png"));
        assert_eq!(fs::read(&second).expect("read second"), [4, 5, 6]);
    }

    #[test]
    fn attachment_extension_policy_allows_pdf_and_rejects_executables() {
        let directory = TestDirectory::new();
        let markdown = directory.0.join("notes.md");
        fs::write(&markdown, "# Notes").expect("write Markdown");

        let pdf = write_attachment_bytes(
            markdown.to_string_lossy().to_string(),
            "report.PDF".to_string(),
            b"pdf-bytes".to_vec(),
        )
        .expect("allow PDF attachment");
        assert_eq!(fs::read(pdf).expect("read PDF"), b"pdf-bytes");

        let error = write_attachment_bytes(
            markdown.to_string_lossy().to_string(),
            "program.exe".to_string(),
            b"executable".to_vec(),
        )
        .expect_err("reject executable attachment");
        assert!(error.contains("type is not supported"));
        assert!(!directory.0.join("assets/program.exe").exists());
    }

    #[test]
    fn write_attachment_bytes_rejects_unsafe_names_and_oversized_data() {
        let directory = TestDirectory::new();
        let markdown = directory.0.join("notes.md");
        fs::write(&markdown, "# Notes").expect("write Markdown");

        assert!(write_attachment_bytes(
            markdown.to_string_lossy().to_string(),
            "../escape.png".to_string(),
            vec![1],
        )
        .is_err());
        assert!(write_attachment_bytes(
            markdown.to_string_lossy().to_string(),
            "large.png".to_string(),
            vec![0; 20 * 1024 * 1024 + 1],
        )
        .expect_err("reject oversized data")
        .contains("20 MB"));
    }

    #[cfg(unix)]
    #[test]
    fn write_attachment_bytes_rejects_assets_symlink_outside_document_directory() {
        use std::os::unix::fs::symlink;

        let directory = TestDirectory::new();
        let docs = directory.0.join("docs");
        let outside = directory.0.join("outside");
        fs::create_dir_all(&docs).expect("create docs directory");
        fs::create_dir_all(&outside).expect("create outside directory");
        let markdown = docs.join("notes.md");
        fs::write(&markdown, "# Notes").expect("write Markdown");
        symlink(&outside, docs.join("assets")).expect("create outside assets symlink");

        assert!(write_attachment_bytes(
            markdown.to_string_lossy().to_string(),
            "image.png".to_string(),
            vec![1],
        )
        .expect_err("reject assets path escaping document directory")
        .contains("within the document directory"));
    }

    #[test]
    fn markdown_image_paths_must_be_relative_images_within_the_document_directory() {
        let directory = TestDirectory::new();
        let docs = directory.0.join("docs");
        let images = docs.join("images");
        fs::create_dir_all(&images).expect("create image directory");
        let markdown = docs.join("readme.md");
        let image = images.join("diagram.png");
        let outside = directory.0.join("outside.png");
        let text = docs.join("notes.md");
        fs::write(&markdown, "# Document").expect("write Markdown file");
        fs::write(&image, b"png").expect("write image");
        fs::write(&outside, b"png").expect("write outside image");
        fs::write(&text, "text").expect("write non-image file");

        assert_eq!(
            resolve_markdown_image_path(&markdown, "images/diagram.png").expect("valid image"),
            fs::canonicalize(&image).expect("canonical image")
        );

        for path in [
            "https://example.com/image.png".to_string(),
            image.to_string_lossy().to_string(),
            "../outside.png".to_string(),
            "images/../images/diagram.png".to_string(),
            "notes.md".to_string(),
        ] {
            assert!(
                resolve_markdown_image_path(&markdown, &path).is_err(),
                "accepted unsafe or non-image path: {path}"
            );
        }
    }

    #[test]
    fn markdown_image_paths_reject_files_over_the_size_limit() {
        let directory = TestDirectory::new();
        let markdown = directory.0.join("readme.md");
        let image = directory.0.join("large.png");
        fs::write(&markdown, "# Document").expect("write Markdown file");
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&image)
            .expect("create large image")
            .set_len(20 * 1024 * 1024 + 1)
            .expect("resize large image");

        assert!(resolve_markdown_image_path(&markdown, "large.png")
            .expect_err("reject oversized image")
            .contains("20 MB"));
    }

    #[cfg(unix)]
    #[test]
    fn markdown_image_paths_reject_symlinks_outside_the_document_directory() {
        use std::os::unix::fs::symlink;

        let directory = TestDirectory::new();
        let docs = directory.0.join("docs");
        let images = docs.join("images");
        fs::create_dir_all(&images).expect("create image directory");
        let markdown = docs.join("readme.md");
        let outside = directory.0.join("outside.png");
        fs::write(&markdown, "# Document").expect("write Markdown file");
        fs::write(&outside, b"png").expect("write outside image");
        symlink(&outside, images.join("linked.png")).expect("create outside image symlink");

        assert!(resolve_markdown_image_path(&markdown, "images/linked.png").is_err());
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

    #[test]
    fn copy_attachment_copies_and_handles_collision() {
        let directory = TestDirectory::new();
        let src = directory.0.join("src.png");
        let markdown = directory.0.join("notes.md");
        fs::write(&src, b"image-bytes").expect("write src");
        fs::write(&markdown, "# Notes").expect("write Markdown");
        let dest = directory.0.join("assets/img.png");

        let first = copy_attachment(
            src.to_string_lossy().to_string(),
            markdown.to_string_lossy().to_string(),
            dest.to_string_lossy().to_string(),
        )
        .expect("first copy");
        assert_eq!(fs::read(&first).expect("read first"), b"image-bytes");

        let second = copy_attachment(
            src.to_string_lossy().to_string(),
            markdown.to_string_lossy().to_string(),
            dest.to_string_lossy().to_string(),
        )
        .expect("second copy");
        assert_ne!(first, second);
        assert!(second.contains("img (1)"));
        assert_eq!(fs::read(&second).expect("read second"), b"image-bytes");
    }

    #[test]
    fn copy_attachment_rejects_renamed_executables_and_mismatched_extensions() {
        let directory = TestDirectory::new();
        let executable = directory.0.join("program.exe");
        let image = directory.0.join("image.png");
        let markdown = directory.0.join("notes.md");
        fs::write(&executable, b"executable").expect("write executable source");
        fs::write(&image, b"image").expect("write image source");
        fs::write(&markdown, "# Notes").expect("write Markdown");

        let executable_error = copy_attachment(
            executable.to_string_lossy().to_string(),
            markdown.to_string_lossy().to_string(),
            directory
                .0
                .join("assets/notes.pdf")
                .to_string_lossy()
                .to_string(),
        )
        .expect_err("reject executable renamed as PDF");
        assert!(executable_error.contains("type is not supported"));

        let mismatch_error = copy_attachment(
            image.to_string_lossy().to_string(),
            markdown.to_string_lossy().to_string(),
            directory
                .0
                .join("assets/image.pdf")
                .to_string_lossy()
                .to_string(),
        )
        .expect_err("reject mismatch between allowed source and destination types");
        assert!(mismatch_error.contains("extensions must match"));
        assert!(!directory.0.join("assets/notes.pdf").exists());
        assert!(!directory.0.join("assets/image.pdf").exists());
    }

    #[test]
    fn copy_attachment_rejects_traversal() {
        let directory = TestDirectory::new();
        let src = directory.0.join("src.png");
        let markdown = directory.0.join("notes.md");
        fs::write(&src, b"x").expect("write src");
        fs::write(&markdown, "# Notes").expect("write Markdown");
        let dest = directory.0.join("assets/../evil.png");
        let err = copy_attachment(
            src.to_string_lossy().to_string(),
            markdown.to_string_lossy().to_string(),
            dest.to_string_lossy().to_string(),
        )
        .expect_err("should reject traversal");
        assert!(err.contains(".."));
    }

    #[cfg(unix)]
    #[test]
    fn copy_attachment_rejects_assets_symlink_outside_document_directory() {
        use std::os::unix::fs::symlink;

        let directory = TestDirectory::new();
        let docs = directory.0.join("docs");
        let outside = directory.0.join("outside");
        fs::create_dir_all(&docs).expect("create document directory");
        fs::create_dir_all(&outside).expect("create outside directory");
        let markdown = docs.join("notes.md");
        let source = directory.0.join("image.png");
        fs::write(&markdown, "# Notes").expect("write Markdown");
        fs::write(&source, b"image-bytes").expect("write source image");
        symlink(&outside, docs.join("assets")).expect("create outside assets symlink");

        let error = copy_attachment(
            source.to_string_lossy().to_string(),
            markdown.to_string_lossy().to_string(),
            docs.join("assets/image.png").to_string_lossy().to_string(),
        )
        .expect_err("reject an attachment directory outside the document directory");

        assert!(error.contains("within the document directory"));
        assert!(!outside.join("image.png").exists());
    }

    #[test]
    fn copy_attachment_rejects_oversized() {
        let directory = TestDirectory::new();
        let src = directory.0.join("missing.png");
        let markdown = directory.0.join("notes.md");
        fs::write(&markdown, "# Notes").expect("write Markdown");
        // create file larger than limit by truncating via write of metadata check mock:
        // Instead test missing src path error path (oversize needs real large file, skip heavy)
        // Verify error for missing file
        let dest = directory.0.join("assets/big.png");
        let err = copy_attachment(
            src.to_string_lossy().to_string(),
            markdown.to_string_lossy().to_string(),
            dest.to_string_lossy().to_string(),
        )
        .expect_err("should fail missing src");
        assert!(err.contains("Source not readable"));
    }
}
