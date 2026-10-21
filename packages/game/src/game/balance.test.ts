import { describe, expect, it } from 'vitest'
import { BATH_YIELD, COLORED, GRID, ISLAND_START, ITEMS, LEVELS, MARKET, SHEAR_YIELD, TOOL_ORDER } from './balance'

describe('the village (GDD 7–8)', () => {
  it('every level opens at most one thing (and one more once it is placed), and every building opens once', () => {
    const seen = new Set<string>()
    for (const L of LEVELS) {
      expect(L.open.length).toBeLessThanOrEqual(1)
      for (const id of [...L.open, ...(L.after ? [L.after.open] : [])]) {
        expect(seen.has(id), id).toBe(false)
        seen.add(id)
      }
      if (L.after) expect(L.open, 'opened by what it opens').toContain(L.after.placed)
    }
    for (const t of TOOL_ORDER) expect(seen.has(t), t).toBe(true)
    // the first level teaches shearing by hand only, the sheep roaming; then the pen, then the shearer with its belt;
    // no food (the feeder) and no trade until later, buying sheep apart from pens
    const at = (id: string) => LEVELS.findIndex((L) => L.open.includes(id as never) || L.after?.open === id)
    expect(LEVELS[0]!.open).toEqual(['shear'])
    expect(at('pen')).toBe(1)
    expect(at('shearer')).toBe(2)
    expect(LEVELS[2]!.after?.open).toBe('belt')
    expect(at('pen')).toBeLessThan(at('sheep'))
    expect(at('market')).toBeGreaterThan(at('sheep'))
    expect(at('feeder')).toBeGreaterThan(at('mower'))
  })
  it('the market stands in the middle of the land the game starts on, with room round it; it has a sign for every client', () => {
    expect(MARKET.x).toBeGreaterThanOrEqual(2)
    expect(MARKET.y).toBeGreaterThanOrEqual(ISLAND_START.top + 2)
    expect(MARKET.x + MARKET.size).toBeLessThanOrEqual(ISLAND_START.right - 2)
    expect(MARKET.y + MARKET.size).toBeLessThanOrEqual(GRID.rows - 2)
    const clients = new Set(LEVELS.flatMap((L) => L.needs.map(([c, g]) => c + g)))
    expect(clients.size).toBeLessThanOrEqual(8)
    // a client once come stays in every later level, at no lower a rate
    for (let i = 1; i < LEVELS.length; i++)
      for (const [c, g, n] of LEVELS[i - 1]!.needs) expect(LEVELS[i]!.needs.find((q) => q[0] === c && q[1] === g)?.[2], `level ${i + 1}: ${c}`).toBeGreaterThanOrEqual(n)
  })
})

describe('prices (the salon, 19.10.2026)', () => {
  it('a sheep shorn after one more station is worth more; colour beats the dye it takes; the bath beats plain wool', () => {
    const worth = ([k, n]: readonly [keyof typeof ITEMS, number]) => ITEMS[k].price * n
    for (let i = 1; i < SHEAR_YIELD.length; i++) expect(worth(SHEAR_YIELD[i]!), SHEAR_YIELD[i]![0]).toBeGreaterThan(worth(SHEAR_YIELD[i - 1]!))
    expect(worth(BATH_YIELD)).toBeGreaterThan(worth(SHEAR_YIELD[0]!))
    for (const [k, n] of [...SHEAR_YIELD, BATH_YIELD]) expect(ITEMS[COLORED[k]!].price * n, COLORED[k]).toBeGreaterThan(ITEMS[k].price * n + ITEMS.dye.price)
  })
})
