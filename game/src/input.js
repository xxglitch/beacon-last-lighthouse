// Keyboard and pointer input. The mouse steers the beam; one-shot presses (start,
// pause, shockwave, mute, restart, upgrade picks) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost and never counted
// twice. Pointer coordinates stay in client pixels: the caller turns them into
// playfield coordinates with the renderer's view, which owns the scale.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_SHOCK = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;
export const ACTION_PICK_1 = 32;
export const ACTION_PICK_2 = 64;
export const ACTION_PICK_3 = 128;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);
const PICKS = new Map([
  ['Digit1', ACTION_PICK_1],
  ['Digit2', ACTION_PICK_2],
  ['Digit3', ACTION_PICK_3],
]);

export function createInput(target) {
  let actions = 0;
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 3;
  let mouseHeld = false;
  let clicked = null;

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM | ACTION_SHOCK;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (PICKS.has(event.code)) {
      if (!event.repeat) actions |= PICKS.get(event.code);
    } else {
      return;
    }
    event.preventDefault();
  });
  target.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    mouseHeld = true;
    clicked = { x: event.clientX, y: event.clientY };
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouseHeld = false;
  });
  // A button released while the tab is hidden never sends pointerup.
  window.addEventListener('blur', () => {
    mouseHeld = false;
  });

  return {
    /** The mouse position in client pixels; convert with the renderer's view. */
    mouse() {
      return { x: mouseX, y: mouseY };
    },
    /** Whether the pointer button is currently held (fires the pulse in play). */
    held() {
      return mouseHeld;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last click's client position since the last call, or null. */
    takeClick() {
      const taken = clicked;
      clicked = null;
      return taken;
    },
  };
}
