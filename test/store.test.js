const assert = require('node:assert/strict');
const Module = require('node:module');
const { test } = require('node:test');

const replies = [
  { command: 'remote-add', stderr: '' },
  { command: 'update', stderr: 'Temporary network failure' },
  { command: 'remote-add', stderr: '' },
  { command: 'update', stderr: '' },
  { command: 'search', stderr: 'Search service unavailable' },
  { command: 'list', stderr: 'Permission denied' }
];
const calls = [];
const handlers = new Map();
let lsblkFails = false;
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
        if (command === 'lsblk') {
          const output = JSON.stringify({ blockdevices: [
            { name: 'sda', type: 'disk', size: 4000000000, ro: false },
            { name: 'sdb', type: 'disk', size: 8500000000, ro: false }
          ] });
          process.nextTick(() => callback(lsblkFails ? new Error('device scan failed') : null, output, ''));
          return;
        }
        assert.equal(command, 'flatpak');
        const reply = replies.shift();
        assert.ok(reply, `Unexpected Flatpak call: ${args.join(' ')}`);
        assert.equal(args[0], reply.command);
        calls.push(args[0]);
        process.nextTick(() => callback(
          reply.stderr ? new Error(reply.stderr) : null,
          '',
          reply.stderr
        ));
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

test('Store surfaces Flatpak failures and retries a failed app-catalog setup', async () => {
  assert.deepEqual(await invoke('store:search', 'Spotify'), {
    error: 'Could not load the Flathub app catalog: Temporary network failure'
  });
  assert.deepEqual(await invoke('store:install', '../invalid'), {
    ok: false,
    error: 'Invalid app ID.'
  });
  assert.deepEqual(await invoke('store:search', 'Spotify'), {
    error: 'Could not search Flathub: Search service unavailable'
  });
  assert.deepEqual(await invoke('store:installed'), {
    error: 'Could not list installed apps: Permission denied'
  });
  assert.deepEqual(calls, ['remote-add', 'update', 'remote-add', 'update', 'search', 'list']);
  assert.equal(replies.length, 0);

  assert.deepEqual(await invoke('persist:status'), {
    on: false,
    has: '',
    disk: { name: 'sdb', size: '9 GB' }
  });
  lsblkFails = true;
  assert.deepEqual(await invoke('persist:status'), { error: 'Could not inspect storage devices.' });
});
