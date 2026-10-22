import { BLOCKING, BUILDINGS, DIRS, dimsOf, GRID, PORTAL, WATER_REACH, type BuildingId, type Dir, type StationId, type TerrainId } from './balance'
import { Field, Flock, Plant, key, res, type Building, type World } from './world'

/**
 * Questions about the grid that every rule asks: what stands on a cell, who feeds whom, why a building may not go here.
 * Pure reads — nothing in this file changes the world.
 */

export const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID.cols && y < GRID.rows
/** Is the cell on the island (the whole map)? */
export function onIsland(w: World, x: number, y: number) {
  const f = res(w, Field)
  return x >= f.left && y >= f.top && x < f.right && y < f.bottom
}
/** The level of a hill on the cell, 2 or 3; 1 is the ground (HILL). */
export const levelAt = (w: World, x: number, y: number) => res(w, Field).hills.get(key(x, y)) ?? 1
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
 * under it, a 2×2 on the nearest grid corner.
 */
export function anchorAt(type: BuildingId, dir: Dir, wx: number, wy: number): [number, number] {
  const [w, h] = dimsOf(type, dir)
  return [Math.round(wx - w / 2), Math.round(wy - h / 2)]
}
export const terr = (w: World, x: number, y: number): TerrainId | '' => res(w, Field).terrain.get(key(x, y)) ?? ''
export const isBeltLike = (b: Building | null | undefined): boolean => !!b && (b.type === 'belt' || b.type === 'splitter' || b.type === 'merger')
export const step = (x: number, y: number, d: number): [number, number] => [x + DIRS[d]![0], y + DIRS[d]![1]]
export const back = (d: number) => ((d + 2) % 4) as Dir
/** Is this a station (the wash, the comb, the picker, the shearer: GDD 4.3)? */
export const isStation = (b: Building | null | undefined) => !!b && b.type !== 'dock' && !!BUILDINGS[b.type].station

/** An empty, buildable cell: on the ground, not up a hill, not on blocking ground. */
export function freeCell(w: World, x: number, y: number) {
  return onIsland(w, x, y) && levelAt(w, x, y) === 1 && !BLOCKING.includes(terr(w, x, y) as TerrainId) && !get(w, x, y)
}

/** The cells whose middle lies within `r` of the middle of a bw×bh footprint from its top-left cell, nearest first. */
export function circle(x: number, y: number, bw: number, bh: number, r: number) {
  const mx = x + bw / 2,
    my = y + bh / 2
  const out: { x: number; y: number; d: number }[] = []
  for (let cy = Math.floor(my - r); cy <= Math.ceil(my + r); cy++)
    for (let cx = Math.floor(mx - r); cx <= Math.ceil(mx + r); cx++) {
      const d = (cx + 0.5 - mx) ** 2 + (cy + 0.5 - my) ** 2
      if (d <= r * r) out.push({ x: cx, y: cy, d })
    }
  return out.sort((p, q) => p.d - q.d || p.y - q.y || p.x - q.x)
}
/** Is there water within WATER_REACH of a bw×bh footprint (the wash stands only by water: GDD 4.3)? */
export const waterNear = (w: World, x: number, y: number, bw: number, bh: number) => circle(x, y, bw, bh, WATER_REACH).some((c) => terr(w, c.x, c.y) === 'water')
/** A roaming sheep (or one coming down) stands on a cell of the w×h footprint from (x, y). */
export function sheepOn(w: World, x: number, y: number, bw: number, bh: number) {
  for (const s of res(w, Flock).sheep) if (s.state === 'roam' && s.px >= x && s.px < x + bw && s.py >= y && s.py < y + bh) return true
  return false
}

