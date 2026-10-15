import { BLOCKING, BUILDINGS, DIRS, ESCALATE, dimsOf, GRID, PLOTS, REACH, RECIPES, RES, SHEEP, UPGRADE, type BuildingId, type Dir, type ItemId, type ResId, type TerrainId } from './balance'
import { Field, Flock, GameState, Plant, key, res, unkey, type Building, type PastureT, type ResCell, type World } from './world'

/**
 * Questions about the grid that every rule asks: what stands on a cell, who owns it, what a producer can reach, why a
 * building may not go here. Pure reads — nothing in this file changes the world.
 */

export const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID.cols && y < GRID.rows
/** The building standing on a cell — its top-left cell or any other cell of its footprint. */
export function get(w: World, x: number, y: number): Building | null {
  const plant = res(w, Plant),
    k = key(x, y)
  const b = plant.b.get(k)
  if (b) return b
  const a = plant.occ.get(k)
  return a ? (plant.b.get(a) ?? null) : null
}
/** The cells of a w×h footprint from its top-left cell. */
export function footprint(x: number, y: number, w: number, h: number): [number, number][] {
  const out: [number, number][] = []
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push([x + dx, y + dy])
  return out
}
/** A placed building's cells. */
export const cellsOf = (b: Building) => footprint(b.x, b.y, b.w, b.h)
/**
 * Where a building facing `dir` goes for a pointer at ground point (wx, wy): centred on the pointer — a 1×1 on the cell
 * under it, a 2×2 on the nearest grid corner, a 2×1 on the nearest cell edge across its length.
 */
export function anchorAt(type: BuildingId, dir: Dir, wx: number, wy: number): [number, number] {
  const [w, h] = dimsOf(type, dir)
  return [Math.round(wx - w / 2), Math.round(wy - h / 2)]
}
export const terr = (w: World, x: number, y: number): TerrainId | '' => res(w, Field).terrain.get(key(x, y)) ?? ''
export const plotOf = (x: number, y: number): [number, number] => [Math.floor(x / GRID.plotW), Math.floor(y / GRID.plotH)]
export const owned = (w: World, x: number, y: number) => res(w, Field).plots.has(key(...plotOf(x, y)))
export const isRoad = (_x: number, y: number) => y === GRID.roadY
export const isBeltLike = (b: Building | null | undefined): boolean => !!b && (b.type === 'belt' || b.type === 'splitter' || b.type === 'merger')
export const isMachine = (b: Building | null | undefined): boolean => !!b && !isBeltLike(b)
export const step = (x: number, y: number, d: number): [number, number] => [x + DIRS[d]![0], y + DIRS[d]![1]]
export const back = (d: number) => ((d + 2) % 4) as Dir

/** Does a push from (x, y) going d come into the pasture through its way in? */
export const entersPasture = (p: PastureT, x: number, y: number, d: number) => p.entry.x === x && p.entry.y === y && p.entry.d === d

