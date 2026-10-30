const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createLibinputGestureParser } = require('../touchpad-gestures');

const head = (name, fingers, cancelled = false) =>
  ` event7   ${name.padEnd(22)} +12.345s\t${fingers}${cancelled ? ' (cancelled)' : ''}\n`;
const swipe = (dx, dy, fingers = 4) =>
  ` event7   GESTURE_SWIPE_UPDATE     +12.350s\t ${fingers}  ${(dx / 2).toFixed(2)}/ ${(dy / 2).toFixed(2)} (${dx.toFixed(2)}/ ${dy.toFixed(2)} unaccelerated)\n`;
const pinch = (scale, fingers = 4) =>
  ` event7   GESTURE_PINCH_UPDATE     +12.350s\t ${fingers}  0.00/ 0.00 ( 0.00/ 0.00 unaccelerated) ${scale.toFixed(2)} @ 3.10\n`;

const collect = () => {
  const gestures = [];
  const parser = createLibinputGestureParser(gesture => gestures.push(gesture));
  return { gestures, parser };
};

test('a four-finger left swipe begins once the direction is clear and follows the fingers', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(-20, 3) + swipe(-60, 2) + swipe(-670, 0) + head('GESTURE_SWIPE_END', 4));
  assert.deepEqual(gestures.map(g => g.phase), ['begin', 'update', 'update', 'end']);
  assert.ok(gestures.every(g => g.type === 'swipe' && g.direction === 'left'));
  assert.equal(gestures[0].progress, 0);
  assert.ok(Math.abs(gestures[2].progress - 0.5) < 0.01, `expected about half, got ${gestures[2].progress}`);
  assert.equal(gestures[3].progress, gestures[2].progress);
});

test('three-finger swipes are claimed as well', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 3) + swipe(200, 0, 3) + head('GESTURE_SWIPE_END', 3));
  assert.equal(gestures[0].direction, 'right');
});

test('vertical swipes report up and down with their own travel distance', () => {
  const up = collect();
  up.parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(5, -450) + head('GESTURE_SWIPE_END', 4));
  assert.equal(up.gestures[0].direction, 'up');
  assert.ok(Math.abs(up.gestures[1].progress - 0.5) < 0.01);
  const down = collect();
  down.parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(0, 300) + head('GESTURE_SWIPE_END', 4));
  assert.equal(down.gestures[0].direction, 'down');
});

test('reversing the fingers brings progress back down instead of switching direction', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(-300, 0) + swipe(-300, 0) + swipe(400, 0) + head('GESTURE_SWIPE_END', 4));
  const updates = gestures.filter(g => g.phase === 'update');
  assert.ok(updates[1].progress > updates[2].progress);
  assert.ok(gestures.every(g => g.direction === 'left'));
});

test('progress never leaves the 0 to 1 range', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(-5000, 0) + swipe(9000, 0) + head('GESTURE_SWIPE_END', 4));
  gestures.forEach(g => assert.ok(g.progress >= 0 && g.progress <= 1));
});

test('a pinch inward opens and an outward pinch closes, tracking the scale', () => {
  const inward = collect();
  inward.parser.write(head('GESTURE_PINCH_BEGIN', 4) + pinch(0.98) + pinch(0.9) + pinch(0.78) + head('GESTURE_PINCH_END', 4));
  assert.equal(inward.gestures[0].type, 'pinch');
  assert.equal(inward.gestures[0].direction, 'in');
  assert.ok(Math.abs(inward.gestures.at(-2).progress - 0.5) < 0.02);
  const outward = collect();
  outward.parser.write(head('GESTURE_PINCH_BEGIN', 3) + pinch(1.1, 3) + pinch(1.3, 3) + head('GESTURE_PINCH_END', 3));
  assert.equal(outward.gestures[0].direction, 'out');
});

test('two-finger pinches and swipes are left to scrolling and zoom', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_PINCH_BEGIN', 2) + pinch(0.5, 2) + head('GESTURE_PINCH_END', 2));
  parser.write(head('GESTURE_SWIPE_BEGIN', 2) + swipe(-900, 0, 2) + head('GESTURE_SWIPE_END', 2));
  assert.deepEqual(gestures, []);
});

test('a brush that never settles on a direction leaves no trace', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(-10, 4) + head('GESTURE_SWIPE_END', 4, true));
  assert.deepEqual(gestures, []);
});

test('a cancelled gesture still ends so the shell can settle', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(-400, 0) + head('GESTURE_SWIPE_END', 4, true));
  assert.equal(gestures.at(-1).phase, 'end');
});

test('output split across arbitrary chunks parses the same', () => {
  const input = head('GESTURE_SWIPE_BEGIN', 4) + swipe(-300, 0) + swipe(-300, 0) + head('GESTURE_SWIPE_END', 4);
  const whole = collect();
  whole.parser.write(input);
  const split = collect();
  for (let i = 0; i < input.length; i += 7) split.parser.write(input.slice(i, i + 7));
  assert.deepEqual(split.gestures, whole.gestures);
});

test('a second touchpad cannot hijack a gesture in progress', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 4));
  parser.write(' event9   GESTURE_SWIPE_BEGIN      +12.4s\t4\n event9   GESTURE_SWIPE_UPDATE     +12.5s\t 4  0.00/ 0.00 (-900.00/ 0.00 unaccelerated)\n');
  assert.deepEqual(gestures, []);
  parser.write(swipe(0, 700));
  assert.equal(gestures[0].direction, 'down');
});

test('reset ends a gesture the dead libinput process left open', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(-300, 0));
  parser.reset();
  assert.equal(gestures.at(-1).phase, 'end');
  parser.write(swipe(-300, 0));
  assert.equal(gestures.at(-1).phase, 'end');
});

test('device and pointer lines are ignored', () => {
  const { gestures, parser } = collect();
  parser.write('-event7   DEVICE_ADDED   Touchpad   seat0 default group1  cap:pg\n event7   POINTER_MOTION    +1.0s\t 1.00/ 2.00 ( 1.00/ 2.00 unaccelerated)\n');
  assert.deepEqual(gestures, []);
});
