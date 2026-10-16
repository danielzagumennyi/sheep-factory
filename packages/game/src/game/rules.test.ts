import { afterEach, describe, expect, it } from 'vitest'
import { GRID, RES, SHEEP, type BuildingId } from './balance'
import { anchorForInput, beltInDir, get, inCell, inCells, outCells, plotPrice, reachCells, reachOf, whyNot } from './grid'
import { buyPlot, liftUp, place, putBack, putDown, remove, rotate, setRecipe } from './actions/build'
import { feed, gather, handClick } from './actions/hand'
import { BUILDINGS } from './balance'
import { stepSimulation } from './systems'
import { buy, buyPrice, dockAccept, dockX, loadDock, sell, sellPrice } from './systems/orders'
import { storeOf } from './systems/sheep'
import { blankBuilding, createGameWorld, Field, Flock, GameState, Market, Plant, Stock, Ui, Unlocks, key, newItem, res, stockOf, unkey, type SheepT, type World } from './world'

let worlds: World[] = []
afterEach(() => {
  for (const w of worlds) w.destroy()
  worlds = []
})
function world(id: Parameters<typeof createGameWorld>[0] = 'm3') {
  const w = createGameWorld(id, { seed: 3 })
  for (const b of ['belt', 'merger', 'splitter', 'mower', 'pump', 'carder'] as const) res(w, Unlocks).unlocked.add(b)
  res(w, GameState).coins = 5000
  worlds.push(w)
  return w
}
/** The first owned cell, row by row, that passes `ok`. */
const free = (ok: (x: number, y: number) => boolean): [number, number] => {
  for (let y = 0; y < GRID.roadY; y++) for (let x = 0; x < GRID.cols; x++) if (ok(x, y)) return [x, y]
  throw new Error('no such cell')
}
const run = (w: World, s: number) => {
  for (let t = 0; t < s; t += 1 / 60) stepSimulation(w)
}

describe('belts (GDD 4.2)', () => {
  it('take items from one side only; a second line needs a merger', () => {
    const w = world()
    // a line going east, and a second belt feeding it from the north
    place(w, 'belt', 16, 9, 0)
    place(w, 'belt', 17, 9, 0)
    place(w, 'belt', 15, 9, 0)
    place(w, 'belt', 16, 8, 1)
    const b = get(w, 16, 9)!
    expect(beltInDir(w, b)).toBe(0)
    get(w, 16, 8)!.item = newItem('wool')
    get(w, 16, 8)!.item!.p = 1
    run(w, 0.5)
    // the side belt can't push in
    expect(get(w, 16, 8)!.item?.kind).toBe('wool')
    // with a merger it can
    remove(w, 16, 9)
    place(w, 'merger', 16, 9, 0)
    run(w, 1)
    expect(get(w, 16, 8)!.item).toBeNull()
  })
})

describe('resources (GDD 6.1)', () => {
  it('a producer takes from the nearest owned cell and the empty cell disappears', () => {
    const w = world()
    const f = res(w, Field)
    // the home meadow is 8..10 × 5..6; a mower at (11, 5) reaches it
    expect(whyNot(w, 'mower', 11, 5)).toBe('')
    const near = reachCells(w, 11, 5, 'meadow', true)
    expect(near[0]!.x).toBe(10)
    expect(near[0]!.y).toBe(5)
    place(w, 'mower', 11, 5, 0)
    // carry its pile away, as a player would
    for (let t = 0; t < 6 * RES.meadow.max + 2; t += 1 / 60) {
      stepSimulation(w)
      get(w, 11, 5)!.pile.length = 0
    }
    expect(f.terrain.has(key(10, 5))).toBe(false)
    expect(f.res.has(key(10, 5))).toBe(false)
    // and the freed cell is buildable
    expect(whyNot(w, 'belt', 10, 5)).toBe('')
  })
  it('hand gathering is one click, one item, into the stock', () => {
    const w = world()
    res(w, Stock).n = {}
    const left = res(w, Field).res.get(key(9, 5))!.left
    gather(w, 9, 5)
    expect(stockOf(w, 'hay')).toBe(1)
    expect(res(w, Field).res.get(key(9, 5))!.left).toBe(left - 1)
  })
  it('a plot with nothing on it is not for sale; a richer one costs more and each purchase raises prices', () => {
    const w = world('m1')
    expect(plotPrice(w, 0, 1)).toBe(0)
    const w2 = world('m3')
    const big = plotPrice(w2, 3, 1),
      small = plotPrice(w2, 0, 2)
    expect(big).toBeGreaterThan(small)
    expect(buyPlot(w2, 0, 2)).toBe(true)
    expect(plotPrice(w2, 3, 1)).toBeGreaterThan(big)
  })
})

