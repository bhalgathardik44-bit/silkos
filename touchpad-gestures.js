/*
 * Touchpad gestures for SilkOS, read straight from libinput.
 *
 * `libinput debug-events` prints every gesture the kernel's touchpad driver recognises. Reading it
 * directly replaces the Touchégg daemon, whose D-Bus endpoint is a private peer-to-peer socket that
 * `dbus-monitor` cannot observe, and which can never report a five-finger pinch because libinput
 * stops at four fingers.
 *
 * The parser turns libinput's raw finger movement into the {phase, type, direction, progress}
 * events the desktop shell already animates:
 *   - three or four fingers swiping left/right switch desktops,
 *   - three or four fingers swiping up/down open the window switcher / expose the desktop,
 *   - three or four fingers pinching in/out open/close Launchpad.
 * Two-finger gestures are never claimed: they belong to scrolling and page zoom.
 *
 * Progress follows the fingers one to one. It can come back down if the fingers reverse, and the
 * "begin" event is only sent once the direction is known, so an accidental brush never starts an
 * animation.
 */
const MIN_FINGERS = 3;
const MAX_FINGERS = 5;
/* libinput reports movement in units normalised to 1000 dpi, so 1000 units is about 25 mm. */
const SWIPE_LOCK_UNITS = 60;
const SWIPE_TRAVEL_X = 1500;
const SWIPE_TRAVEL_Y = 900;
/* Pinch scale starts at 1.0; 0.45 of change (e.g. 1.0 to 0.55) is a complete gesture. */
const PINCH_LOCK_SCALE = 0.04;
const PINCH_TRAVEL_SCALE = 0.45;

const LIBINPUT_COMMANDS = [
  /* stdbuf keeps libinput from holding gesture lines in a pipe buffer, which would turn a live
     swipe into a burst of events after the fingers have already lifted. */
  { name: 'direct', command: 'stdbuf', args: ['-oL', 'libinput', 'debug-events'] },
  /* Fallback when /dev/input is not readable by the session user. The live image has passwordless sudo. */
  { name: 'sudo', command: 'sudo', args: ['-n', 'stdbuf', '-oL', 'libinput', 'debug-events'] }
];

const EVENT_LINE = /^\s*-?(\S+)\s+(GESTURE_(?:SWIPE|PINCH)_(?:BEGIN|UPDATE|END))\s+\S+\s+(\d+)\b(.*)$/;
const NUMBER = '(-?\\d+(?:\\.\\d+)?)';
const MOTION = new RegExp(`${NUMBER}\\s*/\\s*${NUMBER}\\s*\\(\\s*${NUMBER}\\s*/\\s*${NUMBER}\\s*unaccelerated\\s*\\)(?:\\s+${NUMBER}\\s*@\\s*${NUMBER})?`);

const clamp01 = value => Math.max(0, Math.min(1, value));

function createLibinputGestureParser(onGesture) {
  let buffer = '';
  let active = null;

  const emit = (phase, gesture) => onGesture({
    phase,
    type: gesture.type,
    direction: gesture.direction,
    progress: clamp01(gesture.progress)
  });

  const lockSwipe = gesture => {
    if (Math.hypot(gesture.dx, gesture.dy) < SWIPE_LOCK_UNITS) return false;
    gesture.horizontal = Math.abs(gesture.dx) >= Math.abs(gesture.dy);
    gesture.direction = gesture.horizontal ? (gesture.dx < 0 ? 'left' : 'right') : (gesture.dy < 0 ? 'up' : 'down');
    return true;
  };

  const lockPinch = gesture => {
    if (Math.abs(gesture.scale - 1) < PINCH_LOCK_SCALE) return false;
    gesture.direction = gesture.scale < 1 ? 'in' : 'out';
    return true;
  };

  const measure = gesture => {
    if (gesture.type === 'pinch') {
      const change = gesture.direction === 'in' ? 1 - gesture.scale : gesture.scale - 1;
      return change / PINCH_TRAVEL_SCALE;
    }
    const travel = gesture.horizontal ? SWIPE_TRAVEL_X : SWIPE_TRAVEL_Y;
    const moved = gesture.horizontal
      ? (gesture.direction === 'left' ? -gesture.dx : gesture.dx)
      : (gesture.direction === 'up' ? -gesture.dy : gesture.dy);
    return moved / travel;
  };

  const parseLine = line => {
    const match = EVENT_LINE.exec(line);
    if (!match) return;
    const [, device, name, fingerText, rest] = match;
    const fingers = Number(fingerText);
    const [, kind, stage] = /^GESTURE_(SWIPE|PINCH)_(BEGIN|UPDATE|END)$/.exec(name);
    const type = kind === 'SWIPE' ? 'swipe' : 'pinch';

    if (stage === 'BEGIN') {
      /* One gesture at a time: a second touchpad cannot hijack a gesture already in progress. */
      if (active) return;
      if (fingers < MIN_FINGERS || fingers > MAX_FINGERS) return;
      active = { device, type, dx: 0, dy: 0, scale: 1, direction: '', horizontal: false, begun: false, progress: 0 };
      return;
    }
    if (!active || active.device !== device || active.type !== type) return;

    if (stage === 'UPDATE') {
      const motion = MOTION.exec(rest);
      if (!motion) return;
      if (type === 'swipe') {
        active.dx += Number(motion[3]);
        active.dy += Number(motion[4]);
      } else if (motion[5] !== undefined) {
        active.scale = Number(motion[5]);
      }
      if (!active.begun) {
        if (!(type === 'swipe' ? lockSwipe(active) : lockPinch(active))) return;
        active.begun = true;
        emit('begin', { ...active, progress: 0 });
      }
      active.progress = clamp01(measure(active));
      emit('update', active);
      return;
    }

    /* END, normal or cancelled: a gesture that never locked a direction leaves no trace. */
    const finished = active;
    active = null;
    if (finished.begun) emit('end', finished);
  };

  return {
    write(chunk) {
      buffer += String(chunk);
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        parseLine(buffer.slice(0, newline).replace(/\r$/, ''));
        buffer = buffer.slice(newline + 1);
      }
      if (buffer.length > 8192) buffer = '';
    },
    /* Called when the libinput process dies, so a half-finished gesture cannot leak into the next run. */
    reset() {
      buffer = '';
      if (active && active.begun) emit('end', active);
      active = null;
    }
  };
}

module.exports = { createLibinputGestureParser, LIBINPUT_COMMANDS };
