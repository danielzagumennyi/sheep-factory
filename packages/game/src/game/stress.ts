import { GRID, SHEEP } from './balance'
import { freeCell } from './grid'
import { place } from './actions/build'
import { enterBelt } from './systems/belts'
import { stepSimulation } from './systems'
import { buildShowcase } from './showcase'
import { Flock, Plant, Rng, key, makeSheep, newItem, res, type World } from './world'

/** How big the stress factory is: these are the defaults the console and the test use. */
export const STRESS = { sheep: 3000, warmup: 20, loops: 40 } as const

/**
 * A factory bigger than a real one, for measuring the frame and the step (dev console `__game.stress()`, and
 * stress.test.ts): the menu's factory, belt loops all over the free ground with a sheep on every other cell, and the
 * flock topped up to `sheep` (no more than SHEEP.most).
 */
export function buildStress(w: World, opts: { sheep?: number } = {}) {
  buildShowcase(w, 0)
  const plant = res(w, Plant),
    flock = res(w, Flock).sheep
  let n = 0
  for (let y0 = 4; y0 + 6 < GRID.rows && n < STRESS.loops; y0 += 9)
    for (let x0 = 4; x0 + 6 < GRID.cols && n < STRESS.loops; x0 += 9) {
      const x1 = x0 + 5,
        y1 = y0 + 5
      // only where every cell of the loop is free
      const loop: [number, number, 0 | 1 | 2 | 3][] = []
      for (let x = x0; x < x1; x++) loop.push([x, y0, 0])
      for (let y = y0; y < y1; y++) loop.push([x1, y, 1])
      for (let x = x1; x > x0; x--) loop.push([x, y1, 2])
      for (let y = y1; y > y0; y--) loop.push([x0, y, 3])
      if (!loop.every(([x, y]) => freeCell(w, x, y))) continue
      loop.forEach(([x, y, d], i) => {
        if (!place(w, 'belt', x, y, d, true) || i % 2) return
        const s = makeSheep(w, 'plain', { x: x + 0.5, y: y + 0.5 })
        const it = newItem(s)
        enterBelt(it, d)
        plant.b.get(key(x, y))!.item = it
        flock.push(s)
      })
      n++
    }
  const want = Math.min(opts.sheep ?? STRESS.sheep, SHEEP.most),
    rnd = res(w, Rng).next
  for (let t = 0; flock.length < want && t < want * 4; t++) {
    const x = 1 + Math.floor(rnd() * (GRID.cols - 2)),
      y = 1 + Math.floor(rnd() * (GRID.rows - 2))
    if (freeCell(w, x, y)) flock.push(makeSheep(w, 'plain', { x: x + 0.5, y: y + 0.5 }))
  }
  for (let t = 0; t < STRESS.warmup; t += 1 / 60) stepSimulation(w)
}
