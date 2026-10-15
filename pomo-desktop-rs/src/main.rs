// No console window behind the app on Windows
#![cfg_attr(all(not(debug_assertions), windows), windows_subsystem = "windows")]

mod idle;
mod migrate;
mod platform;
#[cfg(feature = "snapshot")]
mod snapshot;
mod state;
mod sync;

slint::include_modules!();

use serde_json::{Value, json};
use slint::{CloseRequestResponse, ComponentHandle, LogicalSize, ModelRc, SharedString, VecModel, Weak};
use state::{Profile, RecentSession, Saved};
use std::cell::{Cell, RefCell};
use std::rc::Rc;
use std::time::{Duration, Instant};
use time::format_description::well_known::Rfc3339;
use time::{OffsetDateTime, UtcOffset, macros::format_description};

const SUBJECTS: [(&str, &str); 6] = [
    ("general", "General"),
    ("math", "Math"),
    ("language", "Language"),
    ("coding", "Coding"),
    ("reading", "Reading"),
    ("exam", "Exam"),
];
const IDLE_GUARD_SECONDS: u64 = 15 * 60;
const CONNECT_URL: &str = "https://pomofocus.online/dashboard/desktop?from=app";
const DASHBOARD_URL: &str = "https://pomofocus.online/dashboard";
// A pomo:// link can be clicked from anywhere, so it may only point sync at our own server
const TRUSTED_SYNC_HOSTS: [&str; 2] = ["pomofocus.online", "www.pomofocus.online"];

#[derive(Clone, Copy, PartialEq)]
enum Mode {
    Focus,
    ShortBreak,
    LongBreak,
}

impl Mode {
    fn from_index(index: i32) -> Self {
        match index {
            1 => Mode::ShortBreak,
            2 => Mode::LongBreak,
            _ => Mode::Focus,
        }
    }
    fn index(self) -> i32 {
        self as i32
    }
    fn label(self) -> &'static str {
        match self {
            Mode::Focus => "Focus",
            Mode::ShortBreak => "Short Break",
            Mode::LongBreak => "Long Break",
        }
    }
    fn complete_message(self) -> (&'static str, &'static str) {
        match self {
            Mode::Focus => (
                "Focus session complete",
                "Nice work. Take a short break before the next round.",
            ),
            Mode::ShortBreak => ("Break complete", "Ready for another focus session?"),
            Mode::LongBreak => ("Long break complete", "You are reset and ready to study again."),
        }
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Status {
    Ready,
    Running,
    Paused,
    Finished,
}

impl Status {
    fn key(self) -> &'static str {
        match self {
            Status::Ready => "ready",
            Status::Running => "running",
            Status::Paused => "paused",
            Status::Finished => "finished",
        }
    }
    fn label(self) -> &'static str {
        match self {
            Status::Ready => "Ready",
            Status::Running => "Running",
            Status::Paused => "Paused",
            Status::Finished => "Finished",
        }
    }
}

#[derive(Clone)]
struct ActiveSession {
    id: String,
    started_at: String,
}

struct PendingIdle {
    session: ActiveSession,
    minutes: u32,
    title: String,
    subject: String,
    idle_seconds: u64,
}

struct App {
    saved: Saved,
    mode: Mode,
    status: Status,
    remaining: Duration,
    deadline: Option<Instant>,
    active: Option<ActiveSession>,
    title: String,
    subject: usize,
    pending_idle: Option<PendingIdle>,
    sync_status: String,
    sync_message: String,
    compact: bool,
    startup_on: bool,
    avatar: Option<(String, slint::Image)>,
    local_offset: UtcOffset,
}

impl App {
    fn minutes_for(&self, mode: Mode) -> u32 {
        match mode {
            Mode::Focus => self.saved.settings.focus,
            Mode::ShortBreak => self.saved.settings.short_break,
            Mode::LongBreak => self.saved.settings.long_break,
        }
    }

    fn total(&self) -> Duration {
        Duration::from_secs(u64::from(self.minutes_for(self.mode)) * 60)
    }

    fn remaining_now(&self) -> Duration {
        match self.deadline {
            Some(deadline) => deadline.saturating_duration_since(Instant::now()),
            None => self.remaining,
        }
    }

    fn next_mode(&self) -> Mode {
        if self.mode != Mode::Focus {
            return Mode::Focus;
        }
        let sessions = self.today().sessions;
        if sessions > 0 && sessions.is_multiple_of(4) {
            Mode::LongBreak
        } else {
            Mode::ShortBreak
        }
    }