export function pastureAt(w: World, x: number, y: number): PastureT | null {
  return res(w, Flock).pastures.find((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) ?? null
}

/** An owned, empty, buildable cell. */
export function freeCell(w: World, x: number, y: number) {
  return inGrid(x, y) && owned(w, x, y) && !pastureAt(w, x, y) && !isRoad(x, y) && !BLOCKING.includes(terr(w, x, y) as TerrainId) && !get(w, x, y)
}

export interface ReachCell {
  k: string
  r: ResCell
  d: number
  x: number
  y: number
}
/**
 * Resource cells of one kind whose middle lies within REACH of the middle of a producer's footprint (bw×bh from its
 * top-left cell) — a circle — nearest first (GDD 6.1); `own` keeps only bought land.
 */
export function reachCells(w: World, x: number, y: number, t: ResId, own = false, bw = 1, bh = 1): ReachCell[] {
  const f = res(w, Field)
  const a: ReachCell[] = []
  const mx = x + bw / 2,
    my = y + bh / 2
  for (let cy = Math.floor(my - REACH); cy <= Math.ceil(my + REACH); cy++)
    for (let cx = Math.floor(mx - REACH); cx <= Math.ceil(mx + REACH); cx++) {
      const d = (cx + 0.5 - mx) ** 2 + (cy + 0.5 - my) ** 2
      if (d > REACH * REACH) continue
      const k = key(cx, cy),
        r = f.res.get(k)
      if (!r || r.t !== t || (own && !owned(w, cx, cy))) continue
      a.push({ k, r, d, x: cx, y: cy })
    }
  return a.sort((p, q) => p.d - q.d || p.y - q.y || p.x - q.x)
}
export const reachStock = (w: World, x: number, y: number, t: ResId, bw = 1, bh = 1) => reachCells(w, x, y, t, true, bw, bh).reduce((s, c) => s + c.r.left, 0)
/** What a placed producer reaches. */
export const reachOf = (w: World, b: Building, t: ResId, own = false) => reachCells(w, b.x, b.y, t, own, b.w, b.h)

/** Why a building may not stand here — a key into UI.why, or '' when it may. */
export type WhyNot = '' | 'edge' | 'buyPlot' | 'road' | 'pasture' | 'onWater' | 'rock' | 'tree' | 'bush' | 'meadow' | 'taken' | 'bridge' | 'needMeadow' | 'needWater' | 'needBush' | 'foreignRes'
export function whyNot(w: World, type: BuildingId, x: number, y: number, dir: Dir = 0): WhyNot {
  const [bw, bh] = dimsOf(type, dir)
  // every cell of the footprint must be buildable
  for (const [cx, cy] of footprint(x, y, bw, bh)) {
    if (!inGrid(cx, cy)) return 'edge'
    if (!owned(w, cx, cy)) return 'buyPlot'
    if (isRoad(cx, cy)) return 'road'
    if (pastureAt(w, cx, cy)) return 'pasture'
    const t = terr(w, cx, cy)
    if (t === 'water') return 'onWater'
    if (t === 'rock' || t === 'tree' || t === 'bush' || t === 'meadow') return t
    const b = get(w, cx, cy)
    if (b && !(BUILDINGS[type].onBelt && b.type === 'belt')) return 'taken'
    if (t === 'bridge' && type !== 'belt') return 'bridge'
  }
  const near = BUILDINGS[type].near
  if (near && BUILDINGS[type].needsNear) {
    if (!reachCells(w, x, y, near, false, bw, bh).length) return near === 'meadow' ? 'needMeadow' : near === 'water' ? 'needWater' : 'needBush'
    if (!reachCells(w, x, y, near, true, bw, bh).length) return 'foreignRes'
  }
  return ''
}

// ---------------------------------------------------------------- belts: who feeds whom

/** The directions a building pushes out of. A shearer sends the sheep on and the wool to its right. */
function outDirs(b: Building): Dir[] {
  if (b.type === 'splitter') return [b.dir, ((b.dir + 1) % 4) as Dir, ((b.dir + 3) % 4) as Dir]
  if (b.type === 'shearer') return [b.dir, ((b.dir + 1) % 4) as Dir]
  if (b.type === 'dock' || b.type === 'barn') return []
  return [b.dir]
}

/** One output of a building: the cell it pushes into (x, y), its own cell it pushes from (sx, sy), the direction. */
export interface OutCell {
  x: number
  y: number
  sx: number
  sy: number
  d: Dir
}
/**
 * Where a building's goods leave: one cell per output side (the author: «один выход конечно, не два»). On a side two
 * cells wide it is the right-hand one as you face out, so turning a 2×2 walks its output round the square.
 */
export function outCells(b: Building): OutCell[] {
  return outDirs(b).map((d) => {
    const [sx, sy] = sideCell(b, d),
      [dx, dy] = DIRS[d]!
    return { x: sx + dx, y: sy + dy, sx, sy, d }
  })
}
/** The footprint cell a building pushes out of on side d: on that edge, the furthest towards the right hand. */
function sideCell(b: Building, d: Dir): [number, number] {
  const x0 = b.x,
    y0 = b.y,
    x1 = b.x + b.w - 1,
    y1 = b.y + b.h - 1
  // facing east the right hand is south, facing south it is west, and so on round
  if (d === 0) return [x1, y1]
  if (d === 1) return [x0, y1]
  if (d === 2) return [x0, y0]
  return [x1, y0]
}

/** Does a building of this type take goods in? Producers only give; a shearer takes sheep, a barn any good, the others their inputs. */
export const takesIn = (t: BuildingId | 'dock') => t === 'shearer' || t === 'workshop' || t === 'barn' || (t !== 'dock' && !!BUILDINGS[t].inp)

/** Where a building takes goods in. */
export interface InCell {
  /** The cell goods come from, just outside. */
  x: number
  y: number
  /** The footprint cell they come into. */
  sx: number
  sy: number
  /** The way they move as they come in: the building's own direction. */
  d: Dir
}
/**
 * The one way in (the author: «у зданий должен быть конкретный выход и вход»): from behind, into the back cell in line
 * with the output, so goods go straight through. Null for a producer, which takes nothing.
 */
export function inCell(b: Building): InCell | null {
  if (!takesIn(b.type)) return null
  const [ox, oy] = sideCell(b, b.dir)
  const sx = b.dir === 0 ? b.x : b.dir === 2 ? b.x + b.w - 1 : ox,
    sy = b.dir === 1 ? b.y : b.dir === 3 ? b.y + b.h - 1 : oy
  const [dx, dy] = DIRS[b.dir]!
  return { x: sx - dx, y: sy - dy, sx, sy, d: b.dir }
}
/**
 * Every way a building takes goods in — what the in arrows show, the same for every building (the author: «чтобы у
 * всего был один принцип»): a machine's or a barn's one way in; a splitter from behind; a merger from behind and both
 * sides; a belt from the side it takes from; a dock from every side that a belt can reach (not the dock row itself).
 */
export function inCells(w: World, b: Building): InCell[] {
  const from = (sx: number, sy: number, d: Dir): InCell => ({ x: sx - DIRS[d]![0], y: sy - DIRS[d]![1], sx, sy, d })
  if (b.type === 'merger') return [b.dir, ((b.dir + 1) % 4) as Dir, ((b.dir + 3) % 4) as Dir].map((d) => from(b.x, b.y, d))
  if (b.type === 'splitter') return [from(b.x, b.y, b.dir)]
  if (b.type === 'belt') return [from(b.x, b.y, beltInDir(w, b))]
  if (b.type === 'dock') {
    const out: InCell[] = []
    for (const [cx, cy] of cellsOf(b))
      for (const d of [0, 1, 2, 3] as Dir[]) {
        const c = from(cx, cy, d)
        const own = c.x >= b.x && c.x < b.x + b.w && c.y >= b.y && c.y < b.y + b.h
        if (!own && inGrid(c.x, c.y) && !isRoad(c.x, c.y) && c.y < GRID.roadY) out.push(c)
      }
    return out
  }
  const c = inCell(b)
  return c ? [c] : []
}
/** Does building t take a good that moves into its cell (tx, ty) going d? A dock takes from any side. */
export function entersAt(t: Building, tx: number, ty: number, d: Dir) {
  if (t.type === 'dock') return true
  const c = inCell(t)
  return !!c && c.sx === tx && c.sy === ty && c.d === d
}
/** Where to put a building so that its way in is the footprint cell (x, y) — a shearer on a pasture's exit. */
export function anchorForInput(type: BuildingId, dir: Dir, x: number, y: number): [number, number] {
  const [w, h] = dimsOf(type, dir)
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) {
      const c = inCell({ type, x: x - dx, y: y - dy, w, h, dir } as Building)
      if (c && c.sx === x && c.sy === y) return [x - dx, y - dy]
    }
  return [x, y]
}

