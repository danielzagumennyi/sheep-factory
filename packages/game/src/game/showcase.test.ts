import { expect, it } from 'vitest'
import { buildShowcase } from './showcase'
import { startWorld } from './start'
import { Plant, Stock, res } from './world'

it('the showcase farm runs: every station of the salon works, sweaters and coloured goods are made', () => {
  const w = startWorld({ seed: 2 })
  buildShowcase(w, 400)
  const worked = (t: string) => [...res(w, Plant).b.values()].filter((b) => b.type === t).reduce((s, b) => s + b.count, 0)
  for (const t of ['shearer', 'feeder', 'dyer', 'comb', 'curl', 'knit', 'bath', 'mower', 'berry']) expect(worked(t), t).toBeGreaterThan(0)
  // what reached the market: the trucks took some, the rest waits in the stock or was sold
  const made = (k: string) => (res(w, Stock).n[k as keyof ReturnType<typeof res<typeof Stock>>['n']] ?? 0)
  expect(['sweater', 'csweater', 'cfelt', 'cyarn'].some((k) => made(k) > 0), JSON.stringify(res(w, Stock).n)).toBe(true)
  w.destroy()
})
