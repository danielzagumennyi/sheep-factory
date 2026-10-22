import { DIRS, GRID, MAP, PORTAL, type TerrainId } from './balance'
import { makeRng } from './rng'

/** A grid cell. */
export type Spot = readonly [number, number]
/** A hill's step: its level (2 or 3) and its inclusive rectangle of cells. */
export type HillRect = readonly [level: 2 | 3, x0: number, y0: number, x1: number, y1: number]

/** Every cell of an inclusive rectangle. */
export function RECT(x0: number, y0: number, x1: number, y1: number): Spot[] {
  const a: Spot[] = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a.push([x, y])
  return a
}

/** A blob of up to `n` cells grown from (cx, cy) over the cells `ok` allows, roundish, its shape by `rnd`. */
function blob(rnd: () => number, cx: number, cy: number, n: number, ok: (x: number, y: number) => boolean): Spot[] {
  if (!ok(cx, cy)) return []
  const cells: Spot[] = [[cx, cy]]
  const has = new Set([cx + ',' + cy])
  while (cells.length < n) {
    let best: [number, number, number] | null = null
    for (const [x, y] of cells)
      for (const [dx, dy] of DIRS) {
        const nx = x + dx!,
          ny = y + dy!
        if (!ok(nx, ny) || has.has(nx + ',' + ny)) continue
        const sc = Math.hypot(nx - cx, ny - cy) + rnd() * 1.6
        if (!best || sc < best[2]) best = [nx, ny, sc]
      }
    if (!best) break
    cells.push([best[0], best[1]])
    has.add(best[0] + ',' + best[1])
  }
  return cells
}

/**
 * The map made from its seed (GDD 2): hills, ponds, and patches of meadow, bushes, trees and rocks over the whole
 * 112×112, the same every time for the same seed. The ground round the portal stays bare (MAP.clear), so the game
 * opens on open grass; the first pond lies not far from it, for the first wash. Hills keep a cell of grass round them.
 */
export function makeMap(seed: number): { terrain: Map<string, TerrainId>; hills: Map<string, number>; hillRects: HillRect[] } {
  const rnd = makeRng(seed * 7919 + 17)
  const terrain = new Map<string, TerrainId>(),
    hills = new Map<string, number>(),
    hillRects: HillRect[] = []
  const k = (x: number, y: number) => x + ',' + y
  const between = ([a, b]: readonly [number, number]) => a + Math.floor(rnd() * (b - a + 1))
  // the portal and the bare ground round it; the map's edge rows, where the rim's fence stands
  const c0 = PORTAL.x - MAP.clear,
    c1 = PORTAL.x + PORTAL.size - 1 + MAP.clear
  const reserved = (x: number, y: number) => (x >= c0 && x <= c1 && y >= c0 && y <= c1) || x < 2 || y < 2 || x >= GRID.cols - 2 || y >= GRID.rows - 2
  const nearHill = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (hills.has(k(x + dx, y + dy))) return true
    return false
  }
  const free = (x: number, y: number) => !reserved(x, y) && !terrain.has(k(x, y)) && !nearHill(x, y)
  const at = () => [2 + Math.floor(rnd() * (GRID.cols - 4)), 2 + Math.floor(rnd() * (GRID.rows - 4))] as const
  // hills: a rise of the second level, often with a top of the third
  for (let i = 0; i < MAP.hills; i++)
    for (let t = 0; t < 40; t++) {
      const w = between(MAP.hillSize),
        h = between(MAP.hillSize)
      const [x0, y0] = at()
      const cells = RECT(x0, y0, x0 + w - 1, y0 + h - 1)
      if (!cells.every(([x, y]) => free(x, y) && !nearHill(x, y))) continue
      for (const [x, y] of cells) hills.set(k(x, y), 2)
      hillRects.push([2, x0, y0, x0 + w - 1, y0 + h - 1])
      if (w >= 4 && h >= 4 && rnd() < MAP.hillTop) {
        for (const [x, y] of RECT(x0 + 1, y0 + 1, x0 + w - 2, y0 + h - 2)) hills.set(k(x, y), 3)
        hillRects.push([3, x0 + 1, y0 + 1, x0 + w - 2, y0 + h - 2])
      }
      break
    }
  // ponds: the first a short walk from the portal, the rest anywhere
  for (let i = 0; i < MAP.ponds; i++)
    for (let t = 0; t < 40; t++) {
      let x: number, y: number
      if (i === 0) {
        const a = rnd() * Math.PI * 2,
          r = MAP.clear + PORTAL.size / 2 + MAP.firstPond[0] + rnd() * MAP.firstPond[1]
        x = Math.round(PORTAL.x + PORTAL.size / 2 + Math.cos(a) * r)
        y = Math.round(PORTAL.y + PORTAL.size / 2 + Math.sin(a) * r)
      } else [x, y] = at()
      const cells = blob(rnd, x, y, between(MAP.pondSize), free)
      if (cells.length < MAP.pondSize[0]) continue
      for (const [cx, cy] of cells) terrain.set(k(cx, cy), 'water')
      break
    }
  // the patches of the rest
  for (const [type, n] of Object.entries(MAP.patches) as [Exclude<TerrainId, 'water'>, number][])
    for (let i = 0; i < n; i++) {
      const [x, y] = at()
      for (const [cx, cy] of blob(rnd, x, y, between(MAP.patchSize[type]), free)) terrain.set(k(cx, cy), type)
    }
  return { terrain, hills, hillRects }
}
