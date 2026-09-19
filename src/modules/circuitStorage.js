const operations = ['save', 'list', 'load', 'delete', 'writePreview', 'readPreview'];

export function isCircuitStorageAvailable() {
  const bridge = globalThis.window?.bitwiserCircuitStore;
  return Boolean(bridge && operations.every(name => typeof bridge[name] === 'function'));
}

async function request(operation, ...args) {
  if (!isCircuitStorageAvailable()) throw Object.assign(new Error('NATIVE_UNAVAILABLE'), { code: 'NATIVE_UNAVAILABLE' });
  const result = await window.bitwiserCircuitStore[operation](...args);
  if (!result?.ok) throw Object.assign(new Error(result?.error || 'IO_ERROR'), { code: result?.error || 'IO_ERROR' });
  return result.value;
}

export const circuitStorage = Object.fromEntries(operations.map(name => [name, (...args) => request(name, ...args)]));

export function storageErrorMessage(error, translate) {
  const key = {
    NATIVE_UNAVAILABLE: 'nativeSaveUnavailable', NOT_FOUND: 'localSaveMissing', CORRUPT: 'localSaveCorrupt',
    PERMISSION: 'localSavePermission', NO_SPACE: 'localSaveNoSpace', INVALID_REQUEST: 'incompatibleCircuit',
    UNSAFE_PATH: 'localSaveUnsafePath'
  }[error?.code] || 'localSaveError';
  return translate(key);
}
