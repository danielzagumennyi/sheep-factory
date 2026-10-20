import { GRID, HAND, LOOK, SHEEP } from '../balance'
import { get, inGrid, isBeltLike, isStation, owned, pastureAt, plotOf, plotPrice, roomFor, terr } from '../grid'
import { Field, Flock, GameState, Plant, Stats, Ui, float, key, newItem, puff, res, stockAdd, stockTake, toStock, type Building, type SheepT, type World } from '../world'
import { enterBelt, machineAccept } from '../systems/belts'
import { fleeceColor, shearYield, shorn, takeRes } from '../systems/machines'
import { hungry, sendHome, toPasture, toRoam } from '../systems/sheep'
import { pileHere } from './build'

/**
 * The hand (GDD 3), which is the stock (the author: «этот склад и рука одно и тоже»): one click gathers one item from
 * own land, a fluffy sheep is shorn in three clicks, a hungry one is fed one hay from the stock, a pile or a good on a
 * belt is picked up — all into the stock, with no limit. Machines take only from belts (docs/05-REWORK.md): a click on
 * one selects it; a click on a market stall, the trading post or a pen opens its popup: the stall's ask, trade, sheep.
 */

/** The sheep under a ground point (cells), if any: fluffy sheep are bigger targets. */
export function sheepAt(w: World, x: number, y: number): SheepT | null {
  let best: SheepT | null = null,
    bd: number = SHEEP.pickR
  for (const s of res(w, Flock).sheep) {
    // one still coming down on its parachute is out of reach
    if ((s.state !== 'pasture' && s.state !== 'transit' && s.state !== 'roam' && s.state !== 'belt') || s.drop !== undefined) continue
    const r = s.wool >= 1 ? SHEEP.pickRFluffy : SHEEP.pickR,
      d = Math.hypot(s.px - x, s.py - y)
    if (d < r && d < bd + (r - SHEEP.pickR)) {
      bd = d
      best = s
    }
  }
  return best
}

/** One snip of the hand's shears; the third takes off what grew on the sheep, as the shearer would (shearYield). */
export function shearClick(w: World, s: SheepT) {
  s.clicks++
  puff(w, s.px, s.py, fleeceColor(s), 4)
  if (s.clicks >= HAND.shearClicks) {
    const [kind, n] = shearYield(s)
    shorn(s)
    stockAdd(w, kind, n)
    float(w, s.px, s.py - 0.4, '+' + n, 'accent')
    res(w, Stats).handShear++
  }
}

/** Feed a hungry sheep one hay from the stock: its next fleece grows. */
export function feedSheep(w: World, s: SheepT) {
  if (!stockTake(w, 'hay', 1)) {
    float(w, s.px, s.py - 0.4, 'noHay', 'bad')
    return false
  }
  s.fed = true
  puff(w, s.px, s.py, LOOK.hay, 4)
  return true
}

/** The game is paused: the hand only opens popups, it doesn't work the field (the author: no shearing on pause). */
export const handStill = (w: World) => res(w, GameState).speed === 0

/** One click on a resource cell of own land: one item into the stock (meadow → hay, bush → dye). */
export function gather(w: World, x: number, y: number) {
  const k = key(x, y),
    r = res(w, Field).res.get(k)
  if (!r || !owned(w, x, y)) return false
  takeRes(w, k)
  stockAdd(w, r.t === 'meadow' ? 'hay' : 'dye')
  float(w, x + 0.5, y, '+1', 'accent')
  puff(w, x + 0.5, y + 0.5, r.t === 'bush' ? LOOK.berry : LOOK.meadowEar, 3)
  return true
}

/** A machine's pile, all of it, into the stock. */
export function takePile(w: World, m: Building) {
  const n = m.pile.length
  for (const q of m.pile) toStock(w, q)
  m.pile = []
  if (!n) return
  float(w, m.pileX + 0.5, m.pileY, '+' + n, 'accent')
}

/**
 * A click with the hand at a ground point (cells): shear or feed a sheep, pick up a pile or a belt's good, gather a
 * resource on own land, open a popup (a building, a plot for sale, a pen) — in that order.
 */
