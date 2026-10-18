import { afterEach, describe, expect, it } from 'vitest'
import { BUILDINGS, GRID, ISLAND_GROW, ITEMS, LEVELS, PEN, RECIPE_ORDER, SHEEP, SOW, TOOL_ORDER, type BuildingId, type Dir } from './balance'
import { anchorForInput, get, inCells, inGood, outCells, outGood, plotPrice, reachOf, whyNot } from './grid'
import { buyPlot, buySheep, liftUp, place, putBack, putDown, remove, rotate, setRecipe, setSeed } from './actions/build'
import { dropSheep, gather, handClick, shearClick } from './actions/hand'
import { stepSimulation } from './systems'
import { dockAccept, loadAsk, marketDock, openAsks, openLevel, sell, sellPrice, buy, buyPrice } from './systems/village'
import { unlock } from './systems/unlocks'
import { startWorld } from './start'
import { blankBuilding, createGameWorld, DEMO, Field, Flock, float, Fx, GameState, Market, Plant, PLAY, puff, sound, Stock, SYSTEMS, Systems, Ui, Unlocks, key, newItem, res, stockOf, type SheepT, type World } from './world'

let worlds: World[] = []
afterEach(() => {
  for (const w of worlds) w.destroy()
  worlds = []
})
/** A fresh long game with everything open, plenty of coins and the plots of rows 1–3 bought. */
function world(opts: { all?: boolean } = { all: true }) {
  const w = createGameWorld({ seed: 3 })
  if (opts.all) {
    for (const b of TOOL_ORDER) res(w, Unlocks).unlocked.add(b)
    for (const r of RECIPE_ORDER) res(w, Unlocks).recipes.add(r)
    // everything open: sheep eat, the market trades
    res(w, GameState).food = true
    for (const s of res(w, Flock).sheep) s.fed = false
    res(w, GameState).trade = true
    for (let py = 1; py < 4; py++) for (let px = 0; px < 4; px++) res(w, Field).plots.add(key(px, py))
  }
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
/** A good waiting at the far end of a belt cell, ready to move on. */
function onBelt(w: World, x: number, y: number, kind: Parameters<typeof newItem>[0], sheep?: SheepT) {
  const b = get(w, x, y)!
  b.item = newItem(kind, sheep)
  b.item.p = 1
  return b
}
const pen0 = (w: World) => res(w, Flock).pastures[0]!
const sheepOf = (w: World) => res(w, Flock).sheep

describe('belts (GDD 4.2)', () => {
  it('take items from one side only; a second line needs a merger', () => {
    const w = world()
    place(w, 'belt', 16, 16, 0)
    place(w, 'belt', 17, 16, 0)
    place(w, 'belt', 15, 16, 0)
    place(w, 'belt', 16, 15, 1)
    onBelt(w, 16, 15, 'wool')
    run(w, 0.5)
    expect(get(w, 16, 15)!.item?.kind).toBe('wool')
    remove(w, 16, 16)
    place(w, 'merger', 16, 16, 0)
    run(w, 1)
    expect(get(w, 16, 15)!.item).toBeNull()
  })
  it("a splitter's closed side feeds nothing: a belt beside it takes from its other neighbour", () => {
    const w = world()
    // a belt going south, fed from the west by one splitter and with a second splitter to its east, closed that way
    place(w, 'belt', 16, 16, 1)
    place(w, 'splitter', 15, 16, 1)
    place(w, 'splitter', 17, 16, 1)
    get(w, 15, 16)!.rules = { l: 'any', f: 'off', r: 'off' }
    get(w, 17, 16)!.rules = { l: 'off', f: 'off', r: 'off' }
    place(w, 'belt', 15, 15, 1)
    onBelt(w, 15, 15, 'wool')
    run(w, 1.5)
    expect(get(w, 16, 16)!.item?.kind ?? get(w, 16, 17)?.item?.kind).toBe('wool')
  })
})

describe('resources and land (GDD 6)', () => {
  it('a producer takes from the nearest owned cell and the empty cell disappears', () => {
    const w = world()
    // the meadow by the first pen: (19, 11..14) and (17..18, 14)
    expect(place(w, 'mower', 20, 15, 0)).toBe(true)
    const m = get(w, 20, 15)!
    const near = reachOf(w, m, 'meadow', true)[0]!
    const left = near.r.left
    run(w, 4.2)
    expect(res(w, Field).res.get(near.k)!.left).toBe(left - 1)
    res(w, Field).res.get(near.k)!.left = 1
    run(w, 4.2)
    expect(res(w, Field).res.has(near.k)).toBe(false)
    expect(res(w, Field).terrain.has(near.k)).toBe(false)
  })
  it('the hand gathers one item a click, and only on own land', () => {
    const w = world({ all: false })
    expect(gather(w, 19, 14)).toBe(true)
    expect(stockOf(w, 'hay')).toBe(1)
    // the north plots aren't bought yet
    expect(gather(w, 13, 7)).toBe(false)
    expect(stockOf(w, 'hay')).toBe(1)
  })
  it('a plot with nothing on it is not for sale; a richer one costs more and each purchase raises prices', () => {
    const w = world({ all: false })
    const p11 = plotPrice(w, 1, 1)
    expect(p11).toBeGreaterThan(0)
    expect(buyPlot(w, 1, 1)).toBe(true)
    expect(plotPrice(w, 2, 1)).toBeGreaterThan(0)
    // the far row and the east are under the sky until the island grows
    expect(plotPrice(w, 1, 0)).toBe(0)
    expect(plotPrice(w, 4, 2)).toBe(0)
    res(w, Field).top = 0
    res(w, Field).right = GRID.cols
    expect(plotPrice(w, 1, 0)).toBeGreaterThan(0)
    expect(plotPrice(w, 4, 2)).toBeGreaterThan(0)
  })
})

describe('sowing (GDD 6.1)', () => {
  it('a seed from the stock sprouts and grows into a small meadow; a seeder sows from what its belt brings', () => {
    const w = world()
    res(w, Stock).n.hay = 1
    res(w, Ui).seed = 'meadow'
    expect(place(w, 'sow', 17, 17, 0)).toBe(true)
    expect(stockOf(w, 'hay')).toBe(0)
    expect(res(w, Field).terrain.get(key(17, 17))).toBe('sprout')
    expect(whyNot(w, 'belt', 17, 17)).toBe('sprout')
    // no seed, no sowing
    expect(place(w, 'sow', 18, 17, 0)).toBe(false)
    run(w, SOW.grow + 0.1)
    expect(res(w, Field).res.get(key(17, 17))).toMatchObject({ t: 'meadow', left: SOW.meadow })
    // a seeder sowing bushes from dye it is given
    expect(place(w, 'seeder', 15, 18, 0)).toBe(true)
    const s = get(w, 15, 18)!
    setSeed(w, s, 'bush')
    s.inv.dye = 2
    run(w, 4.2)
    expect([...res(w, Field).sprouts.values()].some((q) => q.t === 'bush')).toBe(true)
    expect(s.inv.dye).toBe(1)
  })
})

describe('pens and sheep (GDD 5)', () => {
  it('a pen is a building for four sheep: placed for coins, removed only when empty; sheep are bought apart, into the pen clicked', () => {
    const w = world()
    expect(PEN.cap).toBe(4)
    const c0 = res(w, GameState).coins
    expect(place(w, 'pen', 15, 15, 0)).toBe(true)
    expect(res(w, GameState).coins).toBe(c0 - PEN.cost)
    const p = res(w, Flock).pastures.at(-1)!
    expect(sheepOf(w).some((s) => s.home === p.id)).toBe(false)
    // the sheep tool: only on a pen, only while it has room; it stays in hand for the next one
    expect(whyNot(w, 'sheep', 18, 14)).toBe('needPen')
    expect(place(w, 'sheep', 18, 14, 0)).toBe(false)
    for (let i = 0; i < PEN.cap; i++) expect(place(w, 'sheep', 16, 16, 0)).toBe(true)
    expect(res(w, GameState).coins).toBe(c0 - PEN.cost - PEN.cap * SHEEP.price)
    expect(whyNot(w, 'sheep', 16, 16)).toBe('penFull')
    expect(place(w, 'sheep', 16, 16, 0)).toBe(false)
    expect(BUILDINGS.sheep.repeat).toBe(true)
    expect(sheepOf(w).filter((s) => s.home === p.id).length).toBe(PEN.cap)
    expect(sheepOf(w).at(-1)!.wool).toBe(1)
    expect(remove(w, 16, 16)).toBe(false)
    res(w, Flock).sheep = sheepOf(w).filter((s) => s.home !== p.id)
    expect(remove(w, 16, 16)).toBe(true)
    expect(res(w, Flock).pastures.includes(p)).toBe(false)
  })
  it('a pen takes no fifth sheep from the hand; a belt never moves a sheep into another pen: it crosses it or waits', () => {
    const w = world()
    place(w, 'pen', 15, 15, 0)
    const p = res(w, Flock).pastures.at(-1)!
    for (let i = 0; i < PEN.cap; i++) buySheep(w, p)
    // a sheep of the first pen dropped on the full one goes back home
    const first = res(w, Flock).pastures[0]!.id
    const s = sheepOf(w).find((q) => q.home === first)!
    dropSheep(w, s, 16.5, 16.5)
    expect(s.home).toBe(first)
    // a belt into another pen's way in: with nothing at that pen's way out to ride on, the sheep waits on the belt
    place(w, 'belt', p.entry.x, p.entry.y, p.entry.d)
    const b = onBelt(w, p.entry.x, p.entry.y, 'sheep', s)
    res(w, Flock).sheep = sheepOf(w).filter((q) => q !== sheepOf(w).find((r) => r.home === p.id))
    run(w, 1)
    expect(b.item?.sheep).toBe(s)
    expect(s.home).toBe(first)
    // the hand moves it there, now that it has a place
    b.item = null
    dropSheep(w, s, 16.5, 16.5)
    expect(s.home).toBe(p.id)
  })
  it('before the feeder there is no food: a shorn sheep grows its fleece by itself; the feeder brings food in', () => {
    const w = startWorld({ seed: 1 })
    worlds.push(w)
    res(w, Unlocks).cardQ.length = 0
    expect(res(w, GameState).food).toBe(false)
    const s = sheepOf(w)[0]!
    for (let i = 0; i < 3; i++) shearClick(w, s)
    run(w, SHEEP.grow + 1)
    expect(s.wool).toBe(1)
    // the feeder's level: from the next shearing on the sheep has to eat
    unlock(w, 'feeder')
    expect(res(w, GameState).food).toBe(true)
    for (let i = 0; i < 3; i++) shearClick(w, s)
    run(w, SHEEP.grow + 1)
    expect(s.wool).toBe(0)
  })
  it('the first level opens the shearer, and the belt once it stands; the market comes at its own level', () => {
    const w = startWorld({ seed: 1 })
    worlds.push(w)
    const un = res(w, Unlocks)
    expect(un.cardQ).toEqual(['shearer'])
    expect(un.unlocked.has('belt')).toBe(false)
    // the market takes goods from the start; it trades only from its level on
    expect(marketDock(w)).not.toBeNull()
    expect(res(w, GameState).trade).toBe(false)
    un.cardQ.length = 0
    const p = res(w, Flock).pastures[0]!
    const [ax, ay] = anchorForInput('shearer', p.dir, p.exit.x, p.exit.y)
    expect(place(w, 'shearer', ax, ay, p.dir)).toBe(true)
    expect(un.unlocked.has('belt')).toBe(true)
    expect(un.cardQ).toEqual(['belt'])
    // no market to sell to yet
    res(w, Stock).n.wool = 5
    expect(sell(w, 'wool', 5)).toBe(0)
    openLevel(w, LEVELS.findIndex((L) => L.open.includes('market')))
    expect(res(w, GameState).trade).toBe(true)
    expect(sell(w, 'wool', 5)).toBe(5)
  })
  it('a shorn sheep grows its next fleece only once fed; the hand feeds it one hay from the stock', () => {
    const w = world()
    const s = sheepOf(w)[0]!
    for (let i = 0; i < 3; i++) shearClick(w, s)
    expect(stockOf(w, 'wool')).toBe(2)
    run(w, SHEEP.grow + 1)
    expect(s.wool).toBe(0)
    // a click with no hay in stock does nothing; with one, it feeds
    handClick(w, s.px, s.py)
    expect(s.fed).toBe(false)
    res(w, Stock).n.hay = 1
    handClick(w, s.px, s.py)
    expect(s.fed).toBe(true)
    expect(stockOf(w, 'hay')).toBe(0)
    run(w, SHEEP.grow + 0.5)
    expect(s.wool).toBe(1)
    expect(s.fed).toBe(false)
  })
  it('on pause the hand works no field: no shearing, no gathering', () => {
    const w = world()
    res(w, GameState).speed = 0
    const s = sheepOf(w)[0]!
    handClick(w, s.px, s.py)
    expect(s.clicks).toBe(0)
    handClick(w, 19.5, 12.5)
    expect(stockOf(w, 'hay')).toBe(0)
  })
  it('only sheep go into a pen, and only through its way in', () => {
    const w = world()
    const p = pen0(w)
    // a belt into the pen's way in (from above, moving south), and one into its side
    place(w, 'belt', p.entry.x, p.entry.y, 1)
    place(w, 'belt', p.x - 1, p.y + 1, 0)
    onBelt(w, p.entry.x, p.entry.y, 'wool')
    onBelt(w, p.x - 1, p.y + 1, 'sheep', sheepOf(w)[1])
    run(w, 0.3)
    expect(get(w, p.entry.x, p.entry.y)!.item?.kind).toBe('wool')
    expect(get(w, p.x - 1, p.y + 1)!.item?.kind).toBe('sheep')
    get(w, p.entry.x, p.entry.y)!.item = null
    const s = sheepOf(w)[2]!
    s.state = 'belt'
    onBelt(w, p.entry.x, p.entry.y, 'sheep', s)
    run(w, 0.3)
    expect(s.state).toBe('pasture')
  })
})

/** The first pen's loop of stations, as the farm plan lays it (game/plan.ts): shearer on the exit, feeder, back round. */
function loopA(w: World, dyer = false) {
  // the pen (11..13 × 11..13) gives out at (14,12) and takes in at (12,10)
  if (dyer) {
    place(w, 'dyer', 14, 11, 0)
    place(w, 'shearer', 16, 11, 0)
  } else {
    place(w, 'shearer', 14, 11, 0)
    place(w, 'feeder', 16, 11, 0)
  }
  for (const [x, y, d] of [
    [18, 12, 3],
    [18, 11, 3],
    [18, 10, 2],
    [17, 10, 2],
    [16, 10, 2],
    [15, 10, 2],
    [14, 10, 2],
    [13, 10, 2],
    [12, 10, 1],
  ] as const)
    place(w, 'belt', x, y, d as Dir)
}

describe('stations on the sheep loop (GDD 5)', () => {
  it('the shearer cuts a fluffy sheep, wool to its right; the feeder feeds a hungry one with hay from its right', () => {
    const w = world()
    loopA(w)
    const sh = get(w, 14, 11)!,
      fe = get(w, 16, 11)!
    expect(outCells(sh).map((c) => [c.x, c.y, c.d])).toEqual([
      [16, 12, 0],
      [14, 13, 1],
    ])
    // the feeder's ways in: the sheep from behind, the hay from its right (below it, facing east)
    expect(inCells(w, fe).map((c) => [c.x, c.y, c.d, c.takes])).toEqual([
      [15, 12, 0, 'sheep'],
      [16, 13, 3, 'hay'],
    ])
    fe.inv.hay = 4
    run(w, 25)
    expect(sh.count).toBeGreaterThan(0)
    expect(fe.count).toBeGreaterThan(0)
    expect(sheepOf(w).some((s) => s.fed)).toBe(true)
  })
  it('with the feeder empty a hungry sheep waits at home (for the hand); with hay in it, it walks out to eat', () => {
    const w = world()
    loopA(w)
    const fe = get(w, 16, 11)!
    for (const s of sheepOf(w)) s.wool = 0
    run(w, 3)
    expect(sheepOf(w).every((s) => s.state === 'pasture')).toBe(true)
    fe.inv.hay = 4
    run(w, 3)
    expect(sheepOf(w).some((s) => s.state !== 'pasture')).toBe(true)
  })
  it('the dyer colours a fluffy sheep, which shears pink; with no dye it lets the sheep pass white', () => {
    const w = world()
    loopA(w, true)
    const dy = get(w, 14, 11)!,
      sh = get(w, 16, 11)!
    dy.inv.dye = 1
    run(w, 12)
    const wool = sh.pile.map((q) => q.kind)
    expect(wool).toContain('pwool')
    expect(dy.count).toBe(1)
    run(w, 10)
    expect(sh.count).toBeGreaterThan(1)
  })
})

describe('machines (GDD 4.3)', () => {
  it('a carder makes pink from pink as it makes white from white', () => {
    const w = world()
    place(w, 'carder', 16, 16, 0)
    const m = get(w, 16, 16)!
    m.inv = { pwool: 2 }
    run(w, 3.2)
    expect(m.pile.map((q) => q.kind)).toEqual(['proving'])
  })
  it("a workshop takes its recipe's two goods by two ways in, each only its own", () => {
    const w = world()
    place(w, 'workshop', 16, 16, 0)
    const m = get(w, 16, 16)!
    setRecipe(w, m, 'sweater')
    const ins = inCells(w, m)
    expect(ins.map((c) => c.takes)).toEqual(['yarn', 'pyarn'])
    // yarn into the pink yarn's way is refused, and the other way round
    place(w, 'belt', ins[0]!.x, ins[0]!.y, 0)
    place(w, 'belt', ins[1]!.x, ins[1]!.y, 0)
    onBelt(w, ins[0]!.x, ins[0]!.y, 'pyarn')
    onBelt(w, ins[1]!.x, ins[1]!.y, 'yarn')
    run(w, 0.3)
    expect(m.inv).toEqual({})
    onBelt(w, ins[0]!.x, ins[0]!.y, 'yarn')
    onBelt(w, ins[1]!.x, ins[1]!.y, 'pyarn')
    run(w, 6.5)
    expect(m.count).toBe(1)
  })
  it('a recipe switch gives back what it held', () => {
    const w = world()
    place(w, 'workshop', 16, 16, 0)
    const m = get(w, 16, 16)!
    setRecipe(w, m, 'sweater')
    res(w, Stock).n = {}
    m.inv = { yarn: 2, pyarn: 1 }
    setRecipe(w, m, 'valenki')
    expect(res(w, Stock).n).toEqual({ yarn: 2, pyarn: 1 })
    expect(m.recipe).toBe('valenki')
  })
  it('the hand never loads a machine: a click on one only selects it', () => {
    const w = world()
    place(w, 'carder', 16, 16, 0)
    res(w, Stock).n.wool = 10
    handClick(w, 16.5, 16.5)
    expect(get(w, 16, 16)!.inv).toEqual({})
    expect(stockOf(w, 'wool')).toBe(10)
    expect(res(w, Ui).sel).toEqual({ kind: 'b', key: key(16, 16) })
  })
})

describe('building', () => {
  it('removing returns the coins and keeps the goods; no copy costs more', () => {
    const w = world()
    const c0 = res(w, GameState).coins
    place(w, 'carder', 16, 16, 0)
    const c1 = res(w, GameState).coins
    place(w, 'carder', 16, 18, 0)
    expect(c0 - c1).toBe(c1 - res(w, GameState).coins)
    const m = get(w, 16, 16)!
    m.inv.wool = 3
    remove(w, 16, 16)
    remove(w, 16, 18)
    expect(res(w, GameState).coins).toBe(c0)
    expect(stockOf(w, 'wool')).toBe(3)
  })
  it('a moved machine keeps what it holds and costs nothing; a move called off puts it back', () => {
    const w = world()
    place(w, 'carder', 16, 16, 0)
    const m = get(w, 16, 16)!
    m.inv.wool = 3
    const c0 = res(w, GameState).coins
    expect(liftUp(w, m)).toBe(true)
    expect(putDown(w, 16, 40, 0)).toBe(false)
    expect(putDown(w, 16, 18, 1)).toBe(true)
    expect(get(w, 17, 19)).toBe(m)
    expect(m.inv.wool).toBe(3)
    expect(res(w, GameState).coins).toBe(c0)
    liftUp(w, m)
    putBack(w)
    expect(get(w, 16, 18)).toBe(m)
    const dock = [...res(w, Plant).b.values()].find((q) => q.type === 'dock')!
    expect(liftUp(w, dock)).toBe(false)
  })
  it('a mower stands anywhere, a berry picker only by bushes', () => {
    const w = world()
    expect(whyNot(w, 'mower', 15, 18, 0)).toBe('')
    expect(whyNot(w, 'berry', 15, 18, 0)).toBe('needBush')
  })
  it('a producer lies along its output and turns about its top-left cell', () => {
    const w = world()
    expect(place(w, 'mower', 16, 17, 0)).toBe(true)
    const m = get(w, 16, 17)!
    expect(get(w, 17, 17)).toBe(m)
    expect(outCells(m).map((c) => [c.x, c.y])).toEqual([[18, 17]])
    expect(rotate(w, m)).toBe(true)
    expect(get(w, 16, 18)).toBe(m)
    expect(outCells(m).map((c) => [c.x, c.y])).toEqual([[16, 19]])
  })
  it('ways in and out: a merger takes from three sides, a splitter gives to three; producers only give', () => {
    const w = world()
    const one = (t: BuildingId) => blankBuilding(t, 16, 16, 0)
    expect(inCells(w, one('merger')).map((c) => c.d).sort()).toEqual([0, 1, 3])
    expect(outCells(one('splitter')).map((c) => c.d).sort()).toEqual([0, 1, 3])
    for (const t of ['mower', 'berry'] as const) expect(inCells(w, one(t))).toEqual([])
    for (const t of ['carder', 'spinner', 'felter'] as const) expect(inCells(w, one(t)).length, t).toBe(1)
    for (const t of ['feeder', 'dyer'] as const) expect(inCells(w, one(t)).length, t).toBe(2)
  })
})

describe('the village (GDD 7–8)', () => {
  it('an ask pays its price for each one; when all of a level are done the next opens one thing', () => {
    const w = startWorld({ seed: 1 })
    worlds.push(w)
    res(w, Unlocks).cardQ.length = 0
    const a = openAsks(w)[0]!
    const c0 = res(w, GameState).coins
    res(w, Stock).n.wool = a.total
    expect(loadAsk(w, a, 99)).toBe(a.total)
    expect(res(w, GameState).coins - c0).toBe(a.total * ITEMS.wool.price)
    expect(res(w, GameState).level).toBe(1)
    expect(res(w, Unlocks).unlocked.has(LEVELS[1]!.open[0] as BuildingId)).toBe(true)
  })
  it('a good nobody asks for sells at the market at once, for a quarter', () => {
    const w = startWorld({ seed: 1 })
    worlds.push(w)
    const c0 = res(w, GameState).coins
    dockAccept(w, marketDock(w)!, newItem('felt'))
    expect(res(w, GameState).coins - c0).toBe(sellPrice('felt'))
  })
  it('the whole row beside the road is the market: a line down into any of its cells hands over, the market gives each client what it asks', () => {
    const w = startWorld({ seed: 1 })
    worlds.push(w)
    const gs = res(w, GameState)
    const m = marketDock(w)!
    expect([m.x, m.y, m.w]).toEqual([0, GRID.roadY, res(w, Field).right])
    for (const x of [0, 7, res(w, Field).right - 1]) expect(get(w, x, GRID.roadY)).toBe(m)
    // a belt coming down anywhere along the row hands its wool over; the post's ask counts it, and its bridge carries it
    res(w, Unlocks).unlocked.add('belt')
    res(w, Field).plots.add(key(0, 3))
    const a = openAsks(w)[0]!
    expect(a.kind).toBe('wool')
    place(w, 'belt', 3, 19, 1, true)
    onBelt(w, 3, 19, 'wool')
    const c0 = gs.coins
    stepSimulation(w)
    expect(a.have).toBe(1)
    expect(gs.coins - c0).toBe(ITEMS.wool.price)
    expect(res(w, Fx).q.some((e) => e.kind === 'deliver' && e.x === 3 && e.good === 'wool')).toBe(true)
  })
  it('the market sells for a quarter and buys at twice the price', () => {
    const w = world()
    res(w, Stock).n.yarn = 4
    const c0 = res(w, GameState).coins
    sell(w, 'yarn', 4)
    expect(res(w, GameState).coins - c0).toBe(4 * sellPrice('yarn'))
    buy(w, 'hay', 3)
    expect(res(w, GameState).coins - c0).toBe(4 * sellPrice('yarn') - 3 * buyPrice('hay'))
    expect(stockOf(w, 'hay')).toBe(3)
  })
  it('the island grows at its levels: east twice, the market row with it, then the far row', () => {
    const w = startWorld({ seed: 1 })
    worlds.push(w)
    const gs = res(w, GameState),
      f = res(w, Field)
    for (const g of ISLAND_GROW) {
      // finish levels until the one where the island grows
      while (gs.level + 1 < g.level) {
        for (const a of openAsks(w)) {
          res(w, Stock).n[a.kind] = a.total
          loadAsk(w, a, a.total)
        }
      }
      expect(f.top).toBe(g.top ?? f.top)
      expect(f.right).toBe(g.right ?? f.right)
      expect(marketDock(w)!.w).toBe(f.right)
      expect(res(w, Unlocks).cardQ).toContain('island')
      res(w, Unlocks).cardQ.length = 0
    }
    expect(f.top).toBe(0)
    expect(f.right).toBe(GRID.cols)
    expect(res(w, Market).asks.length).toBeGreaterThan(0)
    void GRID
  })
})

describe('systems (TDD 3)', () => {
  it('each system switches off by its name; the menu’s farm works but counts nothing, shows no numbers, plays no sound', () => {
    expect(PLAY).toEqual(SYSTEMS.filter((s) => s !== 'orbit'))
    const w = startWorld({ seed: 1, systems: DEMO })
    worlds.push(w)
    const gs = res(w, GameState)
    const ask = openAsks(w)[0]!
    const d = marketDock(w)!
    const coins = gs.coins
    // a dock takes what comes, and nothing is counted: no coins, no level, no card
    for (let i = 0; i < ask.total; i++) expect(dockAccept(w, d, newItem(ask.kind))).toBe(true)
    expect(ask.have).toBe(0)
    expect(gs.coins).toBe(coins)
    expect(gs.level).toBe(0)
    // the goods still ride their bridges into the market, for the eye
    expect(res(w, Fx).q.filter((e) => e.kind === 'deliver').length).toBe(ask.total)
    res(w, Fx).q.length = 0
    // no numbers float up and no sound plays; a wool puff still does
    float(w, 1, 1, '+3')
    sound(w, 'place')
    puff(w, 1, 1, '#fff')
    expect(res(w, Fx).q.map((e) => e.kind)).toEqual(['puff'])
    // the farm still works: a good rides its belt; with the belts off it stands
    res(w, Unlocks).unlocked.add('belt')
    place(w, 'belt', 12, 15, 0, true)
    place(w, 'belt', 13, 15, 0, true)
    const b = get(w, 12, 15)!
    b.item = newItem('wool')
    for (let i = 0; i < 60; i++) stepSimulation(w)
    expect(get(w, 13, 15)!.item?.kind).toBe('wool')
    res(w, Systems).on.delete('belts')
    const it = get(w, 13, 15)!.item!
    const p = it.p
    for (let i = 0; i < 60; i++) stepSimulation(w)
    expect(get(w, 13, 15)!.item).toBe(it)
    expect(it.p).toBe(p)
  })
})

describe('what each way in and out shows (GDD 4.1)', () => {
  it('a station takes its sheep from behind and its good from the side; a shearer gives the sheep on and the wool aside', () => {
    const w = world()
    const ins = (b: ReturnType<typeof blankBuilding>) => inCells(w, b).map((c) => inGood(b, c))
    const outs = (b: ReturnType<typeof blankBuilding>) => outCells(b).map((c) => outGood(b, c))
    const feeder = blankBuilding('feeder', 12, 15, 0)
    expect(ins(feeder)).toEqual(['sheep', 'hay'])
    expect(outs(feeder)).toEqual(['sheep'])
    expect(ins(blankBuilding('dyer', 12, 15, 1))).toEqual(['sheep', 'dye'])
    expect(outs(blankBuilding('shearer', 12, 15, 2)).sort()).toEqual(['sheep', 'wool'])
    const ws = blankBuilding('workshop', 12, 15, 1)
    ws.recipe = 'valenki'
    expect(ins(ws)).toEqual(['felt', 'pyarn'])
    expect(outs(ws)).toEqual(['valenki'])
    expect(ins(blankBuilding('carder', 12, 15, 0))).toEqual(['wool'])
    expect(outs(blankBuilding('mower', 12, 15, 0))).toEqual(['hay'])
    // a splitter or a belt takes anything: no icon
    expect(ins(blankBuilding('splitter', 12, 15, 0))).toEqual([null])
  })
})
