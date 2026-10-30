const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { LIBINPUT_COMMANDS } = require('../touchpad-gestures');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const main = read('main.js');
const packages = read('distro', 'config', 'package-lists', 'silkos.list.chroot');
const xsession = read('distro', 'config', 'includes.chroot', 'usr', 'local', 'bin', 'silkos-xsession');
const udev = read('distro', 'config', 'includes.chroot', 'etc', 'udev', 'rules.d', '70-silkos-touchpad.rules');
const buildFiles = JSON.parse(read('package.json')).build.files;

// Gestures used to come from Touchégg's private D-Bus socket, which dbus-monitor cannot read.
// These guards keep the pipeline on libinput, which can be read from an ordinary user session.
test('SilkOS reads gestures from libinput, not from a Touchégg D-Bus socket', () => {
  assert.match(main, /LIBINPUT_COMMANDS/);
  assert.doesNotMatch(main, /dbus-monitor|unix:abstract=touchegg/);
  assert.doesNotMatch(xsession, /touchegg/i);
});

test('the monitor tries direct access first and sudo second, both line-buffered', () => {
  assert.deepEqual(LIBINPUT_COMMANDS.map(entry => entry.name), ['direct', 'sudo']);
  LIBINPUT_COMMANDS.forEach(entry => {
    assert.ok(entry.args.includes('debug-events'));
    assert.ok(entry.args.includes('-oL'), 'stdbuf -oL keeps live gestures from arriving in bursts');
  });
});

test('the image ships libinput and lets the session read touchpads', () => {
  assert.match(packages, /^libinput-tools$/m);
  assert.match(udev, /ID_INPUT_TOUCHPAD/);
  assert.match(udev, /uaccess/);
});

test('the gesture parser is packaged with the app', () => {
  assert.ok(buildFiles.includes('touchpad-gestures.js'));
});

const readDistro = (...parts) => read('distro', 'config', 'includes.chroot', ...parts);

// "Not authorized to control networking" came from NetworkManager asking polkit with no auth agent.
test('the image lets the signed-in user control networking and Bluetooth without a prompt', () => {
  assert.match(readDistro('etc', 'NetworkManager', 'conf.d', '10-silkos-auth.conf'), /auth-polkit=false/);
  const rule = readDistro('etc', 'polkit-1', 'rules.d', '49-silkos-radio.rules');
  assert.match(rule, /org\.freedesktop\.NetworkManager\./);
  assert.match(rule, /subject\.user === 'silk'/);
  assert.match(readDistro('etc', 'dbus-1', 'system.d', 'silkos-bluetooth.conf'), /user="silk"[\s\S]*org\.bluez/);
});

const shell = read('app', 'shell.js');
const settings = read('app', 'apps', 'settings.js');
const hook = read('distro', 'config', 'hooks', 'normal', '0100-silkos.hook.chroot');

test('desktop polling cannot snap the shell back to the desktop it just left', () => {
  assert.match(shell, /spaceChangedAt>askedAt/);
  assert.match(shell, /spaceChangedAt=performance\.now\(\)/);
});

test('Openbox leaves Ctrl+Alt+Left/Right to SilkOS so the animated switch runs', () => {
  assert.match(hook, /sed -i '\/<keybind key="C-A-Left">/);
  assert.match(hook, /! grep -q '<keybind key="C-A-/);
});

test('tap to click is a saved Trackpad setting applied through xinput', () => {
  assert.match(packages, /^xinput$/m);
  assert.match(main, /libinput Tapping Enabled/);
  assert.match(settings, /tg\('tapToClick','Tap to click'\)/);
  assert.match(shell, /tapToClick:false/);
  assert.match(shell, /function applyTrackpad/);
});

test('lowering brightness without a backlight dims through gamma and darkens the pointer', () => {
  assert.match(main, /'--brightness'/);
  assert.match(shell, /function syncCursorDim/);
  assert.match(shell, /replace\(\/'white'\/g/);
});
