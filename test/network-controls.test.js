const assert = require('node:assert/strict');
const Module = require('node:module');
const { test, beforeEach } = require('node:test');

const handlers = new Map();
let calls = [];
let responder = null;

const defaults = (command, args) => {
  if (command === 'nmcli') {
    if (args[0] === 'radio') return { out: 'enabled\n' };
    if (args.includes('list')) return { out: '*:Cafe\\: Guest:89:WPA2\n:Open Network:64:--\n' };
    if (args.includes('connect')) return { out: 'Device successfully activated.\n' };
    return { out: 'ethernet:connected:Wired\nwifi:connected:Home\\: Network\n' };
  }
  if (command === 'bluetoothctl') {
    if (args[0] === 'show') return { out: 'Controller AA:BB:CC:DD:EE:FF (public)\n\tPowered: yes\n' };
    if (args[0] === 'power') return { out: `Changing power ${args[1]} succeeded\n` };
    if (args[0] === '--timeout') return { out: 'Discovery started\n' };
    if (args[0] === 'devices') return { out: 'Device 11:22:33:44:55:66 Headphones\n' };
    if (args[0] === 'info') return { out: `Device ${args[1].toUpperCase()} (public)\n\tPaired: no\n` };
    if (['pair', 'trust', 'connect'].includes(args[0])) return { out: `${args[0]} successful\n` };
  }
  return { out: '' };
};

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
        calls.push({ command, args: [...args], options });
        const reply = (responder && responder(command, args)) || defaults(command, args);
        process.nextTick(() => {
          if (reply.fail) {
            const error = Object.assign(new Error(reply.err || 'Command failed'), typeof reply.fail === 'object' ? reply.fail : {});
            callback(error, reply.out || '', reply.err || '');
          } else {
            callback(null, reply.out || '', reply.err || '');
          }
        });
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
const nmcliCall = args => calls.find(call => call.command === 'nmcli' && call.args.join(' ') === args);

beforeEach(() => {
  calls = [];
  responder = null;
});

/* ---- Wi-Fi status ---- */

test('Wi-Fi status selects the connected wireless adapter, not Ethernet', async () => {
  assert.deepEqual(await invoke('sys:wifi'), {
    available: true,
    enabled: true,
    connected: true,
    name: 'Home: Network'
  });
});

test('Wi-Fi status reports when NetworkManager is missing', async () => {
  responder = command => command === 'nmcli' ? { fail: { code: 'ENOENT', message: 'spawn nmcli ENOENT' } } : null;
  assert.deepEqual(await invoke('sys:wifi'), { available: false, error: 'NetworkManager is unavailable.' });
});

test('Wi-Fi status reports a machine with no wireless adapter', async () => {
  responder = (command, args) => command === 'nmcli' && args.includes('status')
    ? { out: 'ethernet:connected:Wired\nlo:unmanaged:--\n' }
    : null;
  assert.deepEqual(await invoke('sys:wifi'), {
    available: false,
    enabled: true,
    connected: false,
    error: 'No Wi-Fi adapter was detected.'
  });
});

test('Wi-Fi status rejects radio output it cannot interpret', async () => {
  responder = (command, args) => command === 'nmcli' && args[0] === 'radio' ? { out: 'unknown\n' } : null;
  assert.deepEqual(await invoke('sys:wifi'), { available: false, error: 'Could not read Wi-Fi radio state.' });
  responder = (command, args) => command === 'nmcli' && args[0] === 'radio' ? { fail: true, err: 'Error: unknown radio' } : null;
  assert.deepEqual(await invoke('sys:wifi'), { available: false, error: 'Could not read Wi-Fi radio state.' });
});

test('Wi-Fi toggle applies the requested radio state', async () => {
  assert.deepEqual(await invoke('sys:wifi', false), {
    available: true,
    enabled: true,
    connected: true,
    name: 'Home: Network'
  });
  assert.ok(nmcliCall('radio wifi off'));
});