    fn today(&self) -> state::DailyStats {
        if self.saved.today.date == today_key() {
            self.saved.today.clone()
        } else {
            Default::default()
        }
    }

    fn connected(&self) -> bool {
        !self.saved.sync.token.trim().is_empty() && self.saved.profile.is_some()
    }

    fn reset_to(&mut self, mode: Mode) {
        self.mode = mode;
        self.deadline = None;
        self.remaining = self.total();
        self.status = Status::Ready;
        self.active = None;
    }
}

struct Ctx {
    app: RefCell<App>,
    ui: Weak<AppWindow>,
    tray: RefCell<Option<Tray>>,
    last_tray_summary: RefCell<String>,
    quitting: Cell<bool>,
}

type Shared = Rc<Ctx>;

thread_local! {
    static CTX: RefCell<Option<Shared>> = const { RefCell::new(None) };
}

/// Runs `f` on the UI thread with the app context; worker threads report back through this.
fn post(f: impl FnOnce(&Shared) + Send + 'static) {
    let _ = slint::invoke_from_event_loop(move || {
        let ctx = CTX.with(|cell| cell.borrow().clone());
        if let Some(ctx) = ctx {
            f(&ctx);
        }
    });
}

// ─── Formatting ───────────────────────────────────────────

fn today_key() -> String {
    let format = format_description!("[year]-[month]-[day]");
    OffsetDateTime::now_utc().date().format(&format).unwrap_or_default()
}

fn now_iso() -> String {
    OffsetDateTime::now_utc().format(&Rfc3339).unwrap_or_default()
}

fn format_clock(remaining: Duration) -> String {
    // Round up, so a timer shows 25:00 until a full second has passed
    let secs = remaining.as_millis().div_ceil(1000) as u64;
    format!("{:02}:{:02}", secs / 60, secs % 60)
}

fn format_minutes(minutes: u64) -> String {
    if minutes < 60 {
        return format!("{minutes}m");
    }
    let (hours, rest) = (minutes / 60, minutes % 60);
    if rest == 0 {
        format!("{hours}h")
    } else {
        format!("{hours}h {rest}m")
    }
}

fn format_idle(seconds: u64) -> String {
    format_minutes((seconds as f64 / 60.0).round().max(1.0) as u64)
}

fn subject_label(value: &str) -> &'static str {
    SUBJECTS
        .iter()
        .find(|(key, _)| *key == value)
        .map(|(_, label)| *label)
        .unwrap_or("General")
}

fn session_time(iso: &str, offset: UtcOffset) -> String {
    let format = format_description!("[hour]:[minute]");
    OffsetDateTime::parse(iso, &Rfc3339)
        .ok()
        .and_then(|time| time.to_offset(offset).format(&format).ok())
        .unwrap_or_else(|| "recently".into())
}

fn new_session() -> ActiveSession {
    let millis = OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000;
    let random: String = rand::random::<u64>().to_string().chars().take(8).collect();
    ActiveSession {
        id: format!("desktop_{millis}_{random}"),
        started_at: now_iso(),
    }
}

// ─── Pushing state into the UI ────────────────────────────

fn refresh_timer(ctx: &Shared) {
    let Some(ui) = ctx.ui.upgrade() else { return };
    let app = ctx.app.borrow();
    let remaining = app.remaining_now();
    let total = app.total().as_secs_f32().max(1.0);
    ui.set_mode(app.mode.index());
    ui.set_status(app.status.key().into());
    ui.set_status_text(app.status.label().into());
    ui.set_time_text(format_clock(remaining).into());
    ui.set_progress(((total - remaining.as_secs_f32()) / total).clamp(0.0, 1.0));
    ui.set_mode_label(app.mode.label().into());
    ui.set_next_mode_label(app.next_mode().label().into());

    let summary = format!(
        "{} {} ({})",
        app.mode.label(),
        format_clock(remaining),
        app.status.label()
    );
    if *ctx.last_tray_summary.borrow() != summary {
        if let Some(tray) = ctx.tray.borrow().as_ref() {
            tray.set_summary(summary.clone().into());
            tray.set_primary_label(
                match app.status {
                    Status::Running => "Pause Timer",
                    Status::Paused => "Resume Timer",
                    _ => "Start Timer",
                }
                .into(),
            );
            tray.set_compact(app.compact);
        }
        *ctx.last_tray_summary.borrow_mut() = summary;
    }
}

