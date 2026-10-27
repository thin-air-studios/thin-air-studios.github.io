// The one step order of the game (T2): the live game (main.js) and the replay runner (the server, and the tests) both build the
// game with makeGame, apply the recorded inputs with applyInput, and advance one fixed step with stepWorld. Pure: no DOM, no
// clock, no RNG outside the sim's own. Sky (cloud and precipitation drawing) is visual only and is not stepped here.
import { Sim } from './sim.js?v=7227d0de';
import { TrafficDirector, runwayPace } from './director.js?v=7227d0de';
import { Weather } from './weather.js?v=7227d0de';
import { Hazards } from './hazards.js?v=7227d0de';
import { Ops } from './ops.js?v=7227d0de';
import { RewindBuffer } from './rewind.js?v=7227d0de';
import { buildWorld, landableClasses, setActiveEnd } from './airport.js?v=7227d0de';
import { chooseActiveEnds } from './metar.js?v=7227d0de';
import { SIM_HZ, WORLD_H } from './config.js?v=7227d0de';
import { OPS_RATE, syncDepartures, applyLevel, applyDepartures, applyRealOnly, applyRewind, revealFixes } from './midgame.js?v=7227d0de';
import { REPLAY_FORMAT, REPLAY_VERSION, rowFromTuple, projectFeed } from './replay.js?v=7227d0de';

export const STEP = 1 / SIM_HZ;
export const DIRECTOR_EVERY = 0.25; // s of sim time between two director ticks (the golden's liveTimer, T1)

/**
 * The game object for a new game: the sim, the director, weather, hazards, ops and departures, built from the setup. The
 * first-game eases (firstGame) and Beginner's calm skies are applied here, so a replay and the live game are built the same.
 *
 * @param world     from buildWorld(layout, W, H)
 * @param o.seed    the game's seed (the daily's is derived from its day number)
 * @param o.daily   the daily challenge
 * @param o.setup   { firstGame, fixesHidden, wxSeed, country, diff, realOnly, departures } (replay.js, setup)
 * @param o.hud     the HUD rectangles { hard, soft } in world units, or null
 * @param o.settings the saved settings the departures read (the live game passes save.settings)
 * @param o.rec     the Recorder (live only)
 * @param o.rewindOn whether the rewind history is kept (the bullet setting)
 */
export function makeGame(world, { seed, daily = false, setup, hud = null, settings = null, rec = null, rewindOn = true }) {
  const diff = setup.diff;
  // setup.rush: the weekend event's rush (weekend.js); no game without it has one, so its traffic is what it was
  const director = new TrafficDirector({ difficulty: diff, country: setup.country, seed, landable: landableClasses(world), realOnly: !!setup.realOnly, daily: !!daily, pace: runwayPace(world.runways.length), rush: setup.rush || null });
  // a busy runway is a crash on Hard and Chaos only; the daily is Normal, so it is not (gameplay 3.3)
  const busyRunwayLoses = !daily && (diff === 'hard' || diff === 'chaos');
  const sim = new Sim({ world, seed, hudRects: hud, daily: !!daily, rules: { busyRunwayLoses } });
  sim.extras = [director];
  sim.fixesHidden = !!setup.fixesHidden;
  const weather = new Weather({ sim, seed, severity: director.weatherSeverity(), seedWx: setup.wxSeed || null });
  const hazards = new Hazards({ sim, weather, director, seed });
  if (setup.firstGame) {
    // the first ever game eases in: emergencies after 5 landings; wind shifts, new storms and rushes after 3 minutes
    hazards.firstAfter = 5;
    weather.nextShift = Math.max(weather.nextShift, 180);
    weather.nextStorm = Math.max(weather.nextStorm, 150);
    director.bankFrom = 180;
  }
  if (diff === 'beginner') {
    // calm skies: no storms, fog or wind shifts
    weather.nextStorm = Infinity;
    weather.nextShift = Infinity;
    weather.nextFog = Infinity;
  }
  const ops = new Ops({ sim, weather, seed, rate: OPS_RATE[diff] ?? 1 });
  if (setup.firstGame) ops.next = Math.max(ops.next, 200);
  // real wind picks the starting active runway ends
  const ends = chooseActiveEnds(world.zones, weather.windDir, weather.windKt);
  world.zones.forEach((z, i) => ends[i] != null && setActiveEnd(z, ends[i]));
  const g = {
    sim, world, director, weather, hazards, ops, departures: null, seed, daily: !!daily,
    realOnly: !!setup.realOnly, firstAfter: setup.firstGame ? 3 : 0,
    settings: settings || { departures: !!setup.departures }, rec, steps: 0, liveTimer: 0, notedLive: false,
    rewind: new RewindBuffer(), rewindOn: !!rewindOn, feed: null, ranking: null,
  };
  // the departures the setting asks for (the daily's always): built with the same rules as midgame.syncDepartures
  syncDepartures(g, g.settings);
  return g;
}

