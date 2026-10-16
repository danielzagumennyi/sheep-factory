import { afterEach, describe, expect, it } from 'vitest'
import { TOOL_ORDER, type Dir } from './balance'
import { anchorForInput, beltAutoDir, get, inCells, outCells } from './grid'
import { place, remove, rotate } from './actions/build'
import { pathDirs, routeCells } from './actions/path'
import { stepSimulation } from './systems'
import { storeOf } from './systems/sheep'
import { createGameWorld, Flock, GameState, Unlocks, newItem, res, stockOf, type World } from './world'

/**
 * Everything connects whatever order it is built in (the author: a building that «не работало, но после переустановки
 * начинало нормально функционировать»): belts before or after the machines they feed, output belts laid late, a machine
 * turned with a good waiting, the sheep loop closed last by any of its pieces, a splitter or merger dropped on a line,
 * and the way a single belt chooses to go among its neighbours.
 */
let worlds: World[] = []
afterEach(() => {
  for (const w of worlds) w.destroy()
  worlds = []
})
function world(id: Parameters<typeof createGameWorld>[0] = 'm3') {
  const w = createGameWorld(id, { seed: 3 })
  for (const b of TOOL_ORDER) res(w, Unlocks).unlocked.add(b)
  res(w, GameState).coins = 5000
  worlds.push(w)
  return w
}
const run = (w: World, s: number) => {
  for (let t = 0; t < s; t += 1 / 60) stepSimulation(w)
}
/** A good on a belt, about to leave it. */
const load = (w: World, x: number, y: number, kind: 'wool' | 'hay' | 'water' = 'wool') => {
  const b = get(w, x, y)!
  b.item = newItem(kind)
  b.item.p = 1
}

describe('connections, in any order', () => {
  it('a machine takes from the line that leads to it whether it was built before the belts or after them', () => {
    for (const machineFirst of [true, false]) {
      const w = world()
      // a carder facing east at (16, 8) takes in from (15, 9), east-going
      if (machineFirst) place(w, 'carder', 16, 8, 0)
      for (const x of [13, 14, 15]) place(w, 'belt', x, 9, 0)
      if (!machineFirst) place(w, 'carder', 16, 8, 0)
      load(w, 13, 9)
      run(w, 3)
      expect(get(w, 16, 8)!.inv.wool, machineFirst ? 'machine first' : 'belts first').toBe(1)
    }
  })
  it('an output belt laid after a good has piled takes the next goods; a machine turned while a good waits sends it the new way', () => {
    const w = world()
    place(w, 'carder', 16, 8, 0)
    const m = get(w, 16, 8)!
    m.inv.wool = 4
    // the first roving drops onto a pile on the output cell (18, 9); a belt laid there takes the pile to the stock and the next roving
    run(w, 3.5)
    expect(m.pile.length).toBe(1)
    expect(place(w, 'belt', 18, 9, 0)).toBe(true)
    expect(stockOf(w, 'roving')).toBe(1)
    run(w, 3.5)
    expect(get(w, 18, 9)!.item?.kind).toBe('roving')
    // a belt head-on at the output jams it: the roving waits; turned south (R), the machine gives out of (16, 10)
    remove(w, 18, 9)
    place(w, 'belt', 18, 9, 2)
    m.inv.wool = 2
    run(w, 3.5)
    expect(m.outs.length).toBe(1)
    expect(m.status).toBe('jam')
    expect(rotate(w, m)).toBe(true)
    expect(outCells(m).map((c) => [c.x, c.y])).toEqual([[16, 10]])
    place(w, 'belt', 16, 10, 1)
    run(w, 0.5)
    expect(m.outs.length).toBe(0)
    expect(get(w, 16, 10)!.item?.kind).toBe('roving')
  })
  it('the sheep loop runs whichever of its pieces is built last', () => {
    const w0 = world()
    const p0 = res(w0, Flock).pastures[0]!
    const [ax, ay] = anchorForInput('shearer', p0.dir, p0.exit.x, p0.exit.y)
    // the loop from the shearer's front: up, back west over the pasture and down into its way in
    const loop: [number, number, Dir][] = [
      [15, 8, 3],
      [15, 7, 3],
      [15, 6, 2],
      [14, 6, 2],
      [13, 6, 2],
      [12, 6, 2],
      [11, 6, 1],
    ]
    const builds = (w: World) => ({
      shearer: () => place(w, 'shearer', ax, ay, p0.dir),
      belts: () => loop.every(([x, y, d]) => place(w, 'belt', x, y, d)),
      beltsButLast: () => loop.slice(0, -1).every(([x, y, d]) => place(w, 'belt', x, y, d)),
      last: () => place(w, 'belt', ...loop[loop.length - 1]!),
    })
    for (const order of ['shearer belts', 'belts shearer', 'beltsButLast shearer last'] as const) {
      const w = world()
      const b = builds(w)
      for (const step of order.split(' ') as (keyof typeof b)[]) expect(b[step](), order + ': ' + step).toBe(true)
      const p = res(w, Flock).pastures[0]!
      // every sheep fluffy and unpaid, the feeder and trough empty: a shorn sheep stays shorn, so every one that came
      // home round the loop shows; the wool pile is carried away as a player would
      for (const s of res(w, Flock).sheep) {
        s.wool = 1
        s.fed = false
      }
      for (const k of ['hay', 'water'] as const) storeOf(w, p, k)!.inv = {}
      const sh = get(w, p.exit.x, p.exit.y)!
      for (let t = 0; t < 40; t += 1 / 60) {
        stepSimulation(w)
        sh.pile.length = 0
      }
      expect(sh.type).toBe('shearer')
      expect(sh.count, order).toBeGreaterThan(2)
      expect(res(w, Flock).sheep.filter((s) => s.state === 'pasture' && s.wool < 0.1).length, order).toBeGreaterThan(2)
      expect(
        res(w, Flock).sheep.some((s) => s.state === 'waiting'),
        order,
      ).toBe(false)
    }
  })
  it('a splitter or a merger set on a line keeps its goods flowing', () => {
    const w = world()
    for (const x of [13, 14, 15, 16, 17]) place(w, 'belt', x, 9, 0)
    expect(place(w, 'splitter', 15, 9, 1)).toBe(true)
    // on a belt it takes goods the way they came, whatever the player's turn
    expect(get(w, 15, 9)!.dir).toBe(0)
    expect(place(w, 'merger', 16, 9, 3)).toBe(true)
    expect(get(w, 16, 9)!.dir).toBe(0)
    load(w, 13, 9)
    run(w, 4)
    expect(get(w, 17, 9)!.item?.kind).toBe('wool')
  })
  it('a route is found again after a building is swapped for another, not from a stale cache', () => {
    const w = world()
    place(w, 'belt', 20, 12, 0)
    const straight = routeCells(w, { x: 13, y: 9 }, { x: 17, y: 9 })!
    expect(straight.length).toBe(5)
    // as many buildings as before, but one of them now stands across the line
    remove(w, 20, 12)
    place(w, 'carder', 15, 8, 0)
    const round = routeCells(w, { x: 13, y: 9 }, { x: 17, y: 9 })!
    expect(round.some((c) => c.x === 15 && c.y === 9)).toBe(false)
    expect(round.length).toBeGreaterThan(5)
  })
  it('hay reaches the feeder along a line built before or after the mower', () => {
    for (const mowerFirst of [true, false]) {
      const w = world()
      const p = res(w, Flock).pastures[0]!
      const feeder = storeOf(w, p, 'hay')!
      // the mower by the home meadow gives south onto (8, 9); a belt there turns east into the feeder's (9, 9)
      if (mowerFirst) expect(place(w, 'mower', 8, 7, 1)).toBe(true)
      expect(place(w, 'belt', 8, 9, 0)).toBe(true)
      if (!mowerFirst) expect(place(w, 'mower', 8, 7, 1)).toBe(true)
      expect(inCells(w, feeder).some((c) => c.x === 8 && c.y === 9 && c.d === 0)).toBe(true)
      feeder.inv.hay = 0
      run(w, 14)
      expect(feeder.inv.hay, mowerFirst ? 'mower first' : 'belt first').toBeGreaterThanOrEqual(1)
    }
  })
})

