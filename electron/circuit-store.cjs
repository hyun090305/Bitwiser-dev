const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_PREVIEW_BYTES = 16 * 1024 * 1024;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const validateId = id => { if (typeof id !== 'string' || !ID_PATTERN.test(id)) fail('INVALID_REQUEST'); };
const schema = import('../src/modules/savedCircuitRecord.js');

// Only main chooses a profile. Neither renderer requests nor circuit JSON can
// select directories. Steam profile selection belongs here in a later change.
function getSavePaths(userData) {
  return {
    root: path.resolve(userData),
    circuits: path.resolve(userData, 'saves', 'profiles', 'local', 'circuits'),
    previews: path.resolve(userData, 'cache', 'circuit-previews', 'local')
  };
}

function errorCode(error) {
  if (['INVALID_REQUEST', 'CORRUPT', 'UNSAFE_PATH', 'FORBIDDEN', 'NOT_FOUND'].includes(error?.code)) return error.code;
  if (error?.code === 'ENOENT') return 'NOT_FOUND';
  if (['EACCES', 'EPERM', 'EROFS'].includes(error?.code)) return 'PERMISSION';
  if (['ENOSPC', 'EDQUOT'].includes(error?.code)) return 'NO_SPACE';
  return 'IO_ERROR';
}

function createCircuitStore(userData, { io = fs, newId = randomUUID } = {}) {
  const paths = getSavePaths(userData);
  let pending = Promise.resolve();
  // Serialize all operations, including reads, so deletion cannot race a
  // preview write or expose an in-progress commit. A rejected request does not
  // poison the queue. The application also owns a single-instance lock.
  const queue = action => {
    const result = pending.then(action);
    pending = result.catch(() => {});
    return result;
  };
  async function stat(file) {
    try { return await io.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async function directory(dir, create = false) {
    if (!dir.startsWith(paths.root + path.sep)) fail('UNSAFE_PATH');
    if (create) await io.mkdir(paths.root, { recursive: true });
    let current = paths.root;
    for (const part of ['', ...path.relative(paths.root, dir).split(path.sep)]) {
      if (part) current = path.join(current, part);
      let info = await stat(current);
      if (!info && create) { await io.mkdir(current); info = await io.lstat(current); }
      if (!info) return false;
      if (info.isSymbolicLink() || !info.isDirectory()) fail('UNSAFE_PATH');
    }
    return true;
  }
  function filePath(dir, id, ext) {
    validateId(id);
    const file = path.resolve(dir, `${id}.${ext}`);
    if (path.dirname(file) !== dir) fail('UNSAFE_PATH');
    return file;
  }
  async function regularFile(file, maxBytes) {
    const info = await stat(file);
    if (!info) fail('NOT_FOUND');
    if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) fail('UNSAFE_PATH');
    if (info.size > maxBytes) fail('CORRUPT');
    return file;
  }
  async function atomicWrite(dir, id, ext, bytes) {
    await directory(dir, true);
    const target = filePath(dir, id, ext);
    if (await stat(target)) fail('INVALID_REQUEST'); // Never overwrite a save.
    const temp = path.join(dir, `${id}.${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await io.open(temp, 'wx', 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close(); handle = null;
      await io.rename(temp, target);
    } finally {
      await handle?.close().catch(() => {});
      await io.unlink(temp).catch(() => {});
    }
  }
  async function readRecord(id) {
    const { MAX_RECORD_BYTES, validateSavedCircuitRecord } = await schema;
    const file = filePath(paths.circuits, id, 'json');
    if (!await directory(paths.circuits)) fail('NOT_FOUND');
    await regularFile(file, MAX_RECORD_BYTES);
    const text = await io.readFile(file, 'utf8');
    if (Buffer.byteLength(text) > MAX_RECORD_BYTES) fail('CORRUPT');
    try { return validateSavedCircuitRecord(JSON.parse(text)); } catch { fail('CORRUPT'); }
  }
  return {
    save: record => queue(async () => {
      const { MAX_RECORD_BYTES, validateSavedCircuitRecord } = await schema;
      let bytes;
      try {
        bytes = JSON.stringify(record);
        if (Buffer.byteLength(bytes) > MAX_RECORD_BYTES) fail('INVALID_REQUEST');
        bytes = JSON.stringify(validateSavedCircuitRecord(JSON.parse(bytes)));
      } catch { fail('INVALID_REQUEST'); }
      const id = newId(); validateId(id);
      await atomicWrite(paths.circuits, id, 'json', bytes);
      return { id };
    }),
    list: context => queue(async () => {
      const { validateSaveContext, matchesSaveContext } = await schema;
      try { context = validateSaveContext(context); } catch { fail('INVALID_REQUEST'); }
      const items = [], issues = [];
      if (!await directory(paths.circuits)) return { items, issues };
      for (const name of await io.readdir(paths.circuits)) {
        if (!name.endsWith('.json') || !ID_PATTERN.test(name.slice(0, -5))) continue;
        const id = name.slice(0, -5);
        try {
          const record = await readRecord(id);
          if (matchesSaveContext(record, context)) {
            const { circuit, ...metadata } = record;
            const timestamp = record.timestamp ?? (await io.lstat(filePath(paths.circuits, id, 'json'))).mtime.toISOString();
            items.push({ id, ...metadata, timestamp });
          }
        } catch (error) { issues.push({ id, code: errorCode(error) }); }
      }
      items.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || b.id.localeCompare(a.id));
      return { items, issues };
    }),
    load: id => queue(() => readRecord(id)),
    writePreview: (id, bytes) => queue(async () => {
      validateId(id);
      if (!(bytes instanceof Uint8Array) || bytes.length > MAX_PREVIEW_BYTES || bytes.length < 6
        || !['GIF87a', 'GIF89a'].includes(Buffer.from(bytes.subarray(0, 6)).toString('ascii'))) fail('INVALID_REQUEST');
      await readRecord(id); // A deleted save must not gain an orphan preview.
      await atomicWrite(paths.previews, id, 'gif', bytes);
      return true;
    }),
    readPreview: id => queue(async () => {
      const file = filePath(paths.previews, id, 'gif');
      await readRecord(id);
      if (!await directory(paths.previews) || !await stat(file)) return null;
      await regularFile(file, MAX_PREVIEW_BYTES);
      const bytes = await io.readFile(file);
      if (bytes.length > MAX_PREVIEW_BYTES || !['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) fail('CORRUPT');
      return new Uint8Array(bytes);
    }),
    delete: id => queue(async () => {
      const file = filePath(paths.circuits, id, 'json');
      const present = await directory(paths.circuits) && await stat(file);
      if (present) {
        // Corrupt JSON can be explicitly deleted, but never follow a link.
        await regularFile(file, Infinity);
        await io.unlink(file);
      }
      let previewWarning = null;
      try {
        const preview = filePath(paths.previews, id, 'gif');
        if (await directory(paths.previews) && await stat(preview)) {
          await regularFile(preview, Infinity); await io.unlink(preview);
        }
      } catch (error) { previewWarning = errorCode(error); }
      return { removed: Boolean(present), previewWarning };
    })
  };
}

module.exports = { createCircuitStore, getSavePaths, errorCode };