fn refresh_all(ctx: &Shared) {
    refresh_timer(ctx);
    let Some(ui) = ctx.ui.upgrade() else { return };
    let app = ctx.app.borrow();
    let today = app.today();

    if ui.get_session_title() != app.title.as_str() {
        ui.set_session_title(app.title.clone().into());
    }
    ui.set_subject(app.subject as i32);
    ui.set_compact(app.compact);
    ui.set_idle_pending(app.pending_idle.is_some());
    if let Some(pending) = &app.pending_idle {
        ui.set_idle_text(
            format!(
                "Your computer was idle for {}. Credit it only if the focus session was still valid.",
                format_idle(pending.idle_seconds)
            )
            .into(),
        );
    }
    ui.set_today_focus(format_minutes(u64::from(today.focus_minutes)).into());
    ui.set_today_sessions(today.sessions.to_string().into());

    let items: Vec<SessionItem> = app
        .saved
        .recent
        .iter()
        .map(|s| SessionItem {
            id: s.id.clone().into(),
            title: s.title.clone().into(),
            meta: format!(
                "{}m · {} · {}",
                s.minutes,
                subject_label(&s.subject),
                session_time(&s.completed_at, app.local_offset)
            )
            .into(),
            sync_status: s.sync_status.clone().into(),
            message: s.message.clone().into(),
            can_retry: s.sync_status != "synced" && s.sync_status != "duplicate" && s.sync_status != "syncing",
        })
        .collect();
    ui.set_sessions(ModelRc::new(VecModel::from(items)));

    let connected = app.connected();
    ui.set_connected(connected);
    ui.set_has_profile(app.saved.profile.is_some());
    if let Some(profile) = &app.saved.profile {
        ui.set_username(profile.username.clone().into());
        ui.set_initials(
            profile
                .username
                .chars()
                .take(2)
                .collect::<String>()
                .to_uppercase()
                .into(),
        );
        ui.set_level(profile.level.to_string().into());
        ui.set_streak(format!("{}d", profile.streak).into());
        ui.set_water(profile.water.to_string().into());
        ui.set_total_focus(format_minutes(profile.total_focus_minutes).into());
        ui.set_total_sessions(profile.total_sessions.to_string().into());
    }
    match &app.avatar {
        Some((_, image)) => {
            ui.set_avatar(image.clone());
            ui.set_has_avatar(true);
        }
        None => ui.set_has_avatar(false),
    }
    ui.set_sync_status(app.sync_status.clone().into());
    let message = if connected && app.sync_status == "idle" {
        "Connected. Finished sessions go to your Pomo profile.".to_string()
    } else {
        app.sync_message.clone()
    };
    ui.set_sync_message(message.into());
    ui.set_auto_sync(app.saved.sync.auto_sync);
    if ui.get_api_url() != app.saved.sync.api_url.as_str() {
        ui.set_api_url(app.saved.sync.api_url.clone().into());
    }
    if ui.get_token() != app.saved.sync.token.as_str() {
        ui.set_token(app.saved.sync.token.clone().into());
    }

    ui.set_focus_minutes(app.saved.settings.focus as i32);
    ui.set_short_minutes(app.saved.settings.short_break as i32);
    ui.set_long_minutes(app.saved.settings.long_break as i32);
    ui.set_startup_on(app.startup_on);
    ui.set_startup_in_settings(platform::startup_in_os_settings());
    ui.set_idle_guard_on(app.saved.idle_guard);
}

fn set_sync(ctx: &Shared, status: &str, message: &str) {
    let mut app = ctx.app.borrow_mut();
    app.sync_status = status.into();
    app.sync_message = message.into();
}

// ─── Timer ────────────────────────────────────────────────

fn start(ctx: &Shared) {
    {
        let mut app = ctx.app.borrow_mut();
        if app.status == Status::Running {
            return;
        }
        if app.active.is_none() || matches!(app.status, Status::Ready | Status::Finished) {
            app.active = Some(new_session());
        }
        if app.status == Status::Finished || app.remaining.is_zero() {
            app.remaining = app.total();
        }
        app.deadline = Some(Instant::now() + app.remaining);
        app.status = Status::Running;
    }
    refresh_all(ctx);
}

