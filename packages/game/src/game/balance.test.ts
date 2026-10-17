import { describe, expect, it } from 'vitest'
import { CLIENT_ORDER, DOCK, DOCK_X, ITEMS, LEVELS, MARKET, RECIPES, TOOL_ORDER, type BuildingId } from './balance'
import { jobsOf } from './grid'

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
    // the first level teaches shearing only: no food (the feeder) and no market until later, sheep apart from pens
    const at = (id: string) => LEVELS.findIndex((L) => L.open.includes(id as never) || L.after?.open === id)
    expect(LEVELS[0]!.open).toEqual(['shearer'])
    expect(LEVELS[0]!.after?.open).toBe('belt')
    expect(at('pen')).toBeLessThan(at('sheep'))
    expect(at('market')).toBeGreaterThan(at('sheep'))
    expect(at('feeder')).toBeGreaterThan(at('mower'))
  })
  it('docks stand apart on the dock row, the market away from the trucks', () => {
    const xs = CLIENT_ORDER.map((c) => DOCK_X[c]).sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(DOCK.w)
    for (const x of xs) expect(Math.abs(x - DOCK_X.market)).toBeGreaterThanOrEqual(MARKET.w)
  })
})

describe('prices (docs/05-REWORK.md)', () => {
  it('making always beats selling what it is made of', () => {
    const jobs = [...(['carder', 'spinner', 'felter'] as BuildingId[]).flatMap((t) => jobsOf({ type: t, recipe: null })), ...Object.values(RECIPES)]
    for (const j of jobs) {
      const inputs = Object.entries(j.inp).reduce((s, [k, n]) => s + ITEMS[k as keyof typeof ITEMS].price * n, 0)
      expect(ITEMS[j.out].price, j.out).toBeGreaterThan(inputs)
    }
  })
})
