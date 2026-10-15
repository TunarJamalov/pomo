//! Operating system glue: links, notifications, launch on startup, the pomo:// link
//! handler and making sure only one copy of the app runs.
use std::io::{BufRead, BufReader, Write};

pub const HIDDEN_ARG: &str = "--hidden";
const SOCKET_NAME: &str = "online.pomofocus.desktop.sock";

pub fn open_url(url: &str) {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return;
    }
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    #[cfg(windows)]
    let _ = std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn();
}

pub fn notify(title: &str, body: &str) {
    let (title, body) = (title.to_string(), body.to_string());
    std::thread::spawn(move || {
        let mut notification = notify_rust::Notification::new();
        notification
            .appname("Pomo Focus")
            .summary(&title)
            .body(&body)
            .icon("pomo-focus");
        // Without a sound name, the Windows toast library asks for a silent notification
        #[cfg(windows)]
        notification
            .app_id(&windows::notification_app_id())
            .sound_name("Default");
        let _ = notification.show();
    });
}

/// The program to start again: the .AppImage file itself when running from one.
fn launch_target() -> String {
    std::env::var("APPIMAGE")
        .ok()
        .or_else(|| std::env::current_exe().ok().map(|path| path.display().to_string()))
        .unwrap_or_default()
}

#[cfg(target_os = "linux")]
mod linux {
    use std::path::PathBuf;

    const ICON: &[u8] = include_bytes!("../assets/icon-512.png");

    fn config_home() -> PathBuf {
        dirs::config_dir().unwrap_or_default()
    }

    fn data_home() -> PathBuf {
        dirs::data_dir().unwrap_or_default()
    }

    pub fn autostart_file() -> PathBuf {
        config_home().join("autostart").join("pomo-focus.desktop")
    }

    fn quote(value: &str) -> String {
        let escaped: String = value
            .chars()
            .flat_map(|c| {
                if matches!(c, '"' | '`' | '$' | '\\') {
                    vec!['\\', c]
                } else {
                    vec![c]
                }
            })
            .collect();
        format!("\"{escaped}\"")
    }

    fn icon_path() -> PathBuf {
        let path = crate::state::data_dir().join("icon.png");
        if !path.exists() {
            let _ = std::fs::create_dir_all(crate::state::data_dir());
            let _ = std::fs::write(&path, ICON);
        }
        path
    }

    fn entry(exec: &str, extra: &[&str]) -> String {
        let mut lines = vec![
            "[Desktop Entry]".to_string(),
            "Type=Application".into(),
            "Name=Pomo Focus".into(),
            "Comment=Pomodoro focus timer for Pomo on Discord".into(),
            format!("Exec={exec}"),
            format!("Icon={}", icon_path().display()),
            "Terminal=false".into(),
            "Categories=Education;Utility;".into(),
            "StartupWMClass=pomo-focus".into(),
        ];
        lines.extend(extra.iter().map(|line| line.to_string()));
        lines.push(String::new());
        lines.join("\n")
    }

    fn write_if_changed(path: &PathBuf, content: &str) -> bool {
        if std::fs::read_to_string(path).ok().as_deref() == Some(content) {
            return false;
        }
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        std::fs::write(path, content).is_ok()
    }

    pub fn set_startup(enabled: bool) -> bool {
        let file = autostart_file();
        if !enabled {
            let _ = std::fs::remove_file(&file);
            return false;
        }
        let exec = format!("{} {}", quote(&super::launch_target()), super::HIDDEN_ARG);
        write_if_changed(&file, &entry(&exec, &["X-GNOME-Autostart-enabled=true"]));
        file.exists()
    }

    /// The .deb registers pomo:// when installed; an AppImage has to do it on first run.
    pub fn register_protocol() {
        if std::env::var_os("APPIMAGE").is_none() {
            return;
        }
        let name = "pomo-focus-appimage.desktop";
        let file = data_home().join("applications").join(name);
        let exec = format!("{} %U", quote(&super::launch_target()));
        if write_if_changed(&file, &entry(&exec, &["MimeType=x-scheme-handler/pomo;"])) {
            let _ = std::process::Command::new("xdg-mime")
                .args(["default", name, "x-scheme-handler/pomo"])
                .status();
            let _ = std::process::Command::new("update-desktop-database")
                .arg(data_home().join("applications"))
                .status();
        }
        // A moved or updated AppImage would leave launch on startup pointing at the old file
        if autostart_file().exists() {
            set_startup(true);
        }
    }
}

#[cfg(windows)]
mod windows {
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;

    const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const VALUE: &str = "Pomo Focus";
    /// Identity for notifications and the taskbar when installed with Pomo-Focus-Setup.exe
    pub const AUMID: &str = "online.pomofocus.desktop";
    const ICON: &[u8] = include_bytes!("../assets/icon-128.png");

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// True when running from the Microsoft Store (MSIX) package.
    pub fn packaged() -> bool {
        use windows_sys::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;
        let mut len: u32 = 0;
        // SAFETY: asking for the length only; a package exists when the buffer is too small (122)
        unsafe { GetCurrentPackageFullName(&mut len, std::ptr::null_mut()) == 122 }
    }

