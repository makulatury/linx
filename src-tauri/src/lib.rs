//! Linx: окно с веб-интерфейсом и хранение базы на диске.
//!
//! База лежит в папке «Linx-данные» рядом с программой (переносная версия),
//! а если такой папки нет - в папке данных программы (%APPDATA%\com.makulatury.linx\data):
//!   protocols\<id>.json - по файлу на протокол;
//!   settings.json       - настройки и пользовательские тексты.
//! Запись идёт через временный файл с последующим переименованием,
//! чтобы при сбое не остался наполовину записанный файл.

use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, State};

struct Store {
    dir: PathBuf,
    lock: Mutex<()>,
}

impl Store {
    fn protocols_dir(&self) -> PathBuf {
        self.dir.join("protocols")
    }
    fn settings_file(&self) -> PathBuf {
        self.dir.join("settings.json")
    }
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Имя файла протокола: допускаются только буквы, цифры, - и _ (остальное кодируется).
fn file_name_for(id: &str) -> Result<String, String> {
    if id.is_empty() {
        return Err("Пустой идентификатор протокола".into());
    }
    let mut s = String::new();
    for ch in id.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            s.push(ch);
        } else {
            for b in ch.to_string().bytes() {
                s.push_str(&format!("~{:02x}", b));
            }
        }
    }
    Ok(s + ".json")
}

fn write_atomic(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, data).map_err(err)?;
    fs::rename(&tmp, path).map_err(err)
}

fn read_json(path: &Path) -> Result<Option<Value>, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map(Some).map_err(err),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(err(e)),
    }
}

fn read_settings(store: &Store) -> Result<Map<String, Value>, String> {
    Ok(match read_json(&store.settings_file())? {
        Some(Value::Object(m)) => m,
        _ => Map::new(),
    })
}

#[tauri::command]
fn store_list(store: State<Store>) -> Result<Vec<Value>, String> {
    let _g = store.lock.lock().map_err(err)?;
    let mut out = Vec::new();
    let rd = match fs::read_dir(store.protocols_dir()) {
        Ok(rd) => rd,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(out),
        Err(e) => return Err(err(e)),
    };
    for entry in rd {
        let path = entry.map_err(err)?.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        // Повреждённый файл не должен ломать весь список
        if let Ok(Some(v)) = read_json(&path) {
            out.push(v);
        }
    }
    Ok(out)
}

#[tauri::command]
fn store_get(store: State<Store>, id: String) -> Result<Option<Value>, String> {
    let _g = store.lock.lock().map_err(err)?;
    read_json(&store.protocols_dir().join(file_name_for(&id)?))
}

#[tauri::command]
fn store_put(store: State<Store>, protocol: Value) -> Result<(), String> {
    let id = protocol
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("У протокола нет идентификатора")?
        .to_string();
    let bytes = serde_json::to_vec(&protocol).map_err(err)?;
    let _g = store.lock.lock().map_err(err)?;
    write_atomic(&store.protocols_dir().join(file_name_for(&id)?), &bytes)
}

#[tauri::command]
fn store_delete(store: State<Store>, id: String) -> Result<(), String> {
    let _g = store.lock.lock().map_err(err)?;
    match fs::remove_file(store.protocols_dir().join(file_name_for(&id)?)) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(err(e)),
        _ => Ok(()),
    }
}