/** Why a building may not stand here — a key into WHY_TEXT, or '' when it may. */
export type WhyNot = '' | 'edge' | 'hill' | 'onWater' | 'rock' | 'tree' | 'bush' | 'taken' | 'needWater' | 'sheepHere'
export function whyNot(w: World, type: BuildingId, x: number, y: number, dir: Dir = 0): WhyNot {
  const [bw, bh] = dimsOf(type, dir)
  // every cell of the footprint must be buildable; a meadow is only landscape, the building clears it
  for (const [cx, cy] of footprint(x, y, bw, bh)) {
    if (!onIsland(w, cx, cy)) return 'edge'
    if (levelAt(w, cx, cy) > 1) return 'hill'
    const t = terr(w, cx, cy)
    if (t === 'water') return 'onWater'
    if (t === 'rock' || t === 'tree' || t === 'bush') return t
    const b = get(w, cx, cy)
    if (b && !(BUILDINGS[type].onBelt && b.type === 'belt')) return 'taken'
  }
  if (BUILDINGS[type].needsWater && !waterNear(w, x, y, bw, bh)) return 'needWater'
  // where a sheep stands nothing is built (the author, 22.10.2026) — but a belt, sheep step over belts anyway, and the
  // scarecrow, which is how a place is cleared: the sheep under it run off
  if (type !== 'belt' && !BUILDINGS[type].onBelt && !BUILDINGS[type].scare && sheepOn(w, x, y, bw, bh)) return 'sheepHere'
  return ''
}

// ---------------------------------------------------------------- belts: who feeds whom

/** The directions a building pushes out of: a splitter three, the portal and a scarecrow none, the rest one. */
function outDirs(b: Building): Dir[] {
  if (b.type === 'splitter') return [b.dir, ((b.dir + 1) % 4) as Dir, ((b.dir + 3) % 4) as Dir]
  if (b.type === 'dock' || b.type === 'scare') return []
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
 * Where a building's sheep leave: one cell per output side (the author: «один выход конечно, не два»). On a side two
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

/** Does a building of this type take sheep in by a way of its own? Only stations: a carrot only gives. */
export const takesIn = (t: BuildingId | 'dock') => t !== 'dock' && !!BUILDINGS[t].station

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
  /** Which sheep this way in takes: a station's (for its job), or the portal's — a shorn one. */
  takes?: StationId | 'portal'
}
/**
 * The way in (the author: «у зданий должен быть конкретный выход и вход»): from behind, into the back cell in line with
 * the output, so a sheep goes straight through. Null for what takes nothing.
 */
export function inCell(b: Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h' | 'dir'>): InCell | null {
  if (!takesIn(b.type)) return null
  const [ox, oy] = sideCell(b, b.dir)
  const sx = b.dir === 0 ? b.x : b.dir === 2 ? b.x + b.w - 1 : ox,
    sy = b.dir === 1 ? b.y : b.dir === 3 ? b.y + b.h - 1 : oy
  const [dx, dy] = DIRS[b.dir]!
  return { x: sx - dx, y: sy - dy, sx, sy, d: b.dir }
}
/** A station's way in, and which sheep it takes: the ones its job is for (GDD 4.3). */
export function machineIns(b: Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h' | 'dir'>): InCell[] {
  const c = inCell(b)
  if (!c || b.type === 'dock') return []
  return [{ ...c, takes: BUILDINGS[b.type].station }]
}
/**
 * The portal's ways in (PORTAL.ports): on each side two cells, each taking what moves into it from the cell outside —
 * west, north, east, south. They take shorn sheep.
 */
export function dockIns(b: Pick<Building, 'x' | 'y' | 'w' | 'h'>): InCell[] {
  const out: InCell[] = []
  for (const o of PORTAL.ports) {
    out.push({ x: b.x - 1, y: b.y + o, sx: b.x, sy: b.y + o, d: 0, takes: 'portal' })
    out.push({ x: b.x + o, y: b.y - 1, sx: b.x + o, sy: b.y, d: 1, takes: 'portal' })
    out.push({ x: b.x + b.w, y: b.y + o, sx: b.x + b.w - 1, sy: b.y + o, d: 2, takes: 'portal' })
    out.push({ x: b.x + o, y: b.y + b.h, sx: b.x + o, sy: b.y + b.h - 1, d: 3, takes: 'portal' })
  }
  return out
}
/**
 * Every way a building takes something in — what the in arrows show, the same for every building (the author: «чтобы
 * у всего был один принцип»): a machine's ways in; a splitter from behind; a merger from behind and both sides; a belt
 * from the side it takes from; the portal by its ways in.
 */
