#!/usr/bin/env bash
# Builds dist/pomo-focus_<version>_amd64.deb from target/release/pomo-focus.
# Plain ar + tar, so it runs anywhere (no dpkg needed). The package keeps the
# Electron version's name, pomo-desktop, so apt upgrades 1.x in place.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)"
BIN=target/release/pomo-focus
[ -x "$BIN" ] || { echo "Build first: cargo build --release"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
ROOT="$WORK/root"

install -Dm755 "$BIN" "$ROOT/usr/bin/pomo-focus"
install -Dm644 packaging/pomo-focus.desktop "$ROOT/usr/share/applications/pomo-focus.desktop"
for size in 32 128 512; do
  install -Dm644 "assets/icon-$size.png" "$ROOT/usr/share/icons/hicolor/${size}x${size}/apps/pomo-focus.png"
done
install -Dm644 ui/fonts/OFL.txt "$ROOT/usr/share/doc/pomo-desktop/fonts-OFL.txt"
install -Dm644 ui/icons/LICENSE "$ROOT/usr/share/doc/pomo-desktop/icons-LICENSE"

INSTALLED_KB="$(du -sk "$ROOT" | cut -f1)"
mkdir -p "$WORK/control"
cat > "$WORK/control/control" <<CONTROL
Package: pomo-desktop
Version: $VERSION
Architecture: amd64
Maintainer: Tunar Jamalov <jamalovtunar@gmail.com>
Installed-Size: $INSTALLED_KB
Depends: libc6 (>= 2.35), libfontconfig1, libfreetype6, libxkbcommon0, libwayland-client0 | libx11-xcb1, xdg-utils
Recommends: libxkbcommon-x11-0, libxcursor1
Section: utils
Priority: optional
Homepage: https://pomofocus.online/desktop
Description: Pomodoro focus timer for Pomo on Discord
 Pomo Focus runs Pomodoro sessions on your desktop and syncs finished focus
 sessions to your Pomo profile on Discord: water, XP, streaks and history.
CONTROL

mkdir -p dist
OUT="dist/pomo-focus_${VERSION}_amd64.deb"
echo "2.0" > "$WORK/debian-binary"
(cd "$WORK/control" && tar --owner=0 --group=0 -cJf "$WORK/control.tar.xz" ./control)
(cd "$ROOT" && tar --owner=0 --group=0 -cJf "$WORK/data.tar.xz" ./usr)
rm -f "$OUT"
(cd "$WORK" && ar rc "$OLDPWD/$OUT" debian-binary control.tar.xz data.tar.xz)
echo "$OUT"
