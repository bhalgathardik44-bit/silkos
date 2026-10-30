const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { menuBar } = require('../native-menu');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const main = read('main.js');
const preload = read('preload.js');
const shell = read('app', 'shell.js');
const helper = read('distro', 'config', 'includes.chroot', 'usr', 'local', 'bin', 'silkos-appmenu');
const packages = read('distro', 'config', 'package-lists', 'silkos.list.chroot');
const look = read('distro', 'config', 'includes.chroot', 'etc', 'profile.d', 'silkos-look.sh');

// GTK apps hand their menu bar to the desktop bus instead of drawing it; SilkOS then has to show a
// tree it did not build. These guards keep that path on the canonical registrar and off the app itself.
test('the helper reads the canonical registrar and never starts an application', () => {
  assert.match(helper, /REGISTRAR_NAME = "com\.canonical\.AppMenu\.Registrar"/);
  assert.match(helper, /REGISTRAR_PATH = "\/com\/canonical\/AppMenu\/Registrar"/);
  assert.match(helper, /DBUSMENU_IFACE = "com\.canonical\.dbusmenu"/);
  assert.match(helper, /"GetMenuForWindow"/);
  assert.match(helper, /"AboutToShow"/);
  assert.match(helper, /"GetLayout"/);
  // Auto-start is right for the registrar and wrong for a menu whose owner has closed.
  assert.match(helper, /self\.registrar\.call_sync\(\s*"GetMenuForWindow",[\s\S]*?Gio\.DBusCallFlags\.NONE/);
  assert.equal((helper.match(/Gio\.DBusCallFlags\.NO_AUTO_START/g) || []).length, 2);
});

test('the image installs the registrar, the GTK module and the interpreter the helper needs', () => {
  for (const name of ['appmenu-registrar', 'appmenu-gtk3-module', 'python3', 'python3-gi', 'x11-utils']) {
    assert.match(packages, new RegExp(`^${name}$`, 'm'), `${name} is installed`);
  }
  assert.match(look, /export GTK_MODULES=.*appmenu-gtk-module/);
});

test('menu frames reach the renderer only through the preload bridge', () => {
  assert.match(main, /require\('\.\/native-menu'\)/);
  assert.ok(JSON.parse(read('package.json')).build.files.includes('native-menu.js'));
  assert.match(main, /spawn\('silkos-appmenu'/);
  assert.match(main, /ipcMain\.handle\('native-menu:open'/);
  assert.match(main, /ipcMain\.handle\('native-menu:activate'/);
  assert.doesNotMatch(shell, /require\(|process\.|__dirname/);
  assert.match(shell, /silk\.nativeMenu\.onBar\(applyNativeBar\)/);
  assert.match(shell, /silk\.nativeMenu\.activate\(node\.id\)/);
});

test('SilkOS freezes the menu bar while its own window holds the pointer', () => {
  // Without the hold, the helper would see SilkOS as the active window and clear the bar the user is
  // clicking; with a detach it could no longer answer AboutToShow or Activate.
  assert.match(main, /win\.on\('blur', \(\) => appMenuCommand\(\{ cmd: 'watch' \}\)\)/);
  assert.match(main, /win\.on\('focus', \(\) => appMenuCommand\(\{ cmd: 'hold' \}\)\)/);
  assert.match(main, /if \(win\.isFocused\(\)\) appMenuCommand\(\{ cmd: 'hold' \}\)/);
  assert.match(helper, /if cmd == "hold":\s*\n(\s*#[^\n]*\n)*\s*self\.watching = False\s*\n\s*return True/);
  assert.doesNotMatch(helper, /if cmd == "hold":[\s\S]{0,120}self\.detach\(\)/);
  assert.match(main, /if \(appMenuChild && !appMenuChild\.killed\) appMenuChild\.kill\(\)/);
});

function bridge() {
  const ipc = new EventEmitter();
  const calls = [];
  ipc.invoke = (channel, ...args) => { calls.push([channel, ...args]); return Promise.resolve(true); };
  let api;
  vm.runInNewContext(preload, {
    process: { platform: 'linux' },
    require: () => ({ ipcRenderer: ipc, contextBridge: { exposeInMainWorld: (_, value) => { api = value; } } })
  });
  return { api, ipc, calls };
}

test('the bridge publishes the bar and releases its listener like every other subscription', () => {
  const { api, ipc, calls } = bridge();
  const frames = [];
  const release = api.nativeMenu.onBar(frame => frames.push(frame.type));
  ipc.emit('native-menu', {}, { type: 'bar', entries: [] });
  ipc.emit('native-menu', {}, { type: 'bar', entries: [] });
  assert.deepEqual(frames, ['bar', 'bar']);
  release();
  release();
  ipc.emit('native-menu', {}, { type: 'clear' });
  assert.deepEqual(frames, ['bar', 'bar']);
  assert.equal(ipc.listenerCount('native-menu'), 0);
  api.nativeMenu.open(7);
  api.nativeMenu.activate(8);
  assert.deepEqual(calls, [['native-menu:open', 7], ['native-menu:activate', 8]]);
});

test('the shell hands the bar to the menu markup the rest of the desktop already uses', () => {
  assert.match(shell, /else if\(k\.startsWith\(NATIVE_KEY\)\)/);
  assert.match(shell, /mleft\.classList\.toggle\('native',!!entries\.length\)/);
  // A native app in front means SilkOS's own menus are behind it, so the bar must not offer them.
  assert.match(read('app', 'desktop.css'), /#mleft\.native \.mi:not\(\[data-k="apple"\]\):not\(\[data-k\^="native:"\]\)\{display:none\}/);
  assert.match(shell, /if\(!keepNative&&wasNative&&nativeClearPending\)dropNativeBar\(\)/);
  const bar = menuBar([{ id: 1, props: { label: '_File', 'children-display': 'placeholder' }, children: [] }]);
  assert.equal(bar[0].label, 'File');
});
