/*
 * Touchpad gestures for SilkOS, read straight from libinput.
 *
 * `libinput debug-events` prints every gesture the kernel's touchpad driver recognises. Reading it
 * directly replaces the Touchégg daemon, whose D-Bus endpoint is a private peer-to-peer socket that
 * `dbus-monitor` cannot observe.
 *
 * The parser turns libinput's raw finger movement into the {phase, type, direction, progress}
 * events the desktop shell already animates:
 *   - three to five fingers swiping left/right switch desktops,
 *   - three to five fingers swiping up/down open the window switcher / expose the desktop,
 *   - three to five fingers pinching in/out open/close Launchpad.
 * Two-finger gestures are never claimed: they belong to scrolling and page zoom.
 *
 * Progress follows the fingers one to one. It can come back down if the fingers reverse, and the
 * "begin" event is only sent once the direction is known, so an accidental brush never starts an
 * animation.
 */
const MIN_FINGERS = 3;
const MAX_FINGERS = 5;
/* libinput reports movement in units normalised to 1000 dpi, so 1000 units is about 25 mm. */
const SWIPE_LOCK_UNITS = 50;
const SWIPE_TRAVEL_X = 1150;
const SWIPE_TRAVEL_Y = 760;
/* Pinch scale starts at 1.0; 0.22 of change (e.g. 1.0 to 0.78) is a complete gesture. Reaching the
   old 0.45 needed a stretch wider than most hands can manage on a trackpad. */
const PINCH_LOCK_SCALE = 0.03;
const PINCH_TRAVEL_SCALE = 0.22;

const LIBINPUT_COMMANDS = [
  /* stdbuf keeps libinput from holding gesture lines in a pipe buffer, which would turn a live
     swipe into a burst of events after the fingers have already lifted. */
  { name: 'direct', command: 'stdbuf', args: ['-oL', 'libinput', 'debug-events'] },
  /* Fallback when /dev/input is not readable by the session user. The live image has passwordless sudo. */
  { name: 'sudo', command: 'sudo', args: ['-n', 'stdbuf', '-oL', 'libinput', 'debug-events'] }
];

/* `libinput debug-events` prints a gesture as
     [-]<sysname>  <GESTURE_...>  <count> <time>\t<fingers> <dx>/<dy> (<ux>/<uy> unaccelerated>[ <scale> @ <angle>]
   The count field is blank for a lone event and holds a right-aligned number for every further event
   the same dispatch delivers. A swipe produces several updates per dispatch, so the field is usually
   filled and the line has to be read from its timestamp rather than from a fixed field position. */
const GESTURE_HEAD = /^\s*-?(\S+)\s+GESTURE_(SWIPE|PINCH)_(BEGIN|UPDATE|END)\b/;
const EVENT_TIME = /[+-]\d+\.\d+s/;
const GESTURE_BODY = /^\s*(\d+)\b(.*)$/;
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

  /* END, normal or cancelled: a gesture that never locked a direction leaves no trace. */
  const closeActive = () => {
    const finished = active;
    active = null;
    if (finished && finished.begun) emit('end', finished);
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
    const head = GESTURE_HEAD.exec(line);
    if (!head) return;
    const [, device, kind, stage] = head;
    const afterName = line.slice(head[0].length);
    const time = EVENT_TIME.exec(afterName);
    if (!time) return;
    const body = GESTURE_BODY.exec(afterName.slice(time.index + time[0].length));
    if (!body) return;
    const fingers = Number(body[1]);
    const rest = body[2];
    const type = kind === 'SWIPE' ? 'swipe' : 'pinch';

    if (stage === 'BEGIN') {
      /* One gesture at a time: a second touchpad cannot hijack a gesture already in progress. A
         second BEGIN from the same device means the previous END never arrived, and holding onto it
         would silence every later gesture for the rest of the session. */
      if (active) {
        if (active.device !== device) return;
        closeActive();
      }
      if (fingers < MIN_FINGERS || fingers > MAX_FINGERS) return;
      active = { device, type, dx: 0, dy: 0, scale: 1, direction: '', horizontal: false, begun: false, progress: 0 };
      return;
    }
    if (!active || active.device !== device) return;

    /* The END is what releases the slot, so it closes whatever is open on this device even if the
       type changed: a lost END line must not make the touchpad dead weight until the app restarts. */
    if (stage === 'END') {
      closeActive();
      return;
    }
    if (active.type !== type) return;

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
      closeActive();
    }
  };
}

module.exports = { createLibinputGestureParser, LIBINPUT_COMMANDS };
