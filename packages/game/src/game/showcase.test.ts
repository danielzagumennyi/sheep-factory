import { expect, it } from 'vitest'
import { buildShowcase } from './showcase'
import { startWorld } from './start'
import { stepSimulation } from './systems'
import { GameState, Plant, res } from './world'

it('the menu’s factory runs: a line from every way in of the portal, and shorn sheep go into the portal', () => {
  const w = startWorld({ seed: 7 })
  buildShowcase(w, 30)
  const types = [...res(w, Plant).b.values()].map((b) => b.type)
  expect(types.filter((t) => t === 'shearer').length).toBe(8)
  expect(types.filter((t) => t === 'carrot').length).toBe(8)
  for (let t = 0; t < 60; t += 1 / 60) stepSimulation(w)
  expect(res(w, GameState).shorn).toBeGreaterThan(10)
  w.destroy()
})
