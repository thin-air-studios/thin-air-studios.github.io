// Game controller: screens, airport loading, the live-traffic loop, input, and wiring sim events
// to sound and feel.
import { SIM_HZ, CLASSES, ZONE_COLORS, STAR_GOALS, TUNING } from './config.js?v=86c2b44d';
import { Sim } from './sim.js?v=86c2b44d';
import { Renderer, canvasDpr, hudRectsFor } from './render.js?v=86c2b44d';
import { worldShape } from './worldshape.js?v=86c2b44d';
import { DensityGovernor, densityKey, startDensity, nextDensity } from './density.js?v=86c2b44d';
import { FX } from './fx.js?v=86c2b44d';
import { AudioEngine } from './audio.js?v=86c2b44d';
import { loadSave, writeSave, writeSaveDetail, resetSave } from './storage.js?v=86c2b44d';
import { haptic, setHaptics, appVersion, keepAwake, setRotationLock, shareText, speech, sharing, playGames, videoBridge, deviceHash, requestReview, openStorePage, openDemoPage, dailyReminder, onPlayGamesState, playGamesChanged } from './platform.js?v=86c2b44d';
import { noteFinishedGame, noteAsked, goodGame, reviewDue, REVIEW_SETTLE_MS } from './review.js?v=86c2b44d';
import { reminderNote, streakNote, recapNote, offerDue, offerShown, weekAfterLanding } from './reminder.js?v=86c2b44d';
import { TICKER_BUSIEST_MIN, afterCounted, gameNote, heldWorldAt, heldWorldStats, landedWord, percentLine, projectedLanded, readDailyHistogram, readWorldStats, sanitizeWorldStats, sendGameNote, shouldSendGameNote, tickerFacts, tickerPick, withCommas, worldStatsNote } from './worldstats.js?v=86c2b44d';
import { initCloud, cloudLine, syncCloud, scheduleCloudSave, flushCloudSave, resetCloud } from './cloud.js?v=86c2b44d';
import { shareTexts, renderCard, evenColumns, videoCaption } from './share.js?v=86c2b44d';
import { pickFromLink, parseChallengeLink, checkChallenge, linkInCaption } from './links.js?v=86c2b44d';
import { challengeFromGame, challengeHadReal, challengeWords, challengeScoreLine, challengeWho, challengeRealLine, challengeTexts, challengeSamePlanes, challengeWxSeed, weatherOfSeed, repeatableGame } from './challenge.js?v=86c2b44d';
import { damp, lerp, clamp, dist2, setHudScale, hudScale, textLines } from './util.js?v=86c2b44d';
import { drawAircraftShape } from './sprites.js?v=86c2b44d';
import * as db from './airportdb.js?v=86c2b44d';
import { buildWorld, landableClasses, setActiveEnd, takeoffIdent } from './airport.js?v=86c2b44d';
import { loadLayout, loadMetar, demoFeed, loadSurroundings, cacheGet, cacheSet, cacheDel, cacheKeys, newPolite, queueFullMap, START_WAIT_MS } from './airportdata.js?v=86c2b44d';
import { surroundingsInWorld, waterMask, Scenery } from './scenery.js?v=86c2b44d';
import { groundTheme, nearField } from './airportpaint.js?v=86c2b44d';
import { bearingToCanvas, bboxAround, haversine } from './geo.js?v=86c2b44d';
import { OpenSkyClient, LiveFeed, dailyFeed, countInArea } from './opensky.js?v=86c2b44d';
import { askForRoute, arrivalNote } from './routes.js?v=86c2b44d';
import { http } from './net.js?v=86c2b44d';
import { TrafficDirector, DIFFICULTIES, backdropOptions, runwayPace } from './director.js?v=86c2b44d';
import { gameConfig, challengeConfig, playRecorded, recordedPlayCode, gameTitleWord, DEMO_AIRPORTS } from './modes.js?v=86c2b44d';
import { weatherFromMetar, chooseActiveEnds, plainWeather } from './metar.js?v=86c2b44d';
import tzlookup from './vendor/tz.js?v=86c2b44d';
import { Lighting } from './lighting.js?v=86c2b44d';
import { bothEnds } from './closures.js?v=86c2b44d';
import { Bullet } from './bullet.js?v=86c2b44d';
import { endChanged, eitherEnd, stopFastForward } from './hazards.js?v=86c2b44d';
import { Radio, towerAccent, trafficUnder, callTypeWord, emergencyCall } from './radio.js?v=86c2b44d';
import { feedState, usable, mixLine, bannerLine, feedStatus, almostUsedUp, homeFeedLine, endLines, feedRecord, feedSaveDue, dotColour, RECORDED_STATUS } from './feedstate.js?v=86c2b44d';
import { checkDue, checkRecord, tapNote, CHECK_TIMEOUT_MS, RADIUS_M } from './feedcheck.js?v=86c2b44d';
import { realOnlyNote, departuresNote, levelChoices, levelConfirm, SAVE_FAILED } from './settingsnotes.js?v=86c2b44d';
import { PGS_FAILED, playGamesRow } from './playgames.js?v=86c2b44d';
import { TRACKS, trackByKey } from './music.js?v=86c2b44d';
import { register, openScreen, closeScreen, backOne, openScreens } from './screenstack.js?v=86c2b44d';
import { setLevelMidGame, setDeparturesMidGame, applyRewind, applyRealOnly, revealFixes } from './midgame.js?v=86c2b44d';
import { SLOW_SHEET, RPO_FLASH_MS, rpoFlash, KEEP_RUN_START, newSlowSky, resetSlowSky, noteSlowSky, slowSkyDue, afterKeep, breakRun } from './skysky.js?v=86c2b44d';
import { feedWords, nearHeading, breakdownRows, breakdownTotal, inGameLines, reportText, agoWords, nextWords } from './feedcard.js?v=86c2b44d';
import { nameForRival } from './area.js?v=86c2b44d';
import { displayName } from './airlines.js?v=86c2b44d';
import { Sky } from './sky.js?v=86c2b44d';
import { ACHIEVEMENTS, AchievementTracker, rankFor } from './achievements.js?v=86c2b44d';
import { bestInGame } from './achscreen.js?v=86c2b44d';
import { airportZone, boardsLive, catchUpPayload, makeApi, refreshBoardsLive } from './boards.js?v=86c2b44d';
import { canonicalLayout, hashText, stashLayout, queueGame, postQueued, cancelOutbox } from './outbox.js?v=86c2b44d';
import { statsLine, rankLine, rankWord, loadingRankLine, fillEndCard, countEndCard } from './endcard.js?v=86c2b44d';
import { playButtonWords, pickKey, lastPlayedOf, savedPickOf } from './playbutton.js?v=86c2b44d';
import { weekendOf, weekendAirport, weekendSetup, weekendWx, weekendSeed, themeOf, weekendLine } from './weekend.js?v=86c2b44d';
// Short Final Pro (DECISIONS 280): the free games' rules (pro.js) and the shell's purchase state, the sheet and Settings (propay.js)
import { advancePro, gameRule, countGame, playLeftWords, endOfferDue, ABOUT_PRO_LINE } from './pro.js?v=86c2b44d';
import { initPro, isPro, proSettled, openProSheet, closeProSheet, buyPro, restorePro, renderSettings } from './propay.js?v=86c2b44d';
import { initScreens, openBoards, openAchievements, refreshBoardsCache, renderStreakCorner } from './screens.js?v=86c2b44d';
import { initTour, markTourSeen } from './tour.js?v=86c2b44d';
import { makeGame, stepWorld, outcomeOf, liveFeedTick } from './simdriver.js?v=86c2b44d';
import { GhostRunner } from './ghost.js?v=86c2b44d';
import { Recorder, packReplay, REPLAY_MAX_PACKED } from './replay.js?v=86c2b44d';
import { makeVideo, canMakeVideo, VideoCancelled } from './video.js?v=86c2b44d';
import { deliver, stageBytes } from './videoenc.js?v=86c2b44d';
import { CLIPS, DEFAULT_CLIP } from './videoclip.js?v=86c2b44d';
import { startRanking, shouldPostScores, isRanked, easiestOf, LEVEL_ORDER, noteRanking } from './ranking.js?v=86c2b44d';
import { recordGame } from './stats.js?v=86c2b44d';
import { streakState, streakLine, recordPlayed, celebrateSound, MILESTONE_LINES } from './streak.js?v=86c2b44d';
import { VERSION } from './version.js?v=86c2b44d';
import { reducedMotion, bindRipples } from './motion.js?v=86c2b44d';
import { skyGesture, gestureAfterLanding, gestureAfterPlaneLift, groundTapWins, fingerMoveAction, tailUnder, tailReach, tailHandleReach, tailScale, tailMoveAction, liftEndsPath, tapTogglesHold, tapSlopPx, tailBeatsPlane, ringUnder, TAP_PX, RING_REACH_PX } from './fingers.js?v=86c2b44d';
import { canPlayGames, clearAgreement, clockNow, gateState } from './profile.js?v=86c2b44d';
import { initGate, checkGate, takeSignInOffer } from './gate.js?v=86c2b44d';
import { initLegal } from './legal.js?v=86c2b44d';
// 2.8 (DECISIONS 330 to 332): the Pro day on the trusted clock, the trial's first day across a reinstall, the search's own keys
import { proDate } from './clock.js?v=86c2b44d';
import { askFirstDay, applyFirstDay, FIRST_DAY_RETRY_MS } from './firstday.js?v=86c2b44d';
import { nearYou, phoneZone, placeless, keysAfter, typeKey } from './searchkeys.js?v=86c2b44d';
import { buildKeys } from './searchkb.js?v=86c2b44d';
// the browser demo (DECISIONS 445 to 449): its flavour and rules. The app never takes a WEB_DEMO branch
import { WEB_DEMO } from './flavor.js?v=86c2b44d';
import { windowMoved } from './windowchange.js?v=86c2b44d';
import { DEMO_WORDS, demoTimeUp, demoPlayWords, demoEndTitle, demoBrowserSupport, demoGamesLeft, demoCountGame, demoStoreUrl, demoStorageWorks, demoHomeNote } from './demo.js?v=86c2b44d';

/** Today for the Pro rules: the local day on the phone's clock, never past trusted time (clock.js; DECISIONS 331). */
const proToday = () => db.localDay(proDate());

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new Renderer(canvas);
const audio = new AudioEngine();
const fx = new FX();
let save = loadSave();
// the player said no to the phone's notification question (the reminder switch stays off, with a note; reminder.js)
let reminderDenied = false;

const game = {
  state: 'menu', // menu | loading | play | paused | over
  sim: null,
  arrivals: new Map(), // the arrival notes this game has shown, by aircraft id (the video's notes)
  fx,
  clock: 0,
  camera: { zoom: 1, fx: 0, fy: 0 },
  fast: false,
  showHud: false,
  displayScore: 0,
  scorePop: 0,
  best: 0,
  hint: null,
  vignette: 0,
  title: '',
  mix: '',
  banner: '',
  crashT: -1,
  acc: 0,
  scoreTick: 0,
  airport: null, // { info, layout, world, metar, feed, demo, tz }
  director: null,
  weather: null,
  night: 0,
};

// ------------------------------------------------------------------ setup

let nativeInsets = { l: 0, t: 0, r: 0, b: 0 };
function readInsets() {
  const cs = getComputedStyle($('safe-probe'));
  return {
    t: Math.max(parseFloat(cs.paddingTop) || 0, nativeInsets.t),
    r: Math.max(parseFloat(cs.paddingRight) || 0, nativeInsets.r),
    b: Math.max(parseFloat(cs.paddingBottom) || 0, nativeInsets.b),
    l: Math.max(parseFloat(cs.paddingLeft) || 0, nativeInsets.l),
  };
}
window.HP_setInsets = (l, t, r, b) => {
  nativeInsets = { l, t, r, b };
  const root = document.documentElement.style;
  root.setProperty('--safe-l', `${l}px`);
  root.setProperty('--safe-t', `${t}px`);
  root.setProperty('--safe-r', `${r}px`);
  root.setProperty('--safe-b', `${b}px`);
  layout();
};

// the density governor (density.js): a slow phone steps its canvas down for this screen, and keeps the notch in the save
const governor = new DensityGovernor();
let densityScreen = null;
let densityHeld = false; // the capture tools hold the density they shoot at (window.__HP.holdDensity)

/** Whether two HUD rectangles are the same, hard and soft: a change is recorded (as a 'hud' input), and only a change. */
function sameHudRects(a, b) {
  const same = (x, y) => x.x === y.x && x.y === y.y && x.w === y.w && x.h === y.h;
  return ['hard', 'soft'].every((k) => a[k].length === b[k].length && a[k].every((r, i) => same(r, b[k][i])));
}

/** The layout's code, as a challenge link names it (lo=, DECISIONS 435): the first eight hex digits of its hash, as a replay names it. */
async function layoutCodeOf(layout) {
  return (await hashText(canonicalLayout(layout))).slice(0, 8);
}

const WINDOW_CHANGE_NOTE = 'The screen changed size. Resume when you’re ready.';

function layout() {
  const was = { w: renderer.cssW, h: renderer.cssH };
  // the screen's own density, up to 3x (render.js canvasDpr: a big screen stays at 2x), or the notch a slow phone saved for
  // this screen; a new screen size (a rotation, a fold) starts the governor again at the device's own density
  const key = densityKey(window.innerWidth, window.innerHeight);
  if (key !== densityScreen) {
    densityScreen = key;
    governor.reset();
  }
  const dpr = startDensity(save.density, key, canvasDpr(window.devicePixelRatio, window.innerWidth, window.innerHeight));
  renderer.layout(window.innerWidth, window.innerHeight, dpr, readInsets());
  // a split screen, a fold or a desktop resize in play: the game pauses and says so (DECISIONS 442). The world stays as it was; the
  // airspace refits to the new window when the player resumes.
  const moved = windowMoved(was, { w: window.innerWidth, h: window.innerHeight }, { demo: WEB_DEMO }); // windowchange.js: the demo ignores a toolbar's height
  // (the demo's turn card takes a phone held upright: demoTurnPause pauses it silently, so the note is not said under the card)
  if (moved && game.state === 'play' && was.w > 1 && game.crashT < 0 && !(WEB_DEMO && heldUpright())) pauseGame({ note: WINDOW_CHANGE_NOTE });
  // a home screen that changes its shape (a tablet turned upright or back) gets the backdrop of its own shape
  if (game.state === 'menu' && attractWorld && attractWorld.H !== renderer.H) startAttract();
  // one scale for the in-play chrome (--hud) and one for the menus (--ui), canvas and CSS alike
  const root = document.documentElement.style;
  root.setProperty('--hud', renderer.hud.toFixed(3));
  root.setProperty('--ui', renderer.ui.toFixed(3));
  root.setProperty('--tick', renderer.tick.toFixed(3)); // the radio ticker's, a little under --hud where it's narrow
  setHudScale(renderer.hud);
  // a fold or unfold mid-game moves the HUD: arrivals (and gates placed after a wind shift) keep clear of it there. A friend's
  // challenge keeps the HUD its link gives (DECISIONS 435): its planes are the challenger's, so its HUD is not the screen's to move
  if (game.sim && game.sim.hudRects && !(game.airport && game.airport.challenge)) {
    const next = hudRectsFor(game.sim.W, game.sim.H, renderer.cssW, renderer.cssH, renderer.hud);
    if (!sameHudRects(next, game.sim.hudRects)) {
      game.hudMoved = true; // a game whose HUD moved in play cannot be repeated (repeatableGame)
      game.sim.hudRects = next;
      recInput('hud', next);
    }
  }
  tickerRect = null;
  renderer.clampView();
  renderer.scheduleBackground();
  syncOverShadow();
  if ($('share').classList.contains('show')) shareAppColumns();
  if ($('toast').classList.contains('show')) placeNotices(); // the toast's lines at the new size
  if (WEB_DEMO) demoTurnPause();
}

/** Settings: say why the radio is silent when the phone's speech engine isn't working. */
function showVoiceStatus() {
  const box = $('voice-status');
  if (!box) return;
  const st = radio.voice ? speech.status() : 'ready';
  // (re)starting: the line keeps what it says until the engine settles (watchVoiceStatus), rather than flash
  // 'starting' and move the card under the player's finger
  if (st === 'starting') return;
  const say = {
    'no-english': 'This phone has no English text-to-speech voice yet. Add one in the phone’s settings.',
    failed: 'The phone’s text-to-speech didn’t start. Check it in the phone’s settings.',
    lost: 'The phone’s text-to-speech stopped. It restarts with the next radio call.',
    none: 'This device can’t speak the radio calls.',
  }[st];
  box.hidden = !say;
  $('voice-status-text').textContent = say || '';
  $('btn-voice-settings').hidden = !['no-english', 'failed', 'lost'].includes(st);
}
// The engine settles a few seconds after a (re)start (up to 8 s per engine on the phone): the status line
// catches up twice a second while Settings is open.
let voiceTimer = 0;
function watchVoiceStatus() {
  clearTimeout(voiceTimer);
  let n = 0;
  const tick = () => {
    if (!$('settings').classList.contains('show')) return;
    showVoiceStatus();
    if (++n < 24) voiceTimer = setTimeout(tick, 500);
  };
  voiceTimer = setTimeout(tick, 500);
}

/** A greyed switch's line lights up for a moment: it says why the switch is greyed, in place of a message of its own. */
function flashNote(el) {
  el.classList.add('friendly-note');
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  clearTimeout(el.flashTimer);
  el.flashTimer = setTimeout(() => el.classList.remove('friendly-note'), 1600);
}

// The canvas HUD's edges as CSS variables, so the toast, ticker and pop-ups keep clear of it. Written only
// when a rounded value changes; removed while the HUD is hidden so the stylesheet's fallbacks apply.
const hudVars = {};
function syncHudVars(g) {
  const write = (el, name, px) => {
    const v = px == null ? '' : `${Math.round(px)}px`;
    if (hudVars[name] === v) return false;
    hudVars[name] = v;
    if (v) el.style.setProperty(name, v);
    else el.style.removeProperty(name);
    return true;
  };
  // the radio ticker's room: clear of the wind compass, and of the departure gates and names at the bottom edge
  // (at fit zoom, so it moves with the screen, a call or the gates, never the camera)
  const d = game.departures;
  const lane = g && renderer.tickerLane(d && d.gatesShown() ? d.exits : [], radio.cur ? tickerBox().height : 0);
  const root = document.documentElement, gap = 12 * renderer.hud;
  const moved = [
    write(root, '--hud-m', g && g.m),
    write(root, '--notice-top', g && g.centreBottom + 6), // below the title, mix line and banner
    write(root, '--hud-side', g && Math.max(g.scoreRight, renderer.cssW - g.btnLeft) + gap), // clear of the score and the buttons
  ];
  if (moved.some(Boolean)) {
    placeNotices(); // a narrower toast (the rewind button just appeared) is a taller one
    tickerRect = null; // and the ticker's room may have changed
  }
  // on the ticker alone, so a change restyles nothing else
  if (write($('radio'), '--ticker-side', lane && lane.side)) tickerRect = null;
}

// The radio ticker's box: read once per call (it holds its size while typing), and again after a layout or a
// change of its room.
let tickerFor = null, tickerRect = null;
function tickerBox() {
  if (radio.cur !== tickerFor || !tickerRect) {
    tickerFor = radio.cur;
    const el = $('radio'), r = el.getBoundingClientRect();
    // where it settles: a new call is read while it is still sliding up from 8 px below
    let ty = 0;
    try { ty = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 || 0; } catch (_) { /* no transform */ }
    tickerRect = { left: r.left, right: r.right, top: r.top - ty, bottom: r.bottom - ty, width: r.width, height: r.height };
  }
  return tickerRect;
}

// The radio ticker turns see-through while traffic, an arrival's warning ring or a callsign is underneath it:
// checked five times a second against its box, and at once when a call starts (it may start over traffic). It
// turns back only after a second with nothing there, so it doesn't pulse while a ring hands over to its
// aircraft or a wing clips the box.
let tickerT = 0, tickerSee = 0, tickerCall = null;
/**
 * While the ticker shows, its box is a bottom obstacle for the labels and notes at the planes (render.js hudBoxes, placeNote), so an
 * emergency plane low on the screen is labelled above it, not under it. None while it is hidden or on hold.
 */
function syncRadioBox() {
  const el = $('radio');
  if (!radio.cur || !el.classList.contains('show') || el.classList.contains('hold')) {
    renderer.radioBox = null;
    return;
  }
  const b = tickerBox(), c = canvas.getBoundingClientRect();
  renderer.radioBox = { x: b.left - c.left, y: b.top - c.top, w: b.width, h: b.height, hud: true, bottom: true, ticker: true };
}
function tickerSeeThrough(dt) {
  syncRadioBox();
  tickerT -= dt;
  if (tickerT > 0 && radio.cur === tickerCall) return;
  tickerT = 0.2;
  tickerCall = radio.cur;
  const el = $('radio');
  let hit = false;
  if (game.sim && radio.cur && el.classList.contains('show') && !el.classList.contains('hold')) {
    hit = trafficUnder(tickerBox(), game.sim, (x, y) => renderer.toScreen(x, y), renderer.scale / renderer.dpr, {
      bottom: renderer.cssH - renderer.insets.b,
      labels: renderer.labelBoxes,
    });
  }
  tickerSee = hit ? 1 : Math.max(0, tickerSee - 0.2);
  el.classList.toggle('see-through', tickerSee > 0);
}

/**
 * A setting changed: it is saved at once (storage.js keeps the phone's copy too). False when it did not save, and then the
 * player hears so (settingNotSaved). Every route that changes a setting saves through here.
 */
function saveSettings() {
  const kept = writeSave(save);
  if (!kept) settingNotSaved();
  return kept;
}

const SAVE_NOTE_MS = 3200;
/**
 * "Couldn't save that setting" (settingsnotes.js SAVE_FAILED). The toast is hidden on the pause card and the Live feed card
 * (style.css), so there the words take the card's own note line for a moment, in the note style (friendly-note); elsewhere
 * the toast says them.
 */
function settingNotSaved() {
  const note = $('feed').classList.contains('show') ? $('feed-save-note') : $('pause').classList.contains('show') ? $('pause-save-note') : null;
  if (!note) {
    toast(SAVE_FAILED, SAVE_NOTE_MS);
    return;
  }
  note.textContent = SAVE_FAILED;
  note.hidden = false;
  note.classList.add('friendly-note');
  note.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  clearTimeout(note.hideTimer);
  note.hideTimer = setTimeout(() => {
    note.hidden = true;
    note.textContent = '';
    note.classList.remove('friendly-note');
  }, SAVE_NOTE_MS);
}

function applySettings() {
  audio.setSfx(save.settings.sound);
  audio.setMusic(save.settings.music);
  setHaptics(save.settings.haptics);
  game.symbols = !!save.settings.symbols;
  radio.enabled = save.settings.radio !== false;
  // the radio speaks when chatter and voices are on (sound effects are separate)
  radio.voice = radio.enabled && save.settings.voice !== false;
  if (radio.voice) speech.init();
  else speech.stop();
  if (!radio.enabled) radio.clear();
  document.querySelectorAll('.toggle[data-setting]').forEach((el) => el.classList.toggle('on', !!save.settings[el.dataset.setting]));
  // voices need the radio: dim them while it's off
  document.querySelectorAll('.toggle[data-setting="voice"]').forEach((el) => el.classList.toggle('dim', !radio.enabled));
  showVoiceStatus();
  document.querySelectorAll('.seg[data-setting]').forEach((seg) => {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', save.settings[seg.dataset.setting] === b.dataset.v));
  });
  const d = DIFFICULTIES[save.settings.difficulty] || DIFFICULTIES.normal;
  // the level's name alone: the real planes switch is said elsewhere (the Play button and Settings), never on this pill
  $('diff-chip-value').textContent = d.label;
  // the music track: the engine switches at the next bar (U4's setTrack; until it lands, the choice is only saved)
  if (audio.setTrack) audio.setTrack(save.settings.musicTrack);
  renderSettingsNotes();
  refreshPausePanel();
  syncPlayButton(); // the Play now line follows the level, departures and Real planes only switch (Settings and in play)
}

/** Settings' state lines, from the saved settings (settingsnotes.js): one line under each switch. */
function renderSettingsNotes() {
  const s = save.settings;
  $('rpo-note').textContent = realOnlyNote({ on: !!s.realPlanesOnly }).text;
  const dep = departuresNote({ difficulty: s.difficulty, realOnly: !!s.realPlanesOnly, on: !!s.departures });
  $('dep-note').textContent = dep.text;
  $('btn-dep').classList.toggle('locked', dep.greyed);
  $('btn-dep').classList.toggle('on', !!s.departures && !dep.greyed);
  // the daily challenge reminder (reminder.js) and cloud save (cloud.js): one line each, the same in every place they show
  const native = dailyReminder.native();
  $('btn-reminder').classList.toggle('on', !!s.dailyReminder);
  $('btn-reminder').classList.toggle('locked', !native);
  $('reminder-note').textContent = reminderNote({ native, on: !!s.dailyReminder, allowed: native ? dailyReminder.allowed() : true, denied: reminderDenied });
  // the streak saver and the Sunday recap (DECISIONS 392): the same switch and the same line, in their own words (reminder.js)
  $('btn-streak-saver').classList.toggle('on', !!s.streakSaver);
  $('btn-streak-saver').classList.toggle('locked', !native);
  $('streak-saver-note').textContent = streakNote({ native, on: !!s.streakSaver, allowed: native ? dailyReminder.allowed() : true, denied: reminderDenied });
  $('btn-weekly-recap').classList.toggle('on', !!s.weeklyRecap);
  $('btn-weekly-recap').classList.toggle('locked', !native);
  $('weekly-recap-note').textContent = recapNote({ native, on: !!s.weeklyRecap, allowed: native ? dailyReminder.allowed() : true, denied: reminderDenied });
  $('worldstats-note').textContent = worldStatsNote({ native: !!deviceHash(), on: s.worldStats !== false });
  $('cloud-note').textContent = cloudLine();
  // Google Play Games (3.0; playgames.js playGamesRow): its line or its one Sign in button, following the sign-in live. Shown only
  // where Play Games is set up and the player has agreed (the same rule as the rest of the online features)
  const pgs = playGamesRow(playGames.status());
  $('set-pgs').hidden = !(playGames.enabled() && canPlayGames(save, clockNow()));
  $('pgs-note').textContent = pgs.line;
  $('pgs-note').hidden = !pgs.line;
  $('btn-pgs-signin').hidden = !pgs.signIn;
  markTrackList();
  document.querySelectorAll('.switch').forEach((el) => el.setAttribute('aria-checked', String(el.classList.contains('on'))));
}

/**
 * The Music track list (Settings): one radio row per track, in the registry's order (music.js TRACKS, Tower Jazz first), built
 * once. The chosen row is marked, and the arrow keys move the choice the way a radio group does.
 */
function buildTrackList() {
  const list = $('track-list');
  list.textContent = '';
  list.append(...TRACKS.map((t) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'track-row';
    row.setAttribute('role', 'radio');
    row.dataset.v = t.key;
    const name = document.createElement('span');
    name.className = 'track-name';
    name.textContent = t.name;
    const blurb = document.createElement('span');
    blurb.className = 'track-blurb';
    blurb.textContent = t.blurb;
    row.append(name, blurb);
    row.insertAdjacentHTML('beforeend', '<svg class="track-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M8 12.4l2.8 2.8L16 9.6"/></svg>');
    return row;
  }));
  markTrackList();
}

/** Marks the saved choice's row (aria-checked, the class the look reads) and makes it the one row Tab reaches. */
function markTrackList() {
  const chosen = trackByKey(save.settings.musicTrack).key;
  for (const row of $('track-list').children) {
    const on = row.dataset.v === chosen;
    row.setAttribute('aria-checked', String(on));
    row.tabIndex = on ? 0 : -1;
  }
}

// ---------------------------------------------------------------- screens

function show(id, on = true) {
  $(id).classList.toggle('show', on);
  if (on) openScreen(id); // Back closes the newest open screen first (screenstack.js)
}

let toastTimer = 0;
/** A short notice. `above`: over the end card too (the share panel's notices), which otherwise hides it. */
function toast(text, ms = 2400, above = false) {
  const el = $('toast');
  el.textContent = text;
  el.classList.toggle('above', above);
  el.classList.add('show');
  placeNotices();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    placeNotices();
  }, ms);
}

/**
 * The toast and the achievement pop-up share the spot under the HUD's centre block: while a toast is up,
 * the pop-up moves down to just below it instead of covering it, and so do the canvas's centre messages
 * ('Close call!', renderer.toastBottom). The toast's box comes from its layout (offsetTop and offsetHeight
 * ignore the slide-in transform, so they're right mid-transition).
 */
function placeNotices() {
  const t = $('toast'), pop = $('ach-pop'), area = $('area-note');
  const up = t.classList.contains('show');
  if (up) fitToast(t);
  if (up) pop.style.setProperty('--below-toast', `${t.offsetHeight + 8}px`);
  else pop.style.removeProperty('--below-toast');
  if (up) area.style.setProperty('--below-toast', `${t.offsetHeight + 8}px`);
  else area.style.removeProperty('--below-toast');
  renderer.toastBottom = up ? t.offsetTop + t.offsetHeight : 0;
}

/**
 * The toast as wide as its lines. text-wrap: balance evens out a tip's two lines, but the box keeps the width of
 * the one long line it was laid out for, so on a tablet two short centred lines sat in a pill twice their width.
 * Measured from the lines as laid out (the widest, its padding and a pixel to spare, so the same words break in
 * the same places); cleared first, so a new toast or a change of its room (placeNotices) is measured afresh.
 */
function fitToast(el) {
  el.style.width = '';
  const range = document.createRange();
  range.selectNodeContents(el);
  const lines = textLines(range.getClientRects());
  if (lines.count < 2) return; // a single line: its own width already
  const cs = getComputedStyle(el);
  const edges = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  el.style.width = `${Math.ceil(lines.widest + edges) + 1}px`;
}

// achievements pop up one at a time under the HUD
const achQueue = [];
let achBusy = false;
let achWait = 0;
function earnAchievement(a) {
  playGames.unlock(a.name);
  if (game.achThisGame) game.achThisGame.push(a);
  writeSave(save);
  achQueue.push(a);
  if (!achBusy) nextAchievement();
}
function nextAchievement() {
  const el = $('ach-pop');
  if (!achQueue.length) {
    achBusy = false;
    return;
  }
  achBusy = true;
  // one thing at a time: wait for a tip, or a runway warning, to clear first (but not forever)
  achWait = (achWait || 0) + 1;
  if (($('toast').classList.contains('show') || (game.warnBanner && game.state === 'play')) && achWait < 15) {
    setTimeout(nextAchievement, 700);
    return;
  }
  achWait = 0;
  const a = achQueue.shift();
  achBusy = true;
  el.querySelector('.ach-icon').textContent = a.icon;
  el.querySelector('b').textContent = a.name;
  placeNotices();
  el.classList.add('show');
  audio.play('fanfare');
  haptic('heavy');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(nextAchievement, 450);
  }, 2600);
}

