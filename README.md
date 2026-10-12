# Pomo — focus timer, garden and habit tracker for Discord

Pomo is a Discord bot that turns studying into a small game: run Pomodoro sessions
alone, with friends or in voice channels, earn water, grow a garden, keep streaks,
track habits and climb leaderboards. It also has a website dashboard, a Discord
Activity and a desktop app.

- Add Pomo to your server: https://pomofocus.online
- Support server: https://discord.gg/XEubrrkBmB

## What's inside

| Path | What it is |
|---|---|
| `apps/bot` | The Discord bot (discord.js 14, CommonJS, SQLite via better-sqlite3) |
| `apps/web` | Website, dashboard and Discord Activity (Next.js, NextAuth, Tailwind) |
| `packages/db`, `packages/domain`, `packages/shared` | Shared data access and types |
| `pomo-desktop` | Desktop app (Electron + Vite) |

The bot and the website share one SQLite database file.

## Features

- `/pomodoro`, `/study`, `/team`, `/voice`: solo, group and voice-channel focus sessions
- `/garden`, `/market`, `/pet`: spend the water you earn on plants and pets
- `/habit`: a habit tracker with streaks and a grid of days
- `/streak`, `/quests`, `/achievements`, `/season`, `/leaderboard`
- `/todo`, `/plan`, `/exam`, `/goal`: study planning
- 10 languages (`apps/bot/utils/i18n.js`)

## Running it yourself

Requirements: Node.js 20 or newer, and a Discord application with a bot user
(https://discord.com/developers/applications).

```bash
git clone <this repo>
cd PomoDepo
npm install
```

### Bot

```bash
cd apps/bot
cp .env.example .env      # fill in TOKEN, CLIENT_ID and OWNER_ID at least
npm run deploy            # registers the slash commands
npm start
```

Everything else in `.env.example` is optional: Top.gg votes, Boosty supporter
checks, log channels and custom progress-bar emojis.

### Website

```bash
cd apps/web
cp .env.example .env      # NEXTAUTH_SECRET, DISCORD_CLIENT_ID/SECRET, POMODORO_DB_PATH
npm run dev               # http://localhost:3000
```

Point `POMODORO_DB_PATH` at the same file the bot uses
(`apps/bot/data/pomodoro.db` by default).

### Tests

```bash
cd apps/bot && npm test
```

Tests use their own temporary databases and never touch `apps/bot/data`.

## Contributing

Bug reports, translations and pull requests are welcome. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) first. Security issues: see
[SECURITY.md](SECURITY.md).

## License

Copyright (C) 2025-2026 Tunar Jamalov (AzeDev)

Pomo is free software under the [GNU Affero General Public License v3.0](LICENSE).
You may run, study, change and share it. If you run a modified version as a
public service (a bot or a website), you must publish your changes under the
same license.

The AGPL covers the source code only:

- **Logo and artwork** (images of plants, pets, badges and the Pomo logo) were made
  for Pomo and are **not** under the AGPL. All rights reserved; you can use them
  to run and test the code, but not in your own public bot or product.
- **Ambient sounds** in `assets/ambient` and `public/audio` are royalty-free tracks.
- The name "Pomo" identifies the official bot. If you run your own public copy,
  please give it a different name and avatar so users don't mix the two up.