fn pause(ctx: &Shared) {
    {
        let mut app = ctx.app.borrow_mut();
        if app.status != Status::Running {
            return;
        }
        app.remaining = app.remaining_now();
        app.deadline = None;
        app.status = Status::Paused;
    }
    refresh_all(ctx);
}

fn reset(ctx: &Shared, mode: Option<Mode>) {
    {
        let mut app = ctx.app.borrow_mut();
        let mode = mode.unwrap_or(app.mode);
        app.reset_to(mode);
    }
    refresh_all(ctx);
}

fn tick(ctx: &Shared) {
    let finished = {
        let app = ctx.app.borrow();
        app.status == Status::Running && app.remaining_now().is_zero()
    };
    if finished {
        complete(ctx);
    } else {
        refresh_timer(ctx);
    }
}

fn complete(ctx: &Shared) {
    let (mode, session, minutes, title, subject) = {
        let mut app = ctx.app.borrow_mut();
        app.status = Status::Finished;
        app.deadline = None;
        app.remaining = Duration::ZERO;
        let title = if app.title.trim().is_empty() {
            "Desktop Focus".to_string()
        } else {
            app.title.trim().to_string()
        };
        (
            app.mode,
            app.active.clone().unwrap_or_else(new_session),
            app.minutes_for(app.mode),
            title,
            SUBJECTS[app.subject].0.to_string(),
        )
    };
    if mode == Mode::Focus {
        // Asking the system for idle time can block for a moment, so do it off the UI thread
        std::thread::spawn(move || {
            let idle_seconds = idle::idle_seconds();
            post(move |ctx| focus_finished(ctx, session, minutes, title, subject, idle_seconds));
        });
    }
    let (title, body) = mode.complete_message();
    platform::notify(title, body);
    refresh_all(ctx);
}

fn focus_finished(
    ctx: &Shared,
    session: ActiveSession,
    minutes: u32,
    title: String,
    subject: String,
    idle_seconds: u64,
) {
    let idle_guard = ctx.app.borrow().saved.idle_guard;
    if idle_guard && idle_seconds >= IDLE_GUARD_SECONDS {
        ctx.app.borrow_mut().pending_idle = Some(PendingIdle {
            session,
            minutes,
            title,
            subject,
            idle_seconds,
        });
        set_sync(
            ctx,
            "off",
            &format!(
                "Idle Guard paused this session. Confirm it if {} idle time was expected.",
                format_idle(idle_seconds)
            ),
        );
        platform::notify(
            "Confirm focus session",
            "Pomo paused this session because your computer was idle for a while.",
        );
        refresh_all(ctx);
        return;
    }
    credit(ctx, session, minutes, title, subject);
}

fn credit(ctx: &Shared, session: ActiveSession, minutes: u32, title: String, subject: String) {
    let auto_sync = {
        let mut app = ctx.app.borrow_mut();
        let today = app.saved.today_mut(&today_key());
        today.focus_minutes += minutes;
        today.sessions += 1;
        let auto_sync = app.saved.sync.auto_sync;
        app.saved.record_session(RecentSession {
            id: session.id.clone(),
            title: title.clone(),
            subject: subject.clone(),
            minutes,
            started_at: session.started_at.clone(),
            completed_at: now_iso(),
            sync_status: if auto_sync { "syncing" } else { "local" }.into(),
            message: if auto_sync {
                "Syncing with PomoBot..."
            } else {
                "Saved locally. Auto-sync is off."
            }
            .into(),
        });
        app.saved.save();
        auto_sync
    };
    if auto_sync {
        sync_session(ctx, session, minutes, title, subject);
    } else {
        set_sync(ctx, "off", "Auto-sync is off. The session was saved locally only.");
    }
    refresh_all(ctx);
}

// ─── Sync ─────────────────────────────────────────────────

fn update_session(ctx: &Shared, id: &str, status: &str, message: &str) {
    let mut app = ctx.app.borrow_mut();
    app.saved.update_session(id, status, message);
    app.saved.save();
}

