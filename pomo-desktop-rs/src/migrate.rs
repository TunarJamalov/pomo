//! First run after the Electron version (1.x): bring over the Discord connection,
//! timer lengths and profile so nobody has to connect again.
//!
//! Electron kept them in Chromium's localStorage, a LevelDB folder. Values are JSON
//! written in plain text, so we look for each value's start, read one JSON object
//! from there and keep the last (newest) copy. Nothing in that folder is changed.
use crate::state::{Profile, Saved};
use serde_json::Value;
use std::path::PathBuf;

fn electron_storage_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(config) = dirs::config_dir() {
        for name in ["Pomo Focus", "pomo-desktop"] {
            dirs.push(config.join(name).join("Local Storage").join("leveldb"));
        }
    }
    // The Microsoft Store version runs in a package with its own copy of AppData
    #[cfg(windows)]
    if let Some(local) = dirs::data_local_dir() {
        if let Ok(entries) = std::fs::read_dir(local.join("Packages")) {
            for entry in entries.flatten() {
                if entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("TunarJamalov.PomoFocus_")
                {
                    dirs.push(
                        entry
                            .path()
                            .join(r"LocalCache\Roaming\Pomo Focus\Local Storage\leveldb"),
                    );
                }
            }
        }
    }
    dirs
}

/// The newest JSON object in `data` that starts with `prefix`.
fn last_object(data: &[u8], prefix: &[u8]) -> Option<Value> {
    let mut found = None;
    let mut from = 0;
    while let Some(pos) = data[from..].windows(prefix.len()).position(|w| w == prefix) {
        let start = from + pos;
        let mut stream = serde_json::Deserializer::from_slice(&data[start..]).into_iter::<Value>();
        if let Some(Ok(value)) = stream.next() {
            found = Some(value);
        }
        from = start + prefix.len();
    }
    found
}

fn read_dir_bytes(dir: &PathBuf) -> Option<Vec<u8>> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| matches!(path.extension().and_then(|e| e.to_str()), Some("ldb" | "log")))
        .collect();
    // Compacted tables (.ldb) hold older values than the write-ahead log (.log)
    files.sort_by_key(|path| (path.extension().and_then(|e| e.to_str()) == Some("log"), path.clone()));
    let mut data = Vec::new();
    for file in files {
        data.extend(std::fs::read(file).ok()?);
    }
    Some(data)
}

/// Fills `saved` from the Electron version when it finds a connection. Returns whether it did.
pub fn from_electron(saved: &mut Saved) -> bool {
    for dir in electron_storage_dirs() {
        let Some(data) = read_dir_bytes(&dir) else { continue };
        let Some(sync) = last_object(&data, br#"{"apiUrl":"#) else {
            continue;
        };
        let token = sync
            .get("token")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        if token.is_empty() {
            continue;
        }
        saved.sync.token = token;
        if let Some(url) = sync
            .get("apiUrl")
            .and_then(Value::as_str)
            .filter(|u| u.starts_with("https://pomofocus.online/"))
        {
            saved.sync.api_url = url.to_string();
        }
        saved.sync.auto_sync = sync.get("autoSync").and_then(Value::as_bool).unwrap_or(true);

        if let Some(settings) = last_object(&data, br#"{"focus":"#) {
            let minutes = |key: &str| settings.get(key).and_then(Value::as_u64).map(|v| v as u32);
            if let Some(v) = minutes("focus") {
                saved.settings.focus = v.clamp(5, 100);
            }
            if let Some(v) = minutes("shortBreak") {
                saved.settings.short_break = v.clamp(1, 100);
            }
            if let Some(v) = minutes("longBreak") {
                saved.settings.long_break = v.clamp(1, 100);
            }
        }
        if let Some(profile) = last_object(&data, br#"{"discordId":"#) {
            let text = |key: &str| profile.get(key).and_then(Value::as_str).map(String::from);
            let number = |key: &str| profile.get(key).and_then(Value::as_f64).unwrap_or(0.0);
            if let Some(discord_id) = text("discordId") {
                saved.profile = Some(Profile {
                    username: text("username").unwrap_or_else(|| "Pomo user".into()),
                    discord_id,
                    avatar: text("avatar"),
                    level: number("level").max(1.0) as u32,
                    water: number("water") as u64,
                    streak: number("streak") as u32,
                    total_focus_minutes: number("totalFocusMinutes") as u64,
                    total_sessions: number("totalSessions") as u64,
                });
            }
        }
        return true;
    }
    false
}
