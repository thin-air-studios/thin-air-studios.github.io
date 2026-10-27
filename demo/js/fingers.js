// Finger rules for planes and the sky, for the play view's pointer handlers (main.js). Pure: no DOM and no sim calls, so the node
// tests (tests/fingers.test.mjs) run the rules, and main.js applies them.
//
// A plane under a finger always wins. A finger that lands on a plane takes it, even over a one-finger pan or a pinch already under
// way, so a thumb resting on the sky never blocks a grab. Two fingers on the sky still pinch and pan the map. When a plane lets go,
// the sky fingers still down carry on from where they are now, so the map does not jump. A touch on a ground departure (a parked,
// holding or turnaround aircraft) only counts when no flying plane's touch zone holds the finger.
//
// A plane a finger holds can be let go by the game: a jolt (weather.js knock) stops its drawing, and a runway closure (sim.unlockZone)
// cancels its landing. The finger takes it again once it has moved RETAKE_PX from where it was when the plane was seen let go, so a
// thumb resting on the plane does not pull it back, and a real drag steers it out at once.
//
// A tail (2.6) is the free end of a flying plane's drawn path (sim.tailOf). A finger that lands within TAIL_REACH_PX of one takes it:
// the plane keeps flying the path it has, and a drag carries the path on from the tail (sim.carryPath). A tap on a tail does nothing.
// A flying plane under the finger wins over a tail, unless the finger is nearer the tail than the plane's centre and within the handle
// itself (tailBeatsPlane: a short path's tail sits in its own plane's zone, and a finger on the body beside it still grabs the plane).
// A tail wins over a ground tap and the Live feed zone (main.js).
//
// A plane that circles (a tap-circle, sim.hold) is touched with more slack: a press that wobbles a little is still a tap, so the
// circle is not flipped on and off by small attempts. A tap that would circle a plane again within RECIRCLE_MS of its release does
// nothing, for the same reason. A finger on a circling plane's ring takes the plane (ringUnder), when no plane is under the finger.
export const RETAKE_PX = 10; // CSS px the finger moves from where it was when a held plane was let go before it takes the plane again
export const TAP_PX = 10; // CSS px a finger may move on a plane and still tap it (a tap toggles the plane's hold)
export const CIRCLE_TAP_PX = 16; // the same for a plane that is circling: the tap is looser, so small attempts do not flip the circle
export const RECIRCLE_MS = 1000; // a tap on a plane that is not circling, this soon after its circle was released, does nothing
export const RING_REACH_PX = 24; // CSS px a finger may land from a circling plane's ring and still take the plane (ringUnder)
export const TAIL_REACH_PX = 28; // CSS px a finger may land from a tail and still take it, at any zoom (tailReach)
export const TAIL_TAKE_PX = 10; // CSS px a finger on a tail must drag before it carries the path on (a shorter press is a tap)
export const TAIL_HANDLE_PX = 12; // CSS px: a finger under a plane's zone takes the plane's tail only this close to it (tailBeatsPlane); farther, the body grabs
export const TAIL_SCALE_MAX = 1.6; // the most a tail's touch targets grow on a big screen (tailScale): a tablet's handle is 1.6 times the phone's

/**
 * The sky gesture the fingers down make, from where they are now: two or more fingers pinch (the first two), with the baseline at
 * their current places; one pans from its current place; none gives null.
 */
export function skyGesture(pts) {
  if (pts.length >= 2) {
    const [p, q] = pts;
    return { kind: 'pinch', d: Math.hypot(p.x - q.x, p.y - q.y), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 };
  }
  if (pts.length === 1) return { kind: 'pan', x: pts[0].x, y: pts[0].y, moved: 0 };
  return null;
}

/** The sky gesture that remains when a finger lands: a plane under it takes the finger and drops any pan or pinch under way. */
export function gestureAfterLanding(gesture, a) {
  return a ? null : gesture;
}

/**
 * The sky gesture once a plane's finger lifts: the sky fingers still down carry on from where they are now. Not while another plane
 * is still being drawn (a sky gesture never runs during a drawn path, as in pointerdown).
 */
