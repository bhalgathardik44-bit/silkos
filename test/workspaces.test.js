const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
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

/* The wallpaper, menu bar, dock and every SilkOS window are drawn by one fullscreen X window, so a
   desktop switch that leaves that window behind shows a bare X root instead of an empty desktop. */
test('the live session keeps the desktop shell on all four Openbox desktops', () => {
  const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', 'distro', 'config', ...parts), 'utf8');
  const hook = read('hooks', 'normal', '0100-silkos.hook.chroot');
  /* Openbox has no stickiness element: <desktop>all</desktop> is what makes a window omnipresent, and
     its class matcher folds no case, so the rule covers both spellings of the class name. */
  const upper = '<application class="SilkOS"><desktop>all</desktop></application>';
  const lower = '<application class="silkos"><desktop>all</desktop></application>';
  assert.ok(hook.includes(`sed -i '/<applications>/,/<\\/applications>/ s|</applications>|${upper}${lower}</applications>|'`), 'the rule must be inserted inside the <applications> block, not into a commented-out example');
  assert.ok(hook.includes(`grep -q '${upper}' "$OPENBOX_RC"`));
  assert.ok(hook.includes(`grep -q '${lower}' "$OPENBOX_RC"`));
  const xsession = read('includes.chroot', 'usr', 'local', 'bin', 'silkos-xsession');
  assert.match(xsession, /FLAGS="\$FLAGS --class=SilkOS"/);
  assert.match(xsession, /"\$APP" \$FLAGS/);
});