export function localTime(info, date = new Date()) {
  try {
    const tz = tzlookup(info.lat, info.lon);
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(date);
  } catch (_) {
    return '';
  }
}

/** An airport on the home list. A tap picks it (tapRow): the row turns teal and Play names it. search: a search result. */
function airportRow(info, { rank = 0, paxM = 0, note = '', sub = '', search = false } = {}) {
  const b = document.createElement('button');
  b.className = 'ap-row';
  b.dataset.key = pickKey({ info });
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `<span class="ap-rank"></span><span class="ap-code"></span><span class="ap-name"><div></div><small></small></span><span class="ap-meta"></span><svg class="ap-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
  b.querySelector('.ap-rank').textContent = rank ? String(rank) : '';
  b.querySelector('.ap-code').textContent = info.iata || info.icao;
  b.querySelector('.ap-name div').textContent = info.name;
  b.querySelector('.ap-name small').textContent = sub || [db.cityName(info.city), info.country].filter(Boolean).join(', ');
  const stars = starsFor(save.best[info.icao] || 0);
  if (save.best[info.icao]) {
    const st = document.createElement('span');
    st.className = 'ap-stars';
    st.textContent = starText(stars);
    b.querySelector('.ap-code').appendChild(st);
  }
  const meta = b.querySelector('.ap-meta');
  const best = save.best[info.icao];
  const top = paxM ? `${Math.round(paxM)}M passengers` : note || (best ? `Best ${best}` : '');
  if (top) {
    const el = document.createElement('b');
    el.textContent = top;
    meta.appendChild(el);
  }
  meta.appendChild(document.createTextNode(localTime(info)));
  b.addEventListener('pointerdown', () => press());
  b.addEventListener('click', () => tapRow(info, 0, { search }));
  return b;
}

/** Today's challenge: the same airport, traffic and weather for everyone, on Normal. n is the day's number (airportdb.js). */
function dailyRow(info, n) {
  const b = document.createElement('button');
  b.className = 'ap-row daily-row';
  b.dataset.key = pickKey({ info, daily: n });
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `<span class="ap-rank"></span><span class="ap-code">★</span><span class="ap-name"><div></div><small></small></span><span class="ap-meta"></span><svg class="ap-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
  b.querySelector('.ap-name div').textContent = `Daily challenge #${n}`;
  // what the challenge is, on one line (the longer line was cut off on every screen; the pause card says it in
  // full): the shorter words where the row is too narrow for these (style.css)
  const what = (cls, text) => Object.assign(document.createElement('span'), { className: cls, textContent: text });
  b.querySelector('.ap-name small').append(`${info.iata || info.icao} · `, what('long', 'same planes for everyone'), what('short', 'same planes'));
  const d = save.daily && save.daily.n === n ? save.daily : null;
  const top = document.createElement('b');
  top.textContent = d ? `Today’s best ${d.best}` : 'Not flown yet';
  // the play streak (streak.js) is the one streak: the meta shows it while it is kept
  const st = streakState(save.streak, db.localDay(new Date()));
  const kept = (st.status === 'played' || st.status === 'risk') && st.count >= 2;
  b.querySelector('.ap-meta').append(top, document.createTextNode(kept ? `${st.count}-day streak` : 'Normal'));
  b.addEventListener('pointerdown', () => press());
  b.addEventListener('click', () => tapRow(info, n));
  return b;
}

/**
 * This weekend's event: one airport and one twist, the same for everyone whose clock says this weekend (weekend.js). Its row says the
 * airport and the twist, the best this player has flown this weekend, and it plays offline (the airport is bundled). W is its Saturday.
 */
function weekendRow(info, W) {
  const b = document.createElement('button');
  b.className = 'ap-row weekend-row';
  b.dataset.key = pickKey({ info, weekend: W });
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `<span class="ap-rank"></span><span class="ap-code">🛩️</span><span class="ap-name"><div></div><small></small></span><span class="ap-meta"></span><svg class="ap-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
  b.querySelector('.ap-name div').textContent = themeOf(W).title;
  // the twist on one line, the shorter words where the row is narrow (as the daily row does)
  const what = (cls, text) => Object.assign(document.createElement('span'), { className: cls, textContent: text });
  b.querySelector('.ap-name small').append(what('long', weekendLine(W, info.iata || info.icao)), what('short', weekendLine(W, info.iata || info.icao, { short: true })));
  const wk = save.weekend && save.weekend.w === W ? save.weekend : null;
  const top = document.createElement('b');
  top.textContent = wk ? `Your best ${wk.best.toLocaleString('en-US')}` : 'Not flown yet';
  b.querySelector('.ap-meta').append(top, document.createTextNode('Weekend event'));
  b.addEventListener('pointerdown', () => press());
  b.addEventListener('click', () => tapRow(info, 0, { weekend: W }));
  return b;
}

const starsFor = (score) => STAR_GOALS.filter((g) => score >= g).length;
const starText = (n) => '★'.repeat(n) + '☆'.repeat(STAR_GOALS.length - n);

function listHead(title, sub = '') {
  const h = document.createElement('div');
  h.className = 'list-head';
  h.innerHTML = '<b></b><span></span>';
  h.querySelector('b').textContent = title;
  h.querySelector('span').textContent = sub;
  return h;
}

// ------------------------------------------------------------ the live feed check (feedcheck.js, 2.1)
// One anonymous OpenSky request around the last airport played (else today's), when the home screen shows, when the app
// comes back after 10 minutes away, and on a tap of the feed line. It is the request a live game makes at its airport, so
// feedcheck.js holds the rules; this makes the request and saves the answer. It runs only on the home screen (feedGateClear).
let checkInFlight = false; // a request is on its way (the line says "checking")
let awaySince = 0; // when the app went to the background (0 while it is not away)
let lastSentMs = 0; // when the last request was sent (the minute between two requests counts from it)
/** The home screen may check: the player has passed the gate (13 and up, agreed) and the game is on the menu. */
function feedGateClear() {
  return gateState(save, clockNow()) === 'home' && game.state === 'menu';
}
/** The feed's line on the home screen and in Settings, from the saved check (feedstate.js homeFeedLine). */
function renderFeedLines() {
  if (WEB_DEMO) {
    $('home-feed').textContent = DEMO_WORDS.feedHome; // the planes are simulated: nothing was checked
    syncPlayButton();
    return;
  }
  const now = Date.now();
  $('home-feed').textContent = homeFeedLine(save.feed, now, { checking: checkInFlight });
  $('feed-set-note').textContent = homeFeedLine(save.feed, now, { checking: checkInFlight, settings: true });
  syncPlayButton(); // the no-internet case of Play now follows the check's record
}
/** The airport the check looks around: the last one played (a game, a recording or a daily), else today's airport. */
async function checkAirport() {
  const last = (save.recent || [])[0];
  const info = last ? await db.getAirport(last) : null;
  return info || db.getAirport(db.todaysDaily().airport[0]);
}
/** The first of the promise and a timer settles the wait; a later answer is dropped (its credit is spent). */
function settleWithin(p, ms, fallback) {
  let timer = 0;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
/**
 * Runs the check when feedcheck.js's checkDue lets it: sends the one request, saves what came back as the record (save.feed)
 * and redraws the lines. trigger: 'home' | 'resume' | 'tap'; awayMs: how long the app was away (a resume). A refused tap
 * says why in a toast. A check that ends in a game is not saved: the game's own feed is in play then.
 */
async function runFeedCheck(trigger, awayMs = 0) {
  if (WEB_DEMO) return; // the demo asks no feed (DECISIONS 446)
  const nowMs = Date.now();
  const dec = checkDue({ trigger, nowMs, rec: save.feed, awayMs, inFlight: checkInFlight, online: navigator.onLine !== false, gateClear: feedGateClear(), lastSentMs });
  if (!dec.run) {
    if (dec.why === 'offline') {
      save.feed = checkRecord({ offline: true }, nowMs); // the line says so at once, without a request
      writeSave(save);
    }
    if (trigger === 'tap') {
      const note = tapNote(dec.why, save.feed, nowMs);
      if (note) toast(note, 2400);
    }
    renderFeedLines();
    return;
  }
  checkInFlight = true;
  renderFeedLines();
  let ap = null;
  let res = { ok: false, status: 0 };
  try {
    ap = await checkAirport();
    if (ap) {
      lastSentMs = Date.now();
      const send = new OpenSkyClient({ http })
        .fetchStates(bboxAround(ap.lat, ap.lon, RADIUS_M), lastSentMs, { timeoutMs: CHECK_TIMEOUT_MS })
        .catch(() => ({ ok: false, status: 0 }));
      res = await settleWithin(send, CHECK_TIMEOUT_MS, { ok: false, status: 0 });
    }
  } catch (_) { /* no answer: the record below says so */ }
  checkInFlight = false;
  const end = Date.now();
  const real = res.ok && ap ? countInArea(res.flights, ap.lat, ap.lon, RADIUS_M, res.time ?? end / 1000) : 0;
  if (game.state === 'menu') {
    save.feed = checkRecord(res, end, real, navigator.onLine !== false);
    writeSave(save);
  }
  renderFeedLines();
}
// the line's words age with the clock ("checked 3 min ago" is a minute older): redrawn every 30 s on the menu, no request
setInterval(() => {
  if (game.state === 'menu') renderFeedLines();
}, 30e3);
// World stats' line rotates and counts up on the home screen (3.2, DECISIONS 400): redrawn each second, no request; the counts are read
// again at most every FETCH_MS (worldstats.js readWorldStats holds them)
setInterval(() => {
  if (game.state === 'menu') renderHomeWorld();
}, 1000);
setInterval(() => {
  if (game.state === 'menu') refreshHomeWorld();
}, 60e3);

// World stats on the home screen (3.1; worldstats.js). 3.2 (DECISIONS 400): the line rotates its facts every few seconds, and today's
// planes count up between reads at the recent rate. Hidden with the boards closed, on any error and while offline (a failed read clears
// the held counts). The count only goes up until the next read (tickerFloor), so it never steps back.
let tickerFloor = { at: -1, value: 0 };
function tickerText(now) {
  const stats = boardsLive() ? heldWorldStats() : null;
  if (!stats) return '';
  const at = heldWorldAt();
  if (tickerFloor.at !== at) tickerFloor = { at, value: 0 };
  const landed = Math.max(projectedLanded(stats, at, now), tickerFloor.value);
  tickerFloor.value = landed;
  const facts = tickerFacts(stats, { readAtMs: at, nowMs: now, landed });
  const i = tickerPick(facts.length, now);
  return i < 0 ? '' : facts[i].text;
}
function renderHomeWorld() {
  const el = $('home-world');
  const line = tickerText(Date.now());
  el.textContent = line;
  el.hidden = !line;
}
function refreshHomeWorld() {
  if (!boardsLive()) return;
  readWorldStats({ api: makeApi() }).then(() => { renderHomeWorld(); renderHomeBusiest(); });
}

// The busiest airport today as a home row (3.2, DECISIONS 400): at the top of the list under its own head, once it has enough games.
// It is an airport row like the others, so a tap picks it (the Play button starts the game). Nothing shows during a search.
async function renderHomeBusiest() {
  const list = $('airport-list');
  const stats = boardsLive() && !$('search').value.trim() ? heldWorldStats() : null;
  const top = stats && stats.airports[0];
  const info = top && top.games >= TICKER_BUSIEST_MIN ? await db.getAirport(top.icao) : null;
  list.querySelectorAll('.busiest-head, .busiest-row').forEach((n) => n.remove());
  if (!info || heldWorldStats() !== stats || $('search').value.trim()) return;
  const row = airportRow(info, { note: `${withCommas(top.games)} games` });
  row.classList.add('busiest-row');
  const head = listHead('Busiest today', landedWord(top.landed));
  head.classList.add('busiest-head');
  list.prepend(row);
  list.prepend(head);
  markPicked();
}

// The end card's percentile (3.2, DECISIONS 400): a finished daily game says how it did against today's plays of the daily, once there are
// 20 of them (percentLine). The line is added after the card's lines, and only to the card it was asked for (the token).
let percentToken = null;
async function showDailyPercent(daily, score) {
  const token = {};
  percentToken = token;
  const hist = await readDailyHistogram({ api: makeApi(), daily });
  const text = hist ? percentLine(hist, score) : '';
  if (!text || percentToken !== token) return;
  const d = document.createElement('div');
  d.textContent = text;
  $('over-ach').appendChild(d);
}

let homeToken = 0;
async function showFeatured() {
  const token = ++homeToken;
  syncPlayButton(); // the Play now line: Ranked or Unranked from the settings (below)
  $('tour-tag').hidden = save.tourSeen; // the Tour's one-time nudge (tour.js)
  renderFeedLines(); // the feed's line on the home screen (the check below, or the saved one)
  renderHomeWorld(); // World stats' line under it (worldstats.js); read below, never waited for
  refreshHomeWorld();
  const hs = $('home-stats');
  hs.textContent = '';
  if (save.played) {
    const rk = document.createElement('b');
    rk.textContent = rankFor(save.landed).name;
    // the passengers' phrase is one span: a narrow card wraps it between its number and its last word (3.3, DECISIONS 444)
    const pax = document.createElement('span');
    pax.className = 'home-pax';
    pax.textContent = `${(save.pax || 0).toLocaleString('en-US')} passengers landed`;
    hs.append(rk, document.createElement('br'), pax);
  }
  const busiest = [];
  for (const [code, paxM] of db.BUSIEST) {
    const a = await db.getAirport(code);
    if (a) busiest.push([a, paxM]);
  }
  const recent = [];
  for (const r of save.recent || []) {
    const a = await db.getAirport(r);
    if (a && recent.length < 3) recent.push(a);
  }
  const daily = db.todaysDaily(); // the airport and the number, read together (airportdb.js)
  const [todayCode, todayPax, todayRank] = daily.airport;
  const today = await db.getAirport(todayCode);
  // the weekend event's row shows on Saturday and Sunday only (weekend.js); its airport is bundled, so it needs no network
  const wkDay = weekendOf(db.localDay(new Date()));
  const wkInfo = wkDay !== null ? await db.getAirport(weekendAirport(wkDay)) : null;
  await pickRestored; // a fresh launch's pick is read before the list is built, so its row is teal from the first paint
  if (token !== homeToken || $('search').value.trim()) return;
  // a weekend's pick ends with its weekend: the row is gone, so the pick goes too (it would name an event that is not on)
  if (picked && picked.weekend && wkDay !== picked.weekend) {
    picked = null;
    savePick();
  }
  const list = $('airport-list');
  list.innerHTML = '';
  if (today && !WEB_DEMO) {
    list.appendChild(listHead('Today’s airport', 'a new one every day'));
    list.appendChild(airportRow(today, { rank: todayRank, paxM: todayPax }));
    list.appendChild(dailyRow(today, daily.n));
  }
  if (wkInfo && !WEB_DEMO) {
    list.appendChild(listHead('This weekend’s event', 'one airport, one twist'));
    list.appendChild(weekendRow(wkInfo, wkDay));
  }
  if (recent.length) {
    list.appendChild(listHead('Recent'));
    for (const a of recent) list.appendChild(airportRow(a));
  }
  const got = busiest.reduce((n, [a]) => n + starsFor(save.best[a.icao] || 0), 0);
  list.appendChild(listHead('World’s busiest', got ? `★ ${got} of ${busiest.length * STAR_GOALS.length}` : '2025 passengers'));
  busiest.forEach(([a, paxM], i) => list.appendChild(airportRow(a, { rank: i + 1, paxM })));
  markPicked(); // the picked row is teal, and a search result that was picked is the top row (not while a search is typed)
  renderHomeBusiest(); // the busiest airport today, as a row at the top (DECISIONS 400)
  list.scrollTop = 0;
}

// ------------------------------------------------------------ search
// Focusing the field moves it to the top of the screen and fills the space above the keys with results.
// 2.8 (DECISIONS 330): the field is readonly with inputmode none, so the phone's keyboard never opens. The game's own keys
// (searchkb.js) type into it. Before typing, two shortcuts fill the list: Near you (the phone's time zone, no location) and Popular
// (the busiest airports). Results and shortcuts are chips. The keys tuck away once results show, or the list is scrolled (keysAfter);
// a tap on the box brings them back.
let searchTimer = 0, keyboard = 0, fullHeight = window.innerHeight;
const searchBox = document.querySelector('.search');
let keysOpen = false; // the game's keys are up (searchkeys.js keysAfter)
let keysTaps = 0; // taps on the box so far
let keyTaps = 0; // keysTaps when the last key changed the query: a tap after that key is the latest say, so its results keep the keys up
buildKeys($('search-kb'), (key) => pressKey(key));
function setSearching(on) {
  $('menu').classList.toggle('searching', on);
  if (!on) setKeys(false);
}
/** The game's keys up or tucked away: the CSS shows them and gives the results the room above (menu.keys-open sets --kb). */
function setKeys(open) {
  keysOpen = open;
  $('menu').classList.toggle('keys-open', open);
}
function keysEvent(ev) {
  const next = keysAfter({ open: keysOpen }, ev).open;
  if (next !== keysOpen) setKeys(next);
}
/** A tap on the box: the keys come up (counted, see keysTaps). */
function keysTap() {
  keysTaps++;
  keysEvent({ type: 'tap' });
}
/** A key of the game's keys (searchkb.js): a character, space, delete, or close (tucks the keys away; with nothing typed it leaves the search). */
function pressKey(key) {
  if (key === 'close') {
    if (!$('search').value.trim()) return clearSearch();
    return keysEvent({ type: 'close' });
  }
  const input = $('search');
  const next = typeKey(input.value, key);
  if (next === input.value) return;
  input.value = next;
  keyTaps = keysTaps;
  press();
  keysEvent({ type: 'key' });
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 60);
}
/** A search result or a shortcut as a big chip: its code, name and city. Its tap picks the airport (tapRow). */
function chipRow(info) {
  const b = airportRow(info, { search: true });
  b.classList.add('ap-chip');
  b.setAttribute('aria-label', [info.iata || info.icao, info.name, db.cityName(info.city), info.country].filter(Boolean).join(', '));
  // the chip keeps the field's focus: the tap is not a blur, so the list does not change under it
  b.addEventListener('pointerdown', (e) => e.preventDefault());
  b.addEventListener('mousedown', (e) => e.preventDefault());
  return b;
}
/**
 * The search before anything is typed (2.8): the two shortcuts as one row of buttons, with the keys up (nothing to see yet, so the
 * room is kept for them). A shortcut's airports then show as chips and the keys tuck away (group 'near' or 'popular'). Near you is
 * left out where the phone's zone names no place (UTC).
 */
async function showShortcuts(group = '') {
  const token = ++homeToken;
  const taps = keysTaps;
  const ph = phoneZone();
  const list = $('airport-list');
  if (!group) {
    list.innerHTML = '';
    list.appendChild(shortcutRow(!placeless(ph.zone)));
    markPicked();
    list.scrollTop = 0;
    keysEvent({ type: 'results', query: '', count: 0 });
    return;
  }
  await db.loadAirports();
  const popular = [];
  for (const [code] of db.BUSIEST.slice(0, 8)) {
    const a = await db.getAirport(code);
    if (a) popular.push(a);
  }
  if (token !== homeToken) return;
  let shown = popular;
  if (group === 'near') {
    const popularCodes = new Set(popular.map((a) => a.icao));
    shown = nearYou(db.largeFields(), ph.zone, ph.offsetHours, 12, haversine).filter((a) => !popularCodes.has(a.icao)).slice(0, 4);
  }
  list.innerHTML = '';
  list.appendChild(group === 'near' ? listHead('Near you', 'from your time zone') : listHead('Popular', 'the busiest airports'));
  for (const a of shown) list.appendChild(chipRow(a));
  markPicked();
  list.scrollTop = 0;
  if (taps === keysTaps) keysEvent({ type: 'shortlist', count: shown.length }); // the airports show: the keys tuck away
}
/** The two shortcut buttons: Near you (only where the zone names a place) and Popular. A press keeps the field's focus. */
function shortcutRow(nearOk) {
  const row = document.createElement('div');
  row.className = 'shortcut-row';
  const make = (group, title, sub, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'shortcut';
    b.dataset.group = group;
    b.setAttribute('aria-label', label);
    const t = document.createElement('span');
    t.textContent = title;
    const s = document.createElement('small');
    s.textContent = sub;
    b.append(t, s);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => showShortcuts(group));
    return b;
  };
  if (nearOk) row.appendChild(make('near', 'Near you', 'your time zone', 'Near you: the airports in your time zone'));
  row.appendChild(make('popular', 'Popular', 'the busiest airports', 'Popular: the busiest airports in the world'));
  return row;
}
async function runSearch() {
  const q = $('search').value.trim();
  searchBox.classList.toggle('has-text', !!q);
  if (!q) {
    keysEvent({ type: 'results', query: '', count: 0 }); // nothing typed: the keys come back
    if ($('menu').classList.contains('searching')) return showShortcuts();
    return showFeatured();
  }
  const token = ++homeToken;
  const res = await db.search(q, 30);
  if (token !== homeToken) return;
  const list = $('airport-list');
  list.innerHTML = '';
  if (!res.length) {
    const e = document.createElement('div');
    e.className = 'ap-empty';
    e.textContent = `No airport matches “${q}”. Try a city, a name or a code like LAX.`;
    list.appendChild(e);
  }
  for (const info of res) list.appendChild(chipRow(info));
  markPicked();
  list.scrollTop = 0;
  if (keyTaps === keysTaps) keysEvent({ type: 'results', query: q, count: res.length }); // results show: the keys tuck away
}
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 90);
});
$('search').addEventListener('focus', () => {
  setSearching(true);
  keysTap();
  if (!$('search').value.trim()) showShortcuts();
});
// a tap on the box brings the keys back (the field keeps its focus, so only the click is new): with nothing typed, the two shortcuts
// are the list again; with a query, the keys come up over its results
searchBox.addEventListener('click', () => {
  if (!$('menu').classList.contains('searching')) return;
  if ($('search').value.trim()) keysTap();
  else showShortcuts();
});
$('search').addEventListener('blur', () => {
  // keep results up while there is a query; otherwise step back to the home layout
  setTimeout(() => {
    if (document.activeElement === $('search') || $('search').value.trim()) return;
    setSearching(false);
    showFeatured();
  }, 120);
});
// a hardware keyboard types the same keys; Enter closes the field as it always has
$('search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') return WEB_DEMO ? demoEnter() : $('search').blur(); // the demo's Enter plays the top result (DECISIONS 446)
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Backspace') { e.preventDefault(); return pressKey('back'); }
  if (e.key === ' ') { e.preventDefault(); return pressKey('space'); }
  if (e.key === 'Escape') { e.preventDefault(); return pressKey('close'); }
  if (e.key.length === 1 && /^[a-z0-9]$/i.test(e.key)) { e.preventDefault(); pressKey(e.key.toUpperCase()); }
});
// scrolling the results tucks the keys away (a list that was not scrolled, or is reset to the top, does not)
$('airport-list').addEventListener('scroll', () => {
  if (keysOpen && $('airport-list').scrollTop > 0) keysEvent({ type: 'scroll' });
}, { passive: true });
$('search-clear').addEventListener('pointerdown', (e) => e.preventDefault()); // keep the field's focus
$('search-clear').addEventListener('click', () => {
  $('search').value = '';
  runSearch();
  $('search').focus();
});
function clearSearch() {
  $('search').value = '';
  searchBox.classList.remove('has-text');
  $('search').blur();
  setSearching(false);
  showFeatured();
}
/** Height of the on-screen keyboard in CSS px (from MainActivity's window insets). */
window.HP_setKeyboard = (px) => {
  keyboard = px;
  applyKeyboard();
};
function applyKeyboard() {
  if (!keyboard) fullHeight = window.innerHeight; // re-baseline whenever the keyboard is down
  // if the WebView itself was resized for the keyboard, only cover what's left
  const kb = Math.max(0, keyboard - (fullHeight - window.innerHeight));
  document.documentElement.style.setProperty('--kb', `${kb}px`);
  // a short phone with the keyboard up has room for barely two results: slim the field and the rows (style.css)
  $('menu').classList.toggle('kb-tight', kb > 0 && window.innerHeight - kb < 200);
  if (!keyboard && document.activeElement === $('search') && !$('search').value.trim()) $('search').blur();
}
window.addEventListener('resize', applyKeyboard);

// ------------------------------------------------------------ radio
// the demo plays one of the recorded airports (fixtures: real OpenSky traffic and METAR; modes.js DEMO_AIRPORTS)
const radio = new Radio({ el: $('radio'), audio, speech });
window.HP_speechDone = (id) => radio.onSpoken(id);
/** What the tower calls itself: the city, or the airport's first word ("Heathrow", "Dallas"). */
// how the controllers at well-known fields actually name themselves
const FACILITY = {
  EGLL: 'Heathrow', EGKK: 'Gatwick', EGSS: 'Stansted', KORD: "O'Hare", KMDW: 'Midway', KJFK: 'Kennedy', KLGA: 'LaGuardia',
  KEWR: 'Newark', KDFW: 'DFW', KDAL: 'Love', KIAH: 'Houston', KHOU: 'Hobby', LFPG: 'De Gaulle', LFPO: 'Orly',
  RJTT: 'Tokyo', RJAA: 'Narita', EHAM: 'Schiphol', RKSI: 'Incheon', ZBAA: 'Beijing', ZSPD: 'Pudong', ZSSS: 'Hongqiao',
  ZGGG: 'Baiyun', ZGSZ: 'Shenzhen', VIDP: 'Delhi', LTFM: 'Istanbul', KLAX: 'Los Angeles', KSFO: 'San Francisco',
  CYYZ: 'Toronto', YSSY: 'Sydney', EDDF: 'Frankfurt', EDDM: 'Munich', LEMD: 'Madrid', WSSS: 'Singapore', WMKK: 'Lumpur',
};
function radioFacility(info) {
  if (FACILITY[info.icao]) return FACILITY[info.icao];
  const city = (info.city || '').split(/[(,/-]/)[0].trim();
  const name = (info.name || '').replace(/International|Airport|Regional|Municipal/g, '').trim().split(/\s+/)[0];
  return city && city.length <= 14 ? city : name || info.iata || info.icao;
}
/**
 * The runways the ATIS names: the long ones (1200 m, where jets land), or all of them when none is that long (Lukla's one
 * 527 m strip, light planes only). Runways that take one way only come back apart, with their take-off end.
 */
function atisRunways(runways) {
  const long = runways.filter((z) => z.lengthM >= 1200);
  const use = long.length ? long : runways;
  return {
    landing: [...new Set(use.filter((z) => !z.oneWay).map((z) => z.activeIdent))],
    oneWay: use.filter((z) => z.oneWay).map((z) => ({ land: z.activeIdent, takeoff: takeoffIdent(z) })),
  };
}
/** The banner's words for a runway that takes one way only (its landing end and take-off end), or ''. */
function oneWayBanner(zones) {
  const z = zones.find((o) => o.kind === 'runway' && o.oneWay);
  return z ? `Landings on ${z.activeIdent} only · take-offs from ${takeoffIdent(z)}` : '';
}
function windWords() {
  const w = game.weather;
  if (!w || w.windKt < 3) return 'calm';
  const gust = w.gustKt > w.windKt + 4 ? ` gusting ${Math.round(w.gustKt)}` : '';
  return `${String(Math.round(w.windDir / 10) * 10 || 360).padStart(3, '0')} at ${Math.round(w.windKt)}${gust}`;
}
function radioCheckIns(sim) {
  for (const a of sim.aircraft) {
    if (a.radioIn || !a.entered || a.state !== 'fly' || a.ground || a.departure) continue;
    a.radioIn = true;
    if (a.age < 6) radio.checkIn(a, sim.time);
  }
}

// World stats (3.1; worldstats.js, DECISIONS 384): the note a finished game sends, once. A game that ends sends it (gameOver); a game
// left from the pause card's Quit sends it when it has a landing. The save keeps the day and the week the phone last reported.
function noteWorldGame(reason) {
  if (WEB_DEMO) return; // the demo has no World stats (no network, DECISIONS 446)
  const sim = game.sim;
  const ap = game.airport;
  if (!sim || !ap || !ap.info) return;
  const landed = sim.landed || 0;
  const send = shouldSendGameNote({
    reason, landed, on: save.settings.worldStats !== false, native: !!deviceHash(), live: boardsLive(),
    recorded: !!ap.demo || !!sim.demo, sent: !!game.worldNoted, icao: ap.info.icao,
  });
  if (!send) return;
  game.worldNoted = true;
  const now = Date.now();
  // a daily game that ends sends its daily number and score (DECISIONS 400); a game left from Quit sends the plain note
  const before = sanitizeWorldStats(save.worldStats);
  const body = gameNote({ landed, icao: ap.info.icao, version: VERSION, ws: before, now, daily: reason === 'over' ? ap.daily || 0 : 0, score: sim.score || 0 });
  sendGameNote(makeApi(), body).then((counted) => {
    if (!counted) return; // a cap, a refusal or no connection: the phone's flags stay, and the next game says what they are
    // the week's planes this phone landed (the goal's reward, DECISIONS 400) carry on within the same week
    save.worldStats = afterCounted(now, before, landed);
    writeSave(save);
  });
}
/** The pause card's Quit ("Home"): a game with a landing is noted first, then the home screen as it always was. */
function quitGame() {
  if (game.state === 'paused' || game.state === 'play') noteWorldGame('quit');
  showMenu();
}

function showMenu() {
  radio.clear();
  keepAwake(false);
  setRotationLock(false);
  if (game.state === 'play' || game.state === 'paused') saveFeedNow(); // left in the middle: the home screen reads it
  game.state = 'menu';
  game.showHud = false;
  game.fast = false;
  game.title = game.mix = game.banner = '';
  game.mixDot = null;
  show('pause', false);
  show('over', false);
  show('loading', false);
  stopFeedTimer();
  feedFrom = null;
  show('feed', false);
  show('menu');
  applySettings();
  showFeatured();
  renderStreakCorner(); // the streak's state is read again: a game just ended, or the day changed
  // a link waiting for the home screen picks its airport, and its backdrop is that airport (else the usual random one)
  if (linkWaiting) takeLink().then((took) => { if (!took && game.state === 'menu') startAttract(); });
  else if (!$('menu').classList.contains('quiet')) startAttract(); // held back for a reminder's tap: takeDaily starts it if needed
  pushReminder(); // the shell's copy follows the save as the player leaves a game (quit or the end card's Home)
  maybeOfferReminders(); // the one-time reminder card, over the home screen only (DECISIONS 392)
}

/**
 * Dress a world in its real surroundings (sea, lakes, mountains) and start the boats and tumbleweeds.
 * Called when the surroundings arrive, and again for every new world built from the same airport.
 */
function applySurroundings(world, sur, info) {
  if (!world) return;
  if (sur && world.surFrom !== sur) {
    world.surFrom = sur;
    world.sur = surroundingsInWorld(sur, world);
    world.waterMask = waterMask(world.sur, { x0: -80, y0: -80, x1: world.W + 80, y1: world.H + 80 }, 3);
    if (renderer.world === world) renderer.renderBackground(true);
  }
  const windTo = () => {
    const w = game.weather;
    if (!w) return [0.7, 0.3];
    const a = bearingToCanvas((w.windDir || 0) + 180);
    return [Math.cos(a), Math.sin(a)];
  };
  game.scenery = new Scenery({ mask: world.waterMask, theme: groundTheme(info).name, W: world.W, H: world.H, avoid: (x, y) => nearField(world, x, y, 30), wind: windTo });
}

/**
 * The home screen's backdrop: simulated arrivals landing on autopilot behind the menu. On Real planes only there are none (the
 * setting never shows a made-up aircraft), so its backdrop is a Real planes only director, which brings in nothing without a
 * usable feed, and the sky stays empty.
 */
function backdropDirector() {
  return new TrafficDirector({ ...backdropOptions(save.settings.realPlanesOnly), country: attractCountry, seed: 5, landable: landableClasses(attractWorld), pace: runwayPace(attractWorld.runways.length) });
}
/** Called on the home screen: the backdrop follows the switch chosen there. Real planes only clears the sky at once. */
function syncBackdrop() {
  if (!game.sim || !game.director || !attractWorld) return;
  const want = !!save.settings.realPlanesOnly;
  if (game.director.realOnly === want) return;
  game.director = backdropDirector();
  if (want) {
    game.sim.aircraft = [];
    game.sim.warnings = [];
  }
}
let attractWorld = null, attractCountry = 'US';
/** A random one of the world's busiest airports: the home backdrop when nothing is picked (a different one each launch). */
async function randomBusyInfo() {
  const pick = db.BUSIEST[Math.floor(Math.random() * db.BUSIEST.length)][0];
  return (await db.getAirport(pick)) || (await db.getAirport('KDFW'));
}
/** A world for the home backdrop: the airport's layout (its map, or its runways), its active ends, and its surroundings behind. */
async function buildAttractWorld(info) {
  const { layout: L } = await loadLayout(info, { demo: true });
  const shape = renderer.worldSize(); // the backdrop is the screen's own airspace (upright on a tablet held upright, DECISIONS 440)
  const world = buildWorld(L, shape.W, shape.H);
  const ends = chooseActiveEnds(world.zones, 180, 10);
  world.zones.forEach((z, i) => ends[i] != null && setActiveEnd(z, ends[i]));
  world.info = info;
  loadSurroundings(info, { demo: true, layout: L }).then((sur) => { world.surData = sur; if (game.state === 'menu' && attractWorld === world) applySurroundings(world, sur, info); }).catch(() => {});
  return world;
}
/** Puts a world behind the home screen and flies its sky for 20 s, so it is busy when it shows. Only on the menu. */
function runAttract(world) {
  attractWorld = world;
  attractCountry = world.info.country || 'US';
  applySurroundings(world, world.surData, world.info);
  renderer.setWorld(world);
  game.sim = new Sim({ world, seed: (Math.random() * 1e9) | 0, demo: true });
  game.weather = null;
  game.sky = null;
  game.hazards = null;
  game.ops = null;
  game.bullet = null;
  game.postDesat = null;
  game.g = null;
  game.lighting = null;
  game.night = 0;
  game.desat = 0;
  game.timeScale = 1;
  game.rewindAvailable = false;
  game.departures = null;
  game.onGroundTap = null;
  game.underlay = (ctx, t) => game.scenery && game.scenery.draw(ctx, t);
  game.overlayBelowAircraft = null;
  game.overlayAboveAircraft = null;
  game.hudExtra = null;
  game.director = backdropDirector();
  for (let i = 0; i < SIM_HZ * 20; i++) {
    game.sim.step(1 / SIM_HZ);
    if (i % 30 === 0) game.director.update(game.sim, [], 'offline');
  }
  game.sim.drainEvents();
  game.camera.zoom = 1;
  game.crashT = -1;
  game.hint = null;
  fx.reset();
  renderer.clearArrivalNotes();
  audio.intensity = 0;
}

async function startAttract() {
  stopGlide(); // a glide still building gives way to the home screen's own backdrop
  try {
    await pickRestored; // a fresh launch's pick is read first: the backdrop is the picked airport's world, as the glide makes it
    const want = picked ? picked.info : null;
    // the backdrop follows the pick, also the airport just played (2.4 item 3): the last world stays when it is that one already
    const world = attractWorld && attractWorld.H === renderer.H && (!want || attractWorld.info.icao === want.icao) ? attractWorld : await buildAttractWorld(want || (await randomBusyInfo()));
    if (game.state !== 'menu') return;
    runAttract(world);
  } catch (e) {
    console.warn('attract', e);
  }
}

let backdropToken = 0;
/**
 * The home backdrop glides to the airport picked on the list, or to a random busy airport when nothing is picked (info null). The
 * sky slides out to the left while the new airport's world is built, then the new sky slides in from the right. Reduced motion
 * swaps it at once. A newer change, a game or the home screen's own backdrop (stopGlide) takes the canvas over.
 */
async function glideBackdrop(info) {
  const token = ++backdropToken;
  const canvas = $('game');
  const still = reducedMotion();
  try {
    const next = info || (await randomBusyInfo());
    if (!still) canvas.classList.add('glide-out');
    const [world] = await Promise.all([buildAttractWorld(next).catch(() => null), still ? null : new Promise((r) => setTimeout(r, 200))]);
    if (token !== backdropToken) return;
    if (game.state !== 'menu' || !world) return stopGlide();
    runAttract(world);
    if (still) return;
    canvas.classList.remove('glide-out');
    canvas.classList.add('glide-from');
    void canvas.offsetWidth; // the slid-away frame is drawn before the sky glides back in
    canvas.classList.remove('glide-from');
    canvas.classList.add('glide-in');
    setTimeout(() => canvas.classList.remove('glide-in'), 400);
  } catch (e) {
    console.warn('backdrop', e);
    stopGlide();
  }
}
/** Drops a backdrop glide in progress: the canvas is shown as it is (a game takes it, or the home screen's own backdrop). */
function stopGlide() {
  backdropToken++;
  $('game').classList.remove('glide-out', 'glide-from', 'glide-in');
}

// ------------------------------------------------------------ airports

// The background area map (ui 8.2): a note in play while the map downloads, then 'ready' or 'unavailable' for a moment.
// It is hidden while any screen is open (style.css), so it never shows over the loading, pause or end card.
const areaMap = { state: '', timer: 0 };
const AREA_WORDS = {
  downloading: 'Loading area map…', ready: 'Area map ready', unavailable: 'Area map unavailable. Playing without it.',
  fullmap: 'Full map on its way. The next game here has it.', another: 'Map server busy. Trying another…',
  saved: 'Full map saved. The next game here uses it.', nomap: 'The full map is not in yet. Playing on the runways.',
  offline: 'No internet. Playing on the runways.',
};
// the words that stay up until the next word (the rest clear after a few seconds)
const AREA_HOLDS = new Set(['downloading', 'fullmap']);
/** A state from loadSurroundings. A load that was cancelled or replaced (its token is old) is ignored. */
function setAreaMap(state, token) {
  if (token !== loadToken) return;
  clearTimeout(areaMap.timer);
  areaMap.state = state;
  if (!AREA_HOLDS.has(state)) areaMap.timer = setTimeout(() => { areaMap.state = ''; syncAreaNote(); }, state === 'ready' || state === 'saved' ? 2500 : 4000);
  syncAreaNote();
}
/** The note as it is now: in play only, with its words and its spinner or tick. */
function syncAreaNote() {
  const el = $('area-note');
  el.dataset.state = areaMap.state;
  el.querySelector('.area-words').textContent = AREA_WORDS[areaMap.state] || '';
  el.classList.toggle('show', !!areaMap.state && game.state === 'play');
}

let loadToken = 0;
/**
 * The free-games rule for a game about to start (pro.js gameRule): true when it may start. When it may not, the upgrade sheet opens
 * and nothing else happens: the game was never asked to load, so nothing is counted. The daily challenge never needs a free game.
 */
function proAllowsNow(daily = false) {
  if (WEB_DEMO) return demoGate(); // the demo's free games are its own rule (demo.js, DECISIONS 454); a restart or Fly again passes it too
  const rule = gameRule({ pro: save.pro, today: proToday(), daily, isPro: isPro() });
  save.pro = rule.state;
  if (rule.allowed) return true;
  openProSheet('gate');
  return false;
}

async function startAirport(info, { demo = false, daily = 0, challenge = null, weekend = 0 } = {}) {
  // the browser demo: 3 free games a day in this browser (demo.js, DECISIONS 454). With none left the Play page opens and the toast says
  // why, and nothing loads; with no DecompressionStream no game starts
  if (WEB_DEMO) {
    if (demoUnsupported) return;
    if (!demoGate()) return;
  }
  // a phone that has not shown Pro yet waits (at most 1.5 s) for Google Play's first answer before the rule is read (propay.js)
  // the weekend event is free, as the daily is (weekend.js)
  if (!daily && !weekend) {
    if (!isPro()) await proSettled();
    if (!proAllowsNow()) return;
  }
  const token = ++loadToken;
  stopGlide(); // the game takes the canvas: a backdrop glide still building gives way
  if (markTourSeen(save)) writeSave(save); // a game started: the Tour's nudge is done (tour.js)
  $('search').blur();
  $('search').value = '';
  searchBox.classList.remove('has-text');
  setSearching(false);
  game.state = 'loading';
  areaMap.state = ''; // a new airport: the last one's map note goes
  clearTimeout(areaMap.timer);
  syncAreaNote();
  // real planes only: the home screen's backdrop aircraft are simulated, and must not show behind the loading card
  if (!daily && !weekend && save.settings.realPlanesOnly && game.sim) {
    game.sim.aircraft = [];
    game.sim.warnings = [];
  }
  $('loading-title').textContent = `${gameTitleWord({ daily, demo, challenge: !!challenge, weekend: weekend ? themeOf(weekend).title : null })}: ${info.iata || info.icao}`;
  $('loading-rank').textContent = loadingRankLine({ demo, daily, weekend: !!weekend, challenge: !!challenge, settings: save.settings });
  $('loading-status').textContent = 'Loading airport…';
  if (WEB_DEMO) { // the demo's loading card (demo.js)
    $('loading-title').textContent = `${DEMO_WORDS.loadingTitle}: ${info.iata || info.icao}`;
    $('loading-rank').textContent = DEMO_WORDS.loadingRank;
    $('loading-status').textContent = DEMO_WORDS.loadingStatus;
  }
  revealLoading(token);
  show('menu', false); // the card sits over the map alone (showMenu brings the menu back on Cancel or an error)
  try {
    layout();
    const status = (s) => token === loadToken && ($('loading-status').textContent = s);
    // a slow map download can be skipped: the game then draws the runways alone
    const skip = { skipped: false };
    skip.promise = new Promise((resolve) => (skip.resolve = resolve));
    loadSkip = skip;
    // Play now is up through the whole start (DECISIONS 372): it ends the wait for the map, the weather and the first flights at once
    const playNow = new Promise((resolve) => (playNowResolve = resolve));
    $('btn-skip-map').hidden = false;
    const polite = newPolite();
    // the other airports a real flight could be heading for instead (arrivals.js), and the field's height
    const nearby = db.nearbyFields(info);
    const elevM = (info.elev || 0) * 0.3048;
    let feed;
    // the daily challenge's traffic is all simulated, from the day's seed; so is a friend's challenge (challenge.js), a weekend
    // and the demo's (DECISIONS 446): one chain, so only the live game asks OpenSky
    if (WEB_DEMO || daily || challenge || weekend) feed = dailyFeed();
    else if (demo) feed = await demoFeed(info, LiveFeed, nearby);
    else {
      // OpenSky API client settings are hidden for now (index.html): always anonymous. To bring them back:
      // const client = new OpenSkyClient({ http, clientId: save.settings.osClientId, clientSecret: save.settings.osClientSecret });
      const client = new OpenSkyClient({ http });
      feed = new LiveFeed({ client, lat: info.lat, lon: info.lon, elevM, nearby });
      feed.update(Date.now()); // the first poll: its planes join the game when it answers, early or late
    }
    // the daily challenge flies the same generated weather for everyone, not today's METAR; a recording's is its fixture
    const askWeather = save.settings.realWeather && !daily && !challenge && !weekend;
    const weather = askWeather ? loadMetar(info, { demo }).catch(() => null) : Promise.resolve(null);
    const firstFlights = demo || daily || challenge || weekend ? Promise.resolve() : feed.firstResult(6000);
    // the card says what the start waits for: the daily and a challenge ask no weather
    status(demo ? RECORDED_STATUS : askWeather ? 'Checking the weather…' : 'Getting the planes ready…');
    if (WEB_DEMO) status(DEMO_WORDS.loadingStatus);
    // the map, the weather and the first live flights are asked together, and the start waits START_WAIT_MS at most for all of them
    // (airportdata.js). Each one is used if it is in time: a slow feed does not cost the weather. A late report is not put into the
    // game, since the replay needs the start's weather; the live feed keeps polling in play, so its planes arrive into the game.
    const layoutP = loadLayout(info, { demo, onStatus: status, skip, polite });
    const [{ layout: L, osmSource }, metar] = await Promise.all([layoutP, within(weather, playNow), within(firstFlights, playNow)]);
    if (token !== loadToken) return; // a cancelled start leaves the next start's Play on runways now alone
    playNowResolve = null;
    $('btn-skip-map').hidden = true;
    if (!L.runways.length) throw new Error('No runways found for this airport.');
    // a loading card that is up stays long enough to be read; a start that showed none goes on at once (revealLoading)
    if (!(await loadingRead(token))) return;
    // the rank line follows the map: a game with the runways alone is unranked until its full map is saved (ranking.js)
    $('loading-rank').textContent = loadingRankLine({ demo, daily, weekend: !!weekend, challenge: !!challenge, settings: save.settings, noMap: osmSource === 'none' });
    if (WEB_DEMO) $('loading-rank').textContent = DEMO_WORDS.loadingRank;
    // the layout's code (lo=) is worked out here, so the game's words are right from its first frame (about 15 ms for a big map)
    const layoutCode = await layoutCodeOf(L).catch(() => null);
    if (token !== loadToken) return;
    game.airport = { info, layout: L, metar, feed, demo, osmSource, daily, challenge, weekend, layoutCode };
    save.recent = [info.icao, ...(save.recent || []).filter((c) => c !== info.icao)].slice(0, 6);
    // the airport just played stays picked when the player comes home, and on a fresh launch (2.4 item 3); a daily keeps its row
    save.lastPlayed = savedPickOf({ info, daily: daily || 0, challenge, weekend: weekend || 0 });
    if (!demo && !(save.visited || []).includes(info.icao)) save.visited = [...(save.visited || []), info.icao];
    writeSave(save);
    picked = { info, daily: daily || 0, top: false, challenge, weekend: weekend || 0 };
    newGame();
    if (WEB_DEMO && osmSource === 'none') {
      toast(skip.skipped ? DEMO_WORDS.skipMap : DEMO_WORDS.mapFailed, 3200); // the runways alone: nothing else is fetched (DECISIONS 446)
    } else if (osmSource === 'none' && !demo) {
      // no map came at the start (no bundled, website or saved copy): the game is on the runways now, and the full map is fetched
      // after the start for the next game here (DECISIONS 372). With no network, nothing is asked.
      toast(polite.offline ? 'No internet. Playing on the runways alone' : 'Playing on the runways. The full map is on its way', 3200);
      fullMapInBackground(info, null, token);
    } else {
      // the surroundings follow in the background: the game never waits for them (a copy the phone has is used at once)
      loadSurroundings(info, { demo, polite }).then((sur) => {
        if (token !== loadToken || !game.airport || game.airport.info !== info) return;
        if (sur) {
          game.airport.sur = sur; // the next game here starts with them
          if (renderer.world === game.airport.world) applySurroundings(game.airport.world, sur, info);
        } else if (!demo && !WEB_DEMO) {
          fullMapInBackground(info, L, token); // the area around the map is not saved: fetched after the start
        }
      }).catch(() => {});
    }
  } catch (e) {
    console.warn(e);
    if (token !== loadToken) return;
    show('loading', false);
    toast(`Couldn't load ${info.iata || info.icao}: ${e.message || e}`, 3600);
    showMenu();
  }
}

