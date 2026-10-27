const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.setName('Sci-Fi Tower Defense RPG');
app.setPath('userData', path.join(app.getPath('appData'), 'Sci-Fi Tower Defense RPG'));

let mainWindow = null;

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
    },
  });

  mainWindow = window;
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  return window;
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.scifi.towerdefense.rpg');
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