test('Wi-Fi toggle reports a radio change failure', async () => {
  responder = (command, args) => command === 'nmcli' && args[0] === 'radio' && args.length > 2
    ? { fail: true, err: 'Error: Device not found' }
    : null;
  assert.deepEqual(await invoke('sys:wifi', true), {
    available: false,
    error: 'NetworkManager could not change Wi-Fi radio state.'
  });
});

/* ---- Wi-Fi scanning ---- */

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

test('Wi-Fi scanning is skipped while the radio is off', async () => {
  responder = (command, args) => command === 'nmcli' && args[0] === 'radio' ? { out: 'disabled\n' } : null;
  assert.deepEqual(await invoke('sys:wifi:networks'), { available: true, enabled: false, networks: [] });
  assert.equal(calls.filter(call => call.args.includes('list')).length, 0);
});

test('Wi-Fi scanning merges duplicate SSIDs, keeps the strongest signal, and caps the list', async () => {
  const rows = Array.from({ length: 45 }, (_, i) => `:Net ${String(i).padStart(2, '0')}:${50 + i}:WPA2`);
  rows.push(':Repeat:40:WPA2', ':Repeat:70:--', '*:Home:88:WPA2');
  responder = (command, args) => command === 'nmcli' && args.includes('list') ? { out: rows.join('\n') + '\n' } : null;
  const result = await invoke('sys:wifi:networks');
  assert.equal(result.networks.length, 40);
  assert.equal(new Set(result.networks.map(network => network.ssid)).size, 40);
  assert.equal(result.networks[0].ssid, 'Home');
  const repeat = result.networks.filter(network => network.ssid === 'Repeat');
  assert.equal(repeat.length, 1);
  assert.equal(repeat[0].signal, 70);
  assert.equal(repeat[0].security, '');
});

test('Wi-Fi scanning tolerates escaped characters and malformed rows', async () => {
  responder = (command, args) => command === 'nmcli' && args.includes('list')
    ? { out: ':Back\\\\slash:50:WPA2\ngarbage\n:OnlySsid\n:Colon\\:Name:40:WPA2\n' }
    : null;
  const result = await invoke('sys:wifi:networks');
  assert.deepEqual(result.networks.map(network => network.ssid), ['Back\\slash', 'Colon:Name']);
});

test('Wi-Fi scanning surfaces nmcli errors', async () => {
  responder = (command, args) => command === 'nmcli' && args.includes('list')
    ? { fail: true, err: 'Error: Scanning not allowed while wpa_supplicant is busy.' }
    : null;
  assert.deepEqual(await invoke('sys:wifi:networks'), {
    available: false,
    error: 'Error: Scanning not allowed while wpa_supplicant is busy.'
  });
});

test('Wi-Fi scanning falls back to a generic message on timeouts without stderr', async () => {
  responder = (command, args) => command === 'nmcli' && args.includes('list') ? { fail: true, err: '' } : null;
  assert.deepEqual(await invoke('sys:wifi:networks'), {
    available: false,
    error: 'Could not scan for Wi-Fi networks.'
  });
});

/* ---- Wi-Fi connection ---- */

test('Wi-Fi connection passes SSID and password as separate arguments', async () => {
  assert.deepEqual(await invoke('sys:wifi:connect', 'Cafe; Guest', 'correct horse'), { ok: true });
  const call = calls.find(entry => entry.command === 'nmcli' && entry.args.includes('connect'));
  assert.ok(call);
  assert.deepEqual(call.args, ['device', 'wifi', 'connect', 'Cafe; Guest', 'password', 'correct horse']);
});

test('Wi-Fi connection omits the password argument for open networks', async () => {
  assert.deepEqual(await invoke('sys:wifi:connect', 'Open Network', ''), { ok: true });
  const call = calls.find(entry => entry.command === 'nmcli' && entry.args.includes('connect'));
  assert.deepEqual(call.args, ['device', 'wifi', 'connect', 'Open Network']);
});

test('Wi-Fi connection rejects invalid credentials before invoking nmcli', async () => {
  const invalid = [
    ['', ''],
    ['   ', ''],
    ['a'.repeat(33), ''],
    ['ok', 'p'.repeat(129)],
    ['bad\0ssid', ''],
    ['ok', 'bad\0password'],
    ['ok', 1234]
  ];
  for (const [ssid, password] of invalid) {
    assert.deepEqual(await invoke('sys:wifi:connect', ssid, password), { ok: false, error: 'Invalid Wi-Fi network or password.' });
  }
  assert.equal(calls.length, 0);
});

