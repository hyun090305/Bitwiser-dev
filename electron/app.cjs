const { app, BrowserWindow, net, protocol, shell, ipcMain, session } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { createCircuitStore } = require('./circuit-store.cjs');
const { registerCircuitIPC } = require('./circuit-ipc.cjs');

function launch({ userData, title = 'Bitwiser', transformHTML, configureSession } = {}) {
  if (userData) {
    app.setPath('userData', userData);
    app.setPath('sessionData', userData);
  }
  const APP_HOST = 'bitwiser';
  const ROOT_DIR = path.resolve(__dirname, '..');
  const trustedContents = new Set();
  const windows = new Set();
  const ownsProfile = app.requestSingleInstanceLock();
  if (!ownsProfile) app.quit();

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
      title,
      icon: path.join(ROOT_DIR, 'assets', 'icon.ico'),
      backgroundColor: '#ffffff',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    win.removeMenu();
    if (title !== 'Bitwiser') win.on('page-title-updated', event => { event.preventDefault(); win.setTitle(title); });
    windows.add(win);
    win.once('closed', () => windows.delete(win));
    const contents = win.webContents;
    trustedContents.add(contents);
    contents.once('destroyed', () => trustedContents.delete(contents));

    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    win.loadURL(`app://${APP_HOST}/index.html`);
  }

  app.whenReady().then(async () => {
    if (!ownsProfile) return;
    if (configureSession) await configureSession(session.defaultSession);
    registerCircuitIPC(ipcMain, createCircuitStore(app.getPath('userData')), trustedContents);
    protocol.handle('app', async (request) => {
      const filePath = resolveAppPath(request.url);

      if (!filePath) {
        return new Response('Forbidden', { status: 403 });
      }

      const response = await net.fetch(pathToFileURL(filePath).toString());
      if (transformHTML && filePath === path.join(ROOT_DIR, 'index.html')) {
        return new Response(transformHTML(await response.text()), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
      return response;
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
  app.on('second-instance', () => {
    const win = [...windows][0];
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
}

module.exports = { launch };
