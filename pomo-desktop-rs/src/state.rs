//! Everything the app remembers between runs, stored as JSON in the user's config folder.
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const DEFAULT_API_URL: &str = "https://pomofocus.online/api/desktop/session";
pub const MAX_RECENT: usize = 10;

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TimerSettings {
    pub focus: u32,
    pub short_break: u32,
    pub long_break: u32,
}

impl Default for TimerSettings {
    fn default() -> Self {
        Self { focus: 25, short_break: 5, long_break: 15 }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SyncSettings {
    pub api_url: String,
    pub token: String,
    pub auto_sync: bool,
}

impl Default for SyncSettings {
    fn default() -> Self {
        Self { api_url: DEFAULT_API_URL.into(), token: String::new(), auto_sync: true }
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DailyStats {
    pub date: String,
    pub focus_minutes: u32,
    pub sessions: u32,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct RecentSession {
    pub id: String,
    pub title: String,
    pub subject: String,
    pub minutes: u32,
    pub started_at: String,
    pub completed_at: String,
    /// syncing | synced | duplicate | local | error
    pub sync_status: String,
    pub message: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Profile {
    pub discord_id: String,
    pub username: String,
    pub avatar: Option<String>,
    pub level: u32,
    pub water: u64,
    pub streak: u32,
    pub total_focus_minutes: u64,
    pub total_sessions: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Saved {
    pub settings: TimerSettings,
    pub sync: SyncSettings,
    pub today: DailyStats,
    pub idle_guard: bool,
    pub recent: Vec<RecentSession>,
    pub profile: Option<Profile>,
}

impl Default for Saved {
    fn default() -> Self {
        Self {
            settings: TimerSettings::default(),
            sync: SyncSettings::default(),
            today: DailyStats::default(),
            idle_guard: true,
            recent: Vec::new(),
            profile: None,
        }
    }
}

pub fn data_dir() -> PathBuf {
    dirs::config_dir().unwrap_or_else(std::env::temp_dir).join("pomo-focus")
}

fn state_file() -> PathBuf {
    data_dir().join("state.json")
}

impl Saved {
    pub fn exists() -> bool {
        state_file().exists()
    }

    pub fn load() -> Self {
        let mut saved: Saved = std::fs::read_to_string(state_file())
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        saved.settings.focus = saved.settings.focus.clamp(5, 100);
        saved.settings.short_break = saved.settings.short_break.clamp(1, 100);
        saved.settings.long_break = saved.settings.long_break.clamp(1, 100);
        if saved.sync.api_url.trim().is_empty() {
            saved.sync.api_url = DEFAULT_API_URL.into();
        }
        saved
    }

    /// Writes to a temporary file first, so a crash never leaves a half-written state.
    pub fn save(&self) {
        let dir = data_dir();
        if std::fs::create_dir_all(&dir).is_err() {
            return;
        }
        let Ok(text) = serde_json::to_string_pretty(self) else { return };
        let tmp = dir.join("state.json.tmp");
        if std::fs::write(&tmp, text).is_ok() {
            // The file holds the Pomo connection token: readable by this user only
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
            }
            let _ = std::fs::rename(&tmp, state_file());
        }
    }

    /// Today's numbers, starting from zero on a new (UTC) day.
    pub fn today_mut(&mut self, today: &str) -> &mut DailyStats {
        if self.today.date != today {
            self.today = DailyStats { date: today.into(), ..Default::default() };
        }
        &mut self.today
    }

    pub fn record_session(&mut self, session: RecentSession) {
        self.recent.retain(|item| item.id != session.id);
        self.recent.insert(0, session);
        self.recent.truncate(MAX_RECENT);
    }

    pub fn update_session(&mut self, id: &str, status: &str, message: &str) {
        if let Some(item) = self.recent.iter_mut().find(|item| item.id == id) {
            item.sync_status = status.into();
            item.message = message.into();
        }
    }
}
