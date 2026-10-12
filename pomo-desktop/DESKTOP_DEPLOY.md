# Pomo Desktop Deployment

## Local Build

Create the website installer:

```bash
cd pomo-desktop
npm run package:win
```

From the repo root, copy the installer to the web public download path:

```powershell
Copy-Item -LiteralPath "pomo-desktop\release\Pomo Focus-1.0.3-x64.exe" -Destination "pomofocus-web\public\downloads\Pomo-Focus-Setup.exe" -Force
```

The copied installer is intentionally ignored by git.

## VDS Upload

First update the VDS and create the download folder:

```bash
cd <repo-path>
git pull
mkdir -p <repo-path>/apps/web/public/downloads
```

Then upload the installer from your PC to the VDS:

```powershell
scp ".\apps\web\public\downloads\Pomo-Focus-Setup.exe" <user>@<your-server>:<repo-path>/apps/web/public/downloads/Pomo-Focus-Setup.exe
```

Finally build and restart the website on the VDS:

```bash
cd <repo-path>/apps/web
npm run build
pm2 restart pomofocus-web
```

Download URL:

```text
https://pomofocus.online/downloads/Pomo-Focus-Setup.exe
```

Landing page:

```text
https://pomofocus.online/desktop
```

## Microsoft Store Build

Create the Store package:

```bash
cd pomo-desktop
npm run package:store
```

Upload this file in Partner Center:

```text
release/Pomo Focus-Store-1.0.3-x64.appx
```
