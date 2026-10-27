// The game's keys for the airport search (2.8; DECISIONS 330): drawn into #search-kb from searchkeys.js (KEY_ROWS, SPECIAL_KEYS).
// Every key is a button with an accessible name (keyName). A press keeps the field's focus (the pointer and mouse downs are not
// focus changes), so the field never blurs under the keys, and the key acts on the click.
import { KEY_ROWS, SPECIAL_KEYS, keyName } from './searchkeys.js?v=86c2b44d';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The delete key's icon: an arrow pointing left into a box, drawn in the game's stroke style (aria-hidden: the name is on the key). */
function backIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = '<path d="M9.5 6H20v12H9.5L4 12z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/>';
  return svg;
}

/** The close key's icon: a cross (aria-hidden: the name is on the key). */
function closeIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = '<path d="M7 7l10 10M17 7 7 17"/>';
  return svg;
}

/** One key: a button that calls onKey(key) on its click. wide: the space bar's width (three keys). */
function makeKey(key, { label, text = '', icon = null, wide = false } = {}, onKey) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = wide ? 'skey skey-wide' : 'skey';
  b.dataset.key = key;
  b.setAttribute('aria-label', label || keyName(key));
  if (icon) b.appendChild(icon);
  else b.textContent = text || key;
  // a press keeps the field's focus: the keys are not a focus change (the field stays up, and so does the list under it)
  b.addEventListener('pointerdown', (e) => e.preventDefault());
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => onKey(key));
  return b;
}

/** Draws the keys into `container` (#search-kb): the digits and Close, the letters in QWERTY rows with Delete, and the last row with Space. */
export function buildKeys(container, onKey) {
  if (!container) return;
  container.innerHTML = '';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Airport search keys');
  const rows = [
    [...KEY_ROWS[0].map((k) => makeKey(k, {}, onKey)), makeKey(SPECIAL_KEYS.close.key, { label: SPECIAL_KEYS.close.label, icon: closeIcon() }, onKey)],
    KEY_ROWS[1].map((k) => makeKey(k, {}, onKey)),
    [...KEY_ROWS[2].map((k) => makeKey(k, {}, onKey)), makeKey(SPECIAL_KEYS.back.key, { label: SPECIAL_KEYS.back.label, icon: backIcon() }, onKey)],
    [...KEY_ROWS[3].map((k) => makeKey(k, {}, onKey)), makeKey(SPECIAL_KEYS.space.key, { label: SPECIAL_KEYS.space.label, text: 'space', wide: true }, onKey)],
  ];
  for (const keys of rows) {
    const row = document.createElement('div');
    row.className = 'skey-row';
    row.setAttribute('role', 'presentation');
    row.append(...keys);
    container.appendChild(row);
  }
}
