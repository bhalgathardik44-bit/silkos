const assert = require('node:assert/strict');
const Module = require('node:module');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');

const VLC = {
  name: 'VLC', summary: 'The all-powerful media player', developer_name: 'VideoLAN', project_license: 'GPL-2.0+',
  releases: [{ version: '3.0.23', timestamp: '1767225600' }], categories: ['AudioVideo'],
  urls: { homepage: 'https://www.videolan.org/vlc/' }, icon: 'https://dl.flathub.org/icons/org.videolan.VLC.png',
  screenshots: [], metadata: { 'flathub::verification::verified': 'verified' }, is_free_license: true
};
let replies = [
  { command: 'remote-add', stderr: '' },
  { command: 'update', stderr: 'Temporary network failure' },
  { command: 'update', stderr: '' },
  { command: 'search', stderr: 'Search service unavailable' },
  { command: 'list', stderr: 'Permission denied' }
];
let calls = [];
const spawnArgs = [];
const handlers = new Map();
const children = [];
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
      spawn: (command, args) => {
        assert.equal(command, 'flatpak');
        spawnArgs.push(args);
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => { child.killed = true };
        children.push(child);
        return child;
      },
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
          reply.out || '',
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
const invokeFrom = (event, name, ...args) => handlers.get(name)(event, ...args);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
/* Search normally answers over HTTPS. These tests force it offline to prove the Flatpak fallback,
   so no Store test ever reaches Flathub. */
const offline = async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try { return await invoke('store:search', 'Spotify'); } finally { globalThis.fetch = original; }
};

test('Store falls back to Flatpak and retries a failed app-catalog setup', async () => {
  assert.deepEqual(await offline(), {
    error: 'Could not reach Flathub. Could not load the Flathub app catalog: Temporary network failure'
  });
  assert.deepEqual(await invoke('store:install', '../invalid'), {
    ok: false,
    error: 'Invalid app ID.'
  });
  assert.deepEqual(await offline(), { error: 'Could not search Flathub: Search service unavailable' });
  assert.deepEqual(await invoke('store:installed'), {
    error: 'Could not list installed apps: Permission denied'
  });
  /* The flathub remote is added once: the retry only re-fetches the catalog that failed. */
  assert.deepEqual(calls, ['remote-add', 'update', 'update', 'search', 'list']);
  assert.equal(replies.length, 0);

  assert.deepEqual(await invoke('persist:status'), {
    on: false,
    has: '',
    disk: { name: 'sdb', size: '9 GB' }
  });
  lsblkFails = true;
  assert.deepEqual(await invoke('persist:status'), { error: 'Could not inspect storage devices.' });
});

