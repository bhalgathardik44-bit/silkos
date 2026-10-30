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
 assert.equal(crypto.createHash('sha256').update(css.replace(fullscreen, '')).digest('hex'), '1544102d49c3023055524fe9d24019be16a980c211b0510fe99c12ba47afce54');
});

test('Launchpad keeps the menu bar live and puts the Dock away', () => {
 const css = read('app/desktop.css');
 // The veil used to cover the bar, leaving it frosted and dead while the Dock floated above the frozen desktop.
 const z = selector => {
  const found = css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*?z-index:(\\d+)'));
  return found ? Number(found[1]) : NaN;
 };
 assert.ok(z('#menubar') > z('#lp'), `the menu bar (${z('#menubar')}) must paint over the Launchpad layer (${z('#lp')})`);
 assert.ok(z('#menubar') < z('.dd'), 'dropdowns still open over the menu bar');
 assert.match(css, /body\.launchpad-open #dockwrap\{opacity:0;visibility:hidden;transition:opacity var\(--t-space\) var\(--ease\),visibility 0s var\(--t-space\)\}/);
});

test('scroll areas use a themed overlay bar instead of the stock Chromium chrome', () => {
 const css = read('app/desktop.css');
 assert.match(css, /::-webkit-scrollbar\{width:12px;height:12px;background:transparent\}/);
 assert.match(css, /::-webkit-scrollbar-track\{background:transparent\}/);
 // The thumb takes its tint from --text, so it is light on dark panels and dark on light ones without a theme block.
 assert.match(css, /::-webkit-scrollbar-thumb\{min-height:44px;border-left:2px solid transparent;border-right:2px solid transparent;border-radius:8px;background-clip:padding-box;background-color:color-mix\(in srgb,var\(--text\) 26%,transparent\)\}/);
 assert.match(css, /::-webkit-scrollbar-thumb:hover\{background-color:color-mix\(in srgb,var\(--text\) 40%,transparent\)\}/);
 assert.match(css, /::-webkit-scrollbar-corner,::-webkit-scrollbar-button\{background:transparent;display:none\}/);
 // Only side borders: a top border would erase a horizontal thumb, and a 4px strip has no height to spare.
 assert.doesNotMatch(css, /::-webkit-scrollbar-thumb\{[^}]*border-top/);
 assert.match(css, /\.setting-nav::-webkit-scrollbar\{height:4px\}/);
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

test('the Control Center slides a radio pane over the tiles and fits the popover to it', () => {
 const css = read('app/desktop.css');
 assert.match(css, /\.cc-detail\{position:absolute;inset:var\(--cc-pad\);display:grid;grid-template-rows:minmax\(0,1fr\);transform:translateX\(100%\);visibility:hidden/);
 assert.match(css, /\.cc\.detail-open \.cc-detail\{transform:none;visibility:visible;transition-delay:0s\}/);
 // The tiles leave the flow while a pane is open, so the box can take the pane's measured height instead of the grid's.
 assert.match(css, /\.cc\.detail-open \.cc-main\{transform:translateX\(-100%\);opacity:0;pointer-events:none;position:absolute;inset:var\(--cc-pad\)\}/);
 assert.match(css, /\.cc\.dd\{transition:transform var\(--t-pop\) var\(--ease\),opacity var\(--t-ui\) var\(--ease\),height var\(--t-space\) var\(--ease\)\}/);
 assert.match(css, /\.cc\.measuring \.cc-main\{position:absolute;inset:var\(--cc-pad\);visibility:hidden\}/);
 assert.match(css, /\.cc\.measuring,\.cc\.measuring \*\{transition:none!important\}/);
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
 assert.match(body, /const paneHeight=name=>\{/);
 assert.match(body, /const fitPaneHeight=\(\)=>\{/);
 assert.match(body, /el\.style\.height=`\$\{Math\.min\(paneHeight\(pane\.dataset\.radioPane\),room\)\}px`/);
 assert.match(body, /el\.classList\.add\('detail-open'\)/);
 assert.match(body, /loadWifiNetworks\(!wifiList\.childElementCount\)/);
 assert.match(body, /const toggleRadio=async\(name,read,write,next\)=>\{const box=radioSwitch\(name\)/);
 assert.match(body, /async function loadWifiNetworks\(rescan=true\)/);
 // Every scan and every join re-measures, so two networks keep a short window instead of an empty sheet.
 assert.match(shell, /finally\{fitPaneHeight\(\)\}/);
 // The switch is the only writer now, so it passes the state the user asked for and rescans either way.
 assert.match(shell, /await toggleRadio\(name,name==='wifi'\?refreshWifi:refreshBluetooth[^;]*,box\.checked\);if\(name==='wifi'\)loadWifiNetworks\(true\)/);
 assert.doesNotMatch(shell, /serviceMain/);
});

test('the Launchpad grid carries its own frosted card that fades in with the tiles', () => {
 const css = read('app/desktop.css');
 const grid = css.slice(css.indexOf('\n.lpg{'), css.indexOf('#lp.on .lpg'));
 // The card hugs its rows and centres itself in the space under the search field, so filtering grows and
 // shrinks it around its middle instead of sliding icons around a viewport-sized panel.
 assert.match(grid, /flex:0 1 auto;min-height:0;max-height:100%;margin:auto 0;width:fit-content;min-width:min\(506px,100%\);max-width:min\(1080px,100%\)/);
 assert.match(grid, /border-radius:30px;background:linear-gradient\(rgba\(255,255,255,\.09\),rgba\(255,255,255,\.045\)\)/);
 assert.match(grid, /backdrop-filter:blur\(18px\) saturate\(1\.4\)/);
 assert.match(grid, /opacity:0;transform:scale\(\.98\);transition:opacity var\(--t-ui\) var\(--ease\),transform var\(--t-space\) var\(--ease\)/);
 assert.match(css, /#lp\.on \.lpg\{opacity:1;transform:none\}/);
 // The card leads the pinch so the icons, which still fade at exactly --lp-progress on top of it, track
 // the same filtered value rather than dimming twice over.
 assert.match(css, /#lp\.gesture-active \.lpg\{opacity:calc\(var\(--lp-progress,0\)\*1\.6\);/);
 assert.match(css, /#lp\.gesture-active \.lpa\{opacity:var\(--lp-progress,0\);/);
 // One flex gap owns the field-to-card separation, so a second margin would double it.
 assert.match(css, /#lp\{[^}]*gap:52px/);
 assert.doesNotMatch(css, /\.lpg\{[^}]*margin-top:/);
 // An empty search must not stretch the card across every auto-fit track.
 assert.doesNotMatch(css, /\.lpe\{grid-column:1\/-1/);
 assert.match(css, /body\.lite #lp \.lpg\{-webkit-backdrop-filter:none;backdrop-filter:none;background:linear-gradient\(rgba\(255,255,255,\.15\),rgba\(255,255,255,\.09\)\)\}/);
 // The card scrolls without a rail; the themed global bar would read as a seam down the frosted panel.
 assert.match(css, /#lp \.lpg\{scrollbar-width:none\}#lp \.lpg::-webkit-scrollbar\{display:none\}/);
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

test('the shell config save is hoisted above the startup brightness re-apply', () => {
 const shell = read('app/shell.js');
 assert.ok(shell.includes("function save(){try{localStorage.setItem('silk.cfg',JSON.stringify(cfg))}catch(e){}}"));
 assert.ok(!shell.includes('const save='));
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
