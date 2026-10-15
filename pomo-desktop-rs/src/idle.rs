//! How long the user has been away from mouse and keyboard.
//!
//! Windows asks the system directly. On Linux, GNOME answers over D-Bus, and
//! Wayland desktops like KDE tell us through the ext-idle-notify protocol, which
//! a small background thread listens to.
#[cfg(target_os = "linux")]
mod wayland {
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    use wayland_client::globals::{GlobalListContents, registry_queue_init};
    use wayland_client::protocol::{wl_registry, wl_seat};
    use wayland_client::{Connection, Dispatch, QueueHandle};
    use wayland_protocols::ext::idle_notify::v1::client::{
        ext_idle_notification_v1::{self, ExtIdleNotificationV1},
        ext_idle_notifier_v1::ExtIdleNotifierV1,
    };

    // The compositor tells us once the user has been idle this long; anything shorter does not matter here
    const STEP: Duration = Duration::from_secs(60);

    pub static IDLE_SINCE: Mutex<Option<Instant>> = Mutex::new(None);
    pub static AVAILABLE: Mutex<bool> = Mutex::new(false);

    struct State;

    impl Dispatch<wl_registry::WlRegistry, GlobalListContents> for State {
        fn event(
            _: &mut Self,
            _: &wl_registry::WlRegistry,
            _: wl_registry::Event,
            _: &GlobalListContents,
            _: &Connection,
            _: &QueueHandle<Self>,
        ) {
        }
    }
    impl Dispatch<wl_seat::WlSeat, ()> for State {
        fn event(_: &mut Self, _: &wl_seat::WlSeat, _: wl_seat::Event, _: &(), _: &Connection, _: &QueueHandle<Self>) {}
    }
    impl Dispatch<ExtIdleNotifierV1, ()> for State {
        fn event(
            _: &mut Self,
            _: &ExtIdleNotifierV1,
            _: <ExtIdleNotifierV1 as wayland_client::Proxy>::Event,
            _: &(),
            _: &Connection,
            _: &QueueHandle<Self>,
        ) {
        }
    }
    impl Dispatch<ExtIdleNotificationV1, ()> for State {
        fn event(
            _: &mut Self,
            _: &ExtIdleNotificationV1,
            event: ext_idle_notification_v1::Event,
            _: &(),
            _: &Connection,
            _: &QueueHandle<Self>,
        ) {
            let mut since = IDLE_SINCE.lock().unwrap();
            match event {
                ext_idle_notification_v1::Event::Idled => *since = Instant::now().checked_sub(STEP),
                ext_idle_notification_v1::Event::Resumed => *since = None,
                _ => {}
            }
        }
    }

    pub fn start() {
        std::thread::spawn(|| {
            let Ok(conn) = Connection::connect_to_env() else { return };
            let Ok((globals, mut queue)) = registry_queue_init::<State>(&conn) else {
                return;
            };
            let qh = queue.handle();
            let Ok(notifier) = globals.bind::<ExtIdleNotifierV1, _, _>(&qh, 1..=1, ()) else {
                return;
            };
            let Ok(seat) = globals.bind::<wl_seat::WlSeat, _, _>(&qh, 1..=1, ()) else {
                return;
            };
            let _notification = notifier.get_idle_notification(STEP.as_millis() as u32, &seat, &qh, ());
            *AVAILABLE.lock().unwrap() = true;
            let mut state = State;
            while queue.blocking_dispatch(&mut state).is_ok() {}
            *AVAILABLE.lock().unwrap() = false;
        });
    }
}

#[cfg(target_os = "linux")]
fn dbus_idle_seconds() -> Option<u64> {
    let conn = zbus::blocking::Connection::session().ok()?;
    // GNOME (milliseconds)
    if let Ok(reply) = conn.call_method(
        Some("org.gnome.Mutter.IdleMonitor"),
        "/org/gnome/Mutter/IdleMonitor/Core",
        Some("org.gnome.Mutter.IdleMonitor"),
        "GetIdletime",
        &(),
    ) && let Ok(ms) = reply.body().deserialize::<u64>()
    {
        return Some(ms / 1000);
    }
    // Older KDE and other desktops on X11 (seconds)
    let reply = conn
        .call_method(
            Some("org.freedesktop.ScreenSaver"),
            "/org/freedesktop/ScreenSaver",
            Some("org.freedesktop.ScreenSaver"),
            "GetSessionIdleTime",
            &(),
        )
        .ok()?;
    reply.body().deserialize::<u32>().ok().map(u64::from)
}

/// Starts whatever background listening the platform needs. Call once at startup.
pub fn start() {
    #[cfg(target_os = "linux")]
    wayland::start();
}

/// Seconds since the last mouse or keyboard input, or 0 when the system cannot tell.
pub fn idle_seconds() -> u64 {
    #[cfg(target_os = "linux")]
    {
        if *wayland::AVAILABLE.lock().unwrap() {
            return wayland::IDLE_SINCE
                .lock()
                .unwrap()
                .map(|since| since.elapsed().as_secs())
                .unwrap_or(0);
        }
        dbus_idle_seconds().unwrap_or(0)
    }
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::SystemInformation::GetTickCount;
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
        let mut info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        // SAFETY: info is a valid, correctly sized LASTINPUTINFO
        unsafe {
            if GetLastInputInfo(&mut info) != 0 {
                return u64::from(GetTickCount().wrapping_sub(info.dwTime)) / 1000;
            }
        }
        0
    }
    #[cfg(not(any(target_os = "linux", windows)))]
    {
        0
    }
}