    /// The package's own identity, which Windows needs to show its notifications.
    fn package_aumid() -> Option<String> {
        use windows_sys::Win32::Storage::Packaging::Appx::GetCurrentApplicationUserModelId;
        let mut len: u32 = 0;
        // SAFETY: the first call reports the length, the second fills a buffer of that length
        unsafe {
            GetCurrentApplicationUserModelId(&mut len, std::ptr::null_mut());
            if len == 0 {
                return None;
            }
            let mut buffer = vec![0u16; len as usize];
            if GetCurrentApplicationUserModelId(&mut len, buffer.as_mut_ptr()) != 0 {
                return None;
            }
            Some(String::from_utf16_lossy(&buffer[..len.saturating_sub(1) as usize]))
        }
    }

    /// Who notifications come from. The installer version registers its name and icon first.
    pub fn notification_app_id() -> String {
        if packaged() {
            return package_aumid().unwrap_or_else(|| AUMID.into());
        }
        let icon = crate::state::data_dir().join("icon.png");
        if !icon.exists() {
            let _ = std::fs::create_dir_all(crate::state::data_dir());
            let _ = std::fs::write(&icon, ICON);
        }
        if let Ok((key, _)) =
            RegKey::predef(HKEY_CURRENT_USER).create_subkey(format!(r"Software\Classes\AppUserModelId\{AUMID}"))
        {
            let _ = key.set_value("DisplayName", &"Pomo Focus");
            let _ = key.set_value("IconUri", &icon.display().to_string());
        }
        AUMID.into()
    }

    /// Groups the window and tray under Pomo Focus instead of a generic program.
    pub fn set_app_identity() {
        if packaged() {
            return;
        }
        use windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
        let id = wide(AUMID);
        // SAFETY: id is a valid, NUL-terminated UTF-16 string that outlives the call
        unsafe {
            SetCurrentProcessExplicitAppUserModelID(id.as_ptr());
        }
    }

    pub fn startup_enabled() -> bool {
        RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(RUN_KEY)
            .and_then(|key| key.get_value::<String, _>(VALUE))
            .is_ok()
    }

    pub fn set_startup(enabled: bool) -> bool {
        let Ok((key, _)) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(RUN_KEY) else {
            return false;
        };
        if enabled {
            let _ = key.set_value(VALUE, &format!("\"{}\" {}", super::launch_target(), super::HIDDEN_ARG));
        } else {
            let _ = key.delete_value(VALUE);
        }
        startup_enabled()
    }

    /// The Store package registers pomo:// in its manifest; the installer version does it here.
    pub fn register_protocol() {
        if packaged() {
            return;
        }
        let exe = super::launch_target();
        let Ok((key, _)) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(r"Software\Classes\pomo") else {
            return;
        };
        let _ = key.set_value("", &"URL:Pomo Focus");
        let _ = key.set_value("URL Protocol", &"");
        if let Ok((command, _)) = key.create_subkey(r"shell\open\command") {
            let _ = command.set_value("", &format!("\"{exe}\" \"%1\""));
        }
    }
}

/// In the Microsoft Store version, Windows itself decides what starts at sign-in
/// (Settings, Apps, Startup); the app can only open that page.
pub fn startup_in_os_settings() -> bool {
    #[cfg(windows)]
    return windows::packaged();
    #[allow(unreachable_code)]
    false
}

pub fn open_startup_settings() {
    #[cfg(windows)]
    let _ = std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", "ms-settings:startupapps"])
        .spawn();
}

/// Sets up the app's identity with the system. Call once at startup, before any window.
pub fn init_identity() {
    #[cfg(windows)]
    windows::set_app_identity();
}

pub fn startup_enabled() -> bool {
    #[cfg(target_os = "linux")]
    return linux::autostart_file().exists();
    #[cfg(windows)]
    return windows::startup_enabled();
    #[allow(unreachable_code)]
    false
}

pub fn set_startup(enabled: bool) -> bool {
    #[cfg(target_os = "linux")]
    return linux::set_startup(enabled);
    #[cfg(windows)]
    return windows::set_startup(enabled);
    #[allow(unreachable_code)]
    {
        let _ = enabled;
        false
    }
}

pub fn register_protocol() {
    #[cfg(target_os = "linux")]
    linux::register_protocol();
    #[cfg(windows)]
    windows::register_protocol();
}

/// Hands `message` to an already running copy. Returns false when this is the only one.
pub fn forward_to_running(message: &str) -> bool {
    use interprocess::local_socket::{GenericNamespaced, Stream, ToNsName, traits::Stream as _};
    let Ok(name) = SOCKET_NAME.to_ns_name::<GenericNamespaced>() else {
        return false;
    };
    match Stream::connect(name) {
        Ok(mut stream) => {
            let _ = stream.write_all(format!("{message}\n").as_bytes());
            let _ = stream.flush();
            true
        }
        Err(_) => false,
    }
}

/// Listens for messages from copies started later (a second launch, a pomo:// link).
pub fn listen(on_message: impl Fn(String) + Send + 'static) {
    use interprocess::local_socket::{GenericNamespaced, ListenerOptions, ToNsName, traits::ListenerExt as _};
    std::thread::spawn(move || {
        let Ok(name) = SOCKET_NAME.to_ns_name::<GenericNamespaced>() else {
            return;
        };
        let Ok(listener) = ListenerOptions::new().name(name).create_sync() else {
            return;
        };
        for stream in listener.incoming().filter_map(Result::ok) {
            let mut line = String::new();
            if BufReader::new(stream).read_line(&mut line).is_ok() {
                on_message(line.trim().to_string());
            }
        }
    });
}
