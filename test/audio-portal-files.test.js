const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, beforeEach, after } = require('node:test');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'silkos-home-'));
const OUTSIDE = fs.mkdtempSync(path.join(os.tmpdir(), 'silkos-outside-'));
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;

const handlers = new Map();
let calls = [];
let responder = null;

const pactlInfo = [
  'Server Name: PulseAudio (on PipeWire 1.0.5)',
  'Default Sink: alsa_output.analog',
  'Default Source: alsa_input.usb',
  ''
].join('\n');
const sinks = JSON.stringify([
  {
    index: 0,
    name: 'alsa_output.hdmi',
    description: 'HDMI Output',
    mute: false,
    volume: { 'front-left': { value_percent: '40%' }, 'front-right': { value_percent: '60%' } }
  },
  {
    index: 1,
    name: 'alsa_output.analog',
    description: 'Built-in Audio',
    mute: true,
    volume: { 'front-left': { value_percent: '100%' } }
  },
  { index: 2, name: 'alsa_output.analog.monitor', description: 'Monitor of Built-in Audio', mute: false, volume: {} }
]);
const sources = JSON.stringify([
  { index: 4, name: 'alsa_input.mic', description: 'Internal Microphone', mute: false, volume: { mono: { value_percent: '60%' } } },
  { index: 6, name: 'alsa_input.usb', description: 'USB Microphone', mute: false, volume: { mono: { value_percent: '30%' } } },
  { index: 5, name: 'alsa_output.analog.monitor', description: 'Monitor of Built-in Audio', mute: false, volume: {} }
]);

const defaults = (command, args) => {
  if (command === 'pactl') {
    const line = args.join(' ');
    if (line === 'info') return { out: pactlInfo };
    if (line === '-f json list sinks') return { out: sinks };
    if (line === '-f json list sources') return { out: sources };
    if (line === 'list short sink-inputs') return { out: '12\t1\tmpv\tPlayback\n13\t0\tfirefox\tPlayback\n' };
    if (line === 'list short source-outputs') return { out: '7\t6\tchromium\tRecord\n' };
    return { out: '' };
  }
  if (command === 'nmcli') {
    if (args[0] === '-t' && args.includes('CONNECTIVITY')) return { out: 'full\n' };
    if (args[0] === 'networking') return { out: 'full\n' };
    return { out: '' };
  }
  if (command === 'ip') return { out: 'default via 192.168.1.1 dev wlan0 proto dhcp metric 600\n' };
  return { out: '' };
};

const display = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1280, height: 800 },
  size: { width: 1280, height: 800 },
  scaleFactor: 1
};
const makeImage = (width = 1280, height = 800, empty = false) => ({
  isEmpty: () => empty,
  getSize: () => ({ width, height }),
  toPNG: () => Buffer.from('89504e470d0a1a0a', 'hex'),
  toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',
  crop: rect => makeImage(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)))
});
let sourcesReply = () => [{ display_id: 1, thumbnail: makeImage() }];
const clipboardImages = [];

const electron = {
  app: {
    getPath: () => path.join(HOME, '.config', 'SilkOS'),
    on() {},
    whenReady: () => ({ then() {} }),
    commandLine: { appendSwitch() {} },
    disableHardwareAcceleration() {}
  },
  BrowserWindow: class {},
  Menu: { setApplicationMenu() {} },
  ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
  shell: {},
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  globalShortcut: { register: () => true },
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => display,
    getDisplayMatching: () => display
  },
  desktopCapturer: { getSources: async () => sourcesReply() },
  clipboard: { writeImage: image => clipboardImages.push(image) }
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
const pactlCall = line => calls.find(call => call.command === 'pactl' && call.args.join(' ') === line);

beforeEach(() => {
  calls = [];
  responder = null;
  sourcesReply = () => [{ display_id: 1, thumbnail: makeImage() }];
  clipboardImages.length = 0;
});

after(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
  fs.rmSync(OUTSIDE, { recursive: true, force: true });
});

