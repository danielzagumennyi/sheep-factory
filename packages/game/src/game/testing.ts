import { GRID, PORTAL, type TerrainId } from './balance'
import { Field, Flock, Plant, key, res, type World } from './world'

/**
 * For the tests of the rules that have nothing to do with the portal or the map: the field with the portal taken off,
 * bare of terrain, hills and sheep, so each test lays what it needs (putTerrain, makeSheep). The portal's own tests keep
 * it.
 */
export function openField(w: World, keepPortal = false) {
  const plant = res(w, Plant),
    at = key(PORTAL.x, PORTAL.y)
  if (!keepPortal) {
    plant.b.delete(at)
    for (const [k, v] of [...plant.occ]) if (v === at) plant.occ.delete(k)
  }
  const f = res(w, Field)
  f.terrain.clear()
  f.hills.clear()
  Object.assign(f, { left: 0, top: 0, right: GRID.cols, bottom: GRID.rows })
  res(w, Flock).sheep = []
  return w
}

/** Terrain a test lays itself, as inclusive rectangles [x0, y0, x1, y1]. */
export function putTerrain(w: World, t: TerrainId, ...rects: [number, number, number, number][]) {
  const f = res(w, Field)
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f.terrain.set(key(x, y), t)
}