fn sync_session(ctx: &Shared, session: ActiveSession, minutes: u32, title: String, subject: String) {
    let (api_url, token) = {
        let app = ctx.app.borrow();
        (
            app.saved.sync.api_url.trim().to_string(),
            app.saved.sync.token.trim().to_string(),
        )
    };
    if token.is_empty() {
        set_sync(ctx, "off", "Sync skipped. Add a desktop token first.");
        update_session(ctx, &session.id, "local", "Sync skipped. Add a desktop token first.");
        refresh_all(ctx);
        return;
    }
    set_sync(ctx, "syncing", "Syncing completed session...");
    update_session(ctx, &session.id, "syncing", "Syncing with PomoBot...");
    refresh_all(ctx);

    let body = json!({
        "clientSessionId": session.id,
        "startedAt": session.started_at,
        "minutes": minutes,
        "title": title,
        "subject": subject,
    });
    let id = session.id.clone();
    std::thread::spawn(move || {
        let result = sync::post_session(&api_url, &token, &body);
        post(move |ctx| {
            match result {
                Ok(data) => {
                    apply_profile(ctx, &data);
                    if data.get("duplicate").and_then(Value::as_bool).unwrap_or(false) {
                        set_sync(ctx, "duplicate", "This session was already synced.");
                        update_session(ctx, &id, "duplicate", "Already synced earlier.");
                    } else {
                        let reward = data.get("reward").cloned().unwrap_or(Value::Null);
                        let number = |key: &str| reward.get(key).map(|v| v.to_string()).unwrap_or_else(|| "0".into());
                        let streak = reward
                            .get("streak")
                            .map(|v| v.to_string())
                            .unwrap_or_else(|| "-".into());
                        let message = format!("+{} water, +{} XP, streak {}", number("water"), number("xp"), streak);
                        set_sync(ctx, "synced", &format!("Synced: {message}"));
                        update_session(ctx, &id, "synced", &message);
                    }
                }
                Err(message) => {
                    set_sync(ctx, "error", &message);
                    update_session(ctx, &id, "error", &message);
                }
            }
            refresh_all(ctx);
        });
    });
}

fn retry(ctx: &Shared, id: &str) {
    let session = ctx.app.borrow().saved.recent.iter().find(|s| s.id == id).cloned();
    if let Some(s) = session {
        sync_session(
            ctx,
            ActiveSession {
                id: s.id,
                started_at: s.started_at,
            },
            s.minutes,
            s.title,
            s.subject,
        );
    }
}

fn test_sync(ctx: &Shared) {
    let (api_url, token) = {
        let app = ctx.app.borrow();
        (
            app.saved.sync.api_url.trim().to_string(),
            app.saved.sync.token.trim().to_string(),
        )
    };
    if token.is_empty() {
        set_sync(ctx, "error", "Connect with Discord first.");
        refresh_all(ctx);
        return;
    }
    set_sync(ctx, "syncing", "Checking your Pomo connection...");
    refresh_all(ctx);
    std::thread::spawn(move || {
        let result = sync::check(&api_url, &token);
        post(move |ctx| {
            match result {
                Ok(data) => {
                    apply_profile(ctx, &data);
                    let user = data.get("user").cloned().unwrap_or(Value::Null);
                    let field = |key: &str, fallback: &str| {
                        user.get(key).map(|v| v.to_string()).unwrap_or_else(|| fallback.into())
                    };
                    set_sync(
                        ctx,
                        "synced",
                        &format!(
                            "Connected: Lv.{}, {} water, {} streak",
                            field("level", "1"),
                            field("water", "0"),
                            field("streak", "0")
                        ),
                    );
                }
                Err(message) => set_sync(ctx, "error", &message),
            }
            refresh_all(ctx);
        });
    });
}

fn apply_profile(ctx: &Shared, data: &Value) {
    let Some(user) = data.get("user") else { return };
    let Some(discord_id) = user
        .get("discord_id")
        .map(|v| v.as_str().map(String::from).unwrap_or_else(|| v.to_string()))
    else {
        return;
    };
    let profile = data.get("profile");
    let text = |v: Option<&Value>| {
        v.and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from)
    };
    let number = |key: &str| user.get(key).and_then(Value::as_f64).unwrap_or(0.0);
    let avatar_url = {
        let mut app = ctx.app.borrow_mut();
        let previous = app.saved.profile.clone();
        let username = text(profile.and_then(|p| p.get("username")))
            .or_else(|| previous.as_ref().map(|p| p.username.clone()))
            .unwrap_or_else(|| format!("User#{}", &discord_id[discord_id.len().saturating_sub(4)..]));
        let avatar = text(profile.and_then(|p| p.get("avatar"))).or_else(|| previous.and_then(|p| p.avatar));
        app.saved.profile = Some(Profile {
            discord_id,
            username,
            avatar: avatar.clone(),
            level: number("level").max(1.0) as u32,
            water: number("water") as u64,
            streak: number("streak") as u32,
            total_focus_minutes: number("total_focus_minutes") as u64,
            total_sessions: number("total_sessions") as u64,
        });
        app.saved.save();
        let loaded = app.avatar.as_ref().map(|(url, _)| url.clone());
        avatar.filter(|url| loaded.as_deref() != Some(url.as_str()))
    };
    if let Some(url) = avatar_url {
        load_avatar(url);
    }
}

