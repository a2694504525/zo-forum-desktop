const { app, BrowserWindow, ipcMain, shell, Tray, Menu, session, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const log = require('electron-log/main');
const { permittedRequest, safeHeaders } = require('./security');
const { normalizeConfig, releasePolicy } = require('./config-schema');
log.initialize();
log.transports.file.level = 'info';
process.on('uncaughtException', error => {log.error('main exception', error.name);reportDiagnostic('main','exception',error.name);});
process.on('unhandledRejection', error => {log.error('main rejection',error?.name || 'Error');reportDiagnostic('main','rejection',error?.name);});

let mainWindow;
let authWindow;
let tray = null;
let updateTimer = null;
let latestUpdateInfo = null;
let latestClientConfig = null;
let platformRelease = null;
let lastNotifiedVersion = '';
let downloadedInstallerPath = '';
let backgroundModeEnabled = process.platform!=='linux';
let isQuitting = false;
let configTimer = null;
let configInProgress = false;
let stateExitTimer = null;
const AUTH_COOKIE_PREFIX = 'cV2s_';

// 站点域名与客户端配置接口
const SITE_URL = 'https://www.zozse.cn';
const CLIENT_CONFIG_URL = `${SITE_URL}/api/desktop/client_config.php`;
const DEFAULT_UPDATE_FEED_URL = 'https://www.z19m.com/download/desktop';

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.allowDowngrade = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function getSafeSiteUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || (hostname !== 'zozse.cn' && !hostname.endsWith('.zozse.cn'))) {
      return null;
    }
    return url;
  } catch (error) {
    return null;
  }
}

function getSafeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : '';
  } catch (error) {
    return '';
  }
}

