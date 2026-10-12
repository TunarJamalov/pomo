const { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, powerMonitor, shell } = require('electron');
const path = require('node:path');

const PROTOCOL = 'pomo';
const START_HIDDEN_ARG = '--hidden';
const APP_ICON = path.join(__dirname, '../assets/icon.ico');
const TRAY_ICON = path.join(__dirname, '../assets/icon-32.png');
let mainWindow = null;
let tray = null;
let pendingDeepLink = null;
let pendingTrayCommand = null;
let isQuitting = false;
let compactMode = false;
let lastTrayState = {
  mode: 'Focus',
  time: '25:00',
  status: 'Ready',
};

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

function createWindow() {
  if (mainWindow) {
    showMainWindow();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    show: !shouldStartHidden(),
    title: 'Pomo Desktop',
    icon: APP_ICON,
    backgroundColor: '#0d1218',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.once('did-finish-load', () => {
    updateTray();
    flushDeepLink();
    flushTrayCommand();
  });

  mainWindow.on('close', event => {
    if (isQuitting || !tray) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const devUrl = process.env.POMO_DESKTOP_DEV_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  return mainWindow;
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function setCompactMode(enabled) {
  compactMode = Boolean(enabled);

  if (!mainWindow) {
    createWindow();
    return compactMode;
  }

  if (compactMode) {
    mainWindow.setMinimumSize(320, 380);
    mainWindow.setResizable(false);
    mainWindow.setAlwaysOnTop(true, 'floating');
    mainWindow.setSize(360, 440);
  } else {
    mainWindow.setResizable(true);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setMinimumSize(900, 620);
    mainWindow.setSize(1120, 760);
  }

  mainWindow.center();
  showMainWindow();
  mainWindow.webContents.send('pomo:window-mode', { compact: compactMode });
  updateTray();
  return compactMode;
}

function shouldStartHidden() {
  return process.argv.includes(START_HIDDEN_ARG);
}

function getStartupSettings() {
  return {
    openAtLogin: app.getLoginItemSettings({ args: [START_HIDDEN_ARG] }).openAtLogin
  };
}

function setStartupSettings(enabled) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    args: Boolean(enabled) ? [START_HIDDEN_ARG] : []
  });
  return getStartupSettings();
}

function registerProtocol() {
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

function getDeepLinkFromArgv(argv) {
  return argv.find(arg => typeof arg === 'string' && arg.startsWith(`${PROTOCOL}://`)) || null;
}

// A pomo:// link can be clicked from anywhere, so it may only point sync at our own
// server; otherwise a crafted link could redirect every future sync (and its token).
const TRUSTED_SYNC_HOSTS = new Set(['pomofocus.online', 'www.pomofocus.online']);

function trustedApiUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && TRUSTED_SYNC_HOSTS.has(url.hostname)) return url.toString();
    if (!app.isPackaged && url.protocol === 'http:' && url.hostname === 'localhost') return url.toString();
  } catch (_) {}
  return '';
}

function handleDeepLink(url) {
  if (!url || !url.startsWith(`${PROTOCOL}://`)) return;

  let payload;
  try {
    const parsed = new URL(url);
    const isConnectLink = parsed.hostname === 'connect' || parsed.pathname === '/connect';
    if (!isConnectLink) return;

    payload = {
      token: parsed.searchParams.get('token') || '',
      apiUrl: trustedApiUrl(parsed.searchParams.get('apiUrl')),
    };
  } catch (_) {
    return;
  }

  pendingDeepLink = payload;
  if (mainWindow) {
    showMainWindow();
    flushDeepLink();
  } else if (app.isReady()) {
    createWindow();
  }
}

function flushDeepLink() {
  if (!mainWindow || !pendingDeepLink) return;
  mainWindow.webContents.send('pomo:deep-link', pendingDeepLink);
  pendingDeepLink = null;
}

function sendTrayCommand(command) {
  pendingTrayCommand = command;
  if (mainWindow) {
    flushTrayCommand();
  } else if (app.isReady()) {
    createWindow();
  }
}

function flushTrayCommand() {
  if (!mainWindow || !pendingTrayCommand) return;
  mainWindow.webContents.send('pomo:tray-command', pendingTrayCommand);
  pendingTrayCommand = null;
}

function createTray() {
  if (tray) return tray;

  const iconPath = TRAY_ICON;
  let icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) {
    icon = icon.resize({ width: 16, height: 16 });
  }

  tray = new Tray(icon);
  tray.on('click', showMainWindow);
  updateTray();
  return tray;
}

function updateTray(payload) {
  if (payload) {
    lastTrayState = {
      mode: sanitizeTrayText(payload.mode, 'Focus'),
      time: sanitizeTrayText(payload.time, '25:00'),
      status: sanitizeTrayText(payload.status, 'Ready'),
    };
  }

  if (!tray) return;

  const tooltip = `Pomo Desktop - ${lastTrayState.mode} ${lastTrayState.time} (${lastTrayState.status})`;
  const isRunning = lastTrayState.status === 'Running';
  const isPaused = lastTrayState.status === 'Paused';
  const primaryLabel = isRunning ? 'Pause Timer' : isPaused ? 'Resume Timer' : 'Start Timer';
  tray.setToolTip(tooltip);

  const menu = Menu.buildFromTemplate([
    {
      label: tooltip,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: primaryLabel,
      click: () => sendTrayCommand('toggle'),
    },
    {
      label: 'Reset Timer',
      click: () => sendTrayCommand('reset'),
    },
    { type: 'separator' },
    {
      label: 'Show Pomo Desktop',
      click: showMainWindow,
    },
    {
      label: compactMode ? 'Exit Mini Mode' : 'Enter Mini Mode',
      click: () => setCompactMode(!compactMode),
    },
    {
      label: 'Open Dashboard',
      click: () => shell.openExternal('https://pomofocus.online/dashboard'),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function sanitizeTrayText(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return text.length > 0 && text.length < 40 ? text : fallback;
}

app.on('second-instance', (_event, argv) => {
  handleDeepLink(getDeepLinkFromArgv(argv));
  if (mainWindow) {
    showMainWindow();
  }
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.whenReady().then(() => {
  app.setAppUserModelId('online.pomofocus.desktop');
  registerProtocol();
  createTray();

  ipcMain.handle('pomo:notify', (_event, payload) => {
    if (!Notification.isSupported()) return false;
    const title = typeof payload?.title === 'string' ? payload.title : 'Pomo Desktop';
    const body = typeof payload?.body === 'string' ? payload.body : '';
    new Notification({ title, body }).show();
    return true;
  });

  ipcMain.handle('pomo:update-tray', (_event, payload) => {
    updateTray(payload);
    return true;
  });

  ipcMain.handle('pomo:set-compact-mode', (_event, enabled) => setCompactMode(enabled));

  ipcMain.handle('pomo:get-window-mode', () => ({ compact: compactMode }));

  ipcMain.handle('pomo:get-startup-settings', () => getStartupSettings());

  ipcMain.handle('pomo:set-startup-settings', (_event, enabled) => setStartupSettings(enabled));

  ipcMain.handle('pomo:get-idle-seconds', () => powerMonitor.getSystemIdleTime());

  createWindow();
  handleDeepLink(getDeepLinkFromArgv(process.argv));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return;
  if (!tray) app.quit();
});
