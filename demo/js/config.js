// Gameplay tuning. World units: the airspace is always 540 units tall; its width follows the
// screen's aspect ratio (clamped). Each airport gets its own metres-per-unit scale.

export const WORLD_H = 540;
export const WORLD_MIN_W = 810;   // 1.5 : 1
export const WORLD_MAX_W = 1242;  // 2.3 : 1

// Upright screens (3.3; DECISIONS 440): a window taller than wide whose shorter side is at least UPRIGHT_MIN_SIDE CSS px (a tablet,
// a foldable's inner screen, a Chromebook or desktop window) gets an airspace UPRIGHT_W wide, the narrowest world there is, and as
// tall as the window's aspect, at most UPRIGHT_H_MAX (1.6 : 1). Scale does not follow the height: a plane is the same size in metres.
export const UPRIGHT_MIN_SIDE = 600;
export const UPRIGHT_W = 810;
export const UPRIGHT_H_MAX = 1296;

export const SIM_HZ = 120;

// Aircraft are drawn this much larger than their sprite units.
export const SPRITE_SCALE = 1.18;

// Livery colours by size class (also used for highlights and symbols).
export const ZONE_COLORS = {
  red:    { main: '#e5533d', dark: '#a8321f', light: '#ff9b84', name: 'red' },
  orange: { main: '#ef8a2f', dark: '#a85a12', light: '#ffc186', name: 'orange' },
  yellow: { main: '#f2c14e', dark: '#b8862a', light: '#ffe39a', name: 'yellow' },
  green:  { main: '#5fb34d', dark: '#3a7a2c', light: '#a9e39a', name: 'green' },
  blue:   { main: '#3c8fd8', dark: '#22609c', light: '#9fd0ff', name: 'blue' },
};

/**
 * Size classes. Colour families decide where they land, Flight Control style: red airliners
 * (narrowbody, heavy) on red runways, yellow props (regional, light) on yellow runways, helicopters
 * on the H pad. minRunwayM / hardOnly are the real-data limits on top of that: heavies need long
 * paved runways; light aircraft can use anything (grass, gravel ...).
 */
export const CLASSES = {
  light: {
    id: 'light', label: 'Light', color: 'yellow', family: 'yellow', sprite: 'prop',
    speed: 26, radius: 11.5, size: 19, touch: 44, landTime: 1.4,
    minRunwayM: 0, hardOnly: false, wakeEmit: 0, wakeKill: true,
  },
  regional: {
    id: 'regional', label: 'Regional', color: 'yellow', family: 'yellow', sprite: 'regional',
    speed: 31, radius: 13.5, size: 22, touch: 44, landTime: 1.6,
    minRunwayM: 1200, hardOnly: true, wakeEmit: 0, wakeKnock: true,
  },
  narrowbody: {
    id: 'narrowbody', label: 'Narrowbody', color: 'red', family: 'red', sprite: 'liner',
    speed: 37, radius: 16, size: 27, touch: 44, landTime: 1.8,
    minRunwayM: 1800, hardOnly: true, wakeEmit: 6,
  },
  heavy: {
    id: 'heavy', label: 'Heavy', color: 'red', family: 'red', sprite: 'heavy',
    speed: 41, radius: 19, size: 33, touch: 46, landTime: 2.0,
    minRunwayM: 2500, hardOnly: true, wakeEmit: 9,
  },
  heli: {
    id: 'heli', label: 'Helicopter', color: 'blue', family: 'heli', sprite: 'heli',
    speed: 22, radius: 13, size: 21, touch: 44, landTime: 1.6,
    minRunwayM: Infinity, hardOnly: true, wakeEmit: 0, pads: true,
  },
};
export const CLASS_IDS = Object.keys(CLASSES);

/** Typical people aboard by class (each aircraft varies ±20%). */
export const PAX = { light: 2, regional: 62, narrowbody: 160, heavy: 310, heli: 3 };

/** Points for one, two and three stars at an airport. */
export const STAR_GOALS = [10, 25, 50];

export const TUNING = {
  warnExtra: 30,          // proximity ring distance beyond touching
  pathMinSpacing: 6,      // world units between recorded path points
  pathInputSmoothing: 0.5,// exponential smoothing on raw finger input
  lookahead: 10,          // pure-pursuit lookahead along a path
  edgeMargin: 14,         // aircraft turn back when this close to the edge
  edgeTurnRate: 3.2,      // rad/s while bouncing off an edge
  spawnWarnTime: 2.4,     // seconds of edge warning before an aircraft appears
  spawnOutside: 34,       // how far beyond the edge aircraft start
  maxAircraft: 34,
  holdRadius: 30,         // tap-to-hold orbit radius
  landingSlack: 22,       // extra reach when the finger lifts just short of a zone
  loopCloseDist: 26,      // a drawn path ending this close to itself becomes a holding loop
  loopMinLength: 90,
  // the lateral acceleration (units/s^2) an engine-out plane turns for its runway end with: its bank. The turn rate is this over its
  // speed (sim.fly), so a light turns at about 0.6 rad/s (a 35-unit radius) and a heavy at 0.4, never the 9 rad/s a flown path turns at
  engineBank: 14,
  // s a free path's tail stays grabbable after its lift, even once the plane has flown to it: a short path is otherwise gone in half a
  // second, before a finger on a tablet can reach it (sim.tailOf, 2.8 fix 2). Sim time, so replays agree on every screen
  tailWindow: 1.5,
  minRunwayDrawWidth: 10, // runways are drawn at least this wide (units) so they read on a phone
};
// s of an arrival's straight lane, from its entry, that a storm cell or a lethal wake must stay off (weather.js, hazards.js)
export const LANE_S = 6;

// The online boards (server/). Off until the Worker is deployed and a test score is accepted (release step 6), so the
// World tab makes no request before then (release step 22). The Google web client id for server sign-in is not here: the app reads it from
// games-ids.xml (game_web_client_id, platform.js playGames.webClientId). Without it no session is made and posts wait.
// 3.4: the boards' API is its own address (api.playshortfinal.com, a custom domain on the Worker). Builds before 3.4 call the Worker's
// old address, which the Worker keeps on (wrangler.toml workers_dev), so installed older builds still post.
export const BOARDS = { base: 'https://api.playshortfinal.com', live: false };

// The website (3.4): challenge links are made on it, as SITE_BASE + '/c/<id>/' (links.js challengeLinkFor). A friend without the game
// opens that page, which offers Google Play; with the game, App Links open the game (AndroidManifest.xml).
export const SITE_BASE = 'https://playshortfinal.com';