/*
 * The loading card (DECISIONS 423): a start quicker than LOADING_DELAY_MS shows no card, and a card that shows stays up at least
 * LOADING_MIN_MS, so its words can be read. A quick start (a bundled map, the daily's planes) had flashed the card for a fraction of
 * a second: the owner's report, from a tap on the daily reminder. Play on runways now skips the wait. Back and Cancel work while
 * the card is not yet up (HP_onBack reads game.state).
 */
const LOADING_DELAY_MS = 400;
const LOADING_MIN_MS = 1100;
let loadingTimer = 0;
let loadingShownAt = 0; // when the card came up (0: not up)
let loadingRushed = false; // Play on runways now was pressed: the game starts at once
function revealLoading(token) {
  clearTimeout(loadingTimer);
  loadingShownAt = 0;
  loadingRushed = false;
  loadingTimer = setTimeout(() => {
    if (token !== loadToken || game.state !== 'loading') return;
    loadingShownAt = performance.now();
    show('loading');
  }, LOADING_DELAY_MS);
}
/** Waits until a card that is up has been up LOADING_MIN_MS. False when the start was cancelled (or replaced) meanwhile. */
async function loadingRead(token) {
  clearTimeout(loadingTimer); // a card not yet up never comes up: the game starts now
  const upFor = loadingShownAt ? performance.now() - loadingShownAt : Infinity;
  if (!loadingRushed && upFor < LOADING_MIN_MS) await new Promise((r) => setTimeout(r, LOADING_MIN_MS - upFor));
  return token === loadToken;
}

let loadSkip = null;
/** The value of p, or null once START_WAIT_MS has passed or Play now is pressed (whichever is first). p never rejects here. */
const within = (p, playNow) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), START_WAIT_MS);
  const done = (v) => { clearTimeout(timer); resolve(v); };
  p.then(done, () => done(null));
  playNow.then(() => done(null));
});
/**
 * The full map after the start (DECISIONS 372): queued behind any map job still running. Its words go to the area note while
 * this airport's game is on, and a surroundings copy it gets is put on the world if the game is still this one.
 */
function fullMapInBackground(info, layout, token) {
  queueFullMap(info, { layout, onState: (st) => setAreaMap(st, token) }).then((r) => {
    if (token !== loadToken || !game.airport || game.airport.info !== info) return;
    // a full map that came for a game on the runways is the next game's layout (newGame takes it). The game in play keeps its own:
    // its replay names that layout, so nothing changes under it.
    if (r && r.layout && game.airport.osmSource === 'none') game.airport.nextLayout = r.layout;
    if (r && r.sur) {
      game.airport.sur = r.sur; // the next game here starts with them
      if (renderer.world === game.airport.world) applySurroundings(game.airport.world, r.sur, info);
    }
  }).catch(() => {});
}
// set once the map is settled (or has failed): 'Play on runways now' then stops the weather and feed waits too
let playNowResolve = null;
$('btn-skip-map').addEventListener('click', () => {
  if (loadSkip) {
    loadSkip.skipped = true;
    loadSkip.resolve({ status: 0, headers: {}, text: 'skipped' });
  }
  if (playNowResolve) playNowResolve(null);
  loadingRushed = true; // the player asked to play now: the card does not hold the start
  $('loading-status').textContent = 'Laying out the runways…';
});
$('btn-cancel-load').addEventListener('click', () => {
  if (loadSkip) {
    loadSkip.skipped = true; // stop the map download as well
    loadSkip.resolve({ status: 0, headers: {}, text: 'cancelled' });
  }
  loadToken++;
  showMenu();
});

/** The sim-side game object's refs on game (midgame.js can build departures or change realOnly). Call after any midgame change. */
function syncRefs() {
  if (!game.g) return;
  game.departures = game.g.departures;
  game.realOnly = game.g.realOnly;
}

/** The live game's inputs for the replay (replay.js): each is recorded at the fixed step it happens at. */
function recInput(...args) {
  const r = game.g && game.g.rec;
  if (r) r.input(game.g.steps, ...args);
}

// the pointer handlers' sim calls, recorded (every call, in order: the replay makes the same calls at the same steps)
function pathBegin(a, x, y) {
  recInput('path', 'b', a.id, x, y);
  game.sim.beginPath(a, x, y);
}
function pathExtend(a, x, y) {
  recInput('path', 'e', a.id, x, y);
  return game.sim.extendPath(a, x, y);
}
/** A finger takes a plane's tail and carries its path on (2.6, sim.js carryPath, fingers.js tailMoveAction): recorded as 'c'. */
function pathCarry(a, x, y) {
  recInput('path', 'c', a.id, x, y);
  return game.sim.carryPath(a, x, y);
}
/**
 * The view a lift is made in, for a hold's touch target (sim.js fixHit): CSS px per world unit at the zoom now, and the UI scale.
 * Rounded, then recorded with the lift, so the replay makes the same call (replay.js).
 */
function liftScale() {
  return { k: Math.round((renderer.scale / renderer.dpr) * 1e4) / 1e4, ui: Math.round(hudScale() * 1e4) / 1e4 };
}
function pathEnd(a) {
  const s = liftScale();
  recInput('path', 'n', a.id, s.k, s.ui);
  game.sim.endPath(a, s);
}
/**
 * A tap toggles the plane's circle (sim.toggleHold). A release is remembered, so a tap that would circle it again soon after does nothing
 * (fingers.js). A refusal (an engine-out or low-fuel plane may not circle: the note says so) is no release, and is remembered as nothing.
 */
function holdToggle(a) {
  recInput('hold', a.id);
  if (!game.sim.toggleHold(a) && !eitherEnd(a)) releasedAt.set(a, performance.now());
}

/** The live feed as the director reads it this tick (simdriver.js liveFeedTick): called by stepWorld on a director tick. */
function liveFeedFor() {
  const ap = game.airport;
  if (!ap || !ap.feed || !game.g) return null;
  const nowMs = Date.now();
  const snap = ap.feed.snapshot(nowMs);
  // where each real flight is in this tick's report: a plane that comes in is looked up at this spot (routes.js leg rule)
  game.spots = game.spots || new Map();
  for (const f of snap) game.spots.set(f.icao24, { lat: f.lat, lon: f.lon, track: f.track });
  const view = feedState(ap.feed, { nowMs, demo: !!ap.demo, daily: !!(ap.daily || ap.weekend) });
  return liveFeedTick(view.state, snap, { wantCallsigns: view.state === 'working' && !game.g.notedLive });
}

function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The end card of the game just over: its rank line is filled again when the server has taken its score. */
let overCard = null;

/** A score the server took: the end card's rank line, if that game's card is still up. */
function notePosted(entry, json) {
  refreshBoardsCache();
  if (overCard && overCard.entry === entry && game.state === 'over') {
    $('over-rank').textContent = rankLine(overCard.ranking, { code: overCard.code, live: boardsLive(), posted: { state: 'ranked', rank: json.rank, total: json.total } });
    $('over-rank').hidden = false;
  }
}

/** A score the server takes only from a newer build (426): the end card says so, and the boards' note too. */
function noteUpdate(entry) {
  if (overCard && overCard.entry === entry && game.state === 'over') {
    $('over-rank').textContent = rankLine(overCard.ranking, { code: overCard.code, live: boardsLive(), posted: { state: 'update' } });
    $('over-rank').hidden = false;
  }
}

/** A score the server holds for a spending cap (requirement 31): the end card says it will post later. */
function noteHeld(entry) {
  if (overCard && overCard.entry === entry && game.state === 'over') {
    $('over-rank').textContent = rankLine(overCard.ranking, { code: overCard.code, live: boardsLive(), posted: { state: 'later' } });
    $('over-rank').hidden = false;
  }
}

/** The kv store (IndexedDB) the layouts and the queued replays are kept in (outbox.js). */
const kvStore = { get: cacheGet, set: cacheSet, keys: cacheKeys, del: cacheDel };
let retryTimer = 0;

/** A rate-limited game waits for its window (outbox.js): the queue is looked at again then, once. */
function scheduleFlush(at) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(flushOutbox, Math.max(0, at - Date.now()) + 20);
}

/** Posts what is queued (outbox.js): on boot, on resume, when the connection comes back, and after each ranked game. */
function flushOutbox() {
  if (WEB_DEMO) return; // the demo queues no replays (DECISIONS 446)
  postQueued(save, { store: kvStore, onPosted: notePosted, onUpdate: noteUpdate, onHeld: noteHeld, onRetry: scheduleFlush }).catch(() => {});
}

/** A ranked game whose replay could not be queued: the end card says why (rankLine: too long, or not saved). */
function noteNotQueued(card, state) {
  if (overCard === card && game.state === 'over') {
    $('over-rank').textContent = rankLine(card.ranking, { code: card.code, live: boardsLive(), posted: { state } });
    $('over-rank').hidden = false;
  }
}

/**
 * A ranked game's replay goes to the outbox for the server: the layout named by its hash (its text kept on this phone for the
 * post), the replay gzipped and base64'd and kept in the kv store (outbox.js queueGame). A replay over the server's cap is not
 * queued, and the end card says so: the player is told, and the game still counts on the phone. The end card says it is saved,
 * and is updated when the server takes it (notePosted).
 */
async function queueReplay(replay, layout, card) {
  const owner = save;
  try {
    const text = canonicalLayout(layout);
    replay.layout = await hashText(text);
    await stashLayout(kvStore, replay.layout, text);
    const bytes = await packReplay(replay);
    if (bytes.length > REPLAY_MAX_PACKED) return noteNotQueued(card, 'long');
    const entry = await queueGame(owner, kvStore, { board: replay.board, icao: replay.icao, level: replay.level, daily: replay.daily, version: replay.app, layout: replay.layout }, bytesToBase64(bytes), Date.now());
    if (owner !== save) return; // a Reset ran meanwhile: this game went with the progress it cleared
    if (!entry) return noteNotQueued(card, 'unsaved');
    writeSave(save);
    card.entry = entry;
    if (overCard === card && game.state === 'over') {
      $('over-rank').textContent = rankLine(card.ranking, { code: card.code, live: boardsLive(), posted: { state: 'queued' } });
      $('over-rank').hidden = false;
    }
    flushOutbox();
  } catch (_) { /* no CompressionStream or crypto here: the game still counts on the phone */ }
}