describe('orders (GDD 7)', () => {
  it('pay per batch, and a done order keeps buying at half a batch', () => {
    const w = world('m3')
    const o = res(w, Market).orders.find((q) => q.kind === 'wool')!
    const dock = get(w, dockX(w, o.dock), GRID.roadY)!
    const c0 = res(w, GameState).coins
    for (let i = 0; i < o.total; i++) dockAccept(w, dock, newItem('wool'))
    expect(o.done).toBe(true)
    expect(res(w, GameState).coins - c0).toBe((o.total / o.batch) * o.pay)
    const c1 = res(w, GameState).coins
    for (let i = 0; i < o.batch; i++) dockAccept(w, dock, newItem('wool'))
    expect(res(w, GameState).coins - c1).toBe(Math.ceil(o.pay / 2))
  })
  it('a dock is loaded with as many as the player picks; the market sells and buys', () => {
    const w = world('m3')
    res(w, Stock).n = {}
    const o = res(w, Market).orders.find((q) => q.kind === 'wool')!
    const dock = get(w, dockX(w, o.dock), GRID.roadY)!
    res(w, Stock).n.wool = 7
    expect(loadDock(w, dock, 5)).toBe(5)
    expect(o.have).toBe(5)
    expect(stockOf(w, 'wool')).toBe(2)
    expect(loadDock(w, dock, 9)).toBe(2)
    const c0 = res(w, GameState).coins
    res(w, Stock).n.yarn = 4
    expect(sell(w, 'yarn', 3)).toBe(3)
    expect(res(w, GameState).coins).toBe(c0 + 3 * sellPrice('yarn'))
    expect(stockOf(w, 'yarn')).toBe(1)
    // buying costs more than an order pays for the same good, so it never pays to buy for an order
    expect(buyPrice('wool')).toBeGreaterThan(o.pay / o.batch)
    const c1 = res(w, GameState).coins
    expect(buy(w, 'hay', 4)).toBe(4)
    expect(res(w, GameState).coins).toBe(c1 - 4 * buyPrice('hay'))
    expect(stockOf(w, 'hay')).toBe(4)
    res(w, GameState).coins = 1
    expect(buy(w, 'sweater', 1)).toBe(0)
  })
})