function compareVersions(versionA, versionB) {
  const left = String(versionA || '0').split('.').map(item => Number(item) || 0);
  const right = String(versionB || '0').split('.').map(item => Number(item) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] || 0;
    const b = right[index] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

function clearUpdateSchedule() {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
}

function scheduleUpdateChecks(intervalMinutes) {
  const safeMinutes = Math.max(15, Number(intervalMinutes) || 180);
  clearUpdateSchedule();
  updateTimer = setInterval(() => {
    checkForUpdates({ notifyRenderer: true }).catch(error => {
      console.error('后台检查更新失败:', error);
    });
  }, safeMinutes * 60 * 1000);
}

function sendUpdateToRenderer(payload) {
  for (const window of [mainWindow, authWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send('app-update-available', payload);
  }
}

function sendUpdateStatus(payload) {
  for (const window of [mainWindow, authWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send('app-update-status', payload);
  }
}

autoUpdater.on('download-progress', progress => {
  sendUpdateStatus({
    state: 'downloading',
    percent: Number(progress.percent || 0),
    transferred: Number(progress.transferred || 0),
    total: Number(progress.total || 0),
    bytesPerSecond: Number(progress.bytesPerSecond || 0)
  });
});
autoUpdater.on('update-downloaded', info => {
  downloadedInstallerPath = info.downloadedFile || '';
  sendUpdateStatus({ state: 'downloaded', version: info.version });
});
autoUpdater.on('error', error => {
  sendUpdateStatus({ state: 'error', message: error.message || '更新失败' });
});

async function fetchClientConfig(options = {}) {
  const requestUrl = `${CLIENT_CONFIG_URL}?_=${Date.now()}`;
  const response = await fetch(requestUrl, {
    method: 'GET',
    signal: AbortSignal.timeout(4000),
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
      'User-Agent': `ZOForumDesktop/${app.getVersion()}`
    }
  });
  if (!response.ok) {
    throw new Error(`配置接口请求失败（HTTP ${response.status}）`);
  }
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error(`配置接口返回异常: ${(text || '').trim().slice(0, 120) || '(空响应)'}`);
  }
  const rawConfig = payload && typeof payload === 'object' && payload.data ? payload.data : payload;
  if (payload?.status && payload.status !== 'success' || !rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) throw new Error('配置接口数据格式不正确');
  const config = normalizeConfig(rawConfig);
  if (!config || typeof config !== 'object') {
    throw new Error('配置接口数据格式不正确');
  }
  if (options.includeManifest !== false) try {
    const updateFeedUrl = String(config.update_feed_url || DEFAULT_UPDATE_FEED_URL).replace(/\/+$/, '');
    const updateManifestUrl = `${updateFeedUrl}/${releasePolicy(process.platform).manifest}`;
    const manifestResponse = await fetch(`${updateManifestUrl}?_=${Date.now()}`, {
      headers: {
        'Accept': 'application/x-yaml,text/yaml,text/plain',
        'Cache-Control': 'no-cache',
        'User-Agent': `ZOForumDesktop/${app.getVersion()}`
      }
    });
    if (!manifestResponse.ok) throw new Error(`HTTP ${manifestResponse.status}`);
    const manifest = await manifestResponse.text();
    const versionMatch = manifest.match(/^version:\s*['"]?([^'"\r\n]+)['"]?\s*$/m);
    if (!versionMatch) throw new Error('latest.yml 缺少 version');
    config.latest_version = versionMatch[1].trim();
    if(process.platform==='linux'){const file=manifest.match(/^path:\s*['"]?([^'"\r\n]+)['"]?\s*$/m)?.[1]?.trim();if(!file||!/^ZO-Forum-[A-Za-z0-9._-]+\.(?:deb|tar\.gz)$/.test(file))throw new Error('Linux 更新清单文件无效');platformRelease={version:config.latest_version,url:updateFeedUrl+'/'+encodeURIComponent(file)};}
    config.update_manifest_url = updateManifestUrl;
  } catch (error) {
    console.error('读取下载站更新清单失败', error);
  }
  config.update_feed_url = String(config.update_feed_url || DEFAULT_UPDATE_FEED_URL).replace(/\/+$/, '');
  if(process.platform==='linux'){config.latest_version=platformRelease?.version||app.getVersion();config.download_url=platformRelease?.url||'https://www.z19m.com/platform.php#linux';config.force_update=false;}
  const changed = JSON.stringify(config) !== JSON.stringify(latestClientConfig);
  latestClientConfig = config;
  if(app.isReady())syncTray();
  if (changed) for (const window of [mainWindow, authWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send('client-config', config);
  }
  if (changed && stateExitTimer) { clearTimeout(stateExitTimer); stateExitTimer = null; }
  if (changed && (config.run_state?.can_run === false || config.run_state?.mode !== 'normal') && config.run_state?.action === 'exit') {
    stateExitTimer = setTimeout(() => { isQuitting = true; app.quit(); }, 1000);
  }
  clearTimeout(configTimer);
  configTimer = setTimeout(refreshRuntimeConfig, Math.max(2, Math.min(3, Number(config.control_poll_seconds) || 2)) * 1000);
  return config;
}

async function refreshRuntimeConfig() {
  if (configInProgress) return;
  configInProgress = true;
  try { await fetchClientConfig({includeManifest: false}); }
  catch { log.warn('configuration unavailable'); configTimer = setTimeout(refreshRuntimeConfig, 2000); }
  finally { configInProgress = false; }
}

async function checkForUpdates(options = {}) {
  const notifyRenderer = options.notifyRenderer !== false;
  const currentVersion = app.getVersion();
  try {
    const config = await fetchClientConfig();
    scheduleUpdateChecks(config.check_interval_minutes);

    const latestVersion = String(config.latest_version || '').trim();
    const downloadUrl = String(config.download_url || SITE_URL).trim() || SITE_URL;
    const changelog = Array.isArray(config.changelog) ? config.changelog.filter(Boolean) : [];
    const updateInfo = {
      currentVersion,
      manualUpdate:process.platform==='linux',
      latestVersion,
      downloadUrl,
      forceUpdate: !!config.force_update,
      changelog,
      checkedAt: Date.now(),
      feedUrl: config.update_feed_url || DEFAULT_UPDATE_FEED_URL
    };

    if (latestVersion && compareVersions(latestVersion, currentVersion) > 0) {
      if (updateInfo.feedUrl && process.platform!=='linux') {
        autoUpdater.setFeedURL({ provider: 'generic', url: updateInfo.feedUrl });
      }
      latestUpdateInfo = updateInfo;
      if (notifyRenderer && lastNotifiedVersion !== latestVersion) {
        lastNotifiedVersion = latestVersion;
        sendUpdateToRenderer(updateInfo);
      }
      return { status: 'success', hasUpdate: true, data: updateInfo };
    }

    latestUpdateInfo = null;
    lastNotifiedVersion = '';
    return { status: 'success', hasUpdate: false, data: updateInfo };
  } catch (error) {
    console.error('检查更新失败:', error);
    return { status: 'error', hasUpdate: false, message: error.message, data: latestUpdateInfo || { currentVersion } };
  }
}

function syncTray(){if(latestClientConfig?.features?.tray_enabled===false){if(tray){tray.destroy();tray=null;}if(mainWindow&&!mainWindow.isDestroyed()&&!mainWindow.isVisible())mainWindow.show();return;}if(tray)return;
  // 系统托盘
  tray = new Tray(path.join(__dirname, process.platform === 'linux' ? 'renderer/assets/icon.png' : 'renderer/assets/tray.ico'));
  tray.setToolTip('ZO论坛盒子');
  const trayMenu = Menu.buildFromTemplate([
    { label: '打开', click: () => {
      const activeWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : authWindow;
      if (activeWindow) activeWindow.show(); else createMainWindow();
    } },
    { label: '退出', click: () => app.quit() }
  ]);
  tray.setContextMenu(trayMenu);
  tray.on('click', () => {
    const activeWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : authWindow;
    if (activeWindow) {
      activeWindow.isVisible() ? activeWindow.hide() : activeWindow.show();
    }
  });
}

const createMainWindow = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    title: 'ZO论坛盒子',
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#f5f7fb',
    icon: path.join(__dirname, process.platform === 'linux' ? 'renderer/assets/icon.png' : 'renderer/assets/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.on('close', event => {
    if (backgroundModeEnabled && latestClientConfig?.features?.tray_enabled!==false && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (latestClientConfig) mainWindow.webContents.send('client-config', latestClientConfig);
    if (latestUpdateInfo) {
      sendUpdateToRenderer(latestUpdateInfo);
    }
  });

  // 新窗口请求用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (mainWindow.webContents.getURL().startsWith('file:') && !getSafeSiteUrl(url)) return {action: 'deny'};
    const safeUrl = getSafeExternalUrl(url);
    if (safeUrl) shell.openExternal(safeUrl);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-frame-navigate', event => {
    if (event.isMainFrame || !getSafeSiteUrl(event.url)) event.preventDefault();
  });
  mainWindow.on('focus', refreshRuntimeConfig);
  return mainWindow;
};

