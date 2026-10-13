// Linux has no installer step for an AppImage and no login-item API, so both the
// pomo:// link handler and launch-on-startup are small .desktop files we write ourselves.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const DATA_HOME = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share');
const CONFIG_HOME = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const LAUNCHER_NAME = 'pomo-focus-appimage.desktop';
const LAUNCHER_FILE = path.join(DATA_HOME, 'applications', LAUNCHER_NAME);
const AUTOSTART_FILE = path.join(CONFIG_HOME, 'autostart', 'pomo-focus.desktop');

// An AppImage runs from a temporary mount, so point at the .AppImage file itself
function executable() {
  return process.env.APPIMAGE || process.execPath;
}

function quoteExec(value) {
  return `"${value.replace(/(["`$\\])/g, '\\$1')}"`;
}

function writeIfChanged(file, content) {
  try {
    if (fs.readFileSync(file, 'utf8') === content) return false;
  } catch (_) {}
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

function desktopEntry({ exec, icon, extra = [] }) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Pomo Focus',
    'Comment=Pomodoro focus timer for Pomo on Discord',
    `Exec=${exec}`,
    `Icon=${icon}`,
    'Terminal=false',
    'Categories=Education;Utility;',
    'StartupWMClass=pomo-focus',
    ...extra,
    '',
  ].join('\n');
}

// The .deb registers pomo:// when it is installed; an AppImage has to do it on first run
function registerAppImageProtocol({ iconSource, iconTarget }) {
  if (!process.env.APPIMAGE) return;
  try {
    fs.mkdirSync(path.dirname(iconTarget), { recursive: true });
    fs.writeFileSync(iconTarget, fs.readFileSync(iconSource));
    const changed = writeIfChanged(LAUNCHER_FILE, desktopEntry({
      exec: `${quoteExec(executable())} %U`,
      icon: iconTarget,
      extra: ['MimeType=x-scheme-handler/pomo;'],
    }));
    if (changed) {
      execFile('xdg-mime', ['default', LAUNCHER_NAME, 'x-scheme-handler/pomo'], () => {});
      execFile('update-desktop-database', [path.dirname(LAUNCHER_FILE)], () => {});
    }
  } catch (error) {
    console.warn('Could not register the pomo:// link handler:', error.message);
  }
}

function isStartupEnabled() {
  return fs.existsSync(AUTOSTART_FILE);
}

function setStartupEnabled(enabled, { hiddenArg, icon }) {
  try {
    if (!enabled) {
      fs.rmSync(AUTOSTART_FILE, { force: true });
      return false;
    }
    writeIfChanged(AUTOSTART_FILE, desktopEntry({
      exec: `${quoteExec(executable())} ${hiddenArg}`,
      icon,
      extra: ['X-GNOME-Autostart-enabled=true'],
    }));
    return true;
  } catch (error) {
    console.warn('Could not change launch on startup:', error.message);
    return isStartupEnabled();
  }
}

module.exports = { registerAppImageProtocol, isStartupEnabled, setStartupEnabled };
