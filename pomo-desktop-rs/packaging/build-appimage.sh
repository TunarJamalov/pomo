#!/usr/bin/env bash
# Builds dist/Pomo-Focus-<version>-x86_64.AppImage from target/release/pomo-focus.
# Downloads appimagetool on first use (into target/).
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)"
BIN=target/release/pomo-focus
[ -x "$BIN" ] || { echo "Build first: cargo build --release"; exit 1; }

TOOL=target/appimagetool-x86_64.AppImage
if [ ! -x "$TOOL" ]; then
  curl -fsSL -o "$TOOL" https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage
  chmod +x "$TOOL"
fi

APPDIR="$(mktemp -d)/Pomo-Focus.AppDir"
trap 'rm -rf "$(dirname "$APPDIR")"' EXIT
install -Dm755 "$BIN" "$APPDIR/usr/bin/pomo-focus"
install -Dm644 packaging/pomo-focus.desktop "$APPDIR/pomo-focus.desktop"
install -Dm644 assets/icon-512.png "$APPDIR/pomo-focus.png"
install -Dm644 assets/icon-512.png "$APPDIR/usr/share/icons/hicolor/512x512/apps/pomo-focus.png"
ln -s pomo-focus.png "$APPDIR/.DirIcon"
ln -s usr/bin/pomo-focus "$APPDIR/AppRun"

mkdir -p dist
OUT="dist/Pomo-Focus-${VERSION}-x86_64.AppImage"
# --appimage-extract-and-run lets it work on machines (and CI runners) without FUSE
ARCH=x86_64 "$TOOL" --appimage-extract-and-run --no-appstream "$APPDIR" "$OUT" >/dev/null
echo "$OUT"