export function gestureAfterPlaneLift(pts, planesLeft) {
  return planesLeft ? null : skyGesture(pts);
}

/**
 * Does a touch go to a ground departure? Only when no flying plane's touch zone holds the finger (planeUnderFinger is that plane, or
 * null) and a parked, holding or turnaround aircraft is in reach (groundInReach). Grabbing a plane always wins.
 */
export function groundTapWins(planeUnderFinger, groundInReach) {
  return !planeUnderFinger && !!groundInReach;
}

/**
 * Is a plane a finger holds let go by the game: flying, not being drawn, and with no landing or exit locked? A jolt stops the drawing
 * and a runway closure cancels the landing lock, so either one leaves the plane released. A plane with a landing or an exit locked is
 * not released: the path that locked it stays the finger's.
 */
export function released(a) {
  return a.state === 'fly' && !a.drawing && a.target == null;
}

/**
 * A finger holding a plane moves to (x, y), in CSS px. free is where the finger was when the plane was first seen let go (null until
 * then). Returns the finger's record for its next move (free), and whether the finger takes the plane again on this move (take):
 *   - the plane is not released: no record, no take, and the path is extended as before;
 *   - released, seen for the first time here: the finger's place is recorded, and the plane is not taken yet;
 *   - released, and the finger has moved more than RETAKE_PX from that record: taken again, from this move (pathBegin).
 * While free is non-null and take is false, the plane is let go and the finger waits, so the path is not extended.
 */
export function retakeOnMove(a, free, x, y) {
  if (!released(a)) return { free: null, take: false };
  if (!free) return { free: { x, y }, take: false };
  if (Math.hypot(x - free.x, y - free.y) > RETAKE_PX) return { free: null, take: true };
  return { free, take: false };
}

/**
 * What one move of a finger that holds a plane does, from retakeOnMove: 'begin' (the finger takes the plane again, so a path starts
 * from its place: pathBegin), 'wait' (the plane is let go and the finger has not moved far enough: the path is not extended), or
 * 'extend' (the path is extended: pathExtend). `free` is the finger's record for its next move. The caller applies the action. main.js
 * and tests/fingers-replay.test.mjs both call this, so the replay tests run the decision the game runs.
 */
export function fingerMoveAction(a, free, x, y) {
  const r = retakeOnMove(a, free, x, y);
  if (r.take) return { action: 'begin', free: r.free };
  if (r.free) return { action: 'wait', free: r.free };
  return { action: 'extend', free: r.free };
}

/**
 * How much bigger a tail's touch targets are on this screen (2.8, fix 2): the HUD's scale (uiscale.js, 1 on the 390 px phone, larger
 * on a tablet), capped at TAIL_SCALE_MAX so a huge screen does not grow a handle over the planes beside it.
 */
export function tailScale(hud) {
  return Math.min(TAIL_SCALE_MAX, Math.max(1, Number.isFinite(hud) ? hud : 1));
}

/** The reach of a tail in world units at the view now: TAIL_REACH_PX CSS px (times the screen's tailScale), whatever the zoom. cssPerWorld: renderer.scale / renderer.dpr. */
export function tailReach(cssPerWorld, scale = 1) {
  return (TAIL_REACH_PX * scale) / cssPerWorld;
}

/** The radius of a tail's handle in world units at the view now: TAIL_HANDLE_PX CSS px (times tailScale; tailBeatsPlane). cssPerWorld as tailReach. */
export function tailHandleReach(cssPerWorld, scale = 1) {
  return (TAIL_HANDLE_PX * scale) / cssPerWorld;
}

/**
 * The tail a finger takes: the nearest tail within reach (world units) of the finger at (x, y), whose plane no other finger holds
 * (taken: a Set of the planes held now). tails: { a, x, y } each (sim.tails). Returns the plane, or null when no free tail is in reach.
 */
export function tailUnder(tails, x, y, reach, taken) {
  let best = null, bestD = reach * reach;
  for (const t of tails) {
    if (taken.has(t.a)) continue;
    const d = (t.x - x) * (t.x - x) + (t.y - y) * (t.y - y);
    if (d < bestD) {
      best = t.a;
      bestD = d;
    }
  }
  return best;
}

