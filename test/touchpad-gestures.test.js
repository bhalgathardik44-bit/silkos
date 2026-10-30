const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createLibinputGestureParser } = require('../touchpad-gestures');

/* Lines are built the way libinput 1.28 prints them (src/util-libinput.c):
     "%c%-7s  %-23s %s" + " " + "%+6.3fs\t%d[ %5.2f/%5.2f (%5.2f/%5.2f unaccelerated)[ %5.2f @ %5.2f]]"
   The count field is four spaces for a lone event and a right-aligned number for every further event
   delivered in the same dispatch, which is the normal case for a swipe. */
const field = value => value.toFixed(2).padStart(5);
const countField = count => (count > 1 ? String(count).padStart(3) + ' ' : '    ');
const eventLine = (name, fingers, { count = 1, time = '+12.345s', device = 'event7', prefix = ' ', tail = '' } = {}) =>
  `${prefix}${device.padEnd(7)}  ${name.padEnd(23)} ${countField(count)} ${time}\t${fingers}${tail}\n`;
const head = (name, fingers, { cancelled = false, tail = '', ...options } = {}) =>
  eventLine(name, fingers, { ...options, tail: tail + (cancelled ? ' cancelled' : '') });
const swipe = (dx, dy, fingers = 4, options = {}) =>
  head('GESTURE_SWIPE_UPDATE', fingers, { ...options, tail: ` ${field(dx)}/${field(dy)} (${field(dx)}/${field(dy)} unaccelerated)` });
const pinch = (scale, fingers = 4, options = {}) =>
  head('GESTURE_PINCH_UPDATE', fingers, {
    ...options,
    tail: ` ${field(0)}/${field(0)} (${field(0)}/${field(0)} unaccelerated) ${field(scale)} @ ${field(3.1)}`
  });

const collect = () => {
  const gestures = [];
  const parser = createLibinputGestureParser(gesture => gestures.push(gesture));
  return { gestures, parser };
};

test('a four-finger left swipe begins once the direction is clear and follows the fingers', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(-20, 3) + swipe(-60, 2) + swipe(-495, 0) + head('GESTURE_SWIPE_END', 4));
  assert.deepEqual(gestures.map(g => g.phase), ['begin', 'update', 'update', 'end']);
  assert.ok(gestures.every(g => g.type === 'swipe' && g.direction === 'left'));
  assert.equal(gestures[0].progress, 0);
  assert.ok(Math.abs(gestures[2].progress - 0.5) < 0.01, `expected about half, got ${gestures[2].progress}`);
  assert.equal(gestures[3].progress, gestures[2].progress);
});

test('swipe updates batched into one dispatch still count', () => {
  /* libinput numbers repeated events in the header. A parser that reads the finger count by field
     position sees "2" there and drops the movement, which is how a fast swipe lost every update. */
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 4) +
    swipe(-200, 0, 4, { count: 1 }) + swipe(-200, 0, 4, { count: 2 }) +
    swipe(-200, 0, 4, { count: 3 }) + swipe(-200, 0, 4, { count: 4 }) +
    head('GESTURE_SWIPE_END', 4, { count: 1 }));
  const updates = gestures.filter(g => g.phase === 'update');
  assert.equal(updates.length, 4);
  assert.ok(Math.abs(updates[3].progress - 800 / 1150) < 0.001, `expected all four deltas, got ${updates[3].progress}`);
});

test('the device-change prefix and a second touchpad name still parse', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 4, { prefix: '-', device: 'event9' }) + swipe(-600, 0, 4, { device: 'event9' }) + head('GESTURE_SWIPE_END', 4, { device: 'event9' }));
  assert.deepEqual(gestures.map(g => g.phase), ['begin', 'update', 'end']);
});

test('three-finger swipes are claimed as well', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 3) + swipe(200, 0, 3) + head('GESTURE_SWIPE_END', 3));
  assert.equal(gestures[0].direction, 'right');
});

