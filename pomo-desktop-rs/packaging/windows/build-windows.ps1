# Packages target\release\pomo-focus.exe for Windows (run from anywhere, after cargo build --release):
#   dist\Pomo-Focus-Store-<version>-x64.appx   unsigned MSIX for Partner Center (the Store signs it)
#   dist\Pomo-Focus-<version>-store-test.zip    the same package as a folder, for testing in Developer Mode
#   dist\Pomo-Focus-Setup.exe                   per-user installer for the website
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

$version = (Select-String -Path Cargo.toml -Pattern '^version = "(.*)"').Matches[0].Groups[1].Value
$exe = 'target\release\pomo-focus.exe'
if (-not (Test-Path $exe)) { throw 'Build first: cargo build --release' }
New-Item -ItemType Directory -Force dist | Out-Null

function Invoke-Tool($tool, [string[]]$arguments) {
  & $tool @arguments
  if ($LASTEXITCODE -ne 0) { throw "$tool failed with exit code $LASTEXITCODE" }
}

# ── MSIX ──
$layout = 'target\msix'
Remove-Item -Recurse -Force $layout -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$layout\assets" | Out-Null
Copy-Item $exe $layout
Copy-Item 'packaging\windows\assets\*.png' "$layout\assets"
$manifest = (Get-Content 'packaging\windows\AppxManifest.xml' -Raw).Replace('@VERSION@', $version)
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "$layout\AppxManifest.xml"), $manifest)

$kit = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\makeappx.exe" |
  Sort-Object FullName -Descending | Select-Object -First 1
if (-not $kit) { throw 'Windows SDK (makeappx.exe) not found' }
$sdk = $kit.DirectoryName
Invoke-Tool "$sdk\makepri.exe" @('createconfig', '/cf', 'target\priconfig.xml', '/dq', 'en-US', '/o')
Invoke-Tool "$sdk\makepri.exe" @('new', '/pr', $layout, '/cf', 'target\priconfig.xml', '/of', "$layout\resources.pri", '/o')
Invoke-Tool "$sdk\makeappx.exe" @('pack', '/d', $layout, '/p', "dist\Pomo-Focus-Store-$version-x64.appx", '/o')
Compress-Archive -Path "$layout\*" -DestinationPath "dist\Pomo-Focus-$version-store-test.zip" -Force

# ── Installer ──
$makensis = (Get-Command makensis -ErrorAction SilentlyContinue).Source
if (-not $makensis) { $makensis = "${env:ProgramFiles(x86)}\NSIS\makensis.exe" }
Invoke-Tool $makensis @("/DVERSION=$version", 'packaging\windows\installer.nsi')

Get-ChildItem dist | Format-Table Name, Length
