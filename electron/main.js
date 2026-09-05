const { app, BrowserWindow, net, protocol, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_HOST = 'bitwiser';
const ROOT_DIR = path.resolve(__dirname, '..');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

function resolveAppPath(requestUrl) {
  const url = new URL(requestUrl);

  if (url.hostname !== APP_HOST) {
    return null;
  }

  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.normalize(path.join(ROOT_DIR, pathname));

  if (!filePath.startsWith(ROOT_DIR + path.sep) && filePath !== ROOT_DIR) {
    return null;
  }

  return filePath;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'Bitwiser',
    icon: path.join(ROOT_DIR, 'assets', 'icon.ico'),
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.removeMenu();

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadURL(`app://${APP_HOST}/index.html`);
}

app.whenReady().then(() => {
  protocol.handle('app', async (request) => {
    const filePath = resolveAppPath(request.url);

    if (!filePath) {
      return new Response('Forbidden', { status: 403 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
