import { afterEach, describe, expect, it } from 'vitest'
import { SHEEP, TOOL_ORDER, type Dir } from './balance'
import { beltAutoDir, get } from './grid'
import { place, remove } from './actions/build'
import { pathDirs, routeCells } from './actions/path'
import { buildLine, portalPorts } from './lines'
import { stepSimulation } from './systems'
import { openField } from './testing'
import { grazeable } from './systems/sheep'
import { createGameWorld, Flock, GameState, Plant, Unlocks, makeSheep, newItem, res, type World } from './world'

/**
 * Everything connects whatever order it is built in (the author: a building that «не работало, но после переустановки
 * начинало нормально функционировать»): belts before or after the stations they feed, a line closed last by any of its
 * pieces, a splitter or merger dropped on a line, and the way a single belt chooses to go among its neighbours. On a
 * bare field (testing.ts).
 */
let worlds: World[] = []
afterEach(() => {
  for (const w of worlds) w.destroy()
  worlds = []
})
/** A bare field with every recipe bought and plenty of coins; the portal kept when asked. */
function world(keepPortal = false) {
  const w = openField(createGameWorld({ seed: 3 }), keepPortal)
  for (const b of TOOL_ORDER) res(w, Unlocks).unlocked.add(b)
  res(w, GameState).coins = 5000
  worlds.push(w)
  return w
}
const run = (w: World, s: number) => {
  for (let t = 0; t < s; t += 1 / 60) {
    stepSimulation(w)
    res(w, Unlocks).cardQ.length = 0
  }
}
/** A sheep of a kind on a belt, about to leave it. */
const load = (w: World, x: number, y: number, kind: 'plain' | 'tangled' = 'tangled') => {
  const s = makeSheep(w, kind, { x: x + 0.5, y: y + 0.5 })
  const b = get(w, x, y)!
  b.item = newItem(s)
  b.item.p = 1
  s.state = 'belt'
  return s
}

describe('connections, in any order', () => {
  it('a station takes from the line that leads to it whether it was built before the belts or after them', () => {
    for (const first of ['station', 'belts'] as const) {
      const w = world()
      const lay = () => {
        for (const x of [13, 14]) place(w, 'belt', x, 16, 0)
      }
      if (first === 'belts') lay()
      // a comb facing east at (15, 15) takes its sheep in from (14, 16)
      expect(place(w, 'comb', 15, 15, 0)).toBe(true)
      if (first === 'station') lay()
      const s = load(w, 13, 16)
      run(w, 5)
      expect(s.needs, 'built ' + first + ' first').toEqual([])
    }
  })
  it('a whole line from the portal works; the portal counts the sheep and pays for it', () => {
    const w = world(true)
    expect(buildLine(w, portalPorts(w)[0]!)).toBe(true)
    // a sheep within the carrot's circle walks to it, rides in, is shorn and goes into the portal
    const c = [...res(w, Plant).b.values()].find((b) => b.type === 'carrot')!
    const at = [
      [2.6, 0],
      [-2.6, 0],
      [0, 2.6],
      [0, -2.6],
    ]
      .map(([dx, dy]) => ({ x: c.x + c.w / 2 + dx!, y: c.y + c.h / 2 + dy! }))
      .find((q) => grazeable(w, Math.floor(q.x), Math.floor(q.y)))!
    const s = makeSheep(w, 'plain', at)
    res(w, Flock).sheep.push(s)
    const coins = res(w, GameState).coins
    run(w, 40)
    expect(res(w, GameState).shorn).toBe(1)
    expect(res(w, GameState).coins).toBe(coins + SHEEP.coins)
    expect(res(w, Flock).sheep.includes(s)).toBe(false)
  })
  it('a splitter or a merger set on a line keeps its sheep flowing', () => {
    const w = world()
    for (const x of [13, 14, 15, 16, 17]) place(w, 'belt', x, 16, 0)
    expect(place(w, 'splitter', 15, 16, 1)).toBe(true)
    // on a belt it takes sheep the way they came, whatever the player's turn
    expect(get(w, 15, 16)!.dir).toBe(0)
    expect(place(w, 'merger', 16, 16, 3)).toBe(true)
    expect(get(w, 16, 16)!.dir).toBe(0)
    const s = load(w, 13, 16)
    run(w, 4)
    expect(get(w, 17, 16)!.item?.sheep).toBe(s)
  })
  it('a route is found again after a building is swapped for another, not from a stale cache', () => {
    const w = world()
    place(w, 'belt', 20, 19, 0)
    const straight = routeCells(w, { x: 13, y: 16 }, { x: 17, y: 16 })!
    expect(straight.length).toBe(5)
    // as many buildings as before, but one of them now stands across the line
    remove(w, 20, 19)
    place(w, 'comb', 15, 15, 0)
    const round = routeCells(w, { x: 13, y: 16 }, { x: 17, y: 16 })!
    expect(round.some((c) => c.x === 15 && c.y === 16)).toBe(false)
    expect(round.length).toBeGreaterThan(5)
  })
})

describe('a single belt goes the way its neighbours suggest', () => {
  it('with nothing round it, the way the player turned it', () => {
    const w = world()
    for (const d of [0, 1, 2, 3] as Dir[]) expect(beltAutoDir(w, 18, 17, d)).toBe(d)
  })
  it('straight on from a station that feeds the cell, towards a station that takes from it, and a feeder beats the player’s turn', () => {
    const w = world()
    // a comb facing east at (13, 15) gives its sheep out of (14, 16) onto (15, 16)
    place(w, 'comb', 13, 15, 0)
    for (const d of [0, 1, 2, 3] as Dir[]) expect(beltAutoDir(w, 15, 16, d), 'fed from the west, R=' + d).toBe(0)
    remove(w, 13, 15)
    // a comb facing east at (16, 15) takes its sheep in from (15, 16), east-going
    place(w, 'comb', 16, 15, 0)
    for (const d of [0, 1, 2, 3] as Dir[]) expect(beltAutoDir(w, 15, 16, d), 'taker to the east, R=' + d).toBe(0)
    // fed from the west with a belt going north just above: it turns north to join it
    place(w, 'comb', 13, 15, 0)
    remove(w, 16, 15)
    place(w, 'belt', 15, 15, 3)
    expect(beltAutoDir(w, 15, 16, 1)).toBe(3)
    // pathDirs asks the same for a one-cell line
    expect(pathDirs(w, [{ x: 15, y: 16 }], 1)).toEqual([3])
  })
  it('never back into a belt that points at it; two belts pointing at it from both sides leave it a side way', () => {
    const w = world()
    place(w, 'belt', 14, 16, 0)
    place(w, 'belt', 16, 16, 2)
    for (const d of [0, 2] as Dir[]) expect([1, 3]).toContain(beltAutoDir(w, 15, 16, d))
    expect(beltAutoDir(w, 15, 16, 1)).toBe(1)
    expect(beltAutoDir(w, 15, 16, 3)).toBe(3)
  })
})
