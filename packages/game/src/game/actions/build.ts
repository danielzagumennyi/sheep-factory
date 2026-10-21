import { BUILDINGS, DROP, LOOK, PEN, SEED, SHEEP, SPLIT_RULES, type BuildingId, type Dir, type ItemId, type ResId, dimsOf } from '../balance'
import { beltInDir, buildPrice, footprint, get, plotAdjacent, plotPrice, residents, whyNot, cellsOf, pastureAt } from '../grid'
import { Field, Flock, GameState, Plant, Stats, Ui, Unlocks, blankBuilding, float, key, makePen, makeSheep, newItem, puff, res, sound, type Building, type Item, type PastureT, type SheepT, type SplitRules, type World } from '../world'
import { dropNear, shiftPile } from '../systems/ground'
import { sowAt } from '../systems/machines'
import { toRoam } from '../systems/sheep'
import { fireEvent } from '../systems/unlocks'

/**
 * Commands that change what stands on the field: build, remove, rotate, buy land and sheep, sow. They are called by the
 * pointer, the HUD, the bot and the tests alike, between simulation steps. Coins are the only build currency (the
 * author: paying goods for workshops is «очень странно»).
 */

/** A purchase failed for lack of coins: the HUD shakes the counter when this count changes. */
export const noMoney = (w: World) => {
  res(w, GameState).noMoney++
}

function spend(w: World, n: number) {
  res(w, GameState).coins -= n
  res(w, Stats).spent += n
}

/**
 * Build `type` with its top-left cell at (x, y), facing `dir` (its footprint is `dimsOf(type, dir)`; `anchorAt` finds
 * that cell for a pointer). A splitter or merger replaces the belt it is placed on and keeps its item; a pen is a
 * building of its own kind (GDD 5); a sheep is bought where it is put, into a pen or onto the grass (GDD 5); the sowing tool puts a seed
 * from the hand on the cell (GDD 6.1).
 */
export function place(w: World, type: BuildingId, x: number, y: number, dir: Dir, free = false): boolean {
  if (!res(w, Unlocks).unlocked.has(type)) return false
  if (whyNot(w, type, x, y, dir)) return false
  if (type === 'sow') return sowByHand(w, x, y)
  if (type === 'sheep') return buySheepAt(w, x, y, free)
  const price = free ? 0 : buildPrice(w, type)
  if (type === 'pen') {
    if (res(w, GameState).coins < price) {
      noMoney(w)
      return false
    }
    spend(w, price)
    res(w, Flock).pastures.push(makePen(w, x, y, dir, price))
    // goods lying where it stands move aside
    for (const [cx, cy] of footprint(x, y, PEN.size, PEN.size)) shiftPile(w, cx, cy)
    res(w, GameState).fieldVersion++
    sound(w, 'place')
    puff(w, x + 1.5, y + 1.5, LOOK.dust, 12)
    fireEvent(w, 'placed:pen')
    return true
  }
  const plant = res(w, Plant)
  const cells = footprint(x, y, ...dimsOf(type, dir))
  const ex = get(w, x, y)
  const refund = ex && ex.type === 'belt' ? ex.paid : 0
  if (res(w, GameState).coins + refund < price) {
    noMoney(w)
    return false
  }
  let item: Item | null = null
  if (ex) {
    item = ex.item
    plant.b.delete(key(x, y))
  }
  res(w, GameState).coins += refund
  spend(w, price)
  const b = blankBuilding(type, x, y, dir)
  b.paid = price
  // a seeder sows what the hand sows
  if (BUILDINGS[type].sows) b.seed = res(w, Ui).seed
  // set on a belt, a splitter takes goods the way they came in, a merger sends them on the way they went
  if (type === 'splitter' && ex) b.dir = beltInDir(w, ex)
  if (type === 'merger' && ex) b.dir = ex.dir
  if (item) b.item = item
  stand(w, b, cells)
  if (type !== 'belt') fireEvent(w, 'placed:' + type)
  return true
}

/** Sow one cell by hand (the author: «дать игроку возможность сеять»): a seed from the goods in the hand (PILE). */
function sowByHand(w: World, x: number, y: number) {
  const ui = res(w, Ui),
    t = ui.seed
  const i = ui.carry.findIndex((q) => q.kind === SEED[t])
  if (i < 0) {
    float(w, x + 0.5, y, 'noSeed', 'bad')
    return false
  }
  if (!sowAt(w, x, y, t)) return false
  ui.carry.splice(i, 1)
  if (!ui.carry.length) ui.carryFrom = null
  res(w, Stats).handSow++
  return true
}

/** Put a building onto its cells; goods lying there move to the nearest cell with room, a little dust goes up. */
function stand(w: World, b: Building, cells: [number, number][]) {
  const plant = res(w, Plant)
  res(w, GameState).plantVersion++
  plant.b.set(key(b.x, b.y), b)
  for (const [cx, cy] of cells.slice(1)) plant.occ.set(key(cx, cy), key(b.x, b.y))
  for (const [cx, cy] of cells) shiftPile(w, cx, cy)
  sound(w, 'place')
  // a little dust as it comes down onto its place
  if (b.type !== 'belt') puff(w, b.x + b.w / 2, b.y + b.h / 2, LOOK.dust, 10)
}

