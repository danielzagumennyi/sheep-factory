import { expect, it } from 'vitest'
import { buildShowcase } from './showcase'
import { startWorld } from './start'
import { Plant, res } from './world'

it('the showcase farm runs: sweaters and felt boots are made, pink yarn reaches the school', () => {
  const w = startWorld({ seed: 2 })
  buildShowcase(w, 400)
  const made = (t: string, recipe?: string) => [...res(w, Plant).b.values()].filter((b) => b.type === t && (!recipe || b.recipe === recipe)).reduce((s, b) => s + b.count, 0)
  for (const t of ['shearer', 'feeder', 'dyer', 'carder', 'spinner', 'felter', 'mower', 'berry']) expect(made(t), t).toBeGreaterThan(0)
  expect(made('workshop', 'sweater'), 'sweaters').toBeGreaterThan(0)
  expect(made('workshop', 'valenki'), 'felt boots').toBeGreaterThan(0)
  w.destroy()
})
