const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../app/startup.js'), 'utf8');

class Target {
 constructor() { this.listeners = new Map(); this.dataset = {}; this.attributes = {}; }
 addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
 removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
 emit(type, event = {}) { for (const callback of [...(this.listeners.get(type) || [])]) callback({ target: this, ...event }); }
 setAttribute(key, value) { this.attributes[key] = value; }
 count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}
function harness({ reduced = false, lite = false, appReduced = false, stylesheet = true } = {}) {
 const window = new Target(), document = new Target(), screen = new Target(), retry = new Target();
 const timers = new Map(), marks = []; let nextTimer = 0, reloads = 0;
 screen.classList = { add: name => { screen.addedClass = name; } };
 screen.contains = target => target === retry;
 screen.remove = () => { screen.removed = true; };
 retry.hidden = true; retry.focus = () => { retry.focused = true; };
 const status = { textContent: 'Preparing your desktop' };
 document.readyState = 'loading'; document.body = { classList: { contains: name => lite && name === 'lite' || appReduced && name === 'reduce-motion' } };
 document.getElementById = id => ({ startup: screen, 'startup-status': status, 'startup-retry': retry })[id];
 document.querySelector = () => ({ sheet: stylesheet ? {} : null });
 const context = vm.createContext({ window, document, location: { reload: () => reloads++ }, performance: { mark: name => marks.push(name) }, matchMedia: () => ({ matches: reduced }), setTimeout: (callback, ms) => { const id = ++nextTimer; timers.set(id, { callback, ms }); return id; }, clearTimeout: id => timers.delete(id) });
 vm.runInContext(source, context);
 return { window, document, screen, retry, status, timers, marks, reloads: () => reloads, loaded() { document.readyState = 'interactive'; document.emit('DOMContentLoaded'); } };
}

test('startup waits for actual core bootstrap and parsed resources, not a minimum timer', () => {
 const h = harness();
 h.loaded(); assert.equal(h.screen.removed, undefined); assert.equal(h.timers.size, 0);
 h.window.silkStartup.ready();
 assert.deepEqual(h.marks, ['silkos-desktop-ready']); assert.equal(h.screen.dataset.state, 'ready');
 assert.equal(h.screen.attributes['aria-busy'], 'false');
 assert.equal(h.window.silkStartup, undefined); assert.equal(h.window.count(), 0); assert.equal(h.document.count(), 0);
 assert.equal(h.timers.size, 1); assert.equal([...h.timers.values()][0].ms, 200);
 h.screen.emit('transitionend', { propertyName: 'opacity' });
 assert.equal(h.screen.removed, true); assert.equal(h.timers.size, 0); assert.equal(h.screen.count(), 0);
});

test('core-ready before DOMContentLoaded does not reveal an incomplete document', () => {
 const h = harness(); h.window.silkStartup.ready();
 assert.equal(h.screen.dataset.state, undefined); assert.equal(h.timers.size, 0);
 h.loaded(); assert.equal(h.screen.dataset.state, 'ready');
});

test('reduced motion and Lite Mode remove startup immediately without animation callbacks', () => {
 for (const options of [{ reduced: true }, { lite: true }, { appReduced: true }]) {
  const h = harness(options); h.window.silkStartup.ready(); h.loaded();
  assert.equal(h.screen.removed, true); assert.equal(h.timers.size, 0); assert.equal(h.window.count(), 0);
 }
});

test('interrupted startup transition still removes its overlay and resources', () => {
 const h = harness(); h.loaded(); const startup = h.window.silkStartup;
 startup.ready(); startup.ready(); assert.equal(h.marks.length, 1);
 [...h.timers.values()][0].callback();
 assert.equal(h.screen.removed, true); assert.equal(h.timers.size, 0); assert.equal(h.screen.count(), 0);
});

test('a missing critical script presents a safe retry instead of indefinite loading', () => {
 const h = harness(); h.window.emit('error', { target: { tagName: 'SCRIPT' }, message: 'private stack trace' });
 h.loaded(); h.window.silkStartup.ready();
 assert.equal(h.screen.dataset.state, 'error'); assert.equal(h.screen.attributes['aria-busy'], 'false');
 assert.equal(h.retry.hidden, false); assert.equal(h.retry.focused, true); assert.equal(h.timers.size, 0);
 assert.doesNotMatch(h.status.textContent, /private|stack/);
 h.retry.onclick(); assert.equal(h.reloads(), 1);
});

test('a missing desktop stylesheet cannot be reported as ready', () => {
 const h = harness({ stylesheet: false }); h.loaded(); h.window.silkStartup.ready();
 assert.equal(h.screen.dataset.state, 'error'); assert.equal(h.marks.length, 0);
});

test('optional asynchronous component errors do not block a bootstrapped desktop', () => {
 const h = harness(); h.window.silkStartup.ready();
 h.window.emit('error', { target: h.window }); h.loaded();
 assert.equal(h.screen.dataset.state, 'ready');
});

test('startup keyboard interception is removed at readiness and retry stays usable', () => {
 const h = harness(); let stopped = 0, prevented = 0;
 const event = { stopImmediatePropagation: () => stopped++, preventDefault: () => prevented++ };
 h.window.emit('keydown', event); assert.equal(stopped, 1); assert.equal(prevented, 1);
 h.window.emit('keydown', { ...event, target: h.retry }); assert.equal(stopped, 2); assert.equal(prevented, 1);
 h.window.silkStartup.ready(); h.loaded(); h.window.emit('keydown', event); assert.equal(stopped, 2);
});