/**
 * Which one takes a finger that lands where a flying plane's touch zone (sim.pick) and a free tail in reach both are: the tail, when
 * the finger is nearer to the tail than to the plane's centre and within the tail's handle (handleD2, the handle's radius squared, world
 * units; TAIL_HANDLE_PX at the view now), else the plane. A tail sits in its own plane's zone whenever the path is short, so a finger on
 * the handle has to be able to take it; a finger on the plane's body beside the handle still grabs the plane (2.6 round 4: the handle's own
 * radius, not the whole reach of a tail, which is 28 CSS px). Squared distances, world units.
 */
export function tailBeatsPlane(planeD2, tailD2, handleD2 = Infinity) {
  return tailD2 < planeD2 && tailD2 <= handleD2;
}

/**
 * What one move of a finger on a tail does. Until the finger has dragged past TAIL_TAKE_PX from where it touched, nothing happens
 * ('wait'): a tap on a tail does nothing. The first drag past it carries the path on from the tail ('carry': sim.carryPath, from the
 * finger's place now). After that the carried plane is held as a plane is (fingerMoveAction: 'begin', 'wait' or 'extend'), except a
 * retake: a carried plane the game let go is taken again on the route it has, if it still has a tail (hasTail), so the route the
 * player carried is kept ('carry'); with no tail left (a jolt cleared the path) it is taken from its place ('begin'). dragPx is the
 * finger's distance from where it touched, in CSS px. The caller applies the action, as with fingerMoveAction.
 */
export function tailMoveAction(carried, dragPx, a, free, x, y, hasTail) {
  if (!carried) return dragPx > TAIL_TAKE_PX ? { action: 'carry', free: null } : { action: 'wait', free: null };
  const m = fingerMoveAction(a, free, x, y);
  return m.action === 'begin' && hasTail ? { action: 'carry', free: m.free } : m;
}

/**
 * The circling plane whose ring a finger lands on (2.6): within `band` world units of its orbit, the nearest such, and not held by
 * another finger (taken, a Set of the planes held now). A plane under the finger wins over it (the caller checks that first).
 * holds: sim.holds() { a, cx, cy, r } each. band: RING_REACH_PX in world units at the zoom now.
 */
export function ringUnder(holds, x, y, band, taken) {
  let best = null, bestD = band;
  for (const h of holds) {
    if (taken.has(h.a)) continue;
    const d = Math.abs(Math.hypot(x - h.cx, y - h.cy) - h.r);
    if (d < bestD) {
      best = h.a;
      bestD = d;
    }
  }
  return best;
}

/** The move a finger may make on a plane and still tap it, in CSS px: CIRCLE_TAP_PX while the plane circles, else TAP_PX. */
export function tapSlopPx(circling) {
  return circling ? CIRCLE_TAP_PX : TAP_PX;
}

/**
 * Does a tap toggle the plane's hold? It does when the tap is a tap (tapHoldsPlane: no tail, and not moved past its slop), and the
 * plane is circling (so the tap releases it), or it is not and the circle was not released within RECIRCLE_MS. sinceReleaseMs: the
 * time since the plane's circle was last released, or null when it never was. ti: the finger's record (tapInfo, circling).
 */
export function tapTogglesHold(ti, sinceReleaseMs) {
  if (!tapHoldsPlane(ti)) return false;
  return !!ti.circling || sinceReleaseMs == null || sinceReleaseMs >= RECIRCLE_MS;
}

/**
 * Does a lift end the plane's path (sim.endPath, with its end rules)? A plane a finger holds always has its path ended, except a tail
 * the finger never carried: a tap or a rest on a tail changes nothing, so its lift changes nothing. ti: the finger's record (main.js
 * tapInfo: { tail, carried }).
 */
export function liftEndsPath(ti) {
  return !ti.tail || !!ti.carried;
}

/**
 * Does a tap toggle the plane's hold? A finger that did not move and lifted quickly (main.js) does, on a plane, and never on a tail:
 * a tap on a tail does nothing. ti: the finger's record (tail, moved).
 */
export function tapHoldsPlane(ti) {
  return !ti.tail && !ti.moved;
}
