import { DIRS, GRID, type ResId, type TerrainId } from './balance'

/** A grid cell as written in mission tables. */
export type Spot = readonly [number, number]

/** Every cell of an inclusive rectangle. */
export function RECT(x0: number, y0: number, x1: number, y1: number): Spot[] {
  const a: Spot[] = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a.push([x, y])
  return a
}

/**
 * A deposit grown from a centre cell inside the columns xa..xb of one plot, never touching the plot's top and bottom
 * rows. Deterministic: the same seed gives the same shape, so a mission looks the same every time.
 */
export function BLOB(cx: number, cy: number, n: number, seed: number, xa: number, xb: number): Spot[] {
  const py = Math.floor(cy / GRID.plotH)
  const ok = (x: number, y: number) => x >= xa && x <= xb && y > py * GRID.plotH && y < (py + 1) * GRID.plotH - 1
  let s = (seed * 7919) % 233280
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280
  const cells: Spot[] = [[cx, cy]]
  const has = new Set([cx + ',' + cy])
  while (cells.length < n) {
    let best: [number, number, number] | null = null
    for (const [x, y] of cells)
      for (const [dx, dy] of DIRS) {
        const nx = x + dx,
          ny = y + dy
        if (!ok(nx, ny) || has.has(nx + ',' + ny)) continue
        const sc = Math.hypot(nx - cx, (ny - cy) * 1.7) + rnd() * 1.6
        if (!best || sc < best[2]) best = [nx, ny, sc]
      }
    if (!best) break
    cells.push([best[0], best[1]])
    has.add(best[0] + ',' + best[1])
  }
  return cells
}

/** One plot's deposits: `[resource, cells]`, one or two of them (two share the plot half and half). */
export type PlotDeposits = readonly (readonly [ResId, number])[]

/**
 * The land around the starting plots: every outer plot holds its own deposit, so each one is worth buying for
 * something (the author, 14.10.2026: «какой смысл от остальных»). `base` is the hand-placed terrain of the centre.
 */
export function LAND(base: Partial<Record<TerrainId, readonly Spot[]>>, spec: Readonly<Record<string, PlotDeposits>>): Partial<Record<TerrainId, Spot[]>> {
  const t: Partial<Record<TerrainId, Spot[]>> = {}
  for (const [k, v] of Object.entries(base) as [TerrainId, readonly Spot[]][]) t[k] = [...v]
  let seed = 3
  for (const [pk, deps] of Object.entries(spec)) {
    const [px = 0, py = 0] = pk.split(',').map(Number)
    const x0 = px * GRID.plotW,
      y0 = py * GRID.plotH
    deps.forEach(([type, n], i) => {
      const [xa, xb] = deps.length === 1 ? [x0 + 1, x0 + GRID.plotW - 2] : i === 0 ? [x0 + 1, x0 + 3] : [x0 + 4, x0 + 6]
      const cx = deps.length === 1 ? x0 + 3 + (seed % 2) : i === 0 ? x0 + 2 : x0 + 5
      ;(t[type] ??= []).push(...BLOB(cx, y0 + 2, n, seed++, xa, xb))
    })
  }
  return t
}
