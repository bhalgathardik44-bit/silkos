const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'silkos-lock-test-'));
const handlers = new Map();
const electron = {
  app: { getPath: () => userData, on() {}, whenReady: () => ({ then() {} }) },
  BrowserWindow: class {},
  Menu: { setApplicationMenu() {} },
  ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
  shell: {}
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
};
try {
  require('../main.js');
} finally {
  Module._load = originalLoad;
}

const invoke = (name, ...args) => handlers.get(name)({}, ...args);

test('screen-lock passwords are hashed and require the current password to change', async t => {
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));

  assert.deepEqual(await invoke('lock:status'), { ok: true, configured: false });
  assert.equal((await invoke('lock:set-password', '')).ok, false);
  assert.equal((await invoke('lock:set-password', 'x'.repeat(4097))).ok, false);
  assert.deepEqual(await invoke('lock:set-password', 'x'), { ok: true });

  const file = path.join(userData, 'screen-lock.json');
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(stored.version, 1);
  assert.equal(Buffer.from(stored.salt, 'base64').length, 16);
  assert.equal(Buffer.from(stored.hash, 'base64').length, 64);
  assert.equal(JSON.stringify(stored).includes('"x"'), false);

  assert.deepEqual(await invoke('lock:verify', 'wrong'), { ok: true, valid: false });
  assert.equal((await invoke('lock:set-password', 'new')).ok, false);
  assert.equal((await invoke('lock:set-password', 'new', 'wrong')).ok, false);
  assert.deepEqual(await invoke('lock:set-password', 'new', 'x'), { ok: true });
  assert.deepEqual(await invoke('lock:verify', 'x'), { ok: true, valid: false });
  assert.deepEqual(await invoke('lock:verify', 'new'), { ok: true, valid: true });
});
