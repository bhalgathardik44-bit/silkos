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
  shell: {},
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) }
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
        calls.push({ command, args });
        let out = '';
        if (command === 'nmcli') {
          if (args[0] === 'radio') out = 'enabled\n';
          else if (args.includes('status')) out = 'ethernet:connected:Wired\nwifi:connected:Home\\: Network\n';
          else if (args.includes('list')) out = '*:Cafe\\: Guest:89:WPA2\n:Open Network:64:--\n';
        } else if (command === 'bluetoothctl') {
          if (args[0] === 'show') out = 'Controller AA:BB:CC:DD:EE:FF (public)\n\tPowered: yes\n';
          else if (args[0] === 'devices') out = 'Device 11:22:33:44:55:66 Headphones\n';
          else if (args[0] === 'info') out = 'Device 11:22:33:44:55:66\n\tPaired: no\n';
          else if (['pair', 'trust', 'connect'].includes(args[0])) out = 'success\n';
        }
        process.nextTick(() => callback(null, out, ''));
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

test('Wi-Fi status selects the connected wireless adapter, not Ethernet', async () => {
  assert.deepEqual(await invoke('sys:wifi'), {
    available: true,
    enabled: true,
    connected: true,
    name: 'Home: Network'
  });
});

test('Wi-Fi scanning parses escaped SSIDs and identifies open networks', async () => {
  assert.deepEqual(await invoke('sys:wifi:networks'), {
    available: true,
    enabled: true,
    networks: [
      { ssid: 'Cafe: Guest', signal: 89, security: 'WPA2', active: true },
      { ssid: 'Open Network', signal: 64, security: '', active: false }
    ]
  });
});

test('Wi-Fi connection passes SSID and password as separate arguments', async () => {
  assert.deepEqual(await invoke('sys:wifi:connect', 'Cafe; Guest', 'correct horse'), { ok: true });
  assert.ok(calls.some(call => call.command === 'nmcli' && call.args.includes('Cafe; Guest') && call.args.includes('correct horse')));
  assert.deepEqual(await invoke('sys:wifi:connect', '', ''), { ok: false, error: 'Invalid Wi-Fi network or password.' });
});

test('Bluetooth scanning lists discovered devices and connects through BlueZ', async () => {
  assert.deepEqual(await invoke('sys:bluetooth:devices'), {
    available: true,
    devices: [{ address: '11:22:33:44:55:66', name: 'Headphones' }]
  });
  assert.deepEqual(await invoke('sys:bluetooth:connect', '11:22:33:44:55:66'), { ok: true });
  assert.deepEqual(await invoke('sys:bluetooth:connect', 'not-an-address'), { ok: false, error: 'Invalid Bluetooth device.' });
});