test('Wi-Fi connection surfaces nmcli errors without echoing the password', async () => {
  responder = (command, args) => command === 'nmcli' && args.includes('connect')
    ? { fail: true, err: 'Error: 802-11-wireless-security.psk: secrets were required, but not provided.' }
    : null;
  const result = await invoke('sys:wifi:connect', 'Cafe', 'hunter2-secret');
  assert.equal(result.ok, false);
  assert.match(result.error, /secrets were required/);
  assert.ok(!result.error.includes('hunter2-secret'));
});

test('Wi-Fi connection never leaks the password when nmcli fails without stderr', async () => {
  responder = (command, args) => command === 'nmcli' && args.includes('connect')
    ? { fail: { code: 'ETIMEDOUT', message: 'Command failed: nmcli device wifi connect Cafe password hunter2-secret' }, err: '' }
    : null;
  const result = await invoke('sys:wifi:connect', 'Cafe', 'hunter2-secret');
  assert.deepEqual(result, { ok: false, error: 'Could not connect to the Wi-Fi network. Check the password and try again.' });
});

/* ---- Bluetooth status and scanning ---- */

test('Bluetooth status reports controller power and missing adapters', async () => {
  assert.deepEqual(await invoke('sys:bluetooth'), { available: true, powered: true });
  responder = (command, args) => command === 'bluetoothctl' && args[0] === 'show'
    ? { out: 'Controller AA:BB:CC:DD:EE:FF (public)\n\tPowered: no\n' }
    : null;
  assert.deepEqual(await invoke('sys:bluetooth'), { available: true, powered: false });
  responder = command => command === 'bluetoothctl' ? { out: 'No default controller available\n' } : null;
  assert.deepEqual(await invoke('sys:bluetooth'), {
    available: false,
    powered: false,
    error: 'No Bluetooth controller was detected.'
  });
});

test('Bluetooth power changes fail when bluetoothctl reports an error with a zero exit code', async () => {
  responder = (command, args) => command === 'bluetoothctl' && args[0] === 'power'
    ? { out: 'Failed to set power on: org.bluez.Error.Blocked\n' }
    : null;
  assert.deepEqual(await invoke('sys:bluetooth', true), {
    available: false,
    error: 'BlueZ could not change Bluetooth power state.'
  });
});

test('Bluetooth scanning lists discovered devices and connects through BlueZ', async () => {
  assert.deepEqual(await invoke('sys:bluetooth:devices'), {
    available: true,
    devices: [{ address: '11:22:33:44:55:66', name: 'Headphones' }]
  });
  assert.deepEqual(await invoke('sys:bluetooth:connect', '11:22:33:44:55:66'), { ok: true });
  assert.deepEqual(await invoke('sys:bluetooth:connect', 'not-an-address'), { ok: false, error: 'Invalid Bluetooth device.' });
});

test('Bluetooth scanning asks for the radio to be turned on', async () => {
  responder = (command, args) => command === 'bluetoothctl' && args[0] === 'show'
    ? { out: 'Controller AA:BB:CC:DD:EE:FF (public)\n\tPowered: no\n' }
    : null;
  assert.deepEqual(await invoke('sys:bluetooth:devices'), { available: false, error: 'Turn Bluetooth on to scan for devices.' });
  assert.equal(calls.filter(call => call.args.includes('--timeout')).length, 0);
});

test('Bluetooth scanning reports a controller-less system', async () => {
  responder = command => command === 'bluetoothctl' ? { out: 'No default controller available\n' } : null;
  assert.deepEqual(await invoke('sys:bluetooth:devices'), { available: false, error: 'No Bluetooth controller was detected.' });
});

