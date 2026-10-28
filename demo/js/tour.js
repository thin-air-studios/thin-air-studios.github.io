// The Tour (requirement 14, screens 4): the features in six categories, one card at a time, each with its screenshot, a
// bold title, one or two lines, and a Try it button where the card has one. Opened from the home screen's Tour pill
// (#btn-tour). The pill's one-time nudge goes once the Tour is opened or a game is started (markTourSeen).
import * as db from './airportdb.js?v=2f66fd5f';
import { boardsLive } from './boards.js?v=2f66fd5f';
import { register, closeScreen } from './screenstack.js?v=2f66fd5f';
import { assetUrl } from './flavor.js?v=2f66fd5f';
import { openBoards } from './screens.js?v=2f66fd5f';
import { CATEGORIES, cardsIn, cardLines, actionLabel } from './tour-data.js?v=2f66fd5f';

const $ = (id) => document.getElementById(id);
let deps = null; // main.js's save, writeSave, show, press, applySettings and startAirport
const at = { cat: 0, card: 0 }; // the category and the card on screen
let drag = null; // a pointer down on the card, for a swipe

/** The one-time nudge is done: the Tour was opened, or a game started. True when this changed the save. */
export function markTourSeen(save) {
  if (!save || save.tourSeen) return false;
  save.tourSeen = true;
  return true;
}

const cardsNow = () => cardsIn(CATEGORIES[at.cat].id);

/** Whether the setting a Try it button turns on is already on. */
function isOn(act) {
  const s = deps.getSave().settings;
  if (act === 'radio') return !!s.radio;
  if (act === 'voices') return !!s.voice && !!s.radio;
  if (act === 'music') return !!s.music;
  return false;
}

/** The lines of every card in the category, stacked in one grid cell with only the open card's shown: the box is as tall as
 *  the category's longest text, so the dots under it do not move from card to card on any screen. */
function drawLines(list, open) {
  const box = $('tour-body');
  box.innerHTML = '';
  list.forEach((card, i) => {
    const page = document.createElement('div');
    page.className = 'tour-lines';
    if (i !== open) {
      page.classList.add('off');
      page.setAttribute('aria-hidden', 'true');
    }
    for (const line of cardLines(card, { live: boardsLive() })) {
      const p = document.createElement('p');
      p.textContent = line;
      page.appendChild(p);
    }
    box.appendChild(page);
  });
}

function drawDots(list) {
  const box = $('tour-dots');
  box.innerHTML = '';
  list.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'tour-dot';
    b.setAttribute('aria-label', `${c.title}, ${i + 1} of ${list.length}`);
    if (i === at.card) b.setAttribute('aria-current', 'true');
    b.addEventListener('click', () => {
      at.card = i;
      render();
    });
    box.appendChild(b);
  });
}

/**
 * The picture's shape and cap on its stage: --ar is the picture's own shape, and --cap is its pixel width over the device
 * density, the widest it may be drawn, so the phone never draws it bigger than its pixels, at any density. The frame takes as
 * much of the stage as it has (style.css .tour-stage, .tour-frame), and the picture fills it.
 */
function sizeShot(img) {
  const stage = img.closest('.tour-stage');
  const k = Math.max(1, window.devicePixelRatio || 1);
  stage.style.setProperty('--ar', (img.naturalWidth / img.naturalHeight).toFixed(4));
  stage.style.setProperty('--cap', `${(img.naturalWidth / k).toFixed(1)}px`);
}

/** The card on screen: tabs, shot, name, lines, Try it and dots. Everything is redrawn from `at`. */
function render() {
  const list = cardsNow();
  at.card = Math.min(Math.max(at.card, 0), list.length - 1);
  const card = list[at.card];
  document.querySelectorAll('.tour-cat').forEach((b, i) => {
    const on = i === at.cat;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // the row scrolls: keep the open tab in it
  });
  const img = $('tour-shot');
  img.alt = card.title;
  const src = assetUrl(`tour/${card.shot}.webp`);
  if (img.getAttribute('src') !== src) img.src = src;
  // (sizeShot runs when the picture loads: its shape and its cap come from its own pixels)
  img.classList.remove('swap');
  void img.offsetWidth; // restart the cross-fade for the new card
  img.classList.add('swap');
  $('tour-name').textContent = card.title;
  drawLines(list, at.card);
  const act = card.act;
  // the Try button keeps its place when a card has no action (CSS .none): the dots do not move from card to card
  $('tour-try').classList.toggle('none', !act);
  if (act) {
    const on = isOn(act);
    $('tour-try').textContent = actionLabel(act, on);
    $('tour-try').disabled = on;
    $('tour-try').dataset.act = act;
  }
  $('btn-tour-prev').disabled = at.card === 0;
  $('btn-tour-next').disabled = at.card === list.length - 1;
  drawDots(list);
}

