/*
 * Native application menus for SilkOS, read from the desktop bus.
 *
 * GTK applications loaded with appmenu-gtk-module do not draw their own menu bar. They export it as
 * a com.canonical.dbusmenu tree, register it against their X11 window id, and `silkos-appmenu`
 * (distro/config/includes.chroot/usr/local/bin) forwards the tree it reads from the registrar here.
 *
 * This module owns everything that can be decided without a display: framing the helper's JSON
 * lines, and turning dbusmenu properties into the {label, shortcut, disabled, checked, children}
 * entries the menu bar renders. Keeping it here means the mapping is covered by `npm test`, which
 * no visual check would be.
 */

const MNEMONIC_MARK = '\u0000';
/* dbusmenu labels carry the mnemonic as an underscore: "_File" is File with Alt+F, "__" is a literal. */
const SHORTCUT_MODIFIERS = { control: 'Ctrl', primary: 'Ctrl', shift: 'Shift', alt: 'Alt', meta: 'Super', super: 'Cmd' };
const SHORTCUT_KEYS = {
  Prior: 'PgUp', Next: 'PgDn', Left: '\u2190', Right: '\u2192', Up: '\u2191', Down: '\u2193',
  Return: '\u21B5', Escape: '\u238B', Tab: '\u21E5', space: 'Space', Delete: '\u2326',
  Home: '\u2196', End: '\u2198', plus: '+', minus: '-', equal: '=', bracketleft: '[', bracketright: ']'
};

function menuLabel(props) {
  const raw = typeof props.label === 'string' ? props.label : '';
  return raw
    .replace(/__/g, MNEMONIC_MARK)
    .replace(/_(.)/g, (_, ch) => ch)
    .split(MNEMONIC_MARK).join('_');
}

/* GTK writes accelerators as "<Primary><Shift>s"; the menu bar shows the same style it uses for SilkOS. */
function menuShortcut(accel) {
  if (typeof accel !== 'string' || !accel) return '';
  const modifiers = [...accel.matchAll(/<([^>]+)>/g)]
    .map(match => SHORTCUT_MODIFIERS[match[1].toLowerCase()])
    .filter(Boolean);
  const keyName = accel.replace(/<[^>]*>/g, '');
  if (!keyName) return modifiers.join('+');
  const key = SHORTCUT_KEYS[keyName] || (keyName.length === 1 ? keyName.toUpperCase() : keyName);
  return [...new Set([...modifiers, key])].join('+');
}

function menuEntry(node) {
  const source = node || {};
  const props = source.props || {};
  const display = props['children-display'];
  const children = (Array.isArray(source.children) ? source.children : []).map(menuEntry);
  return {
    id: Number(source.id) || 0,
    label: menuLabel(props),
    shortcut: menuShortcut(props.accel || props.shortcut),
    separator: props.type === 'separator',
    /* Both properties default to true when the app leaves them out. */
    disabled: props.enabled === false,
    hidden: props.visible === false,
    checked: props['toggle-state'] === 1,
    togglable: props['toggle-type'] === 'checkmark' || props['toggle-type'] === 'radio',
    /* A placeholder is a submenu the app has not populated yet; filling it needs AboutToShow. */
    lazy: display === 'placeholder',
    submenu: display === 'submenu' || display === 'placeholder' || children.length > 0,
    children: children.filter(child => !child.hidden)
  };
}

function menuBar(nodes) {
  return (Array.isArray(nodes) ? nodes : []).map(menuEntry).filter(entry => !entry.hidden);
}

function findEntry(entries, id) {
  for (const entry of entries || []) {
    if (entry.id === id) return entry;
    const deeper = findEntry(entry.children, id);
    if (deeper) return deeper;
  }
  return null;
}

/*
 * The helper resends the whole tree when the layout changes, but a submenu that started out as a
 * placeholder only fills in after AboutToShow, so its subtree can arrive on its own.
 */
function mergeSubmenu(bar, payload) {
  const target = bar && findEntry(bar, Number(payload && payload.id));
  if (!target || !payload || !payload.node) return false;
  const fresh = menuEntry(payload.node);
  target.children = fresh.children;
  target.submenu = fresh.submenu || target.submenu;
  target.lazy = false;
  return true;
}

function createAppMenuStream(onFrame) {
  let buffer = '';

  const parseLine = line => {
    if (!line) return;
    let frame;
    try {
      frame = JSON.parse(line);
    } catch (error) {
      /* A truncated final line is the common case when the helper is killed mid-write. */
      return;
    }
    if (frame && typeof frame === 'object' && typeof frame.type === 'string') onFrame(frame);
  };

  return {
    write(chunk) {
      buffer += String(chunk);
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        parseLine(buffer.slice(0, newline).replace(/\r$/, ''));
        buffer = buffer.slice(newline + 1);
      }
      /* Menus are small, so a long run with no newline means the stream stopped being JSON. */
      if (buffer.length > 1 << 20) buffer = '';
    },
    reset() {
      buffer = '';
    }
  };
}

module.exports = { createAppMenuStream, menuBar, menuEntry, menuLabel, menuShortcut, findEntry, mergeSubmenu };
