import { GRID, type BuildingId, type Dir, type ItemId, type RecipeId } from './balance'
import { get, jobOf } from './grid'
import { place, setRecipe } from './actions/build'
import { buildShowcase } from './showcase'
import { enterBelt } from './systems/belts'
import { stepSimulation } from './systems'
import { Field, Flock, GameState, Plant, key, makeSheep, newItem, res, type World } from './world'

type Token = BuildingId | `workshop:${RecipeId}`
/** What each outer plot's three machines are, in turn round the plots (a workshop with the recipe it makes). */
const ROWS: Token[][] = [
  ['carder', 'spinner', 'felter'],
  ['felter', 'workshop:sweater', 'carder'],
  ['spinner', 'workshop:cyarn', 'felter'],
  ['carder', 'felter', 'workshop:valenki'],
  ['workshop:valenki', 'spinner', 'carder'],
  ['carder', 'workshop:sweater', 'spinner'],
  ['felter', 'spinner', 'workshop:cyarn'],
  ['carder', 'workshop:cyarn', 'felter'],
]
/** The goods that ride the loops. */
const RIDING: ItemId[] = ['wool', 'roving', 'yarn', 'felt', 'cyarn', 'sweater', 'hay', 'dye']

/** How big the stress factory is: these are the defaults the console and the test use. */
export const STRESS = { sheep: 48, pastureCap: 60, warmup: 20, stock: 60 } as const

/**
 * A factory far bigger than any mission's, for measuring the frame and the step (dev console `__game.stress()`, and
 * stress.test.ts): mission 7's showcase factory, every plot bought, and on each outer plot a belt loop round its edge,
 * every other cell carrying a good, round three working machines kept stocked; the pasture grown and full of sheep.
 */
export function buildStress(w: World, opts: { sheep?: number } = {}) {
  buildShowcase(w, 0)
  const f = res(w, Field),
    gs = res(w, GameState)
  gs.coins += 100_000
  const central = new Set(['1,1', '2,1', '1,2', '2,2'])
  let n = 0
  for (let py = 0; py * GRID.plotH < GRID.roadY; py++)
    for (let px = 0; px * GRID.plotW < GRID.cols; px++) {
      f.plots.add(key(px, py))
      if (central.has(key(px, py))) continue
      const x0 = px * GRID.plotW,
        y0 = py * GRID.plotH,
        x1 = x0 + GRID.plotW - 1,
        y1 = y0 + GRID.plotH - 1
      // the plot cleared of its deposits (water stays)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const t = f.terrain.get(key(x, y))
          if (t && t !== 'water' && t !== 'bridge') {
            f.terrain.delete(key(x, y))
            f.res.delete(key(x, y))
          }
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
      // three machines inside it side by side, giving south onto the free row above the loop's bottom edge
      ROWS[n % ROWS.length]!.forEach((token, j) => {
        const [type, recipe] = token.split(':') as [BuildingId, RecipeId | undefined]
        const mx = x0 + 1 + j * 2
        if (!place(w, type, mx, y0 + 1, 1, true)) return
        if (recipe) setRecipe(w, get(w, mx, y0 + 1)!, recipe)
      })
      n++
    }
  gs.fieldVersion++
  // the pasture grown and filled
  const p = res(w, Flock).pastures[0]!
  p.cap = STRESS.pastureCap
  const flock = res(w, Flock)
  for (let i = flock.sheep.length; i < (opts.sheep ?? STRESS.sheep); i++) flock.sheep.push(makeSheep(w, 0, true))
  feedStress(w)
  for (let t = 0; t < STRESS.warmup; t += 1 / 60) stepSimulation(w)
}

/** Keep the stress factory working: every machine stocked with what its job takes, and its pile cleared. */
export function feedStress(w: World) {
  for (const b of res(w, Plant).b.values()) {
    const job = jobOf(b)
    if (!job) continue
    for (const k of Object.keys(job.inp) as ItemId[]) b.inv[k] = Math.max(b.inv[k] ?? 0, STRESS.stock)
    b.pile.length = 0
  }
}