describe('pasture (GDD 5)', () => {
  it('a shorn sheep takes one hay from the feeder and one water from the trough for its next fleece; the longest wait is fed first', () => {
    const w = world()
    const flock = res(w, Flock)
    const p = flock.pastures[0]!
    const feeder = storeOf(w, p, 'hay')!,
      trough = storeOf(w, p, 'water')!
    for (const s of flock.sheep) {
      s.wool = 0
      s.fed = false
      s.waitT = 0
    }
    const [a, b] = flock.sheep as [SheepT, SheepT]
    a.waitT = 5
    // hay and water for one fleece in the stores (none in the stock: the stock feeds nobody): the sheep that waited
    // longer gets it, the pasture says what the rest wait for
    res(w, Stock).n = { hay: 5, water: 5 }
    feeder.inv.hay = 1
    trough.inv.water = 1
    run(w, 0.05)
    expect(a.fed).toBe(true)
    expect(b.fed).toBe(false)
    expect(feeder.inv.hay).toBe(0)
    expect(trough.inv.water).toBe(0)
    expect(stockOf(w, 'hay')).toBe(5)
    expect(p.want.sort()).toEqual(['hay', 'water'])
    // a paid fleece grows in SHEEP.grow seconds, then the sheep is fluffy and the next one is unpaid
    run(w, SHEEP.grow + 0.5)
    expect(a.wool).toBe(1)
    expect(a.fed).toBe(false)
    expect(b.wool).toBe(0)
    // with enough in the stores every shorn sheep is fed at once: nine sheep take nine of each
    const k = flock.sheep.filter((s) => s.state === 'pasture' && s.wool < 1).length
    feeder.inv.hay = 20
    trough.inv.water = 20
    run(w, 0.05)
    expect(feeder.inv.hay).toBe(20 - k)
    expect(trough.inv.water).toBe(20 - k)
    expect(p.want).toEqual([])
  })
  it('the feeder and trough stand on free land by every pasture, take their one good from their open side and are filled from the stock', () => {
    for (const m of ['m2', 'm3', 'm4', 'm5', 'm6', 'm7'] as const) {
      const w = world(m)
      const f = res(w, Field)
      for (const p of res(w, Flock).pastures)
        for (const k of ['hay', 'water'] as const) {
          const b = storeOf(w, p, k)!
          expect(b, m + ' ' + k).toBeTruthy()
          expect(b.fixed).toBe(true)
          for (const [x, y] of [[b.x, b.y], [b.x + b.w - 1, b.y + b.h - 1]]) {
            expect(f.terrain.has(key(x!, y!)), m + ' ' + k + ' on terrain').toBe(false)
            expect(res(w, Field).plots.has(key(Math.floor(x! / GRID.plotW), Math.floor(y! / GRID.plotH))), m + ' ' + k + ' owned').toBe(true)
            expect(get(w, x!, y!)).toBe(b)
          }
          // two ways in, both from the side away from the pen, going towards it
          const ins = inCells(w, b)
          expect(ins.length).toBe(2)
          expect(ins.every((c) => c.d === b.dir)).toBe(true)
          expect(outCells(b)).toEqual([])
        }
    }
    const w = world('m3')
    const p = res(w, Flock).pastures[0]!
    const feeder = storeOf(w, p, 'hay')!
    // a belt from its open side brings hay in; one from the pen's side or with the wrong good is refused
    const c = inCells(w, feeder)[0]!
    place(w, 'belt', c.x, c.y, c.d)
    const belt = get(w, c.x, c.y)!
    belt.item = newItem('hay')
    belt.item.p = 1
    run(w, 0.2)
    expect(belt.item).toBeNull()
    expect(feeder.inv.hay).toBe(1)
    belt.item = newItem('water')
    belt.item.p = 1
    run(w, 0.2)
    expect(belt.item?.kind).toBe('water')
    // its popup's «+N»: from the stock up to its cap
    res(w, Stock).n = { hay: 20 }
    expect(feed(w, feeder, 'hay', 99)).toBe(BUILDINGS.feeder.cap! - 1)
    expect(feeder.inv.hay).toBe(BUILDINGS.feeder.cap)
    expect(stockOf(w, 'hay')).toBe(20 - BUILDINGS.feeder.cap! + 1)
    // fixed: not removed, not moved, not turned
    expect(remove(w, feeder.x, feeder.y)).toBe(false)
    expect(liftUp(w, feeder)).toBe(false)
    expect(rotate(w, feeder)).toBe(false)
  })
  it('on pause the hand works no field: no shearing, no gathering', () => {
    const w = world('m1')
    const s = res(w, Flock).sheep[0]!
    s.wool = 1
    res(w, GameState).speed = 0
    for (let i = 0; i < 3; i++) handClick(w, s.px, s.py)
    expect(s.wool).toBe(1)
    expect(stockOf(w, 'wool')).toBe(0)
    res(w, GameState).speed = 1
    for (let i = 0; i < 3; i++) handClick(w, s.px, s.py)
    expect(stockOf(w, 'wool')).toBe(2)
  })
  it('a machine is loaded from the stock up to its four places of each input', () => {
    const w = world()
    place(w, 'carder', 16, 8, 0)
    const m = get(w, 16, 8)!
    res(w, Stock).n = { wool: 10 }
    m.inv.wool = 1
    expect(feed(w, m, 'wool', 9)).toBe(3)
    expect(m.inv.wool).toBe(4)
    expect(stockOf(w, 'wool')).toBe(7)
    expect(feed(w, m, 'hay', 2)).toBe(0)
  })
  it('a plot picked bare by hand stays for sale, at the base price', () => {
    const w = world('m3')
    const f = res(w, Field)
    const [px, py] = [3, 1]
    const p0 = plotPrice(w, px, py)
    expect(p0).toBeGreaterThan(0)
    for (const [k, r] of [...f.res]) {
      const [x, y] = unkey(k)
      if (Math.floor(x / GRID.plotW) !== px || Math.floor(y / GRID.plotH) !== py) continue
      res(w, GameState).speed = 1
      while (f.res.has(k) && r.left > 0) gather(w, x, y)
    }
    const p1 = plotPrice(w, px, py)
    expect(p1).toBeGreaterThan(0)
    expect(p1).toBeLessThan(p0)
    expect(buyPlot(w, px, py)).toBe(true)
  })
  it('the hand gathers nothing on land not bought yet: a click there opens the plot', () => {
    const w = world()
    const f = res(w, Field)
    res(w, Stock).n = {}
    const k = [...f.res.keys()].find((q) => !f.plots.has(key(Math.floor(unkey(q)[0] / GRID.plotW), Math.floor(unkey(q)[1] / GRID.plotH))))!
    const [x, y] = unkey(k),
      r = f.res.get(k)!
    const left = r.left
    handClick(w, x + 0.5, y + 0.5)
    expect(f.res.get(k)!.left).toBe(left)
    expect(stockOf(w, r.t === 'meadow' ? 'hay' : r.t === 'bush' ? 'dye' : 'water')).toBe(0)
    expect(res(w, Ui).sel?.kind).toBe('plot')
    // on own land it gathers; a pond never runs out
    const own = [...f.res.keys()].find((q) => f.plots.has(key(Math.floor(unkey(q)[0] / GRID.plotW), Math.floor(unkey(q)[1] / GRID.plotH))) && f.res.get(q)!.t === 'water')!
    const [ox, oy] = unkey(own)
    for (let i = 0; i < 30; i++) handClick(w, ox + 0.5, oy + 0.5)
    expect(stockOf(w, 'water')).toBe(30)
    expect(f.res.get(own)!.left).toBe(RES.water.max)
  })
  it('only sheep go into a pasture, and only through its way in; hay goes into a barn', () => {
    const w = world()
    res(w, Unlocks).unlocked.add('barn')
    const p = res(w, Flock).pastures[0]!
    // a belt into the pasture's side that isn't its way in holds its sheep
    const s = res(w, Flock).sheep[0]!
    place(w, 'belt', p.x - 1, p.y + 1, 0)
    const side = get(w, p.x - 1, p.y + 1)!
    side.item = newItem('sheep', s)
    side.item.p = 1
    run(w, 0.2)
    expect(side.item?.sheep).toBe(s)
    // the way in takes it
    place(w, 'belt', p.entry.x, p.entry.y, p.entry.d)
    const gate = get(w, p.entry.x, p.entry.y)!
    gate.item = newItem('sheep', s)
    gate.item.p = 1
    side.item = null
    run(w, 0.2)
    expect(gate.item).toBeNull()
    expect(s.state).toBe('pasture')
    // hay at the way in waits; hay into a barn is stocked
    gate.item = newItem('hay')
    gate.item.p = 1
    run(w, 0.2)
    expect(gate.item?.kind).toBe('hay')
    const [bx, by] = free((x, y) => !whyNot(w, 'barn', x, y, 0) && !whyNot(w, 'belt', x - 1, y + 1))
    place(w, 'barn', bx, by, 0)
    // its one way in, from behind
    const i = inCell(get(w, bx, by)!)!
    place(w, 'belt', i.x, i.y, i.d)
    const feed = get(w, i.x, i.y)!
    feed.item = newItem('hay')
    feed.item.p = 1
    const h0 = stockOf(w, 'hay')
    run(w, 0.2)
    expect(feed.item).toBeNull()
    expect(stockOf(w, 'hay')).toBe(h0 + 1)
  })
  it('a click on a fluffy sheep three times shears it into the stock', () => {
    const w = world('m1')
    const s = res(w, Flock).sheep[0]!
    s.wool = 1
    for (let i = 0; i < 3; i++) handClick(w, s.px, s.py)
    expect(stockOf(w, 'wool')).toBe(2)
    expect(s.wool).toBe(0)
  })
})

