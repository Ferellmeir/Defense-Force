const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { getBuildFingerprint } = require('./buildFingerprint.cjs');

let diagnosticsPath = null;
let diagnosticsFallbackReported = false;

function findProjectRoot() {
  const starts = app.isPackaged
    ? [process.env.PORTABLE_EXECUTABLE_DIR, path.dirname(app.getPath('exe'))]
    : [app.getAppPath()];
  for (const start of starts.filter(Boolean)) {
    let current = path.resolve(start);
    while (true) {
      if (
        fs.existsSync(path.join(current, 'package.json')) &&
        fs.existsSync(path.join(current, 'src')) &&
        fs.existsSync(path.join(current, 'public')) &&
        fs.existsSync(path.join(current, 'webpack.config.js'))
      ) return current;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return null;
}

function initializeDiagnosticsPath() {
  if (diagnosticsPath) return diagnosticsPath;
  let preferredPath = null;
  try {
    const projectRoot = findProjectRoot();
    preferredPath = projectRoot && path.join(projectRoot, 'runtime-diagnostics.log');
    if (!preferredPath) throw new Error('Project directory could not be located beside the launcher.');
    fs.appendFileSync(preferredPath, '');
    diagnosticsPath = preferredPath;
  } catch (projectError) {
    const fallbackPath = path.join(app.getPath('userData'), 'runtime-diagnostics.log');
    try {
      fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
      fs.appendFileSync(fallbackPath, '');
      diagnosticsPath = fallbackPath;
      if (!diagnosticsFallbackReported) {
        diagnosticsFallbackReported = true;
        console.error(`[runtime-diagnostics] Could not write project log (${preferredPath || 'project directory unavailable'}): ${projectError.message}. Using fallback log: ${fallbackPath}`);
      }
    } catch (fallbackError) {
      console.error(`[runtime-diagnostics] Unable to write project log (${preferredPath || 'project directory unavailable'}) or fallback log (${fallbackPath}): ${fallbackError.message}`);
      return null;
    }
  }
  return diagnosticsPath;
}

function diagnostic(message, detail = '') {
  try {
    const timestamp = new Date().toISOString();
    let formattedDetail = '';
    if (detail) {
      try { formattedDetail = typeof detail === 'string' ? detail : JSON.stringify(detail); }
      catch { formattedDetail = String(detail); }
    }
    const line = `${timestamp} ${message}${formattedDetail ? ` ${formattedDetail}` : ''}\n`;
    const logPath = initializeDiagnosticsPath();
    if (logPath) fs.appendFileSync(logPath, line);
  } catch (error) {
    console.error(`[runtime-diagnostics] Log write failed: ${error.stack || error.message}`);
  }
}

process.on('uncaughtExceptionMonitor', error => {
  diagnostic('main-uncaught-exception', { message: error?.message || String(error), stack: error?.stack });
});

app.setName('Sci-Fi Tower Defense RPG');
const userDataOverride = process.env.SCIFI_TD_USER_DATA_DIR;
app.setPath('userData', userDataOverride
  ? path.resolve(userDataOverride)
  : path.join(app.getPath('appData'), 'Sci-Fi Tower Defense RPG'));
diagnostic('main-start', {
  packaged: app.isPackaged,
  executable: app.getPath('exe'),
  userData: app.getPath('userData'),
});

let mainWindow = null;

function getGameIndexPath() {
  const projectRoot = findProjectRoot();
  const distPath = projectRoot && path.join(projectRoot, 'dist');
  const indexPath = distPath && path.join(distPath, 'index.html');
  const bundlePath = distPath && path.join(distPath, 'bundle.js');
  const buildInfoPath = distPath && path.join(distPath, 'build-info.json');
  const buildCommand = 'npm run build';

  if (!projectRoot || !fs.existsSync(indexPath) || !fs.existsSync(bundlePath)) {
    throw new Error(`The latest game build was not found beside this launcher.\n\nOpen a terminal in the game project folder and run:\n  ${buildCommand}\n\nKeep this launcher inside the game project folder.`);
  }

  if (!app.isPackaged) return indexPath;
  if (!fs.existsSync(buildInfoPath)) {
    throw new Error(`The game build is incomplete or out of date.\n\nOpen a terminal in the game project folder and run:\n  ${buildCommand}`);
  }

  let buildInfo;
  try {
    buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
  } catch {
    throw new Error(`The game build is incomplete or out of date.\n\nOpen a terminal in the game project folder and run:\n  ${buildCommand}`);
  }

  const currentFingerprint = getBuildFingerprint(projectRoot);
  diagnostic('build-fingerprint', { stored: buildInfo.fingerprint, current: currentFingerprint });
  if (buildInfo.fingerprint !== currentFingerprint) {
    throw new Error(`The game source or assets changed after the last production build.\n\nOpen a terminal in the game project folder and run:\n  ${buildCommand}`);
  }

  return indexPath;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    resizable: true,
    show: false,
    backgroundColor: '#07111b',
    autoHideMenuBar: true,
    title: 'Sci-Fi Tower Defense RPG',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'diagnostics-preload.cjs'),
    },
  });

  mainWindow = window;
  const indexPath = getGameIndexPath();
  diagnostic('window-created', { indexPath, bounds: window.getBounds() });
  window.once('ready-to-show', () => {
    diagnostic('window-ready-to-show');
    window.show();
  });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.webContents.on('did-start-loading', () => diagnostic('renderer-did-start-loading'));
  window.webContents.on('dom-ready', () => diagnostic('renderer-dom-ready'));
  window.webContents.on('did-finish-load', () => diagnostic('renderer-did-finish-load', { url: window.webContents.getURL() }));
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    diagnostic('renderer-console-message', { level, message, line, source: sourceId });
  });
  window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    diagnostic('renderer-did-fail-load', { code, description, url, isMainFrame });
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    diagnostic('renderer-process-gone', details);
  });
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    diagnostic('renderer-preload-error', { preloadPath, message: error?.message, stack: error?.stack });
  });
  window.webContents.session.webRequest.onErrorOccurred({ urls: ['file://*/*'] }, details => {
    diagnostic('resource-load-failed', {
      url: details.url,
      method: details.method,
      resourceType: details.resourceType,
      error: details.error,
    });
  });
  ipcMain.on('runtime-diagnostic', (_event, entry) => {
    diagnostic(entry?.type || 'renderer-diagnostic', entry?.detail || {});
  });
  window.loadFile(indexPath).then(() => diagnostic('renderer-load-complete')).catch(error => {
    diagnostic('renderer-load-promise-rejected', { message: error.message, stack: error.stack });
    dialog.showErrorBox('Unable to open the game', error.message);
    app.quit();
  });
  return window;
}

app.whenReady().then(() => {
  diagnostic('app-ready');
  app.setAppUserModelId('com.scifi.towerdefense.rpg');
  try {
    createWindow();
  } catch (error) {
    diagnostic('window-creation-error', { message: error.message, stack: error.stack });
    dialog.showErrorBox('Unable to open the game', error.message);
    app.quit();
    return;
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
