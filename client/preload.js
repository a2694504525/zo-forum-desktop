const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  quit: () => ipcRenderer.invoke('client-quit'),
  quitApp: () => ipcRenderer.invoke('client-quit'),
  onClientConfig: (callback) => {
    const wrapped = (event, payload) => callback(payload);
    ipcRenderer.on('client-config', wrapped);
    return () => ipcRenderer.removeListener('client-config', wrapped);
  },
  setBackgroundMode: (enabled) => ipcRenderer.invoke('set-background-mode', !!enabled),
  getBackgroundMode: () => ipcRenderer.invoke('get-background-mode'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openSiteWindow: (url) => ipcRenderer.invoke('open-site-window', url),
  openQQLogin: () => ipcRenderer.invoke('open-qq-login'),
  showAuthWindow: () => ipcRenderer.invoke('show-auth-window'),
  authComplete: () => ipcRenderer.invoke('auth-complete'),
  reportDiagnostic: (value) => ipcRenderer.invoke('report-diagnostic', value),
  siteRequest: (request) => ipcRenderer.invoke('site-request', request),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getClientConfig: () => ipcRenderer.invoke('get-client-config'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  launchDownloadedInstaller: () => ipcRenderer.invoke('launch-downloaded-installer'),
  getCachedUpdateInfo: () => ipcRenderer.invoke('get-cached-update-info'),
  onUpdateAvailable: (callback) => {
    const wrapped = (event, payload) => callback(payload);
    ipcRenderer.on('app-update-available', wrapped);
    return () => ipcRenderer.removeListener('app-update-available', wrapped);
  },
  onUpdateStatus: (callback) => {
    const wrapped = (event, payload) => callback(payload);
    ipcRenderer.on('app-update-status', wrapped);
    return () => ipcRenderer.removeListener('app-update-status', wrapped);
  },
  onShowAuthModal: (callback) => {
    const wrapped = () => callback();
    ipcRenderer.on('show-auth-modal', wrapped);
    return () => ipcRenderer.removeListener('show-auth-modal', wrapped);
  },
  clearAuthCookies: () => ipcRenderer.invoke('clear-auth-cookies'),
});
