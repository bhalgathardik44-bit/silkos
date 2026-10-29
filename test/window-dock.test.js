const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../app/shell.js'), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function classes(...initial) {
 const values = new Set(initial);
 return { contains: name => values.has(name), add: (...names) => names.forEach(name => values.add(name)), remove: (...names) => names.forEach(name => values.delete(name)), toggle(name, on) { const next = on ?? !values.has(name); next ? values.add(name) : values.delete(name); return next; } };
}
function windowHarness() {
 const button = { setAttribute(name, value) { this[name] = value; } };
 const original = { left: '90px', top: '80px', width: '480px', height: '320px', minWidth: '260px', zIndex: '10' };
 const win = { style: { ...original }, dataset: { space: '0' }, classList: classes('show'), querySelector: () => button, offsetWidth: 1264, offsetHeight: 668, offsetLeft: 8, offsetTop: 34 };
 const body = { classList: classes() }, timers = new Map(); let nextTimer = 0;
 const context = vm.createContext({ wins: { notes: win }, activeSpace: 0, innerWidth: 1280, innerHeight: 800, document: { body, addEventListener() {} }, cfg: { dockPosition: 'bottom' }, dockDragging: false, resetDockMagnification() {}, saveWindowBounds() {}, setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); } });
 vm.runInContext(section('function syncFullscreenChrome()', 'function dragify(') + section('function constrainWindows()', "window.addEventListener('resize'"), context);
 context.focus = () => context.syncFullscreenChrome();
 return { context, win, body, button, original, timers };
}

test('zoom restores saved target bounds rather than the still-animated DOM size', () => {
 const h = windowHarness(); h.context.maxToggle(h.win);
 assert.equal(h.win.style.width, '1264px'); h.context.maxToggle(h.win);
 assert.deepEqual(h.win.style, h.original); assert.equal(h.win.dataset.max, undefined);
});

test('remembered window bounds use restored targets rather than animation frames', () => {
 const h = windowHarness(); let saved;
 Object.assign(h.context, { cfg: { rememberWindows: true }, localStorage: { getItem() { return null; }, setItem(key, value) { saved = JSON.parse(value); } } });
 vm.runInContext(section('function saveWindowBounds(', 'function saveSessionWindows('), h.context);
 h.context.saveWindowBounds('notes', h.win);
 assert.deepEqual(saved.notes, { left: 90, top: 80, width: 480, height: 320 });
 h.win.dataset.fullscreen = '{}'; saved = null; h.context.saveWindowBounds('notes', h.win); assert.equal(saved, null);
});

test('green-button fullscreen fills the viewport and reliably restores original bounds', () => {
 const h = windowHarness();
 for (let i = 0; i < 12; i++) {
  h.context.fullscreenToggle(h.win);
  assert.equal(h.win.style.width, '1280px'); assert.equal(h.win.style.height, '800px');
  assert.equal(h.win.style.left, '0px'); assert.equal(h.win.style.top, '0px');
  assert.equal(h.body.classList.contains('app-fullscreen'), true); assert.equal(h.button['aria-label'], 'Exit Full Screen');
  h.context.fullscreenToggle(h.win);
  assert.deepEqual(h.win.style, h.original); assert.equal(h.win.dataset.fullscreen, undefined);
  assert.equal(h.body.classList.contains('app-fullscreen'), false); assert.equal(h.button['aria-label'], 'Enter Full Screen');
  assert.equal(h.timers.size, 1);
 }
});

test('entering fullscreen from startup zoom preserves the pre-zoom window for exit', () => {
 const h = windowHarness(); h.context.maxToggle(h.win); h.context.fullscreenToggle(h.win);
 assert.equal(h.win.dataset.max, undefined); h.context.fullscreenToggle(h.win);
 assert.deepEqual(h.win.style, h.original);
});

test('fullscreen follows viewport resizing without overwriting its return bounds', () => {
 const h = windowHarness(); h.context.fullscreenToggle(h.win);
 h.context.innerWidth = 960; h.context.innerHeight = 600; h.context.constrainWindows();
 assert.equal(h.win.style.width, '960px'); assert.equal(h.win.style.height, '600px');
 h.context.fullscreenToggle(h.win); assert.deepEqual(h.win.style, h.original);
});

test('fullscreen chrome follows the visible workspace and gesture overlays', () => {
 const h = windowHarness(); h.context.fullscreenToggle(h.win);
 for (const overlay of ['launchpad-open', 'desk-expose', 'space-swipe-active']) {
  h.body.classList.add(overlay); h.context.syncFullscreenChrome(); assert.equal(h.body.classList.contains('app-fullscreen'), false);
  h.body.classList.remove(overlay); h.context.syncFullscreenChrome(); assert.equal(h.body.classList.contains('app-fullscreen'), true);
 }
 h.context.activeSpace = 1; h.context.syncFullscreenChrome(); assert.equal(h.body.classList.contains('app-fullscreen'), false);
 h.context.activeSpace = 0; h.win.classList.add('min'); h.context.syncFullscreenChrome(); assert.equal(h.body.classList.contains('app-fullscreen'), false);
 h.win.classList.remove('min'); h.context.syncFullscreenChrome(); assert.equal(h.body.classList.contains('app-fullscreen'), true);
 delete h.context.wins.notes; h.context.syncFullscreenChrome(); assert.equal(h.body.classList.contains('app-fullscreen'), false);
});