/** Shows a card of a category (a new category starts at its first card). */
function showCard(cat, card = 0) {
  at.cat = cat;
  at.card = card;
  render();
}

/** Moves one card along within the category; the arrows and the swipe stop at its ends. */
function step(d) {
  const next = at.card + d;
  if (next < 0 || next >= cardsNow().length) return;
  at.card = next;
  render();
}

function close() {
  closeScreen('tour');
}

/** A Try it button. Each one leaves the Tour and starts the thing it names, or turns its setting on. */
async function runAction(act) {
  deps.press();
  if (act === 'search') {
    close();
    $('search').focus(); // the home screen's search: the field fills, the keyboard comes up
    return;
  }
  if (act === 'demo') {
    close();
    $('btn-demo').click();
    return;
  }
  if (act === 'daily') {
    close();
    const today = db.todaysDaily(); // one reading: the airport and the number belong to the same day
    const info = await db.getAirport(today.airport[0]);
    if (info) deps.startAirport(info, { daily: today.n });
    return;
  }
  if (act === 'boards') {
    close();
    openBoards();
    return;
  }
  // the sound settings: the same rules as their switches (voices need the radio chatter, main.js)
  const save = deps.getSave();
  if (act === 'radio') save.settings.radio = true;
  if (act === 'voices') {
    save.settings.voice = true;
    save.settings.radio = true;
  }
  if (act === 'music') save.settings.music = true;
  if (!deps.writeSave(save)) deps.notSaved(); // the switch the Try turns on did not save: the player hears so (main.js)
  deps.applySettings();
  render();
}

/** Opens the Tour at its first category. Opening it counts as having seen it (the pill's nudge goes). */
export function openTour() {
  const save = deps.getSave();
  if (markTourSeen(save)) deps.writeSave(save);
  $('tour-tag').hidden = true;
  showCard(0, 0);
  deps.show('tour');
}

/** Wires the Tour once, at boot. d: { getSave(), writeSave(s), show(id, on), press(), applySettings(), startAirport(info, opts), notSaved() }. */
export function initTour(d) {
  deps = d;
  register('tour', () => deps.show('tour', false), () => $('tour').classList.contains('show'));
  const box = $('tour-cats');
  box.innerHTML = '';
  CATEGORIES.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'tour-cat';
    b.setAttribute('role', 'tab');
    b.textContent = c.name;
    b.addEventListener('click', () => {
      deps.press();
      showCard(i, 0);
    });
    box.appendChild(b);
  });
  $('btn-tour').addEventListener('pointerdown', () => deps.press());
  $('btn-tour').addEventListener('click', () => openTour());
  $('btn-tour-prev').addEventListener('pointerdown', () => deps.press());
  $('btn-tour-prev').addEventListener('click', () => step(-1));
  $('btn-tour-next').addEventListener('pointerdown', () => deps.press());
  $('btn-tour-next').addEventListener('click', () => step(1));
  $('tour-shot').addEventListener('load', (e) => sizeShot(e.currentTarget));
  // the cap is in CSS px at this screen's density: a change of density (a window moved to another screen) sizes it again
  window.addEventListener('resize', () => {
    const img = $('tour-shot');
    if (img.complete && img.naturalWidth > 0) sizeShot(img);
  });
  $('tour-try').addEventListener('click', () => {
    const act = $('tour-try').dataset.act;
    if (act) runAction(act);
  });
  // a swipe of more than 40 px sideways on the card turns the page; the card's own scroll (short screens) is up and down
  const stage = $('tour-stage');
  stage.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, id: e.pointerId };
  });
  stage.addEventListener('pointerup', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    drag = null;
    if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
  });
  stage.addEventListener('pointercancel', () => {
    drag = null;
  });
  document.addEventListener('keydown', (e) => {
    if (!$('tour').classList.contains('show')) return;
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  });
}
