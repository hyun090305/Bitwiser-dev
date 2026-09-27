// Preload with -r before the real normal/DEV entry. Only appData is redirected:
// Electron must derive the normal app name and profile from package.json itself.
const electron = require('electron');
const { app } = electron;
const path = require('node:path');
const Module = require('node:module');
const testRoot = path.resolve(__dirname, '..', 'test-results');
if (!process.env.BITWISER_TEST_APPDATA || !path.resolve(process.env.BITWISER_TEST_APPDATA).startsWith(testRoot + path.sep)) throw new Error('Dedicated test appData required');
app.setPath('appData', process.env.BITWISER_TEST_APPDATA);
app.disableHardwareAcceleration();
if (process.env.BITWISER_TEST_NORMAL === '1') app.whenReady().then(() => {
  electron.session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_, callback) => callback({ cancel: true }));
});
const originalLoad = Module._load;
const testElectron = Object.create(electron);
// Preserve the class name used by Electron's BrowserWindow.getAllWindows().
Object.defineProperty(testElectron, 'BrowserWindow', { value: class BrowserWindow extends electron.BrowserWindow {
  constructor(options) { super({ ...options, show: false, webPreferences: { ...options.webPreferences, backgroundThrottling: false } }); }
} });
Module._load = function(id) { return id === 'electron' ? testElectron : originalLoad.apply(this, arguments); };
