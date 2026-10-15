import { describe, expect, it } from 'vitest'
import { MISSIONS } from './balance'
import { runBot } from './bot'
import { startWorld } from './start'

/**
 * The balance check (TDD 5): the bot finishes every mission, and within par — the par times were set from its runs,
 * so a regression in the rules or the numbers shows up here first. `pnpm simulate` prints the table.
 */
describe('balance bot', () => {
  it('finishes all seven missions on three stars', () => {
    const rows = MISSIONS.map((m) => {
      const w = startWorld(m.id, { seed: 7 })
      const r = runBot(w, 1500)
      w.destroy()
      return { ...r, par: m.par }
    })
    console.table(rows)
    for (const r of rows) {
      expect(r.finished, r.mission + ' ' + r.orders).toBe(true)
      expect(r.stars, r.mission + ' in ' + r.t + 's').toBe(3)
    }
  }, 120_000)
})
