import { HAND, LOOK, PILE, SHEEP } from '../balance'
import { entersAt, get, inGrid, isBeltLike, isStation, owned, pastureAt, pileAt, plotOf, plotPrice, roomFor, terr } from '../grid'
import { Field, Flock, GameState, Plant, Stats, Ui, float, key, newItem, puff, res, type Building, type Item, type SheepT, type World } from '../world'
import { enterBelt, machineAccept } from '../systems/belts'
import { dropNear, putPile, takePile } from '../systems/ground'
import { fleeceColor, shearYield, shorn, takeRes } from '../systems/machines'
import { hungry, toPasture, toRoam } from '../systems/sheep'
import { marketTake } from '../systems/village'

/**
 * The hand (GDD 3; the author, 21.10.2026: «смысл конвейером, двигать без конвейера игрок может двигать сам»): it can
 * do all a belt does, only slower. A fluffy sheep is shorn in three clicks and what it gives falls beside it; one click
 * gathers one item onto its cell. A pile, or a good on a belt, is taken into the hand (up to PILE.max) and carried; where
 * the hand puts it down it goes — into the market, onto a belt, into a machine's way in, to a hungry sheep as hay, or on
 * the ground. Nothing reaches the market's stock any other way. A click on a building selects it; on the market or a
 * pen it opens its popup: the clients and trade, the sheep.
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
    // what it gives falls off its back beside it, not under it where it would hide, for the hand to take away
    const items = Array.from({ length: n }, () => newItem(kind)),
      from = { x: s.px, y: s.py, h: HAND.fallFrom }
    let left: Item[] = items
    for (const [x, y] of besideOf(s)) left = left.slice(putPile(w, x, y, left, from, n - left.length).length)
    dropNear(w, Math.floor(s.px), Math.floor(s.py), left, from)
    res(w, Stats).handShear++
  }
}

/** The four cells beside a sheep's own, the side it stands nearest first. */
function besideOf(s: SheepT): [number, number][] {
  const cx = Math.floor(s.px),
    cy = Math.floor(s.py),
    fx = s.px - cx,
    fy = s.py - cy
  const sides: [number, number, number][] = [
    [fx, -1, 0],
    [1 - fx, 1, 0],
    [fy, 0, -1],
    [1 - fy, 0, 1],
  ]
  return sides.sort((a, b) => a[0] - b[0]).map(([, dx, dy]) => [cx + dx, cy + dy])
}

/** Feed a hungry sheep one hay from the hand: its next fleece grows. */
export function feedSheep(w: World, s: SheepT) {
  const ui = res(w, Ui)
  const i = ui.carry.findIndex((q) => q.kind === 'hay')
  if (i < 0 || !hungry(s)) {
    if (i < 0) float(w, s.px, s.py - 0.4, 'noHay', 'bad')
    return false
  }
  ui.carry.splice(i, 1)
  if (!ui.carry.length) ui.carryFrom = null
  s.fed = true
  puff(w, s.px, s.py, LOOK.hay, 4)
  return true
}

/** The game is paused: the hand only opens popups, it doesn't work the field (the author: no shearing on pause). */
export const handStill = (w: World) => res(w, GameState).speed === 0

/**
 * One click on a resource cell of own land: one item into the hand (meadow → hay, bush → dye) — the hand picks it, so
 * clicks on the same meadow gather on; with the hand full, it falls in a pile beside.
 */
export function gather(w: World, x: number, y: number) {
  const k = key(x, y),
    r = res(w, Field).res.get(k)
  if (!r || !owned(w, x, y)) return false
  takeRes(w, k)
  const it = newItem(r.t === 'meadow' ? 'hay' : 'dye')
  const ui = res(w, Ui)
  if (handRoom(w) > 0) {
    ui.carry.push(it)
    ui.carryFrom ??= { x, y }
  } else dropNear(w, x, y, [it], { x: x + 0.5, y: y + 0.5, h: 0.2 })
  puff(w, x + 0.5, y + 0.5, r.t === 'bush' ? LOOK.berry : LOOK.meadowEar, 3)
  return true
}

/** How many more goods the hand can take. */
export const handRoom = (w: World) => PILE.max - res(w, Ui).carry.length

/** Take the pile on a cell into the hand, as much as it has room for; false when there was nothing to take. */
export function pickUp(w: World, x: number, y: number) {
  const got = takePile(w, x, y, handRoom(w))
  if (!got.length) return false
  const ui = res(w, Ui)
  ui.carry.push(...got)
  ui.carryFrom ??= { x, y }
  return true
}

/** Take the good on a belt into the hand. */
export function pickFromBelt(w: World, b: Building) {
  if (!b.item || b.item.sheep || handRoom(w) <= 0) return false
  const ui = res(w, Ui)
  ui.carry.push({ ...b.item, p: 0, ed: 0, strayT: 0 })
  ui.carryFrom ??= { x: b.x, y: b.y }
  b.item = null
  return true
}

