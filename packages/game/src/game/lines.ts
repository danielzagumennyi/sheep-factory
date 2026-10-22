import { DIRS, dimsOf, type BuildingId, type Dir } from './balance'
import { dockIns, outCells, type InCell } from './grid'
import { Flock, Plant, blankBuilding, res, type World } from './world'
import { place } from './actions/build'
import { toRoam } from './systems/sheep'

/**
 * Lines into the portal, for the bot, the main menu's factory and the stress test: from one of the portal's ways in
 * straight out — a belt into the way in, the Shearer, two belts, a carrot at the far end. Sheep the carrot calls ride in,
 * are shorn and go into the portal (GDD 1).
 */

/** The portal's ways in: each the cell outside it and the way into the portal. */
export function portalPorts(w: World): InCell[] {
  for (const b of res(w, Plant).b.values()) if (b.type === 'dock') return dockIns(b)
  return []
}

/** The cell `k` steps out from a way in, along the line away from the portal (0 — the cell just outside it). */
export const along = (p: InCell, k: number): [number, number] => [p.x - DIRS[p.d]![0] * k, p.y - DIRS[p.d]![1] * k]

/** Where a building facing `dir` stands so that its way out leads into the cell (x, y). */
export function anchorForOut(type: BuildingId, dir: Dir, x: number, y: number): [number, number] | null {
  const [bw, bh] = dimsOf(type, dir)
  for (let ay = y - bh; ay <= y + 1; ay++)
    for (let ax = x - bw; ax <= x + 1; ax++) {
      const o = outCells(blankBuilding(type, ax, ay, dir))[0]
      if (o && o.x === x && o.y === y) return [ax, ay]
    }
  return null
}

/** Roaming sheep on a footprint step off it (the menu's factory and the tests build at once, where sheep stand). */
export function clearSheep(w: World, x: number, y: number, bw: number, bh: number) {
  for (const s of res(w, Flock).sheep)
    if (s.state === 'roam' && s.px >= x - 0.4 && s.px < x + bw + 0.4 && s.py >= y - 0.4 && s.py < y + bh + 0.4) {
      s.drop = undefined
      toRoam(w, s, x + bw + 1.5, s.py)
    }
}

/** Build one building facing `dir` with its way out into (x, y), sheep stepping off first; false when it may not stand. */
function placeOut(w: World, type: BuildingId, dir: Dir, x: number, y: number, free: boolean) {
  const at = anchorForOut(type, dir, x, y)
  if (!at) return false
  clearSheep(w, at[0], at[1], ...dimsOf(type, dir))
  return place(w, type, at[0], at[1], dir, free)
}

/**
 * One line from a way in of the portal: a belt into it, the Shearer, `belts` belts, a carrot (each facing the portal).
 * False, with whatever stood built left standing, when a piece may not go (a hill, water, a building in the way).
 */
export function buildLine(w: World, port: InCell, belts = 2, free = false) {
  const d = port.d
  const belt = (k: number) => {
    const [x, y] = along(port, k)
    clearSheep(w, x, y, 1, 1)
    return place(w, 'belt', x, y, d, free)
  }
  if (!belt(0) || !placeOut(w, 'shearer', d, ...along(port, 0), free)) return false
  for (let k = 3; k < 3 + belts; k++) if (!belt(k)) return false
  return placeOut(w, 'carrot', d, ...along(port, 2 + belts), free)
}
