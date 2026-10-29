const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('desktop styling remains byte-equivalent to the extracted baseline', () => {
 const css = read('app/desktop.css').replace(/\r\n/g, '\n');
 assert.equal(crypto.createHash('sha256').update(css).digest('hex'), '88c8ce5e7bd885e119147b6608dfd09fe58f6e3604c463a32e908e44d5898ff1');
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
