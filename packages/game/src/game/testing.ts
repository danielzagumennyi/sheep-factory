import { GRID, MARKET, RES, type Dir, type TerrainId } from './balance'
import { Field, Plant, key, res, type World } from './world'

/**
 * For the tests of the rules that have nothing to do with the market or the map: the field with the market taken off,
 * bare of terrain and hills, and the island risen whole, so any land the test buys is open. Their first pen stands at
 * (11, 11) facing east (`TEST_PEN`). The market's own tests keep it.
 */
export const TEST_PEN = { x: 11, y: 11, dir: 0 as Dir }
export function openField(w: World) {
  const plant = res(w, Plant),
    at = key(MARKET.x, MARKET.y)
  plant.b.delete(at)
  for (const [k, v] of [...plant.occ]) if (v === at) plant.occ.delete(k)
  // nor the map's terrain and hills: each test lays what it needs (putTerrain)
  const f = res(w, Field)
  f.terrain.clear()
  f.res.clear()
  f.hills.clear()
  Object.assign(f, { left: 0, top: 0, right: GRID.cols, bottom: GRID.rows })
  return w
}

/** Terrain a test lays itself, as inclusive rectangles [x0, y0, x1, y1]: a meadow or bushes full, water, a tree. */
export function putTerrain(w: World, t: TerrainId, ...rects: [number, number, number, number][]) {
  const f = res(w, Field)
  for (const [x0, y0, x1, y1] of rects)
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        f.terrain.set(key(x, y), t)
        if (t === 'meadow' || t === 'bush') f.res.set(key(x, y), { t, left: RES[t].max, max: RES[t].max })
      }
}
