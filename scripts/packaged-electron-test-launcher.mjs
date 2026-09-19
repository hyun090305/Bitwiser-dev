import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { chromium } from 'playwright';

// Packaged Electron ignores the default_app -r launcher option. Pause its main
// script before it runs, install the isolated profile/network test hook, verify
// the profile, then resume the unchanged packaged application.
export async function launchPackagedElectron({ executablePath, hook, profile, env }) {
  const child = spawn(executablePath, ['--inspect-brk=0', '--remote-debugging-port=0'], { env, windowsHide: true });
  const events = new EventEmitter();
  let stderr = '', sequence = 0, socket, browser;
  const pending = new Map();
  const timeout = setTimeout(() => { events.emit('failure', new Error('Packaged Electron launch timed out')); }, 30000);
  const failure = new Promise((_, reject) => events.once('failure', reject));
  child.on('error', error => events.emit('failure', error));
  child.once('exit', () => events.emit('failure', new Error(`Packaged Electron exited during launch: ${stderr}`)));
  const urls = {};
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
    for (const [key, pattern] of [['node', /Debugger listening on (ws:\/\/[^\s]+)/], ['chrome', /DevTools listening on (ws:\/\/[^\s]+)/]]) {
      const url = stderr.match(pattern)?.[1];
      if (url && !urls[key]) { urls[key] = url; events.emit(key, url); }
    }
  });
  const url = key => urls[key] ? Promise.resolve(urls[key]) : once(events, key).then(([value]) => value);
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const checkedValue = result => {
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  };
  try {
    socket = new WebSocket(await Promise.race([url('node'), failure]));
    await once(socket, 'open');
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const request = pending.get(message.id); pending.delete(message.id);
        if (message.error) request?.reject(new Error(message.error.message)); else request?.resolve(message.result);
      } else events.emit(message.method, message.params);
    });
    await command('Debugger.enable');
    const paused = once(events, 'Debugger.paused');
    await command('Runtime.runIfWaitingForDebugger');
    const [pause] = await Promise.race([paused, failure]);
    const installed = checkedValue(await command('Debugger.evaluateOnCallFrame', {
      callFrameId: pause.callFrames[0].callFrameId,
      expression: `require(${JSON.stringify(hook)}); global.__bitwiserTestElectron.app.getPath('userData')`,
      returnByValue: true
    }));
    if (installed !== profile) throw new Error('Packaged test profile was not installed before startup');
    await command('Debugger.resume');
    await command('Debugger.disable');
    browser = await chromium.connectOverCDP(await Promise.race([url('chrome'), failure]));
    clearTimeout(timeout);
    return {
      process: () => child,
      firstWindow: async () => {
        const context = browser.contexts()[0];
        return context.pages()[0] || context.waitForEvent('page');
      },
      evaluate: async (fn, arg) => checkedValue(await command('Runtime.evaluate', {
        expression: `(${fn.toString()})(global.__bitwiserTestElectron, ${JSON.stringify(arg) ?? 'undefined'})`,
        returnByValue: true, awaitPromise: true
      })),
      close: async () => {
        const exited = child.exitCode == null ? once(child, 'exit') : Promise.resolve();
        await command('Runtime.evaluate', { expression: 'global.__bitwiserTestElectron.app.quit()' }).catch(() => {});
        socket.close();
        await browser.close();
        await exited;
      }
    };
  } catch (error) {
    socket?.close(); await browser?.close().catch(() => {});
    child.kill(); throw error;
  } finally { clearTimeout(timeout); }
}