test('fullscreen chrome reveals at edges, stays usable, and hides away from them', () => {
 const h = windowHarness(); h.context.fullscreenToggle(h.win);
 const move = (x, y, menu = false) => h.context.updateFullscreenChromePointer({ clientX: x, clientY: y, target: { closest: () => menu ? {} : null } });
 move(600, 0); assert.equal(h.body.classList.contains('fullscreen-menu-visible'), true);
 move(600, 25); assert.equal(h.body.classList.contains('fullscreen-menu-visible'), true);
 move(600, 100, true); assert.equal(h.body.classList.contains('fullscreen-menu-visible'), true);
 move(600, 400); assert.equal(h.body.classList.contains('fullscreen-menu-visible'), false);
 for (const position of ['bottom', 'left', 'right']) {
  h.context.cfg.dockPosition = position;
  move(position === 'left' ? 0 : 1280, 800); assert.equal(h.body.classList.contains('fullscreen-dock-visible'), true);
  move(640, 400); assert.equal(h.body.classList.contains('fullscreen-dock-visible'), false);
 }
 move(1280, 400); h.context.fullscreenToggle(h.win);
 assert.equal(h.body.classList.contains('fullscreen-dock-visible'), false);
});

function dockHarness(count = 9) {
 const icons = Array.from({ length: count }, () => ({ _s: 1, _w: 56, style: {}, firstChild: { style: {} } }));
 const context = vm.createContext({ icons, cfg: { reduceMotion: false }, base: 56, MAG_RADIUS: 2.15, ICON_GLYPH: 26 / 56, dockGeom: { mid: 640, mag: 1.7, gap: 8, padStart: 10, padEnd: 10 }, dockDragging: false, mx: 640, magRaf: null, magLast: 0, syncIconOrder() {}, requestAnimationFrame() { return 1; } });
 vm.runInContext(section('function bellScale(', 'function kickMagnify('), context);
 return context;
}

test('dock target scales are continuous across all icon boundaries and stable at rest', () => {
 const h = dockHarness(); let previous;
 for (let cursor = 240; cursor <= 1040; cursor++) {
  h.mx = cursor; const scales = h.magSolve();
  assert.ok(scales.every(scale => scale >= 1 && scale <= 1.7));
  if (previous) assert.ok(scales.every((scale, index) => Math.abs(scale - previous[index]) < .02), 'magnification jumped at ' + cursor);
  assert.deepEqual(h.magSolve(), scales); previous = scales;
 }
});

test('dock settles under a stationary cursor and rests while dragging or motion is reduced', () => {
 const h = dockHarness();
 for (let i = 1; i <= 90; i++) h.magTick(i * 16.7);
 assert.equal(h.magRaf, null); const sizes = h.icons.map(icon => icon.style.width);
 for (let i = 91; i <= 120; i++) h.magTick(i * 16.7);
 assert.deepEqual(h.icons.map(icon => icon.style.width), sizes);
 h.dockDragging = true; assert.ok(h.magSolve().every(scale => scale === 1));
 h.dockDragging = false; h.cfg.reduceMotion = true; assert.ok(h.magSolve().every(scale => scale === 1));
 h.cfg.reduceMotion = false; h.mx = null; assert.ok(h.magSolve().every(scale => scale === 1));
});

test('a single-icon dock also has bounded, continuous magnification', () => {
 const h = dockHarness(1);
 for (let cursor = 500; cursor <= 780; cursor++) { h.mx = cursor; assert.ok(h.magSolve().every(scale => Number.isFinite(scale) && scale >= 1 && scale <= 1.7)); }
});

test('enabling reduced motion immediately resets enlarged dock icons', () => {
 const h = dockHarness(); let cancelled;
 Object.assign(h, { dock: {}, baseWanted: 56, MAG_BELL_SUM: 2.2, innerWidth: 1280, innerHeight: 800, cancelAnimationFrame(id) { cancelled = id; }, getComputedStyle() { return { columnGap: '8', paddingLeft: '10', paddingRight: '10', paddingTop: '10', paddingBottom: '10' }; } });
 vm.runInContext(section('function magnifyAmount()', 'function bellScale(') + section('function resetDockMagnification()', "document.addEventListener('pointermove'"), h);
 h.cfg.mag = true; h.cfg.magAmt = 1.7; h.cfg.dockPosition = 'bottom'; h.cfg.reduceMotion = true; h.magRaf = 42;
 h.icons.forEach(icon => { icon._s = 1.7; icon.style.width = '95.2px'; }); h.measureDock();
 assert.equal(cancelled, 42); assert.equal(h.magRaf, null); assert.equal(h.mx, null);
 assert.ok(h.icons.every(icon => icon._s === 1 && icon.style.width === '56px' && icon.style.height === '56px'));
});
