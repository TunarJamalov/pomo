const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pomoDesktop', {
  appName: 'Pomo Desktop',
  notify: (title, body) => ipcRenderer.invoke('pomo:notify', { title, body }),
  updateTray: (payload) => ipcRenderer.invoke('pomo:update-tray', payload),
  setCompactMode: (enabled) => ipcRenderer.invoke('pomo:set-compact-mode', enabled),
  getWindowMode: () => ipcRenderer.invoke('pomo:get-window-mode'),
  getStartupSettings: () => ipcRenderer.invoke('pomo:get-startup-settings'),
  setStartupSettings: (enabled) => ipcRenderer.invoke('pomo:set-startup-settings', enabled),
  getIdleSeconds: () => ipcRenderer.invoke('pomo:get-idle-seconds'),
  onDeepLink: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('pomo:deep-link', handler);
    return () => ipcRenderer.removeListener('pomo:deep-link', handler);
  },
  onTrayCommand: (callback) => {
    const handler = (_event, command) => callback(command);
    ipcRenderer.on('pomo:tray-command', handler);
    return () => ipcRenderer.removeListener('pomo:tray-command', handler);
  },
  onWindowMode: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('pomo:window-mode', handler);
    return () => ipcRenderer.removeListener('pomo:window-mode', handler);
  }
});
