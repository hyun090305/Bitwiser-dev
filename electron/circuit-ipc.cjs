const { errorCode } = require('./circuit-store.cjs');

function isTrustedSender(event, trustedContents) {
  return trustedContents.has(event.sender) && event.senderFrame === event.sender.mainFrame
    && event.senderFrame?.url === 'app://bitwiser/index.html';
}

function registerCircuitIPC(ipcMain, store, trustedContents) {
  for (const operation of ['save', 'list', 'load', 'delete', 'writePreview', 'readPreview']) {
    ipcMain.handle(`circuit-store:${operation}`, async (event, ...args) => {
      if (!isTrustedSender(event, trustedContents)) return { ok: false, error: 'FORBIDDEN' };
      if (args.length !== (operation === 'writePreview' ? 2 : 1)) return { ok: false, error: 'INVALID_REQUEST' };
      try { return { ok: true, value: await store[operation](...args) }; }
      catch (error) { return { ok: false, error: errorCode(error) }; }
    });
  }
}

module.exports = { registerCircuitIPC, isTrustedSender };
