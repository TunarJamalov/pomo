# Contributing to Pomo

Thanks for helping! A few things keep the project easy to work on.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Ask questions in the support server: https://discord.gg/XEubrrkBmB

## Ground rules

- **Never break existing user data.** Database changes must be additive only:
  new tables or `ALTER TABLE ... ADD COLUMN` wrapped in `try/catch`.
  No dropping, renaming or rewriting columns.
- **No secrets in commits.** `.env` files, database files and backups are ignored by
  `.gitignore`; keep it that way.
- **Match the code around you.** CommonJS in the bot, TypeScript in the website,
  same naming and comment style.

## Translations

User-facing bot text lives in `apps/bot/utils/i18n.js`. Add new strings to English
first; other languages fall back to English until they're translated. Translation
fixes from native speakers are very welcome.

## Pull requests

1. Fork and create a branch from `main`.
2. Run the bot tests: `cd apps/bot && npm test`.
3. If you touched the website, run `cd apps/web && npx tsc --noEmit`.
4. Describe what changed and how you tested it. Screenshots help for UI changes.
5. Sign the [Contributor License Agreement](CLA.md) by ticking the box in the
   pull request template. You only do this once.

## License of contributions

Pomo is released under the AGPL-3.0. Before a pull request can be merged, its
author needs to agree to the [Pomo CLA](CLA.md). You keep the copyright to your
work; the CLA lets the maintainer run the hosted Pomo service, offer paid plans
and, if ever needed, release future versions under other licenses. Versions
already published under the AGPL-3.0 always stay available under it.