export function inCells(w: World, b: Building): InCell[] {
  const from = (sx: number, sy: number, d: Dir): InCell => ({ x: sx - DIRS[d]![0], y: sy - DIRS[d]![1], sx, sy, d })
  if (b.type === 'merger') return [b.dir, ((b.dir + 1) % 4) as Dir, ((b.dir + 3) % 4) as Dir].map((d) => from(b.x, b.y, d))
  if (b.type === 'splitter') return [from(b.x, b.y, b.dir)]
  if (b.type === 'belt') return [from(b.x, b.y, beltInDir(w, b))]
  if (b.type === 'dock') return dockIns(b)
  return machineIns(b)
}
/** The way in of building t that a sheep moving into its cell (tx, ty) going d comes by, or null. */
export function entersAt(t: Building, tx: number, ty: number, d: Dir): InCell | null {
  return (t.type === 'dock' ? dockIns(t) : machineIns(t)).find((c) => c.sx === tx && c.sy === ty && c.d === d) ?? null
}
/**
 * Which sheep goes in by a way in, for its icon (the author: «нет нормальной индикации куда подсоединять»): a station's
 * (dirty for the wash, …, ready for the shearer), shorn for the portal. Nothing for a belt, a splitter or a merger: they
 * take any.
 */
export function inGood(_b: Pick<Building, 'type'>, c: InCell): StationId | 'portal' | null {
  return c.takes ?? null
}
/** What comes out by a way out, for its icon: a sheep, from a station or a carrot. */
export function outGood(b: Pick<Building, 'type' | 'dir'>, _c: OutCell): 'sheep' | null {
  if (b.type === 'dock' || b.type === 'belt' || BUILDINGS[b.type].onBelt) return null
  return 'sheep'
}
/** Does the thing at (sx, sy) push into (tx, ty)? A splitter's closed side pushes nowhere. */
export function feeds(w: World, sx: number, sy: number, tx: number, ty: number) {
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
 * How well a belt on (x, y) going d would hand its sheep on: into a station's or the portal's way in best, straight on
 * into a belt's back next, into a belt's free side a little, nowhere nothing — and worse than nothing head-on into a
 * belt or into a wall.
 */
function handOnScore(w: World, x: number, y: number, d: Dir): number {
  const [tx, ty] = step(x, y, d)
  if (!inGrid(tx, ty)) return -1
  const t = get(w, tx, ty)
  if (!t) return 0
  if (t.type === 'dock') return entersAt(t, tx, ty, d) ? 3 : -1
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
 * neighbours «не совсем понимают куда нужно поворачиваться и к чему присоединяться»): on towards whatever takes sheep
 * best, straight on from whatever feeds the cell, never back into a feeder; `rot` (the player's R) breaks ties and is
 * the answer when nothing round it says otherwise. A wrongly turned belt is turned by clicking it again.
 */
export function beltAutoDir(w: World, x: number, y: number, rot: Dir): Dir {
  const score = [0, 1, 2, 3].map((d) => handOnScore(w, x, y, d as Dir) + (d === rot ? 0.5 : 0))
  for (let s = 0; s < 4; s++) {
    const [nx, ny] = step(x, y, s)
    if (!feeds(w, nx, ny, x, y)) continue
    // sheep come in from side s: going straight on is natural, turning back into their source is not
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
  if (!inGrid(tx, ty)) return false
  const t = get(w, tx, ty)
  if (!t) return false
  if (t.type === 'splitter') return d === t.dir
  if (isBeltLike(t)) return t.dir !== back(d)
  return !!entersAt(t, tx, ty, d as Dir)
}

// ---------------------------------------------------------------- prices

/** No copy costs more and nothing is upgraded: a building costs what it costs (GDD 4.1). */
export const buildPrice = (_w: World, type: BuildingId) => BUILDINGS[type].cost