describe('building', () => {
  it('removing returns the coins and keeps the goods', () => {
    const w = world()
    const c0 = res(w, GameState).coins
    place(w, 'carder', 16, 8, 0)
    const m = get(w, 16, 8)!
    m.inv.wool = 3
    remove(w, 16, 8)
    expect(res(w, GameState).coins).toBe(c0)
    expect(stockOf(w, 'wool')).toBe(3)
    expect(res(w, Plant).b.has(key(16, 8))).toBe(false)
  })
  it('a moved machine keeps what it holds and costs nothing; a move called off puts it back', () => {
    const w = world()
    place(w, 'carder', 16, 8, 0)
    const m = get(w, 16, 8)!
    m.inv.wool = 3
    const c0 = res(w, GameState).coins
    expect(liftUp(w, m)).toBe(true)
    expect(get(w, 16, 8)).toBeNull()
    expect(res(w, Ui).tool).toBe('carder')
    // it can't come down where it can't stand, and comes down, turned, where it can
    expect(putDown(w, 16, 30, 0)).toBe(false)
    const [x, y] = free((x, y) => !whyNot(w, 'carder', x, y, 1) && (x !== 16 || y !== 8))
    expect(putDown(w, x, y, 1)).toBe(true)
    expect(get(w, x + 1, y + 1)).toBe(m)
    expect(m.dir).toBe(1)
    expect(m.inv.wool).toBe(3)
    expect(res(w, GameState).coins).toBe(c0)
    expect(res(w, Ui).moving).toBeNull()
    liftUp(w, m)
    putBack(w)
    expect(get(w, x, y)).toBe(m)
    // a belt cell moves as well; a dock stays where it is
    const [bx, by] = free((x, y) => !whyNot(w, 'belt', x, y) && !whyNot(w, 'belt', x + 1, y))
    place(w, 'belt', bx, by, 0)
    const bt = get(w, bx, by)!
    expect(liftUp(w, bt)).toBe(true)
    expect(putDown(w, bx + 1, by, 1)).toBe(true)
    expect(get(w, bx + 1, by)).toBe(bt)
    expect(bt.dir).toBe(1)
    const dock = [...res(w, Plant).b.values()].find((q) => q.type === 'dock')!
    expect(liftUp(w, dock)).toBe(false)
  })
  it('a mower stands anywhere, a berry picker only by bushes, a pump with its tower in the water', () => {
    const w = world()
    // a spot with no meadow, pond or bush in reach
    const [x, y] = free((x, y) => !whyNot(w, 'belt', x, y) && !whyNot(w, 'belt', x + 1, y) && (['meadow', 'water', 'bush'] as const).every((r) => !reachCells(w, x, y, r, false, 2, 1).length))
    expect(whyNot(w, 'mower', x, y, 0)).toBe('')
    expect(whyNot(w, 'pump', x, y, 0)).toBe('inWater')
    expect(whyNot(w, 'berry', x, y, 0)).toBe('needBush')
    // m3's river runs along row 12: a pump facing north stands with its tower on (12, 12) and its barrel on (12, 11)
    expect(whyNot(w, 'pump', 12, 11, 3)).toBe('')
    // the other way round — barrel in the river, tower on the bank — it may not
    expect(whyNot(w, 'pump', 12, 12, 3)).toBe('onWater')
    expect(place(w, 'pump', 12, 11, 3)).toBe(true)
    const pump = get(w, 12, 12)!
    expect(pump.type).toBe('pump')
    expect(outCells(pump).map((c) => [c.x, c.y])).toEqual([[12, 10]])
    // its output cell is the pasture's trough: it gives water straight into it, without draining the river
    const trough = storeOf(w, res(w, Flock).pastures[0]!, 'water')!
    expect(get(w, 12, 10)).toBe(trough)
    trough.inv.water = 0
    run(w, 6)
    expect(trough.inv.water).toBe(1)
    expect(res(w, Field).res.get(key(12, 12))!.left).toBe(RES.water.max)
    expect(pump.status).not.toBe('empty')
  })
  it('a belt runs empty too', () => {
    const w = world()
    const [x, y] = free((x, y) => !whyNot(w, 'belt', x, y))
    place(w, 'belt', x, y, 0)
    const b = get(w, x, y)!
    const p0 = b.phase
    run(w, 0.3)
    expect(b.phase).not.toBe(p0)
  })
})