test('vertical swipes report up and down with their own travel distance', () => {
  const up = collect();
  up.parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(5, -380) + head('GESTURE_SWIPE_END', 4));
  assert.equal(up.gestures[0].direction, 'up');
  assert.ok(Math.abs(up.gestures[1].progress - 0.5) < 0.01);
  const down = collect();
  down.parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(0, 250) + head('GESTURE_SWIPE_END', 4));
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
  inward.parser.write(head('GESTURE_PINCH_BEGIN', 4) + pinch(0.99) + pinch(0.89) + pinch(0.78) + head('GESTURE_PINCH_END', 4));
  const updates = inward.gestures.filter(g => g.phase === 'update');
  assert.equal(inward.gestures[0].type, 'pinch');
  assert.equal(inward.gestures[0].direction, 'in');
  assert.equal(updates.length, 2, 'a pinch too small to lock a direction must not emit an update');
  assert.ok(Math.abs(updates[0].progress - 0.5) < 0.01, `expected about half, got ${updates[0].progress}`);
  assert.ok(inward.gestures.at(-1).progress > 0.99, 'the last update and the end must agree');
  const outward = collect();
  outward.parser.write(head('GESTURE_PINCH_BEGIN', 3) + pinch(1.1, 3) + pinch(1.3, 3) + head('GESTURE_PINCH_END', 3));
  assert.equal(outward.gestures[0].direction, 'out');
});

test('a pinch completes within one comfortable stretch', () => {
  /* 0.22 of scale change is the whole gesture, so a pinch that reaches 0.78 is finished. */
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_PINCH_BEGIN', 4) + pinch(0.9) + pinch(0.78) + head('GESTURE_PINCH_END', 4));
  assert.ok(gestures.at(-2).progress > 0.99, `expected a complete pinch, got ${gestures.at(-2).progress}`);
});

test('two-finger pinches and swipes are left to scrolling and zoom', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_PINCH_BEGIN', 2) + pinch(0.5, 2) + head('GESTURE_PINCH_END', 2));
  parser.write(head('GESTURE_SWIPE_BEGIN', 2) + swipe(-900, 0, 2) + head('GESTURE_SWIPE_END', 2));
  assert.deepEqual(gestures, []);
});

test('a brush that never settles on a direction leaves no trace', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(-10, 4) + head('GESTURE_SWIPE_END', 4, { cancelled: true }));
  assert.deepEqual(gestures, []);
});

test('a cancelled gesture still ends so the shell can settle', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(-400, 0) + head('GESTURE_SWIPE_END', 4, { cancelled: true }));
  assert.equal(gestures.at(-1).phase, 'end');
});

test('output split across arbitrary chunks parses the same', () => {
  const input = head('GESTURE_SWIPE_BEGIN', 4) + swipe(-300, 0) + swipe(-300, 0, 4, { count: 2 }) + head('GESTURE_SWIPE_END', 4);
  const whole = collect();
  whole.parser.write(input);
  const split = collect();
  for (let i = 0; i < input.length; i += 7) split.parser.write(input.slice(i, i + 7));
  assert.deepEqual(split.gestures, whole.gestures);
});

test('a second touchpad cannot hijack a gesture in progress', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 4));
  parser.write(head('GESTURE_SWIPE_BEGIN', 4, { device: 'event9' }) + swipe(-900, 0, 4, { device: 'event9' }));
  assert.deepEqual(gestures, []);
  parser.write(swipe(0, 700));
  assert.equal(gestures[0].direction, 'down');
});

test('a lost END does not silence the touchpad for the rest of the session', () => {
  const first = collect();
  first.parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(-400, 0));
  assert.equal(first.gestures.length, 2);
  /* No GESTURE_SWIPE_END arrived. The next gesture has to reach the shell anyway. */
  first.parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(-400, 0) + head('GESTURE_SWIPE_END', 4));
  assert.deepEqual(first.gestures.map(g => g.phase), ['begin', 'update', 'end', 'begin', 'update', 'end']);
});

test('an END of another gesture type still releases the open one', () => {
  const { gestures, parser } = collect();
  parser.write(head('GESTURE_SWIPE_BEGIN', 4) + swipe(-400, 0) + head('GESTURE_PINCH_END', 4));
  assert.equal(gestures.at(-1).phase, 'end');
  parser.write(head('GESTURE_SWIPE_BEGIN', 4, { prefix: '-' }) + swipe(-400, 0) + head('GESTURE_SWIPE_END', 4));
  assert.equal(gestures.length, 6);
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
  parser.write('-event7   DEVICE_ADDED     Touchpad          seat0 default group1  cap:p left scroll-nat scroll-button\n event7   POINTER_MOTION       +1.000s  1.00/ 2.00 ( 1.00/ 2.00 unaccelerated)\n');
  assert.deepEqual(gestures, []);
});
