const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAppMenuStream, findEntry, mergeSubmenu, menuBar, menuEntry, menuLabel, menuShortcut } = require('../native-menu');

/* The shape silkos-appmenu writes for one com.canonical.dbusmenu layout entry. */
const node = (id, props = {}, children = []) => ({ id, props, children });

test('mnemonic underscores become the label the user reads', () => {
  assert.equal(menuLabel({ label: '_File' }), 'File');
  assert.equal(menuLabel({ label: 'About _This __Computer' }), 'About This _Computer');
  assert.equal(menuLabel({}), '');
});

test('GTK accelerators are written the way SilkOS writes its own', () => {
  assert.equal(menuShortcut('<Primary><Shift>s'), 'Ctrl+Shift+S');
  assert.equal(menuShortcut('<Control>q'), 'Ctrl+Q');
  assert.equal(menuShortcut('<Super>space'), 'Cmd+Space');
  assert.equal(menuShortcut('<Alt>F5'), 'Alt+F5');
  assert.equal(menuShortcut('Prior'), 'PgUp');
  assert.equal(menuShortcut('<Primary>plus'), 'Ctrl++');
  assert.equal(menuShortcut(''), '');
  assert.equal(menuShortcut(undefined), '');
});

test('a menu entry carries the state the menu bar paints', () => {
  const copy = menuEntry(node(3, { label: '_Copy', accel: '<Primary>c', enabled: false }));
  assert.equal(copy.label, 'Copy');
  assert.equal(copy.shortcut, 'Ctrl+C');
  assert.equal(copy.disabled, true);
  assert.equal(copy.submenu, false);
  assert.equal(menuEntry(node(4, { type: 'separator' })).separator, true);
  const marked = menuEntry(node(5, { label: 'Toolbar', 'toggle-type': 'checkmark', 'toggle-state': 1 }));
  assert.deepEqual([marked.togglable, marked.checked], [true, true]);
  assert.equal(menuEntry(node(6, { label: 'Plain' })).checked, false);
});

test('both visibility and enablement default to on, and hidden children never reach the bar', () => {
  const file = menuEntry(node(1, { label: '_File', 'children-display': 'submenu' }, [
    node(2, { label: 'New' }),
    node(3, { label: 'Ghost', visible: false }),
    node(4, { label: 'Disabled', enabled: false })
  ]));
  assert.deepEqual(file.children.map(child => child.label), ['New', 'Disabled']);
  assert.equal(file.children[1].disabled, true);
});

test('a submenu the app has not filled yet is marked lazy', () => {
  const lazy = menuEntry(node(1, { label: '_File', 'children-display': 'placeholder' }));
  assert.deepEqual([lazy.submenu, lazy.lazy], [true, true]);
  const filled = menuEntry(node(1, { label: '_File' }, [node(2, { label: 'New' })]));
  assert.equal(filled.lazy, false);
});

test('the bar drops hidden and keeps separators in their place', () => {
  const bar = menuBar([node(1, { label: '_File' }), node(2, { label: 'Gone', visible: false }), node(3, { type: 'separator' })]);
  assert.deepEqual(bar.map(entry => entry.id), [1, 3]);
});

test('a late submenu is spliced into the tree it was requested from', () => {
  const bar = menuBar([node(1, { label: '_File', 'children-display': 'placeholder' })]);
  assert.equal(mergeSubmenu(bar, { id: 1, node: node(1, { label: '_File', 'children-display': 'submenu' }, [node(9, { label: 'New' }), node(10, { label: 'Quit' })]) }), true);
  assert.deepEqual(bar[0].children.map(child => child.label), ['New', 'Quit']);
  assert.deepEqual([bar[0].lazy, bar[0].submenu], [false, true]);
  assert.equal(mergeSubmenu(bar, { id: 404, node: node(404, { label: 'Elsewhere' }) }), false);
  assert.equal(mergeSubmenu(bar, null), false);
  assert.equal(findEntry(bar, 10).label, 'Quit');
  assert.equal(findEntry(bar, 99), null);
});

test('helper frames survive being split, joined and padded by the pipe', () => {
  const frames = [];
  const stream = createAppMenuStream(frame => frames.push(frame));
  stream.write('{"type":"ready"}\r\n{"type":"men');
  stream.write('u","app":"gimp","menus":[{"id":1,"props":{"label":"_File"},"children":[]}]}\n');
  assert.deepEqual(frames.map(frame => frame.type), ['ready', 'menu']);
  assert.equal(menuBar(frames[1].menus)[0].label, 'File');
  stream.write('\n\nnot json\n{"no_type_field":true}\n');
  assert.equal(frames.length, 2);
});

test('a half-read line is discarded when the helper goes away, not applied to its successor', () => {
  const frames = [];
  const stream = createAppMenuStream(frame => frames.push(frame));
  stream.write('{"type":"su');
  stream.reset();
  stream.write('bmenu","id":1,"node":{}}\n');
  assert.deepEqual(frames, []);
});

test('a stream that stopped being JSON is abandoned instead of buffered forever', () => {
  const frames = [];
  const stream = createAppMenuStream(frame => frames.push(frame));
  stream.write('x'.repeat(1 << 20));
  stream.write('\n{"type":"clear","reason":"no-menu"}\n');
  assert.deepEqual(frames.map(frame => frame.type), ['clear']);
});