describe('a single belt goes the way its neighbours suggest', () => {
  it('with nothing round it, the way the player turned it', () => {
    const w = world()
    for (const d of [0, 1, 2, 3] as Dir[]) expect(beltAutoDir(w, 20, 10, d)).toBe(d)
  })
  it('straight on from a machine that feeds the cell, towards a machine that takes from it, and a feeder beats the player’s turn', () => {
    const w = world()
    // a carder facing east at (13, 8) gives out of (14, 9) onto (15, 9)
    place(w, 'carder', 13, 8, 0)
    for (const d of [0, 1, 2, 3] as Dir[]) expect(beltAutoDir(w, 15, 9, d), 'fed from the west, R=' + d).toBe(0)
    remove(w, 13, 8)
    // a carder facing east at (16, 8) takes in from (15, 9), east-going
    place(w, 'carder', 16, 8, 0)
    for (const d of [0, 1, 2, 3] as Dir[]) expect(beltAutoDir(w, 15, 9, d), 'taker to the east, R=' + d).toBe(0)
    // fed from the west with a belt going north just above: it turns north to join it
    place(w, 'carder', 12, 8, 0)
    remove(w, 16, 8)
    place(w, 'belt', 15, 8, 3)
    expect(beltAutoDir(w, 15, 9, 1)).toBe(3)
    // pathDirs asks the same for a one-cell line
    expect(pathDirs(w, [{ x: 15, y: 9 }], 1)).toEqual([3])
  })
  it('never back into a belt that points at it; two belts pointing at it from both sides leave it a side way', () => {
    const w = world()
    place(w, 'belt', 14, 9, 0)
    place(w, 'belt', 16, 9, 2)
    for (const d of [0, 2] as Dir[]) expect([1, 3]).toContain(beltAutoDir(w, 15, 9, d))
    expect(beltAutoDir(w, 15, 9, 1)).toBe(1)
    expect(beltAutoDir(w, 15, 9, 3)).toBe(3)
  })
  it('on the pasture’s exit it goes the way the sheep leave; on its way in, in', () => {
    const w = world()
    const p = res(w, Flock).pastures[0]!
    for (const d of [0, 1, 2, 3] as Dir[]) {
      expect(beltAutoDir(w, p.exit.x, p.exit.y, d)).toBe(p.dir)
      expect(beltAutoDir(w, p.entry.x, p.entry.y, d)).toBe(p.entry.d)
    }
  })
})