/* ---- Audio devices ---- */

test('audio devices list outputs and inputs, drop monitor sources, and mark the defaults', async () => {
  assert.deepEqual(await invoke('sys:audio:devices'), {
    available: true,
    outputs: [
      { name: 'alsa_output.hdmi', description: 'HDMI Output', volume: 50, muted: false, active: false },
      { name: 'alsa_output.analog', description: 'Built-in Audio', volume: 100, muted: true, active: true }
    ],
    inputs: [
      { name: 'alsa_input.mic', description: 'Internal Microphone', volume: 60, muted: false, active: false },
      { name: 'alsa_input.usb', description: 'USB Microphone', volume: 30, muted: false, active: true }
    ],
    defaultOutput: 'alsa_output.analog',
    defaultInput: 'alsa_input.usb'
  });
});

test('audio devices report when neither PipeWire nor PulseAudio answers', async () => {
  responder = command => command === 'pactl' ? { fail: { code: 'ENOENT', message: 'spawn pactl ENOENT' } } : null;
  assert.deepEqual(await invoke('sys:audio:devices'), {
    available: false,
    error: 'Audio routing requires PipeWire or PulseAudio.'
  });
});

test('audio devices reject unparseable pactl JSON instead of hiding the devices', async () => {
  responder = (command, args) => command === 'pactl' && args.includes('list') ? { out: 'not json' } : null;
  assert.deepEqual(await invoke('sys:audio:devices'), {
    available: false,
    error: 'Audio routing requires PipeWire or PulseAudio.'
  });
});

/* ---- Audio switching ---- */

test('switching the output moves the streams that followed the old default', async () => {
  assert.deepEqual(await invoke('sys:audio:select', 'output', 'alsa_output.hdmi'), { ok: true, defaultName: 'alsa_output.hdmi' });
  const applied = pactlCall('set-default-sink alsa_output.hdmi');
  assert.ok(applied);
  assert.equal(applied.options.timeout, 6000);
  assert.ok(pactlCall('-f json list sinks'));
  assert.ok(pactlCall('list short sink-inputs'));
  assert.ok(pactlCall('move-sink-input 12 alsa_output.hdmi'));
  assert.equal(pactlCall('move-sink-input 13 alsa_output.hdmi'), undefined);
});

test('switching the input moves its recorder and uses the source commands', async () => {
  assert.deepEqual(await invoke('sys:audio:select', 'input', 'alsa_input.mic'), { ok: true, defaultName: 'alsa_input.mic' });
  const applied = pactlCall('set-default-source alsa_input.mic');
  assert.ok(applied);
  assert.equal(applied.options.timeout, 6000);
  assert.ok(pactlCall('-f json list sources'));
  assert.ok(pactlCall('list short source-outputs'));
  assert.ok(pactlCall('move-source-output 7 alsa_input.mic'));
});

test('audio switching rejects invalid devices before running pactl', async () => {
  const invalid = [
    ['speaker', 'alsa_output.hdmi'],
    ['output', ''],
    ['output', 'a'.repeat(257)],
    ['output', 'alsa_output.hdmi\n'],
    ['input', 'alsa_input.mic\0'],
    ['output', 42],
    [null, null]
  ];
  for (const [kind, name] of invalid) {
    assert.deepEqual(await invoke('sys:audio:select', kind, name), { ok: false, error: 'Invalid audio device.' });
  }
  assert.equal(calls.length, 0);
});

test('audio switching refuses devices that are no longer listed, including monitors', async () => {
  assert.deepEqual(await invoke('sys:audio:select', 'output', 'alsa_output.analog.monitor'), {
    ok: false,
    error: 'That audio device is no longer available.'
  });
  assert.equal(calls.filter(call => call.args[0] === 'set-default-sink').length, 0);
});