/// Fetches the Discord avatar on a worker thread, keeps a copy on disk and shows it.
fn load_avatar(url: String) {
    std::thread::spawn(move || {
        let path = state::data_dir().join("avatar.png");
        let fetch_url = url.replace(".webp", ".png");
        if let Some(bytes) = sync::download(&fetch_url) {
            let _ = std::fs::create_dir_all(state::data_dir());
            if std::fs::write(&path, bytes).is_err() {
                return;
            }
        } else if !path.exists() {
            return;
        }
        post(move |ctx| {
            if let Ok(image) = slint::Image::load_from_path(&path) {
                ctx.app.borrow_mut().avatar = Some((url, image));
                refresh_all(ctx);
            }
        });
    });
}

// ─── Links and windows ────────────────────────────────────

fn trusted_api_url(value: &str) -> Option<String> {
    let url = url::Url::parse(value).ok()?;
    let host = url.host_str()?;
    let trusted = (url.scheme() == "https" && TRUSTED_SYNC_HOSTS.contains(&host))
        || (cfg!(debug_assertions) && url.scheme() == "http" && host == "localhost");
    trusted.then(|| url.to_string())
}

fn handle_link(ctx: &Shared, link: &str) {
    let Ok(url) = url::Url::parse(link) else { return };
    let is_connect = url.scheme() == "pomo" && (url.host_str() == Some("connect") || url.path() == "/connect");
    if !is_connect {
        return;
    }
    let param = |name: &str| {
        url.query_pairs()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.to_string())
    };
    let Some(token) = param("token").map(|t| t.trim().to_string()).filter(|t| !t.is_empty()) else {
        return;
    };
    {
        let mut app = ctx.app.borrow_mut();
        app.saved.sync.token = token;
        app.saved.sync.api_url = param("apiUrl")
            .and_then(|v| trusted_api_url(&v))
            .unwrap_or_else(|| state::DEFAULT_API_URL.into());
        app.saved.sync.auto_sync = true;
        app.saved.save();
    }
    show_window(ctx);
    if let Some(ui) = ctx.ui.upgrade() {
        ui.set_view("account".into());
    }
    // Check the new connection right away so the profile shows without an extra click
    test_sync(ctx);
}

fn show_window(ctx: &Shared) {
    if let Some(ui) = ctx.ui.upgrade() {
        let _ = ui.show();
        ui.invoke_focus_shortcuts();
    }
}

fn set_compact(ctx: &Shared, compact: bool) {
    ctx.app.borrow_mut().compact = compact;
    if let Some(ui) = ctx.ui.upgrade() {
        ui.set_compact(compact);
        let size = if compact {
            LogicalSize::new(360.0, 440.0)
        } else {
            LogicalSize::new(1120.0, 760.0)
        };
        ui.window().set_size(size);
        let _ = ui.show();
    }
    ctx.last_tray_summary.borrow_mut().clear();
    refresh_all(ctx);
}

fn quit(ctx: &Shared) {
    ctx.quitting.set(true);
    ctx.app.borrow().saved.save();
    let _ = slint::quit_event_loop();
}

// ─── Startup ──────────────────────────────────────────────