/** The sim's aircraft by id (the inputs name them by id). */
function aircraftById(sim, id) {
  return sim.aircraft.find((a) => a.id === id) || null;
}

/**
 * Applies one recorded input (replay.js INPUT_KINDS) to the game, at the step it was made. The live handlers call the same
 * sim functions for the same actions; the mutators that record themselves do so from here too when a Recorder is present.
 */
export function applyInput(g, input) {
  const [, kind, ...p] = input;
  switch (kind) {
    case 'path': {
      const [op, id, x, y] = p;
      const a = aircraftById(g.sim, id);
      if (!a) return;
      if (op === 'b') g.sim.beginPath(a, x, y);
      else if (op === 'e') g.sim.extendPath(a, x, y);
      else if (op === 'c') g.sim.carryPath(a, x, y); // a finger takes a tail and carries the path on (2.6, sim.js carryPath)
      else g.sim.endPath(a, { k: x, ui: y }); // a lift: the view it lifted in (replay.js); older replays carry none
      return;
    }
    case 'hold': {
      const a = aircraftById(g.sim, p[0]);
      if (a) g.sim.toggleHold(a);
      return;
    }
    case 'dep-tap':
      if (g.departures) g.departures.tap(p[0], p[1], p[2]);
      return;
    case 'rewind':
      applyRewind(g);
      return;
    case 'lvl':
      applyLevel(g, p[0]);
      return;
    case 'dep':
      applyDepartures(g, p[0]);
      return;
    case 'rpo':
      applyRealOnly(g, p[0]);
      return;
    case 'ovr':
      return; // the simulated-planes override is saved for the next game; this game keeps its rules
    case 'hud':
      g.sim.hudRects = p[0];
      return;
    case 'wxsev':
      if (g.weather) g.weather.setSeverity(p[0]);
      return;
    case 'fixes':
      revealFixes(g);
      return;
    default:
      throw new Error(`simdriver: unknown input ${kind}`);
  }
}

/**
 * One director tick (every DIRECTOR_EVERY s of sim time): noteLive once, at the first 'working' tick, then director.update on
 * the projected rows. Recorded when the game has a Recorder. callsigns is the feed's full list of callsigns, or null.
 */
export function directorTick(g, step, state, rows, callsigns) {
  if (callsigns && !g.notedLive) {
    g.director.noteLive(callsigns.map((callsign) => ({ callsign })));
    g.notedLive = true;
  }
  g.director.update(g.sim, rows, state);
  if (g.rec) g.rec.feedTick(step, state, rows, callsigns);
}

/**
 * Advances the game by one fixed step: weather, hazards, ops, then the sim; then the director on the golden's accumulator
 * (liveTimer starts at 0, each step takes STEP off, and at 0 or below it is 0.25 and a tick runs: ticks at steps 0, 31, 62 ...);
 * then the rewind history. g.feed(step) gives the tick's feed { state, rows, callsigns } when a tick is due (live: the feed now;
 * replay: the recorded tick), or null.
 */
export function stepWorld(g, step = STEP) {
  const i = g.steps;
  if (g.weather) g.weather.step(step);
  if (g.hazards) g.hazards.step(step);
  if (g.ops) g.ops.step(step);
  g.sim.step(step);
  g.liveTimer -= step;
  if (g.liveTimer <= 0) {
    g.liveTimer = DIRECTOR_EVERY;
    const tick = g.feed ? g.feed(i) : null;
    if (tick) directorTick(g, i, tick.state, tick.rows, tick.callsigns);
  }
  if (g.rewindOn && g.rewind) g.rewind.record(g.sim, i);
  g.steps = i + 1;
}

