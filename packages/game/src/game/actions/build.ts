import { BUILDINGS, LOOK, RECIPES, SHEEP, SPLIT_RULES, UPGRADE, type BuildingId, type Dir, type ItemId, type RecipeId, BLOCKING, dimsOf, type TerrainId } from '../balance'
import { beltInDir, buildPrice, footprint, get, plotAdjacent, plotPrice, residents, roomPrice, upgradePrice, whyNot, cellsOf, inGrid, owned, isRoad, pastureAt, terr } from '../grid'
import { Field, Flock, GameState, Plant, Stats, Ui, Unlocks, blankBuilding, float, key, makeSheep, newItem, puff, res, sound, toStock, type Building, type Item, type PastureT, type SplitRules, type World } from '../world'
import { sendHome } from '../systems/sheep'
import { fireEvent } from '../systems/unlocks'

/**
 * Commands that change what stands on the field: build, remove, rotate, upgrade, buy land and sheep. They are called by
 * the pointer, the HUD, the bot and the tests alike, between simulation steps. Coins are the only build currency.
 */

/** A purchase failed for lack of coins: the HUD shakes the counter when this count changes. */
export const noMoney = (w: World) => {
  res(w, GameState).noMoney++
}

function spend(w: World, n: number) {
  res(w, GameState).coins -= n
  res(w, Stats).spent += n
}

/** A machine whose output pile lies on this cell. */
export function pileHere(w: World, x: number, y: number): Building | null {
  for (const m of res(w, Plant).b.values()) if (m.pile.length && m.pileX === x && m.pileY === y) return m
  return null
}

/**
 * Build `type` with its top-left cell at (x, y), facing `dir` (its footprint is `dimsOf(type, dir)`; `anchorAt` finds
 * that cell for a pointer). A splitter or merger replaces the belt it is placed on and keeps its item.
 */
export function place(w: World, type: BuildingId, x: number, y: number, dir: Dir, free = false): boolean {
  if (!res(w, Unlocks).unlocked.has(type)) return false
  if (whyNot(w, type, x, y, dir)) return false
  const plant = res(w, Plant)
  const cells = footprint(x, y, ...dimsOf(type, dir))
  const ex = get(w, x, y),
    price = free ? 0 : buildPrice(w, type)
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
  // a workshop starts on the recipe last picked (or the newest learnt)
  if (BUILDINGS[type].recipes) {
    const un = res(w, Unlocks)
    const r = res(w, Ui).recipe
    b.recipe = un.recipes.has(r) ? r : ([...un.recipes][0] ?? 'cyarn')
  }
  if (type === 'splitter' && ex) b.dir = beltInDir(w, ex)
  if (item) b.item = item
  stand(w, b, cells)
  if (type !== 'belt') fireEvent(w, 'placed:' + type)
  return true
}

/** Put a building onto its cells; another machine's pile lying there goes to the stock, a little dust goes up. */
function stand(w: World, b: Building, cells: [number, number][]) {
  const plant = res(w, Plant)
  plant.b.set(key(b.x, b.y), b)
  for (const [cx, cy] of cells.slice(1)) plant.occ.set(key(cx, cy), key(b.x, b.y))
  for (const [cx, cy] of cells) {
    const pm = pileHere(w, cx, cy)
    if (!pm) continue
    for (const q of pm.pile) toStock(w, q)
    pm.pile = []
  }
  sound(w, 'place')
  // a little dust as it comes down onto its place
  if (b.type !== 'belt') puff(w, b.x + b.w / 2, b.y + b.h / 2, LOOK.dust, 10)
}

/** Take a building off the field, everything in it kept; sheep waiting at it go home, its pile goes to the stock. */
function takeOff(w: World, b: Building) {
  const plant = res(w, Plant)
  plant.b.delete(key(b.x, b.y))
  for (const [cx, cy] of cellsOf(b).slice(1)) plant.occ.delete(key(cx, cy))
  for (const q of b.pile) toStock(w, q)
  b.pile = []
  for (const s of res(w, Flock).sheep) if (s.state === 'waiting' && s.waitAt === key(b.x, b.y)) sendHome(w, s)
}