describe('ways in and out (one rule for every building)', () => {
  it('a merger takes from behind and both sides, a splitter gives to three; producers only give, a barn only takes', () => {
    const w = world()
    const one = (t: BuildingId) => blankBuilding(t, 16, 8, 0)
    expect(inCells(w, one('merger')).map((c) => c.d).sort()).toEqual([0, 1, 3])
    expect(outCells(one('merger')).map((c) => c.d)).toEqual([0])
    expect(inCells(w, one('splitter')).map((c) => c.d)).toEqual([0])
    expect(outCells(one('splitter')).map((c) => c.d).sort()).toEqual([0, 1, 3])
    for (const t of ['mower', 'pump', 'berry'] as const) expect(inCells(w, one(t))).toEqual([])
    expect(outCells(one('barn'))).toEqual([])
    expect(inCells(w, one('barn')).length).toBe(1)
    // every machine that works on goods has exactly one way in
    for (const t of ['shearer', 'carder', 'spinner', 'felter', 'workshop'] as const) expect(inCells(w, one(t)).length, t).toBe(1)
    // a truck dock takes from above only, never from the dock row
    const dock = [...res(w, Plant).b.values()].find((q) => q.type === 'dock' && q.client !== 'market')!
    const ins = inCells(w, dock)
    expect(ins.length).toBe(dock.w)
    expect(ins.every((c) => c.y === dock.y - 1)).toBe(true)
  })
})