function newGame() {
  // a weekend event starts only in its own weekend: a Restart or a Fly again after Monday 00:00 starts nothing (playNow's rule). The pick
  // is cleared and the home screen shows, as Quit does (showMenu closes the pause and end cards)
  if (game.airport && game.airport.weekend && weekendOf(db.localDay(new Date())) !== game.airport.weekend) {
    picked = null;
    savePick();
    return showMenu();
  }
  // a game that starts counts toward the day's free games (pro.js countGame); the daily challenge never counts
  if (game.airport && !game.airport.daily && !game.airport.weekend) {
    save.pro = countGame(advancePro(save.pro, proToday()));
    writeSave(save);
  }
  const ap = game.airport;
  // a full map saved since the last game here is this game's layout (DECISIONS 372): Fly again and Restart take it too
  if (ap.nextLayout) {
    ap.layout = ap.nextLayout;
    ap.osmSource = 'cache';
    ap.nextLayout = null;
    // its code is worked out at once, for this game's words and any challenge it sends (the same as startAirport's)
    const next = ap.layout;
    ap.layoutCode = null;
    layoutCodeOf(next).then((c) => { if (ap.layout === next) ap.layoutCode = c; }).catch(() => {});
  }
  game.video = null; // the last game's video replay is not this game's (gameOver sets it)
  game.arrivals = new Map(); // and its arrival notes (the video shows the ones this game makes)
  $('btn-share-video').hidden = true;
  layout();
  // the world and the HUD come from the screen the game is played on, as the challenger's were (DECISIONS 435): a friend's challenge
  // takes the screen its link carries, so its planes, its walls and its HUD are the challenger's whatever this phone's screen is
  const ch = ap.challenge || null;
  const screen = ch && ch.screen ? ch.screen : { cssW: renderer.cssW, cssH: renderer.cssH };
  const shape = worldShape(screen.cssW, screen.cssH);
  const world = buildWorld(ap.layout, shape.W, shape.H);
  ap.world = world;
  // the daily challenge: Normal, all simulated, and a seed everyone shares today (modes.js: the switch does nothing there)
  // a friend's challenge plays its own rules (challenge.js): its level, its traffic's rules and its departures; nothing else of the settings
  const cfg = ch ? challengeConfig(ch) : gameConfig({ daily: !!ap.daily || !!ap.weekend, settings: save.settings, nowMs: Date.now() });
  const diff = cfg.diff;
  game.realOnly = cfg.realOnly;
  // the run of Keep answers (skysky.js): a real-only level game that ended without a Keep breaks it
  if (game.slowRun && game.slowRun.realOnly && !game.slowRun.kept) save.slowSky = breakRun(save.slowSky);
  game.slowRun = { realOnly: cfg.realOnly && !ap.daily && !ap.demo, kept: false };
  const seed = ch ? ch.seed : ap.daily ? (Math.imul(ap.daily + 7919, 2654435761) >>> 1) : ap.weekend ? weekendSeed(ap.weekend) : (Math.random() * 1e9) | 0;
  // a friend's challenge flies the weather its link carries (challenge.js challengeWxSeed): never the METAR, nor the friend's own switch
  let wxSeed = ch ? challengeWxSeed(ch) : ap.weekend ? weekendWx(ap.weekend) : save.settings.realWeather ? weatherFromMetar(ap.metar) : null;
  // Beginner keeps the real wind (it picks the runways) but not the real storms or fog
  if (diff === 'beginner' && wxSeed) wxSeed = { ...wxSeed, storms: 0, fog: false };
  // the start weather this game flew, as its challenge link carries it (DECISIONS 413 f); a game sent as a challenge says so
  game.weatherStart = weatherOfSeed(wxSeed);
  // the sim, director, weather, hazards, ops and departures are built by simdriver.js, the same as the replay runner builds
  // them. A first game eases in (firstGame); the holding fixes stay hidden until their tip (fixesHidden). The HUD sits where
  // it does on this screen (laid out above): the gates, holds and arrival warnings keep out from under it.
  const hud = hudRectsFor(shape.W, shape.H, screen.cssW, screen.cssH);
  // the weekend event's setup is pinned (weekend.js weekendSetup): the server re-runs it as it is, so nothing here is the player's
  const setup = ap.weekend ? { ...weekendSetup(ap.weekend), country: ap.info.country } : {
    firstGame: !save.played && !ch, fixesHidden: !save.tipStacks && !save.played, wxSeed, country: ap.info.country, diff,
    realOnly: cfg.realOnly, departures: ch ? cfg.departures : !!save.settings.departures,
  };
  // the replay of a ranked game is recorded as it is played (replay.js); the offline demo is never ranked, so it is not
  const rec = ap.demo || WEB_DEMO ? null : new Recorder({
    seed, icao: ap.info.icao, tz: airportZone(ap.info), board: ap.daily ? 'daily' : ap.weekend ? 'weekend' : 'level', daily: ap.daily || null, weekend: ap.weekend || null, levels: [diff], reasons: [],
    app: VERSION, W: world.W, H: world.H, hud, setup, airport: { icao: ap.info.icao, info: ap.info },
  });
  // the weekend's sim is built with departures on and no real-planes switch, as the daily's rules say (ranking.js ignores both there)
  const g = makeGame(world, {
    seed, daily: ch ? ch.rules === 'd' : !!ap.daily, setup, hud,
    settings: ch ? { ...save.settings, departures: cfg.departures, realPlanesOnly: false } : ap.weekend ? { ...save.settings, departures: true, realPlanesOnly: false } : save.settings,
    rec, rewindOn: !!save.settings.bullet,
  });
  game.g = g;
  g.feed = (step) => (game.state === 'play' ? liveFeedFor() : null);
  // how the game is ranked (ranking.js): the level board or the daily board, or unranked and why. The daily is always departures.
  game.ranking = g.ranking = startRanking({
    demo: !!ap.demo, daily: !!ap.daily, weekend: !!ap.weekend, challenge: !!ch, diff, departures: ap.daily || ap.weekend ? true : ch ? cfg.departures : !!save.settings.departures,
    realPlanesOnly: ch ? false : !!save.settings.realPlanesOnly, simOverride: cfg.simOverride, noMap: !ap.demo && ap.osmSource === 'none',
  });
  if (WEB_DEMO) game.ranking = g.ranking = startRanking({ demo: true }); // the demo's game is unranked, with its own reason (demo.js)
  const { sim, director, weather, hazards, ops } = g;
  game.ach = new AchievementTracker(save.ach || (save.ach = {}));
  game.sawConflict = false;
  game.achThisGame = [];
  game.streakNote = null; // the play streak's day, counted at this game's first landing (countStreakDay)
  game.worldNoted = false; // this game's World stats note: sent once (noteWorldGame)
  game.mixDot = null;
  game.ops = ops;
  game.hazards = hazards;
  syncRefs();
  // a tap on the ground traffic: recorded whatever it does (the replay makes the same call)
  game.onGroundTap = (x, y, reach) => {
    recInput('dep-tap', x, y, reach);
    return !!(game.departures && game.departures.tap(x, y, reach));
  };
  // the real sky: cloud shadows from the METAR's cover, and its rain, drizzle or snow
  const sky = new Sky({ weather, W: world.W, H: world.H, seed, cloud: wxSeed ? wxSeed.cloud : null, precip: wxSeed ? wxSeed.precip : null, intensity: wxSeed ? wxSeed.precipIntensity : 1 });
  game.sky = sky;
  game.timeline = [];
  game.underlay = (ctx, t) => {
    if (game.scenery) game.scenery.draw(ctx, t);
    weather.drawWindsock(ctx, t);
    if (game.departures) game.departures.draw(ctx, t);
    if (game.ops) game.ops.draw(ctx, t);
    sky.drawShadows(ctx);
  };
  let thunderHeard = 0;
  game.overlayBelowAircraft = (ctx) => {
    weather.drawStorms(ctx);
    if (weather.lastFlash && weather.lastFlash.at !== thunderHeard && game.state === 'play') {
      thunderHeard = weather.lastFlash.at;
      audio.play('thunder', weather.lastFlash.dist);
      if (weather.lastFlash.dist < 0.3) haptic('tick');
    }
    hazards.drawWakes(ctx);
    hazards.drawCrews(ctx, performance.now() / 1000);
  };
  const bullet = new Bullet({
    sim,
    ghost: new GhostRunner(sim, { busyRunwayLoses: sim.rules.busyRunwayLoses, hazards }),
    rewind: g.rewind,
    enabled: save.settings.bullet,
    onHeartbeat: () => {
      haptic('heartbeat');
      audio.play('heartbeat');
    },
  });
  game.bullet = bullet;
  game.weather = weather;
  radio.facility = radioFacility(ap.info);
  radio.accent = towerAccent(ap.info.country);
  radio.enabled = save.settings.radio !== false;
  radio.clear();
  const atis = atisRunways(world.runways);
  radio.atis(ap.metar, windWords(), atis.landing, Math.floor(Date.now() / 3600e3), atis.oneWay);
  game.lighting = new Lighting({ world, mode: save.settings.lighting });
  game.night = game.lighting.n;
  game.overlayAboveAircraft = (ctx, t) => {
    weather.drawStormWarnings(ctx, t);
    hazards.drawEmergencies(ctx, t);
    sky.drawPrecip(ctx);
    weather.drawFog(ctx, t);
  };
  game.postDesat = (ctx, t) => bullet.drawLines(ctx, t);
  game.hudExtra = (ctx, r, u) => weather.drawHud(ctx, r, u);
  applySurroundings(world, ap.sur, ap.info); // tumbleweeds even before (or without) the surroundings
  renderer.setWorld(world);
  // what a challenge link says about this game (challengeFromGame, at the end): the screen its world was made from, and whether a
  // friend can repeat it (its first game eases in; a HUD that moves in play is not the link's)
  Object.assign(game, {
    screen, firstGame: setup.firstGame, hudMoved: false,
    sim, director, weather, seed, state: 'play', showHud: true, fast: false, displayScore: 0, scorePop: 0, crashT: -1,
    vignette: 0, acc: 0, hint: null, tutorial: !save.tutorialDone, liveTimer: 0, rewindAvailable: false,
    slowSky: newSlowSky(), // Things too slow? for this game: asked at most once (skysky.js)
  });
  // a phone turned upright while the card was up starts paused under the turn card: layout ran while the state was still 'loading'
  if (WEB_DEMO) demoTurnPause();
  // the orientation stays as it is from the start of a game until the home screen (DECISIONS 442)
  setRotationLock(true);
  slowFromPlay = false;
  show('slow', false);
  game.camera.zoom = 1;
  game.best = save.best[ap.info.icao] || 0;
  director.spawnedLive.clear();
  fx.reset();
  renderer.clearArrivalNotes();
  pointers.clear();
  tapInfo.clear();
  renderer.tailHeld.clear();
  releasedAt.clear();
  gesture = null;
  stopFeedTimer(); // a pause card's clock from the last game (restart from the pause card) is over
  show('menu', false);
  show('pause', false);
  show('over', false);
  show('loading', false);
  audio.intensity = 1;
  audio.startTrack(save.settings.musicTrack);
  keepAwake(true);
  if (WEB_DEMO) demoCount(); // the day's free games (DECISIONS 454): this game counts once its map has loaded
  updateTitle();
}

function updateTitle() {
  const ap = game.airport;
  if (!ap) return;
  const live = gameTitleWord({ daily: ap.daily, demo: ap.demo, challenge: !!ap.challenge, weekend: ap.weekend ? themeOf(ap.weekend).title : null });
  game.title = `${live}: ${ap.info.iata || ap.info.icao} · ${localTime(ap.info)}`;
  if (WEB_DEMO) game.title = `${DEMO_WORDS.loadingTitle}: ${ap.info.iata || ap.info.icao} · ${localTime(ap.info)}`; // the demo's title (demo.js)
}

// the Live feed card is open from play (the game is paused under it, with no pause card) or from the pause card
let feedFrom = null; // 'play' | 'pause' while the card is open, else null
let feedTimer = 0; // the card's and the pause card's one-second clock (see feedTick)

/**
 * Pauses the game. silent: no pause card (the Live feed card opens from play instead, and closes back into play).
 */
function pauseGame({ silent = false, note = '' } = {}) {
  if (game.state !== 'play' || game.crashT >= 0) return;
  game.state = 'paused';
  speech.stop();
  $('radio').classList.add('hold');
  releaseAllPointers();
  keepAwake(false);
  startFeedTimer();
  if (silent) return;
  // conditions at the field, in plain words (metar.js plainWeather; the feed's line and the starved sky are on the card under it)
  const ap = game.airport, wx = $('pause-wx');
  wx.textContent = '';
  if (note) {
    const d = document.createElement('div');
    d.className = 'pause-note';
    d.textContent = note;
    wx.appendChild(d);
  }
  if (ap) {
    const sky = fixedPlanes(ap) ? null : plainWeather(ap.metar);
    const lines = WEB_DEMO ? [DEMO_WORDS.weather] : ap.challenge ? [`${challengeSamePlanes(ap.challenge, ap.layoutCode) ? 'The same planes as' : 'Similar planes to'} ${challengeWho(ap.challenge.name)}.`]
      : ap.daily ? ['The same planes for everyone today.'] : ap.weekend ? [themeOf(ap.weekend).pause] : [sky || 'No weather report: generated weather'];
    for (const l of lines) {
      const d = document.createElement('div');
      d.textContent = l;
      wx.appendChild(d);
    }
  }
  show('pause');
  refreshPausePanel();
  refreshPauseFeed();
}

function resumeGame() {
  if (game.state !== 'paused') return;
  game.state = 'play';
  keepAwake(true);
  show('pause', false);
  $('radio').classList.remove('hold');
  stopFeedTimer();
}

// ------------------------------------------------------- the pause card (ui 4)

/** The level picker, the Departures switch and the ranking line, from the game's level and real planes and the saved setting. */
function refreshPausePanel() {
  if (!$('pause').classList.contains('show')) return;
  const ap = game.airport;
  if (!ap || !game.director) return;
  const diff = game.director.diff;
  $('pause-level').hidden = !levelChoices({ difficulty: diff, daily: fixedPlanes(ap) });
  document.querySelectorAll('[data-pause-level]').forEach((b) => b.classList.toggle('on', b.dataset.pauseLevel === diff));
  const dep = departuresNote({ difficulty: diff, realOnly: !!game.realOnly, on: !!save.settings.departures });
  const sw = $('btn-pause-dep');
  sw.hidden = fixedPlanes(ap); // not in the daily challenge (O3) nor a friend's challenge (its departures are the challenge's)
  $('pause-dep-note').hidden = fixedPlanes(ap);
  sw.classList.toggle('locked', dep.greyed);
  sw.classList.toggle('on', !!save.settings.departures && !dep.greyed);
  sw.setAttribute('aria-checked', String(sw.classList.contains('on')));
  $('pause-dep-note').textContent = dep.text;
  $('pause-rank').hidden = !game.ranking;
  $('pause-rank').textContent = game.ranking ? rankWord(game.ranking) : '';
  if (WEB_DEMO) $('pause-rank').textContent = DEMO_WORDS.rank; // the demo's rank line (demo.js)
}

let pendingLevel = null;
/** A different level asks first: the game becomes unranked (requirement 7), or stays unranked when it is already (settingsnotes.js). */
function askLevel(key) {
  if (!game.director || key === game.director.diff) return;
  const c = levelConfirm(key, { unranked: !!game.ranking && !isRanked(game.ranking) });
  pendingLevel = key;
  $('confirm-title').textContent = c.title;
  $('confirm-body').textContent = c.body;
  show('confirm');
}
function closeConfirm() {
  pendingLevel = null;
  show('confirm', false);
}
/** Change level: midgame.js writes the saved level, notes the ranking and applies it from the next spawn. */
function setLevelFromPause(key) {
  if (!game.g) return;
  setLevelMidGame(game.g, save, key); // the sim-side game object: it holds the recorder, the settings and the director
  syncRefs();
  saveSettings();
  applySettings();
  refreshPauseFeed();
}
/** Departures: midgame.js writes the saved switch, notes the ranking and syncs the sim (both ways make the game unranked). */
function setDeparturesFromPause(on) {
  if (!game.g) return;
  setDeparturesMidGame(game.g, save, on);
  syncRefs();
  saveSettings();
  applySettings();
}
// ------------------------------------------------------- Real planes only: one switch (skysky.js)

// the switch's line flashes for a few seconds after it is changed in play (the pause card's note, the Live feed card's hint)
let rpoFlashUntil = 0, rpoFlashText = '';
let slowFromPlay = false; // the Things too slow? sheet paused a game in play; closing it resumes that game

/** The one switch in the pause card and the Live feed card: it always shows what is saved. Daily and demo have none. */
function refreshRpoSwitches() {
  const ap = game.airport;
  const on = !!save.settings.realPlanesOnly;
  const hidden = !ap || fixedPlanes(ap) || !!ap.demo;
  // the field's landable classes (director.landable, the game's own) name which real planes can land here, when not all of them can
  const landable = !hidden && game.director && game.director.landable ? [...game.director.landable] : null;
  const text = Date.now() < rpoFlashUntil ? rpoFlashText : realOnlyNote({ on, landable }).text;
  for (const [btn, note] of [['btn-pause-rpo', 'pause-rpo-note'], ['btn-feed-realonly', 'feed-realonly-hint']]) {
    $(btn).hidden = hidden;
    $(btn).classList.toggle('on', on);
    $(btn).setAttribute('aria-checked', String(on));
    $(note).hidden = hidden;
    $(note).textContent = text;
  }
}

/** A new switch value in play or in Settings: saved, the ranking notes it (on), the sim follows, and the words flash. */
function setRealPlanesOnly(on) {
  const ap = game.airport;
  if (!ap || fixedPlanes(ap) || !game.g) return true; // the daily is all simulated, whatever the setting says (nothing to save)
  const want = !!on;
  const wasOn = !!save.settings.realPlanesOnly;
  save.settings.realPlanesOnly = want;
  // turned off and on again: the Keep run and the sheet's quiet start afresh (skysky.js)
  if (want && !wasOn) save.slowSky = { ...KEEP_RUN_START };
  // a game switched on in play gains the reason, which is permanent (ranking.js). Switching off never changes the rank.
  // applyRealOnly is the sim's side (midgame.js, the replay records it); the reason is noted here, as the mid-game setter does without its clear of the retired override
  if (want && game.g.ranking) noteRanking(game.g.ranking, 'realOnly', null);
  if (want && game.slowRun) game.slowRun.realOnly = true;
  applyRealOnly(game.g, want);
  const kept = saveSettings();
  syncRefs();
  applySettings();
  if (want !== wasOn) {
    rpoFlashText = rpoFlash(want);
    rpoFlashUntil = Date.now() + RPO_FLASH_MS;
  }
  if (game.sim) {
    const f = feedNow();
    setFeedLines(f.view, f.c); // the title line and the banner say it at once
  }
  if (feedFrom) renderFeedCard();
  refreshPauseFeed();
  refreshRpoSwitches();
  return kept;
}

/** The switch from the pause card or the Live feed card. Turning it on in a game that is still ranked just happens: the game is
 *  unranked from then on, and the end card says so (requirements item 6: no sheet). */
bind('btn-pause-rpo', () => setRealPlanesOnly(!save.settings.realPlanesOnly));
bind('btn-feed-realonly', () => setRealPlanesOnly(!save.settings.realPlanesOnly));

/**
 * Things too slow? (skysky.js): the real sky has stayed short for this level. The game pauses under the sheet, silently (no
 * pause card): Keep, Add and Back all close it, and closing resumes the game it paused.
 */
function openSlowSky() {
  game.slowSky.asked = true; // once per game, even if the sheet is only closed
  pauseGame({ silent: true });
  if (game.state !== 'paused') return;
  slowFromPlay = true;
  show('slow');
}
function closeSlowSky() {
  if (!$('slow').classList.contains('show')) return;
  show('slow', false);
  if (slowFromPlay) {
    slowFromPlay = false;
    resumeGame();
  }
}
bind('btn-slow-add', () => {
  const kept = setRealPlanesOnly(false); // saved off, so the simulated planes come in at the level's pace now
  closeScreen('slow');
  // a switch that did not save says so (settingNotSaved), in place of the note about the planes
  if (kept) toast('Simulated planes are back in the sky. Real planes still land too.', 2600);
});
bind('btn-slow-keep', () => {
  // a Keep answer counts toward the run: the third real-only game in a row stops the sheet until the switch changes
  if (game.slowRun) game.slowRun.kept = true;
  save.slowSky = afterKeep(save.slowSky);
  saveSettings(); // the Keep is the switch staying on, so a failed save is said to the player
  closeScreen('slow');
});
/**
 * The sheet's check, four times a second in play (liveTick). The sky is sampled only while the feed works and the game is a
 * real-only level game; anything else starts the hold again (skysky.js).
 */
function checkSlowSky(view) {
  const ap = game.airport, sim = game.sim, d = game.director;
  if (!game.slowSky || !sim || !d || !ap) return;
  const realOnly = !!game.realOnly && !fixedPlanes(ap) && !ap.demo;
  if (!realOnly || view.state !== 'working') {
    resetSlowSky(game.slowSky);
    return;
  }
  noteSlowSky(game.slowSky, sim.time, sim.arrivalsInAir());
  if (slowSkyDue(game.slowSky, { t: sim.time, realOnly: true, levelGame: true, feedWorking: true, quiet: !!save.slowSky.quiet })) openSlowSky();
}

// ------------------------------------------------------- the Live feed card

/** The card's and the pause card's clock: one second. It polls the feed and redraws; it never moves the sim. */
function startFeedTimer() {
  if (!feedTimer) feedTimer = setInterval(feedTick, 1000);
}
function stopFeedTimer() {
  if (feedTimer) clearInterval(feedTimer);
  feedTimer = 0;
}
function feedTick() {
  const ap = game.airport;
  if (!ap || !ap.feed || !game.sim) return;
  ap.feed.update(Date.now()); // the feed keeps polling while the card or the pause card is up (never the director)
  if (feedFrom) renderFeedCard();
  refreshPauseFeed();
}

/** Whether the sky has been dead for the report (the director's starved flag, eight seconds in: support only, never shown). */
function starvedShown() {
  const d = game.director, sim = game.sim;
  return !!(game.realOnly && d && d.starved && d.starvedSince != null && sim && sim.time - d.starvedSince >= 8);
}

/** The feed's view and the traffic now: what the card, the pause card and the HUD all say. */
function feedNow() {
  const ap = game.airport;
  const nowMs = Date.now();
  const view = feedState(ap.feed, { nowMs, demo: webFeed(ap), daily: fixedPlanes(ap) });
  const c = game.sim ? trafficCounts(game.sim) : { confirmed: 0, area: 0, simulated: 0, real: 0 };
  const realOnly = !!game.realOnly && !fixedPlanes(ap);
  // the one time the hours show: nearly used up (feedstate.js almostUsedUp), on the live feed only
  const almost = !ap.demo && !fixedPlanes(ap) && almostUsedUp(ap.feed.remaining ?? null);
  return { nowMs, view, c, realOnly, almost };
}

/** The feed's planes by what the breakdown counts them as (area.js buckets; 'seen-once' is 'seenOnce' here). */
function countBuckets(snap) {
  const c = { confirmed: 0, seenOnce: 0, far: 0, passing: 0, nearby: 0, ground: 0, close: 0, other: 0 };
  for (const f of snap) {
    const k = f.bucket === 'seen-once' ? 'seenOnce' : f.bucket;
    if (k in c) c[k]++;
  }
  return c;
}

/** The airport most of the planes near the field are heading for, by its name (feedcard.js rows). */
function rivalName(snap) {
  const tally = new Map();
  for (const f of snap) {
    if (f.bucket !== 'nearby' || !f.rival) continue;
    const t = tally.get(f.rival.icao) || { n: 0, airport: f.rival };
    t.n++;
    tally.set(f.rival.icao, t);
  }
  let best = null;
  for (const t of tally.values()) if (!best || t.n > best.n) best = t;
  return best ? nameForRival(best.airport) : '';
}

/** The real planes in the game, for the card's "In your game right now" (aircraft in the air, and queued). */
function flyingReal(sim) {
  const out = [];
  for (const a of sim.aircraft) if (a.live && a.state === 'fly' && !a.departure) out.push({ label: a.label || a.callsign, confirmed: a.confirmed, upgraded: a.upgraded });
  for (const w of sim.warnings) if (w.live) out.push({ label: displayName(w.callsign || ''), confirmed: w.confirmed, upgraded: w.upgraded });
  return out;
}

/** The seconds since the last good update, and until the next poll (the card's status line and the report). */
function feedClock(feed, nowMs) {
  return {
    agoS: feed.lastOkMs ? Math.floor((nowMs - feed.lastOkMs) / 1000) : null,
    nextS: Number.isFinite(feed.nextPollMs) ? Math.max(0, Math.ceil((feed.nextPollMs - nowMs) / 1000)) : 0, // the daily feed never polls
  };
}

/** Opens the card: from play (the game pauses under it, silently) or from the pause card. */
function openFeed(from) {
  const ap = game.airport;
  if (!ap || !ap.feed || !game.sim) return;
  if (from === 'play') {
    if (game.state !== 'play') return;
    pauseGame({ silent: true });
  } else show('pause', false);
  feedFrom = from;
  setFeedDetails(false); // every open starts with Details closed (requirements item 5)
  startFeedTimer();
  renderFeedCard();
  $('feed').querySelector('.feed-card').scrollTop = 0; // every open starts at the top (a refresh keeps its scroll)
  show('feed');
  press();
}

/** Closes the card: back into play, or back to the pause card it opened from. */
function closeFeed() {
  const from = feedFrom;
  if (!from) return;
  feedFrom = null;
  show('feed', false);
  if (from === 'play') resumeGame();
  else if (game.state === 'paused') show('pause');
}

/**
 * Details on the card: the groups of planes, the last update and the report. Closed by default (requirements item 5). The card's
 * body scrolls and its footer (Done, and Copy feed report while Details are open) stays on screen (style.css .feed-body).
 */
function setFeedDetails(on) {
  $('feed-details').hidden = !on;
  $('btn-feed-copy').hidden = !on;
  $('btn-feed-details').setAttribute('aria-expanded', String(on));
  $('btn-feed-details').textContent = on ? 'Hide details' : 'Details';
}
bind('btn-feed-details', () => setFeedDetails($('feed-details').hidden));

/** The last update and the next check, in plain words (Details). */
function feedClockLine(agoS, nextS) {
  const last = agoS == null ? 'Last update: none yet' : `Last update: ${agoWords(agoS)}`;
  return nextS ? `${last} · next in ${nextWords(nextS)}` : last;
}

/** Redraws the card: the status, the switch, the real planes in the game by flight number, and Details. */
function renderFeedCard() {
  const ap = game.airport;
  if (!ap || !ap.feed || !game.sim) return;
  const { nowMs, view, c, almost } = feedNow();
  const feed = ap.feed, daily = fixedPlanes(ap), demo = webFeed(ap);
  const snap = feed.snapshot ? feed.snapshot(nowMs) : [];
  const counts = countBuckets(snap);
  const { agoS, nextS } = feedClock(feed, nowMs);
  const rows = breakdownRows(counts, { nextS, rival: rivalName(snap), recorded: demo });
  // the status: plain words (feedstate.js feedStatus). A recorded game has no internet, so its status says that; the daily's is one set of planes for everyone
  $('feed-title').textContent = 'Live feed';
  if (WEB_DEMO) $('feed-title').textContent = DEMO_WORDS.feedHead;
  $('feed-status').textContent = ap.challenge ? (challengeSamePlanes(ap.challenge, ap.layoutCode) ? 'A friend’s challenge: the same planes as their game.' : 'A friend’s challenge: similar planes to their game.')
    : daily ? 'Daily challenge: the same planes for everyone today.'
    : demo ? (WEB_DEMO ? DEMO_WORDS.feedStatus : RECORDED_STATUS) : feedStatus(view, { almost });
  // the switch and its line (the same words as Settings and the pause card, refreshRpoSwitches)
  refreshRpoSwitches();
  // the real planes in the game, by flight number (the daily has none to list: one set of planes for everyone)
  $('feed-game-block').hidden = daily;
  const gameList = $('feed-game');
  gameList.textContent = '';
  for (const l of inGameLines(flyingReal(game.sim))) gameList.appendChild(li(l));
  // Details: the last update, the planes near the airport by group, the simulated count, and the report
  $('feed-clock').textContent = demo ? 'The planes do not update.' : feedClockLine(agoS, nextS);
  $('feed-near').hidden = daily;
  $('feed-near-head').textContent = nearHeading(ap.info.iata || ap.info.icao, breakdownTotal(counts));
  // a recording has no first update to wait for (its fixture loads, and lastOkMs is set only then): a live card waits for its first
  const waiting = !demo && !feed.lastOkMs ? 'Waiting for the first update.' : '';
  $('feed-caption').textContent = waiting;
  $('feed-caption').hidden = !waiting;
  const rowList = $('feed-rows');
  rowList.textContent = '';
  for (const r of rows) rowList.appendChild(li(r.text));
  $('feed-sim').textContent = c.simulated ? `${c.simulated} simulated ${c.simulated === 1 ? 'plane has' : 'planes have'} no flight number.` : '';
  $('feed-sim').hidden = !c.simulated;
}

/** A list item with text (the card's rows and lines). */
function li(text) {
  const el = document.createElement('li');
  el.textContent = text;
  return el;
}

/** The pause card's feed line (the same plain status as the card) and the one switch. */
function refreshPauseFeed() {
  if (!$('pause').classList.contains('show')) return;
  const ap = game.airport;
  if (!ap || !ap.feed || !game.sim) return;
  const { view, almost } = feedNow();
  const daily = fixedPlanes(ap), demo = webFeed(ap);
  $('pause-feed').hidden = daily;
  $('pause-feed-line').textContent = demo ? RECORDED_STATUS : feedStatus(view, { almost });
  $('btn-pause-feed').hidden = daily;
  $('btn-pause-feed').textContent = 'Live feed';
  if (WEB_DEMO) { // the demo's words for the pause card's feed (demo.js)
    $('pause-feed-line').textContent = DEMO_WORDS.mix;
    $('btn-pause-feed').textContent = DEMO_WORDS.about;
  }
  refreshRpoSwitches();
}

/** The report, as it is now (the copy button): plain words, no hex addresses, no save data. */
function feedReportText() {
  const ap = game.airport;
  const { nowMs, view, c } = feedNow();
  const starved = starvedShown();
  const feed = ap.feed, demo = !!ap.demo;
  const snap = feed.snapshot ? feed.snapshot(nowMs) : [];
  // a recording never polls: no "last update" or "next update" clock for it
  const { agoS, nextS } = demo ? { agoS: null, nextS: null } : feedClock(feed, nowMs);
  const rows = breakdownRows(countBuckets(snap), { nextS, rival: rivalName(snap), recorded: demo });
  return reportText({
    version: appVersion(), time: new Date(nowMs).toISOString(), iata: ap.info.iata, icao: ap.info.icao, demo,
    level: (DIFFICULTIES[game.director.diff] || DIFFICULTIES.normal).label, realOnly: !!game.realOnly,
    feedWords: feedWords(view), feedReason: view.reason || '', httpStatus: view.httpStatus, agoS, nextS,
    remaining: feed.remaining ?? null, counts: countBuckets(snap), rows, inGame: { confirmed: c.confirmed, area: c.area, simulated: c.simulated },
    starved: !!starved,
    planes: snap.map((f) => ({ callsign: f.callsign, bucket: f.bucket, why: f.why, dist: f.dist, altitude: f.altitude, velocity: f.velocity, off: f.off })),
  });
}

/** Copy feed report: the clipboard, else the text itself to select. */
async function copyFeedReport() {
  if (!game.airport || !game.sim) return;
  const text = feedReportText();
  const how = await sharing.copy(text).catch(() => 'failed');
  if (how === 'copied') {
    toast('Feed report copied', 2400);
    return;
  }
  const box = $('feed-report');
  box.value = text;
  box.hidden = false;
  box.focus();
  box.select();
  toast('Select the text to copy it', 3200);
}

const OVER_TITLES = {
  collision: 'Mid-air collision!',
  runway: 'Runway incursion!',
  wake: 'Caught in wake turbulence!',
  storm: 'Lost in the storm!',
  fuel: 'Out of fuel!',
  glide: 'Couldn’t glide home!',
};

