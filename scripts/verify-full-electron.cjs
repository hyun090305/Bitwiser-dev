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
          const {createBlueprintPng} = await import('./src/canvas/blueprintExport.js');
          const circuit = {rows:6,cols:6,blocks:{i:{id:'i',type:'INPUT',name:'DATA',pos:{r:1,c:1}},o:{id:'o',type:'OUTPUT',name:'GO',pos:{r:1,c:3}}},wires:{w:{id:'w',startBlockId:'i',endBlockId:'o',path:[{r:1,c:1},{r:1,c:2},{r:1,c:3}]}}};
          const before = JSON.stringify(circuit);
          const png = await createBlueprintPng({circuit,title:'Electron blueprint',totalCost:1,stars:2,lang:'en'});
          const {renderPerformance,disposePerformance} = await import('./src/modules/costUI.js');
          const host = document.createElement('div');document.body.append(host);
          renderPerformance(host,{id:0,title:'Tutorial',result:{record:{circuit,totalCost:1,stars:0}},lang:'en'});
          const tutorial = !host.querySelector('.cost-stars,.cost-ranking') && host.querySelector('.blueprint-card').dataset.phase==='settled';
          disposePerformance(host);host.remove();
          const blueprint = png.blob.type==='image/png' && png.blob.size>1000 && png.width===1200 && JSON.stringify(circuit)===before && tutorial;
          return { url: location.href, stages: Object.keys(levels.getLevelTitles()).length,
            blueprint,
            hasGame: Boolean(document.getElementById('gameScreen')),
            startReady: document.getElementById('loadingStartBtn')?.disabled === false,
            hasLegacyAccount: Boolean(document.getElementById('googleLoginBtn')),
            hasLegacyLabNode: (await (await fetch('stage_map.json')).json()).nodes.some(n => n.id === 'lab') };
        })()`);
        fs.writeFileSync(path.join(root, 'test-results', 'electron-smoke.json'), JSON.stringify({ ...result, errors }, null, 2));
        console.log(JSON.stringify({ ...result, errors }));
        app.exit(result.stages === 47 && result.startReady && result.hasGame && result.hasLegacyAccount && result.hasLegacyLabNode && result.blueprint && !errors.length ? 0 : 1);
      } catch (error) { console.error(error); app.exit(1); }
    }, 7000);
  });
});
setTimeout(() => { console.error('Electron smoke timed out'); app.exit(1); }, 30000);
require('../electron/main.js');
