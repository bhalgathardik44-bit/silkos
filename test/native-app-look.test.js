const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const readDistro = (...parts) => read('distro', 'config', 'includes.chroot', ...parts);
const packages = read('distro', 'config', 'package-lists', 'silkos.list.chroot');
const theme = read('distro', 'config', 'hooks', 'normal', '0102-theme.hook.chroot');
const hook = read('distro', 'config', 'hooks', 'normal', '0100-silkos.hook.chroot');
const xsession = readDistro('usr', 'local', 'bin', 'silkos-xsession');
const look = readDistro('etc', 'profile.d', 'silkos-look.sh');
const picom = readDistro('etc', 'silkos', 'picom.conf');
const gtk2 = readDistro('etc', 'gtk-2.0', 'gtkrc');
const gtk3 = readDistro('etc', 'gtk-3.0', 'settings.ini');
const gtk4 = readDistro('etc', 'gtk-4.0', 'settings.ini');
const dconf = readDistro('etc', 'dconf', 'db', 'local.d', '00-silkos-theme');

// Flatpak, terminal and Wine windows are drawn by GTK and Qt outside the SilkOS page, so matching
// them means shipping theme data the image reads from disk. These guards keep that data in one set.
test('the theme data is pinned to a release and verified, never tracked on a moving branch', () => {
  for (const name of ['GTK', 'ICONS', 'CURSORS']) assert.match(theme, new RegExp(`^${name}_SHA256=[0-9a-f]{64}$`, 'm'));
  assert.match(theme, /sha256sum --check/);
  assert.doesNotMatch(theme, /\/master\.tar\.gz|\/HEAD|--branch=/);
  assert.match(theme, /^set -e$/m);
});

test('every toolkit reads the same WhiteSur names', () => {
  for (const file of [gtk2, gtk3, gtk4, dconf]) assert.match(file, /WhiteSur-Light/);
  assert.match(gtk3, /gtk-icon-theme-name=WhiteSur$/m);
  assert.match(gtk3, /gtk-cursor-theme-name=WhiteSur-cursors/);
  // macOS puts the traffic lights on the left, which is what Openbox's CIML title layout assumes.
  assert.match(gtk3, /gtk-decoration-layout=close,minimize,maximize:/);
  assert.match(gtk4, /gtk-theme-name=WhiteSur-Light/);
  assert.match(dconf, /gtk-theme='WhiteSur-Light'/);
  assert.match(dconf, /cursor-theme='WhiteSur-cursors'/);
  assert.match(look, /export XCURSOR_THEME=WhiteSur-cursors/);
  assert.match(look, /export QT_STYLE_OVERRIDE=adwaita/);
});

test('the toolkits have the packages needed to find that look', () => {
  for (const name of ['adwaita-qt', 'dconf-cli', 'dconf-gsettings-backend', 'gsettings-desktop-schemas']) {
    assert.match(packages, new RegExp(`^${name}$`, 'm'), `${name} is installed`);
  }
  assert.match(readDistro('etc', 'dconf', 'profile', 'user'), /system-db:local/);
  assert.match(theme, /dconf update/);
});

// picom 12.5 in trixie animates windows itself, so the effects are a config file rather than a fork.
test('native window animations are limited to application windows', () => {
  assert.match(picom, /match = "window_type = 'normal'"/);
  assert.match(picom, /backend = "xrender"/);
  for (const trigger of ['open', 'close', 'show', 'hide']) {
    assert.match(picom, new RegExp(`triggers = \\[ "${trigger}" \\]`), `${trigger} animates`);
  }
  assert.match(picom, /preset = "appear"/);
  assert.match(picom, /preset = "disappear"/);
  // The hide/show pair is the Dock minimisation, so it travels further than a plain open or close.
  assert.ok(picom.includes('scale = 0.2;'), 'minimising shrinks the window toward the Dock');
});

test('a picom that rejects the animation config still rounds and shades app windows', () => {
  assert.match(xsession, /picom --config "\$PICOM_CONF" --corner-radius "\$CORNER_RADIUS"/);
  assert.match(xsession, /picom_plain\(\) \{[\s\S]*?--corner-radius "\$CORNER_RADIUS"/);
  assert.match(xsession, /picom rejected \$PICOM_CONF/);
  assert.match(xsession, /^\s*picom_plain$/m);
});

// Openbox reserves space in device pixels; the SilkOS menu bar is 28 CSS pixels, so the two only
// agree when the margin is scaled the way the page is.
test('Openbox keeps native title bars out from under the SilkOS menu bar', () => {
  assert.match(xsession, /XFT_DPI="\$\(xrdb -query/);
  assert.match(xsession, /printf "%d", 28 \* dpi \/ 96 \+ 0\.5/);
  assert.ok(xsession.includes('s|<top>[0-9]*</top>|<top>$MENU_MARGIN</top>|'), 'the margin is written into a copy of the image config');
  assert.match(xsession, /openbox --config-file "\$RUN_RC"/);
  assert.match(xsession, /native windows can cover the SilkOS menu bar/);
  assert.match(hook, /grep -q '<margins>' "\$OPENBOX_RC"/);
});