test('Bluetooth scanning surfaces scan failures from stderr and stdout', async () => {
  responder = (command, args) => command === 'bluetoothctl' && args[0] === '--timeout'
    ? { fail: true, err: 'Failed to start discovery: org.bluez.Error.InProgress' }
    : null;
  assert.deepEqual(await invoke('sys:bluetooth:devices'), {
    available: false,
    error: 'Failed to start discovery: org.bluez.Error.InProgress'
  });
  responder = (command, args) => command === 'bluetoothctl' && args[0] === '--timeout'
    ? { out: 'Error: No default controller available\n' }
    : null;
  assert.deepEqual(await invoke('sys:bluetooth:devices'), {
    available: false,
    error: 'Error: No default controller available'
  });
});

/* ---- Bluetooth connection ---- */

test('Bluetooth connection skips pairing for already-paired devices', async () => {
  responder = (command, args) => command === 'bluetoothctl' && args[0] === 'info'
    ? { out: 'Device 11:22:33:44:55:66 (public)\n\tPaired: yes\n\tConnected: no\n' }
    : null;
  assert.deepEqual(await invoke('sys:bluetooth:connect', '11:22:33:44:55:66'), { ok: true });
  assert.equal(calls.filter(call => call.args[0] === 'pair').length, 0);
});

test('Bluetooth connection fails when bluetoothctl reports a pairing failure with a zero exit code', async () => {
  responder = (command, args) => command === 'bluetoothctl' && args[0] === 'pair'
    ? { out: 'Attempting to pair with 11:22:33:44:55:66\nFailed to pair: org.bluez.Error.AuthenticationFailed\n' }
    : null;
  assert.deepEqual(await invoke('sys:bluetooth:connect', '11:22:33:44:55:66'), {
    ok: false,
    error: 'Failed to pair: org.bluez.Error.AuthenticationFailed'
  });
  assert.equal(calls.filter(call => ['trust', 'connect'].includes(call.args[0])).length, 0);
});

test('Bluetooth connection reports trust and connection failures', async () => {
  responder = (command, args) => command === 'bluetoothctl' && args[0] === 'trust'
    ? { out: 'Failed to trust 11:22:33:44:55:66: org.bluez.Error.NotReady\n' }
    : null;
  assert.deepEqual(await invoke('sys:bluetooth:connect', '11:22:33:44:55:66'), {
    ok: false,
    error: 'Failed to trust 11:22:33:44:55:66: org.bluez.Error.NotReady'
  });
  assert.equal(calls.filter(call => call.args[0] === 'connect').length, 0);

  responder = (command, args) => command === 'bluetoothctl' && args[0] === 'connect'
    ? { out: 'Failed to connect: org.bluez.Error.Failed\n' }
    : null;
  assert.deepEqual(await invoke('sys:bluetooth:connect', '11:22:33:44:55:66'), {
    ok: false,
    error: 'Failed to connect: org.bluez.Error.Failed'
  });
});

test('Bluetooth connection rejects unknown devices and malformed addresses', async () => {
  responder = (command, args) => command === 'bluetoothctl' && args[0] === 'info'
    ? { out: 'Device 11:22:33:44:55:66 not available\n' }
    : null;
  assert.deepEqual(await invoke('sys:bluetooth:connect', '11:22:33:44:55:66'), {
    ok: false,
    error: 'Could not read Bluetooth device information.'
  });
  for (const address of ['11:22:33:44:55', 'zz:22:33:44:55:66', '', null, 42]) {
    assert.deepEqual(await invoke('sys:bluetooth:connect', address), { ok: false, error: 'Invalid Bluetooth device.' });
  }
});

/* ---- Timeouts ---- */

test('network IPC calls use bounded command timeouts', async () => {
  await invoke('sys:wifi:networks');
  await invoke('sys:wifi:connect', 'Cafe', 'password');
  await invoke('sys:bluetooth:devices');
  const wifiScan = calls.find(call => call.args.includes('--rescan'));
  const wifiConnect = calls.find(call => call.args.includes('connect'));
  const bluetoothScan = calls.find(call => call.args.includes('--timeout'));
  assert.equal(wifiScan.options.timeout, 18000);
  assert.equal(wifiConnect.options.timeout, 30000);
  assert.equal(bluetoothScan.options.timeout, 12000);
});
