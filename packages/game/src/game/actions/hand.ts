import { HAND, LOOK, SHEEP } from '../balance'
import { get, inGrid, isStation } from '../grid'
import { Flock, GameState, Plant, Stats, Ui, key, newItem, puff, ready, res, type Building, type SheepT, type World } from '../world'
import { enterBelt } from '../systems/belts'
import { shear, stationTake } from '../systems/machines'
import { intoPortal } from '../systems/portal'
import { toRoam } from '../systems/sheep'

/**
 * The hand (GDD 3; the author, 21.10.2026: «смысл конвейером, двигать без конвейера игрок может двигать сам»): it can
 * do all the factory does, only slower. A ready fluffy sheep is shorn in three clicks — an unprepared one not: the
 * scissors are crossed out over it (ui/ShearCursor.tsx). A sheep is carried one at a time: put down onto a belt it
 * rides, into a station or the portal it goes in if they take it, anywhere else it roams. A click on a building selects
 * it.
 */

/** The sheep under a ground point (cells), if any: fluffy sheep are bigger targets. */
export function sheepAt(w: World, x: number, y: number): SheepT | null {
  let best: SheepT | null = null,
    bd: number = SHEEP.pickR
  for (const s of res(w, Flock).sheep) {
    // one still coming down on its parachute is out of reach
    if ((s.state !== 'roam' && s.state !== 'belt') || s.drop !== undefined) continue
    const r = s.wool >= 1 ? SHEEP.pickRFluffy : SHEEP.pickR,
      d = Math.hypot(s.px - x, s.py - y)
    if (d < r && d < bd + (r - SHEEP.pickR)) {
      bd = d
      best = s
    }
  }
  return best
}

/** One snip of the hand's shears at a ready sheep; the third shears it. False for one that isn't ready. */
export function shearClick(w: World, s: SheepT) {
  if (!ready(s)) return false
  s.clicks++
  puff(w, s.px, s.py, LOOK.wool, 4)
  if (s.clicks >= HAND.shearClicks) {
    shear(w, s)
    res(w, Stats).handShear++
  }
  return true
}

/** The game is paused: the hand only opens popups, it doesn't work the field (the author: no shearing on pause). */
export const handStill = (w: World) => res(w, GameState).speed === 0

/** A click with the hand at a ground point (cells): snip at a fluffy sheep, or select the building there. */
export function handClick(w: World, px: number, py: number) {
  const ui = res(w, Ui)
  const s = sheepAt(w, px, py)
  if (s && s.wool >= 1) {
    if (handStill(w)) return pausedNudge(w)
    shearClick(w, s)
    return
  }
  const x = Math.floor(px),
    y = Math.floor(py)
  const b = inGrid(x, y) ? get(w, x, y) : null
  if (b) return clickBuilding(w, b)
  ui.sel = null
}

/** A click on a building, wherever on its model it lands (the pointer picks it by its model): it is selected. */
export function clickBuilding(w: World, b: Building) {
  const ui = res(w, Ui)
  ui.sel = ui.sel?.kind === 'b' && ui.sel.key === key(b.x, b.y) ? null : { kind: 'b', key: key(b.x, b.y) }
}

/** A field click on pause: the pause line at the top nudges, so it is plain why nothing happened. */
function pausedNudge(w: World) {
  res(w, GameState).pauseNudge++
}

/** A sheep can be taken off a belt (one standing at a way in too) and wherever it roams; one half shorn keeps its clicks. */
export function pickSheep(w: World, s: SheepT) {
  for (const b of res(w, Plant).b.values()) {
    if (b.item?.sheep === s) b.item = null
    if (b.buf.length) b.buf = b.buf.filter((q) => q.sheep !== s)
    if (b.outs.length) b.outs = b.outs.filter((o) => o.item.sheep !== s)
  }
  s.state = 'held'
}

/**
 * Drop a held sheep (the author: «игроку надо их перемещать»): onto an empty belt it rides; into a station that takes it
 * it goes in, and a shorn one into the portal (anywhere on it); anywhere else it roams from where it was put down.
 */
export function dropSheep(w: World, s: SheepT, px: number, py: number) {
  const x = Math.floor(px),
    y = Math.floor(py)
  const b = inGrid(x, y) ? get(w, x, y) : null
  if (b?.type === 'dock' && s.wool < 1) return intoPortal(w, s, x, y)
  if (b && b.type === 'belt' && !b.item) {
    const it = newItem(s)
    enterBelt(it, b.dir)
    it.p = 0.5
    b.item = it
    return
  }
  if (b && isStation(b) && stationTake(w, b, s)) return
  toRoam(w, s, px, py)
}