function gameOver() {
  radio.clear();
  const sim = game.sim;
  const ap = game.airport;
  const endWhy = demoWhy; // the demo's end reason, read once (DECISIONS 446)
  demoWhy = '';
  const score = sim.score;
  game.state = 'over';
  game.showHud = false;
  keepAwake(false);
  stopFeedTimer();
  feedFrom = null;
  show('feed', false);
  save.played++;
  const rankBefore = rankFor(save.landed);
  save.landed += sim.landed;
  const rankNow = rankFor(save.landed);
  save.landedLive += sim.landedLive;
  save.pax = (save.pax || 0) + (sim.pax || 0);
  save.departed = (save.departed || 0) + (sim.departed || 0);
  save.bestStreak = Math.max(save.bestStreak || 0, sim.bestStreak || 0);
  // the play streak (streak.js): a game with a landing counts for the day of its first landing, ranked or not, the daily and
  // Play now too
  const today = db.localDay(new Date());
  // the rating request's count (review.js): a finished game that is not a demo, on its local day
  if (!ap.demo) save.review = noteFinishedGame(save.review, today);
  // the day was counted at the game's first landing (countStreakDay): its note says whether an earlier game today had counted
  // it, and the milestone it reached. A game with no landing counted nothing.
  if (sim.landed >= 1) countStreakDay();
  const countedBefore = game.streakNote ? game.streakNote.countedBefore : save.streak.last === today;
  const milestone = game.streakNote ? game.streakNote.milestone : 0;
  const prev = save.best[ap.info.icao] || 0;
  const isBest = score > prev;
  if (isBest) save.best[ap.info.icao] = score;
  if (game.ach) {
    const busiest = new Set(db.BUSIEST.map(([c]) => c));
    // airports really played: the visit log, plus bests from before it existed (not the demo recordings)
    const demos = new Set(DEMO_AIRPORTS);
    const visitedBusiest = new Set([...(save.visited || []), ...Object.keys(save.best).filter((c) => !demos.has(c))].filter((c) => busiest.has(c))).size;
    for (const got of game.ach.lifetime({ pax: save.pax, visitedBusiest, score, days: save.streak.best, weekendLanded: !!ap.weekend && sim.landed > 0 })) earnAchievement(got);
  }
  // the daily challenge keeps today's best (its streak is the play streak now, streak.js)
  let dailyLine = '';
  if (ap.daily) {
    const prevDay = save.daily;
    const d = prevDay && prevDay.n === ap.daily ? prevDay : { n: ap.daily, best: 0, tries: 0 };
    d.tries++;
    const newBest = score > d.best;
    d.best = Math.max(d.best, score);
    save.daily = d;
    dailyLine = newBest && d.tries > 1 ? `⭐ Daily #${ap.daily}: a new best for today!` : `Daily #${ap.daily}: today’s best ${d.best}`;
  }
  // the weekend event keeps this weekend's best, as the daily keeps today's (weekend.js); a new weekend starts its record again
  let weekendBest = '';
  if (ap.weekend) {
    const prevWk = save.weekend;
    const wk = prevWk && prevWk.w === ap.weekend ? prevWk : { w: ap.weekend, best: 0, tries: 0 };
    wk.tries++;
    wk.best = Math.max(wk.best, score);
    save.weekend = wk;
    weekendBest = `Your best this weekend: ${wk.best.toLocaleString('en-US')}`;
    pushReminder(); // the shell's 9 am notice stops naming the weekend once it is flown (reminder.js namesWeekend)
  }
  // the feed as it was at the end, for the difficulty sheet and the home screen
  if (!ap.demo && !WEB_DEMO && !fixedPlanes(ap) && ap.feed) save.feed = feedRecord(feedState(ap.feed, { nowMs: Date.now() }), { remaining: ap.feed.remaining ?? null, real: trafficCounts(sim).real, at: Date.now() });
  // the stats for every game, ranked or not (stats.js); the ranked passengers and the replay are the ranked game's only. A weekend game
  // is ranked on the weekend board (the replay below): its airport counts the game, and gets no best and no passengers from it
  const ranked = shouldPostScores(game.ranking);
  if (game.ranking) recordGame(save, { icao: ap.info.icao, levels: game.ranking.levels, ranked: isRanked(game.ranking), score, landed: sim.landed, real: sim.landedLive, departed: sim.departed || 0, pax: sim.pax || 0, streak: sim.bestStreak || 0, timeS: sim.time, at: Date.now(), demo: !!ap.demo, daily: !!ap.daily, weekend: !!ap.weekend });
  if (ranked && !ap.weekend) save.paxRanked = (save.paxRanked || 0) + (sim.pax || 0);
  // the most in one game, for the Achievements screen's progress (save.gameBest)
  if (game.ach) bestInGame(save, { heavy: game.ach.n.heavy.length, night: game.ach.n.night.length, wet: game.ach.n.wet.length, storm: game.ach.n.storm.length, live: sim.landedLive, departed: sim.departed });
  // the stats are kept on the phone (requirement 15): a full storage says so, and the game still ends. A refused phone copy
  // alone is not said here: the game is in the save, and the settings' own message covers a setting that did not save.
  if (!writeSaveDetail(save).saved) toast('Storage is full: this game may not be kept', 4000);
  // the reminders follow the game (reminder.js): a daily played today is no reminder for today, and the day's landing and the week's
  // record are the shell's (DECISIONS 392). The progress goes to Play Games a few seconds after the game (cloud.js)
  pushReminder();
  scheduleCloudSave();
  noteWorldGame('over'); // World stats: a finished game is counted once (worldstats.js)
  // the end card's lines: the stats of this airport and level, and the rank (requirement 15 and 19)
  const overEnd = { ranking: game.ranking, code: ap.info.iata || ap.info.icao, entry: null };
  overCard = overEnd;
  // the Video share (video.js) is made from this game's replay as it ended: a snapshot, kept in memory only, and never posted. A
  // recorded game only (the demo has none)
  // night: the light the game ended with (the clip holds it, so a video of a dusk game made in the morning is still dusk)
  game.video = game.g && game.g.rec && !ap.demo && !ap.challenge ? { replay: game.g.rec.build(outcomeOf(game.g)), layout: ap.layout, sur: ap.sur, info: ap.info, notes: new Map(game.arrivals), night: Number.isFinite(game.night) ? game.night : null } : null;
  $('btn-share-video').hidden = !game.video;
  // a replay is kept for posting only by a player who may post (13 and up, agreed)
  if (ranked && game.g && game.g.rec && canPlayGames(save, clockNow())) {
    // the replay as the game ended: the ranking's levels, reasons and the outcome the server re-runs and checks
    const r = game.g.rec;
    Object.assign(r.head, { level: game.director.diff, levels: [...game.ranking.levels], reasons: [...game.ranking.reasons] });
    queueReplay(r.build(outcomeOf(game.g)), ap.layout, overEnd);
  }
  // Google Play Games leaderboards (they keep each player's best on their own): ranked games only (ranking.js), and the weekend
  // event has no Play Games board, so its score goes to none of them
  if (ranked && !WEB_DEMO && !ap.weekend) {
    if (ap.daily) playGames.submit('leaderboard_daily_challenge', score);
    else playGames.submit(`leaderboard_best_score_${game.director.diff}`, score);
    playGames.submit('leaderboard_passengers_landed', save.paxRanked || 0);
  }
  fillEndCard({
    cell: game.ranking && !WEB_DEMO ? statsLine(save, { icao: ap.info.icao, code: overEnd.code, levels: game.ranking.levels, demo: !!ap.demo, daily: fixedPlanes(ap) }) : '',
    rank: WEB_DEMO ? DEMO_WORDS.rank : game.ranking ? rankLine(game.ranking, { code: overEnd.code, live: boardsLive() }) : '',
    board: !ap.demo && !WEB_DEMO,
  });
  const got = game.achThisGame || [];
  // the play streak's lines come first (streak.js): the state, the milestone reached, and for a game without a landing,
  // why today is not counted yet. Then the daily, the promotion and the achievements, as before.
  const promoted = rankNow.index > rankBefore.index;
  const streakNow = streakState(save.streak, today);
  const lines = [{ text: streakLine(streakNow), cls: 'over-streak' }];
  if (milestone) lines.push({ text: `🔥 ${MILESTONE_LINES[milestone]}`, cls: 'over-milestone' });
  // with no streak yet, the line above already says "Land a plane today to start your streak": one instruction, not two
  if (sim.landed < 1 && !countedBefore && streakNow.status !== 'none') lines.push({ text: 'No landings this game, so today isn’t counted yet. Land one plane to count it.', cls: 'over-streak' });
  if (dailyLine) lines.push({ text: dailyLine, cls: '' });
  if (weekendBest) lines.push({ text: weekendBest, cls: '' });
  // a friend's challenge whose challenger had real planes: they cannot repeat, so this game's planes are the simulated ones
  if (ap.challenge && challengeRealLine(ap.challenge)) lines.push({ text: challengeRealLine(ap.challenge), cls: '' });
  if (promoted) {
    lines.push({ text: `🎖️ Promoted: ${rankNow.name}!`, cls: '' });
    setTimeout(() => audio.play('fanfare'), 600);
  } else if (rankNow.next != null) lines.push({ text: `${rankNow.name} · ${rankNow.next} more landings to ${rankNow.nextName}`, cls: '' });
  if (got.length) lines.push({ text: `${got.length === 1 ? 'Achievement' : `${got.length} achievements`}: ${got.map((a) => `${a.icon} ${a.name}`).join(' · ')}`, cls: '' });
  if (WEB_DEMO) for (const l of lines.filter((x) => x.cls === 'over-streak' || x.cls === 'over-milestone')) lines.splice(lines.indexOf(l), 1); // the demo keeps no streak
  $('over-ach').innerHTML = '';
  for (const l of lines) {
    const d = document.createElement('div');
    d.textContent = l.text;
    d.className = l.cls;
    $('over-ach').appendChild(d);
  }
  // a finished daily game's percentile (DECISIONS 400): only on the boards, and only for the daily
  if (ap.daily && !ap.demo && boardsLive() && deviceHash()) showDailyPercent(ap.daily, score);
  $('over-title').textContent = WEB_DEMO ? demoEndTitle(endWhy || (sim.crash && sim.crash.reason), OVER_TITLES) : OVER_TITLES[sim.crash && sim.crash.reason] || 'Game over';
  $('over-score').textContent = String(score);
  $('over-unit').textContent = score === 1 ? 'point' : 'points';
  const bestEl = $('over-best');
  if (ap.challenge) {
    // a friend's challenge: the two scores side by side (challenge.js), the better one marked in the new style
    bestEl.textContent = challengeScoreLine(score, ap.challenge);
    bestEl.classList.toggle('new', score > ap.challenge.score);
  } else {
    bestEl.textContent = isBest && score > 0 ? `New best at ${ap.info.iata || ap.info.icao}!` : `Best at ${ap.info.iata || ap.info.icao}: ${Math.max(prev, score)}`;
    bestEl.classList.toggle('new', isBest && score > 0);
  }
  // stars: what this game earned, and how far to the next one
  const best = Math.max(prev, score), had = starsFor(prev), now = starsFor(best);
  const next = STAR_GOALS[now];
  const nextEl = $('over-next');
  nextEl.innerHTML = '';
  const line = document.createElement('div');
  line.className = 'over-stars';
  const st = document.createElement('span');
  st.className = 'stars';
  st.textContent = starText(now);
  line.append(st, ` ${now > had ? (now - had === 1 ? 'New star!' : `${now - had} new stars!`) : next ? `${next - best} more for the next star` : 'All three stars!'}`);
  nextEl.appendChild(line);
  if (next) {
    const from = STAR_GOALS[now - 1] || 0;
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('i');
    fill.style.width = '0%';
    bar.appendChild(fill);
    nextEl.appendChild(bar);
    requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${Math.round((100 * (best - from)) / (next - from))}%`)));
  }
  // the landings: the real flights by name, up to three (two on the narrowest phones: style.css), then the points' other parts.
  // A real landing confirmed here earns its bonus, a medevac wait costs a point whoever lands (sim.startLanding); a real flight
  // that goes out again is a departure like any other.
  const ends = (most) => endLines({
    landed: sim.landed, real: sim.landedLive || 0, names: sim.liveNames || [], departed: sim.departed || 0,
    realBonus: sim.confirmedPts || 0, bonus: sim.bonusPts || 0, penalty: sim.penaltyPts || 0, streak: sim.bestStreak || 0,
    realOnly: !!game.realOnly, daily: !!ap.daily, weekend: !!ap.weekend, challenge: ap.challenge ? challengeWho(ap.challenge.name) : '', challengeSame: challengeSamePlanes(ap.challenge, ap.layoutCode), most,
  });
  const endFlights = ends(3), endShort = ends(2);
  // the demo's planes are all simulated: the end card's line says so (demo.js DEMO_WORDS.planes)
  if (WEB_DEMO) endFlights.flights = endShort.flights = DEMO_WORDS.planes(sim.landed);
  // a friend's challenge this game can send (challenge.js): the same airport, seed, level and start weather, and this game's score; null when
  // it cannot be repeated (a recording, a level or departures change in play, a runways-only layout). A challenge game's own rules carry on.
  const challengeOut = challengeFromGame({
    icao: ap.info.icao, seed: game.g ? game.g.seed : null, level: game.ranking ? game.ranking.levels[0] : game.director.diff, score,
    rules: ap.challenge ? ap.challenge.rules : ap.daily ? 'd' : game.ranking && game.ranking.reasons.includes('departuresOff') ? 'o' : '',
    real: challengeHadReal(sim), weather: game.weatherStart, reasons: game.ranking ? game.ranking.reasons : ['demo'], weekend: !!ap.weekend,
    screen: game.screen, layout: ap.layoutCode, repeatable: repeatableGame({ firstGame: game.firstGame, hudMoved: game.hudMoved, challenge: ap.challenge, layout: ap.layoutCode }),
  });
  // what the share panel draws and says (no callsigns or anything personal)
  const mins = Math.ceil((sim.time || 0) / 60);
  game.result = {
    score, stars: starsFor(score), starText: starText(starsFor(score)), iata: ap.info.iata, icao: ap.info.icao,
    name: ap.info.name, city: (ap.info.city || '').split(/[(,]/)[0].trim(), daily: ap.daily || 0, weekend: ap.weekend ? themeOf(ap.weekend).title : null,
    tries: ap.daily && save.daily ? save.daily.tries : 1, landed: sim.landed, departed: sim.departed || 0, pax: sim.pax || 0,
    live: sim.landedLive || 0, confirmed: sim.landedConfirmed || 0, demo: !!ap.demo || WEB_DEMO, streak: sim.bestStreak || 0, rank: rankFor(save.landed).name,
    // the reasons, not the switch now: a game that was real-only and then turned it off still says so (its reason is permanent)
    difficulty: ap.daily || ap.weekend ? 'Normal' : `${(DIFFICULTIES[game.director.diff] || DIFFICULTIES.normal).label}${game.ranking && game.ranking.reasons.includes('realOnly') ? ' · real planes only' : ''}`,
    timeline: Array.from({ length: Math.max(1, mins) }, (_, i) => (game.timeline && game.timeline[i]) || { landed: 0, trouble: 0, crash: 0 }),
    world: ap.world,
    challenge: challengeOut,
  };
  // the landings (real flights by name), then the other parts of the score, then the passengers
  const liveEl = $('over-live');
  liveEl.textContent = '';
  liveEl.append(endFlights.flights === endShort.flights ? endFlights.flights : variants(endFlights.flights, endShort.flights));
  if (endFlights.extras) liveEl.append(document.createElement('br'), endFlights.extras);
  if (sim.pax) liveEl.append(document.createElement('br'), `${sim.pax.toLocaleString('en-US')} passengers home safe.`);
  buildStats(sim);
  if (!WEB_DEMO) suggestNextAirport(ap.info.icao); // the demo offers no next airport (one game)
  // from the third free game's end card, Pro is offered on the card (pro.js endOfferDue): the card is never held for it
  $('btn-over-pro').hidden = WEB_DEMO || !endOfferDue({ pro: save.pro, today: proToday(), daily: !!(ap.daily || ap.weekend), isPro: isPro() });
  // the demo's invite: the Play page, with the airport as the campaign (DECISIONS 446)
  if (WEB_DEMO) $('btn-over-store').href = demoStoreUrl({ medium: 'share', campaign: ap.info.icao });
  const card = $('over');
  card.style.pointerEvents = 'none';
  show('over');
  syncOverShadow();
  countEndCard(score); // the score, the best and the stat counts count up (endcard.js, ui 10)
  setTimeout(() => (card.style.pointerEvents = ''), 650);
  // the rating request (review.js): a good game's card, asked once it has settled; never a demo, a crash or a game with no landing
  const good = !ap.demo && goodGame({ reason: sim.crash && sim.crash.reason, landed: sim.landed, stars: starsFor(score), personalBest: isBest && score > 0, landingStreak: sim.bestStreak || 0 });
  if (good) setTimeout(() => askForReview(overEnd), REVIEW_SETTLE_MS);
  // one fanfare per end card: the new best's, or a streak milestone's when neither that nor the promotion's plays (streak.js)
  const newBest = isBest && score > 0;
  if (newBest || celebrateSound({ promoted, newBest, milestone })) setTimeout(() => audio.play('fanfare'), 500);
  else audio.play('gameover');
  if (milestone) haptic('heavy');
  audio.intensity = 0;
}

/**
 * The rating request (review.js; DECISIONS 358), once the good game's end card has settled. Only the card still on screen, for the
 * game that made it, and only when the rules allow (the age answer in, the app on screen, not on the first day, 5 games over 2 days,
 * once in 30 days). Google's own flow is asked directly; the game says nothing about it. The ask is counted only when the request started.
 */
function askForReview(card) {
  if (WEB_DEMO) return; // the demo asks for no review (DECISIONS 446)
  if (card !== overCard || game.state !== 'over' || !$('over').classList.contains('show')) return;
  const today = db.localDay(new Date());
  if (!reviewDue({ review: save.review, today, good: true, gate: gateState(save, clockNow()) === 'home', visible: !document.hidden })) return;
  if (!requestReview()) return; // the sideload build, a browser, or the bridge is not there: nothing is counted
  save.review = noteAsked(save.review, today);
  writeSave(save);
}

/** The end card's sticky buttons cast a shadow only while more of the card is scrolled away underneath them. */
function syncOverShadow() {
  const card = $('over').querySelector('.over-card');
  card.classList.toggle('more-below', card.scrollTop + card.clientHeight < card.scrollHeight - 1);
}
$('over').querySelector('.over-card').addEventListener('scroll', syncOverShadow, { passive: true });

/** Long and short wordings of a line, shown by the screen's size (style.css: .long and .short). */
function variants(long, short) {
  const f = document.createDocumentFragment();
  for (const [cls, text] of [['long', long], ['short', short]]) {
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = text;
    f.appendChild(el);
  }
  return f;
}

/** Point the player at the next of the world's busiest airports to earn stars at. */
let nextAirport = null;
async function suggestNextAirport(current) {
  const btn = $('btn-next-airport');
  btn.hidden = true;
  nextAirport = null;
  // new players first get the simpler big airports: two parallel runways rather than five
  const easy = ['EGLL', 'OMDB', 'WSSS', 'RKSI'];
  const all = db.BUSIEST.map(([c]) => c);
  const order = (save.played <= 3 ? [...easy, ...all.filter((c) => !easy.includes(c))] : all).filter((c) => c !== current);
  // somewhere not tried yet (or not lately), else the busiest one with the fewest stars
  const recent = new Set(save.recent || []);
  const fresh = order.filter((c) => !recent.has(c));
  const stars = (c) => starsFor(save.best[c] || 0);
  const pool = fresh.length ? fresh : order;
  const fewest = Math.min(...pool.map(stars));
  const pick = fewest >= 3 ? pool[Math.floor(Math.random() * pool.length)] : pool.find((c) => !save.best[c]) || pool.find((c) => stars(c) === fewest);
  const info = pick && (await db.getAirport(pick));
  if (!info || game.state !== 'over') return;
  nextAirport = info;
  btn.textContent = `Next: ${info.iata || info.icao} · ${(info.city || info.name).split(/[(,]/)[0].trim()} ${starText(stars(pick))}`;
  btn.hidden = false;
  syncOverShadow(); // a taller card now
}
bind('btn-next-airport', () => {
  if (!nextAirport) return;
  show('over', false);
  startAirport(nextAirport, { demo: false });
});

function buildStats(sim) {
  const el = $('over-stats');
  el.innerHTML = '';
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  for (const cls of ['heavy', 'narrowbody', 'regional', 'light', 'heli']) {
    const n = sim.landedByClass[cls];
    if (!n) continue;
    const def = CLASSES[cls];
    const c = document.createElement('canvas');
    const d = document.createElement('div');
    d.className = 'stat';
    d.appendChild(c);
    d.appendChild(document.createTextNode(String(n)));
    el.appendChild(d);
    // drawn at the size the stylesheet shows it (it grows on tablets), so the icon stays sharp; offsetWidth
    // ignores the card's pop-in transform, and is 0 where short screens hide the icons
    const S = c.offsetWidth || 30;
    c.width = c.height = Math.round(S * dpr);
    const g = c.getContext('2d');
    const k = (dpr * 0.5 * S) / 30; // the sprite fills a 30 px box at half scale
    g.setTransform(k, 0, 0, k, (S * dpr) / 2, (S * dpr) / 2);
    g.rotate(-Math.PI / 2);
    drawAircraftShape(g, def.sprite, def.color, 0.3);
  }
}

// ------------------------------------------------------------------ input

const pointers = new Map(); // pointerId -> aircraft being drawn
const tapInfo = new Map();
const releasedAt = new Map(); // aircraft -> performance.now() when its tap-circle was last released (holdToggle)
const touches = new Map(); // all active pointers: id -> {x, y}
let gesture = null; // { kind: 'pan'|'pinch', ... }
let lastTap = { t: 0, x: 0, y: 0 };
let feedTap = null; // a press in the Live feed zone: { id, x, y, moved }. The card opens on its tap, never on a drag (endPointer)

function releaseAllPointers() {
  for (const [id, a] of pointers) if (game.sim && liftEndsPath(tapInfo.get(id) || {})) pathEnd(a);
  pointers.clear();
  tapInfo.clear();
  renderer.tailHeld.clear();
  gesture = null;
}

function hudHit(e) {
  for (const [name, b] of Object.entries(renderer.buttons)) if (Math.hypot(e.clientX - b.x, e.clientY - b.y) < b.r) return name;
  return null;
}

// the sky gesture the fingers down make now (fingers.js): a pan for one finger, a pinch for two or more
function startGesture() {
  gesture = skyGesture([...touches.values()]);
}

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  e.preventDefault();
  if (WEB_DEMO && e.pointerType === 'mouse' && e.button !== 0) return; // the demo: a right or middle press draws nothing (DECISIONS 446)
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (game.state !== 'play') return;
  const btn = hudHit(e);
  if (btn) {
    touches.delete(e.pointerId);
    onHudButton(btn);
    return;
  }
  if (game.crashT >= 0) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  const [x, y] = renderer.toWorld(e.clientX, e.clientY);
  const sim = game.sim;
  const taken = new Set(pointers.values());
  const cssPerWorld = renderer.scale / renderer.dpr;
  // a flying plane whose touch zone holds the finger (sim.pick: its touch radius plus the pick margin); grabbing a plane wins, except
  // for a free tail in reach that the finger is nearer to than the plane's centre (fingers.js tailBeatsPlane)
  const under0 = sim.pick(x, y, 6 / renderer.view.zoom);
  const under = under0 && !taken.has(under0) ? under0 : null;
  // a free tail in reach takes the finger (fingers.js tailUnder). Its plane is held as a grabbed one is, but nothing is drawn until the
  // finger drags. A tail wins over a circling plane's ring, a ground tap and the Live feed zone
  // the touch targets grow with the screen (fingers.js tailScale: a tablet's handle is bigger, in CSS px, so it is as easy to reach)
  const tscale = tailScale(renderer.hud);
  const tailA = tailUnder(sim.tails(), x, y, tailReach(cssPerWorld, tscale), taken);
  const tailPt = tailA ? sim.tailOf(tailA) : null;
  // under a flying plane's zone, the tail wins only on its handle (fingers.js tailBeatsPlane): a finger on the body beside it grabs the plane
  const handle = tailHandleReach(cssPerWorld, tscale);
  const tail = tailPt && (!under || tailBeatsPlane(dist2(x, y, under.x, under.y), dist2(x, y, tailPt.x, tailPt.y), handle * handle)) ? tailA : null;
  if (tail) {
    gesture = gestureAfterLanding(gesture, tail);
    pointers.set(e.pointerId, tail);
    tapInfo.set(e.pointerId, { t: performance.now(), x: e.clientX, y: e.clientY, moved: false, free: null, tail: true, carried: false, slop: TAP_PX });
    renderer.tailHeld.add(tail);
    haptic('tick');
    return;
  }
  // a finger on a circling plane's ring takes the plane, when no plane is under the finger (fingers.js ringUnder)
  const ring = under0 ? null : ringUnder(sim.holds(), x, y, RING_REACH_PX / cssPerWorld, taken);
  const a = under || ring;
  // a ground aircraft (parked, holding or turnaround) gets the tap only when no flying plane's zone holds the finger (fingers.js)
  const reach = 30 / Math.sqrt(renderer.view.zoom);
  if (groundTapWins(under0 || ring, game.departures && game.departures.tapTarget(x, y, reach)) && game.onGroundTap && game.onGroundTap(x, y, reach)) {
    touches.delete(e.pointerId);
    return;
  }
  // a plane under the finger always wins: a sky pan or pinch already under way is dropped, and the map stays where it is
  gesture = gestureAfterLanding(gesture, a);
  if (a) {
    pointers.set(e.pointerId, a);
    // free: where the finger was when the plane is seen let go (fingers.js fingerMoveAction); null while the plane is held. circling is
    // read before the path begins, which clears the circle: its tap slop is the looser one (fingers.js tapSlopPx)
    const circling = !!a.hold;
    tapInfo.set(e.pointerId, { t: performance.now(), x: e.clientX, y: e.clientY, moved: false, free: null, circling, slop: tapSlopPx(circling) });
    pathBegin(a, x, y);
    a.popT = game.clock;
    audio.play('select');
    haptic('tick');
    return;
  }
  // the line under the airport name (and the banner under it) opens the Live feed card on a tap; a plane under the finger
  // won above. A press there still pans or pinches the sky: endPointer opens the card only when it was a tap
  const z = renderer.feedZone;
  if (z && e.clientX >= z.x && e.clientX <= z.x + z.w && e.clientY >= z.y && e.clientY <= z.y + z.h) {
    feedTap = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    if (!pointers.size) startGesture();
    return;
  }
  // empty sky: pan / pinch (only when no path is being drawn)
  if (!pointers.size) startGesture();
});

canvas.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (feedTap && feedTap.id === e.pointerId && Math.hypot(e.clientX - feedTap.x, e.clientY - feedTap.y) > 10) feedTap.moved = true;
  const a = pointers.get(e.pointerId);
  if (a && game.state === 'play') {
    const ti = tapInfo.get(e.pointerId);
    if (ti && Math.hypot(e.clientX - ti.x, e.clientY - ti.y) > ti.slop) ti.moved = true;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const [x, y] = renderer.toWorld(ev.clientX, ev.clientY);
      if (ti) {
        // a tail waits until the finger has dragged (a tap changes nothing); the first drag carries the path on from the tail
        // (fingers.js tailMoveAction), and a carried tail is held as a plane is from then on
        const m = ti.tail
          ? tailMoveAction(ti.carried, Math.hypot(ev.clientX - ti.x, ev.clientY - ti.y), a, ti.free, ev.clientX, ev.clientY, !!game.sim.tailOf(a))
          // the game let go of this plane (a jolt stopped its drawing, or a runway closure cancelled its landing): the finger takes it
          // again once it has moved away from where it was when that was seen (fingers.js fingerMoveAction), so a resting thumb does not
          // pull it back and a real drag steers it out at once. It is taken from the plane's place, as on a fresh touch (pathBegin)
          : fingerMoveAction(a, ti.free, ev.clientX, ev.clientY);
        ti.free = m.free;
        if (m.action === 'carry') {
          // the tail may be gone by now (the plane landed, or flew its path out): then nothing is carried
          if (!game.sim.tailOf(a)) continue;
          ti.carried = true;
          if (pathCarry(a, x, y)) break;
          continue;
        }
        if (m.action === 'begin') {
          pathBegin(a, x, y);
          continue;
        }
        if (m.action === 'wait') continue; // let go, and the finger has not moved far enough yet: the plane flies on
      }
      if (pathExtend(a, x, y)) break;
    }
    return;
  }
  if (!gesture) return;
  const pts = [...touches.values()];
  if (gesture.kind === 'pinch' && pts.length >= 2) {
    const [p, q] = pts;
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    if (gesture.d > 10) renderer.zoomAt(d / gesture.d, mx, my);
    renderer.panBy(mx - gesture.mx, my - gesture.my);
    Object.assign(gesture, { d, mx, my });
  } else if (gesture.kind === 'pan' && pts.length === 1) {
    const dx = pts[0].x - gesture.x, dy = pts[0].y - gesture.y;
    gesture.moved += Math.abs(dx) + Math.abs(dy);
    renderer.panBy(dx, dy);
    gesture.x = pts[0].x;
    gesture.y = pts[0].y;
  }
});

function endPointer(e) {
  touches.delete(e.pointerId);
  // a press in the feed zone: a tap (no drag, no other finger down, not cancelled) opens the card, and is no map gesture
  const ft = feedTap && feedTap.id === e.pointerId ? feedTap : null;
  if (ft) feedTap = null;
  if (ft && e.type === 'pointerup' && !ft.moved && !touches.size && game.state === 'play' && game.crashT < 0) {
    gesture = null;
    openFeed('play');
    return;
  }
  const a = pointers.get(e.pointerId);
  if (a) {
    pointers.delete(e.pointerId);
    const ti = tapInfo.get(e.pointerId);
    tapInfo.delete(e.pointerId);
    if (ti && ti.tail) renderer.tailHeld.delete(a);
    // a tail the finger never carried is left as it was (fingers.js liftEndsPath), and a tap on it toggles no hold (tapHoldsPlane)
    if (liftEndsPath(ti || {})) pathEnd(a);
    // a tap on a plane toggles its circle, unless a circling plane was tapped past its (looser) slop or a tap would re-circle one released
    // just now (fingers.js tapTogglesHold)
    const released = releasedAt.get(a);
    if (ti && tapTogglesHold(ti, released == null ? null : performance.now() - released) && e.type === 'pointerup' && performance.now() - ti.t < 350 && a.state === 'fly' && game.state === 'play' && game.crashT < 0) {
      holdToggle(a);
    }
    // the first time a player leaves a free path (a drawn one, lifted in the air), the tail is taught, once (save.tipTail)
    if (ti && ti.moved && !ti.tail && !save.tipTail && game.state === 'play' && a.state === 'fly' && game.sim.tailOf(a)) {
      save.tipTail = true;
      writeSave(save);
      toast('Drag the dot at the end of a path to carry it on.', 4500);
    }
    // the sky fingers still down (a pan or pinch dropped when this plane was grabbed) carry on from where they are now
    gesture = gestureAfterPlaneLift([...touches.values()], pointers.size > 0);
    return;
  }
  if (gesture) {
    const wasTap = gesture.kind === 'pan' && gesture.moved < 8 && !ft; // a press in the feed zone is no double tap
    if (touches.size >= 1) startGesture();
    else gesture = null;
    if (wasTap && e.type === 'pointerup' && game.state === 'play') {
      const now = performance.now();
      if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
        if (renderer.view.zoom > 1.05) renderer.resetView();
        else renderer.zoomAt(2.2, e.clientX, e.clientY);
        lastTap.t = 0;
      } else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (game.state === 'play' || game.state === 'paused') renderer.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
}, { passive: false });

function onHudButton(btn) {
  renderer.press(btn, game.clock);
  if (btn === 'pause') {
    audio.play('click');
    haptic('tick');
    pauseGame();
  } else if (btn === 'ff') {
    game.fast = !game.fast;
    audio.play('ff', game.fast);
    haptic('tick');
  } else if (btn === 'rewind') {
    doRewind();
  }
}

function doRewind() {
  const b = game.bullet;
  if (!b || !b.canRewind() || !game.g || !applyRewind(game.g)) return;
  syncRefs();
  b.afterRewind();
  releaseAllPointers();
  game.crashT = -1;
  game.camera.zoom = 1;
  fx.reset();
  renderer.clearArrivalNotes(); // a rewound plane may land again, and say so then
  renderer.startTape(game.clock);
  game.displayScore = game.sim.score;
  audio.play('rewind');
  haptic('heavy');
  toast('Rewound 5 seconds — that was your one rewind', 2400);
}

function press() {
  audio.unlock();
  audio.play('click');
  haptic('tick');
}

function bind(id, fn) {
  const el = $(id);
  el.addEventListener('pointerdown', () => press());
  el.addEventListener('click', WEB_DEMO && id === 'btn-quit' ? demoQuit : fn); // the demo's Quit ends its one game (demoQuit)
}

// Play now (Home, and the Streak screen's Play now) starts the airport picked on the list (2.3 item 6), else a real game at a
// random busy airport for the chosen level (airportdb.js playNowCode: never the airport played last). With no internet it starts
// the recorded game instead, at the picked airport or at one of the recorded airports.
async function playNow() {
  const recorded = playRecorded({ online: navigator.onLine });
  if (picked && picked.challenge) return startAirport(picked.info, { challenge: picked.challenge });
  if (picked && picked.weekend) {
    // the weekend is read again at the tap: a pick kept past Monday starts nothing, and the list is drawn again without it
    const W = weekendOf(db.localDay(new Date()));
    if (W === null) {
      picked = null;
      savePick();
      return showFeatured();
    }
    const info = W === picked.weekend ? picked.info : await db.getAirport(weekendAirport(W));
    return startAirport(info, { weekend: W });
  }
  if (picked) return picked.daily ? startAirport(picked.info, { daily: picked.daily }) : startAirport(picked.info, { demo: recorded });
  const last = (save.recent || [])[0];
  const code = recorded
    ? recordedPlayCode(last) // the recorded game never repeats the airport played last either
    : db.playNowCode(gameConfig({ settings: save.settings }).diff, last);
  startAirport(await db.getAirport(code), { demo: recorded });
}
// The picked airport (2.3 item 6): a tap on a home row picks it (teal, Play names it, the backdrop glides to it); a tap on the
// picked row again clears it. The pick is saved at once as lastPlayed (savePick), picked or cleared, and a fresh launch starts with
// it (restoreLastPick). The airport a game is played at stays picked after it (2.4 item 3), and a pick made without a game survives
// a restart too (2.5: it used to live in the page only, so a restart lost it). A cleared pick is kept cleared across a relaunch.
let picked = null; // { info, daily, top }: daily is the day's number on the daily row (0 on an airport row); top: a search result
const pickRestored = restoreLastPick();
/** A cold start's pick: the home pick saved last (playbutton.js lastPlayedOf). The Play pill waits for it, so Random airport never flashes. */
async function restoreLastPick() {
  const today = db.todaysDaily();
  const lp = lastPlayedOf(save, { code: today.airport[0], n: today.n });
  // the Play pill starts hidden in the page (index.html, .pending), so it shows only once it names the right airport
  if (!lp) {
    $('btn-demo').classList.remove('pending'); // a first launch, or the pick was cleared: the Random airport
    return;
  }
  try {
    const info = await db.getAirport(lp.icao);
    // a weekend pick is kept only while its weekend lasts (a pick from a past weekend is not restored as the airport's row)
    const weekendNow = weekendOf(db.localDay(new Date()));
    const pastWeekend = lp.weekend && lp.weekend !== weekendNow;
    if (info && !picked && !pastWeekend) picked = { info, daily: lp.daily === today.n ? lp.daily : 0, top: false, challenge: lp.challenge ? checkChallenge({ ...lp.challenge, icao: info.icao }) : null, weekend: lp.weekend || 0 };
  } catch (e) {
    console.warn('pick', e); // no pick: the Random airport
  } finally {
    $('btn-demo').classList.remove('pending');
    syncPlayButton();
  }
}
/**
 * Saves the home pick at once (lastPlayed, as playbutton.js savedPickOf keeps it): picked, or cleared (null, so the next launch shows
 * the Random airport too). A fresh start restores it (restoreLastPick), so a restart of the app or the page does not lose a pick.
 */
function savePick() {
  save.lastPlayed = savedPickOf(picked);
  writeSave(save);
}
/** A home row was tapped (airportRow, dailyRow): it is picked, or unpicked when it already was. search: a search result. */
function tapRow(info, daily = 0, { search = false, weekend = 0 } = {}) {
  // a challenge's own row (the teal top row, keyed by its airport) unpicks the challenge, as any picked row does
  const same = pickKey(picked) === pickKey({ info, daily, weekend }) || (!!picked && !!picked.challenge && !daily && picked.info.icao === info.icao);
  picked = same ? null : { info, daily, top: search, weekend };
  savePick();
  glideBackdrop(picked ? info : null);
  if (search) return clearSearch(); // the search closes: the airport is the picked row at the top of the home list
  markPicked();
}
// A link someone opened from a share before 2.5 (a "Beat my score" link; MainActivity passes it to HP_openLink; links.js): the airport
// it names is picked on the home list, ready to Play, and nothing starts. A link that comes during a game waits for the home screen (showMenu takes it).
let linkWaiting = ''; // the address until the home screen takes it
let booted = false; // the first home screen is up (boot): a link that comes before it waits for showMenu
window.HP_openLink = (url) => {
  linkWaiting = String(url || '');
  if (booted && game.state === 'menu') takeLink();
};
/** Picks the airport a waiting link names (links.js pickFromLink). True when it did; the backdrop glides to that airport. */
async function takeLink() {
  const url = linkWaiting;
  linkWaiting = '';
  const pick = url ? await pickFromLink(url, db) : null;
  if (!pick || game.state !== 'menu') return false;
  // an airport that is not on the list (not one of the busiest, not the daily) sits at the top, as a search result does
  const listed = pick.daily || db.BUSIEST.some(([code]) => code === pick.info.icao);
  // a friend's challenge (challenge.js): the same airport with the challenge's planes, ready to Play; nothing starts here
  const challenge = parseChallengeLink(url);
  // a challenge is never the daily, even when a hand-made link carries d= too (the Play button would say Ranked)
  picked = { info: pick.info, daily: challenge ? 0 : pick.daily, top: !listed, challenge: challenge ? { ...challenge, icao: pick.info.icao } : null };
  savePick(); // a linked pick is kept like any other (2.5): a restart brings it back
  glideBackdrop(pick.info);
  markPicked();
  return true;
}

/** The picked row on the list (teal, aria-pressed), a search result's row at the top, and the Play button and Difficulty pill. */
function markPicked() {
  const list = $('airport-list');
  list.querySelectorAll('.ap-row.pick-top').forEach((r) => r.remove());
  const key = pickKey(picked);
  // the pick is always a teal row: a search result sits at the top, and so does a pick no row on the list shows (a restored pick, or a
  // linked airport that is not listed), so the list and the Play button name the same airport (2.5)
  const onList = !!key && [...list.querySelectorAll('.ap-row[data-key]')].some((r) => r.dataset.key === key);
  let top = null;
  if (picked && (picked.top || !onList) && !$('search').value.trim()) {
    top = airportRow(picked.info, { search: true });
    top.classList.add('pick-top');
    list.prepend(top);
  }
  // one row is the choice, so the list never shows two: the search result at the top when there is one, else the first row for the
  // picked key (an airport in Recent and in the busiest list is both). The rows are read after the top row is in the list.
  const rows = [...list.querySelectorAll('.ap-row[data-key]')];
  const chosen = top || (key ? rows.find((r) => r.dataset.key === key) : null);
  rows.forEach((r) => {
    const on = r === chosen;
    r.classList.toggle('selected', on);
    r.setAttribute('aria-pressed', String(on));
  });
  syncPlayButton();
}
/**
 * The Play button's words and the Difficulty pill (playbutton.js): the picked airport or the random one, the rank word from the
 * settings as they are now, and the one reason a game is unranked (Unranked when the game will be the recorded one, no internet).
 * The daily challenge is always Normal: its Difficulty pill reads Normal and is greyed while the daily is picked. An unranked game's
 * reason is a line of its own under the place (2.4 item 3); the ranked word stays on the place's line.
 */
function syncPlayButton() {
  const recorded = playRecorded({ online: navigator.onLine });
  const w = playButtonWords({ pick: picked, demo: recorded, settings: save.settings });
  if (WEB_DEMO) return demoPlayButton(); // the demo's pill (demo.js)
  const btn = $('btn-demo');
  btn.querySelector('.pb-title').textContent = w.title;
  // the Streak screen's Play now starts this same game, so it is named the same ("Play ATL" when an airport is picked)
  $('btn-streak-play').textContent = w.title;
  btn.querySelector('.pb-place').textContent = w.place;
  const rank = btn.querySelector('.pb-rank');
  rank.textContent = w.rank ? `· ${w.rank}` : '';
  rank.hidden = !w.rank;
  const unranked = btn.querySelector('.pb-unranked');
  unranked.textContent = w.unranked;
  unranked.hidden = !w.unranked;
  // the free-games line (from day 4; pro.js playLeftWords): its own line in the pill, and part of the button's name
  const left = playLeftWords({ pro: save.pro, today: proToday(), daily: !!(picked && picked.daily), weekend: !!(picked && picked.weekend), isPro: isPro() });
  const leftEl = btn.querySelector('.pb-left');
  leftEl.textContent = left;
  leftEl.hidden = !left;
  btn.setAttribute('aria-label', left ? `${w.label}. ${left}` : w.label);
  // a friend's challenge is always its level, as the daily is always Normal: the pill shows it, greyed
  const daily = !!(picked && (picked.daily || picked.weekend)), chal = !!(picked && picked.challenge);
  const d = DIFFICULTIES[daily ? 'normal' : chal ? picked.challenge.level : save.settings.difficulty] || DIFFICULTIES.normal;
  $('diff-chip-value').textContent = d.label;
  $('diff-chip').classList.toggle('locked', daily || chal);
  $('diff-chip').setAttribute('aria-disabled', String(daily || chal));
}
bind('btn-demo', playNow);
bind('btn-resume', resumeGame);
bind('btn-pause-feed', () => openFeed('pause'));
bind('btn-pause-dep', () => {
  // greyed (Beginner, or real planes only): the note says why, and nothing changes
  if ($('btn-pause-dep').classList.contains('locked')) {
    flashNote($('pause-dep-note'));
    haptic('tick');
    return;
  }
  setDeparturesFromPause(!save.settings.departures);
});
bind('btn-confirm-yes', () => {
  if (pendingLevel) setLevelFromPause(pendingLevel);
  closeScreen('confirm');
});
bind('btn-confirm-no', () => closeScreen('confirm'));
document.querySelectorAll('[data-pause-level]').forEach((b) => {
  b.addEventListener('pointerdown', () => press());
  b.addEventListener('click', () => askLevel(b.dataset.pauseLevel));
});
bind('btn-feed-copy', () => copyFeedReport());
document.querySelectorAll('[data-feed-close]').forEach((el) => {
  el.addEventListener('pointerdown', () => press());
  el.addEventListener('click', () => closeScreen('feed'));
});
// a restart and Fly again are new games: the free-games rule applies to them as to any start (the daily challenge is free)
bind('btn-restart', () => {
  if (proAllowsNow(!!(game.airport && (game.airport.daily || game.airport.weekend)))) newGame();
});
bind('btn-quit', quitGame);
bind('btn-again', () => {
  if (proAllowsNow(!!(game.airport && (game.airport.daily || game.airport.weekend)))) newGame();
});
// Short Final Pro (propay.js): the Settings row's Buy and Restore, the end card's offer, and the sheet's Buy and Not now
bind('btn-pro-buy', () => buyPro());
bind('btn-sheet-buy', () => buyPro());
bind('btn-pro-restore', () => restorePro());
// Rate Short Final (Settings): the game's Google Play page, for everyone at any time (platform.js openStorePage)
bind('btn-rate', () => {
  const opened = WEB_DEMO ? openDemoPage(demoStoreUrl({ medium: 'web', campaign: 'settings' })) : openStorePage();
  if (!opened) toast('Couldn’t open Google Play', 2600);
});
bind('btn-pro-later', () => closeProSheet());
bind('btn-over-pro', () => openProSheet('end'));
bind('btn-over-menu', showMenu);
bind('diff-chip', () => {
  // the daily challenge is always Normal: its pill is greyed while the daily is picked, and says why when it is tapped
  if (picked && picked.daily) return toast('Today’s challenge is always Normal.', 2400);
  if (picked && picked.weekend) return toast('This weekend’s event is always Normal.', 2400);
  if (picked && picked.challenge) return toast(`${challengeWords(picked.challenge.name)} is always ${(DIFFICULTIES[picked.challenge.level] || DIFFICULTIES.normal).label}.`, 2400);
  $('btn-settings').click();
});
// ------------------------------------------------------------ sharing
const APP_LABELS = {
  whatsapp: ['WhatsApp', '#25d366'], instagram: ['Instagram', '#e1306c'], x: ['X', '#111111'], facebook: ['Facebook', '#1877f2'],
  telegram: ['Telegram', '#229ed9'], messenger: ['Messenger', '#0084ff'], discord: ['Discord', '#5865f2'],
  messages: ['Messages', '#34a853'], email: ['Email', '#ea4335'],
  tiktok: ['TikTok', '#111111'], youtube: ['YouTube', '#ff0000'], // the video apps (Sharing.kt): the Video share's one-tap buttons
};
// the share panel: the picture formats and Text, and the Video format (video.js): its clip, the made video (video, for the game it
// was made from: videoFor), the job being made (videoJob; a newer choice or a closed panel moves it on) and its cancel flag
const shareState = { format: 'feed', canvas: null, texts: null, videoTexts: null, token: 0, clip: DEFAULT_CLIP, video: null, videoFor: null, videoBusy: false, videoJob: 0, videoCancel: null };

/**
 * The one-tap apps in columns of one width: as many as the widest label allows, then evened out so no row is left
 * short (9 apps in room for 4: 3 × 3, not 4 + 4 + 1). Called on opening and on every layout.
 */
function shareAppColumns() {
  const box = $('share-apps');
  const pills = [...box.children];
  if (!pills.length || !box.offsetWidth) return;
  box.classList.add('measure');
  const widest = Math.max(...pills.map((p) => p.offsetWidth));
  box.classList.remove('measure');
  const gap = parseFloat(getComputedStyle(box).columnGap) || 0;
  const fit = Math.floor((box.clientWidth + gap) / (widest + gap));
  box.style.setProperty('--cols', String(evenColumns(pills.length, fit)));
}

/** The words the share actions use: the picture's caption, or the video's (with its link line). */
function currentTexts() {
  if (shareState.format === 'video') return shareState.videoTexts;
  return shareState.format === 'challenge' ? shareState.challengeTexts : shareState.texts;
}
/** The Text format and the challenge: words and a link, no picture (drawn as the Text panel is). */
const isTextFormat = (f) => f === 'text' || f === 'challenge';
/** The hint under the apps for a challenge: its link carries the airport, score and level (SHARE_HINT is the picture's, below). */
const CHALLENGE_HINT = 'The link holds your airport, score, level, the weather at the start, the screen you played on and the game’s version: no name, location or flight numbers.';

/** The caption and title for the card and the video (the video's carries its link line, links.js). */
function refreshTexts() {
  shareState.texts = shareTexts(game.result);
  shareState.videoTexts = { title: shareState.texts.title, text: videoCaption(game.result, '') };
  // a friend's challenge (challenge.js): its words, and its link, when this game can be sent as one
  shareState.challengeTexts = game.result && game.result.challenge ? challengeTexts(game.result, '') : null;
}

async function drawShareCard() {
  const r = game.result;
  if (!r) return;
  if (shareState.format === 'video') return drawVideoPanel();
  // after the picture panel is put back: hideVideoPanel writes the picture's hint, so a challenge's own hint is set here (DECISIONS 417)
  hideVideoPanel();
  $('share-hint').textContent = shareState.format === 'challenge' ? CHALLENGE_HINT : SHARE_HINT;
  const token = ++shareState.token;
  const text = isTextFormat(shareState.format);
  $('share-text').hidden = !text;
  $('share-img').hidden = text;
  $('share-text').textContent = currentTexts().text;
  // a phone that can't save an image has no Save button; in Text there's no image to save, but the button keeps its
  // place (hidden by .off), so Share… beside it on a phone doesn't grow and push Copy text along under the finger
  $('btn-share-save').hidden = !sharing.canSave();
  document.querySelector('.share-go').classList.toggle('no-save', !sharing.canSave());
  $('btn-share-save').classList.toggle('off', text);
  if (text) return;
  const canvas = await renderCard(r, shareState.format);
  if (token !== shareState.token) return;
  shareState.canvas = canvas;
  $('share-img').src = canvas.toDataURL('image/png');
  $('share-img').alt = shareState.texts.text; // the caption doubles as the card's description
}

// ------------------------------------------------------------ the Video format (video.js, videoenc.js)

const SHARE_HINT = 'Only your airport, score and game stats are shared: no names, location or flight numbers.';
const VIDEO_HINT = 'Real flights keep their names and flight numbers, as in the game. Nothing is posted: you choose where it goes.';
const shareHint = () => document.querySelector('.share-side .hint');

/** Shows the Video format's words: the clip choices, the progress or the video, the share and save buttons, the hint. */
function drawVideoPanel() {
  const v = shareState.video;
  const ready = !!(v && v.ready && shareState.videoFor === game.video);
  const busy = shareState.videoBusy && !ready;
  const short = !game.video || !canMakeVideo(game.video.replay);
  $('share-img').hidden = true;
  $('share-clips').hidden = false;
  shareHint().textContent = VIDEO_HINT;
  $('btn-share-save').textContent = 'Save video';
  $('btn-share-save').hidden = !sharing.canSave();
  $('btn-share-save').classList.remove('off');
  document.querySelector('.share-go').classList.toggle('no-save', !sharing.canSave());
  $('btn-share-sheet').disabled = !ready;
  $('btn-share-save').disabled = !ready;
  document.querySelectorAll('#share-clips button').forEach((b) => {
    b.classList.toggle('on', b.dataset.clip === shareState.clip);
    b.disabled = short;
  });
  $('share-busy').hidden = !busy;
  const vid = $('share-vid');
  vid.hidden = !(ready && v.url);
  if (ready && v.url) {
    if (vid.dataset.src !== v.url) {
      vid.src = v.url;
      vid.dataset.src = v.url;
    }
    vid.play().catch(() => {});
  } else {
    vid.pause();
  }
  // the words where the video isn't: a game too short for one, a file the app keeps, or a clip that has not been chosen
  const note = short ? 'This game is too short for a video. Play a little longer to make one.'
    : ready ? (v.url ? '' : 'Your video is ready. Share… sends it; Save video keeps it in Movies.')
      : busy ? '' : 'Choose a clip to make your video.';
  $('share-text').textContent = note;
  $('share-text').hidden = !note;
}

/** Puts the picture panel back when another format is chosen. */
function hideVideoPanel() {
  $('share-clips').hidden = true;
  $('share-vid').pause();
  $('share-vid').hidden = true;
  $('share-busy').hidden = true;
  $('btn-share-save').textContent = 'Save image';
  $('btn-share-sheet').disabled = false;
  $('btn-share-save').disabled = false;
  shareHint().textContent = SHARE_HINT;
}

function setVideoProgress(p) {
  const pct = Math.max(0, Math.min(100, Math.round(p * 100)));
  $('share-busy-text').textContent = `Making your video… ${pct}%`;
  $('share-bar-fill').style.width = `${pct}%`;
}

/** Stops the clip being made (Cancel, another clip, another format, the panel closed). A made video stays until the clip changes. */
function cancelVideo() {
  // the clip being made reads its job number (makeVideoNow): a newer number means it is cancelled
  shareState.videoCancel = null;
  shareState.videoJob++;
  shareState.videoBusy = false;
  if (game.result && shareState.format === 'video') drawVideoPanel();
}

/** Makes the video for the chosen clip, unless it is made already for this game, or being made. */
function ensureVideo() {
  if (!game.result || !game.video || shareState.format !== 'video') return;
  if (!canMakeVideo(game.video.replay) || shareState.videoBusy) return drawVideoPanel();
  const v = shareState.video;
  if (v && v.ready && shareState.videoFor === game.video && v.clip === shareState.clip) return drawVideoPanel();
  makeVideoNow();
}

/**
 * A made clip goes: its URL is let go and, in the app, its file in the cache is deleted (GameBridge videoDelete). Called when a new
 * clip starts, and when the panel closes before the clip was shared or saved (a shared file stays until the next clip: the share
 * sheet may still read it).
 */
function dropClip(v) {
  if (!v) return;
  if (v.url) URL.revokeObjectURL(v.url);
  const bridge = videoBridge();
  if (bridge && v.id) bridge.videoDelete(v.id);
}

/**
 * The clip itself: the replay run again, the frames encoded, the music under it, the file kept (video.js). The progress is on the
 * panel and Cancel stops it. Nothing is shared here: the share and save buttons do that, when the player chooses.
 */
async function makeVideoNow() {
  const job = ++shareState.videoJob;
  // a clip stops when another job takes over, when it is cancelled, or when the share panel is closed (nothing runs behind it)
  const cancel = { get cancelled() { return job !== shareState.videoJob || !$('share').classList.contains('show'); } };
  shareState.videoCancel = cancel;
  const src = game.video;
  const clip = shareState.clip;
  const r = game.result;
  // the last clip is let go: its file in the app's cache and its URL (the cache keeps one clip at a time, video.js)
  dropClip(shareState.video);
  shareState.video = null;
  shareState.videoBusy = true;
  setVideoProgress(0);
  drawVideoPanel();
  const bridge = videoBridge();
  const id = `video-${job}-${Date.now().toString(36)}`;
  try {
    const res = await makeVideo({
      replay: src.replay, layout: src.layout, result: r, kind: clip, sur: src.sur, lighting: save.settings.lighting,
      facility: radio.facility, notes: src.notes, night: src.night, track: save.settings.musicTrack, music: !!save.settings.music,
      bridge, id, cancel, onProgress: (p) => { if (job === shareState.videoJob) setVideoProgress(p); },
    });
    if (job !== shareState.videoJob) {
      // a newer choice or a cancel took over: a file the app wrote for this clip goes with it
      if (bridge && !res.bytes) bridge.videoDelete(id);
      return;
    }
    let url = null;
    if (res.bytes) {
      // the app keeps the file in its cache (one go, now); the browser keeps the bytes for its share or download
      if (bridge && !stageBytes(bridge, id, res.bytes)) throw new Error('storage');
      url = URL.createObjectURL(new Blob([res.bytes], { type: 'video/mp4' }));
    }
    shareState.video = { id, ready: true, url, clip, bytes: bridge ? null : res.bytes, delivered: false };
    shareState.videoFor = src;
  } catch (e) {
    if (job !== shareState.videoJob) return;
    // a clip that did not get to the player (cancelled, or failed part-way, a part kept in the app's cache) leaves no file behind
    if (bridge) bridge.videoDelete(id);
    if (!(e instanceof VideoCancelled)) {
      // this phone can't make the video: the picture card instead, and the player is told why (a full phone: its storage)
      toast(e && e.message === 'storage' ? 'This phone is out of room for a video, so here is the picture.' : 'This phone can’t make a video just now, so here is the picture.', 3600, true);
      setFormat('feed');
    }
  } finally {
    if (job === shareState.videoJob) {
      shareState.videoBusy = false;
      shareState.videoCancel = null;
      if (shareState.format === 'video') drawVideoPanel();
    }
  }
}

/** Shares the made video: the app's share sheet or one app (with its caption), or the browser's share with the file. */
async function shareVideoNow(target) {
  const v = shareState.video;
  if (!v || !v.ready || shareState.videoFor !== game.video) return;
  // the caption names the game on Google Play, its link built for the app it goes to (links.js: the install referrer)
  const t = { title: shareState.videoTexts.title, text: game.result ? videoCaption(game.result, target) : shareState.videoTexts.text };
  if (PASTE_CAPTION.has(target) && sharing.native()) {
    toast(`Caption copied: paste it in ${APP_LABELS[target][0]}`, 2600, true);
    await new Promise((r) => setTimeout(r, 900));
  }
  const how = await deliver({ bridge: videoBridge(), id: v.id, bytes: v.bytes, mode: 'share', text: t.text, title: t.title, target });
  if (how === 'shared') v.delivered = true;
  if (how === 'failed') toast(APP_LABELS[target] ? `Couldn’t open ${APP_LABELS[target][0]}. Try Share… instead.` : 'Couldn’t open sharing on this phone.', 3200, true);
}

/** Saves the made video: to Movies in the app, a download in the browser. */
async function saveVideoNow() {
  const v = shareState.video;
  if (!v || !v.ready || shareState.videoFor !== game.video) return;
  const how = await deliver({ bridge: videoBridge(), id: v.id, bytes: v.bytes, mode: 'save' });
  if (how === 'saved') v.delivered = true;
  if (how === 'cancelled') return;
  toast(how === 'saved' ? (sharing.native() ? 'Saved to Movies' : 'Video downloaded') : 'Couldn’t save the video', 2400, true);
}

// the app couldn't open the share (Sharing.kt / GameBridge.shareImage): said, never a silent tap
window.HP_shareFailed = (target, what = '') => {
  const name = APP_LABELS[target] && APP_LABELS[target][0];
  if (what === 'picture') toast('Couldn’t attach the picture, so the caption went on its own.', 3200, true);
  else toast(name ? `Couldn’t open ${name}. Try Share… instead.` : 'Couldn’t open sharing on this phone.', 3200, true);
};
// these drop a shared caption: it goes on the clipboard (Sharing.kt), and the player is told before the app opens
const PASTE_CAPTION = new Set(['instagram', 'facebook']);

async function shareTo(target) {
  const t = currentTexts();
  if (!t || shareState.busy) return; // a double tap shares once
  shareState.busy = true;
  try {
    // the caption's Play link names the app it goes to (links.js: the install referrer), so each app gets its own caption
    if (shareState.format === 'video') await shareVideoNow(target);
    else await shareNow(game.result ? captionFor(game.result, target) : shareState.texts, target);
  } finally {
    shareState.busy = false;
  }
}

/** The caption for one app (or the share sheet, ''): a challenge's own words, with its link, else the picture's (links.js: each app's link). */
function captionFor(r, target) {
  return shareState.format === 'challenge' ? challengeTexts(r, target) : shareTexts(r, target);
}

async function shareNow(t, target) {
  if (PASTE_CAPTION.has(target) && sharing.native()) {
    toast(`Caption copied: paste it in ${APP_LABELS[target][0]}`, 2600, true);
    await new Promise((r) => setTimeout(r, 900));
  }
  if (isTextFormat(shareState.format) || !shareState.canvas) {
    if (target) sharing.textTo(t.text, t.title, target);
    else if ((await shareText(t.text)) === 'copied') toast('Copied to the clipboard', 2400, true);
    return;
  }
  const how = await sharing.image(shareState.canvas, t.text, t.title, target);
  if (how === 'copied') toast('Copied to the clipboard', 2400, true);
}

bind('btn-share', () => {
  openShare();
});
bind('btn-share-video', () => openShare('video'));
/** The share panel: the end card's Share (the format it was last on) or its Video (the Video format, made as it opens). */
function openShare(format = shareState.format) {
  if (!game.result) return;
  refreshTexts();
  shareState.canvas = null;
  // a recorded game has its Video; the demo and a game with no replay have none (the format is not offered). A friend's challenge is
  // offered when this game can be repeated (challenge.js)
  document.querySelector('#share-format [data-fmt="video"]').hidden = !game.video;
  document.querySelector('#share-format [data-fmt="challenge"]').hidden = !game.result.challenge;
  if (format === 'video' && !game.video) format = 'feed';
  if (format === 'challenge' && !game.result.challenge) format = 'feed';
  shareState.format = format;
  document.querySelectorAll('#share-format button').forEach((b) => b.classList.toggle('on', b.dataset.fmt === shareState.format));
  drawShareApps();
  drawShareCard();
  ensureVideo(); // the Video format makes its clip as the panel opens (nothing does unless it is that format)
  show('share');
  shareAppColumns();
}
/** The one-tap apps, one button each. A challenge's apps are only those whose captions can carry its link (links.js linkInCaption). */
function drawShareApps() {
  const apps = $('share-apps');
  apps.innerHTML = '';
  for (const key of sharing.targets()) {
    if (shareState.format === 'challenge' && !linkInCaption(key)) continue;
    const [label, colour] = APP_LABELS[key] || [key, '#888'];
    const b = document.createElement('button');
    b.innerHTML = '<i></i><span></span>';
    b.querySelector('i').style.background = colour;
    b.querySelector('span').textContent = label;
    b.addEventListener('pointerdown', () => press());
    b.addEventListener('click', () => shareTo(key));
    apps.appendChild(b);
  }
}
/** Changes the share panel's format: a picture, Text, a challenge, or the Video (made now, unless it is made). */
function setFormat(fmt) {
  if (fmt !== 'video') cancelVideo();
  shareState.format = fmt;
  document.querySelectorAll('#share-format button').forEach((o) => o.classList.toggle('on', o.dataset.fmt === fmt));
  drawShareApps();
  shareAppColumns(); // the apps are laid out again: a challenge has fewer of them
  drawShareCard();
  ensureVideo();
}
document.querySelectorAll('#share-format button').forEach((b) => {
  b.addEventListener('pointerdown', () => press());
  b.addEventListener('click', () => setFormat(b.dataset.fmt));
});
// the clip choices: a new choice makes the new clip (the one being made is cancelled)
document.querySelectorAll('#share-clips button').forEach((b) => {
  b.addEventListener('pointerdown', () => press());
  b.addEventListener('click', () => {
    if (b.dataset.clip === shareState.clip && shareState.video && shareState.video.ready) return;
    shareState.clip = b.dataset.clip;
    cancelVideo();
    ensureVideo(); // makes the new clip (the last one's file is let go there)
  });
});
bind('btn-share-cancel', () => cancelVideo());
bind('btn-share-sheet', () => shareTo(''));
bind('btn-share-copy', async () => {
  const t = currentTexts();
  if (!t) return;
  if ((await sharing.copy(t.text)) === 'copied' && !sharing.native()) toast('Copied to the clipboard', 2400, true);
});
bind('btn-share-save', async () => {
  if (shareState.format === 'video') return saveVideoNow();
  if (!shareState.canvas) return;
  const how = await sharing.save(shareState.canvas);
  toast(how === 'saved' ? 'Saved to Photos' : 'Couldn’t save the image', 2400, true);
});
// the phone's voice settings open the system's Settings: that leaves the game
bind('btn-voice-settings', () => speech.openSettings());
bind('btn-settings', () => {
  // a failed or lost speech engine gets another try, and the status line catches up
  if (radio.voice) speech.init();
  showVoiceStatus();
  watchVoiceStatus();
  // OpenSky API client fields: hidden for now (see index.html)
  // $('os-id').value = save.settings.osClientId || '';
  // $('os-secret').value = save.settings.osClientSecret || '';
  // $('os-status').textContent = save.settings.osClientId ? 'Signed-in polling: every 15 s.' : 'Anonymous polling: once a minute.';
  renderSettings(); // the Short Final Pro row (propay.js)
  renderFeedLines(); // the Settings line is the saved check as it is now (the check runs on the home screen, not here)
  show('settings');
});
/** About: the version and its text (the Achievements and Leaderboards screens are their own). */
function openAbout() {
  $('about-version').textContent = appVersion(); // 'Version 2.0'
  $('about-pro').textContent = ABOUT_PRO_LINE; // the one line on Pro (pro.js)
  show('about');
}
bind('btn-about', () => openAbout());
/** Settings closes by saving and re-reading what it shows (the OpenSky fields are hidden for now: index.html). */
function closeSettings() {
  saveSettings();
  applySettings();
  show('settings', false);
}
// the screens Back closes, newest open first (screenstack.js): what closing each one does
const shown = (id) => () => $(id).classList.contains('show');
register('feed', closeFeed, shown('feed'));
register('pause', resumeGame, shown('pause'));
register('confirm', closeConfirm, shown('confirm'));
register('slow', closeSlowSky, shown('slow'));
// the two sheets' words come from skysky.js (one source, the tests read it there)
$('slow-kicker').textContent = SLOW_SHEET.kicker;
$('slow-title').textContent = SLOW_SHEET.title;
$('slow-body').textContent = SLOW_SHEET.body;
$('slow-note').textContent = SLOW_SHEET.note;
$('btn-slow-add').textContent = SLOW_SHEET.add;
$('btn-slow-keep').textContent = SLOW_SHEET.keep;
register('share', () => {
  // the panel shut: a made clip nobody shared or saved goes (a shared one stays until the next clip)
  const v = shareState.video;
  if (v && v.ready && !v.delivered) {
    shareState.video = null;
    dropClip(v);
  }
  show('share', false);
}, shown('share'));
register('settings', closeSettings, shown('settings'));
register('about', () => show('about', false), shown('about'));
register('pro-sheet', () => show('pro-sheet', false), shown('pro-sheet'));

// ------------------------------------------------------------ first launch (gate.js, profile.js)
/** Play Games runs only for a 13+ player who agreed at the current terms (profile.js canPlayGames). */
const pgsAllowed = () => canPlayGames(save, clockNow());

// Cloud save (cloud.js; DECISIONS 363): the copy in Play Games, for a 13+ player who agreed and is signed in. The save is merged,
// and remote progress comes in only at home (inGame: the game holds the save's maps while it is on).
const cloudDeps = {
  getSave: () => save,
  writeSave: (s) => writeSave(s),
  canSync: () => pgsAllowed() && playGames.enabled() && playGames.status() === 'signed-in',
  inGame: () => game.state !== 'menu', // loading, play, paused and the end card: the game holds the save's maps
  changed: () => { renderSettingsNotes(); pushReminder(); }, // a streak or week from another phone reaches the shell's reminders too
};

// Google Play Games (3.0): the Settings row follows the sign-in state live (the screens follow it in screens.js); its one Sign in button is
// the player's own tap (a failure after it is said, HP_pgs)
onPlayGamesState(() => {
  if (booted) renderSettingsNotes();
});
bind('btn-pgs-signin', () => playGames.signInTapped());
// The reminders (reminder.js; DECISIONS 362 and 392): the shell keeps what its two alarms need, and posts at most one notice a day. A
// 13-and-up player who agreed has them (canPlayGames): an on switch alone is not enough, so a player who must agree again gets none
// (homeOpened pushes again once the Agree is given).
const REMINDER_SAVE = { daily: 'dailyReminder', streak: 'streakSaver', recap: 'weeklyRecap' };
function pushReminder() {
  if (WEB_DEMO) return; // the demo has no reminders (DECISIONS 446)
  const ok = canPlayGames(save, clockNow());
  const s = save.settings;
  const week = save.weekRecap;
  // the weekend event's words for the 9 am notice (reminder.js dailyNoticeText): this weekend's Saturday (0 on a weekday), its theme's
  // title, and the last weekend flown; the shell uses them only while the weekend is today's and not flown
  const wk = weekendOf(db.localDay(new Date()));
  dailyReminder.write({
    on: { daily: ok && !!s.dailyReminder, streak: ok && !!s.streakSaver, recap: ok && !!s.weeklyRecap },
    played: save.daily && save.daily.n ? save.daily.n : 0,
    streakLast: save.streak.last || 0,
    streakCount: save.streak.count,
    weekStart: week.start,
    weekLanded: week.landed,
    weekBest: week.best,
    weekAt: week.at,
    weekend: { w: wk || 0, title: wk !== null ? themeOf(wk).title : '', flown: save.weekend ? save.weekend.w : 0 },
  });
}
const anyReminderOn = () => Object.values(REMINDER_SAVE).some((key) => !!save.settings[key]);
/** Saves the switches of these kinds at once, and tells the shell (its alarms follow them). */
function setReminders(kinds, on) {
  for (const k of kinds) save.settings[REMINDER_SAVE[k]] = on;
  saveSettings();
  pushReminder();
  applySettings();
}
// the kinds the phone's notification question is asked for: its answer turns on exactly these (window.HP_reminderAnswer)
let reminderAsking = [];
/** Turns the kinds on: at once when the phone allows notifications, else after the phone's question (reminder.js reminderNote). */
function askReminders(kinds) {
  reminderDenied = false;
  if (dailyReminder.allowed()) setReminders(kinds, true);
  else {
    reminderAsking = kinds;
    dailyReminder.ask(); // the answer comes back as window.HP_reminderAnswer
  }
  renderSettingsNotes();
}
/** A reminder's switch: on or off, saved at once. Turning one on for the first time asks the phone's notification question. */
function toggleReminder(kind) {
  if (!dailyReminder.native()) return haptic('tick'); // in a browser the switch says why (the line under it)
  if (save.settings[REMINDER_SAVE[kind]]) {
    reminderDenied = false;
    return setReminders([kind], false);
  }
  // 13 and up, agreed (the same rule as the rest of the online features); a player who has not is not offered the reminders
  if (!canPlayGames(save, clockNow())) return;
  askReminders([kind]);
}
bind('btn-reminder', () => toggleReminder('daily'));
bind('btn-streak-saver', () => toggleReminder('streak'));
bind('btn-weekly-recap', () => toggleReminder('recap'));
// the phone's answer to the notification question: on for the kinds asked, or the switches stay off with a note (reminder.js reminderNote)
window.HP_reminderAnswer = (allowed) => {
  const kinds = reminderAsking.length ? reminderAsking : ['daily'];
  reminderAsking = [];
  reminderDenied = !allowed;
  if (allowed) setReminders(kinds, true);
  else renderSettingsNotes();
};
// The one-time card (DECISIONS 392): after the second day played or the first daily challenge finished, never on the first launch's day, at
// most twice in all, and only over the home screen (never in a game, never over another screen). Yes turns the reminders on and asks the
// phone; Not now (or Back) keeps the card's record, so the second showing waits a week.
function maybeOfferReminders() {
  if (!booted || game.state !== 'menu' || gateState(save, clockNow()) !== 'home' || openScreens().length) return;
  if (WEB_DEMO) return; // the demo has no reminder card (DECISIONS 446)
  const today = db.localDay(new Date());
  const due = offerDue({
    offer: save.reminderOffer,
    today,
    firstDay: save.pro ? save.pro.first : 0,
    secondDay: !!save.review && save.review.second !== null,
    dailyDone: !!save.daily,
    anyOn: anyReminderOn(),
    native: dailyReminder.native(),
    canPlay: canPlayGames(save, clockNow()),
  });
  if (!due) return;
  save.reminderOffer = offerShown(save.reminderOffer, today);
  writeSave(save);
  show('reminder-offer');
}
bind('btn-reminder-yes', () => {
  show('reminder-offer', false);
  askReminders(['daily', 'streak', 'recap']);
});
bind('btn-reminder-later', () => show('reminder-offer', false));
register('reminder-offer', () => show('reminder-offer', false), shown('reminder-offer'));

/**
 * The reminder's tap (MainActivity, DailyReminder.kt): starts today's daily from the home screen, as the Streak screen's daily
 * button does. A tap that comes before the home screen is up waits for boot, as a link does (dailyWaiting, takeDaily). It does
 * nothing during a game, or before the age gate has been passed.
 */
// a reminder's tap, until the home screen takes it. A tap that started the app comes in the page's address (MainActivity:
// ?open=daily), so boot knows it before the home screen shows; the address is put back at once, so a reload does not open it again
let dailyWaiting = new URLSearchParams(location.search).get('open') === 'daily';
if (dailyWaiting) history.replaceState(null, '', location.pathname);
if (WEB_DEMO) dailyWaiting = false; // the demo has no daily (DECISIONS 446)
window.HP_openDaily = () => {
  dailyWaiting = true;
  if (booted) takeDaily();
};
async function takeDaily() {
  if (!dailyWaiting) return;
  dailyWaiting = false;
  let started = false;
  try {
    if (game.state === 'menu' && gateState(save, clockNow()) === 'home') {
      const today = db.todaysDaily();
      const info = await db.getAirport(today.airport[0]);
      if (info && game.state === 'menu') {
        for (const id of openScreens()) closeScreen(id); // a sheet open on the home (Settings, Boards…) closes, as the Streak screen's daily does
        startAirport(info, { daily: today.n }); // the menu is hidden before this returns (startAirport's first step)
        started = true;
      }
    }
  } catch (e) {
    console.warn('daily', e);
  } finally {
    // the home screen held back for the tap (boot) stays hidden behind the daily, and comes up, with its backdrop, if the daily
    // did not start (the gate, no airport, or the airport list failed)
    const menu = $('menu');
    if (menu.classList.contains('quiet')) {
      menu.classList.remove('quiet');
      if (!started && game.state === 'menu') startAttract();
    }
  }
}
/**
 * The home screen after the gate (13 and up, agreed): the live feed check, the boards' open state (read once a day) and the
 * queued scores. Nothing leaves the phone before this, so the age answer and Agree come first.
 */
function homeOpened() {
  pushReminder(); // the alarm follows the terms as they are now: after an Agree the reminder is armed again (pushReminder)
  if (WEB_DEMO) return; // the demo's home asks nothing and queues nothing (DECISIONS 446)
  runFeedCheck('home');
  const wasLive = boardsLive();
  refreshBoardsLive().then((live) => { if (live && !wasLive) flushOutbox(); if (live) refreshHomeWorld(); }).catch(() => {});
  flushOutbox();
  askFirstDayNow();
  maybeOfferReminders();
}

// ------------------------------------------------------------ the trial across a reinstall (2.8; DECISIONS 332)
// The phone's device hash goes to the Worker with the phone's first day, once the age question is answered (homeOpened runs only
// after the gate has passed). The answer comes back in the background and never holds up play: a failed ask is tried again in
// ten minutes. The trial uses the earlier of the two days (applyFirstDay). A browser or the sideload build has no hash: nothing is asked.
let firstDayDone = false, firstDayTimer = 0;
function askFirstDayNow() {
  if (firstDayDone || !save || !save.pro) return;
  clearTimeout(firstDayTimer);
  const hash = deviceHash();
  if (!hash) {
    firstDayDone = true;
    return;
  }
  askFirstDay({ api: makeApi(), hash, first: save.pro.first }).then((r) => {
    if (r.status === 'done') {
      firstDayDone = true;
      const next = applyFirstDay(save.pro, r.first);
      if (next !== save.pro) {
        save.pro = next;
        writeSave(save);
      }
    } else if (r.status === 'skipped') {
      firstDayDone = true;
    } else {
      firstDayTimer = setTimeout(askFirstDayNow, FIRST_DAY_RETRY_MS);
    }
  });
}
initGate({ getSave: () => save, press, onHome: homeOpened });
initLegal();

document.querySelectorAll('[data-close]').forEach((el) => {
  el.addEventListener('pointerdown', () => press());
  el.addEventListener('click', () => {
    const id = el.closest('.screen').id;
    closeScreen(id);
    show(id, false);
  });
});
document.querySelectorAll('.toggle[data-setting]').forEach((el) => {
  el.addEventListener('pointerdown', () => audio.unlock());
  el.addEventListener('click', () => {
    const k = el.dataset.setting;
    // Beginner and real planes only have no departures: the switch rests greyed out, and a tap says why
    if (k === 'departures' && (save.settings.difficulty === 'beginner' || save.settings.realPlanesOnly)) {
      flashNote($('dep-note'));
      haptic('tick');
      return;
    }
    save.settings[k] = !save.settings[k];
    // switched on again: the Keep run and the sheet's quiet start afresh (skysky.js; the same as setRealPlanesOnly in play)
    if (k === 'realPlanesOnly' && save.settings.realPlanesOnly) save.slowSky = { ...KEEP_RUN_START };
    // voices are spoken radio calls: turning them on turns the radio chatter on too
    if (k === 'voice' && save.settings.voice) save.settings.radio = true;
    saveSettings();
    applySettings();
    if (k === 'voice' || k === 'radio') watchVoiceStatus(); // the voices may be starting up
    audio.play('toggle', save.settings[k]);
    if (k === 'haptics' && save.settings[k]) haptic('click');
  });
});
document.querySelectorAll('.seg[data-setting]').forEach((seg) => {
  seg.querySelectorAll('button').forEach((b) => {
    b.addEventListener('pointerdown', () => press());
    b.addEventListener('click', () => {
      save.settings[seg.dataset.setting] = b.dataset.v;
      saveSettings();
      applySettings();
    });
  });
});
// the Music track list: a tap saves the choice at once (applySettings switches a track that is playing at its next bar)
buildTrackList();
const trackList = $('track-list');
trackList.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.track-row')) press();
});
trackList.addEventListener('click', (e) => {
  const row = e.target.closest('.track-row');
  if (!row) return;
  save.settings.musicTrack = row.dataset.v;
  saveSettings(); // a save that fails says so (settingNotSaved), like every other setting
  applySettings();
});
// arrow keys move and choose, as in a radio group (the click above saves the choice)
trackList.addEventListener('keydown', (e) => {
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
  const rows = [...trackList.children];
  const at = rows.indexOf(document.activeElement);
  if (!step || at < 0) return;
  e.preventDefault();
  const next = rows[(at + step + rows.length) % rows.length];
  next.focus();
  next.click();
});
let resetArmed = 0;
bind('btn-reset', () => {
  const el = $('btn-reset');
  if (Date.now() - resetArmed < 3000) {
    const keep = save.settings;
    const proDays = save.pro;
    const review = save.review;
    const age = save.profile; // the age answer stays: it is not progress, and Reset is no way to answer again (profile.js)
    const session = save.session; // the sign-in stays, so Remove my scores still reaches the scores already on our server
    cancelOutbox(); // a post still in flight writes nothing back over the reset progress (outbox.js)
    save = resetSave();
    save.settings = keep;
    save.pro = proDays; // the first run and the day count stay: Reset is no way to a new free trial (pro.js)
    save.review = review; // the rating request's counts and days stay too (review.js): Reset is no way to a new ask
    save.lastPlayed = savedPickOf(picked); // the home pick is a choice, not progress: it stays, on the page and after a restart
    save.profile = age;
    clearAgreement(save); // the Agree goes, so the terms are agreed again
    save.session = session;
    writeSave(save);
    playGames.setAllowed(false); // Play Games stops until the age is answered again
    el.textContent = 'Reset progress';
    resetArmed = 0;
    closeScreen('settings');
    showFeatured();
    checkGate(save); // Agree again, over the home screen (the age answer is kept, so no age question)
    flushOutbox(); // with the queue empty: the replays Reset cleared are swept from the store (outbox.js)
    resetCloud(); // the copy in Play Games goes too, so a sign-in later does not bring the reset progress back (cloud.js)
    pushReminder(); // the reminder's switch is kept (the settings stay), and the played day is cleared with the progress
  } else {
    resetArmed = Date.now();
    el.textContent = 'Tap again to reset scores';
    setTimeout(() => (el.textContent = 'Reset progress'), 3000);
  }
});
document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });

// Android back button / lifecycle (called from MainActivity).
window.HP_onBack = () => {
  // the newest open screen goes first (screenstack.js): the feed, the share panel, Settings, About, a confirm, the pause card
  if (backOne()) return 'handled';
  if (game.state === 'loading') {
    $('btn-cancel-load').click();
    return 'handled';
  }
  if (game.state === 'play') {
    if (game.crashT < 0) pauseGame();
    return 'handled';
  }
  if (game.state === 'paused') {
    resumeGame();
    return 'handled';
  }
  if (game.state === 'over') {
    showMenu();
    return 'handled';
  }
  if ($('search').value || $('menu').classList.contains('searching')) {
    clearSearch();
    return 'handled';
  }
  return 'exit';
};
window.HP_onPause = () => {
  if (game.state === 'play' && game.crashT >= 0) gameOver();
  pauseGame();
  speech.stop();
  audio.suspend();
  awaySince = awaySince || Date.now(); // the time away is read on the return (HP_onResume)
  flushCloudSave(); // the progress goes to Play Games before the app is left (cloud.js; it writes, and brings nothing into a game)
};
/**
 * Google Play Games' state, on every change: checking, signed in or out, unknown (a call that failed), off (the shell tells each one).
 * The buttons and lines follow it live (screens.js, the Settings row and the cloud line); the one sign-in offer is asked here, on a
 * definite answer (gate.js); a sign-in the player tapped that failed says so, once (a box closed without signing in does not); and
 * signed in catches the progress up.
 */
window.HP_pgs = (state) => {
  playGamesChanged(state);
  if (takeSignInOffer(state, pgsAllowed())) playGames.signIn(); // Google's account box, asked once by itself (gate.js)
  if (state === 'signed-in' || state === 'signed-out' || state === 'unknown') {
    const tapped = playGames.takeTapped(); // a sign-in the player asked for has its answer now
    if (tapped && state === 'unknown') toast(PGS_FAILED);
  }
  // Play Games is only touched for a 13+ player who agreed (profile.js); a player who has not agreed never sees its buttons
  const on = pgsAllowed() && playGames.enabled();
  if (state !== 'signed-in' || !on) return;
  for (const a of ACHIEVEMENTS) if (save.ach && save.ach[a.id] && !a.local) playGames.unlock(a.name);
  // the cloud copy first (cloud.js): the other phones' progress comes in, so the catch-up sends the merged bests
  const catchUp = () => {
    // the catch-up: each level's best ranked score at any airport, and the ranked passengers (boards.js)
    const c = catchUpPayload(save);
    for (const level of LEVEL_ORDER) playGames.submit(`leaderboard_best_score_${level}`, c.levels[level]);
    playGames.submit('leaderboard_passengers_landed', c.passengers);
    flushOutbox(); // a sign-in also lets the queued games post
  };
  syncCloud({ apply: true }).then(catchUp, catchUp);
};
// the end card's Leaderboard button: the airport and level of that game (the daily's own tab)
bind('btn-over-board', () => {
  const ap = game.airport;
  if (!ap || !game.ranking) return;
  if (ap.weekend) openBoards({ tab: 'weekend' });
  else if (ap.daily) openBoards({ tab: 'daily' });
  else openBoards({ icao: ap.info.icao, level: easiestOf(game.ranking.levels) || game.director.diff, tab: 'world' });
});

window.HP_onResume = () => {
  audio.resume();
  const pgsNow = playGames.status(); // a check that said signed out, or failed, is asked again (the one offer, the buttons)
  if (pgsAllowed() && (pgsNow === 'signed-out' || pgsNow === 'unknown')) playGames.check();
  checkGate(save); // a player who turned 13 while the app was away is asked to agree (profile.js gateState)
  // a return after 10 minutes away checks the live feed once (feedcheck.js); the second resume call finds awaySince cleared
  const awayMs = awaySince ? Date.now() - awaySince : 0;
  awaySince = 0;
  runFeedCheck('resume', awayMs);
  lastFrame = performance.now();
  // the speech engine may have been updated or killed while we were away
  if (radio.voice) speech.init();
  flushOutbox();
  syncCloud({ apply: true }); // another phone's progress, when it came while this one was away (cloud.js; a no-op when signed out)
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) window.HP_onPause();
  else {
    window.HP_onResume();
    renderStreakCorner(); // the day may have changed while the app was away
    if (WEB_DEMO) syncPlayButton(); // the demo's pill follows the day too (demoRedrawAtMidnight, which a sleeping phone may have missed)
  }
});
// the streak's state changes at local midnight: the home corner follows it while the home screen is up
setInterval(() => {
  if ($('menu').classList.contains('show')) renderStreakCorner();
}, 60 * 1000);
window.addEventListener('resize', () => layout());
// the home screen's feed line: a tap checks again (feedcheck.js; the press tick is the button's, as the other buttons')
$('home-feed').addEventListener('pointerdown', () => press());
$('home-feed').addEventListener('click', () => runFeedCheck('tap'));
// the connection is back: an offline live feed tries again at once, not after its backoff
window.addEventListener('online', () => {
  if (game.airport && game.airport.feed) game.airport.feed.retryNow();
  flushOutbox();
  syncPlayButton(); // Play now is a real game again (no internet ends)
  runFeedCheck('home'); // and the home line follows: the saved no-internet record is replaced by a new check
});
// the phone lost its connection on the home screen: Play now becomes the recorded game (Unranked) at once
window.addEventListener('offline', () => syncPlayButton());

// -------------------------------------------------------- event handling

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** The name of the runway end a plane lands on at zone z: its active end, or the far end it is locked on (sim.landGeometry). */
function landEndIdent(sim, a, z) {
  if (!z) return null;
  if (z.kind !== 'runway') return z.activeIdent;
  const g = sim.landGeometry(a, z);
  return g === z ? z.activeIdent : g.ident;
}

/**
 * The play streak's day (streak.js), counted once a game, at its first landing: the save is written at once, and the day shows
 * on the Streak screen and the corner without waiting for the end card. A first landing that completes today says so on the
 * field. The end card reads game.streakNote for its lines (the milestone, and whether an earlier game today had counted it).
 */
function countStreakDay() {
  if (game.streakNote) return;
  if (WEB_DEMO) return; // the demo keeps no streak (DECISIONS 446)
  const today = db.localDay(new Date());
  const countedBefore = save.streak.last === today;
  const milestone = recordPlayed(save.streak, today);
  game.streakNote = { countedBefore, milestone };
  writeSave(save);
  pushReminder(); // the streak's day is the shell's at once (the streak saver reads it at 7 pm, reminder.js)
  if (!countedBefore && game.sim) {
    const n = save.streak.count;
    fx.text(game.sim.W / 2, 112, n === 1 ? '🔥 Streak started: day 1' : `🔥 Streak: day ${n} done`, '#ffe39a', 18, 2.2, { centre: 2 });
  }
}

function handleEvents(events) {
  const sim = game.sim;
  if (sim.demo) return;
  // after the crash the sim runs on in slow motion behind the end card: keep it quiet
  if (game.state !== 'play' || sim.over) events = events.filter((ev) => ev.kind === 'crash');
  if (game.ach && game.state === 'play') {
    const env = { sim, night: game.night || 0, precip: !!(game.sky && game.sky.precip), storm: !!(game.weather && game.weather.storms.length) };
    for (const ev of events) for (const got of game.ach.event(ev, env)) earnAchievement(got);
  }
  // the game minute by minute, for the share card's row of squares
  if (game.timeline && game.state === 'play') {
    for (const ev of events) {
      const k = { land: 'landed', nearMiss: 'trouble', runwayBusy: 'trouble', knocked: 'trouble', emergency: 'trouble', crash: 'crash' }[ev.kind];
      if (!k) continue;
      const m = Math.max(0, Math.floor(sim.time / 60));
      const slot = (game.timeline[m] = game.timeline[m] || { landed: 0, trouble: 0, crash: 0 });
      slot[k]++;
    }
  }
  for (const ev of events) {
    switch (ev.kind) {
      case 'spawn':
        // a real plane has appeared: its airline's route file is asked for now, so the arrival note is ready when it lands (routes.js).
        // The recorded game (no internet) asks for none: its traffic is a recording, and it shows no notes.
        if (!(game.airport && game.airport.demo)) askForRoute(ev.aircraft, game.spots ? game.spots.get(ev.aircraft.flightId) : null);
        break;
      case 'warn':
        audio.play('warn');
        break;
      case 'lock': {
        audio.play('lock');
        haptic('click');
        const z = ev.zone;
        // a runway is locked on the end the plane lands on: the active one, or the far one for some engine-out planes
        const g = z.kind === 'runway' ? sim.landGeometry(ev.aircraft, z) : z;
        const x = z.kind === 'pad' ? z.cx : z.kind === 'exit' ? z.x : g.thx;
        const y = z.kind === 'pad' ? z.cy : z.kind === 'exit' ? z.y : g.thy;
        fx.ring(x, y, hexToRgb(ZONE_COLORS[CLASSES[ev.aircraft.cls].color].light), 46, 0.6, 3);
        // who lands before us on that runway (by time to the threshold), nearest the threshold first
        const eta = (o) => (o.state === 'landing' ? -1 : ((o.path.length - o.pathIdx) * TUNING.pathMinSpacing) / (CLASSES[o.cls].speed * (o.speedMul || 1)));
        const mine = eta(ev.aircraft);
        const ahead = z.kind === 'runway'
          ? sim.aircraft.filter((o) => o !== ev.aircraft && o.target === z.id && (o.state === 'fly' || o.state === 'landing') && !o.departure && eta(o) < mine)
            .sort((p, q) => eta(p) - eta(q))
          : [];
        // an engine-out or low-fuel plane locked on the other end from the one it was named for: the tower says the runway changed
        radio.cleared(ev.aircraft, z, windWords(), ahead, landEndIdent(sim, ev.aircraft, z), z.kind === 'runway' && endChanged(ev.aircraft, z.id));
        // catching up the aircraft in front on the same final is a classic way to lose one
        const lead = ahead[ahead.length - 1];
        if (lead && lead.state === 'fly' && CLASSES[ev.aircraft.cls].speed > CLASSES[lead.cls].speed * 1.1 && mine - eta(lead) < 8) {
          fx.text(ev.aircraft.x, ev.aircraft.y - 24, 'Faster than the aircraft ahead: give it room', '#ffcf6e', 15, 2.6);
          haptic('double');
        }
        if (game.hint && game.hint.aircraft === ev.aircraft) game.hint = null;
        break;
      }
      case 'unlock':
        haptic('double');
        fx.text(ev.aircraft.x, ev.aircraft.y - 22, 'Runway closed!', '#ff9b84', 13, 1.4);
        break;
      case 'land': {
        audio.play('land', ev.combo);
        haptic('click');
        const c = ZONE_COLORS[CLASSES[ev.aircraft.cls].color];
        fx.text(ev.aircraft.x, ev.aircraft.y - 18, `+${ev.gain}`, c.light, 20, 1.1, { arc: true });
        if (ev.aircraft.emergency) fx.text(ev.aircraft.x, ev.aircraft.y - 38, ev.aircraft.emergency.type === 'medevac' ? (ev.bonus ? 'Medevac first!' : 'Medevac') : 'Safe landing!', '#ffd2c8', 12, 1.4);
        // a real plane's landing has no word of its own: its flight number and red dot are its one look (DECISIONS 164a)
        if (ev.streak >= 5 && ev.streak % 5 === 0) {
          setTimeout(() => audio.play('fanfare'), 200);
          haptic('heavy');
          fx.text(sim.W / 2, 150, `${ev.streak} clean landings in a row!`, '#ffe39a', 24, 1.8, { centre: 2 });
        } else if (sim.landed > 0 && sim.landed % 10 === 0) {
          setTimeout(() => audio.play('fanfare'), 250);
          haptic('heavy');
          fx.text(sim.W / 2, 150, `${sim.landed} landed!`, '#ffe39a', 30, 1.6, { centre: 2 });
        }
        // the game's first landing counts today for the play streak at once, so the streak shows it straight away, and a game
        // left from the pause card counts too (the owner's report: the day did not fill in until a game ended)
        if (sim.landed >= 1) countStreakDay();
        // the week's record for the Sunday recap (reminder.js weekAfterLanding, DECISIONS 392): one more plane, and the game's count when it is the week's best
        save.weekRecap = weekAfterLanding(save.weekRecap, db.localDay(new Date()), { gameLanded: sim.landed, at: db.cityName(game.airport.info.city) });
        pushReminder(); // each landing reaches the shell, so the recap counts a game left mid-way or ended by the phone
        if (game.tutorial && !save.tutorialDone) {
          save.tutorialDone = true;
          writeSave(save);
          setTimeout(() => toast('Nice! Red aircraft land on red runways, yellow on yellow. Tap a plane to make it circle.', 4500), 400);
        }
        break;
      }
      case 'touchdown': {
        audio.play('touchdown');
        if (ev.aircraft.cls === 'narrowbody' || ev.aircraft.cls === 'heavy') audio.play('reverse');
        const a = ev.aircraft;
        const px = -Math.sin(a.heading), py = Math.cos(a.heading);
        // tyre smoke off each main gear; bigger aircraft, bigger puffs
        const k = CLASSES[a.cls].size / 24;
        for (const s of [-1, 1]) fx.puff(a.x + px * s * 5 * k, a.y + py * s * 5 * k, 3 + Math.round(2 * k), { speed: 8, r: 2.5 * k, grow: 9 * k, life: 0.7 + 0.3 * k, alpha: 0.6 });
        if (!reducedMotion()) {
          fx.ring(a.x, a.y, '255,246,200', 40, 0.5, 3);
          fx.glow(a.x, a.y, 40, '255,236,170', 0.5);
        }
        if (a.target != null) radio.touchdown(a, sim.zone(a.target), sim.landed);
        // a real plane whose route ends at this airport says where it came from (routes.js); a simulated plane never does
        const note = game.airport && game.airport.demo ? '' : arrivalNote(a, game.airport && game.airport.info ? game.airport.info.icao : '');
        if (note) renderer.noteArrival(a, note, sim.time);
        if (note) game.arrivals.set(a.id, note); // kept for the video's copy of this touchdown (video.js notes)
        break;
      }
      case 'hold':
      case 'loop':
        if (ev.aircraft) radio.hold(ev.aircraft);
        audio.play('hold');
        haptic('double');
        break;
      case 'release':
        audio.play('click');
        haptic('tick');
        break;
      case 'nearMiss': {
        audio.play('nearMiss');
        haptic('double');
        fx.addShake(3.5);
        // the shockwave sits on the pair itself: the midpoint of the two positions at their closest approach (sim.js)
        const mx = (ev.a.x + ev.b.x) / 2, my = (ev.a.y + ev.b.y) / 2;
        fx.ring(mx, my, '255,255,255', 70, 0.5, 3);
        if (!reducedMotion()) fx.ring(mx, my, '255,120,100', 52, 0.5, 2);
        fx.text(sim.W / 2, 90, ev.streak >= 3 ? `Close call! Streak of ${ev.streak} lost` : 'Close call!', '#ffe39a', 18, 1.2, { centre: 0 });
        break;
      }
      case 'crash': {
        audio.play('crash');
        haptic('crash');
        const cols = ev.who.map((a) => ZONE_COLORS[CLASSES[a.cls].color].main);
        fx.explosion(ev.x, ev.y, [...cols, '#f6f1e4', '#3a3a3a']);
        game.crashT = 0;
        game.camera.fx = ev.x;
        game.camera.fy = ev.y;
        releaseAllPointers();
        game.hint = null;
        game.crashHold = game.bullet && game.bullet.canRewind() ? 3 : 1.45;
        if (game.crashHold > 2) toast('Tap ⏪ to rewind 5 seconds', 2600);
        break;
      }
      case 'windWarning':
        radio.windShift(ev.ident);
        audio.play('prox');
        haptic('double');
        // the banner counts it down and the tower announces it: no toast on top
        break;
      case 'notYet':
        fx.text(ev.aircraft.x, ev.aircraft.y - 22, ev.text, '#ffe39a', 16, 2);
        haptic('double');
        break;
      case 'noHold': // an engine-out or low-fuel plane may not circle or hold: the note says so at the plane, in the why-not colour
        // its text never goes below the top of the radio ticker while it shows (capY: the note is a screen-space cap, not a world offset)
        fx.text(ev.aircraft.x, ev.aircraft.y - 22, ev.text, '#ffd2c8', 16, 2.6, { capY: renderer.radioBox ? renderer.radioBox.y - 8 : null });
        haptic('double');
        break;
      case 'noLand': {
        const msg = { closed: 'Runway closed', small: 'Wrong colour: match the aircraft to its runway', heli: 'Helicopters land on the H pad', short: 'Too short: it needs the longest runway', wrongEnd: 'Land at the end with the arrows', align: 'Line up with the runway' }[ev.reason];
        if (msg) fx.text(ev.x, ev.y - 16, msg, '#ffd2c8', 18, 2.6);
        // and which runway said no
        if (ev.zone) fx.ring(ev.zone.cx, ev.zone.cy, '255,120,100', Math.max(30, ev.zone.length / 2), 0.7, 3);
        haptic('double');
        break;
      }
      case 'rushSoon': // the heads-up, five seconds before a push (gameplay R10): the banner says it until the push
        game.rushSoon = { sim, at: ev.at };
        break;
      case 'bank':
        radio.bank(ev.phase);
        if (ev.phase === 'push') audio.play('warn'); // the banner says "Arrival rush"
        break;
      case 'stack':
        radio.stack(ev.aircraft, ev.fix.name, ev.level);
        audio.play('lock');
        haptic('click');
        fx.text(ev.fix.x, ev.fix.y - 24, `Holding at ${ev.fix.name} · ${(5 + ev.level).toLocaleString('en-US')},000 ft`, '#fff1c4', 12, 1.4);
        break;
      case 'rwyClosing':
        radio.runwayClosing(ev.zone.activeIdent, ev.reason, ev.secs);
        audio.play('warn');
        // the banner counts it down and the tower announces it: no toast on top
        break;
      case 'rwyClosed':
        radio.runwayClosed(ev.zone.activeIdent);
        haptic('double');
        break;
      case 'rwyOpen':
        radio.runwayOpen(ev.zone.activeIdent, ev.cancelled);
        audio.play('lock');
        if (!ev.cancelled) fx.text(ev.zone.cx, ev.zone.cy, `Runway ${ev.zone.activeIdent} open`, '#c9f2a8', 14, 1.6);
        break;
      case 'windShift':
        audio.play('nearMiss');
        haptic('heavy');
        fx.text(sim.W / 2, 120, 'Wind shift! Runways flipped', '#ffe39a', 18, 2, { centre: 1 });
        break;
      case 'knocked':
        audio.play('nearMiss');
        haptic('double');
        fx.addShake(3);
        fx.text(ev.aircraft.x, ev.aircraft.y - 22, ev.why === 'wake' ? 'Wake turbulence!' : 'Turbulence!', '#ffd2c8', 13, 1.2);
        radio.turbulence(ev.aircraft, ev.why);
        break;
      case 'emergency': {
        const sb = game.hazards && game.hazards.standbyRunway(ev.aircraft);
        // the runway the plane is turning for (its aim), named by the call and the tower; else the one it lands on
        radio.emergency(ev.aircraft, ev.type, sb, game.hazards ? game.hazards.endIdent(ev.aircraft, sb) : landEndIdent(sim, ev.aircraft, sb));
        audio.play('emergency');
        haptic('heavy');
        // an engine-out or low-fuel emergency gives the player real seconds: fast-forward goes off, and it can be turned on again
        const ffWas = stopFastForward(game, ev.type);
        const hz = ev.type === 'hydraulic' && game.hazards && game.hazards.standbyRunway(ev.aircraft);
        const what = { engine: 'engine out — get it to a runway inside the ring', fuel: 'low fuel', medevac: 'medevac — land it first for a bonus', hydraulic: `hydraulics failed — it needs ${hz ? `runway ${hz.activeIdent}, ` : ''}the longest` }[ev.type];
        // a real flight by its flight number; a simulated one by its type
        const who = ev.aircraft.live ? ev.aircraft.label || ev.aircraft.callsign : callTypeWord(ev.aircraft.cls).replace(/^./, (c) => c.toUpperCase());
        // the same call the radio makes (radio.js emergencyCall): a mayday for an engine failure, a pan-pan for low fuel or a medevac
        toast(`${emergencyCall(ev.type)} · ${who}: ${what}${ffWas ? ' · fast-forward off' : ''}`, 3400);
        break;
      }
      case 'medevacWait':
        fx.text(ev.aircraft.x, ev.aircraft.y - 24, 'Medevac waiting −1', '#ff9b84', 12, 1.4);
        break;
      case 'depReady':
        audio.play('warn');
        break;
      case 'taxi':
      case 'cleared': {
        audio.play('lock');
        haptic('click');
        const a = ev.aircraft, z = a.departure && sim.zone(a.departure.runway);
        if (z && ev.kind === 'taxi') radio.taxi(a, z, a.taxiVia);
        else if (z) radio.takeoff(a, z, windWords());
        break;
      }
      case 'holdShort':
        audio.play('select');
        if (ev.aircraft.departure) radio.holdShort(ev.aircraft, sim.zone(ev.aircraft.departure.runway));
        break;
      case 'runwayBusy':
        audio.play('prox');
        haptic('double');
        fx.text(ev.aircraft.x, ev.aircraft.y - 22, 'Runway busy — go around!', '#ff9b84', 12, 1.6);
        radio.goAround(ev.aircraft, ev.zone);
        break;
      case 'prox':
        // first sign of a conflict: the tower calls it, once per pair
        if (ev.a && ev.b && ev.a.state === 'fly' && ev.b.state === 'fly' && !ev.a.ground && !ev.b.ground) radio.nearMiss(ev.a, ev.b);
        break;
      case 'takeoffRoll':
        audio.play('takeoff', ev.aircraft.cls);
        break;
      case 'airborne':
        haptic('tick');
        // the label now says "Drag me to a » exit" until it has one
        break;
      case 'departed':
        audio.play('land', 2);
        haptic('click');
        // every departure scores (sim.depart), so every one gets the +1
        fx.text(clamp(ev.aircraft.x, 40, sim.W - 40), clamp(ev.aircraft.y, 30, sim.H - 30), '+1', '#bfe6ff', 20, 1.1, { arc: true });
        break;
      default:
        if (game.onEvent) game.onEvent(ev);
        break;
    }
  }
}

// -------------------------------------------------------------- the loop

let lastFrame = performance.now();
const STEP = 1 / SIM_HZ;

function frame(now) {
  requestAnimationFrame(frame);
  const interval = now - lastFrame; // the real frame interval (ms), for the density governor below
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  game.clock += dt;
  const sim = game.sim;
  if (game.scenery && game.state !== 'paused') game.scenery.update(dt);

  if (game.bullet && game.state === 'play' && game.crashT < 0) {
    game.timeScale = game.bullet.update(dt);
    // drain the colour only part way: the runway and aircraft colours still matter in that moment
    game.desat = game.bullet.desat * 0.6;
    if (game.bullet.pairs.length) {
      game.sawConflict = true;
      if (!save.tipBullet) {
        save.tipBullet = true;
        writeSave(save);
        toast('Collision ahead! Time slows down: redraw one of them. ⏪ rewinds 5 seconds, once a game.', 4500);
      }
    }
  } else if (game.crashT < 0) {
    game.timeScale = 1;
    game.desat = lerp(game.desat || 0, 0, damp(6, dt));
  }
  // the rewind button appears once there's been something worth rewinding, and stays (spent) after its one use
  game.rewindSpent = !!(game.g && game.g.rewind && game.g.rewind.used);
  game.rewindAvailable = game.rewindSpent || !!(game.bullet && game.state === 'play' && game.bullet.canRewind() && (game.sawConflict || game.crashT >= 0));
  if (game.state === 'play' && sim && !sim.demo) {
    radioCheckIns(sim);
    radio.update(dt);
  } else if (game.state !== 'paused') radio.update(dt);
  if (game.lighting) game.night = game.lighting.update(Date.now());
  let scale = 0;
  if (game.state === 'menu') scale = 1;
  else if (game.state === 'play') scale = game.fast ? 2 : 1;
  else if (game.state === 'over') scale = 0.3;
  if (game.state === 'play' && game.timeScale) scale *= game.timeScale; // bullet mode
  if (game.crashT >= 0) {
    game.crashT += dt;
    scale = game.crashT < 1.1 ? 0.12 : 0.3;
    game.camera.zoom = lerp(game.camera.zoom, 1.22, damp(3, dt));
    if (game.state === 'play' && game.crashT > (game.crashHold || 1.45)) gameOver();
    if (Math.random() < dt * 14) fx.puff(game.camera.fx + (Math.random() - 0.5) * 10, game.camera.fy, 1, { speed: 6, r: 5, grow: 14, life: 2, color: '60,56,52', alpha: 0.5, vx: 6, vy: -8 });
  } else {
    game.camera.zoom = lerp(game.camera.zoom, 1, damp(4, dt));
  }

  if (sim && scale > 0) {
    game.acc += dt * scale;
    let n = 0;
    while (game.acc >= STEP && n < 40) {
      // the game's own step order (simdriver.js); the home screen's backdrop sim only steps
      if (game.g && game.state !== 'menu') stepWorld(game.g, STEP);
      else sim.step(STEP);
      if (game.sky && game.state !== 'menu') game.sky.step(STEP);
      game.acc -= STEP;
      n++;
    }
    handleEvents(sim.drainEvents());
  }
  // the browser demo's game-time cap (demo.js): its one game ends when the sim's own clock reaches ten minutes (DECISIONS 446)
  if (WEB_DEMO && sim && game.state === 'play' && game.crashT < 0 && demoTimeUp(sim.time)) {
    demoWhy = 'time';
    gameOver();
  }
  fx.update(dt * (game.crashT >= 0 ? Math.max(scale, 0.35) : 1), dt);

  // the live feed polls in play and while paused (the card and the pause card read it); the director runs only in play
  if (game.airport && game.airport.feed && (game.state === 'play' || game.state === 'paused')) game.airport.feed.update(Date.now());
  if (sim && game.state === 'play') {
    liveTick(dt * scale);
    let prox = false, flying = 0;
    for (const a of sim.aircraft) {
      if (a.state === 'fly') flying++;
      if (a.prox) prox = true;
    }
    if (prox) audio.play('prox');
    game.vignette = lerp(game.vignette, prox ? 0.6 + 0.4 * Math.sin(game.clock * 14) : 0, damp(10, dt));
    audio.intensity = flying < 4 ? 1 : flying < 9 ? 2 : 3;
    updateHint(sim);
  } else {
    game.vignette = lerp(game.vignette, 0, damp(6, dt));
  }
  if (game.state === 'menu' && sim && game.director) {
    game.menuTick = (game.menuTick || 0) + dt;
    if (game.menuTick > 0.5) {
      game.menuTick = 0;
      syncBackdrop(); // a difficulty chosen on this screen takes effect here
      game.director.update(sim, [], 'offline');
    }
  }

  if (sim && game.displayScore < sim.score) {
    game.scoreTick -= dt;
    if (game.scoreTick <= 0) {
      game.displayScore++;
      game.scorePop = 1;
      game.scoreTick = 0.07;
    }
  } else if (sim && game.displayScore > sim.score) game.displayScore = sim.score;
  game.scorePop *= 1 - damp(9, dt);
  if (game.frameHook) game.frameHook(dt);
  // the radio ticker's box while it shows: a closure's pill keeps clear of it (closures.js)
  game.radioBox = radio.cur && $('radio').classList.contains('show') ? tickerBox() : null;
  renderer.draw(game);
  syncHudVars(renderer.hudGeom);
  tickerSeeThrough(dt);
  // the canvas steps down only while a game is in play (never in the menus, the loading card or a pause); it never steps up
  if (game.state === 'play' && !densityHeld) {
    if (governor.sample(interval)) stepDensity();
  } else governor.reset();
}

/** The governor's step (density.js): one notch lower for this screen, kept in the save so later games start there. */
function stepDensity() {
  const next = nextDensity(renderer.dpr);
  if (next == null) return;
  renderer.setDensity(next);
  save.density = { key: densityScreen, dpr: next };
  writeSave(save);
}

/** The traffic in the game now: real planes confirmed landing here, real planes in the area, simulated ones. */
function trafficCounts(sim) {
  let confirmed = 0, area = 0, simulated = 0;
  for (const a of sim.aircraft) if (a.state === 'fly' && !a.departure) (!a.live ? simulated++ : a.confirmed ? confirmed++ : area++);
  for (const w of sim.warnings) (!w.live ? simulated++ : w.confirmed ? confirmed++ : area++);
  return { confirmed, area, simulated, real: confirmed + area };
}

/** The mode the HUD's line reads by (feedstate.js mixLine): the daily, practice, real planes only, or a normal game. */
/** The daily challenge and a friend's challenge: one set of simulated planes from a seed; the live feed is not used (challenge.js). */
function fixedPlanes(ap) {
  return !!(ap && (ap.daily || ap.challenge || ap.weekend));
}
function feedMode(ap) {
  if (WEB_DEMO) return 'web';
  if (ap.challenge) return 'challenge';
  if (ap.weekend) return 'weekend';
  if (ap.daily) return 'daily';
  if (ap.demo) return 'practice';
  return game.realOnly ? 'realOnly' : 'normal';
}

/** The line under the airport name, the banner under it, and the dot: from what the feed is doing and the real planes in the game. */
function setFeedLines(view, c) {
  const ap = game.airport;
  const mode = ap ? feedMode(ap) : 'normal';
  game.mix = mixLine(view, { mode, real: c.real, same: !!ap && !!ap.challenge && challengeSamePlanes(ap.challenge, ap.layoutCode), web: WEB_DEMO ? { full: DEMO_WORDS.mix, short: DEMO_WORDS.mixShort } : null });
  game.mixDot = dotColour(view.state);
  // weather warnings first, then the arrival rush (its heads-up five seconds before, then the push), then the feed's banner
  // (a real-only game's no internet or used-up data only; feedstate.js bannerLine)
  const feedNote = bannerLine(view, { realOnly: mode === 'realOnly' });
  const rush = game.state === 'play' && game.director && game.director.phase === 'push' ? 'Arrival rush' : '';
  const soon = game.rushSoon && game.sim && game.rushSoon.sim === game.sim && game.sim.time < game.rushSoon.at ? 'Arrival rush in 5 s' : '';
  // a closure names both ends of its runway (closures.js bothEnds); the sim and the weather name the active one
  game.warnBanner = bothEnds((game.weather && game.weather.banner) || (game.ops && game.ops.banner()) || '', game.sim);
  // a one-way runway says so all the time: the lowest word of the banner, under everything else
  const oneWay = game.sim && game.sim.zones ? oneWayBanner(game.sim.zones) : '';
  game.banner = game.warnBanner || soon || rush || feedNote || oneWay;
  syncAreaNote();
}

// the feed's state is saved for the difficulty sheet and the home screen, when feedSaveDue says so (feedstate.js); Quit and
// the end of a game save it as it was (saveFeedNow)
let feedSavedAt = -Infinity;
function saveFeed(view, real, remaining, nowMs) {
  feedSavedAt = nowMs;
  save.feed = feedRecord(view, { remaining, real, at: nowMs });
  writeSave(save); // kept even if the game is left in the middle (the saved check is read after it)
}
function noteFeed(view, real, remaining, nowMs) {
  if (feedSaveDue(save.feed, view, real, nowMs, feedSavedAt)) saveFeed(view, real, remaining, nowMs);
}
/** The live feed as it is now, saved: when the player leaves a game in the middle (Quit, the pause card). */
function saveFeedNow(nowMs = Date.now()) {
  const ap = game.airport;
  if (!ap || ap.demo || ap.daily || ap.weekend || !ap.feed || !game.sim) return;
  saveFeed(feedState(ap.feed, { nowMs }), trafficCounts(game.sim).real, ap.feed.remaining ?? null, nowMs);
}

/** The feed's lines and the notes, a few times a second in play (the feed itself is polled in frame). The Traffic Director is
 *  driven inside the game's steps (simdriver.js), so a replay makes the same spawns. */
function liveTick(simDt) {
  const ap = game.airport;
  if (!ap) return;
  game.liveTimer = (game.liveTimer || 0) - simDt;
  if (game.liveTimer > 0) return;
  game.liveTimer = 0.25;
  const nowMs = Date.now();
  const view = feedState(ap.feed, { nowMs, demo: webFeed(ap), daily: !!(ap.daily || ap.weekend) });
  const c = trafficCounts(game.sim);
  setFeedLines(view, c);
  checkSlowSky(view); // Things too slow? (skysky.js): a real-only game's short sky, once per game
  if (!ap.demo && !ap.daily && !ap.weekend) noteFeed(view, c.real, ap.feed.remaining ?? null, nowMs);
  if (Math.floor(game.clock) % 20 === 0) updateTitle();
}

function updateHint(sim) {
  // once per install: when the sky first gets busy, point out the holding stacks
  if (save.tutorialDone && !save.tipStacks && game.state === 'play' && sim.fixes.length) {
    const up = sim.aircraft.filter((a) => a.state === 'fly' && a.entered && !a.departure).length;
    if (up >= 6) {
      save.tipStacks = true;
      revealFixes(game.g); // introduced now, as a recorded input: a replay shows them from this step too
      writeSave(save);
      toast(`Busy? Draw aircraft to ${sim.fixes[0].name} or ${sim.fixes[1].name} (▲) to hold them in a stack.`, 5000);
    }
  }
  if (!game.tutorial || save.tutorialDone) {
    game.hint = null;
    return;
  }
  const a = sim.aircraft.find((p) => p.state === 'fly' && p.target == null && p.entered && !p.departure);
  game.hint = a ? { aircraft: a, x: a.x, y: a.y, text: CLASSES[a.cls].pads ? 'Drag me to the H pad' : `Drag me to a ${CLASSES[a.cls].family} runway, into the arrows` } : null;
}

// ------------------------------------------------------------------- boot

// the browser demo (DECISIONS 445 to 449). Without DecompressionStream the map files cannot be read: no game starts (the card is up).
const demoUnsupported = WEB_DEMO && demoBrowserSupport({ decompression: typeof DecompressionStream === 'function' }) === 'unsupported';
// the free-games rule and the trusted clock are the app's; the demo's planes are simulated for every game, so its feed is the empty one
const webFeed = (ap) => !!ap.demo || WEB_DEMO;
let turnPaused = false; // the demo paused a game because the phone was held upright (only that pause is undone)
let demoWhy = ''; // why the demo's game ends (quit, or the cap): read once by gameOver

/**
 * The browser demo's own setup, once at boot (DECISIONS 445 to 449): the switches the demo does not have are off whatever is saved
 * (the defaults are on), and the words and store addresses that differ from the app's are set here.
 */
function demoSetup() {
  save.settings.realWeather = false;
  save.settings.realPlanesOnly = false;
  $('search').placeholder = DEMO_WORDS.search;
  $('btn-quit').textContent = 'Quit';
  $('home-feed').textContent = DEMO_WORDS.feedHome;
  document.querySelector('#set-rate label').textContent = 'Get the app';
  $('btn-rate').textContent = 'Get the app on Google Play';
  for (const a of document.querySelectorAll('a.web-store')) a.href = demoStoreUrl({ medium: 'web', campaign: a.dataset.store || 'home' });
  document.querySelector('p.version').firstChild.textContent = 'Demo, version ';
  if (demoUnsupported) $('unsupported').hidden = false;
  // the home note says what the page keeps: 3 a day when the browser keeps the count, else one game per page load (demo.js demoHomeNote)
  document.querySelector('.web-note').textContent = demoHomeNote(demoToday().stored);
  demoRedrawAtMidnight();
}

/** A phone held upright (a portrait phone: the width under 600 px in portrait, as the turn card's rule in style.css). */
function heldUpright() {
  return window.matchMedia('(orientation: portrait) and (max-width: 599px)').matches;
}

/** A phone held upright plays in landscape only: the demo's turn card is up and a game in play pauses under it (silently); turning back resumes it. */
function demoTurnPause() {
  const upright = heldUpright();
  if (upright && game.state === 'play' && !turnPaused) {
    turnPaused = true;
    pauseGame({ silent: true });
  } else if (!upright && turnPaused) {
    turnPaused = false;
    if (game.state === 'paused') resumeGame();
  }
}

// the demo's free games (DECISIONS 454): one record in the browser's storage, { day, n }; the storage may be blocked (private mode), and
// then the count is the page load's own, with one game (demo.js demoGamesLeft). demoMemory is that count; it stays 0 while storage works.
let demoMemory = 0;
// the browser's localStorage, probed once: null when the browser does not give it (a blocked site) or takes no write (a full or read-only
// store), so the page's one-game rule applies (demo.js demoStorageWorks). demo.js takes it as a storage-like object.
let demoStorage; // undefined until the first read, then the usable store or null
function demoStore() {
  if (demoStorage === undefined) {
    try {
      demoStorage = demoStorageWorks(window.localStorage) ? window.localStorage : null;
    } catch (_) {
      demoStorage = null;
    }
  }
  return demoStorage;
}
/** The free games left today, and the games counted today (demo.js demoGamesLeft), on the phone's local day. */
const demoToday = () => demoGamesLeft(demoStore(), db.localDay(), demoMemory);
/** Counts the game that has just loaded its map (demo.js demoCountGame). A save that fails is kept in the page's count. */
function demoCount() {
  const r = demoCountGame(demoStore(), db.localDay(), demoMemory);
  if (!r.stored) demoMemory = r.played;
}

/** The demo's start gate (DECISIONS 454): a game may start while the day has a free game. With none left, the Play page opens and the toast says why. */
function demoGate() {
  if (demoToday().left > 0) return true;
  openDemoPage(demoStoreUrl({ medium: 'web', campaign: 'home' }));
  toast(DEMO_WORDS.usedUp, 3200);
  return false;
}

/** The demo's pill follows the local day: it is drawn again at each local midnight, when the day's free games start again (demo.js). */
function demoRedrawAtMidnight() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  setTimeout(() => {
    syncPlayButton();
    demoRedrawAtMidnight();
  }, midnight - now + 1000); // a second past midnight, so the local day (db.localDay) has changed
}

/** The demo's Play pill: Play, the airport (or Random busy airport), and the free games left today; with none left, Get the app (demo.js). */
function demoPlayButton() {
  const btn = $('btn-demo');
  const w = demoPlayWords({ left: demoToday().left, pickName: picked ? picked.info.name : '' });
  btn.querySelector('.pb-title').textContent = w.title;
  btn.querySelector('.pb-place').textContent = w.place;
  const rank = btn.querySelector('.pb-rank');
  rank.textContent = '';
  rank.hidden = true;
  const note = btn.querySelector('.pb-unranked');
  note.textContent = w.note;
  note.hidden = false;
  const left = btn.querySelector('.pb-left');
  left.textContent = '';
  left.hidden = true;
  btn.setAttribute('aria-label', `${w.title}. ${w.place} · ${w.note}`);
  $('diff-chip-value').textContent = (DIFFICULTIES[save.settings.difficulty] || DIFFICULTIES.normal).label;
  $('diff-chip').classList.remove('locked');
  $('diff-chip').setAttribute('aria-disabled', 'false');
}

/** The demo's address (demo/?a=ICAO, the challenge page's "Try it"): that airport is picked on the home screen, and nothing starts. */
async function demoPickFromQuery() {
  const code = (new URLSearchParams(location.search).get('a') || '').toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(code)) return;
  await pickRestored;
  const info = await db.getAirport(code);
  if (!info || game.state !== 'menu') return;
  picked = { info, daily: 0, top: !db.BUSIEST.some(([c]) => c === code), challenge: null, weekend: 0 };
  savePick();
  markPicked();
  glideBackdrop(info);
}

/** The demo's Enter in the search field: the top result is picked and played (the one game, as the Play pill does). With nothing to play, the field closes. */
async function demoEnter() {
  if (!$('search').value.trim()) return $('search').blur();
  clearTimeout(searchTimer);
  await runSearch(); // the results of what is typed (the 90 ms debounce may not have run yet)
  const top = $('airport-list').querySelector('.ap-row');
  if (!top) return $('search').blur();
  if (!picked || pickKey(picked) !== top.dataset.key) top.click(); // the top result becomes the pick (tapRow; a row that is already picked is kept)
  playNow();
}

/** The demo's Quit (the pause card): ends its one game as "Demo over" rather than going home (DECISIONS 446). */
function demoQuit() {
  if (game.state !== 'paused' && game.state !== 'play') return showMenu();
  show('pause', false);
  stopFeedTimer();
  feedFrom = null;
  demoWhy = 'quit';
  gameOver();
}

async function boot() {
  // the free-games count starts on the first run (pro.js advancePro), and is kept at once so the first day is never lost. The
  // 3-day trial is for new players: a player whose save has played games before this build starts at day 4 (DECISIONS 291)
  const dayNow = advancePro(save.pro, proToday(), { existing: save.played > 0 });
  if (JSON.stringify(dayNow) !== JSON.stringify(save.pro)) {
    save.pro = dayNow;
    writeSave(save);
  }
  try {
    await Promise.race([document.fonts.load('600 16px Fredoka'), new Promise((r) => setTimeout(r, 1500))]);
  } catch (_) { /* fonts optional */ }
  initCloud(cloudDeps); // the cloud copy's last save and any reset still to do (cloud.js; the demo's sync is a no-op)
  if (WEB_DEMO) demoSetup(); // the demo's own switches, words and store addresses (DECISIONS 446)
  applySettings();
  pushReminder(); // the shell's alarm follows the switch and today's daily as the save has them (reminder.js)
  layout();
  // a reminder's tap that opened the app goes to the daily without the home screen first: the home screen is held back (quiet)
  // until takeDaily knows whether the daily starts (DECISIONS 423). It had shown for a moment, then the loading card, then the game
  if (dailyWaiting) $('menu').classList.add('quiet');
  showMenu();
  booted = true;
  if (WEB_DEMO) demoPickFromQuery();
  // the first-launch gate (profile.js): the age question, the month question, Agree or the under-13 screen, over the home
  // screen. Nothing goes out before the age answer: the home screen's checks (the live feed, the boards' open state, the queue)
  // run only once the gate has passed (homeOpened)
  if (checkGate(save) === 'home') homeOpened(); // the demo's gate is passed at once (gate.js, DECISIONS 446)
  takeDaily(); // a reminder's tap that came before the home screen (HP_openDaily); none past the gate starts nothing
  // Play Games starts only for a 13+ player who agreed; the shell keeps the answer for the next launch
  playGames.setAllowed(pgsAllowed());
  // Google Play Games (when set up): its buttons, and whether the automatic sign-in worked
  if (pgsAllowed()) {
    window.HP_pgs(playGames.status());
    playGames.check();
  }
  requestAnimationFrame((t) => {
    lastFrame = t;
    frame(t);
  });
}

// the Leaderboards and Achievements screens (screens.js): their corner buttons, the home stats line and the sheet
initScreens({ getSave: () => save, writeSave, show, toast, press, startAirport, playNow });
// the Tour (tour.js): its pill, its cards and their Try it actions
if (!WEB_DEMO) initTour({ getSave: () => save, writeSave, show, press, applySettings, startAirport, notSaved: settingNotSaved }); // the Tour is the app's (DECISIONS 446)
// Short Final Pro (propay.js): the shell's state (cached, so Pro works offline), the sheet's and Settings' hooks
if (!WEB_DEMO) initPro({ show, close: closeScreen, toast, onChange: () => syncPlayButton() }); // Short Final Pro is the app's
boot();

bindRipples(document); // every button's press ripples (motion.js)

// the browser demo's keys (DECISIONS 446): Esc pauses a game in play; a letter or a digit on the home screen starts a search
if (WEB_DEMO) {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && game.state === 'play') {
      e.preventDefault();
      pauseGame();
      return;
    }
    const typing = e.key.length === 1 && /^[a-z0-9]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (typing && game.state === 'menu' && !openScreens().length && document.activeElement === document.body) {
      e.preventDefault();
      $('search').focus();
      pressKey(e.key.toUpperCase());
    }
  });
}

// test hook for automated play-testing
window.__HP = { game, renderer, audio, radio, toast, earnAchievement, startAirport, syncPlayButton, playNow, showMenu, gameOver, db, save: () => save, openFeed, closeFeed, setRealPlanesOnly, setFeedDetails, renderFeedCard, feedReportText, pauseGame, resumeGame, openBoards, openAchievements, openSlowSky, closeSlowSky, checkSlowSky, renderFeedLines, holdDensity: (on = true) => { densityHeld = !!on; }, setAreaState: (st) => setAreaMap(st, loadToken) };