test('audio switching surfaces failures from pactl', async () => {
  responder = (command, args) => command === 'pactl' && args[0] === 'set-default-sink'
    ? { fail: true, err: 'Connection failure: Connection refused' }
    : null;
  assert.deepEqual(await invoke('sys:audio:select', 'output', 'alsa_output.hdmi'), {
    ok: false,
    error: 'Could not switch the audio output.'
  });
  responder = (command, args) => command === 'pactl' && args[0] === 'set-default-source'
    ? { fail: true, err: 'Failure: No such entity' }
    : null;
  assert.deepEqual(await invoke('sys:audio:select', 'input', 'alsa_input.mic'), {
    ok: false,
    error: 'Could not switch the audio input.'
  });
});

/* ---- Captive portal ---- */

test('portal check reports a plain connection without asking for a probe', async () => {
  assert.deepEqual(await invoke('sys:portal:check'), { available: true, portal: false, state: 'full' });
  assert.equal(calls.filter(call => call.command === 'ip').length, 0);
});

test('portal check reads NetworkManager connectivity and hands back the sign-in gateway', async () => {
  responder = (command, args) => command === 'nmcli' && args[0] === '-t' ? { out: 'portal\n' } : null;
  assert.deepEqual(await invoke('sys:portal:check'), {
    available: true,
    portal: true,
    state: 'portal',
    url: 'http://192.168.1.1/'
  });
});

test('portal check still flags a portal when no gateway can be read', async () => {
  responder = (command, args) => {
    if (command === 'nmcli' && args[0] === '-t') return { out: 'portal\n' };
    if (command === 'ip') return { fail: true, err: '' };
    return null;
  };
  assert.deepEqual(await invoke('sys:portal:check'), { available: true, portal: true, state: 'portal', url: '' });
});

test('portal check asks NetworkManager for a verdict when connectivity is not yet known', async () => {
  responder = (command, args) => {
    if (command !== 'nmcli') return null;
    if (args[0] === '-t') return { out: 'limited\n' };
    if (args[0] === 'networking') return { out: 'portal\n' };
    return null;
  };
  assert.deepEqual(await invoke('sys:portal:check'), {
    available: true,
    portal: true,
    state: 'portal',
    url: 'http://192.168.1.1/'
  });
  const probe = calls.find(call => call.command === 'nmcli' && call.args[0] === 'networking');
  assert.ok(probe);
  assert.equal(probe.options.timeout, 15000);
});

test('portal check keeps a non-portal verdict when the probe cannot answer', async () => {
  responder = (command, args) => {
    if (command !== 'nmcli') return null;
    if (args[0] === '-t') return { out: 'limited\n' };
    if (args[0] === 'networking') return { fail: true, err: '' };
    return null;
  };
  assert.deepEqual(await invoke('sys:portal:check'), { available: true, portal: false, state: 'limited' });
});

test('portal check reports NetworkManager as unavailable when nmcli cannot answer', async () => {
  responder = command => command === 'nmcli' ? { fail: { code: 'ENOENT', message: 'spawn nmcli ENOENT' } } : null;
  assert.deepEqual(await invoke('sys:portal:check'), { available: false, error: 'NetworkManager is unavailable.' });
});

/* ---- Finder stat batching ---- */

test('fs:stat returns sizes and dates for existing paths and drops the rest', async () => {
  const folder = path.join(HOME, 'stat-folder');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(HOME, 'stat-file.txt');
  fs.writeFileSync(file, 'abc');
  const result = await invoke('fs:stat', [file, folder, path.join(HOME, 'missing.txt'), 42, path.join(HOME, 'x'.repeat(4100))]);
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  const [saved, dir] = result.items;
  assert.equal(saved.path, file);
  assert.equal(saved.size, 3);
  assert.equal(saved.dir, false);
  assert.equal(typeof saved.mtime, 'number');
  assert.equal(dir.path, folder);
  assert.equal(dir.dir, true);
});

test('fs:stat rejects empty and oversized batches', async () => {
  const invalid = [null, [], 'nope', new Array(501).fill('x')];
  for (const targets of invalid) {
    assert.deepEqual(await invoke('fs:stat', targets), { ok: false, error: 'Could not read item details.' });
  }
});

