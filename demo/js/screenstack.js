// What Android Back closes, newest first. A screen registers how to close it once; openScreen puts it on top (main.js
// show() does that for every screen it opens), and backOne closes the top one that is still open. An entry closed some
// other way (a button, a state change) is dropped when Back reaches it, so nothing has to remove it by hand. No DOM
// here: main.js passes each screen's open test.

const screens = new Map(); // id -> { close, isOpen }
let stack = []; // ids, oldest first

/** A screen Back can close. isOpen says whether it is showing; close hides it (and does what closing it means). */
export function register(id, close, isOpen = () => true) {
  screens.set(id, { close, isOpen });
}

/** Puts a registered screen on top (moved there if it is already in the stack). Other ids are ignored. */
export function openScreen(id) {
  if (!screens.has(id)) return;
  stack = stack.filter((x) => x !== id);
  stack.push(id);
}

/** Closes a screen by name (its Done or X button): it leaves the stack and, if it is still open, runs its close. */
export function closeScreen(id) {
  stack = stack.filter((x) => x !== id);
  const s = screens.get(id);
  if (s && s.isOpen()) s.close();
}

/** Back: closes the newest open screen. False when none is open, so the caller goes on to the game's own Back. */
export function backOne() {
  while (stack.length) {
    const id = stack.pop();
    const s = screens.get(id);
    if (s && s.isOpen()) {
      s.close();
      return true;
    }
  }
  return false;
}

/** The open screens, oldest first (the tests read it). */
export function openScreens() {
  return stack.filter((id) => screens.has(id) && screens.get(id).isOpen());
}

/** Empties the stack and the registrations (tests only). */
export function resetScreens() {
  screens.clear();
  stack = [];
}
