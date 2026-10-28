// One size scale for everything on screen, from the viewport in CSS px (on Android these are dp, so
// they already say how big the screen physically is).
import { clamp } from './util.js?v=2f66fd5f';

/**
 * 1.0 is the reference phone (844x390 landscape). Driven by the short side, capped by the width for odd
 * windows. `hud` is the in-play chrome read at a glance (canvas HUD, labels, popups, ticker, toast), so it
 * grows almost in proportion; `ui` is the menus and cards, reading text, so it grows like reading distance.
 * The floors keep phones where they were: the HUD at today's smallest-phone size, the menus never smaller.
 */
export function uiScales(cssW, cssH) {
  const r = Math.min(cssW, cssH) / 390;
  const hud = clamp(Math.min(r ** 0.8, cssW / 600), 0.92, 1.9);
  const ui = clamp(Math.min(r ** 0.5, cssW / 700), 1, 1.6);
  return { hud, ui };
}