/* ---- Finder writes ---- */

test('fs:mkdir creates folders inside the home folder only', async () => {
  const created = await invoke('fs:mkdir', HOME, 'New Folder');
  assert.equal(created.ok, true);
  assert.equal(fs.existsSync(path.join(HOME, 'New Folder')), true);
  assert.deepEqual(await invoke('fs:mkdir', HOME, 'New Folder'), {
    ok: false,
    error: 'An item with that name already exists.'
  });
  assert.deepEqual(await invoke('fs:mkdir', OUTSIDE, 'Nope'), {
    ok: false,
    error: 'SilkOS can only change files in your home folder.'
  });
  for (const name of ['', '..', '.', 'a/b', ' x', 'x ', 'a'.repeat(256), null]) {
    assert.deepEqual(await invoke('fs:mkdir', HOME, name), { ok: false, error: 'Enter a valid folder name.' });
  }
});

test('fs:rename renames an item and never overwrites an existing name', async () => {
  const source = path.join(HOME, 'rename-me.txt');
  fs.writeFileSync(source, 'one');
  const same = await invoke('fs:rename', source, 'rename-me.txt');
  assert.deepEqual(same, { ok: true, path: source });
  const renamed = await invoke('fs:rename', source, 'renamed.txt');
  assert.deepEqual(renamed, { ok: true, path: path.join(HOME, 'renamed.txt') });
  assert.equal(fs.existsSync(path.join(HOME, 'renamed.txt')), true);
  fs.writeFileSync(path.join(HOME, 'taken.txt'), 'two');
  assert.deepEqual(await invoke('fs:rename', path.join(HOME, 'renamed.txt'), 'taken.txt'), {
    ok: false,
    error: 'An item with that name already exists.'
  });
  assert.equal(fs.readFileSync(path.join(HOME, 'taken.txt'), 'utf8'), 'two');
});

test('fs:rename guards the home root and files outside it', async () => {
  assert.deepEqual(await invoke('fs:rename', HOME, 'home'), {
    ok: false,
    error: 'SilkOS can only change files in your home folder.'
  });
  const outside = path.join(OUTSIDE, 'outside.txt');
  fs.writeFileSync(outside, 'x');
  assert.deepEqual(await invoke('fs:rename', outside, 'moved.txt'), {
    ok: false,
    error: 'SilkOS can only change files in your home folder.'
  });
  assert.deepEqual(await invoke('fs:rename', path.join(HOME, 'anything.txt'), '../escape.txt'), {
    ok: false,
    error: 'Enter a valid name.'
  });
});