/** The outcome the server checks (T7): the discrete results, the time in sim seconds, and the crash, if any. */
export function outcomeOf(g) {
  const s = g.sim;
  return {
    score: s.score,
    landed: s.landed,
    landedLive: s.landedLive,
    departed: s.departed || 0,
    pax: s.pax || 0,
    streak: s.streak || 0,
    time: Math.round(s.time * 100) / 100,
    crash: s.crash ? { t: Math.round(s.crash.time * 100) / 100, reason: s.crash.reason } : null,
    steps: g.steps,
  };
}

/**
 * Replays a recorded game (replay.js). The layout is the body the replay's hash names (the caller checks the hash). Returns the
 * outcome from this run, which the caller compares with replay.end. Inputs are applied before the step they were made at;
 * inputs made after the last step (before the game was built) are applied at the end.
 *
 * probe (optional, the server's): probe.overStart is set to the step count at which the sim last became over (a crash). The
 * server bounds how far steps run past it (the phone keeps stepping for its crash hold, main.js crashHold). probe.tail (a number
 * of steps: the server's CRASH_TAIL_STEPS) stops the run early, when the sim is over and more than probe.tail steps have run
 * past probe.overStart. The stop is taken only when no rewind is left to come (sim.restore is the one thing that clears over),
 * so the sim would stay over to the end of the replay with the same crash, and no claim the server accepts could match that run:
 * the whole run is not made.
 * A stopped run returns the steps it ran, fewer than the replay's, so the caller's comparison refuses it. The phone never
 * passes a probe, so this changes nothing it does. probe.game is set to the game once the replay has run (a test reads the sim).
 */
export function runReplay(replay, layout, probe = null) {
  if (!replay || replay.f !== REPLAY_FORMAT || replay.v !== REPLAY_VERSION) throw new Error('replay: unknown format');
  // a replay with no H is a landscape game (DECISIONS 441): its world is WORLD_H tall
  const world = buildWorld(layout, replay.W, replay.H ?? WORLD_H);
  const inputsAt = new Map();
  let lastRewind = -1;
  for (const input of replay.inputs || []) {
    if (!inputsAt.has(input[0])) inputsAt.set(input[0], []);
    inputsAt.get(input[0]).push(input);
    if (input[1] === 'rewind') lastRewind = Math.max(lastRewind, input[0]);
  }
  const feedAt = new Map();
  for (const [step, state, rows, callsigns] of replay.feed || []) {
    feedAt.set(step, { state, rows: rows.map(rowFromTuple), callsigns });
  }
  const g = makeGame(world, {
    seed: replay.seed,
    daily: replay.board === 'daily',
    setup: replay.setup,
    hud: replay.hud,
    settings: { departures: !!replay.setup.departures },
    rec: null,
    rewindOn: true,
  });
  g.feed = (step) => feedAt.get(step) || null;
  let wasOver = false;
  let stopped = false;
  for (let i = 0; i < replay.steps; i++) {
    // at step i, g.steps is i: the sim is over and has run past its tail, with no rewind still to come (see the doc above)
    if (probe && probe.tail != null && g.sim.over && i - probe.overStart > probe.tail && i > lastRewind) {
      stopped = true;
      break;
    }
    for (const input of inputsAt.get(i) || []) applyInput(g, input);
    stepWorld(g, STEP);
    if (probe) {
      const over = !!g.sim.over;
      if (over && !wasOver) probe.overStart = g.steps;
      wasOver = over;
    }
  }
  if (!stopped) for (const input of inputsAt.get(replay.steps) || []) applyInput(g, input);
  if (probe) probe.game = g;
  return outcomeOf(g);
}

/** A live feed's director input for a tick: the projected rows and the callsigns (once, at the first working tick). */
export function liveFeedTick(state, snapshot, { wantCallsigns }) {
  return {
    state,
    rows: projectFeed(snapshot),
    callsigns: wantCallsigns ? snapshot.map((f) => f.callsign || '') : null,
  };
}