fn main() -> Result<(), slint::PlatformError> {
    // Read the local time zone before any other thread starts (the time crate needs that on Unix)
    let local_offset = UtcOffset::current_local_offset().unwrap_or(UtcOffset::UTC);

    let args: Vec<String> = std::env::args().collect();
    let link = args.iter().find(|arg| arg.starts_with("pomo://")).cloned();
    let start_hidden = args.iter().any(|arg| arg == platform::HIDDEN_ARG);

    // Only one copy runs; a second launch (or a clicked pomo:// link) wakes the first one
    let message = link
        .as_ref()
        .map(|l| format!("link {l}"))
        .unwrap_or_else(|| "show".into());
    if platform::forward_to_running(&message) {
        return Ok(());
    }

    #[cfg(feature = "snapshot")]
    let snapshot_window = std::env::var("POMO_SNAPSHOT")
        .ok()
        .map(|path| (path, snapshot::install()));
    #[cfg(not(feature = "snapshot"))]
    let snapshot_window: Option<()> = None;

    if snapshot_window.is_none() {
        platform::init_identity();
        platform::register_protocol();
        idle::start();
        // Matches the .desktop file, so Wayland shows our icon and groups the window under it
        let _ = slint::set_xdg_app_id("pomo-focus");
    }

    let first_run = !Saved::exists();
    let mut saved = Saved::load();
    if first_run && migrate::from_electron(&mut saved) {
        saved.save();
    }
    let ui = AppWindow::new()?;
    ui.window().set_size(LogicalSize::new(1120.0, 760.0));
    let mut app = App {
        saved,
        mode: Mode::Focus,
        status: Status::Ready,
        remaining: Duration::ZERO,
        deadline: None,
        active: None,
        title: "Desktop Focus".into(),
        subject: 0,
        pending_idle: None,
        sync_status: "idle".into(),
        sync_message: "Connect with Discord to sync completed focus sessions.".into(),
        compact: false,
        startup_on: platform::startup_enabled(),
        avatar: None,
        local_offset,
    };
    app.remaining = app.total();
    let avatar_url = app.saved.profile.as_ref().and_then(|p| p.avatar.clone());

    let ctx: Shared = Rc::new(Ctx {
        app: RefCell::new(app),
        ui: ui.as_weak(),
        tray: RefCell::new(None),
        last_tray_summary: RefCell::new(String::new()),
        quitting: Cell::new(false),
    });
    CTX.with(|cell| *cell.borrow_mut() = Some(ctx.clone()));

    // Tray: closing the window only hides it while the tray icon is there to bring it back
    // The off-screen snapshot window has no event loop for a tray icon
    let tray_result = if snapshot_window.is_some() {
        Err(slint::PlatformError::NoPlatform)
    } else {
        Tray::new()
    };
    let tray_ok = match tray_result {
        Ok(tray) => {
            let c = ctx.clone();
            tray.on_toggle_timer(move || {
                if c.app.borrow().status == Status::Running {
                    pause(&c)
                } else {
                    start(&c)
                }
            });
            let c = ctx.clone();
            tray.on_reset_timer(move || reset(&c, None));
            let c = ctx.clone();
            tray.on_show_window(move || show_window(&c));
            let c = ctx.clone();
            tray.on_toggle_compact(move || {
                let compact = !c.app.borrow().compact;
                set_compact(&c, compact);
            });
            tray.on_open_dashboard(|| platform::open_url(DASHBOARD_URL));
            let c = ctx.clone();
            tray.on_quit(move || quit(&c));
            let shown = tray.show().is_ok();
            *ctx.tray.borrow_mut() = Some(tray);
            shown
        }
        Err(_) => false,
    };

    let c = ctx.clone();
    ui.window().on_close_requested(move || {
        if c.quitting.get() || !tray_ok {
            c.app.borrow().saved.save();
            let _ = slint::quit_event_loop();
            CloseRequestResponse::HideWindow
        } else {
            CloseRequestResponse::HideWindow
        }
    });

    // UI callbacks
    let c = ctx.clone();
    ui.on_start_timer(move || start(&c));
    let c = ctx.clone();
    ui.on_pause_timer(move || pause(&c));
    let c = ctx.clone();
    ui.on_reset_timer(move || reset(&c, None));
    let c = ctx.clone();
    ui.on_switch_mode(move |index| reset(&c, Some(Mode::from_index(index))));
    let c = ctx.clone();
    ui.on_start_next(move || {
        let next = c.app.borrow().next_mode();
        reset(&c, Some(next));
    });
    let c = ctx.clone();
    ui.on_toggle_compact(move || {
        let compact = !c.app.borrow().compact;
        set_compact(&c, compact);
    });
    let c = ctx.clone();
    ui.on_set_subject(move |index| {
        c.app.borrow_mut().subject = (index.max(0) as usize).min(SUBJECTS.len() - 1);
        refresh_all(&c);
    });
    let c = ctx.clone();
    ui.on_title_edited(move || {
        if let Some(ui) = c.ui.upgrade() {
            c.app.borrow_mut().title = ui.get_session_title().to_string();
        }
    });
    let c = ctx.clone();
    ui.on_confirm_idle(move || {
        let pending = c.app.borrow_mut().pending_idle.take();
        if let Some(p) = pending {
            credit(&c, p.session, p.minutes, p.title, p.subject);
        }
    });
    let c = ctx.clone();
    ui.on_discard_idle(move || {
        c.app.borrow_mut().pending_idle = None;
        set_sync(
            &c,
            "off",
            "Idle session discarded. No local stats or rewards were added.",
        );
        refresh_all(&c);
    });
    let c = ctx.clone();
    ui.on_retry(move |id: SharedString| retry(&c, id.as_str()));
    let c = ctx.clone();
    ui.on_set_minutes(move |kind, value| {
        {
            let mut app = c.app.borrow_mut();
            let mode = Mode::from_index(kind);
            let min = if mode == Mode::Focus { 5 } else { 1 };
            let value = (value.max(0) as u32).clamp(min, 100);
            match mode {
                Mode::Focus => app.saved.settings.focus = value,
                Mode::ShortBreak => app.saved.settings.short_break = value,
                Mode::LongBreak => app.saved.settings.long_break = value,
            }
            if app.status != Status::Running && app.mode == mode {
                app.remaining = app.total();
            }
            app.saved.save();
        }
        refresh_all(&c);
    });
    let c = ctx.clone();
    ui.on_set_startup(move |enabled| {
        if platform::startup_in_os_settings() {
            platform::open_startup_settings();
            return;
        }
        let applied = platform::set_startup(enabled);
        c.app.borrow_mut().startup_on = applied;
        refresh_all(&c);
    });
    let c = ctx.clone();
    ui.on_set_idle_guard(move |enabled| {
        {
            let mut app = c.app.borrow_mut();
            app.saved.idle_guard = enabled;
            app.saved.save();
        }
        refresh_all(&c);
    });
    let c = ctx.clone();
    ui.on_set_auto_sync(move |enabled| {
        {
            let mut app = c.app.borrow_mut();
            app.saved.sync.auto_sync = enabled;
            app.saved.save();
        }
        refresh_all(&c);
    });
    ui.on_test_notification(|| platform::notify("Notifications are on", "Pomo will remind you when a session ends."));
    let c = ctx.clone();
    ui.on_test_sync(move || test_sync(&c));
    ui.on_open_url(|url| platform::open_url(url.as_str()));
    ui.on_connect(|| platform::open_url(CONNECT_URL));
    let c = ctx.clone();
    ui.on_manual_changed(move || {
        if let Some(ui) = c.ui.upgrade() {
            let mut app = c.app.borrow_mut();
            app.saved.sync.api_url = ui.get_api_url().trim().to_string();
            app.saved.sync.token = ui.get_token().trim().to_string();
            app.saved.save();
        }
    });

    // Later launches and pomo:// links arrive here
    platform::listen(|message| {
        post(move |ctx| match message.strip_prefix("link ") {
            Some(link) => handle_link(ctx, link),
            None => show_window(ctx),
        });
    });

    let c = ctx.clone();
    let timer = slint::Timer::default();
    timer.start(slint::TimerMode::Repeated, Duration::from_millis(250), move || tick(&c));

    refresh_all(&ctx);
    #[cfg(feature = "snapshot")]
    if let Some((path, window)) = snapshot_window {
        let view = std::env::var("POMO_VIEW").unwrap_or_else(|_| "timer".into());
        let (w, h) = std::env::var("POMO_SIZE")
            .ok()
            .and_then(|s| {
                s.split_once('x')
                    .map(|(w, h)| (w.parse().unwrap_or(1120), h.parse().unwrap_or(760)))
            })
            .unwrap_or((1120, 760));
        if view == "mini" {
            ctx.app.borrow_mut().compact = true;
            refresh_all(&ctx);
        } else {
            ui.set_view(view.into());
        }
        if std::env::var("POMO_RUNNING").is_ok() {
            start(&ctx);
            ctx.app.borrow_mut().deadline = Some(Instant::now() + Duration::from_secs(17 * 60 + 42));
            refresh_all(&ctx);
        }
        ui.show()?;
        snapshot::render(&window, &path, w, h);
        return Ok(());
    }
    if let Some(url) = avatar_url {
        load_avatar(url);
    }
    if !start_hidden || !tray_ok {
        ui.show()?;
        ui.invoke_focus_shortcuts();
    }
    if let Some(link) = link {
        handle_link(&ctx, &link);
    }

    slint::run_event_loop_until_quit()?;
    ctx.app.borrow().saved.save();
    Ok(())
}
