import { BELT, GRID, HAND, LOOK, SHEEP, type ItemId } from '../balance'
import { get, inGrid, isBeltLike, jobOf, owned, pastureAt, plotOf, plotPrice, terr } from '../grid'
import { Field, Flock, GameState, Plant, Stats, Ui, float, key, newItem, puff, res, stockAdd, stockTake, toStock, type Building, type SheepT, type World } from '../world'
import { enterBelt, machineAccept } from '../systems/belts'
import { takeRes } from '../systems/machines'
import { sendHome, toPasture } from '../systems/sheep'
import { pileHere } from './build'

/**
 * The hand (GDD 3), which is the barn's stock (the author: «этот склад и рука одно и тоже»): one click gathers one
 * item, a fluffy sheep is shorn in three clicks, a pile or a good on a belt is picked up — all into the stock, with no
 * limit. A click on a machine hands it what it takes from the stock; a click on a dock, the market or a pasture opens
 * its popup, where the player picks what and how much to load or trade.
 */

/** The sheep under a ground point (cells), if any: fluffy sheep are bigger targets. */
export function sheepAt(w: World, x: number, y: number): SheepT | null {
  let best: SheepT | null = null,
    bd: number = SHEEP.pickR
  for (const s of res(w, Flock).sheep) {
    if (s.state !== 'pasture' && s.state !== 'waiting' && s.state !== 'belt') continue
    const r = s.wool >= 1 ? SHEEP.pickRFluffy : SHEEP.pickR,
      d = Math.hypot(s.px - x, s.py - y)
    if (d < r && d < bd + (r - SHEEP.pickR)) {
      bd = d
      best = s
    }
  }
  return best
}

export function shearClick(w: World, s: SheepT) {
  s.clicks++
  puff(w, s.px, s.py, LOOK.wool, 4)
  if (s.clicks >= HAND.shearClicks) {
    s.clicks = 0
    s.wool = 0
    stockAdd(w, 'wool', 2)
    float(w, s.px, s.py - 0.4, '+2', 'accent')
    res(w, Stats).handShear++
  }
}

/** Put up to n of a good from the stock into a machine that takes it, as much as it has room for; how many went. */
export function feed(w: World, b: Building, k: ItemId, n: number = BELT.bufMax) {
  if (!jobOf(b)?.inp[k]) return 0
  const got = stockTake(w, k, Math.min(n, BELT.bufMax - (b.inv[k] ?? 0)))
  if (got) b.inv[k] = (b.inv[k] ?? 0) + got
  return got
}

/** Hand a machine what it takes from the stock, up to what it holds of each input. */
export function giveTo(w: World, b: Building) {
  let n = 0
  const inp = jobOf(b)?.inp
  if (inp) for (const k of Object.keys(inp) as ItemId[]) n += feed(w, b, k)
  if (n) float(w, b.x + 0.5, b.y, '+' + n, 'accent')
  return n > 0
}

/** The game is paused: the hand only opens popups, it doesn't work the field (the author: no shearing on pause). */
export const handStill = (w: World) => res(w, GameState).speed === 0

/** One click on a resource cell: one item into the stock (meadow → hay, bush → dye, water → water). */
export function gather(w: World, x: number, y: number) {
  const k = key(x, y),
    r = res(w, Field).res.get(k)
  if (!r) return false
  takeRes(w, k)
  stockAdd(w, r.t === 'meadow' ? 'hay' : r.t === 'bush' ? 'dye' : 'water')
  float(w, x + 0.5, y, '+1', r.t === 'water' ? 'water' : 'accent')
  if (r.t !== 'water') puff(w, x + 0.5, y + 0.5, r.t === 'bush' ? LOOK.berry : LOOK.meadowEar, 3)
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
 * A click with the hand at a ground point (cells): shear a sheep, pick up a pile, a belt's good or hand over to a
 * machine, gather a resource (on any land), open a popup (a building, a plot for sale, a pasture) — in that order.
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
  // a resource is gathered by hand anywhere, bought land or not; machines take only from your own land (the author)
  const t = terr(w, x, y)
  if (t === 'meadow' || t === 'bush' || t === 'water') {
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
 * good, a machine takes what the stock has for it, or the building is selected — a dock's or the market's popup is
 * where goods are loaded and traded.
 */
export function clickBuilding(w: World, b: Building) {
  const ui = res(w, Ui)
  if (isBeltLike(b) && b.item && !b.item.sheep && !handStill(w)) {
    toStock(w, b.item)
    b.item = null
    return
  }
  if (b.type !== 'dock' && !handStill(w) && giveTo(w, b)) return
  ui.sel = ui.sel?.kind === 'b' && ui.sel.key === key(b.x, b.y) ? null : { kind: 'b', key: key(b.x, b.y) }
}

/** A field click on pause: the pause line at the top nudges, so it is plain why nothing happened. */
function pausedNudge(w: World) {
  res(w, GameState).pauseNudge++
}

/** A sheep can be taken from the pasture, from beside a machine and off a belt. */
export function pickSheep(w: World, s: SheepT) {
  for (const b of res(w, Plant).b.values()) {
    if (b.item?.sheep === s) b.item = null
    if (b.buf.length) b.buf = b.buf.filter((q) => q.sheep !== s)
    if (b.outs.length) b.outs = b.outs.filter((o) => o.item.sheep !== s)
  }
  s.state = 'held'
  s.clicks = 0
}

/** Drop a held sheep: into a pasture, onto an empty belt, into a free shearer — or it walks home. */
export function dropSheep(w: World, s: SheepT, px: number, py: number) {
  const x = Math.floor(px),
    y = Math.floor(py)
  const pa = pastureAt(w, x, y)
  if (pa) {
    toPasture(w, s, pa, px, py)
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
  if (b && b.type === 'shearer' && !b.slot && machineAccept(w, b, it)) return
  sendHome(w, s)
}
