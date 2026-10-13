# Pomo Desktop Store Release Checklist

## Local Package Checks

1. Run `npm run build`.
2. Run `npm run package:dir`.
3. Open `release/win-unpacked/Pomo Focus.exe`.
4. Check timer, mini mode, tray mode, startup toggle, Connect with Discord, and notifications.

## Build Outputs

### Website Download

Run:

```bash
npm run package:win
```

Use the generated installer from `release/Pomo Focus-1.1.0-x64.exe`.

### Microsoft Store

Run:

```bash
npm run package:store
```

Upload `release/Pomo Focus-Store-1.1.0-x64.appx` to Partner Center.

Store identity values are already configured in `package.json`:

- Package/Identity/Name: `TunarJamalov.PomoFocus`
- Package/Identity/Publisher: `CN=7C2E844A-EDF5-457F-A6D2-E8EB405DD965`
- PublisherDisplayName: `Tunar Jamalov`
- Store ID: `9PDMHQ05QR55`
- Web Store URL: https://apps.microsoft.com/detail/9PDMHQ05QR55

## Microsoft Store Prep

- App name: Pomo Focus
- Category: Education / Productivity
- Age rating: 3+
- Privacy policy: https://pomofocus.online/privacy
- Support URL: https://pomofocus.online/support
- Website: https://pomofocus.online

## Store Text

### Short Description

A clean Pomodoro desktop companion for PomoBot with focus timers, reminders, tray mode, mini mode, and optional profile sync.

### Description

Pomo Focus helps you start focused study sessions without typing Discord commands. Use a clean Pomodoro timer, pause or resume sessions, receive desktop notifications, keep the timer in your system tray, and switch into a small always-on-top mini mode while you work.

If you use PomoBot on Discord, press Connect with Discord to link the app in a few seconds. Completed focus sessions then sync to your profile for Water, XP, streaks, and history. The app never asks for your Discord password or bot token.

### Feature Bullets

- Focus, short break, and long break timers
- Desktop notifications when sessions finish
- System tray timer controls
- Always-on-top mini timer mode
- Optional launch on startup
- Idle Guard confirmation for long idle sessions
- Recent session history with retry sync
- Optional PomoBot profile sync through pomofocus.online

### What's New in 1.1.0

- One-click Connect with Discord: sign in on the website and the app links itself
- Fixed the connect link not opening the Microsoft Store version of the app
- Connections now last 180 days instead of expiring after a few hours
- Clearer setup steps and connection status

## Assets

- Square app icon: `assets/icon.ico`
- Store logo: `assets/store-logo.png`
- AppX tile icons: `build/appx/`
- PNG icon sizes: `assets/icon-16.png` through `assets/icon-512.png`

## Screenshots Needed

- Screenshot: main timer
- Screenshot: mini mode
- Screenshot: sync/profile panel
- Screenshot: dashboard connection page

## Before Submission

- Remove test tokens from screenshots.
- Install the Store package and confirm Connect with Discord on pomofocus.online/dashboard/desktop opens the app and shows your profile.
- Confirm the app never asks for a Discord password.
- Confirm sync goes through `pomofocus-web` API only.
- Confirm closing the app keeps it in the tray.
- Confirm Quit exits fully from the tray menu.
