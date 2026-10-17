import { BLOCKING, BUILDINGS, DIRS, dimsOf, GRID, PLOTS, REACH, RECIPES, RES, SEED, type BuildingId, type Dir, type ItemId, type Job, type ResId, type TerrainId } from './balance'
import { Field, Flock, GameState, Plant, key, res, unkey, type Building, type PastureT, type ResCell, type World } from './world'

/**
 * Questions about the grid that every rule asks: what stands on a cell, who owns it, what a producer can reach, why a
 * building may not go here. Pure reads — nothing in this file changes the world.
 */

export const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID.cols && y < GRID.rows
/** Is the cell on the island (the far row and the east are under the sky until the island grows)? */
export const onIsland = (w: World, x: number, y: number) => inGrid(x, y) && y >= res(w, Field).top && x < res(w, Field).right
/** Is the plot on the island? */
export const plotOnIsland = (w: World, px: number, py: number) => py * GRID.plotH >= res(w, Field).top && px * GRID.plotW < res(w, Field).right
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
 * under it, a 2×2 on the nearest grid corner, a 2×1 on the nearest cell edge across its length, a 3×3 pen on the cell.
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
/** Is this a station on the sheep's loop (the shearer, the feeder, the dyer)? */
export const isStation = (b: Building | null | undefined) => !!b && b.type !== 'dock' && !!BUILDINGS[b.type].station

/** Does a push from (x, y) going d come into the pen through its way in? */
export const entersPasture = (p: PastureT, x: number, y: number, d: number) => p.entry.x === x && p.entry.y === y && p.entry.d === d