#[tauri::command]
fn store_clear(store: State<Store>) -> Result<(), String> {
    let _g = store.lock.lock().map_err(err)?;
    let dir = store.protocols_dir();
    if let Ok(rd) = fs::read_dir(&dir) {
        for entry in rd.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) == Some("json") {
                fs::remove_file(p).map_err(err)?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn setting_get(store: State<Store>, key: String) -> Result<Option<Value>, String> {
    let _g = store.lock.lock().map_err(err)?;
    Ok(read_settings(&store)?.remove(&key))
}

#[tauri::command]
fn setting_put(store: State<Store>, key: String, value: Value) -> Result<(), String> {
    let _g = store.lock.lock().map_err(err)?;
    let mut m = read_settings(&store)?;
    m.insert(key, value);
    let bytes = serde_json::to_vec_pretty(&Value::Object(m)).map_err(err)?;
    write_atomic(&store.settings_file(), &bytes)
}

/// Записать файл, выбранный пользователем в окне «Сохранить как».
/// Тело запроса - байты файла, путь - в заголовке x-path (URL-кодирован).
#[tauri::command]
fn save_file(request: Request<'_>) -> Result<(), String> {
    let path = request
        .headers()
        .get("x-path")
        .and_then(|v| v.to_str().ok())
        .ok_or("Не указан путь")?;
    let path = percent_decode(path)?;
    match request.body() {
        InvokeBody::Raw(bytes) => fs::write(PathBuf::from(path), bytes).map_err(err),
        _ => Err("Ожидались двоичные данные".into()),
    }
}

fn percent_decode(s: &str) -> Result<String, String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            let hex = std::str::from_utf8(&b[i + 1..i + 3]).map_err(err)?;
            out.push(u8::from_str_radix(hex, 16).map_err(err)?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(err)
}

/// Имя папки переносной версии: если она лежит рядом с программой, база хранится в ней.
const PORTABLE_DIR: &str = "Linx-данные";

/// Где лежит база и почему.
#[derive(Clone, serde::Serialize)]
struct DataInfo {
    dir: String,
    portable: bool,
    /// Непустое, если папку переносной версии нельзя использовать и база временно в AppData
    warning: Option<String>,
}

fn can_write(dir: &Path) -> bool {
    let probe = dir.join(".linx-write-test");
    let ok = fs::write(&probe, b"ok").is_ok();
    let _ = fs::remove_file(&probe);
    ok
}

fn choose_data_dir(app: &AppHandle) -> (PathBuf, DataInfo) {
    let appdata = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("data");
    let portable = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.join(PORTABLE_DIR)))
        .filter(|p| p.is_dir());
    let mut warning = None;
    if let Some(dir) = portable {
        if can_write(&dir) {
            let info = DataInfo { dir: dir.display().to_string(), portable: true, warning: None };
            return (dir, info);
        }
        warning = Some(format!(
            "Нет прав на запись в папку «{}». База временно сохраняется в папке пользователя. \
             Перенесите программу вместе с папкой «{}» туда, где можно записывать файлы \
             (например, на рабочий стол, в «Документы» или на флешку).",
            dir.display(),
            PORTABLE_DIR
        ));
    }
    let info = DataInfo { dir: appdata.display().to_string(), portable: false, warning };
    (appdata, info)
}

#[tauri::command]
fn data_info(info: State<DataInfo>) -> DataInfo {
    info.inner().clone()
}

/// Сведения «О программе»: версия, лицензия, список сторонних компонентов (JSON-строка).
#[derive(serde::Serialize)]
struct AboutInfo {
    version: String,
    license: &'static str,
    components: &'static str,
}

#[tauri::command]
fn about_info(app: AppHandle) -> AboutInfo {
    AboutInfo {
        version: app.package_info().version.to_string(),
        license: include_str!("../../LICENSE"),
        components: include_str!("../third_party/components.json"),
    }
}

/// Полные тексты лицензий сторонних компонентов.
#[tauri::command]
fn third_party_licenses() -> &'static str {
    include_str!("../third_party/THIRD-PARTY-LICENSES.txt")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let (dir, info) = choose_data_dir(app.handle());
            fs::create_dir_all(dir.join("protocols"))?;
            app.manage(Store { dir, lock: Mutex::new(()) });
            app.manage(info);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            store_list,
            store_get,
            store_put,
            store_delete,
            store_clear,
            setting_get,
            setting_put,
            save_file,
            data_info,
            about_info,
            third_party_licenses
        ])
        .run(tauri::generate_context!())
        .expect("не удалось запустить Linx");
}
