const { app } = require('electron');
const path = require('node:path');
const testRoot = path.resolve(__dirname, '..', 'test-results');
if (!process.env.BITWISER_TEST_APPDATA || !path.resolve(process.env.BITWISER_TEST_APPDATA).startsWith(testRoot + path.sep)) throw new Error('Dedicated test appData required');
app.setPath('appData', process.env.BITWISER_TEST_APPDATA);
app.disableHardwareAcceleration();
app.on('browser-window-created', (_, win) => { win.hide(); });
require('../electron/dev/main.cjs');
