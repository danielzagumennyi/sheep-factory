import { expect, it } from 'vitest'
import { buildShowcase } from './showcase'
import { startWorld } from './start'
import { Market, Plant, res } from './world'

it('the showcase factory runs: coloured yarn reaches the school', () => {
  const w = startWorld('m7', { seed: 2 })
  buildShowcase(w, 240)
  const types = new Set([...res(w, Plant).b.values()].map((b) => b.type))
  for (const t of ['shearer', 'carder', 'spinner', 'workshop', 'berry', 'mower', 'pump']) expect(types.has(t as never), t).toBe(true)
  expect(res(w, Market).orders.find((o) => o.kind === 'cyarn')!.have).toBeGreaterThan(0)
  w.destroy()
})
