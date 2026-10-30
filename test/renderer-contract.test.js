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
 assert.equal(crypto.createHash('sha256').update(css.replace(fullscreen, '')).digest('hex'), 'a10a44a291722dda83e2e0277a6a1586587a71bd0c30ee5642d6c5651a0a6417');
});

test('real app artwork drops the synthetic frame drawn around the built-in icons', () => {
 const css = read('app/desktop.css');
 assert.match(css, /\.ic\.photo i::after\{box-shadow:none\}/);
 assert.match(css, /\.store-art:has\(img\)\{background:none;box-shadow:none\}/);
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

test('the Control Center slides a radio pane over the tiles instead of growing the popover', () => {
 const css = read('app/desktop.css');
 assert.match(css, /\.cc-detail\{position:absolute;inset:var\(--cc-pad\);display:grid;grid-template-rows:minmax\(0,1fr\);transform:translateX\(100%\);visibility:hidden/);
 assert.match(css, /\.cc\.detail-open \.cc-detail\{transform:none;visibility:visible;transition-delay:0s\}/);
 assert.match(css, /\.cc\.detail-open \.cc-main\{transform:translateX\(-100%\);opacity:0;pointer-events:none\}/);
 // Both panes set display:flex, which outvotes the browser default for [hidden] and would stack the
 // Bluetooth list on top of the Wi-Fi list inside the same layer.
 assert.match(css, /\.cc-pane\[hidden\]\{display:none\}/);
 assert.match(css, /\.cc-join\[hidden\]\{display:none\}/);
 assert.match(css, /@media\(max-width:380px\)\{\.cc\{--cc-pad:7px;--cc-gap:7px/);
 const shell = read('app/shell.js');
 const markup = shell.slice(shell.indexOf('function ccEl('), shell.indexOf('const status=el.querySelector'));
 assert.ok(markup.includes('<div class="cc-main">') && markup.includes('<div class="cc-detail">'), 'two layers in one box');
 assert.equal((markup.match(/data-radio-open="wifi"/g) || []).length, 2, 'the Wi-Fi tile body and its chevron both open the pane');
 assert.ok(markup.includes('data-radio-close'), 'the pane carries a back button');
 assert.ok(markup.includes('data-radio-switch="wifi"'), 'the pane carries the Wi-Fi on/off switch');
 assert.ok(markup.includes('<h6>Preferred Network</h6>') && markup.includes('<h6>Other Networks</h6>'), 'networks group like the macOS list');
 assert.ok(markup.includes('data-radio-other="wifi"'), 'the other-networks heading hides with its list');
 assert.equal((markup.match(/aria-pressed/g) || []).length, 1, 'only Do Not Disturb stays a pressed toggle');
 const body = shell.slice(shell.indexOf('const radioSwitch=name=>'), shell.indexOf(' wifiForm.onsubmit'));
 assert.match(body, /const service=\(name,enabled,detail,available=true\)=>\{const row=el\.querySelector\(`\[data-service="\$\{name\}"\]`\);/);
 assert.match(body, /el\.classList\.add\('detail-open'\)/);
 assert.match(body, /loadWifiNetworks\(!wifiList\.childElementCount\)/);
 assert.match(body, /const toggleRadio=async\(name,read,write,next\)=>\{const box=radioSwitch\(name\)/);
 assert.match(body, /async function loadWifiNetworks\(rescan=true\)/);
 // The switch is the only writer now, so it passes the state the user asked for and rescans either way.
 assert.match(shell, /await toggleRadio\(name,name==='wifi'\?refreshWifi:refreshBluetooth[^;]*,box\.checked\);if\(name==='wifi'\)loadWifiNetworks\(true\)/);
 assert.doesNotMatch(shell, /serviceMain/);
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
