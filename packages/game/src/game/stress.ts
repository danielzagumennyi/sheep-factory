import { BUILDINGS, GRID, type BuildingId, type Dir, type ItemId } from './balance'
import { get, pastureAt } from './grid'
import { place } from './actions/build'
import { buildShowcase, keepFull } from './showcase'
import { enterBelt } from './systems/belts'
import { stepSimulation } from './systems'
import { Field, Flock, GameState, Plant, key, makeSheep, newItem, res, type World } from './world'

/** What each far plot's three stations are, in turn. */
const ROWS: BuildingId[][] = [
  ['comb', 'curl', 'knit'],
  ['dyer', 'shearer', 'comb'],
  ['curl', 'feeder', 'knit'],
  ['comb', 'knit', 'dyer'],
]
/** The goods that ride the loops. */
const RIDING: ItemId[] = ['wool', 'cwool', 'thread', 'yarn', 'cyarn', 'felt', 'sweater', 'csweater', 'hay', 'dye']

/** How big the stress factory is: these are the defaults the console and the test use. */
export const STRESS = { sheep: 60, warmup: 20, stock: 60 } as const

/**
 * A factory bigger than the chapter's, for measuring the frame and the step (dev console `__game.stress()`, and
 * stress.test.ts): the showcase farm, and on each plot the farm leaves free a belt loop round its edge,
 * every other cell carrying a good, round three stations kept stocked; the pens filled past their places with sheep.
 */
export function buildStress(w: World, opts: { sheep?: number } = {}) {
  buildShowcase(w, 0)
  const f = res(w, Field),
    gs = res(w, GameState)
  gs.coins += 100_000
  let n = 0
  for (let py = 0; (py + 1) * GRID.plotH <= GRID.roadY; py++)
    for (let px = 0; px * GRID.plotW < GRID.cols; px++) {
      const x0 = px * GRID.plotW,
        y0 = py * GRID.plotH,
        x1 = x0 + GRID.plotW - 1,
        y1 = y0 + GRID.plotH - 1
      // only a plot the farm has left free
      let used = false
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(w, x, y) || pastureAt(w, x, y)) used = true
      if (used) continue
      // the plot cleared of its deposits
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          f.terrain.delete(key(x, y))
          f.res.delete(key(x, y))
        }
      // the loop, clockwise round the plot's edge
      const loop: [number, number, Dir][] = []
      for (let x = x0; x < x1; x++) loop.push([x, y0, 0])
      for (let y = y0; y < y1; y++) loop.push([x1, y, 1])
      for (let x = x1; x > x0; x--) loop.push([x, y1, 2])
      for (let y = y1; y > y0; y--) loop.push([x0, y, 3])
      loop.forEach(([x, y, d], i) => {
        if (!place(w, 'belt', x, y, d, true) || i % 2) return
        const b = get(w, x, y)!
        const it = newItem(RIDING[(n + i) % RIDING.length]!)
        enterBelt(it, d)
        b.item = it
      })
      // three stations inside it side by side, giving south onto the free row above the loop's bottom edge
      ROWS[n % ROWS.length]!.forEach((type, j) => place(w, type, x0 + 1 + j * 2, y0 + 1, 1, true))
      n++
    }
  gs.fieldVersion++
  // the pens filled past their places
  const flock = res(w, Flock)
  for (let i = flock.sheep.length; i < (opts.sheep ?? STRESS.sheep); i++) flock.sheep.push(makeSheep(w, flock.pastures[i % flock.pastures.length]!.id, true))
  feedStress(w)
  for (let t = 0; t < STRESS.warmup; t += 1 / 60) stepSimulation(w)
}

/** Keep the stress factory working: every station stocked with the good it uses, its pile cleared, the land full. */
export function feedStress(w: World) {
  for (const b of res(w, Plant).b.values()) {
    const uses = b.type === 'dock' ? undefined : BUILDINGS[b.type].uses
    if (uses) b.inv[uses] = Math.max(b.inv[uses] ?? 0, STRESS.stock)
    b.pile.length = 0
  }
  keepFull(w)
}
