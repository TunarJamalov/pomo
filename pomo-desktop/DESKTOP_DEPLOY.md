# Pomo Desktop Deployment

## Build

No Windows machine is needed: GitHub Actions builds every package.

1. Bump `version` in `pomo-desktop/package.json` and push.
2. Run the workflow:

```bash
gh workflow run desktop-build.yml
gh run watch "$(gh run list --workflow desktop-build.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

3. Download both artifacts:

```bash
gh run download <run-id> -D release-ci
```

- `pomo-desktop-windows`: `Pomo Focus-Store-<version>-x64.appx` (Partner Center) and `Pomo Focus-<version>-x64.exe`
- `pomo-desktop-linux`: `Pomo-Focus-<version>-x86_64.AppImage` and `pomo-focus_<version>_amd64.deb`

Linux packages can also be built locally on Linux with `npx electron-builder --linux AppImage deb --publish never`.

## Website Downloads (GitHub Release)

The website links to `https://github.com/TunarJamalov/pomo/releases/latest/download/<name>`, so the
files must be attached to the newest release of the public repo under these fixed names:

| Build file | Release asset name |
| --- | --- |
| `Pomo Focus-<version>-x64.exe` | `Pomo-Focus-Setup.exe` |
| `Pomo-Focus-<version>-x86_64.AppImage` | `Pomo-Focus.AppImage` |
| `pomo-focus_<version>_amd64.deb` | `pomo-focus_amd64.deb` |

```bash
cp "release-ci/pomo-desktop-windows/Pomo Focus-<version>-x64.exe" release-ci/Pomo-Focus-Setup.exe
cp release-ci/pomo-desktop-linux/Pomo-Focus-<version>-x86_64.AppImage release-ci/Pomo-Focus.AppImage
cp release-ci/pomo-desktop-linux/pomo-focus_<version>_amd64.deb release-ci/pomo-focus_amd64.deb
gh release create desktop-v<version> --repo TunarJamalov/pomo --title "Pomo Focus Desktop <version>" \
  --notes "..." release-ci/Pomo-Focus-Setup.exe release-ci/Pomo-Focus.AppImage release-ci/pomo-focus_amd64.deb
```

`NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL` overrides the Windows link; leave it unset to use the release.

Landing page:

```text
https://pomofocus.online/desktop
```

## Microsoft Store

Upload `Pomo Focus-Store-<version>-x64.appx` in Partner Center (see `STORE_RELEASE.md`).