/** Take a building off the field, everything in it kept. */
function takeOff(w: World, b: Building) {
  const plant = res(w, Plant)
  res(w, GameState).plantVersion++
  plant.b.delete(key(b.x, b.y))
  for (const [cx, cy] of cellsOf(b).slice(1)) plant.occ.delete(key(cx, cy))
}

/**
 * Pick a machine up to move it (its menu's button, a right click on it): it leaves the field with all it holds and is
 * held like a building being placed, turned as it stood; `putDown` sets it where the player clicks, at no cost, and
 * `putBack` returns it if the move is called off. A belt cell, a splitter or a merger moves the same way (the author);
 * docks don't, nor pens (their sheep live in them).
 */
export function liftUp(w: World, b: Building): boolean {
  if (b.fixed || b.type === 'dock') return false
  const ui = res(w, Ui)
  putBack(w)
  takeOff(w, b)
  ui.moving = { b, x: b.x, y: b.y, dir: b.dir }
  ui.tool = b.type
  ui.rot = b.dir
  ui.pending = null
  ui.sel = null
  return true
}

/** Set the building being moved down at (x, y) facing `dir`, if it may stand there. */
export function putDown(w: World, x: number, y: number, dir: Dir): boolean {
  const ui = res(w, Ui),
    m = ui.moving
  if (!m) return false
  const b = m.b,
    type = b.type as BuildingId
  if (whyNot(w, type, x, y, dir)) return false
  const [bw, bh] = dimsOf(type, dir)
  const cells = footprint(x, y, bw, bh)
  // a splitter or merger set down on a belt takes that belt's place: its coins come back, its good comes along
  const ex = get(w, x, y)
  if (ex && ex.type === 'belt' && BUILDINGS[type].onBelt) {
    res(w, GameState).coins += ex.paid
    res(w, Plant).b.delete(key(x, y))
    // its good stays on a splitter; else it falls beside it, and a sheep on it steps off and roams
    if (ex.item && !b.item && b.type === 'splitter') b.item = ex.item
    else if (ex.item?.sheep) toRoam(w, ex.item.sheep, x + 0.5, y + 0.5)
    else if (ex.item) dropNear(w, x, y, [ex.item], { x: x + 0.5, y: y + 0.5, h: 0.25 })
  }
  // goods waiting to leave by a side that has turned keep their way out
  for (const o of b.outs) o.dir = ((o.dir + dir - b.dir + 4) % 4) as Dir
  Object.assign(b, { x, y, dir, w: bw, h: bh })
  stand(w, b, cells)
  ui.moving = null
  return true
}

/** Call off a move: the building goes back where it stood. */
export function putBack(w: World) {
  const ui = res(w, Ui),
    m = ui.moving
  if (!m) return
  if (!putDown(w, m.x, m.y, m.dir)) {
    // its place got taken meanwhile: it is sold back, as if removed
    ui.moving = null
    const b = m.b
    res(w, Plant).b.set(key(b.x, b.y), b)
    remove(w, b.x, b.y)
  }
}

/**
 * Remove a building (by any of its cells): coins come back in full, and nothing it held is lost — its goods fall in a
 * pile where it stood, a sheep in it steps off and roams from there (PILE). A pen goes only when no sheep lives in it.
 */
export function remove(w: World, x: number, y: number): boolean {
  const b = get(w, x, y)
  if (!b) {
    const p = pastureAt(w, x, y)
    return p ? removePen(w, p) : false
  }
  if (b.fixed) return false
  x = b.x
  y = b.y
  res(w, GameState).coins += b.paid
  const lose: Item[] = [b.item, ...b.buf, ...b.outs.map((o) => o.item)].filter((q): q is Item => !!q)
  if (b.slot?.sheep) lose.push({ kind: 'sheep', sheep: b.slot.sheep, p: 0, ed: 0, strayT: 0 })
  for (const [k, n] of Object.entries(b.inv) as [Item['kind'], number][]) for (let i = 0; i < n; i++) lose.push({ kind: k, p: 0, ed: 0, strayT: 0 })
  const plant = res(w, Plant)
  res(w, GameState).plantVersion++
  plant.b.delete(key(x, y))
  for (const [cx, cy] of cellsOf(b).slice(1)) plant.occ.delete(key(cx, cy))
  for (const it of lose) if (it.sheep) toRoam(w, it.sheep, it.sheep.px, it.sheep.py)
  dropNear(
    w,
    x,
    y,
    lose.filter((it) => !it.sheep),
    { x: x + b.w / 2, y: y + b.h / 2, h: 0.5 },
  )
  const ui = res(w, Ui)
  if (ui.sel?.kind === 'b' && ui.sel.key === key(x, y)) ui.sel = null
  sound(w, 'remove')
  return true
}

