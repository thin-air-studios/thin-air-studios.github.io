// The Tour's categories and cards (requirement 14, screens 4.2). Pure data: tour.js draws it. Each card has a
// screenshot (game/tour/<shot>.webp, made by tools/tour-shots.mjs), a bold title and one or two lines. A build whose
// online boards are not open yet gets other lines on the cards about the boards and Play Games (tests/tour-copy.test.mjs
// holds the copy to its rules).

export const CATEGORIES = [
  { id: 'real', name: 'The real world' },
  { id: 'play', name: 'How you play' },
  { id: 'toes', name: 'Keeping you on your toes' },
  { id: 'ways', name: 'Ways to play' },
  { id: 'progress', name: 'Progress and bragging rights' },
  { id: 'sound', name: 'Sound' },
];

// act: the card's Try it button (ACTIONS below). pre is the other line set: for a build whose online boards are not open
// yet. Every line is at most 100 characters.
export const CARDS = [
  // The real world
  { id: 'airports', cat: 'real', shot: 's-search', title: 'Any airport on Earth', act: 'search',
    lines: ['29,000+ airports, each with its real runways, coastlines, lakes and hills.', 'Tap one to pick it, then Play. It stays picked after you play. Or search by code, name or city.'] },
  { id: 'live', cat: 'real', shot: 's-live', title: 'Live planes',
    lines: ['Real planes, with real flight numbers, come in from any side of the screen.', 'Each real plane has a red dot and its flight number. Where it flew in from shows as it lands.'] },
  { id: 'arrived', cat: 'real', shot: 's-arrived', title: 'Arrived from',
    lines: ['A real plane that lands here says where it flew in from, as it touches down.', 'Only real planes with a known route show it, for a few seconds.'] },
  { id: 'weather', cat: 'real', shot: 's-weather', title: 'Real weather',
    lines: ['The airport’s real report sets the wind, rain, snow and fog. Storms knock planes off course.', 'In fog, distant planes show as radar blips.'] },
  { id: 'daylight', cat: 'real', shot: 's-night', title: 'Real time of day',
    lines: ['Day and night follow the airport’s own local clock.', 'Want it always day or always night? Change it in Settings.'] },

  // How you play
  { id: 'paths', cat: 'play', shot: 's-paths', title: 'Draw a path',
    lines: ['Drag from a plane to draw its path. Lift on a runway to land it, or drag the tail to carry on.', 'Tap a plane to make it circle. Draw a closed loop and it holds on that loop.'] },
  { id: 'colours', cat: 'play', shot: 's-colours', title: 'Match the colours',
    lines: ['Red airliners land on red runways, yellow props on yellow, helicopters on the H pad.', 'Land on the end the arrows point to. The wind picks it. Striped runways take both, except Lukla.'] },
  { id: 'stacks', cat: 'play', shot: 's-stacks', title: 'Holding stacks',
    lines: ['Draw a plane to a holding loop, or to its name, to hold it. Draw a new path to bring it out.', 'Up to four stack 1,000 ft apart. Holding burns fuel faster. Other planes can still cross.'] },
  { id: 'departures', cat: 'play', shot: 's-departures', title: 'Departures',
    lines: ['Planes wait at their gates. Tap to taxi, then tap again to take off.', 'Draw them out through a blue gate on the edge. Not in Beginner.'] },
  { id: 'apart', cat: 'play', shot: 's-keep', title: 'Keep them apart',
    lines: ['Two aircraft touching ends the game.', 'On Hard and Chaos, landing on a busy (flashing red) runway ends it too.'] },
  { id: 'controls', cat: 'play', shot: 's-controls', title: 'Controls',
    lines: ['Pinch to zoom, drag empty sky to pan, double-tap to reset.', 'Tap the line under the airport name for the live feed.'] },

  // Keeping you on your toes
  { id: 'rush', cat: 'toes', shot: 's-rush', title: 'Arrival rushes',
    lines: ['Now and then a rush of arrivals comes in, with a 5-second warning.', 'The first one takes a few minutes. Watch the banner.'] },
  { id: 'emergency', cat: 'toes', shot: 's-emergency', title: 'Emergencies',
    lines: ['Some planes declare an emergency: engine out, low fuel, medevac or hydraulics.', 'Engine out: land in the ring. Medevac: land first. Hydraulics: longest runway.'] },
  { id: 'wind', cat: 'toes', shot: 's-wind', title: 'Wind shifts',
    lines: ['The wind can flip the runways, with a 20-second warning first.', 'Light planes feel the crosswind most.'] },
  { id: 'closing', cat: 'toes', shot: 's-closing', title: 'Closing runways',
    lines: ['A runway about to close counts down in amber. Once it is shut, red X marks show it.', 'Both ends are named, 17C / 35C, so you can see which one is closed, even at night.'] },
  { id: 'wake', cat: 'toes', shot: 's-wake', title: 'Wake and slow motion',
    lines: ['Keep light planes out of a jet’s wake. On Hard and Chaos it can bring one down.', 'Before a crash, time slows. You get one 5-second rewind per game.'] },

  // Ways to play
  { id: 'levels', cat: 'ways', shot: 's-levels', title: 'Five levels',
    lines: ['Beginner, Easy, Normal, Hard and Chaos, from gentle to relentless.', 'Beginner has no departures. On Hard and Chaos, a busy runway ends the game.'] },
  { id: 'daily', cat: 'ways', shot: 's-daily', title: 'Today’s challenge', act: 'daily',
    lines: ['One airport a day, with the same planes and weather for everyone.', 'Normal level. Play it any time today.'] },
  { id: 'offline', cat: 'ways', shot: 's-offline', title: 'Play now', act: 'demo',
    lines: ['Tap Play for a real game at your last airport, or pick a new one first.', 'Ranked or Unranked, as your settings say. With no internet it plays a recorded game, Unranked.'] },
  { id: 'realonly', cat: 'ways', shot: 's-realonly', title: 'Real planes only',
    lines: ['Only real planes come in. Nothing is made up.', 'Want a busier sky? Turn it off any time.'] },
  { id: 'ranked', cat: 'ways', shot: 's-ranked', title: 'Ranked play',
    lines: ['Post your games to the online boards and see where you rank.', 'Every game still counts toward your own stats and achievements.'],
    pre: ['Your games will post to the online boards at launch.', 'Every game still counts toward your own stats and achievements.'] },

  // Progress and bragging rights
  { id: 'stars', cat: 'progress', shot: 's-busiest', title: 'Stars at every airport',
    lines: ['Score 10, 25 or 50 at an airport to earn one, two or three stars.', 'Stars count your best score there, at any level.'] },
  { id: 'worldtour', cat: 'progress', shot: 's-home', title: 'World tour',
    lines: ['The world’s 50 busiest airports, ranked by 2025 passengers.', 'Play 5, 20 or all 50 for the Globetrotter, Frequent flyer and World tour badges.'] },
  { id: 'achievements', cat: 'progress', shot: 's-achievements', title: '24 achievements',
    lines: ['Badges for landings, streaks, weather and the busiest airports.', 'Earned in any game and kept on this phone. Play Games shows them when you’re signed in.'] },
  { id: 'boards', cat: 'progress', shot: 's-boards', title: 'Leaderboards', act: 'boards',
    lines: ['The best scores at each airport, by level, today, this week or all time.', 'Anyone can look. Posting needs a Google Play Games sign-in (13 and up).'],
    pre: ['The best scores at each airport, by level and by day.', 'World boards open at launch. Your own airports are here now.'] },
  { id: 'share', cat: 'progress', shot: 's-share', title: 'Share cards',
    lines: ['Share your result as a card for a post or story, or as plain text.', 'Cards have no names or flight numbers. Only your airport, score and game stats.'] },
  { id: 'video', cat: 'progress', shot: 's-video', title: 'Share a video',
    lines: ['A 20-second video of your game, for TikTok, YouTube Shorts or Instagram Reels.', 'Real planes keep their flight numbers, as in the game. Nothing is posted: you choose where it goes.'] },

  // Sound
  { id: 'chatter', cat: 'sound', shot: 's-radio', title: 'Radio chatter', act: 'radio',
    lines: ['Air traffic control calls scroll along the bottom of the screen.', 'Off by default. Turn it on to read the calls as they come in.'] },
  { id: 'voices', cat: 'sound', shot: 's-voices', title: 'Radio voices', act: 'voices',
    lines: ['The calls are read aloud, in English, with a voice on this phone.', 'Needs the phone’s text-to-speech. Turning voices on turns chatter on too.'] },
  { id: 'music', cat: 'sound', shot: 's-music', title: 'Music', act: 'music',
    lines: ['Seven tracks: Tower Jazz, Lo-fi chill, Synthwave and Cinematic calm.', 'Bossa nova, Arcade 8-bit and Funky groove. Pick one in Settings; each fills out as traffic builds.'] },
];

// The Try it buttons: the label, and the words it reads once the setting it turns on is already on (then disabled).
export const ACTIONS = {
  search: { label: 'Pick an airport' },
  daily: { label: 'Play today’s challenge' },
  demo: { label: 'Play now' },
  boards: { label: 'Open Leaderboards' },
  radio: { label: 'Turn on radio chatter', on: 'Radio chatter is on' },
  voices: { label: 'Turn on radio voices', on: 'Radio voices are on' },
  music: { label: 'Turn on music', on: 'Music is on' },
};

/** The cards of one category, in the order they are shown. */
export const cardsIn = (cat) => CARDS.filter((c) => c.cat === cat);

/** The lines a card shows: its pre-launch lines while the online boards are not open, where the card has them. */
export function cardLines(card, { live = true } = {}) {
  if (!live && card.pre) return card.pre;
  return card.lines;
}

/** The Try it label for an action: the 'on' words when the setting it turns on is already on. */
export function actionLabel(id, on = false) {
  const a = ACTIONS[id];
  if (!a) return '';
  return on && a.on ? a.on : a.label;
}
