const { app, BrowserWindow, dialog, Menu, session } = require('electron');
const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

let server;
let mainWindow;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

function configurePermissions() {
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowedPermissions = new Set([
        'media',
        'notifications',
        'clipboard-read',
        'fullscreen',
      ]);
      callback(allowedPermissions.has(permission));
    }
  );
}

function checkForUpdates() {
  if (!app.isPackaged) {
    return;
  }

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', async () => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['إعادة التشغيل الآن', 'لاحقاً'],
      defaultId: 0,
      cancelId: 1,
      title: 'تحديث جديد متاح',
      message: 'تم تنزيل تحديث جديد لمجلس. هل تريد إعادة تشغيل التطبيق لتثبيته؟',
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
  autoUpdater.on('error', (error) => {
    console.error('Majlis update check failed:', error);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error('Majlis update check failed:', error);
    });
  }, 10000);
}

function getIceServers() {
  const username = process.env.TURN_USERNAME || '';
  const password = process.env.TURN_PASSWORD || '';

  return [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80', username, credential: password },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username, credential: password },
    { urls: 'turn:global.relay.metered.ca:443', username, credential: password },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username, credential: password },
  ];
}

async function startServer() {
  const expressApp = express();
  const distDir = path.join(__dirname, '..', 'dist');

  expressApp.use(express.json());
  expressApp.get('/api/ice-servers', (_request, response) => {
    response.json({ iceServers: getIceServers() });
  });
  expressApp.get('/api/turn-credentials', (_request, response) => {
    response.json({ iceServers: getIceServers() });
  });
  expressApp.use(express.static(distDir));
  expressApp.get('*', (_request, response) => {
    response.sendFile(path.join(distDir, 'index.html'));
  });

  return new Promise((resolve, reject) => {
    server = expressApp.listen(0, '127.0.0.1', () => {
      resolve(server.address().port);
    });
    server.on('error', reject);
  });
}

async function createWindow() {
  const port = await startServer();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#1E1F22',
    autoHideMenuBar: true,
    menuBarVisible: false,
    show: false,
    title: 'Majlis',
    icon: path.join(__dirname, '..', 'majlis.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.removeMenu();
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const allowedAuthUrls = [
      'https://accounts.google.com/',
      'https://stalwart-surface-46tvw.firebaseapp.com/',
      'https://stalwart-surface-46tvw.web.app/',
    ];
    if (allowedAuthUrls.some((allowedUrl) => url.startsWith(allowedUrl))) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          autoHideMenuBar: true,
          menuBarVisible: false,
          backgroundColor: '#1E1F22',
        },
      };
    }
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://127.0.0.1:')) {
      event.preventDefault();
    }
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) {
    return;
  }
  Menu.setApplicationMenu(null);
  configurePermissions();

  createWindow().catch((error) => {
    console.error('Failed to start Majlis:', error);
    app.quit();
  });
  checkForUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('second-instance', () => {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (server) {
    server.close();
  }
});
