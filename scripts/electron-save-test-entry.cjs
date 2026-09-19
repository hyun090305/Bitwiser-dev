// Test-only launcher. Product packaging does not include scripts/.
const electron = require('electron');
global.__bitwiserTestElectron = electron;
const path = require('node:path');
const Module = require('node:module');
const profile = process.env.BITWISER_TEST_PROFILE;
const testRoot = path.resolve(__dirname, '..', 'test-results');
if (!profile || !path.resolve(profile).startsWith(testRoot + path.sep)) throw new Error('A dedicated test profile is required');
electron.app.setPath('userData', profile);
electron.app.disableHardwareAcceleration();
electron.app.whenReady().then(() => {
  Module._load = originalLoad;
  global.blockedRequests = [];
  electron.session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    global.blockedRequests.push(details.url);
    callback({ cancel: true });
  });
});
const testElectron = Object.create(electron);
Object.defineProperty(testElectron, 'BrowserWindow', { value: class extends electron.BrowserWindow {
  constructor(options) {
    super({ ...options, show: false, webPreferences: { ...options.webPreferences, backgroundThrottling: false } });
    global.testWindow = this;
  }
} });
const originalLoad = Module._load;
Module._load = function(id) { return id === 'electron' ? testElectron : originalLoad.apply(this, arguments); };
if (!electron.app.isPackaged) {
  require('../electron/main.js');
  Module._load = originalLoad;
}
