const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('desktop styling preserves the extracted baseline outside fullscreen and material rules', () => {
 const css = read('app/desktop.css').replace(/\r\n/g, '\n').split('\n:root{--material-window:')[0];
 const fullscreen = css.slice(css.indexOf('.win.fullscreen,'), css.indexOf('#dock{border-radius:28px}'));
 assert.match(fullscreen, /body\.app-fullscreen\.fullscreen-menu-visible #menubar/);
 assert.match(fullscreen, /body\.app-fullscreen\.fullscreen-dock-visible #dockwrap #dock/);
 assert.equal(crypto.createHash('sha256').update(css.replace(fullscreen, '')).digest('hex'), '6885654fcebad288026842f5af36fb7902be7a9c5ffb2ace9ea8b9c998547636');
});

test('materials stay translucent in both schemes without per-window blur layers', () => {
 const css = read('app/desktop.css');
 const materials = css.slice(css.indexOf(':root{--material-window:'));
 assert.match(materials, /@media\(prefers-color-scheme:light\)\{:root:not\(\[data-theme\]\)/);
 assert.match(materials, /@media\(prefers-color-scheme:dark\)\{:root:not\(\[data-theme\]\)/);
 assert.match(materials, /:root\[data-theme=light\]\{--material-window:rgba\(255,255,255,\.38\)/);
 assert.match(materials, /:root\[data-theme=dark\]\{--material-window:rgba\(22,23,29,\.62\)/);
 // Window glass comes from a viewport-anchored wallpaper copy; a live blur per window is what caused
 // multi-window stutter, so .win must stay free of backdrop-filter.
 assert.match(materials, /\.win\{background-color:var\(--material-base\);background-image:linear-gradient\(var\(--material-window\),var\(--material-window\)\),var\(--material-vibrancy\);background-attachment:fixed;[^}]*backdrop-filter:none/);
 assert.doesNotMatch(materials, /\.win\{[^}]*backdrop-filter:var\(--material-blur\)/);
 for (const selector of ['.win.safari .tb', '.sbn', '.notes-folders', '.notes-list', '.notes-editor-pane', '.store-side', '.store-content', '.fsb', '.fls', '.rescontent']) assert.ok(materials.includes(selector), selector);
 assert.match(materials, /body\.lite,body\.high-contrast\{[^}]*--material-window:var\(--win\)[^}]*--material-vibrancy:none;--material-base:var\(--win\)/);
 assert.doesNotMatch(materials, /\.pages webview/);
});

test('the shell derives window vibrancy from the painted wallpaper whenever configuration is applied', () => {
 const shell = read('app/shell.js');
 assert.match(shell, /function applyWindowVibrancy\(wall\)/);
 assert.match(shell, /R\.style\.setProperty\('--material-vibrancy',painted\.backgroundImage\)/);
 assert.match(shell, /setProperty\('--material-vibrancy-size',cfg\.wallpaperImage\?'cover':'120% 120%'\)/);
 assert.match(shell, /classList\.toggle\('photo-wallpaper',!!cfg\.wallpaperImage\)/);
 const applyCfg = shell.slice(shell.indexOf('function applyCfg('));
 assert.ok(applyCfg.slice(0, applyCfg.indexOf('\nfunction ')).includes('applyWindowVibrancy(wall)'), 'applyCfg refreshes window vibrancy');
});

test('renderer assets exist, parse as classic scripts, and are included in production packaging', () => {
 const html = read('app/index.html'), scripts = [...html.matchAll(/<script\b([^>]*?)src="([^"]+)"[^>]*>/g)];
 assert.deepEqual(scripts.map(match => match[2]), ['startup.js', 'apps/notes.js', 'apps/finder.js', 'apps/store.js', 'apps/utilities.js', 'apps/browser.js', 'apps/settings.js', 'shell.js']);
 for (const match of scripts) {
  assert.doesNotMatch(match[0], /\b(?:async|defer|type=)/);
  new vm.Script(read('app/' + match[2]), { filename: match[2] });
 }
 assert.ok(JSON.parse(read('package.json')).build.files.includes('app/**'));
 assert.match(html, /href="desktop\.css"/);
});

test('app modules only declare initializers before the shell initializes shared lexical state', () => {
 const expected = { 'notes.js': ['notesInit'], 'finder.js': ['finderInit'], 'store.js': ['storeInit'], 'utilities.js': ['calcInit', 'resourcesInit', 'aboutInit'], 'browser.js': ['browserInit'], 'settings.js': ['settingsInit'] };
 for (const [file, functions] of Object.entries(expected)) {
  const context = vm.createContext({}); vm.runInContext(read('app/apps/' + file), context);
  assert.deepEqual(Object.keys(context).sort(), functions.sort());
  for (const name of functions) assert.equal(typeof context[name], 'function');
 }
});

test('Store progress subscriptions can be released repeatedly without disturbing other listeners', () => {
 const ipc = new EventEmitter(); ipc.invoke = () => Promise.resolve(); let bridge;
 vm.runInNewContext(read('preload.js'), { process: { platform: 'linux' }, require: () => ({ ipcRenderer: ipc, contextBridge: { exposeInMainWorld: (_, api) => { bridge = api; } } }) });
 const other = () => {}; ipc.on('store:progress', other);
 for (let cycle = 0; cycle < 20; cycle++) {
  let steps = 0; const release = bridge.store.onProgress(() => steps++);
  ipc.emit('store:progress', {}, { id: 'org.example.App' }); assert.equal(steps, 1);
  release(); release(); assert.equal(ipc.listenerCount('store:progress'), 1);
  ipc.emit('store:progress', {}, {}); assert.equal(steps, 1);
 }
});