/**
 * Pick a machine up to move it (its menu's button, a right click on it): it leaves the field with all it holds and is
 * held like a building being placed, turned as it stood; `putDown` sets it where the player clicks, at no cost, and
 * `putBack` returns it if the move is called off. A belt cell, a splitter or a merger moves the same way (the author);
 * docks don't.
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
    if (ex.item && !b.item && b.type === 'splitter') b.item = ex.item
    else if (ex.item?.sheep) sendHome(w, ex.item.sheep)
    else if (ex.item) toStock(w, ex.item)
    res(w, Plant).b.delete(key(x, y))
  }
  // goods waiting to leave by a side that has turned keep their way out
  for (const o of b.outs) o.dir = ((o.dir + dir - b.dir + 4) % 4) as Dir
  Object.assign(b, { x, y, dir, w: bw, h: bh, pileX: x, pileY: y })
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

/** Remove a building (by any of its cells): coins come back in full, and nothing it held is lost — goods go to the hand or the ground. */
export function remove(w: World, x: number, y: number): boolean {
  const b = get(w, x, y)
  if (!b || b.fixed) return false
  x = b.x
  y = b.y
  res(w, GameState).coins += b.paid
  const lose: Item[] = [b.item, ...b.buf, ...b.pile, ...b.outs.map((o) => o.item)].filter((q): q is Item => !!q)
  if (b.slot?.sheep) lose.push({ kind: 'sheep', sheep: b.slot.sheep, p: 0, ed: 0, strayT: 0 })
  for (const [k, n] of Object.entries(b.inv) as [Item['kind'], number][]) for (let i = 0; i < n; i++) lose.push({ kind: k, p: 0, ed: 0, strayT: 0 })
  for (const it of lose) {
    if (it.sheep) sendHome(w, it.sheep)
    else toStock(w, it)
  }
  const plant = res(w, Plant)
  plant.b.delete(key(x, y))
  for (const [cx, cy] of cellsOf(b).slice(1)) plant.occ.delete(key(cx, cy))
  for (const s of res(w, Flock).sheep) if (s.state === 'waiting' && s.waitAt === key(x, y)) sendHome(w, s)
  const ui = res(w, Ui)
  if (ui.sel?.kind === 'b' && ui.sel.key === key(x, y)) ui.sel = null
  sound(w, 'remove')
  return true
}

/**
 * Turn a building a quarter clockwise (R); docks are fixed. A 2×1 swings round its top-left cell, so it turns only when
 * its new cells are free to build on.
 */
export function rotate(w: World, b: Building) {
  if (b.fixed) return false
  const dir = ((b.dir + 1) % 4) as Dir
  if (b.type === 'dock') return false
  const [nw, nh] = dimsOf(b.type, dir)
  if (nw !== b.w || nh !== b.h) {
    const plant = res(w, Plant),
      me = key(b.x, b.y)
    // its own cells don't count against it
    const cells = footprint(b.x, b.y, nw, nh)
    const blocked = cells.some(([cx, cy]) => {
      const o = get(w, cx, cy)
      if (o && o !== b) return true
      return !inGrid(cx, cy) || !owned(w, cx, cy) || isRoad(cx, cy) || !!pastureAt(w, cx, cy) || BLOCKING.includes(terr(w, cx, cy) as TerrainId)
    })
    if (blocked) {
      float(w, b.x + 0.5, b.y, 'taken', 'bad')
      return false
    }
    for (const [cx, cy] of cellsOf(b).slice(1)) plant.occ.delete(key(cx, cy))
    b.w = nw
    b.h = nh
    for (const [cx, cy] of cells.slice(1)) plant.occ.set(key(cx, cy), me)
  }
  b.dir = dir
  return true
}

export function upgrade(w: World, b: Building) {
  if (!BUILDINGS[b.type as BuildingId]?.upgradable || b.lvl >= UPGRADE.maxLevel) return false
  const p = upgradePrice(b)
  if (res(w, GameState).coins < p) {
    noMoney(w)
    return false
  }
  spend(w, p)
  b.lvl++
  b.paid += p
  return true
}

/**
 * Set what a workshop makes. Whatever it held for the old recipe — its store and a job in progress — goes back to the
 * stock, so nothing is lost; finished goods still leave as usual.
 */
export function setRecipe(w: World, b: Building, r: RecipeId) {
  if (!BUILDINGS[b.type as BuildingId]?.recipes || b.recipe === r || !res(w, Unlocks).recipes.has(r)) return false
  const back: Item[] = []
  for (const [k, n] of Object.entries(b.inv) as [ItemId, number][]) for (let i = 0; i < n; i++) back.push(newItem(k))
  if (b.slot && b.recipe) for (const [k, n] of Object.entries(RECIPES[b.recipe].inp) as [ItemId, number][]) for (let i = 0; i < n; i++) back.push(newItem(k))
  for (const it of back) toStock(w, it)
  b.inv = {}
  b.slot = null
  b.timer = b.total = 0
  b.recipe = r
  res(w, Ui).recipe = r
  return true
}

/** Cycle one of a splitter's three rules (left, forward, right). */
export function cycleRule(_w: World, b: Building, side: keyof SplitRules) {
  if (!b.rules) return
  const i = SPLIT_RULES.indexOf(b.rules[side] as (typeof SPLIT_RULES)[number])
  b.rules[side] = SPLIT_RULES[(i + 1) % SPLIT_RULES.length]!
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

export function buySheep(w: World, p: PastureT) {
  if (residents(w, p) >= p.cap) return false
  if (res(w, GameState).coins < SHEEP.price) {
    noMoney(w)
    return false
  }
  spend(w, SHEEP.price)
  const s = makeSheep(w, p.id)
  res(w, Flock).sheep.push(s)
  puff(w, s.px, s.py, LOOK.wool, 8)
  return true
}

export function growPasture(w: World, p: PastureT) {
  const c = roomPrice(p)
  if (res(w, GameState).coins < c) {
    noMoney(w)
    return false
  }
  spend(w, c)
  p.cap += SHEEP.roomAdd
  p.grown++
  return true
}
