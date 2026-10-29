const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createToucheggGestureParser } = require('../touchpad-gestures');

const signal = (member, direction, percentage, fingers = 5, type = 2) =>
  `signal time=1.0 sender=:1.0 -> destination=(null destination) serial=1 path=/io/github/joseexposito/Touchegg; interface=io.github.joseexposito.Touchegg; member=${member}\n` +
  `   uint32 ${type}\n   uint32 ${direction}\n   double ${percentage}\n   int32 ${fingers}\n   uint32 1\n   uint64 10\n`;

test('Touchégg pinch progress is parsed across partial output chunks', () => {
  const gestures = [];
  const parser = createToucheggGestureParser(gesture => gestures.push(gesture));
  const input = signal('OnGestureBegin', 5, 0) + signal('OnGestureUpdate', 5, 42) + signal('OnGestureEnd', 5, 100);
  parser.write(input.slice(0, 100));
  parser.write(input.slice(100));
  assert.deepEqual(gestures, [
    { phase: 'begin', type: 'pinch', direction: 'in', progress: 0 },
    { phase: 'update', type: 'pinch', direction: 'in', progress: 0.42 },
    { phase: 'end', type: 'pinch', direction: 'in', progress: 1 }
  ]);
});

test('Touchégg parser ignores non-five-finger and non-pinch gestures', () => {
  const gestures = [];
  const parser = createToucheggGestureParser(gesture => gestures.push(gesture));
  parser.write(signal('OnGestureUpdate', 6, 70, 4) + signal('OnGestureUpdate', 3, 70, 5, 1));
  assert.deepEqual(gestures, []);
});

test('Touchégg reports outward pinch progress for Launchpad dismissal', () => {
  const gestures = [];
  const parser = createToucheggGestureParser(gesture => gestures.push(gesture));
  parser.write(signal('OnGestureUpdate', 6, 70));
  assert.deepEqual(gestures, [{ phase: 'update', type: 'pinch', direction: 'out', progress: 0.7 }]);
});

test('Touchégg reports four-finger horizontal swipe progress', () => {
  const gestures = [];
  const parser = createToucheggGestureParser(gesture => gestures.push(gesture));
  parser.write(signal('OnGestureBegin', 3, 0, 4, 1) + signal('OnGestureUpdate', 4, 56, 4, 1));
  assert.deepEqual(gestures, [
    { phase: 'begin', type: 'swipe', direction: 'left', progress: 0 },
    { phase: 'update', type: 'swipe', direction: 'right', progress: 0.56 }
  ]);
});

test('Touchégg reports four-finger vertical swipes for the switcher and desktop', () => {
  const gestures = [];
  const parser = createToucheggGestureParser(gesture => gestures.push(gesture));
  parser.write(signal('OnGestureBegin', 1, 0, 4, 1) + signal('OnGestureUpdate', 1, 55, 4, 1) + signal('OnGestureEnd', 2, 100, 4, 1));
  assert.deepEqual(gestures, [
    { phase: 'begin', type: 'swipe', direction: 'up', progress: 0 },
    { phase: 'update', type: 'swipe', direction: 'up', progress: 0.55 },
    { phase: 'end', type: 'swipe', direction: 'down', progress: 1 }
  ]);
});

test('Touchégg ignores vertical swipes from other finger counts', () => {
  const gestures = [];
  const parser = createToucheggGestureParser(gesture => gestures.push(gesture));
  parser.write(signal('OnGestureUpdate', 1, 70, 3, 1) + signal('OnGestureUpdate', 2, 70, 5, 1));
  assert.deepEqual(gestures, []);
});
