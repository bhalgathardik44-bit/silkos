const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'silkos-files-test-'));
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

test('Finder hides dotfiles by default and shows them when enabled', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'silkos-finder-test-'));
  t.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(directory, 'visible.txt'), '');
  fs.writeFileSync(path.join(directory, '.hidden'), '');

  const normal = await invoke('fs:list', directory);
  const hidden = await invoke('fs:list', directory, true);
  const invalidPreference = await invoke('fs:list', directory, 'true');

  assert.deepEqual(normal.items.map(item => item.name), ['visible.txt']);
  assert.deepEqual(hidden.items.map(item => item.name).sort(), ['.hidden', 'visible.txt']);
  assert.deepEqual(invalidPreference.items.map(item => item.name), ['visible.txt']);
});
