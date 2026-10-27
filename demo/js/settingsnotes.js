// The one-line state notes under Settings, the pause card and the Live feed card. Pure: the caller passes the saved
// settings and the clock, so the same rule writes the same words in every place (ui 2.3, requirements 5, 8 and 9).

/** A setting that did not save (main.js settingNotSaved, screens.js, tour.js): the one message for every route. */
export const SAVE_FAILED = 'Couldn’t save that setting';

const LEVEL_NAMES = { beginner: 'Beginner', easy: 'Easy', normal: 'Normal', hard: 'Hard', chaos: 'Chaos' };
const PICKABLE = ['beginner', 'easy', 'normal'];

// the one switch's line, the same in Settings, the pause card and the Live feed card (the override is retired)
const RPO_ON = 'On: only real planes. Nothing is made up.';
const RPO_OFF = 'Off: simulated planes fill the sky.';
const DEP_GREYED = 'Not in Beginner or with Real planes only.';
// no ranking words in a switch's line (DECISIONS 160): the planes that do fly are the whole of it
const DEP_OFF = 'Off: only arriving planes.';
const DEP_ON = 'On: planes wait at gates and take off.';

// the game's own words for the classes that can land (config.js, main.js: "light planes", "props", "airliners", "helicopters")
const LANDS = [['light', 'light planes'], ['regional', 'props'], ['narrowbody', 'airliners'], ['heavy', 'airliners'], ['heli', 'helicopters']];

/**
 * The real planes that can land at a field, in the game's words, as one sentence: null where every class can land (nothing to
 * say). classes is the field's landable list (airport.js landableClasses): at Lukla only light planes and helicopters land.
 */
export function landableLine(classes = []) {
  const have = new Set(classes);
  if (LANDS.every(([c]) => have.has(c))) return null;
  const words = [];
  for (const [c, w] of LANDS) if (have.has(c) && !words.includes(w)) words.push(w);
  if (!words.length) return 'No real planes land here.';
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  return `Only ${list} land here.`;
}

/**
 * The Real planes only switch's line: what the saved switch means for the next game (Settings) or this game (the pause card
 * and the Live feed card). One switch, one line, no buttons: the switch shows exactly what is saved. In a game, landable (the
 * field's classes) adds the one sentence of which real planes can land there, when the field has not all of them.
 */
export function realOnlyNote({ on = false, landable = null } = {}) {
  const line = on && landable ? landableLine(landable) : null;
  return { text: (on ? RPO_ON : RPO_OFF) + (line ? ` ${line}` : '') };
}

/**
 * The Departures switch's line. Greyed (and not toggleable) in Beginner and with Real planes only, whatever the
 * saved setting says; the greyed line comes first, so a Beginner game never reads "Off: games are unranked".
 */
export function departuresNote({ difficulty = 'normal', realOnly = false, on = true } = {}) {
  const greyed = difficulty === 'beginner' || !!realOnly;
  return { text: greyed ? DEP_GREYED : on ? DEP_ON : DEP_OFF, greyed };
}

/**
 * The level picker in the pause card: the three choices a game can move between, or null where there is no picker.
 * Daily challenges have none, and Hard and Chaos never get one (a Normal game cannot step up to Hard).
 */
export function levelChoices({ difficulty, daily = false } = {}) {
  if (daily) return null;
  return PICKABLE.includes(difficulty) ? [...PICKABLE] : null;
}

/**
 * The confirm sheet's words for a level change in a game (the ranking rule's own line, requirement 7). A game that is
 * unranked already (`unranked`: a reason such as Real planes only is on it) says so, rather than that it becomes unranked.
 */
export function levelConfirm(key, { unranked = false } = {}) {
  return {
    title: `Change to ${LEVEL_NAMES[key] || key}?`,
    body: unranked
      ? 'It stays unranked. It still counts in your personal stats.'
      : 'This game becomes unranked. It still counts in your personal stats.',
  };
}