describe('2×2 workshops (GDD 4.1)', () => {
  it('cover four cells, turn in place, take in through one back cell and give from one front cell', () => {
    const w = world()
    expect(place(w, 'carder', 16, 8, 0)).toBe(true)
    const m = get(w, 16, 8)!
    for (const [x, y] of [
      [17, 8],
      [16, 9],
      [17, 9],
    ])
      expect(get(w, x!, y!)).toBe(m)
    expect(whyNot(w, 'belt', 17, 9)).toBe('taken')
    // turning keeps the same four cells
    m.dir = 1
    expect(get(w, 17, 9)).toBe(m)
    m.dir = 0
    // its one way in is the back cell in line with its output (facing east, the lower west cell): a belt there feeds
    // it; one into the other back cell, its side or its front does not (the author: «конкретный выход и вход»)
    expect(inCell(m)).toEqual({ x: 15, y: 9, sx: 16, sy: 9, d: 0 })
    const feed = (x: number, y: number, d: 0 | 1 | 2 | 3) => {
      place(w, 'belt', x, y, d)
      get(w, x, y)!.item = newItem('wool')
      get(w, x, y)!.item!.p = 1
    }
    feed(15, 9, 0)
    feed(15, 8, 0)
    feed(16, 7, 1)
    feed(18, 8, 2)
    run(w, 0.1)
    expect(m.inv.wool).toBe(1)
    for (const [x, y] of [
      [15, 8],
      [16, 7],
      [18, 8],
    ])
      expect(get(w, x!, y!)!.item?.kind).toBe('wool')
    remove(w, 15, 8)
    remove(w, 16, 7)
    // one output: the right-hand front cell as you face out (facing east, the lower one); turning walks it round
    expect(outCells(m).map((c) => [c.x, c.y])).toEqual([[18, 9]])
    remove(w, 18, 8)
    place(w, 'belt', 18, 9, 0)
    m.inv.wool = 2
    run(w, 3.5)
    expect(get(w, 18, 9)!.item?.kind).toBe('roving')
    const walk: [number, number][] = []
    for (const d of [1, 2, 3] as const) {
      m.dir = d
      walk.push([outCells(m)[0]!.x, outCells(m)[0]!.y])
    }
    expect(walk).toEqual([
      [16, 10],
      [15, 8],
      [17, 7],
    ])
    m.dir = 0
    // removing it by any cell frees all four
    remove(w, 17, 9)
    expect(get(w, 16, 8)).toBeNull()
    expect(whyNot(w, 'belt', 17, 9)).toBe('')
  })
})

