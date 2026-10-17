import { describe, expect, it } from 'vitest'
import { LEVELS } from './balance'
import { runBot } from './bot'
import { startWorld } from './start'

/**
 * The balance check (TDD 5): the bot plays the long game and closes chapter 1 — every level of the table — by the
 * real rules, every good by belt. `pnpm simulate` prints when each level opened. The economy model
 * (docs/econ/model.mjs) is where the numbers were tuned; this is the check that the rules let them be played.
 */
describe('balance bot', () => {
  it('closes chapter 1 within the hour and a quarter', () => {
    const w = startWorld({ seed: 7 })
    const r = runBot(w, 75 * 60)
    w.destroy()
    const fmt = (s: number) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
    console.table(
      r.levels.map((l) => ({
        level: l.level,
        done: fmt(l.at),
        took: fmt(l.took),
        buys: l.buys,
        gap: fmt(l.gap),
        save: fmt(l.save),
        idle: fmt(l.idle),
        earned: l.earned,
        spent: l.spent,
        coins: l.coins,
        sheep: l.sheep,
      })),
    )
    const idle = r.levels.reduce((s, l) => s + l.idle, 0)
    console.log(`chapter 1 ${r.level > LEVELS.length ? 'closed' : 'open'} at ${fmt(r.t)}: ${r.sheep} sheep, ${r.plots} plots bought, ${r.coins} coins; nothing to buy for ${fmt(idle)}`)
    expect(r.level, 'level reached').toBeGreaterThan(LEVELS.length)
  }, 120_000)
})
