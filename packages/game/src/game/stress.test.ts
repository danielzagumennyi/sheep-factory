import { expect, it } from 'vitest'
import { STRESS, buildStress } from './stress'
import { startWorld } from './start'
import { stepSimulation } from './systems'
import { Flock, Plant, res } from './world'

/**
 * The stress factory (stress.ts) — far bigger than a real one, a big flock and belt loops all over — must simulate well
 * inside a frame and keep moving. The budget is generous: this catches a step that has become quadratic, not a few
 * percent.
 */
it('a big factory with a big flock steps in well under two milliseconds and keeps flowing', () => {
  const w = startWorld({ seed: 4 })
  buildStress(w)
  expect(res(w, Flock).sheep.length).toBeGreaterThanOrEqual(STRESS.sheep * 0.9)
  const belts = [...res(w, Plant).b.values()].filter((b) => b.type === 'belt')
  expect(belts.length).toBeGreaterThan(300)
  // where every sheep on a belt is now
  const at = new Map(belts.filter((b) => b.item).map((b) => [b.item!.sheep, b.x + ',' + b.y]))
  const STEPS = 60 * 20
  const t0 = performance.now()
  for (let i = 0; i < STEPS; i++) stepSimulation(w)
  const ms = (performance.now() - t0) / STEPS
  // the sheep moved on round their loops
  let stuck = 0
  for (const b of res(w, Plant).b.values()) if (b.item && at.get(b.item.sheep) === b.x + ',' + b.y) stuck++
  expect(stuck).toBeLessThan(at.size * 0.5)
  expect(ms).toBeLessThan(2)
  w.destroy()
}, 120000)