describe('the 2×2 shearer (GDD 4.1)', () => {
  it('takes sheep in from the pasture exit, sends them on in front and the wool out to its right', () => {
    const w = world('m1')
    res(w, Unlocks).unlocked.add('shearer')
    const p = res(w, Flock).pastures[0]!
    const [ax, ay] = anchorForInput('shearer', p.dir, p.exit.x, p.exit.y)
    expect(place(w, 'shearer', ax, ay, p.dir)).toBe(true)
    const s = get(w, p.exit.x, p.exit.y)!
    expect([s.type, s.w, s.h]).toEqual(['shearer', 2, 2])
    expect(inCell(s)).toMatchObject({ sx: p.exit.x, sy: p.exit.y, d: p.dir })
    // facing east: the sheep leave from the lower east cell, the wool from the way-in cell, southwards
    expect(outCells(s).map((c) => [c.x, c.y, c.d])).toEqual([
      [ax + 2, ay + 1, 0],
      [ax, ay + 2, 1],
    ])
    for (const q of res(w, Flock).sheep) q.wool = 1
    run(w, 6)
    expect(s.count).toBeGreaterThan(0)
  })
})

describe('2×1 producers, 2×1 docks, a 2×2 market (GDD 4.1, 2)', () => {
  it('a producer lies along its output, reaches round both cells and turns about its top-left cell', () => {
    const w = world()
    expect(place(w, 'mower', 11, 5, 0)).toBe(true)
    const m = get(w, 11, 5)!
    expect(get(w, 12, 5)).toBe(m)
    expect(outCells(m).map((c) => [c.x, c.y])).toEqual([[13, 5]])
    // its reach is measured from both cells
    expect(reachOf(w, m, 'meadow', true)[0]!.x).toBe(10)
    // turned south it stands on (11, 5) and (11, 6), and gives out of the lower one
    expect(rotate(w, m)).toBe(true)
    expect(get(w, 12, 5)).toBeNull()
    expect(get(w, 11, 6)).toBe(m)
    expect(outCells(m).map((c) => [c.x, c.y])).toEqual([[11, 7]])
    // it won't turn onto a cell that is taken
    place(w, 'belt', 12, 5, 0)
    expect(rotate(w, m)).toBe(false)
    expect(m.dir).toBe(1)
  })
  it('docks with a truck take two cells of the dock row, the market a 2×2 stall above it', () => {
    const w = world()
    for (const b of res(w, Plant).b.values()) {
      if (b.type !== 'dock') continue
      if (b.client === 'market') {
        expect([b.w, b.h, b.y]).toEqual([2, 2, GRID.roadY - 1])
        expect(get(w, b.x + 1, GRID.roadY)).toBe(b)
      } else {
        expect([b.w, b.h, b.y]).toEqual([2, 1, GRID.roadY])
        expect(get(w, b.x + 1, GRID.roadY)).toBe(b)
      }
    }
  })
})

describe('workshop recipes (GDD 4.1)', () => {
  it('makes the recipe it is set to, one at a time', () => {
    const w = world('m7')
    res(w, Unlocks).unlocked.add('workshop')
    expect(place(w, 'workshop', 16, 8, 0)).toBe(true)
    const m = get(w, 16, 8)!
    // a new workshop starts on the newest recipe the mission taught
    expect(m.recipe).toBe('valenki')
    setRecipe(w, m, 'sweater')
    m.inv = { yarn: 1, cyarn: 1 }
    for (let t = 0; t < 7; t += 1 / 60) {
      stepSimulation(w)
      m.pile.length = 0
    }
    expect(m.count).toBe(1)
    // goods for another recipe are refused
    expect(m.inv.felt).toBeUndefined()
  })
  it('a recipe switch gives back what it held, and a job in progress', () => {
    const w = world('m7')
    res(w, Unlocks).unlocked.add('workshop')
    place(w, 'workshop', 16, 8, 0)
    const m = get(w, 16, 8)!
    setRecipe(w, m, 'cyarn')
    res(w, Stock).n = {}
    m.inv = { yarn: 2, dye: 2 }
    run(w, 0.1)
    // one job started (1 yarn + 1 dye in it), one of each still stored
    expect(m.slot).not.toBeNull()
    setRecipe(w, m, 'sweater')
    expect(res(w, Stock).n).toEqual({ dye: 2, yarn: 2 })
    expect(m.slot).toBeNull()
    expect(m.recipe).toBe('sweater')
  })
})
