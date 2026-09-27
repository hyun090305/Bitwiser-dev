const { app } = require('electron');
const path = require('node:path');
const { renderDevShell } = require('../../scripts/dev-shell.cjs');

if (app.isPackaged) throw new Error('Developer mode is only available from the source checkout');
require('../app.cjs').launch({
  // Must differ from package.json's "bitwiser-dev" even on case-insensitive disks.
  userData: path.join(app.getPath('appData'), 'Bitwiser-DevTools'),
  title: 'Bitwiser DEV',
  transformHTML: renderDevShell,
  configureSession(session) {
    session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_, callback) => callback({ cancel: true }));
    // Restart must read edited source. This clears only DEV resource caches,
    // leaving localStorage and native circuit saves intact.
    return session.clearCache();
  }
});
