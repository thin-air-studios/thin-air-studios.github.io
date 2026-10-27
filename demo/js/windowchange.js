// The window-size change that pauses a game in play (DECISIONS 442, 446). A change of more than this share of either side pauses it;
// a small one (the address bar) does not. The browser demo (DECISIONS 446) ignores a height-only change: a phone browser's toolbar
// showing or hiding changes the height of a landscape window by about 56 px (13.6 % of 412), and the app's WebView has no toolbar.
export const WINDOW_CHANGE_SHARE = 0.12;

/**
 * Whether a window moved enough to pause a game. was and now are { w, h } in CSS px; demo is the browser demo's build (WEB_DEMO).
 * A width change always counts. A height-only change counts in the app, and not in the demo.
 */
export function windowMoved(was, now, { demo = false } = {}) {
  const widthMoved = Math.abs(now.w - was.w) > WINDOW_CHANGE_SHARE * was.w;
  const heightMoved = Math.abs(now.h - was.h) > WINDOW_CHANGE_SHARE * was.h;
  return widthMoved || (heightMoved && !demo);
}