test('fs:trash follows the freedesktop Trash layout and suffixes collisions', async () => {
  const trashFiles = path.join(HOME, '.local', 'share', 'Trash', 'files');
  const trashInfo = path.join(HOME, '.local', 'share', 'Trash', 'info');
  fs.mkdirSync(trashFiles, { recursive: true });
  fs.mkdirSync(trashInfo, { recursive: true });
  fs.writeFileSync(path.join(trashFiles, 'notes.txt'), 'older');
  const source = path.join(HOME, 'notes.txt');
  fs.writeFileSync(source, 'newer');
  assert.deepEqual(await invoke('fs:trash', [source]), { ok: true, trashed: 1 });
  assert.equal(fs.existsSync(source), false);
  assert.equal(fs.readFileSync(path.join(trashFiles, 'notes.txt.1'), 'utf8'), 'newer');
  const info = fs.readFileSync(path.join(trashInfo, 'notes.txt.1.trashinfo'), 'utf8');
  assert.match(info, /^\[Trash Info\]\n/);
  assert.ok(info.includes(`Path=${encodeURI(source)}`));
  assert.match(info, /DeletionDate=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test('fs:trash rejects empty batches and paths outside the home folder', async () => {
  for (const sources of [null, [], 'file', new Array(201).fill('x')]) {
    assert.deepEqual(await invoke('fs:trash', sources), { ok: false, error: 'Select files to move to the Trash.' });
  }
  const outside = path.join(OUTSIDE, 'keep.txt');
  fs.writeFileSync(outside, 'x');
  assert.deepEqual(await invoke('fs:trash', [outside]), {
    ok: false,
    error: 'SilkOS can only change files in your home folder.'
  });
  assert.equal(fs.existsSync(outside), true);
});

test('fs:move moves items into folders and refuses destinations that would lose data', async () => {
  const target = path.join(HOME, 'move-target');
  fs.mkdirSync(target, { recursive: true });
  const file = path.join(HOME, 'move-me.txt');
  fs.writeFileSync(file, 'contents');
  assert.deepEqual(await invoke('fs:move', [file], target), { ok: true, moved: 1 });
  assert.equal(fs.readFileSync(path.join(target, 'move-me.txt'), 'utf8'), 'contents');

  const duplicate = path.join(HOME, 'move-dup.txt');
  fs.writeFileSync(duplicate, 'dup');
  fs.writeFileSync(path.join(target, 'move-dup.txt'), 'existing');
  assert.deepEqual(await invoke('fs:move', [duplicate], target), {
    ok: false,
    error: '“move-dup.txt” already exists in that folder.'
  });

  assert.deepEqual(await invoke('fs:move', [duplicate], path.join(HOME, 'missing-folder')), {
    ok: false,
    error: 'The destination folder no longer exists.'
  });
  const parent = path.join(HOME, 'move-parent');
  const child = path.join(parent, 'child');
  fs.mkdirSync(child, { recursive: true });
  assert.deepEqual(await invoke('fs:move', [parent], child), {
    ok: false,
    error: 'A folder cannot be moved inside itself.'
  });
  assert.deepEqual(await invoke('fs:move', [path.join(target, 'move-me.txt')], target), { ok: true, moved: 0 });
});

/* ---- Screenshots ---- */

test('a full screenshot is saved to Pictures and copied to the clipboard', async () => {
  const first = await invoke('screenshot:full');
  assert.equal(first.ok, true);
  assert.equal(first.width, 1280);
  assert.equal(first.height, 800);
  assert.ok(first.path.startsWith(path.join(HOME, 'Pictures', 'Screenshots')));
  assert.match(path.basename(first.path), /^Screenshot \d{4}-\d{2}-\d{2} at \d{2}\.\d{2}\.\d{2}\.png$/);
  assert.ok(fs.readFileSync(first.path).equals(Buffer.from('89504e470d0a1a0a', 'hex')));
  assert.equal(first.url.startsWith('file:'), true);
  assert.equal(clipboardImages.length, 1);

  const second = await invoke('screenshot:full');
  assert.equal(second.ok, true);
  assert.notEqual(second.path, first.path);
  assert.equal(fs.existsSync(second.path), true);
});

test('a screenshot reports capture failures instead of saving an empty image', async () => {
  const saved = () => fs.readdirSync(path.join(HOME, 'Pictures', 'Screenshots')).filter(name => name.endsWith('.png')).length;
  const before = saved();
  sourcesReply = () => [];
  assert.deepEqual(await invoke('screenshot:full'), { ok: false, error: 'The screen could not be captured.' });
  sourcesReply = () => [{ display_id: 1, thumbnail: makeImage(1280, 800, true) }];
  assert.deepEqual(await invoke('screenshot:full'), { ok: false, error: 'The screen could not be captured.' });
  assert.equal(saved(), before);
  assert.equal(clipboardImages.length, 0);
});

test('region capture needs the desktop window and a pending capture to complete', async () => {
  assert.deepEqual(await invoke('screenshot:region'), { ok: false, error: 'The desktop window is not available.' });
  assert.deepEqual(await invoke('screenshot:complete', { x: 0, y: 0, width: 0.5, height: 0.5 }), {
    ok: false,
    error: 'No screenshot is in progress.'
  });
  assert.equal(await invoke('screenshot:cancel'), true);
});
