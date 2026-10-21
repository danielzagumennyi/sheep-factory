import { expect, it } from 'vitest'
import { buildStress, feedStress } from './stress'
import { startWorld } from './start'
import { stepSimulation } from './systems'
import { Flock, Plant, res } from './world'

/**
 * The stress factory (stress.ts) — far bigger than any mission — must simulate well inside a frame and keep moving.
 * The budget is generous (a 120 Hz frame is 8.3 ms and the step is only part of it): this catches a step that has
 * become quadratic, not a few percent.
 */
it('a big factory steps in well under a millisecond and keeps flowing', () => {
  const w = startWorld({ seed: 4 })
  buildStress(w)
  const plant = [...res(w, Plant).b.values()]
  const belts = plant.filter((b) => b.type === 'belt')
  const machines = plant.filter((b) => b.type !== 'belt' && b.type !== 'dock')
  expect(belts.length).toBeGreaterThan(150)
  expect(machines.length).toBeGreaterThanOrEqual(30)
  expect(res(w, Flock).sheep.length).toBeGreaterThanOrEqual(60)
  // where every good on a belt is now, and how many jobs the farm's working machines have done so far (a stress
  // station has no sheep to work on; the farm's pens hold four each, as in the game)
  const at = new Map(belts.filter((b) => b.item).map((b) => [b.item!, b.x + ',' + b.y]))
  const working = machines.filter((m) => m.count > 0)
  const jobs = working.reduce((s, m) => s + m.count, 0)
  const STEPS = 60 * 30
  const t0 = performance.now()
  for (let i = 0; i < STEPS; i++) {
    stepSimulation(w)
    if (i % 300 === 0) feedStress(w)
  }
  const ms = (performance.now() - t0) / STEPS
  // goods moved on — round their loops, or into a machine or a dock — and the machines kept working
  let stuck = 0
  for (const b of res(w, Plant).b.values()) if (b.item && at.get(b.item) === b.x + ',' + b.y) stuck++
  expect(stuck).toBeLessThan(at.size * 0.5)
  expect(working.length).toBeGreaterThanOrEqual(20)
  expect(working.reduce((s, m) => s + m.count, 0) - jobs).toBeGreaterThan(working.length * 2)
  expect(ms).toBeLessThan(1)
  w.destroy()
})
