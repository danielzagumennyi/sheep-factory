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
  const w = startWorld('m7', { seed: 4 })
  buildStress(w)
  const plant = [...res(w, Plant).b.values()]
  const belts = plant.filter((b) => b.type === 'belt')
  const machines = plant.filter((b) => b.type !== 'belt' && b.type !== 'dock')
  expect(belts.length).toBeGreaterThan(180)
  expect(machines.length).toBeGreaterThanOrEqual(30)
  expect(res(w, Flock).sheep.length).toBeGreaterThanOrEqual(48)
  // where every good on a belt is now, and how many jobs are done so far
  const at = new Map(belts.filter((b) => b.item).map((b) => [b.item!, b.x + ',' + b.y]))
  const jobs = machines.reduce((s, m) => s + m.count, 0)
  const STEPS = 60 * 30
  const t0 = performance.now()
  for (let i = 0; i < STEPS; i++) {
    stepSimulation(w)
    if (i % 300 === 0) feedStress(w)
  }
  const ms = (performance.now() - t0) / STEPS
  // goods moved round their loops, the machines kept working
  let moved = 0
  for (const b of res(w, Plant).b.values()) if (b.item && at.has(b.item) && at.get(b.item) !== b.x + ',' + b.y) moved++
  expect(moved).toBeGreaterThan(at.size * 0.5)
  expect(machines.reduce((s, m) => s + m.count, 0) - jobs).toBeGreaterThan(machines.length * 3)
  expect(ms).toBeLessThan(1)
  w.destroy()
})
