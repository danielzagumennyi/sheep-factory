import { describe, expect, it } from 'vitest'
import { runBot } from './bot'
import { startWorld } from './start'

/**
 * The balance bot (GDD 8) plays the game as a player would: `pnpm simulate` prints when its score reached each 50, the
 * coins and the flock then, and when it bought each recipe. For now it builds only plain lines (bot.ts).
 */
describe('balance bot', () => {
  it('shears by hand, buys the line’s recipes, builds lines, and shears over 200 in a quarter of an hour', () => {
    const w = startWorld({ seed: 7 })
    const r = runBot(w, 15 * 60)
    console.table(r.marks)
    console.table(r.recipes)
    console.log(`after ${Math.round(r.t / 60)} min: ${r.shorn} sheep shorn, ${r.coins} coins, ${r.sheep} on the map; idle ${r.idle} s`)
    expect(r.recipes.map((q) => q.id)).toEqual(['belt', 'shearer', 'carrot'])
    expect(r.shorn).toBeGreaterThan(200)
    w.destroy()
  }, 120000)
})
