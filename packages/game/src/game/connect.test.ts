import { afterEach, describe, expect, it } from 'vitest'
import { START, TOOL_ORDER, type Dir } from './balance'
import { anchorForInput, beltAutoDir, get, machineIns, outCells } from './grid'
import { buySheep, place, remove, rotate } from './actions/build'
import { pathDirs, routeCells } from './actions/path'
import { stepSimulation } from './systems'
import { penIn } from './systems/sheep'
import { createGameWorld, Field, Flock, GameState, Unlocks, key, makePen, newItem, res, stockOf, type PastureT, type World } from './world'

/**
 * Everything connects whatever order it is built in (the author: a building that «не работало, но после переустановки
 * начинало нормально функционировать»): belts before or after the machines they feed, output belts laid late, a machine
 * turned with a good waiting, the sheep loop closed last by any of its pieces, a splitter or merger dropped on a line,
 * and the way a single belt chooses to go among its neighbours. All on the start map: the first pen at (11, 11) facing
 * east, the free own land south of it (rows 15–17, columns 13–20).
 */
let worlds: World[] = []
afterEach(() => {
  for (const w of worlds) w.destroy()
  worlds = []
})
/** The first pen, where the sheep roam at the start, with all of them in it (as the game began before they roamed). */
function penned(w: World) {
  const p = makePen(w, START.pen.x, START.pen.y, START.pen.dir)
  res(w, Flock).pastures.push(p)
  for (const s of res(w, Flock).sheep) penIn(w, s, p)
  return w
}
function world() {
  const w = penned(createGameWorld({ seed: 3 }))
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
/** A good on a belt, about to leave it. */
const load = (w: World, x: number, y: number, kind: 'wool' | 'hay' = 'wool') => {
  const b = get(w, x, y)!
  b.item = newItem(kind)
  b.item.p = 1
}

describe('connections, in any order', () => {
  it('a machine takes from the line that leads to it whether it was built before the belts or after them', () => {
    for (const machineFirst of [true, false]) {
      const w = world()
      // a seeder facing east at (16, 16) takes its seeds in from (15, 16), east-going
      if (machineFirst) place(w, 'seeder', 16, 16, 0)
      for (const x of [13, 14, 15]) place(w, 'belt', x, 16, 0)
      if (!machineFirst) place(w, 'seeder', 16, 16, 0)
      load(w, 13, 16, 'hay')
      run(w, 2.6)
      expect(get(w, 16, 16)!.inv.hay, machineFirst ? 'machine first' : 'belts first').toBe(1)
    }
  })
  it('a station takes its good from the line on its right whether it was built before the belt or after it', () => {
    for (const stationFirst of [true, false]) {
      const w = world()
      // a feeder facing east at (16, 15): the sheep come in at (16, 16) from behind, the hay from its right, the south
      const probe = { type: 'feeder' as const, x: 16, y: 15, w: 2, h: 2, dir: 0 as Dir, seed: null }
      const hay = machineIns(probe).find((c) => c.takes === 'hay')!
      expect([hay.x, hay.y, hay.d]).toEqual([16, 17, 3])
      if (stationFirst) place(w, 'feeder', 16, 15, 0)
      place(w, 'belt', hay.x, hay.y, hay.d)
      if (!stationFirst) place(w, 'feeder', 16, 15, 0)
      load(w, hay.x, hay.y, 'hay')
      run(w, 1)
      expect(get(w, 16, 15)!.inv.hay, stationFirst ? 'station first' : 'belt first').toBe(1)
    }
  })
  it('an output belt laid after a good has piled takes the next goods; a machine turned while a good waits sends it the new way', () => {
    const w = world()
    // a mower facing east at (16, 16), the meadow of row 14 in its reach
    place(w, 'mower', 16, 16, 0)
    const m = get(w, 16, 16)!
    // the first hay drops onto a pile on the output cell (18, 16); a belt laid there takes the pile to the stock and the next hay
    run(w, 3.5)
    expect(m.pile.length).toBe(1)
    const hay = stockOf(w, 'hay')
    expect(place(w, 'belt', 18, 16, 0)).toBe(true)
    expect(stockOf(w, 'hay')).toBe(hay + 1)
    run(w, 3.5)
    expect(get(w, 18, 16)!.item?.kind).toBe('hay')
    // a belt head-on at the output jams it: the hay waits; turned south (R), the mower gives out of (16, 18)
    remove(w, 18, 16)
    place(w, 'belt', 18, 16, 2)
    run(w, 3.5)
    expect(m.outs.length).toBe(1)
    expect(m.status).toBe('jam')
    expect(rotate(w, m)).toBe(true)
    expect(outCells(m).map((c) => [c.x, c.y])).toEqual([[16, 18]])
    place(w, 'belt', 16, 18, 1)
    run(w, 0.5)
    expect(m.outs.length).toBe(0)
    expect(get(w, 16, 18)!.item?.kind).toBe('hay')
  })
  it('the sheep loop runs whichever of its pieces is built last', () => {
    const w0 = world()
    const p0 = res(w0, Flock).pastures[0]!
    const [ax, ay] = anchorForInput('shearer', p0.dir, p0.exit.x, p0.exit.y)
    // the loop from the shearer's front: up, back west over the pen and down into its way in
    const loop: [number, number, Dir][] = [
      [16, 12, 3],
      [16, 11, 3],
      [16, 10, 2],
      [15, 10, 2],
      [14, 10, 2],
      [13, 10, 2],
      [12, 10, 1],
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
      // every sheep fluffy and hungry, no feeder on the loop: a shorn sheep stays shorn at home, so every one that came
      // home round the loop shows; the wool pile is carried away as a player would
      for (const s of res(w, Flock).sheep) {
        s.wool = 1
        s.fed = false
      }
      const sh = get(w, p.exit.x, p.exit.y)!
      for (let t = 0; t < 40; t += 1 / 60) {
        stepSimulation(w)
        res(w, Unlocks).cardQ.length = 0
        sh.pile.length = 0
      }
      expect(sh.type).toBe('shearer')
      expect(sh.count, order).toBeGreaterThan(2)
      expect(res(w, Flock).sheep.filter((s) => s.state === 'pasture' && s.wool < 0.1).length, order).toBeGreaterThan(2)
      expect(
        res(w, Flock).sheep.some((s) => s.state === 'roam'),
        order,
      ).toBe(false)
    }
  })
  it('two pens share one loop and one shearer: each sheep crosses the other pen and goes home to its own', () => {
    const w = world()
    // open own land in rows 15-19, columns 8-16, below the first pen, for the loop
    const f = res(w, Field)
    for (let y = 15; y <= 19; y++)
      for (let x = 8; x <= 16; x++) {
        f.terrain.delete(key(x, y))
        f.res.delete(key(x, y))
      }
    // A faces east (way out (11,18), way in (9,16) going south); the shearer on its way out; B faces north, its way in
    // on its west side at (13,18), its way out (15,16); the loop back over both to A's way in
    expect(place(w, 'pen', 8, 17, 0)).toBe(true)
    expect(place(w, 'shearer', 11, 17, 0)).toBe(true)
    expect(place(w, 'belt', 13, 18, 0)).toBe(true)
    expect(place(w, 'pen', 14, 17, 3)).toBe(true)
    const [a, b] = res(w, Flock).pastures.slice(-2) as [PastureT, PastureT]
    expect([b.entry.x, b.entry.y, b.entry.d]).toEqual([13, 18, 0])
    for (const [x, y, d] of [
      [15, 16, 3],
      [15, 15, 2],
      [14, 15, 2],
      [13, 15, 2],
      [12, 15, 2],
      [11, 15, 2],
      [10, 15, 2],
      [9, 15, 1],
      [9, 16, 1],
    ] as const)
      expect(place(w, 'belt', x, y, d), x + ',' + y).toBe(true)
    for (let i = 0; i < 4; i++) {
      buySheep(w, a)
      buySheep(w, b)
    }
    const flock = res(w, Flock)
    const mine = flock.sheep.filter((s) => s.home === a.id || s.home === b.id)
    const sh = get(w, 11, 17)!
    let crossed = 0
    for (let t = 0; t < 120; t += 1 / 60) {
      stepSimulation(w)
      res(w, Unlocks).cardQ.length = 0
      sh.pile.length = 0
      crossed = Math.max(crossed, mine.filter((s) => s.state === 'transit').length)
    }
    // both pens' sheep were shorn by the one shearer, crossed the other pen, and each lives where it did
    expect(sh.count).toBeGreaterThan(12)
    expect(crossed).toBeGreaterThan(0)
    expect(mine.filter((s) => s.home === a.id).length).toBe(4)
    expect(mine.filter((s) => s.home === b.id).length).toBe(4)
    expect(mine.some((s) => s.state === 'roam')).toBe(false)
  })
  it('a splitter or a merger set on a line keeps its goods flowing', () => {
    const w = world()
    for (const x of [13, 14, 15, 16, 17]) place(w, 'belt', x, 16, 0)
    expect(place(w, 'splitter', 15, 16, 1)).toBe(true)
    // on a belt it takes goods the way they came, whatever the player's turn
    expect(get(w, 15, 16)!.dir).toBe(0)
    expect(place(w, 'merger', 16, 16, 3)).toBe(true)
    expect(get(w, 16, 16)!.dir).toBe(0)
    load(w, 13, 16)
    run(w, 4)
    expect(get(w, 17, 16)!.item?.kind).toBe('wool')
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
  it('straight on from a machine that feeds the cell, towards a machine that takes from it, and a feeder beats the player’s turn', () => {
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
  it('on the pen’s exit it goes the way the sheep leave; on its way in, in', () => {
    const w = world()
    const p = res(w, Flock).pastures[0]!
    for (const d of [0, 1, 2, 3] as Dir[]) {
      expect(beltAutoDir(w, p.exit.x, p.exit.y, d)).toBe(p.dir)
      expect(beltAutoDir(w, p.entry.x, p.entry.y, d)).toBe(p.entry.d)
    }
  })
})