/** A pen with no sheep living in it comes off the field, its coins back. */
function removePen(w: World, p: PastureT) {
  if (residents(w, p) > 0) {
    float(w, p.x + 1.5, p.y + 0.5, 'penFull', 'bad')
    return false
  }
  const flock = res(w, Flock)
  flock.pastures = flock.pastures.filter((q) => q !== p)
  res(w, GameState).coins += p.paid
  res(w, GameState).fieldVersion++
  const ui = res(w, Ui)
  if (ui.sel?.kind === 'p' && ui.sel.id === p.id) ui.sel = null
  sound(w, 'remove')
  return true
}

/**
 * Turn a building a quarter clockwise (R); docks are fixed. It is lifted off for a moment to ask whether it may stand
 * turned (a 2×1 swings round its top-left cell), so it turns only where it could be built. Goods waiting to leave turn
 * with it; goods lying where it now stands move aside.
 */
export function rotate(w: World, b: Building) {
  if (b.fixed || b.type === 'dock') return false
  const dir = ((b.dir + 1) % 4) as Dir
  const plant = res(w, Plant),
    me = key(b.x, b.y)
  const was = cellsOf(b)
  plant.b.delete(me)
  for (const [cx, cy] of was.slice(1)) plant.occ.delete(key(cx, cy))
  const why = whyNot(w, b.type, b.x, b.y, dir)
  if (why) {
    plant.b.set(me, b)
    for (const [cx, cy] of was.slice(1)) plant.occ.set(key(cx, cy), me)
    float(w, b.x + 0.5, b.y, 'taken', 'bad')
    return false
  }
  const [nw, nh] = dimsOf(b.type, dir)
  for (const o of b.outs) o.dir = ((o.dir + 1) % 4) as Dir
  Object.assign(b, { dir, w: nw, h: nh })
  plant.b.set(me, b)
  for (const [cx, cy] of footprint(b.x, b.y, nw, nh).slice(1)) plant.occ.set(key(cx, cy), me)
  for (const [cx, cy] of footprint(b.x, b.y, nw, nh)) shiftPile(w, cx, cy)
  res(w, GameState).plantVersion++
  return true
}

/** Set what a seeder sows; the seeds it held fall in a pile beside it. */
export function setSeed(w: World, b: Building, t: ResId) {
  if (!BUILDINGS[b.type as BuildingId]?.sows || b.seed === t) return false
  dropNear(
    w,
    b.x,
    b.y,
    (Object.entries(b.inv) as [ItemId, number][]).flatMap(([k, n]) => Array.from({ length: n }, () => newItem(k))),
    { x: b.x + b.w / 2, y: b.y + b.h / 2, h: 0.4 },
  )
  b.inv = {}
  b.seed = t
  b.prog = 0
  res(w, Ui).seed = t
  return true
}

/** Cycle one of a splitter's three rules (left, forward, right) through the ones given (the goods the farm has met). */
export function cycleRule(_w: World, b: Building, side: keyof SplitRules, rules: readonly string[] = SPLIT_RULES) {
  if (!b.rules) return
  const i = rules.indexOf(b.rules[side] as string)
  b.rules[side] = rules[(i + 1) % rules.length] as SplitRules['l']
}

export function buyPlot(w: World, px: number, py: number) {
  const f = res(w, Field)
  const k = key(px, py)
  if (f.plots.has(k)) return false
  const price = plotPrice(w, px, py)
  if (!plotAdjacent(w, px, py) || !price) return false
  if (res(w, GameState).coins < price) {
    noMoney(w)
    return false
  }
  spend(w, price)
  f.plots.add(k)
  const gs = res(w, GameState)
  gs.plotsBought++
  gs.fieldVersion++
  return true
}

/**
 * A fluffy sheep bought where the player clicked (the author, 20.10.2026: «при покупке овца просто должна появляться на
 * поле, потом уже игрок переместит куда хочет»): into the pen there when it has room, or onto the free grass of cell
 * (x, y), roaming. Either way it floats down on a parachute first (DROP).
 */
export function buySheepAt(w: World, x: number, y: number, free = false) {
  const p = pastureAt(w, x, y)
  if (p) return buySheep(w, p, free)
  if (!pay(w, free)) return false
  arrive(w, makeSheep(w, 0, true, { x: x + 0.5, y: y + 0.5 }))
  return true
}

/** A fluffy sheep into a pen with room, floating down into it. */
export function buySheep(w: World, p: PastureT, free = false) {
  if (residents(w, p) >= p.cap) return false
  if (!pay(w, free)) return false
  arrive(w, makeSheep(w, p.id, true))
  return true
}

/** The sheep's price paid, unless it is free; false when the coins are short. */
function pay(w: World, free: boolean) {
  if (free) return true
  if (res(w, GameState).coins < SHEEP.price) {
    noMoney(w)
    return false
  }
  spend(w, SHEEP.price)
  return true
}

/** A new sheep into the flock, still up in the sky. */
function arrive(w: World, s: SheepT) {
  s.drop = DROP.fall + DROP.land
  res(w, Flock).sheep.push(s)
}