/**
 * Put down what the hand carries at a ground point (cells), as much as goes there: all of it into the market, one to a
 * hungry sheep under the hand if it is hay, one onto an empty belt, into a machine's way in as many as it takes, the
 * rest onto the ground's pile on that cell. What doesn't go stays in the hand. Returns how many were put down.
 */
export function dropCarry(w: World, px: number, py: number) {
  const ui = res(w, Ui)
  const n0 = ui.carry.length
  if (!n0) return 0
  const x = Math.floor(px),
    y = Math.floor(py)
  const s = sheepAt(w, px, py)
  const b = inGrid(x, y) ? get(w, x, y) : null
  if (b?.type === 'dock') {
    for (const it of ui.carry) if (it.kind !== 'sheep') marketTake(w, it.kind, x, y)
    puff(w, px, py, LOOK.dust, 6)
    ui.carry = []
  } else if (s && hungry(s) && ui.carry.some((q) => q.kind === 'hay')) feedSheep(w, s)
  else if (b && isBeltLike(b)) {
    if (!b.item && b.type === 'belt') {
      const it = ui.carry.shift()!
      enterBelt(it, b.dir)
      it.p = 0.5
      b.item = it
    }
  } else if (b) {
    // into the machine by any of its ways in that takes the good
    ui.carry = ui.carry.filter((it) => !takenIn(w, b, it))
  } else ui.carry.splice(0, putPile(w, x, y, ui.carry, { x: px, y: py, h: HAND.carryAt, hand: true }).length)
  if (!ui.carry.length) ui.carryFrom = null
  return n0 - ui.carry.length
}
/** A machine takes a good from the hand by a way in that takes it (a station's good, a seeder's seeds). */
function takenIn(w: World, b: Building, it: Item) {
  for (const c of [0, 1, 2, 3] as const) {
    for (let dy = 0; dy < b.h; dy++)
      for (let dx = 0; dx < b.w; dx++) {
        const way = entersAt(b, b.x + dx, b.y + dy, c)
        if (way?.takes === it.kind && machineAccept(w, b, it, way.takes)) return true
      }
  }
  return false
}
/** What the hand carries goes down on the nearest own ground with room from a point (cancelled); what finds none stays in it. */
export function putDownCarry(w: World, px: number, py: number) {
  const ui = res(w, Ui)
  if (!ui.carry.length) return
  ui.carry = dropNear(w, Math.floor(px), Math.floor(py), ui.carry, { x: px, y: py, h: HAND.carryAt, hand: true })
  if (!ui.carry.length) ui.carryFrom = null
}

/**
 * A click with the hand at a ground point (cells): shear a fluffy sheep. With goods in the hand: take more from a pile
 * there while the hand has room, else put them down there; where none go, take more from a belt. Else: pick up a pile,
 * gather a resource on own land, open a popup (a building, a plot for sale, a pen) — in that order.
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
  if (ui.carry.length) {
    if (still) return pausedNudge(w)
    if (handRoom(w) > 0 && pickUp(w, x, y)) return
    // a resource of own land gathers on into the hand while it has room
    const t = inGrid(x, y) ? terr(w, x, y) : ''
    if ((t === 'meadow' || t === 'bush') && owned(w, x, y) && handRoom(w) > 0 && gather(w, x, y)) return
    if (dropCarry(w, px, py)) return
    const b = inGrid(x, y) ? get(w, x, y) : null
    if (b && isBeltLike(b) && pickFromBelt(w, b)) return
    float(w, px, py - 0.3, 'noRoom', 'bad')
    return
  }
  if (!inGrid(x, y)) return
  if (pileAt(w, x, y)) {
    if (still) return pausedNudge(w)
    pickUp(w, x, y)
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
  if (!owned(w, x, y)) {
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
 * A click on a building, wherever on its model it lands (the pointer picks it by its model): with goods in the hand
 * they go into it if it takes them; else a belt gives up its good into the hand, anything else is selected.
 */
export function clickBuilding(w: World, b: Building) {
  const ui = res(w, Ui)
  if (ui.carry.length && !handStill(w)) {
    if (dropCarry(w, b.x + 0.5, b.y + 0.5)) return
  }
  if (isBeltLike(b) && b.item && !b.item.sheep && !handStill(w) && pickFromBelt(w, b)) return
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
    // a full pen takes no one more: the sheep stays by its fence and roams
    if (roomFor(w, pa, s)) toPasture(w, s, pa, px, py)
    else {
      float(w, px, py - 0.4, 'noRoom', 'bad')
      toRoam(w, s, px, py)
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