/** Does the thing at (sx, sy) push into (tx, ty)? A pasture pushes into its exit cell. */
export function feeds(w: World, sx: number, sy: number, tx: number, ty: number) {
  const p = pastureAt(w, sx, sy)
  if (p) return p.exit.x === tx && p.exit.y === ty
  if (!inGrid(sx, sy)) return false
  const s = get(w, sx, sy)
  if (!s) return false
  return outCells(s).some((c) => c.x === tx && c.y === ty && c.sx === sx && c.sy === sy)
}

/**
 * The one side a belt takes items from (the author: «лента позволяла его не ставить» — joining two belts needs a
 * merger). Straight behind wins; otherwise the first side that feeds it.
 */
export function beltInDir(w: World, b: Building): Dir {
  if (feeds(w, b.x - DIRS[b.dir]![0], b.y - DIRS[b.dir]![1], b.x, b.y)) return b.dir
  for (const sd of [((b.dir + 1) % 4) as Dir, ((b.dir + 3) % 4) as Dir]) if (feeds(w, b.x - DIRS[sd]![0], b.y - DIRS[sd]![1], b.x, b.y)) return sd
  return b.dir
}

/** Is there somewhere to go from (x, y) towards d? */
export function targetOk(w: World, x: number, y: number, d: number) {
  const [tx, ty] = step(x, y, d)
  const p = pastureAt(w, tx, ty)
  if (p) return entersPasture(p, x, y, d)
  if (!inGrid(tx, ty)) return false
  const t = get(w, tx, ty)
  if (!t) return false
  if (t.type === 'dock') return true
  if (t.type === 'splitter') return d === t.dir
  if (isBeltLike(t)) return t.dir !== back(d)
  return entersAt(t, tx, ty, d as Dir)
}

