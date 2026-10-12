# Pomo Desktop

Desktop companion app for PomoBot.

## Product Direction

The desktop app should not replace the Discord bot or the web dashboard. It should make daily focus easier when the user is already on their computer.

Core idea:

- Fast local Pomodoro timer
- Discord account connection
- Sync focus sessions with PomoBot account
- Desktop notifications
- Tray / mini timer mode
- Quick links to dashboard, garden, server setup, and support

## Why This App Should Exist

PomoBot works inside Discord. The desktop app should cover the moments where the user wants to focus without typing commands or keeping Discord open.

Best first version:

1. Open the app
2. Start a focus session instantly
3. See session progress in a clean desktop UI
4. Get a notification when the session ends
5. Open dashboard/garden from the app

## Roadmap

### Step 1 - Clean Desktop MVP

- Electron + React app shell
- Focus timer screen
- Break timer screen
- Start, pause, resume, and reset controls
- Desktop notifications
- Dashboard/support links
- Local settings for timer lengths
- Local daily focus/session stats

### Step 2 - Discord Login

- OAuth login with Discord
- Show connected Discord profile
- Keep auth token secure on desktop
- Logout flow

### Step 3 - Pomo Sync

- Send completed desktop sessions to the web backend
- Reward Water / XP / streak through the same rules as web sessions
- Show recent sessions and today's focus total

### Step 4 - Desktop-Only Features

- Tray timer
- Always-on-top mini mode
- Start/pause/resume from tray
- Optional launch on startup
- Optional idle warning before crediting long sessions

### Step 5 - Store Release

- Microsoft Store-ready packaging
- Updated screenshots
- Privacy policy and app description
- Stable auto-update plan

## Technical Direction

- Electron for desktop shell
- Vite + React for UI
- TypeScript for app safety
- No bot token in the desktop app
- Discord OAuth only through user login
- Backend sync should go through `pomofocus-web` API routes

## Important Rule

The desktop app must never directly access the Discord bot token or database. It should talk to the web backend with a normal logged-in user session.

## Local Development

Install dependencies inside this folder:

```bash
npm install
```

Run the full desktop app in development:

```bash
npm run dev:electron
```

Or run only the Vite app preview:

```bash
npm run dev
```

`npm run dev` opens only the browser preview. Use `npm run dev:electron` when testing the real Electron window.

Build the renderer:

```bash
npm run build
```

Build an unpacked Windows app for local testing:

```bash
npm run package:dir
```

Then open the built Electron app:

```bash
npm start
```

## Current MVP Status

Implemented:

- Local focus / short break / long break timer
- Start, pause, resume, reset
- Session progress bar
- Local timer settings
- Local daily focus stats
- Local recent sessions list with sync status
- Retry button for sessions that failed or were saved locally
- Desktop notification bridge
- Manual desktop token sync settings
- Clear sync error messages for expired tokens, bad API URLs, network errors, and server issues
- Connected profile preview after Test Sync or a successful session sync
- `pomo://connect` deep-link token handoff
- Completed focus session sync through `/api/desktop/session`
- System tray mode with show/dashboard/quit menu
- Tray tooltip with current timer status
- Tray Start / Pause / Resume / Reset controls
- Always-on-top mini mode from the app or tray menu
- Optional launch on startup
- Idle Guard confirmation before crediting long-idle focus sessions
- Keyboard shortcuts for start/pause, reset, and mini mode
- Dashboard, support, and Top.gg links

Not implemented yet:

- One-click Discord OAuth login inside the desktop app
- Microsoft Store packaging
- Release checklist in `STORE_RELEASE.md`

## Sync Test Flow

1. Deploy `pomofocus-web`.
2. Open `https://pomofocus.online/dashboard/desktop`.
3. Click **Open Pomo Desktop**.
4. If the protocol opens the app, the token is filled automatically.
5. If the protocol is not registered yet, copy the manual token and paste it into **Pomo Sync**.
6. Click **Test Sync**.
7. Complete a focus session and check the dashboard history.

The current one-click flow uses a temporary desktop token in a custom protocol link. Store packaging should register this protocol permanently.
