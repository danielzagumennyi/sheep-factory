import { expect, it } from 'vitest'
import { buildShowcase } from './showcase'
import { startWorld } from './start'
import { stepSimulation } from './systems'
import { Fx, Plant, res } from './world'

it('the showcase farm runs: every station of the salon works, sweaters and coloured goods reach the market', () => {
  const w = startWorld({ seed: 2 })
  buildShowcase(w, 400)
  const worked = (t: string) => [...res(w, Plant).b.values()].filter((b) => b.type === t).reduce((s, b) => s + b.count, 0)
  for (const t of ['shearer', 'feeder', 'dyer', 'comb', 'curl', 'knit', 'bath', 'mower', 'berry']) expect(worked(t), t).toBeGreaterThan(0)
  // what comes into the market for two minutes more (the farm's hand sells what no client takes, so the stock won't tell)
  const came = new Set<string>()
  const q = res(w, Fx).q
  for (let i = 0; i < 120 * 60; i++) {
    q.length = 0
    stepSimulation(w)
    for (const e of q) if (e.kind === 'deliver') came.add(e.good)
  }
  expect(['sweater', 'csweater', 'cfelt', 'cyarn'].some((k) => came.has(k)), [...came].join(',')).toBe(true)
  w.destroy()
})