export function pastureAt(w: World, x: number, y: number): PastureT | null {
  return res(w, Flock).pastures.find((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) ?? null
}

/** An owned, empty, buildable cell. */
export function freeCell(w: World, x: number, y: number) {
  return onIsland(w, x, y) && owned(w, x, y) && !pastureAt(w, x, y) && !isRoad(x, y) && !BLOCKING.includes(terr(w, x, y) as TerrainId) && !get(w, x, y)
}

export interface ReachCell {
  k: string
  r: ResCell
  d: number
  x: number
  y: number
}
/** The cells whose middle lies within REACH of the middle of a bw×bh footprint from its top-left cell, nearest first. */
function circle(x: number, y: number, bw: number, bh: number) {
  const mx = x + bw / 2,
    my = y + bh / 2
  const out: { x: number; y: number; d: number }[] = []
  for (let cy = Math.floor(my - REACH); cy <= Math.ceil(my + REACH); cy++)
    for (let cx = Math.floor(mx - REACH); cx <= Math.ceil(mx + REACH); cx++) {
      const d = (cx + 0.5 - mx) ** 2 + (cy + 0.5 - my) ** 2
      if (d <= REACH * REACH) out.push({ x: cx, y: cy, d })
    }
  return out.sort((p, q) => p.d - q.d || p.y - q.y || p.x - q.x)
}
/**
 * Resource cells of one kind whose middle lies within REACH of the middle of a producer's footprint (bw×bh from its
 * top-left cell) — a circle — nearest first (GDD 6.1); `own` keeps only bought land.
 */
export function reachCells(w: World, x: number, y: number, t: ResId, own = false, bw = 1, bh = 1): ReachCell[] {
  const f = res(w, Field)
  const a: ReachCell[] = []
  for (const c of circle(x, y, bw, bh)) {
    const k = key(c.x, c.y),
      r = f.res.get(k)
    if (!r || r.t !== t || (own && !owned(w, c.x, c.y))) continue
    a.push({ k, r, d: c.d, x: c.x, y: c.y })
  }
  return a
}
export const reachStock = (w: World, x: number, y: number, t: ResId, bw = 1, bh = 1) => reachCells(w, x, y, t, true, bw, bh).reduce((s, c) => s + c.r.left, 0)
/** What a placed producer reaches. */
export const reachOf = (w: World, b: Building, t: ResId, own = false) => reachCells(w, b.x, b.y, t, own, b.w, b.h)
/** The empty own cells a seeder can sow, nearest first. */
export const sowable = (w: World, b: Pick<Building, 'x' | 'y' | 'w' | 'h'>) => circle(b.x, b.y, b.w, b.h).filter((c) => freeCell(w, c.x, c.y))

/** Why a building may not stand here — a key into WHY_TEXT, or '' when it may. */
export type WhyNot = '' | 'edge' | 'buyPlot' | 'road' | 'pasture' | 'onWater' | 'rock' | 'tree' | 'bush' | 'meadow' | 'sprout' | 'taken' | 'needBush' | 'foreignRes' | 'needPen' | 'penFull'
export function whyNot(w: World, type: BuildingId, x: number, y: number, dir: Dir = 0): WhyNot {
  // a sheep goes only into a pen with room
  if (type === 'sheep') {
    const p = pastureAt(w, x, y)
    return !p ? 'needPen' : residents(w, p) >= p.cap ? 'penFull' : ''
  }
  const [bw, bh] = dimsOf(type, dir)
  // every cell of the footprint must be buildable
  for (const [cx, cy] of footprint(x, y, bw, bh)) {
    if (!onIsland(w, cx, cy)) return 'edge'
    if (!owned(w, cx, cy)) return 'buyPlot'
    if (isRoad(cx, cy)) return 'road'
    if (pastureAt(w, cx, cy)) return 'pasture'
    const t = terr(w, cx, cy)
    if (t === 'water') return 'onWater'
    if (t === 'rock' || t === 'tree' || t === 'bush' || t === 'meadow' || t === 'sprout') return t
    const b = get(w, cx, cy)
    if (b && !(BUILDINGS[type].onBelt && b.type === 'belt')) return 'taken'
  }
  const near = BUILDINGS[type].near
  if (near && BUILDINGS[type].needsNear) {
    if (!reachCells(w, x, y, near, false, bw, bh).length) return 'needBush'
    if (!reachCells(w, x, y, near, true, bw, bh).length) return 'foreignRes'
  }
  return ''
}

// ---------------------------------------------------------------- belts: who feeds whom

/** The directions a building pushes out of. A shearer sends the sheep on and the wool to its right; a seeder only takes. */
function outDirs(b: Building): Dir[] {
  if (b.type === 'splitter') return [b.dir, ((b.dir + 1) % 4) as Dir, ((b.dir + 3) % 4) as Dir]
  if (b.type === 'shearer') return [b.dir, ((b.dir + 1) % 4) as Dir]
  if (b.type === 'dock' || b.type === 'seeder' || b.type === 'pen' || b.type === 'sow' || b.type === 'sheep') return []
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
function sideCell(b: Pick<Building, 'x' | 'y' | 'w' | 'h'>, d: Dir): [number, number] {
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

/** Does a building of this type take anything in? Producers only give. */
export const takesIn = (t: BuildingId | 'dock') => t !== 'dock' && t !== 'pen' && t !== 'sow' && t !== 'sheep' && (!!BUILDINGS[t].station || !!BUILDINGS[t].jobs || !!BUILDINGS[t].recipes || !!BUILDINGS[t].sows)

/** Where a building takes something in, and what that way in takes. */
export interface InCell {
  /** The cell it comes from, just outside. */
  x: number
  y: number
  /** The footprint cell it comes into. */
  sx: number
  sy: number
  /** The way it moves as it comes in: the building's own direction. */
  d: Dir
  /** What this way in takes: a sheep, one good, or (undefined) any good of the machine's jobs. */
  takes?: ItemId | 'sheep'
}
/**
 * The way in (the author: «у зданий должен быть конкретный выход и вход»): from behind, into the back cell in line with
 * the output, so goods go straight through. Null for a producer, which takes nothing.
 */
export function inCell(b: Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h' | 'dir'>): InCell | null {
  if (!takesIn(b.type)) return null
  const [ox, oy] = sideCell(b, b.dir)
  const sx = b.dir === 0 ? b.x : b.dir === 2 ? b.x + b.w - 1 : ox,
    sy = b.dir === 1 ? b.y : b.dir === 3 ? b.y + b.h - 1 : oy
  const [dx, dy] = DIRS[b.dir]!
  return { x: sx - dx, y: sy - dy, sx, sy, d: b.dir }
}
/** The other back cell of a 2×2: the second way in, for a station's good or a recipe's second input (GDD 4.1). */
function inCell2(b: Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h' | 'dir'>): InCell | null {
  const c = inCell(b)
  if (!c || b.w < 2 || b.h < 2) return null
  const sx = b.dir % 2 === 0 ? c.sx : c.sx === b.x ? b.x + 1 : b.x,
    sy = b.dir % 2 === 0 ? (c.sy === b.y ? b.y + 1 : b.y) : c.sy
  const [dx, dy] = DIRS[b.dir]!
  return { x: sx - dx, y: sy - dy, sx, sy, d: b.dir }
}
/**
 * A station's good comes in from its right-hand side, into the same back cell as the sheep — the side the shearer gives
 * its wool out of. A sheep loop round its pen turns left, so its right is the outside: the hay and the dye come from
 * outside the loop, and nothing has to cross it (docs/05-REWORK.md).
 */
function stationGoodIn(c: InCell): InCell {
  const r = ((c.d + 1) % 4) as Dir
  return { x: c.sx + DIRS[r]![0], y: c.sy + DIRS[r]![1], sx: c.sx, sy: c.sy, d: back(r) }
}
/**
 * A machine's ways in and what each takes: a station takes the sheep from behind, in line with its output, and its
 * good from its right; a workshop takes its recipe's first input in line and the second by the other back cell — so
 * no two goods ever share a belt into it, and nothing waits behind the wrong one (docs/05-REWORK.md); a carder, a
 * spinner or a felter takes any of its jobs' goods by one way in; a seeder its seeds.
 */
export function machineIns(b: Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h' | 'dir' | 'recipe' | 'seed'>): InCell[] {
  const c = inCell(b)
  if (!c || b.type === 'dock') return []
  const def = BUILDINGS[b.type]
  if (def.station) return def.uses ? [{ ...c, takes: 'sheep' }, { ...stationGoodIn(c), takes: def.uses }] : [{ ...c, takes: 'sheep' }]
  if (def.sows) return [{ ...c, takes: SEED[b.seed ?? 'meadow'] }]
  if (def.recipes) {
    const kinds = Object.keys(RECIPES[b.recipe ?? 'sweater'].inp) as ItemId[]
    const c2 = inCell2(b)
    return kinds.length > 1 && c2 ? [{ ...c, takes: kinds[0] }, { ...c2, takes: kinds[1] }] : [{ ...c, takes: kinds[0] }]
  }
  return [c]
}
/**
 * Every way a building takes something in — what the in arrows show, the same for every building (the author: «чтобы
 * у всего был один принцип»): a machine's ways in; a splitter from behind; a merger from behind and both sides; a belt
 * from the side it takes from; a dock from every side that a belt can reach (not the dock row itself).
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
  return machineIns(b)
}
/** The way in of building t that a good moving into its cell (tx, ty) going d comes by, or null. A dock takes from any side. */
export function entersAt(t: Building, tx: number, ty: number, d: Dir): InCell | true | null {
  if (t.type === 'dock') return true
  return machineIns(t).find((c) => c.sx === tx && c.sy === ty && c.d === d) ?? null
}
/**
 * What goes in by a way in, for its icon (the author: «нет нормальной индикации куда подсоединять овцу, а куда другой
 * ресурс»): a sheep or the station's good, a workshop's input for that hatch, the first good of a machine's jobs (a
 * carder shows wool though it takes pink too). Nothing for a belt, a splitter, a merger or a dock: they take anything.
 */
export function inGood(b: Pick<Building, 'type' | 'recipe'>, c: InCell): ItemId | 'sheep' | null {
  if (c.takes) return c.takes
  if (b.type === 'dock' || b.type === 'belt' || BUILDINGS[b.type].onBelt) return null
  const j = jobsOf(b)[0]
  return j ? (Object.keys(j.inp)[0] as ItemId) : null
}
/** What comes out by a way out, for its icon: the sheep from a station (the shearer's wool to its right), a producer's good, a machine's product. */
export function outGood(b: Pick<Building, 'type' | 'recipe' | 'dir'>, c: OutCell): ItemId | 'sheep' | null {
  if (b.type === 'dock' || b.type === 'belt' || BUILDINGS[b.type].onBelt) return null
  const def = BUILDINGS[b.type]
  if (def.station) return c.d === b.dir ? 'sheep' : 'wool'
  if (def.gives) return def.gives
  return jobsOf(b)[0]?.out ?? null
}
/** Where to put a building so that its way in is the footprint cell (x, y). */
export function anchorForInput(type: BuildingId, dir: Dir, x: number, y: number): [number, number] {
  const [w, h] = dimsOf(type, dir)
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) {
      const c = inCell({ type, x: x - dx, y: y - dy, w, h, dir })
      if (c && c.sx === x && c.sy === y) return [x - dx, y - dy]
    }
  return [x, y]
}

/** Does the thing at (sx, sy) push into (tx, ty)? A pen pushes into its exit cell; a splitter's closed side pushes nowhere. */
export function feeds(w: World, sx: number, sy: number, tx: number, ty: number) {
  const p = pastureAt(w, sx, sy)
  if (p) return p.exit.x === tx && p.exit.y === ty
  if (!inGrid(sx, sy)) return false
  const s = get(w, sx, sy)
  if (!s) return false
  return outCells(s).some((c) => c.x === tx && c.y === ty && c.sx === sx && c.sy === sy && !(s.rules && s.rules[c.d === s.dir ? 'f' : c.d === (s.dir + 1) % 4 ? 'r' : 'l'] === 'off'))
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

/**
 * How well a belt on (x, y) going d would hand its goods on: into a machine's way in, a pen's way in or a dock
 * best, straight on into a belt's back next, into a belt's free side a little, nowhere nothing — and worse than nothing
 * head-on into a belt, into a wall or a fence.
 */
function handOnScore(w: World, x: number, y: number, d: Dir): number {
  const [tx, ty] = step(x, y, d)
  const p = pastureAt(w, tx, ty)
  if (p) return entersPasture(p, x, y, d) ? 3 : -1
  if (!inGrid(tx, ty)) return -1
  const t = get(w, tx, ty)
  if (!t) return 0
  if (t.type === 'dock') return 3
  if (t.type === 'splitter') return d === t.dir ? 2 : -1
  if (t.type === 'merger') return t.dir === back(d) ? -1 : 2
  if (t.type === 'belt') {
    if (t.dir === back(d)) return -2
    if (t.dir === d) return 2.5
    // its side: taken only while nothing feeds it from straight behind
    return feeds(w, tx - DIRS[t.dir]![0], ty - DIRS[t.dir]![1], tx, ty) ? 0 : 1
  }
  return entersAt(t, tx, ty, d) ? 3 : -1
}
/**
 * The way a single belt set down on (x, y) should go, from what stands round it (the author: belts among two to four
 * neighbours «не совсем понимают куда нужно поворачиваться и к чему присоединяться»): on towards whatever takes goods
 * best, straight on from whatever feeds the cell, never back into a feeder; `rot` (the player's R) breaks ties and is
 * the answer when nothing round it says otherwise. A wrongly turned belt is turned by clicking it again.
 */
export function beltAutoDir(w: World, x: number, y: number, rot: Dir): Dir {
  const score = [0, 1, 2, 3].map((d) => handOnScore(w, x, y, d as Dir) + (d === rot ? 0.5 : 0))
  for (let s = 0; s < 4; s++) {
    const [nx, ny] = step(x, y, s)
    if (!feeds(w, nx, ny, x, y)) continue
    // goods come in from side s: going straight on is natural, turning back into their source is not
    score[back(s)]! += 1.5
    score[s]! -= 5
  }
  let best = rot
  for (let d = 0; d < 4; d++) if (score[d]! > score[best]!) best = d as Dir
  return score[best]! < 0 ? rot : best
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
  return !!entersAt(t, tx, ty, d as Dir)
}

// ---------------------------------------------------------------- jobs

/** Everything a machine can make: a workshop its recipe, a carder or spinner white and pink, a felter felt. */
export function jobsOf(b: Pick<Building, 'type' | 'recipe'>): readonly Job[] {
  if (b.type === 'dock') return []
  if (b.recipe) return [RECIPES[b.recipe]]
  return BUILDINGS[b.type].jobs ?? []
}
/** The machine's first job: what its popup and the book show first. */
export const jobOf = (b: Pick<Building, 'type' | 'recipe'>): Job | null => jobsOf(b)[0] ?? null
/** Does any of a machine's jobs take this good? */
export const usesGood = (b: Pick<Building, 'type' | 'recipe'>, k: ItemId) => jobsOf(b).some((j) => !!j.inp[k])

// ---------------------------------------------------------------- prices

/** No copy costs more and nothing is upgraded (docs/05-REWORK.md): a building costs what it costs. */
export const buildPrice = (_w: World, type: BuildingId) => BUILDINGS[type].cost

/** What a plot holds: cells per resource. */
export function plotRes(w: World, px: number, py: number): Partial<Record<ResId, number>> {
  const c: Partial<Record<ResId, number>> = {}
  for (const [k, t] of res(w, Field).terrain) {
    if (t !== 'meadow' && t !== 'bush') continue
    const [x, y] = unkey(k)
    if (Math.floor(x / GRID.plotW) === px && Math.floor(y / GRID.plotH) === py) c[t] = (c[t] ?? 0) + 1
  }
  return c
}
/** What a plot's deposits hold, in units. */
export function plotStock(w: World, px: number, py: number): Partial<Record<ResId, number>> {
  const c: Partial<Record<ResId, number>> = {}
  for (const [k, r] of res(w, Field).res) {
    const [x, y] = unkey(k)
    if (Math.floor(x / GRID.plotW) === px && Math.floor(y / GRID.plotH) === py) c[r.t] = (c[r.t] ?? 0) + r.left
  }
  return c
}
/**
 * A plot that never held anything is not for sale, nor one still under the sky; a richer one costs more, and every
 * purchase raises the next price (GDD 6.2).
 */
export function plotPrice(w: World, px: number, py: number) {
  const f = res(w, Field)
  if (!f.forSale.has(key(px, py)) || f.plots.has(key(px, py)) || !plotOnIsland(w, px, py)) return 0
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
/** May this sheep come to live in this pen: its own, or another one with room (four at most, PEN.cap). */
export const roomFor = (w: World, p: PastureT, s: { home: number }) => s.home === p.id || residents(w, p) < p.cap
