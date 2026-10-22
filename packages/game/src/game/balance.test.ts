import { describe, expect, it } from 'vitest'
import { ARRIVE, BUILDINGS, GOAL, GRID, KIND_ORDER, KINDS, MAP, PORTAL, SHEEP, TOOL_ORDER, WATER_REACH, type BuildingId } from './balance'
import { makeMap } from './land'

describe('the numbers (balance.ts)', () => {
  it('every building has a recipe and a price, and stands on the hotbar once', () => {
    for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
      expect(BUILDINGS[id].recipe, id).toBeGreaterThan(0)
      expect(BUILDINGS[id].cost, id).toBeGreaterThan(0)
    }
    expect([...TOOL_ORDER].sort()).toEqual((Object.keys(BUILDINGS) as BuildingId[]).sort())
  })
  it('kinds open one after another, plain from the start; each needs one station, which a building does', () => {
    expect(KINDS.plain.at).toBe(0)
    for (let i = 1; i < KIND_ORDER.length; i++) expect(KINDS[KIND_ORDER[i]!].at).toBeGreaterThan(KINDS[KIND_ORDER[i - 1]!].at)
    const jobs = Object.values(BUILDINGS).map((b) => b.station)
    for (const k of KIND_ORDER) for (const n of KINDS[k].needs) expect(jobs, k).toContain(n)
    expect(KINDS[KIND_ORDER.at(-1)!].at).toBeLessThan(GOAL.sheep)
  })
  it('the flock: the start no more than the bar, the bar no more than the map holds', () => {
    expect(ARRIVE.start).toBeLessThanOrEqual(ARRIVE.bar)
    expect(ARRIVE.most).toBeLessThanOrEqual(SHEEP.most)
  })
  it('the portal stands in the middle of the map', () => {
    expect(PORTAL.x + PORTAL.size / 2).toBe(GRID.cols / 2)
    expect(PORTAL.y + PORTAL.size / 2).toBe(GRID.rows / 2)
  })
})

describe('the map (GDD 2)', () => {
  it('leaves the ground round the portal bare, and has a pond near enough to it for the first wash', () => {
    for (const seed of [1, 2, 3, 7]) {
      const m = makeMap(seed)
      const c0 = PORTAL.x - MAP.clear,
        c1 = PORTAL.x + PORTAL.size - 1 + MAP.clear
      for (const k of [...m.terrain.keys(), ...m.hills.keys()]) {
        const [x, y] = k.split(',').map(Number) as [number, number]
        expect(x >= c0 && x <= c1 && y >= c0 && y <= c1, `seed ${seed}: ${k}`).toBe(false)
      }
      const mid = PORTAL.x + PORTAL.size / 2
      const nearest = Math.min(...[...m.terrain].filter(([, t]) => t === 'water').map(([k]) => Math.hypot(...(k.split(',').map((v) => Number(v) + 0.5 - mid) as [number, number]))))
      expect(nearest, `seed ${seed}`).toBeLessThan(MAP.clear + PORTAL.size / 2 + 12 + WATER_REACH)
      expect(m.hills.size, `seed ${seed}`).toBeGreaterThan(0)
    }
  })
  it('a hill’s third level stands on its second, and hills keep a cell of grass between them and the rest', () => {
    const m = makeMap(4)
    for (const [k, l] of m.hills) {
      expect(m.terrain.has(k)).toBe(false)
      if (l !== 3) continue
      const [x, y] = k.split(',').map(Number) as [number, number]
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        expect(m.hills.has(x + dx! + ',' + (y + dy!))).toBe(true)
    }
  })
})
