const SWIPE = 1;
const PINCH = 2;
const SWIPE_UP = 1;
const SWIPE_DOWN = 2;
const SWIPE_LEFT = 3;
const SWIPE_RIGHT = 4;
const PINCH_IN = 5;
const PINCH_OUT = 6;
const SWIPE_DIRECTIONS = {
  [SWIPE_UP]: 'up',
  [SWIPE_DOWN]: 'down',
  [SWIPE_LEFT]: 'left',
  [SWIPE_RIGHT]: 'right'
};

function createToucheggGestureParser(onGesture) {
  let buffer = '';
  let member = '';
  let values = [];

  const parseLine = line => {
    if (/^signal\b/.test(line)) {
      member = line.match(/\bmember=(OnGestureBegin|OnGestureUpdate|OnGestureEnd)\b/)?.[1] || '';
      values = [];
      return;
    }
    if (!member) return;

    const value = line.match(/^\s*(?:uint32|int32|uint64|double)\s+(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*$/i);
    if (!value) return;
    values.push(Number(value[1]));
    if (values.length < 6) return;

    const [type, direction, percentage, fingers] = values;
    const isPinch = type === PINCH && fingers === 5 && (direction === PINCH_IN || direction === PINCH_OUT);
    const isDesktopSwipe = type === SWIPE && fingers === 4 && SWIPE_DIRECTIONS[direction] !== undefined;
    if ((isPinch || isDesktopSwipe) && Number.isFinite(percentage)) {
      onGesture({
        phase: member === 'OnGestureBegin' ? 'begin' : member === 'OnGestureEnd' ? 'end' : 'update',
        type: isPinch ? 'pinch' : 'swipe',
        direction: isPinch ? (direction === PINCH_IN ? 'in' : 'out') : SWIPE_DIRECTIONS[direction],
        progress: Math.max(0, Math.min(1, percentage / 100))
      });
    }
    member = '';
    values = [];
  };

  return {
    write(chunk) {
      buffer += String(chunk);
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        parseLine(buffer.slice(0, newline).replace(/\r$/, ''));
        buffer = buffer.slice(newline + 1);
      }
    }
  };
}

module.exports = { createToucheggGestureParser };
