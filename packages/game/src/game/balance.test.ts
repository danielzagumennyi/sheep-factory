import { describe, expect, it } from 'vitest'
import { BATH_YIELD, COLORED, GRID, HILLS, ISLAND_START, ITEMS, LEVELS, MAP_HILLS, MAP_TERRAIN, MARKET, PEN, SHEAR_YIELD, START, TOOL_ORDER, dimsOf } from './balance'
import { PLAN, jobPlots } from './plan'

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

describe('the map (GDD 2)', () => {
  it('is square: the market on the middle plot, the island at the start the 3×3 plots round it', () => {
    expect(GRID.cols).toBe(GRID.rows)
    expect(GRID.plotW).toBe(GRID.plotH)
    const mid = (GRID.cols / GRID.plotW - 1) / 2
    expect(Number.isInteger(mid)).toBe(true)
    expect([MARKET.x, MARKET.y, MARKET.size]).toEqual([mid * GRID.plotW, mid * GRID.plotH, GRID.plotW])
    expect(ISLAND_START).toEqual({ left: (mid - 1) * GRID.plotW, top: (mid - 1) * GRID.plotH, right: (mid + 2) * GRID.plotW, bottom: (mid + 2) * GRID.plotH })
    for (const [px, py] of START.plots) expect(Math.max(Math.abs(px - mid), Math.abs(py - mid)), `${px},${py}`).toBeLessThanOrEqual(1)
  })
  it('every plot off the start holds a deposit, so each one is worth buying', () => {
    const start = new Set(START.plots.map(([px, py]) => px + ',' + py))
    const held = new Set(['meadow', 'bush'].flatMap((t) => MAP_TERRAIN[t as 'meadow' | 'bush']!.map(([x, y]) => Math.floor(x / GRID.plotW) + ',' + Math.floor(y / GRID.plotH))))
    for (let py = 0; py * GRID.plotH < GRID.rows; py++)
      for (let px = 0; px * GRID.plotW < GRID.cols; px++) {
        const k = px + ',' + py
        if (!start.has(k) && k !== Math.floor(MARKET.x / GRID.plotW) + ',' + Math.floor(MARKET.y / GRID.plotH)) expect(held.has(k), k).toBe(true)
      }
  })
  it('every hill lies inside one plot off its edge rows and columns, under no deposit and no part of the bot’s farm; its third level stands on its second', () => {
    const terrain = new Set(Object.values(MAP_TERRAIN).flatMap((c) => c.map(([x, y]) => x + ',' + y)))
    for (const [l, x0, y0, x1, y1] of MAP_HILLS) {
      // inside one plot, and clear of its edge — where a fence or a belt may run
      expect(Math.floor(x0 / GRID.plotW), `${x0},${y0}`).toBe(Math.floor(x1 / GRID.plotW))
      expect(Math.floor(y0 / GRID.plotH), `${x0},${y0}`).toBe(Math.floor(y1 / GRID.plotH))
      for (const [a, n] of [[x0, GRID.plotW], [x1, GRID.plotW], [y0, GRID.plotH], [y1, GRID.plotH]] as const) {
        expect(a % n, `${x0},${y0}`).toBeGreaterThan(0)
        expect(a % n, `${x0},${y0}`).toBeLessThan(n - 1)
      }
      if (l === 3) for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) expect(HILLS.get(x + ',' + y), `${x},${y}`).toBeGreaterThanOrEqual(2)
    }
    for (const k of HILLS.keys()) expect(terrain.has(k), k).toBe(false)
    for (const j of PLAN)
      for (const s of j.steps) {
        if ('remove' in s) continue
        const [x, y, w, h] = 'pen' in s ? [...s.pen, PEN.size, PEN.size] : [s.x, s.y, ...dimsOf(s.b, s.d)]
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) expect(HILLS.has(x + dx + ',' + (y + dy)), `${j.id} ${x + dx},${y + dy}`).toBe(false)
      }
    // every plot the bot's farm needs past the start holds a deposit, so it is for sale
    const start = new Set(START.plots.map(([px, py]) => px + ',' + py))
    const held = new Set([...terrain].map((k) => k.split(',').map(Number)).map(([x, y]) => Math.floor(x! / GRID.plotW) + ',' + Math.floor(y! / GRID.plotH)))
    for (const j of PLAN) for (const [px, py] of jobPlots(j)) if (!start.has(px + ',' + py)) expect(held.has(px + ',' + py), `${j.id} plot ${px},${py}`).toBe(true)
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
