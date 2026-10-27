// The world a screen gets (3.3; DECISIONS 435, 440): its width and height in world units, from the screen's size in CSS px. Pure,
// with no DOM, so a friend's challenge builds its world from the screen its link carries, the way the challenger's game built its
// own (challenge.js, main.js newGame). Every landscape screen gets the height the game has always had, and the width follows its
// shape. A window taller than wide with a short side of UPRIGHT_MIN_SIDE or more gets an upright airspace (UPRIGHT_W wide, its
// height from the window's aspect); a phone held upright stays on the landscape world, as it always has.
import { WORLD_H, WORLD_MIN_W, WORLD_MAX_W, UPRIGHT_MIN_SIDE, UPRIGHT_W, UPRIGHT_H_MAX } from './config.js?v=86c2b44d';
import { clamp } from './util.js?v=86c2b44d';

/** Whether a screen of cssW by cssH CSS px may show an upright airspace: taller than wide, and its short side is large enough. */
export function uprightAllowed(cssW, cssH) {
  return cssH > cssW && Math.min(cssW, cssH) >= UPRIGHT_MIN_SIDE;
}

/**
 * The world { W, H, upright } for a screen of cssW by cssH CSS px. A landscape screen (and any screen that is not large enough to
 * turn upright) has H = WORLD_H; an upright one has W = UPRIGHT_W and H from its aspect, never shorter than the width plus one unit.
 */
export function worldShape(cssW, cssH) {
  if (uprightAllowed(cssW, cssH)) {
    return { W: UPRIGHT_W, H: clamp(Math.round((UPRIGHT_W * cssH) / cssW), UPRIGHT_W + 1, UPRIGHT_H_MAX), upright: true };
  }
  return { W: Math.round(clamp(WORLD_H * (cssW / cssH), WORLD_MIN_W, WORLD_MAX_W)), H: WORLD_H, upright: false };
}
