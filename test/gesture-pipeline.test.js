const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const xsession = read('distro', 'config', 'includes.chroot', 'usr', 'local', 'bin', 'silkos-xsession');
const hook = read('distro', 'config', 'hooks', 'normal', '0101-touchegg.hook.chroot');
const gestureMap = read('distro', 'config', 'includes.chroot', 'usr', 'share', 'silkos', 'touchegg.conf');
const main = read('main.js');

// Touchégg only broadcasts gestures from its daemon, and the daemon must be able to read
// /dev/input. Without these guards the shell keeps animating nothing and every gesture test on
// hardware fails with no clue why.
test('the session starts the Touchégg daemon, never the client', () => {
  const launches = xsession.split('\n').filter(line => /^\s*touchegg\b/.test(line));
  assert.ok(launches.length > 0, 'silkos-xsession never runs touchegg');
  launches.forEach(line => assert.match(line, /--daemon/, `touchegg must start as the daemon: ${line.trim()}`));
});

test('the image enables the Touchégg daemon unit shipped by the package', () => {
  assert.match(hook, /multi-user\.target\.wants\/touchegg\.service/);
});

test('SilkOS monitors the bus the Touchégg daemon owns', () => {
  assert.match(main, /'unix:abstract=touchegg'/);
  assert.match(main, /io\.github\.joseexposito\.Touchegg/);
});

test('the shipped gesture map leaves every gesture to the SilkOS shell', () => {
  const claims = gestureMap.replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(claims, /<gesture/);
  assert.match(claims, /<touchégg>/);
});