export function handClick(w: World, px: number, py: number) {
  const ui = res(w, Ui)
  const x = Math.floor(px),
    y = Math.floor(py)
  const still = handStill(w)
  const s = sheepAt(w, px, py)
  if (s && s.wool >= 1 && s.state !== 'machine') {
    if (still) return pausedNudge(w)
    shearClick(w, s)
    return
  }
  if (s && hungry(s)) {
    if (still) return pausedNudge(w)
    feedSheep(w, s)
    return
  }
  if (!inGrid(x, y)) return
  const pm = pileHere(w, x, y)
  if (pm) {
    if (still) return pausedNudge(w)
    takePile(w, pm)
    return
  }
  const b = get(w, x, y)
  if (b) {
    clickBuilding(w, b)
    return
  }
  // a resource is gathered by hand on own land only (docs/05-REWORK.md); machines take only from own land too
  const t = terr(w, x, y)
  if ((t === 'meadow' || t === 'bush') && owned(w, x, y)) {
    if (still) return pausedNudge(w)
    if (gather(w, x, y)) return
  }
  if (!owned(w, x, y) && y < GRID.roadY) {
    const [qx, qy] = plotOf(x, y)
    if (plotPrice(w, qx, qy)) ui.sel = ui.sel?.kind === 'plot' && ui.sel.px === qx && ui.sel.py === qy ? null : { kind: 'plot', px: qx, py: qy }
    return
  }
  const pa = pastureAt(w, x, y)
  if (pa) {
    ui.sel = ui.sel?.kind === 'p' && ui.sel.id === pa.id ? null : { kind: 'p', id: pa.id }
    return
  }
  ui.sel = null
}

/**
 * A click on a building, wherever on its model it lands (the pointer picks it by its model): a belt gives up its
 * good, anything else is selected but the market's row, which only takes goods in.
 */
export function clickBuilding(w: World, b: Building) {
  const ui = res(w, Ui)
  if (isBeltLike(b) && b.item && !b.item.sheep && !handStill(w)) {
    toStock(w, b.item)
    b.item = null
    return
  }
  if (b.part === 'row') {
    ui.sel = null
    return
  }
  ui.sel = ui.sel?.kind === 'b' && ui.sel.key === key(b.x, b.y) ? null : { kind: 'b', key: key(b.x, b.y) }
}

/** A field click on pause: the pause line at the top nudges, so it is plain why nothing happened. */
function pausedNudge(w: World) {
  res(w, GameState).pauseNudge++
}

/** A sheep can be taken from a pen, off a belt and wherever it roams; one half shorn by hand keeps its clicks. */
export function pickSheep(w: World, s: SheepT) {
  for (const b of res(w, Plant).b.values()) {
    if (b.item?.sheep === s) b.item = null
    if (b.buf.length) b.buf = b.buf.filter((q) => q.sheep !== s)
    if (b.outs.length) b.outs = b.outs.filter((o) => o.item.sheep !== s)
  }
  s.state = 'held'
}

/** Drop a held sheep: into a pen, onto an empty belt, into a free station — or it roams from there (the author: «игроку надо их перемещать»). */
export function dropSheep(w: World, s: SheepT, px: number, py: number) {
  const x = Math.floor(px),
    y = Math.floor(py)
  const pa = pastureAt(w, x, y)
  if (pa) {
    // a full pen takes no one more: the sheep goes back home
    if (roomFor(w, pa, s)) toPasture(w, s, pa, px, py)
    else {
      float(w, px, py - 0.4, 'noRoom', 'bad')
      sendHome(w, s)
    }
    return
  }
  const b = inGrid(x, y) ? get(w, x, y) : null,
    it = newItem('sheep', s)
  if (b && b.type === 'belt' && !b.item) {
    enterBelt(it, b.dir)
    it.p = 0.5
    b.item = it
    return
  }
  if (b && isStation(b) && !b.slot && machineAccept(w, b, it, 'sheep')) return
  // anywhere else on the own land it roams from where it was put down; off it, from the nearest free ground
  toRoam(w, s, px, py)
}
