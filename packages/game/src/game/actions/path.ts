import { BUILDINGS, DIRS, GRID, type Dir } from '../balance'
import { freeCell, get, inGrid, isBeltLike, outCells, owned, pastureAt, step, targetOk, terr } from '../grid'
import { Flock, GameState, Plant, res, type World } from '../world'
import { noMoney, place } from './build'

/**
 * Belt lines by two clicks (GDD 4.2): click near a machine's output, click near the target, and the cheapest path
 * between them is built — fewest cells, a small penalty per turn. The line is built whole or not at all: a stub in the
 * middle of the field is worse than nothing.
 */

export interface Cell {
  x: number
  y: number
}

let memo = { k: '', cells: null as Cell[] | null }

/** The cells of the cheapest belt path from a to b (b may be a building, or a pasture: then its way in), or null. */
export function routeCells(w: World, a: Cell, b: Cell): Cell[] | null {
  // a line drawn into a pasture goes to its way in
  const pa = pastureAt(w, b.x, b.y)
  if (pa) b = { x: pa.entry.x, y: pa.entry.y }
  const mk = a.x + ',' + a.y + '>' + b.x + ',' + b.y + ':' + res(w, GameState).fieldVersion + ':' + res(w, Plant).b.size
  if (memo.k === mk) return memo.cells
  let out: Cell[] | null = null
  if (a.x === b.x && a.y === b.y) out = [{ x: a.x, y: a.y }]
  else {
    const pass = (x: number, y: number) => (x === b.x && y === b.y) || freeCell(w, x, y) || (terr(w, x, y) === 'bridge' && owned(w, x, y) && !get(w, x, y))
    const K = (x: number, y: number, d: number) => (y * GRID.cols + x) * 5 + (d + 1)
    const dist = new Map<number, number>(),
      prev = new Map<number, number>()
    const open: [number, number, number, number][] = [[0, a.x, a.y, -1]]
    dist.set(K(a.x, a.y, -1), 0)
    let endK: number | null = null,
      guard = 0
    while (open.length && guard++ < 20000) {
      let bi = 0
      for (let i = 1; i < open.length; i++) if (open[i]![0] < open[bi]![0]) bi = i
      const [c, x, y, d0] = open[bi]!
      open[bi] = open[open.length - 1]!
      open.pop()
      const k0 = K(x, y, d0)
      if (c > (dist.get(k0) ?? 1e9)) continue
      if (x === b.x && y === b.y) {
        endK = k0
        break
      }
      for (let d = 0; d < 4; d++) {
        if (d0 >= 0 && d === (d0 + 2) % 4) continue
        const [nx, ny] = step(x, y, d)
        if (!inGrid(nx, ny) || !pass(nx, ny)) continue
        const nc = c + 1 + (d0 >= 0 && d !== d0 ? 0.45 : 0),
          k = K(nx, ny, d)
        if (nc < (dist.get(k) ?? 1e9)) {
          dist.set(k, nc)
          prev.set(k, k0)
          open.push([nc, nx, ny, d])
        }
      }
    }
    if (endK != null) {
      out = []
      let k: number | undefined = endK
      while (k != null) {
        const cell = Math.floor(k / 5)
        out.unshift({ x: cell % GRID.cols, y: Math.floor(cell / GRID.cols) })
        k = prev.get(k)
      }
    }
  }
  memo = { k: mk, cells: out }
  return out
}

export const stepDir = (a: Cell, b: Cell): Dir => {
  const dx = b.x - a.x,
    dy = b.y - a.y
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3
}

/** Does the belt line starting here lead to a shearer or back into a pasture (the sheep's lane)? */
function sheepLane(w: World, x: number, y: number) {
  for (let i = 0; i < 40; i++) {
    const t = inGrid(x, y) ? get(w, x, y) : null
    if (!t) return false
    if (t.type === 'shearer') return true
    if (!isBeltLike(t)) return false
    ;[x, y] = step(x, y, t.dir)
    if (pastureAt(w, x, y)) return true
  }
  return false
}
function sheepSource(w: World, c: Cell) {
  return (
    res(w, Flock).pastures.some((p) => p.exit.x === c.x && p.exit.y === c.y) ||
    [0, 1, 2, 3].some((d) => {
      const sx = c.x - DIRS[d]![0],
        sy = c.y - DIRS[d]![1]
      const t = inGrid(sx, sy) ? get(w, sx, sy) : null
      return !!t && t.type === 'shearer' && t.dir === d && outCells(t).some((o) => o.d === d && o.x === c.x && o.y === c.y)
    }) ||
    sheepLane(w, c.x, c.y)
  )
}

/** Directions along a path; the last cell turns into whatever it can feed, preferring a machine over a belt. */
export function pathDirs(w: World, cells: Cell[], rot: Dir): Dir[] {
  const dirs = cells.map((c, i) => (i < cells.length - 1 ? stepDir(c, cells[i + 1]!) : cells.length > 1 ? stepDir(cells[i - 1]!, c) : rot))
  const L = cells.length - 1
  if (L >= 1) {
    const c = cells[L]!,
      backD = (stepDir(cells[L - 1]!, c) + 2) % 4,
      sheepy = sheepSource(w, cells[0]!)
    if (!targetOk(w, c.x, c.y, dirs[L]!)) {
      const alt = ([0, 1, 2, 3] as Dir[]).filter((d) => {
        if (d === backD || !targetOk(w, c.x, c.y, d)) return false
        const [nx, ny] = step(c.x, c.y, d)
        return (pastureAt(w, nx, ny) ? sheepy : !!get(w, nx, ny)) && (sheepy || !sheepLane(w, nx, ny))
      })
      const best = alt.find((d) => !isBeltLike(get(w, ...step(c.x, c.y, d)))) ?? alt[0]
      if (best !== undefined) dirs[L] = best
    }
  }
  return dirs
}

export function buildPath(w: World, a: Cell, b: Cell, rot: Dir = 0): boolean {
  const cells = routeCells(w, a, b)
  if (!cells) return false
  const dirs = pathDirs(w, cells, rot),
    endB = cells.length > 1 && get(w, b.x, b.y)
  const need = cells.filter((c, i) => !get(w, c.x, c.y) && !(i === cells.length - 1 && pastureAt(w, c.x, c.y))).length * BUILDINGS.belt.cost
  if (res(w, GameState).coins < need) {
    noMoney(w)
    return false
  }
  let n = 0
  cells.forEach((c, i) => {
    if (i === cells.length - 1 && endB && endB.type !== 'belt') return
    const ex = get(w, c.x, c.y)
    if (ex && ex.type === 'belt') {
      if (i === 0 && cells.length > 1 && !targetOk(w, ex.x, ex.y, ex.dir)) ex.dir = dirs[0]!
      return
    }
    if (place(w, 'belt', c.x, c.y, dirs[i]!)) n++
  })
  return n > 0
}

/** Where a line drawn from this cell starts: a machine's free output cell, or the cell itself. */
export function beltStart(w: World, c: Cell): Cell | null {
  const b = inGrid(c.x, c.y) ? get(w, c.x, c.y) : null
  if (!b || b.type === 'belt') return c
  // a shearer's line starts on its wool side first; a workshop's on either front cell
  const outs = outCells(b).sort((p, q) => (b.type === 'shearer' ? (p.d === b.dir ? 1 : 0) - (q.d === b.dir ? 1 : 0) : 0))
  for (const c of outs) if (freeCell(w, c.x, c.y) || get(w, c.x, c.y)?.type === 'belt') return { x: c.x, y: c.y }
  return null
}
