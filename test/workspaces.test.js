const assert = require('node:assert/strict');
const Module = require('node:module');
const { test } = require('node:test');

const handlers = new Map();
const calls = [];
const electron = {
  app: {
    getPath: () => require('node:os').tmpdir(),
    on() {},
    whenReady: () => ({ then() {} }),
    commandLine: { appendSwitch() {} },
    disableHardwareAcceleration() {}
  },
  BrowserWindow: class {},
  Menu: { setApplicationMenu() {} },
  ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
  shell: {}
};
const childProcess = require('node:child_process');
const originalLoad = Module._load;
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'linux' });
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electron;
  if (request === 'child_process') {
    return {
      ...childProcess,
      execFile: (command, args, options, callback) => {
        calls.push(args);
        const output = args[0] === '-d'
          ? '0  - DG: 1920x1080  VP: 0,0  WA: 0,0  N/A Desktop 1\n1  * DG: 1920x1080  VP: 0,0  WA: 0,0  N/A Desktop 2\n2  - DG: 1920x1080  VP: 0,0  WA: 0,0  N/A Desktop 3\n3  - DG: 1920x1080  VP: 0,0  WA: 0,0  N/A Desktop 4\n'
          : '';
        process.nextTick(() => callback(null, output, ''));
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
try {
  require('../main.js');
} finally {
  Module._load = originalLoad;
  Object.defineProperty(process, 'platform', originalPlatform);
}

const invoke = (name, ...args) => handlers.get(name)({}, ...args);

test('workspace API lists four desktops and identifies the active one', async () => {
  assert.deepEqual(await invoke('sys:workspaces'), {
    available: true,
    workspaces: [
      { index: 0, name: 'Desktop 1', active: false },
      { index: 1, name: 'Desktop 2', active: true },
      { index: 2, name: 'Desktop 3', active: false },
      { index: 3, name: 'Desktop 4', active: false }
    ],
    current: 1
  });
});

test('workspace API validates indices before switching', async () => {
  assert.deepEqual(await invoke('sys:workspace:set', 2), { ok: true, index: 2 });
  assert.deepEqual(await invoke('sys:workspace:set', 4), { ok: false, error: 'Invalid desktop workspace.' });
  assert.deepEqual(calls, [['-d'], ['-s', '2']]);
});