// ---------------------------------------------------------------- jobs

export interface Job {
  inp: Partial<Record<ItemId, number>>
  out: ItemId
  time: number
}
/** What a processing building makes in one job: its own recipe, or for a workshop the recipe it is set to. */
export function jobOf(b: Pick<Building, 'type' | 'recipe'>): Job | null {
  if (b.type === 'dock') return null
  if (b.recipe) return RECIPES[b.recipe]
  const d = BUILDINGS[b.type]
  return d.inp && d.out && d.time ? { inp: d.inp, out: d.out, time: d.time } : null
}

// ---------------------------------------------------------------- prices

export function buildPrice(w: World, type: BuildingId) {
  const def = BUILDINGS[type]
  if (!def.escalate) return def.cost
  let n = 0
  for (const b of res(w, Plant).b.values()) if (b.type === type) n++
  return Math.round((def.cost * (1 + ESCALATE * n)) / 5) * 5
}
export function upgradePrice(b: Building) {
  return Math.round((BUILDINGS[b.type as BuildingId].cost * b.lvl) / 5) * 5 + UPGRADE.priceAdd
}
export const speedOf = (b: Building) => 1 + UPGRADE.speedPerLevel * (b.lvl - 1)
export const roomPrice = (p: PastureT) => SHEEP.roomBase + SHEEP.roomStep * p.grown

/** What a plot holds: cells per resource. */
export function plotRes(w: World, px: number, py: number): Partial<Record<ResId, number>> {
  const c: Partial<Record<ResId, number>> = {}
  for (const [k, t] of res(w, Field).terrain) {
    if (t !== 'meadow' && t !== 'water' && t !== 'bush') continue
    const [x, y] = unkey(k)
    if (Math.floor(x / GRID.plotW) === px && Math.floor(y / GRID.plotH) === py) c[t] = (c[t] ?? 0) + 1
  }
  return c
}
/**
 * A plot that never held anything is not for sale; a richer one costs more, and every purchase raises the next price
 * (GDD 6.2). One picked bare by hand stays for sale at the base price (the author: it could no longer be bought).
 */
export function plotPrice(w: World, px: number, py: number) {
  if (!res(w, Field).forSale.has(key(px, py)) || res(w, Field).plots.has(key(px, py))) return 0
  const v = (Object.entries(plotRes(w, px, py)) as [ResId, number][]).reduce((a, [t, n]) => a + RES[t].plotValue * n, 0)
  return Math.round(((PLOTS.base + v) * (1 + PLOTS.step * res(w, GameState).plotsBought)) / 5) * 5
}
export function plotAdjacent(w: World, px: number, py: number) {
  const plots = res(w, Field).plots
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([dx, dy]) => plots.has(key(px + dx!, py + dy!)))
}

export const residents = (w: World, p: PastureT) => res(w, Flock).sheep.filter((s) => s.home === p.id).length