test('Store searches Flathub over HTTPS without asking Flatpak', async () => {
  const originalFetch = globalThis.fetch;
  let asked = null, sent = 0;
  globalThis.fetch = async (url, init) => {
    sent++;
    asked = { url, body: JSON.parse(init.body) };
    return {
      ok: true,
      json: async () => ({ hits: [
        { app_id: 'com.spotify.Client', name: 'Spotify', summary: 'Online music streaming service', icon: 'https://dl.flathub.org/media/com.spotify.Client.png', developer_name: 'Spotify', verification_verified: false },
        { app_id: '../etc/passwd', name: 'Borrowed app', summary: 'Rejected', icon: '', developer_name: '', verification_verified: false }
      ] })
    };
  };
  try {
    const before = calls.length;
    assert.deepEqual(await invoke('store:search', '  spotify  '), { apps: [
      { id: 'com.spotify.Client', name: 'Spotify', desc: 'Online music streaming service', summary: 'Online music streaming service', icon: 'https://dl.flathub.org/media/com.spotify.Client.png', developer: 'Spotify', verified: false }
    ] });
    assert.equal(calls.length, before, 'a search must not start flatpak, which waits on the app catalog');
    assert.equal(asked.url, 'https://flathub.org/api/v2/search');
    assert.deepEqual(asked.body, { query: 'spotify', page: 1, per_page: 40 });

    sent = 0;
    assert.deepEqual(await invoke('store:search', '   '), { apps: [] });
    assert.equal(sent, 0, 'an empty box must not query Flathub');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Store loads Flathub app details once and caches them', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0, fetchFails = false;
  globalThis.fetch = async () => {
    fetchCount++;
    if (fetchFails) throw new Error('offline');
    return { ok: true, json: async () => VLC };
  };
  try {
    assert.deepEqual(await invoke('store:detail', 'org.videolan.VLC'), { data: VLC });
    assert.deepEqual(await invoke('store:detail', 'org.videolan.VLC'), { data: VLC });
    assert.equal(fetchCount, 1, 'the second request must come from the cache');

    fetchFails = true;
    assert.deepEqual(await invoke('store:detail', 'org.gimp.GIMP'), {
      error: 'Could not load the Flathub details for this app.'
    });
    assert.deepEqual(await invoke('store:detail', '../passwd'), { error: 'Invalid app ID.' });
    assert.equal(fetchCount, 2, 'a failed lookup is cached too, and bad IDs never reach the network');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Store compares installed apps against the Flathub catalog', async () => {
  calls = [];
  replies = [
    { command: 'list', out: 'org.videolan.VLC\tVLC\t3.0.21\norg.gimp.GIMP\tGIMP\t2.10.36\n' },
    { command: 'remote-info', out: '3.0.23\n' },
    { command: 'remote-info', out: '2.10.36\n' }
  ];
  assert.deepEqual(await invoke('store:updates'), {
    updates: [{ id: 'org.videolan.VLC', name: 'VLC', from: '3.0.21', to: '3.0.23' }]
  });
  assert.deepEqual(calls, ['list', 'remote-info', 'remote-info']);

  replies = [{ command: 'list', out: 'org.videolan.VLC\tVLC\t3.0.21\n' }, { command: 'remote-info', stderr: 'No such ref' }];
  assert.deepEqual(await invoke('store:updates'), { error: 'Could not compare with the Flathub catalog.' });
});

test('Store skips the Flathub catalog when nothing needs comparing', async () => {
  calls = [];
  replies = [{ command: 'list', out: '' }];
  assert.deepEqual(await invoke('store:updates'), { updates: [] });
  assert.deepEqual(calls, ['list'], 'an empty library never fetches the app catalog');
});

test('Store streams Flatpak install progress and reports how each job ended', async () => {
  const steps = [];
  const sender = { isDestroyed: () => false, send: (channel, payload) => steps.push({ channel, payload }) };
  const event = { sender };

  const working = invokeFrom(event, 'store:install', 'org.videolan.VLC');
  await tick();
  const child = children[children.length - 1];
  child.stdout.emit('data', 'Installing appstream: flathub\n');
  child.stdout.emit('data', 'Fetched 1.4 MB (12%)\nUpdating: org.videolan.VLC [1/4]\n');
  child.stdout.emit('data', 'Fetched 9 MB (78%)\n');
  child.emit('close', 0);
  assert.deepEqual(await working, { ok: true, error: '' });
  assert.deepEqual(spawnArgs.at(-1), ['install', '--user', '-y', '--noninteractive', 'flathub', 'org.videolan.VLC']);
  assert.deepEqual(steps.map(step => step.payload.percent), [null, 12, null, 78]);
  assert.deepEqual(steps.map(step => step.payload.id), ['org.videolan.VLC', 'org.videolan.VLC', 'org.videolan.VLC', 'org.videolan.VLC']);
  assert.match(steps.at(-1).payload.label, /Fetched 9 MB/);

  const removed = invokeFrom(event, 'store:uninstall', 'org.gimp.GIMP');
  await tick();
  children[children.length - 1].emit('close', 0);
  assert.deepEqual(await removed, { ok: true, error: '' });
  assert.deepEqual(spawnArgs.at(-1), ['uninstall', '--user', '-y', '--noninteractive', 'org.gimp.GIMP']);

  const failed = invokeFrom(event, 'store:update-all', 'org.gimp.GIMP');
  await tick();
  const broken = children[children.length - 1];
  broken.stderr.emit('data', 'error: Nothing to do, org.gimp.GIMP is up to date.\n');
  broken.emit('close', 1);
  assert.deepEqual(await failed, {
    ok: false,
    error: 'Could not update app: error: Nothing to do, org.gimp.GIMP is up to date.'
  });
  assert.deepEqual(spawnArgs.at(-1), ['update', '--user', '--noninteractive', '-y', 'org.gimp.GIMP']);

  const missing = invokeFrom(event, 'store:install', 'org.blender.Blender');
  await tick();
  children[children.length - 1].emit('error', new Error('spawn flatpak ENOENT'));
  assert.deepEqual(await missing, { ok: false, error: 'Flatpak is not installed.' });
  assert.equal(replies.length, 0, 'progress reporting must not fall back to buffered execFile calls');
});
