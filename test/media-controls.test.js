const assert = require('node:assert/strict');
const Module = require('node:module');
const { test, beforeEach } = require('node:test');

const handlers = new Map();
let calls = [];
let responder = null;

const defaults = (command, args) => {
  if (command !== 'playerctl') return { out: '' };
  if (args[0] === '-a' && args[1] === 'status') return { out: 'spotifyd: Playing\n' };
  if (args[0] === '-p') return { out: 'Bohemian Rhapsody\tQueen\n' };
  if (args[0] === 'metadata') return { out: 'Bohemian Rhapsody\tQueen\n' };
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
          if (reply.fail) callback(Object.assign(new Error('Command failed'), { code: 1 }), reply.out || '', '');
          else callback(null, reply.out || '', '');
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
const META = 'metadata --format {{title}}\t{{artist}}';
const playerctl = () => calls.filter(call => call.command === 'playerctl').map(call => call.args.join(' '));

beforeEach(() => {
  calls = [];
  responder = null;
});

test('reading the media status is allowed and does not touch playback', async () => {
  assert.deepEqual(await invoke('sys:media'), {
    available: true,
    player: 'spotifyd',
    playing: true,
    title: 'Bohemian Rhapsody',
    artist: 'Queen'
  });
  assert.deepEqual(playerctl(), ['-a status', `-p spotifyd ${META}`]);
});

test('an unknown action is treated as a status read', async () => {
  assert.equal((await invoke('sys:media', 'nonsense')).available, true);
  assert.ok(!playerctl().some(line => line === 'nonsense'));
});

test('the playing player is chosen when several are registered', async () => {
  responder = (command, args) => {
    if (command !== 'playerctl') return null;
    if (args[0] === '-a') return { out: 'firefox: Paused\nspotifyd: Playing\n' };
    if (args[0] === '-p') return { out: 'Hotel California\tEagles\n' };
    return { out: 'Live at Wembley\tQueen\n' };
  };
  const result = await invoke('sys:media');
  assert.equal(result.playing, true);
  assert.equal(result.title, 'Hotel California');
  assert.ok(playerctl().includes(`-p spotifyd ${META}`));
});

test('a paused player still reports its track', async () => {
  responder = (command, args) => {
    if (command !== 'playerctl') return null;
    if (args[0] === '-a') return { out: 'spotifyd: Paused\n' };
    return { out: 'Bohemian Rhapsody\tQueen\n' };
  };
  assert.deepEqual(await invoke('sys:media'), {
    available: true, player: 'spotifyd', playing: false, title: 'Bohemian Rhapsody', artist: 'Queen'
  });
});

test('nothing is reported when no player exists or all of them are stopped', async () => {
  responder = (command, args) => {
    if (command !== 'playerctl') return null;
    if (args[0] === '-a') return args[1] === 'status' ? { out: 'spotifyd: Stopped\n', fail: true } : { fail: true };
    return { fail: true };
  };
  assert.deepEqual(await invoke('sys:media'), { available: false });

  calls = [];
  responder = null;
  responder = (command, args) => (command === 'playerctl' && args[0] === '-a' ? { out: 'spotifyd: Stopped\n' } : { out: '' });
  assert.deepEqual(await invoke('sys:media'), { available: false });
});

test('a playback command is sent before the status is read back', async () => {
  const result = await invoke('sys:media', 'play-pause');
  assert.equal(result.playing, true);
  assert.equal(playerctl()[0], 'play-pause');
  assert.equal(playerctl()[1], '-a status');
});

test('a command no player accepts leaves the tile unavailable', async () => {
  responder = (command, args) => (args.join(' ') === 'next' ? { fail: true } : defaults(command, args));
  assert.equal(await invoke('sys:media', 'next'), null);
  assert.deepEqual(playerctl(), ['next']);
});