const createAuthWindow = () => {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.show();
    authWindow.focus();
    return authWindow;
  }
  authWindow = new BrowserWindow({
    width: 520,
    height: 720,
    minWidth: 460,
    minHeight: 620,
    title: 'ZO论坛盒子 - 登录',
    frame: false,
    backgroundColor: '#f5f7fb',
    icon: path.join(__dirname, process.platform === 'linux' ? 'renderer/assets/icon.png' : 'renderer/assets/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });
  authWindow.loadFile(path.join(__dirname, 'renderer/auth.html'));
  authWindow.webContents.on('did-finish-load', () => {
    if (latestClientConfig) authWindow.webContents.send('client-config', latestClientConfig);
  });
  authWindow.on('closed', () => { authWindow = null; });
  authWindow.webContents.setWindowOpenHandler(({ url }) => {
    const safeUrl = getSafeExternalUrl(url);
    if (safeUrl) shell.openExternal(safeUrl);
    return { action: 'deny' };
  });
  return authWindow;
};

app.whenReady().then(() => {
  // 为所有发往站点的请求设置 Referer，避免图片、附件等被防盗链拦截
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (getSafeSiteUrl(details.url)) {
      details.requestHeaders['Referer'] = 'https://www.zozse.cn/';
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  createMainWindow();
  refreshRuntimeConfig();
  setTimeout(() => {
    checkForUpdates({ notifyRenderer: true }).catch(error => {
      console.error('启动检查更新失败:', error);
    });
  }, 2000);

  syncTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  clearUpdateSchedule();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

// IPC 桥接：窗口控制
ipcMain.handle('window-minimize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) window.minimize();
});
ipcMain.handle('window-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.isMaximized() ? window.unmaximize() : window.maximize();
  }
});
ipcMain.handle('window-close', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;
  if (window === mainWindow && backgroundModeEnabled && latestClientConfig?.features?.tray_enabled!==false) {
    window.hide();
    return 'hidden';
  }
  isQuitting = true;
  app.quit();
  return 'quit';
});
ipcMain.handle('set-background-mode', (event, enabled) => {
  backgroundModeEnabled = !!enabled;
  return backgroundModeEnabled;
});
ipcMain.handle('get-background-mode', () => backgroundModeEnabled && latestClientConfig?.features?.tray_enabled!==false);
ipcMain.handle('auth-complete', async () => {
  if (latestClientConfig?.auth?.bind_mobile_required === true) {
    try {
      const response = await session.defaultSession.fetch(`${SITE_URL}/api/desktop/user.php`, {cache: 'no-store'});
      const user = await response.json();
      if (user.status !== 'success' || user.data?.mobile_bound !== true) return false;
    } catch { return false; }
  }
  for (const cookie of await session.defaultSession.cookies.get({url: SITE_URL})) {
    if (!/(?:auth|saltkey|sid|uid)$/.test(cookie.name)) continue;
    await session.defaultSession.cookies.set({url: 'https://' + cookie.domain.replace(/^\./, ''),
      name: cookie.name, value: cookie.value, path: cookie.path, secure: true, httpOnly: true,
      sameSite: 'no_restriction', ...(cookie.hostOnly ? {} : {domain:cookie.domain}),
      ...(cookie.expirationDate ? {expirationDate:cookie.expirationDate} : {})});
  }
  createMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
  if (authWindow && !authWindow.isDestroyed()) authWindow.close();
  return true;
});
ipcMain.handle('show-auth-window', () => {
  createAuthWindow();
  return true;
});
ipcMain.handle('client-quit', () => { isQuitting = true; app.quit(); });
ipcMain.handle('open-external', (event, url) => {
  const safeUrl = getSafeExternalUrl(url);
  if (!safeUrl) return false;
  shell.openExternal(safeUrl);
  return true;
});
ipcMain.handle('open-site-window', (event, value) => {
  const url = getSafeSiteUrl(value);
  if (!url || (url.hostname !== 'www.zozse.cn' && url.hostname !== 'zozse.cn')) return false;
  return new Promise(resolve => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const child = new BrowserWindow({
      width: 760,
      height: 680,
      minWidth: 600,
      minHeight: 500,
      parent: parent && !parent.isDestroyed() ? parent : undefined,
      modal: false,
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, webSecurity: true }
    });
    child.webContents.setWindowOpenHandler(({ url: target }) => {
      const safeUrl = getSafeExternalUrl(target);
      if (safeUrl) shell.openExternal(safeUrl);
      return { action: 'deny' };
    });
    child.on('closed', () => resolve(true));
    child.webContents.on('did-navigate', (event, target) => {
      if (/forum\.php\?mod=viewthread|thread-\d+/i.test(target) && !child.isDestroyed()) child.close();
    });
    child.loadURL(url.toString());
  });
});
ipcMain.handle('open-qq-login', async event => {
  if (latestClientConfig?.auth?.login_enabled === false || latestClientConfig?.auth?.qq_login_enabled === false) return {status: 'error', message: 'QQ 登录已关闭'};
  const parent = BrowserWindow.fromWebContents(event.sender);
  return new Promise(resolve => {
    let settled = false, syncing = false, visitedQQ = false, poll, timeout;
    const child = new BrowserWindow({width: 760, height: 720, title: 'QQ 登录', parent, modal: true,
      webPreferences: {contextIsolation: true, nodeIntegration: false, webSecurity: true}});
    const allowed = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (getSafeSiteUrl(value) || u.hostname === 'qq.com' || u.hostname.endsWith('.qq.com')); } catch { return false; } };
    const finish = result => { if (settled) return; settled = true; clearInterval(poll); clearTimeout(timeout); log.info('QQ authentication', result.status); if (!child.isDestroyed()) child.close(); if (parent && !parent.isDestroyed()) { parent.show(); parent.focus(); } resolve(result); };
    const sync = async () => {
      if (syncing || settled || !visitedQQ) return;
      syncing = true;
      try {
        for (const endpoint of ['user', 'qq_session']) {
          try {
            const response = await session.defaultSession.fetch(SITE_URL + '/api/desktop/' + endpoint + '.php', {cache: 'no-store', credentials: 'include', signal: AbortSignal.timeout(12000)});
            const payload = await response.json();
            if (response.ok && payload.status === 'success' && Number(payload.data?.uid) > 0) { finish({status: 'success', user: {uid: payload.data.uid, username: payload.data.username}}); return; }
          } catch { log.debug('QQ state pending', endpoint); }
        }
      } finally { syncing = false; }
    };
    child.setMenu(Menu.buildFromTemplate([{label: '我已授权，返回客户端', click: sync}]));
    const navigate = (event, url) => {
      if (!allowed(url)) { event.preventDefault(); return; }
      const u = new URL(url); if (u.hostname === 'qq.com' || u.hostname.endsWith('.qq.com')) visitedQQ = true;
      log.info('QQ navigation', u.hostname, u.pathname);
    };
    child.webContents.on('will-navigate', navigate);
    child.webContents.on('will-redirect', navigate);
    child.webContents.setWindowOpenHandler(({url}) => { if (allowed(url)) { if (new URL(url).hostname.endsWith('qq.com')) visitedQQ = true; child.loadURL(url); } return {action: 'deny'}; });
    child.webContents.on('did-navigate', (event, url) => { const u = new URL(url); if (u.hostname === 'qq.com' || u.hostname.endsWith('.qq.com')) visitedQQ = true; setTimeout(sync, 800); });
    child.webContents.on('did-finish-load', sync);
    child.on('closed', () => finish({status: 'cancelled', message: '授权已完成请按页面提示操作'}));
    child.loadURL(SITE_URL + '/connect.php?mod=login&op=init&referer=index.php');
    poll = setInterval(sync, 1500);
    timeout = setTimeout(async () => { await sync(); if (!settled && !child.isDestroyed()) { child.setTitle('尚未确认登录，请点击菜单“我已授权，返回客户端”'); child.show(); } }, 45000);
  });
});
ipcMain.handle('site-request', async (event, request) => {
  const safeUrl = getSafeSiteUrl(request && request.url);
  if (!safeUrl) {
    return { ok: false, status: 0, text: '', error: '请求地址不在允许范围内' };
  }
  const method = String((request && request.method) || 'GET').toUpperCase();
  if (!['GET', 'POST'].includes(method)) {
    return { ok: false, status: 0, text: '', error: '不支持的请求方法' };
  }
  if (![mainWindow, authWindow].some(window => window && window.webContents === event.sender)
      || !event.senderFrame?.url.startsWith('file:')
      || !permittedRequest(safeUrl, method, latestClientConfig || {})
      || String(request?.body || '').length > 1024 * 1024) {
    return { ok: false, status: 0, text: '', error: '请求不在客户端授权范围内' };
  }
  try {
    const response = await session.defaultSession.fetch(safeUrl.toString(), {
      method,
      headers: safeHeaders(request && request.headers),
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
      body: method === 'POST' ? String((request && request.body) || '') : undefined
    });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
      contentType: response.headers.get('content-type') || ''
    };
  } catch (error) {
    return { ok: false, status: 0, text: '', error: error.message || '网络请求失败' };
  }
});
ipcMain.handle('get-app-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform
}));
ipcMain.handle('get-client-config', async () => {
  try {
    const config = await fetchClientConfig({ includeManifest: false });
    return { status: 'success', message: 'ok', data: config };
  } catch (error) {
    if (latestClientConfig) {
      return { status: 'success', message: 'cached', data: latestClientConfig, cached: true };
    }
    return { status: 'error', message: error.message || '配置读取失败' };
  }
});
ipcMain.handle('check-for-updates', () => checkForUpdates({ notifyRenderer: false }));
ipcMain.handle('get-cached-update-info', () => latestUpdateInfo);
ipcMain.handle('download-update', async () => {
  if (!latestUpdateInfo || !latestUpdateInfo.feedUrl) {
    return { status: 'error', message: '更新源未配置，请联系管理员' };
  }
  try {
    if(process.platform==='linux'){const url=getSafeExternalUrl(latestUpdateInfo.downloadUrl);if(!url)throw new Error('Linux 下载地址无效');await shell.openExternal(url);return {status:'success',external:true};}
    downloadedInstallerPath = '';
    autoUpdater.setFeedURL({ provider: 'generic', url: latestUpdateInfo.feedUrl || DEFAULT_UPDATE_FEED_URL });
    // 保留 latest.yml 的 sha512 完整性校验，不要求 Authenticode 发布者签名。
    await autoUpdater.checkForUpdates();
    await autoUpdater.downloadUpdate();
    return { status: 'success' };
  } catch (error) {
    return { status: 'error', message: error.message || '下载更新失败' };
  }
});
ipcMain.handle('launch-downloaded-installer', async () => {
  if (!downloadedInstallerPath) {
    return { status: 'error', message: '安装程序尚未下载完成' };
  }
  const errorMessage = await shell.openPath(downloadedInstallerPath);
  return errorMessage
    ? { status: 'error', message: errorMessage }
    : { status: 'success' };
});
ipcMain.handle('clear-auth-cookies', async () => {
  try {
    const names = [AUTH_COOKIE_PREFIX + 'sid', AUTH_COOKIE_PREFIX + 'uid', AUTH_COOKIE_PREFIX + 'auth'];
    for (const name of names) {
      await session.defaultSession.cookies.remove(SITE_URL, name);
    }
  } catch (e) {
    console.error('清除 cookie 失败', e);
  }
  return true;
});


let lastDiagnostic=0;
async function reportDiagnostic(source,reason,kind='Error') {
  if (!app.isReady() || latestClientConfig?.features?.crash_reporting_enabled !== true || Date.now()-lastDiagnostic<60000) return {accepted:false};
  lastDiagnostic=Date.now();
  try {const response=await session.defaultSession.fetch(SITE_URL+'/api/desktop/crash_report.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:app.getVersion(),source,reason,kind:['Error','TypeError','RangeError','SyntaxError'].includes(kind)?kind:'Other'}),signal:AbortSignal.timeout(10000)});return {accepted:response.ok};}catch{return {accepted:false};}
}
ipcMain.handle('report-diagnostic',(event,value)=> {if(!mainWindow || event.sender!==mainWindow.webContents || !['exception','rejection','test'].includes(value?.reason))return {accepted:false};return reportDiagnostic('renderer',value.reason,value.kind);});
app.on('web-contents-created',(_event,contents)=>contents.on('render-process-gone',(_event,details)=>{log.error('renderer stopped',details.reason);if(['crashed','killed','oom','launch-failed'].includes(details.reason))reportDiagnostic('renderer',details.reason);}));
