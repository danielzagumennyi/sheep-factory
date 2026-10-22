import { BUILDINGS, LOOK, SPLIT_RULES, type BuildingId, type Dir, dimsOf } from '../balance'
import { beltInDir, buildPrice, footprint, get, whyNot, cellsOf } from '../grid'
import { Field, GameState, Plant, Stats, Ui, Unlocks, blankBuilding, float, key, puff, res, sound, type Building, type Item, type SplitRules, type World } from '../world'
import { shooRoamers, toRoam } from '../systems/sheep'
import { unlock } from '../systems/unlocks'

/**
 * Commands that change what stands on the field: buy a recipe, build, remove, move, rotate. They are called by the
 * pointer, the HUD, the bot and the tests alike, between simulation steps. Coins are the only currency (GDD 1).
 */

/** A purchase failed for lack of coins: the HUD shakes the counter when this count changes. */
export const noMoney = (w: World) => {
  res(w, GameState).noMoney++
}

function spend(w: World, n: number) {
  res(w, GameState).coins -= n
  res(w, Stats).spent += n
}

/** Buy a building's recipe — the right to build it (GDD 8). False when bought already or the coins are short. */
export function buyRecipe(w: World, type: BuildingId) {
  if (res(w, Unlocks).unlocked.has(type)) return false
  const price = BUILDINGS[type].recipe
  if (res(w, GameState).coins < price) {
    noMoney(w)
    return false
  }
  spend(w, price)
  unlock(w, type)
  return true
}

/**
 * Build `type` with its top-left cell at (x, y), facing `dir` (its footprint is `dimsOf(type, dir)`; `anchorAt` finds
 * that cell for a pointer) — once its recipe is bought. A splitter or merger replaces the belt it is placed on and keeps
 * its sheep.
 */
export function place(w: World, type: BuildingId, x: number, y: number, dir: Dir, free = false): boolean {
  if (!res(w, Unlocks).unlocked.has(type)) return false
  if (whyNot(w, type, x, y, dir)) return false
  const price = free ? 0 : buildPrice(w, type)
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
  // set on a belt, a splitter takes sheep the way they came in, a merger sends them on the way they went
  if (type === 'splitter' && ex) b.dir = beltInDir(w, ex)
  if (type === 'merger' && ex) b.dir = ex.dir
  if (item) b.item = item
  stand(w, b, cells)
  return true
}

/** Put a building onto its cells: a meadow there is cleared (GDD 2), roaming sheep on them run off, a little dust goes up. */
function stand(w: World, b: Building, cells: [number, number][]) {
  const plant = res(w, Plant),
    f = res(w, Field)
  res(w, GameState).plantVersion++
  plant.b.set(key(b.x, b.y), b)
  for (const [cx, cy] of cells.slice(1)) plant.occ.set(key(cx, cy), key(b.x, b.y))
  for (const [cx, cy] of cells)
    if (f.terrain.get(key(cx, cy)) === 'meadow') {
      f.terrain.delete(key(cx, cy))
      res(w, GameState).fieldVersion++
    }
  shooRoamers(w)
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
 * Pick a building up to move it (its menu's button, a right click on it): it leaves the field with all it holds and is
 * held like a building being placed, turned as it stood; `putDown` sets it where the player clicks, at no cost, and
 * `putBack` returns it if the move is called off. A belt cell, a splitter or a merger moves the same way (the author);
 * the portal doesn't.
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

/**
 * Set the building being moved down at (x, y) facing `dir`, if it may stand there. Going `back` to its own place, sheep
 * that wandered onto it meanwhile don't stop it: they step off.
 */
export function putDown(w: World, x: number, y: number, dir: Dir, back = false): boolean {
  const ui = res(w, Ui),
    m = ui.moving
  if (!m) return false
  const b = m.b,
    type = b.type as BuildingId
  const why = whyNot(w, type, x, y, dir)
  if (why && !(back && why === 'sheepHere')) return false
  const [bw, bh] = dimsOf(type, dir)
  const cells = footprint(x, y, bw, bh)
  // a splitter or merger set down on a belt takes that belt's place: its coins come back, its sheep comes along
  const ex = get(w, x, y)
  if (ex && ex.type === 'belt' && BUILDINGS[type].onBelt) {
    res(w, GameState).coins += ex.paid
    res(w, Plant).b.delete(key(x, y))
    // its sheep stays on a splitter; else it steps off and roams
    if (ex.item && !b.item && b.type === 'splitter') b.item = ex.item
    else if (ex.item) toRoam(w, ex.item.sheep, x + 0.5, y + 0.5)
  }
  // sheep waiting to leave by a side that has turned keep their way out
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
  if (!putDown(w, m.x, m.y, m.dir, true)) {
    // its place got taken meanwhile: it is sold back, as if removed
    ui.moving = null
    const b = m.b
    res(w, Plant).b.set(key(b.x, b.y), b)
    remove(w, b.x, b.y)
  }
}

/** Remove a building (by any of its cells): coins come back in full, and the sheep in it step off and roam from there. */
export function remove(w: World, x: number, y: number): boolean {
  const b = get(w, x, y)
  if (!b || b.fixed) return false
  x = b.x
  y = b.y
  res(w, GameState).coins += b.paid
  const sheep = [b.item, ...b.buf, ...b.outs.map((o) => o.item)].filter((q): q is Item => !!q).map((q) => q.sheep)
  if (b.slot) sheep.push(b.slot.sheep)
  takeOff(w, b)
  for (const s of sheep) toRoam(w, s, s.px, s.py)
  const ui = res(w, Ui)
  if (ui.sel?.kind === 'b' && ui.sel.key === key(x, y)) ui.sel = null
  sound(w, 'remove')
  return true
}

/**
 * Turn a building a quarter clockwise (R); the portal is fixed. It is lifted off for a moment to ask whether it may stand
 * turned, so it turns only where it could be built. Sheep waiting to leave turn with it.
 */
export function rotate(w: World, b: Building) {
  if (b.fixed || b.type === 'dock') return false
  const dir = ((b.dir + 1) % 4) as Dir
  const plant = res(w, Plant),
    me = key(b.x, b.y)
  const was = cellsOf(b)
  plant.b.delete(me)
  for (const [cx, cy] of was.slice(1)) plant.occ.delete(key(cx, cy))
  // turned on its own cells, sheep standing round it don't matter
  const why = whyNot(w, b.type, b.x, b.y, dir)
  if (why && why !== 'sheepHere') {
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
  res(w, GameState).plantVersion++
  shooRoamers(w)
  return true
}

/** Cycle one of a splitter's three rules (left, forward, right) through the ones given (GDD 4.4). */
export function cycleRule(_w: World, b: Building, side: keyof SplitRules, rules: readonly string[] = SPLIT_RULES) {
  if (!b.rules) return
  const i = rules.indexOf(b.rules[side] as string)
  b.rules[side] = rules[(i + 1) % rules.length] as SplitRules['l']
}
