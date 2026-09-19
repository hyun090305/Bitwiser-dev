// Smoke-test the existing Electron entry without showing a window or touching
// the user's Electron profile. Never grades or saves to the legacy backend.
const electron = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const { app } = electron;
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.setPath('userData', path.join(root, 'test-results', 'electron-smoke-profile'));
const OriginalWindow = electron.BrowserWindow;
const Module = require('node:module');
const testElectron = Object.create(electron);
Object.defineProperty(testElectron, 'BrowserWindow', { value: class extends OriginalWindow {
  constructor(options) { super({ ...options, show: false }); }
} });
const originalLoad = Module._load;
Module._load = function(id) { return id === 'electron' ? testElectron : originalLoad.apply(this, arguments); };
const errors = [];
app.on('browser-window-created', (_, win) => {
  win.webContents.on('console-message', (event, level, message) => {
    const severity = event.level ?? level;
    if (severity === 'error' || severity === 3) errors.push({ message: event.message ?? message, source: event.sourceId, line: event.lineNumber });
  });
  win.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const result = await win.webContents.executeJavaScript(`(async () => {
          const levels = await import('./src/modules/levels.js');
          await levels.getStageDataPromise();
          return { url: location.href, stages: Object.keys(levels.getLevelTitles()).length,
            hasGame: Boolean(document.getElementById('gameScreen')),
            startReady: document.getElementById('loadingStartBtn')?.disabled === false,
            hasLegacyAccount: Boolean(document.getElementById('googleLoginBtn')),
            hasLegacyLabNode: (await (await fetch('stage_map.json')).json()).nodes.some(n => n.id === 'lab') };
        })()`);
        fs.writeFileSync(path.join(root, 'test-results', 'electron-smoke.json'), JSON.stringify({ ...result, errors }, null, 2));
        console.log(JSON.stringify({ ...result, errors }));
        app.exit(result.stages === 47 && result.startReady && result.hasGame && result.hasLegacyAccount && result.hasLegacyLabNode && !errors.length ? 0 : 1);
      } catch (error) { console.error(error); app.exit(1); }
    }, 7000);
  });
});
setTimeout(() => { console.error('Electron smoke timed out'); app.exit(1); }, 30000);
require('../electron/main.js');
