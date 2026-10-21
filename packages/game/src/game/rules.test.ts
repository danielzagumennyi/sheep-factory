import { afterEach, describe, expect, it } from 'vitest'
import { BELT, BUILDINGS, CLIENT, DROP, GRID, ISLAND_GROW, ISLAND_START, ITEMS, LEVELS, MARKET, PEN, PILE, SHEEP, SOW, START, TOOL_ORDER, type BuildingId, type Dir, type ItemId } from './balance'
import { anchorForInput, freeCell, get, inCells, inGood, outCells, outGood, owned, pastureAt, pileAt, pilesBy, plotPrice, reachOf, terr, whyNot } from './grid'
import { buyPlot, buySheep, liftUp, place, putBack, putDown, remove, rotate, setSeed } from './actions/build'
import { clickBuilding, dropCarry, dropSheep, gather, handClick, pickSheep, pickUp, putDownCarry, sheepAt, shearClick } from './actions/hand'
import { stepSimulation } from './systems'
import { shearYield } from './systems/machines'
import { penIn, toRoam } from './systems/sheep'
import { dockAccept, openLevel, sell, sellPrice, buy, buyPrice } from './systems/village'
import { unlock } from './systems/unlocks'
import { startWorld } from './start'
import { openField, putTerrain, TEST_PEN } from './testing'
import { blankBuilding, createGameWorld, DEMO, makePen, pastureSpot, Field, Flock, float, Fx, GameState, Market, noMarks, PLAY, puff, sound, Stock, SYSTEMS, Systems, Ui, Unlocks, key, newItem, res, stockOf, unkey, type SheepT, type World } from './world'

let worlds: World[] = []
afterEach(() => {
  for (const w of worlds) w.destroy()
  worlds = []
})
/** A fresh long game with everything open, plenty of coins and the start's 3×3 plots bought. */
/** The first pen, where the sheep roam at the start, with all of them in it (as the game began before they roamed). */
function penned(w: World) {
  const p = makePen(openField(w), TEST_PEN.x, TEST_PEN.y, TEST_PEN.dir)
  res(w, Flock).pastures.push(p)
  for (const s of res(w, Flock).sheep) penIn(w, s, p)
  return w
}
function world(opts: { all?: boolean } = { all: true }) {
  const w = penned(createGameWorld({ seed: 3 }))
  if (opts.all) {
    for (const b of TOOL_ORDER) res(w, Unlocks).unlocked.add(b)
    // everything open: sheep eat, the market trades
    res(w, GameState).food = true
    for (const s of res(w, Flock).sheep) s.fed = false
    res(w, GameState).trade = true
    for (let py = 1; py < 4; py++) for (let px = 1; px < 4; px++) res(w, Field).plots.add(key(px, py))
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
/** The market, in the middle of the start. */
const market = (w: World) => get(w, MARKET.x, MARKET.y)!
/** Every client fed all it takes until the next level opens: the stock kept full of what they take. */
function nextLevel(w: World) {
  const gs = res(w, GameState),
    level = gs.level
  for (let i = 0; i < 10 * 60 * 60 && gs.level === level; i++) {
    for (const n of res(w, Market).needs) res(w, Stock).n[n.kind] = 99
    stepSimulation(w)
    res(w, Unlocks).cardQ.length = 0
  }
}
const sheepOf = (w: World) => res(w, Flock).sheep
/** Every good lying on the ground, by kind, sorted. */
const lying = (w: World) => [...res(w, Field).piles.values()].flat().map((q) => q.kind).sort()
/** Goods put in the hand, as if picked up. */
const inHand = (w: World, ...kinds: ItemId[]) => {
  res(w, Ui).carry = kinds.map((k) => newItem(k))
  res(w, Ui).carryFrom = { x: 0, y: 0 }
}
/** Every pile on the ground carried into the market by hand. */
function carryToMarket(w: World) {
  for (const k of [...res(w, Field).piles.keys()]) {
    const [x, y] = unkey(k)
    while (pickUp(w, x, y)) dropCarry(w, MARKET.x + 0.5, MARKET.y + 0.5)
  }
}

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
  it('nothing stands on a hill: no building, belt, pen or sheep put down; a roaming sheep never walks up one', () => {
    const w = world()
    // a hill of the second level with a third on top, east of the pen
    for (let y = 14; y <= 17; y++) for (let x = 18; x <= 21; x++) res(w, Field).hills.set(key(x, y), x >= 19 && x <= 20 && y >= 15 && y <= 16 ? 3 : 2)
    expect(whyNot(w, 'belt', 18, 14, 0)).toBe('hill')
    expect(whyNot(w, 'shearer', 17, 14, 0)).toBe('hill')
    expect(whyNot(w, 'pen', 20, 15, 0)).toBe('hill')
    expect(whyNot(w, 'sheep', 19, 15)).toBe('hill')
    expect(whyNot(w, 'belt', 22, 14, 0)).toBe('')
    // nor is it free ground for a belt's route, a seeder's sowing or a machine's pile
    expect(freeCell(w, 18, 14)).toBe(false)
    expect(freeCell(w, 22, 14)).toBe(true)
    // a sheep put down beside it roams for a minute and never sets foot on it
    const s = sheepOf(w)[0]!
    pickSheep(w, s)
    dropSheep(w, s, 17.5, 18.5)
    for (let t = 0; t < 60; t += 1 / 60) {
      stepSimulation(w)
      expect(res(w, Field).hills.has(key(Math.floor(s.px), Math.floor(s.py))), `${s.px.toFixed(2)},${s.py.toFixed(2)}`).toBe(false)
    }
    // dropped onto it, it comes down beside it
    pickSheep(w, s)
    dropSheep(w, s, 19.5, 15.5)
    expect(res(w, Field).hills.has(key(Math.floor(s.px), Math.floor(s.py)))).toBe(false)
  })
  it('a producer takes from the nearest owned cell and the empty cell disappears', () => {
    const w = world()
    putTerrain(w, 'meadow', [19, 11, 19, 14], [17, 14, 18, 14])
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
    putTerrain(w, 'meadow', [10, 18, 10, 18], [19, 10, 19, 10])
    // the hand picks the hay, nothing goes to the stock by itself; clicks on the same meadow gather on while it has room
    expect(gather(w, 10, 18)).toBe(true)
    expect(res(w, Ui).carry.map((q) => q.kind)).toEqual(['hay'])
    expect(stockOf(w, 'hay')).toBe(0)
    for (let i = 1; i < PILE.max; i++) handClick(w, 10.5, 18.5)
    expect(res(w, Ui).carry.length).toBe(PILE.max)
    // with the hand full, a gathered one falls beside it
    expect(gather(w, 10, 18)).toBe(true)
    expect(lying(w)).toEqual(['hay'])
    // the plot north of the market isn't bought yet
    expect(gather(w, 19, 10)).toBe(false)
  })
  it('a plot with nothing on it is not for sale; a richer one costs more and each purchase raises prices', () => {
    const w = world({ all: false })
    const p11 = plotPrice(w, 1, 1)
    expect(p11).toBeGreaterThan(0)
    expect(buyPlot(w, 1, 1)).toBe(true)
    expect(plotPrice(w, 2, 1)).toBeGreaterThan(0)
    // the ring round the start is under the sky until the island grows
    expect(plotPrice(w, 1, 0)).toBe(0)
    expect(plotPrice(w, 4, 2)).toBe(0)
    Object.assign(res(w, Field), { left: 0, top: 0, right: GRID.cols, bottom: GRID.rows })
    expect(plotPrice(w, 1, 0)).toBeGreaterThan(0)
    expect(plotPrice(w, 4, 2)).toBeGreaterThan(0)
  })
})

describe('sowing (GDD 6.1)', () => {
  it('a seed from the hand sprouts and grows into a small meadow; a seeder sows from what its belt brings', () => {
    const w = world()
    inHand(w, 'hay')
    res(w, Ui).seed = 'meadow'
    expect(place(w, 'sow', 17, 17, 0)).toBe(true)
    expect(res(w, Ui).carry).toEqual([])
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
  it('sheep in a pen stand apart, not inside one another', () => {
    const w = world()
    const p = pen0(w)
    const flock = sheepOf(w).filter((s) => s.home === p.id)
    expect(flock.length).toBe(4)
    // round after round each sheep picks a new spot and walks there, as they do grazing
    for (let round = 0; round < 20; round++) {
      for (const s of flock) {
        const t = pastureSpot(w, p, s)
        s.px = s.tx = t.x
        s.py = s.ty = t.y
      }
      for (const a of flock) for (const b of flock) if (a !== b) expect(Math.hypot(a.px - b.px, a.py - b.py)).toBeGreaterThan(SHEEP.apart * 0.75)
    }
  })
  it('a pen is a building for four sheep: placed for coins, removed only when empty; sheep are bought apart, into the pen clicked', () => {
    const w = world()
    expect(PEN.cap).toBe(4)
    const c0 = res(w, GameState).coins
    expect(place(w, 'pen', 15, 15, 0)).toBe(true)
    expect(res(w, GameState).coins).toBe(c0 - PEN.cost)
    const p = res(w, Flock).pastures.at(-1)!
    expect(sheepOf(w).some((s) => s.home === p.id)).toBe(false)
    // the sheep tool on a pen: into it while it has room; it stays in hand for the next one
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
  it('a bought sheep parachutes down where it is put, onto free own grass or into a pen; till it lands it neither walks nor can be picked up', () => {
    const w = world()
    // free own grass, roaming; not off the island, not on a building
    expect(whyNot(w, 'sheep', 18, 14)).toBe('')
    expect(whyNot(w, 'sheep', 18, 2)).toBe('edge')
    expect(place(w, 'belt', 16, 16, 0)).toBe(true)
    expect(whyNot(w, 'sheep', 16, 16)).toBe('taken')
    const c0 = res(w, GameState).coins
    expect(place(w, 'sheep', 18, 14, 0)).toBe(true)
    expect(res(w, GameState).coins).toBe(c0 - SHEEP.price)
    const s = sheepOf(w).at(-1)!
    expect([s.state, s.home, s.px, s.py, s.wool]).toEqual(['roam', 0, 18.5, 14.5, 1])
    expect(s.drop).toBe(DROP.fall + DROP.land)
    // up in the air: out of reach, and it stays over the spot it lands on; no second one comes down on that cell meanwhile
    run(w, DROP.fall / 2)
    expect(sheepAt(w, 18.5, 14.5)).toBe(null)
    expect(whyNot(w, 'sheep', 18, 14)).toBe('taken')
    expect([s.px, s.py]).toEqual([18.5, 14.5])
    // touching down: a puff of wool and a heart; then it is a sheep like any other
    run(w, DROP.fall / 2 + DROP.land + 0.1)
    expect(s.drop).toBeUndefined()
    expect(res(w, Fx).q).toContainEqual({ kind: 'float', x: 18.5, y: 14.5, text: '♥', tone: 'accent' })
    expect(sheepAt(w, s.px, s.py)).toBe(s)
    // into a pen with room it comes down inside it, and does not walk out before it has landed
    const p = pen0(w)
    res(w, Flock).sheep = sheepOf(w).filter((q) => q.home !== p.id)
    expect(place(w, 'sheep', p.x + 1, p.y + 1, 0)).toBe(true)
    const q = sheepOf(w).at(-1)!
    expect([q.state, q.home]).toEqual(['pasture', p.id])
    run(w, DROP.fall)
    expect(q.state).toBe('pasture')
  })
  it('a pen takes no fifth sheep from the hand; a belt never moves a sheep into another pen: it crosses it or waits', () => {
    const w = world()
    place(w, 'pen', 15, 15, 0)
    const p = res(w, Flock).pastures.at(-1)!
    for (let i = 0; i < PEN.cap; i++) buySheep(w, p)
    // a sheep of the first pen dropped on the full one stays by its fence and roams: no jump home
    const first = res(w, Flock).pastures[0]!.id
    const s = sheepOf(w).find((q) => q.home === first)!
    dropSheep(w, s, 16.5, 16.5)
    expect(s.state).toBe('roam')
    expect(pastureAt(w, Math.floor(s.px), Math.floor(s.py))).toBeNull()
    expect(Math.hypot(s.px - 16.5, s.py - 16.5)).toBeLessThan(3)
    // carried home by hand; then a belt into another pen's way in: with nothing at that pen's way out to ride on, the
    // sheep waits on the belt
    penIn(w, s, res(w, Flock).pastures[0]!)
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
    const w = penned(startWorld({ seed: 1 }))
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
  it('the first level: the sheep roam and are shorn by hand; then the pen, then the shearer and the belt once it stands; trade at its own level', () => {
    const w = startWorld({ seed: 1 })
    worlds.push(w)
    const un = res(w, Unlocks),
      gs = res(w, GameState)
    expect(un.cardQ).toEqual(['shear'])
    expect(un.unlocked.size).toBe(0)
    expect(res(w, Flock).pastures).toEqual([])
    expect(sheepOf(w).every((s) => s.state === 'roam' && s.wool === 1)).toBe(true)
    // the market takes goods from the start; trade comes only at its level
    expect(market(w).type).toBe('dock')
    expect(gs.trade).toBe(false)
    // shorn by hand, the wool falls beside the sheep; carried by hand into the market, the post takes it: the pen's
    // level opens. Left lying, it never reaches the stock
    for (const s of sheepOf(w)) for (let i = 0; i < 3; i++) shearClick(w, s)
    run(w, 2)
    expect(lying(w).length).toBe(2 * sheepOf(w).length)
    expect(stockOf(w, 'wool')).toBe(0)
    for (let n = 0; n < 300 && gs.level === 0; n++) {
      for (const s of sheepOf(w)) if (s.wool >= 1) for (let i = 0; i < 3; i++) shearClick(w, s)
      carryToMarket(w)
      run(w, 1)
    }
    expect(gs.level).toBe(1)
    expect(un.unlocked.has('pen')).toBe(true)
    expect(un.unlocked.has('shearer')).toBe(false)
    // the shearer's level: once it stands on a pen's way out, the belt
    openLevel(w, LEVELS.findIndex((L) => L.open.includes('shearer')))
    un.cardQ.length = 0
    expect(un.unlocked.has('belt')).toBe(false)
    expect(place(w, 'pen', START.pen.x, START.pen.y, START.pen.dir)).toBe(true)
    const p = pen0(w)
    const [ax, ay] = anchorForInput('shearer', p.dir, p.exit.x, p.exit.y)
    expect(place(w, 'shearer', ax, ay, p.dir)).toBe(true)
    expect(un.unlocked.has('belt')).toBe(true)
    expect(un.cardQ).toEqual(['belt'])
    // no trade yet
    res(w, Stock).n.wool = 5
    expect(sell(w, 'wool', 5)).toBe(0)
    openLevel(w, LEVELS.findIndex((L) => L.open.includes('market')))
    expect(gs.trade).toBe(true)
    expect(sell(w, 'wool', 5)).toBe(5)
  })
  it('a sheep with no pen roams the own land: round buildings and pens, over belts, never off its land; built over, it runs off', () => {
    const w = world()
    const s = sheepOf(w)[0]!
    // put down on the grass of own land it roams from there, in no pen
    const free = (x: number, y: number) => owned(w, x, y) && !get(w, x, y) && !pastureAt(w, x, y) && !['rock', 'tree', 'water', 'bush'].includes(terr(w, x, y))
    let at: [number, number] = [0, 0]
    for (let y = 18; y >= 6 && !at[0]; y--) for (let x = 20; x < 30; x++) if (free(x, y) && free(x + 1, y) && free(x, y - 1)) at = [x, y]
    pickSheep(w, s)
    dropSheep(w, s, at[0] + 0.5, at[1] + 0.5)
    expect(s.state).toBe('roam')
    expect(s.home).toBe(0)
    // belts and a machine about: for a minute it never stands on the machine, a pen or land not its own
    place(w, 'belt', at[0] + 1, at[1], 0)
    expect(place(w, 'comb', at[0] - 2, at[1] - 2, 0)).toBe(true)
    const comb = get(w, at[0] - 2, at[1] - 2)!
    for (let t = 0; t < 60; t += 1 / 60) {
      stepSimulation(w)
      const x = Math.floor(s.px),
        y = Math.floor(s.py)
      expect(owned(w, x, y) && !pastureAt(w, x, y) && get(w, x, y) !== comb, `${x},${y}`).toBe(true)
    }
    // built over, it runs to the nearest free ground at once
    const [x, y] = [Math.floor(s.px), Math.floor(s.py)]
    // (it may graze on a meadow: the mower stands on bare grass)
    for (const k of [key(x, y), key(x + 1, y), key(x, y + 1), key(x + 1, y + 1)]) res(w, Field).terrain.delete(k)
    if (!get(w, x, y)) expect(place(w, 'mower', x, y, 0)).toBe(true)
    stepSimulation(w)
    expect(get(w, Math.floor(s.px), Math.floor(s.py))).toBeFalsy()
    // grazing, its fleece grows by itself, food or not
    res(w, GameState).food = true
    for (let i = 0; i < 3; i++) shearClick(w, s)
    expect(s.wool).toBe(0)
    run(w, SHEEP.grow + 1)
    expect(s.wool).toBe(1)
  })
  it('a sheep half shorn by hand is carried with its clicks kept; a shearer shears it whole and its clicks go', () => {
    const w = world()
    const s = sheepOf(w)[0]!
    s.wool = 1
    shearClick(w, s)
    shearClick(w, s)
    pickSheep(w, s)
    expect(s.state).toBe('held')
    const p = pen0(w)
    dropSheep(w, s, p.x + 1.5, p.y + 1.5)
    expect([s.state, s.clicks]).toEqual(['pasture', 2])
    shearClick(w, s)
    expect([s.wool, s.clicks]).toEqual([0, 0])
    // half shorn, it rides a belt into a shearer: shorn whole, it is free to walk out of its pen again
    s.wool = 1
    shearClick(w, s)
    const [ax, ay] = anchorForInput('shearer', p.dir, p.exit.x, p.exit.y)
    expect(place(w, 'shearer', ax, ay, p.dir)).toBe(true)
    pickSheep(w, s)
    dropSheep(w, s, ax + 0.5, ay + 0.5)
    run(w, 5)
    expect([s.wool < 1, s.clicks]).toEqual([true, 0])
  })
  it('the sheep under the hand stands still: roaming, or in its pen, where it does not go out', () => {
    const w = world()
    const [a, b] = sheepOf(w) as [SheepT, SheepT]
    toRoam(w, a, 20.5, 17.5)
    const ui = res(w, Ui)
    const over = (s: SheepT) => (ui.hover = { x: Math.floor(s.px), y: Math.floor(s.py), wx: s.px, wy: s.py, sheep: s.id, b: null })
    over(a)
    const at = [a.px, a.py]
    run(w, 20)
    expect([a.px, a.py]).toEqual(at)
    // let go, it grazes on and walks again
    ui.hover = null
    run(w, 20)
    expect([a.px, a.py]).not.toEqual(at)
    // fluffy in a pen with a belt on its way out, under the hand it stays in
    const p = pen0(w)
    place(w, 'belt', p.exit.x, p.exit.y, p.dir)
    for (const s of sheepOf(w)) if (s !== b && s.state === 'pasture') s.wool = 0
    b.wool = 1
    over(b)
    run(w, 5)
    expect(b.state).toBe('pasture')
    ui.hover = null
    run(w, 5)
    expect(b.state).not.toBe('pasture')
  })
  it('a sheep a station lets out with nothing on its way out roams off, and the station is free', () => {
    const w = world()
    res(w, Unlocks).cardQ.length = 0
    const p = pen0(w)
    const [ax, ay] = anchorForInput('shearer', p.dir, p.exit.x, p.exit.y)
    expect(place(w, 'shearer', ax, ay, p.dir)).toBe(true)
    run(w, 12)
    const shearer = get(w, ax, ay)!
    const out = sheepOf(w).filter((s) => s.state === 'roam')
    expect(out.length).toBeGreaterThan(0)
    for (const s of out) {
      expect(s.home).toBe(0)
      expect(s.wool).toBeLessThan(1)
    }
    expect(shearer.status).not.toBe('wait')
    // carried back, it lives in the pen again
    const s = out[0]!
    pickSheep(w, s)
    dropSheep(w, s, p.x + 1.5, p.y + 1.5)
    expect([s.state, s.home]).toEqual(['pasture', p.id])
  })
  it('a shorn sheep grows its next fleece only once fed; the hand feeds it one hay it carries', () => {
    const w = world()
    const s = sheepOf(w)[0]!
    for (let i = 0; i < 3; i++) shearClick(w, s)
    expect(lying(w)).toEqual(['wool', 'wool'])
    res(w, Field).piles.clear()
    run(w, SHEEP.grow + 1)
    expect(s.wool).toBe(0)
    // a click with no hay in the hand does nothing to it; with hay, it feeds it one
    handClick(w, s.px, s.py)
    expect(s.fed).toBe(false)
    inHand(w, 'hay', 'hay')
    handClick(w, s.px, s.py)
    expect(s.fed).toBe(true)
    expect(res(w, Ui).carry.map((q) => q.kind)).toEqual(['hay'])
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
  it('the dye station colours a fluffy sheep, which shears coloured; with no dye it lets the sheep pass white', () => {
    const w = world()
    loopA(w, true)
    const dy = get(w, 14, 11)!,
      sh = get(w, 16, 11)!
    dy.inv.dye = 1
    run(w, 12)
    expect(pilesBy(w, sh).map((q) => q.kind)).toContain('cwool')
    expect(dy.count).toBe(1)
    run(w, 10)
    expect(sh.count).toBeGreaterThan(1)
  })
})

/** The first pen's loop through the salon: its stations from the pen's way out in the order given, the shearer, and back round. */
function salon(w: World, stations: readonly BuildingId[]) {
  // the pen (11..13 × 11..13) gives out at (14,12) and takes in at (12,10)
  const x0 = 14
  stations.forEach((t, i) => expect(place(w, t, x0 + i * 2, 11, 0), t).toBe(true))
  const sx = x0 + stations.length * 2
  place(w, 'shearer', sx, 11, 0)
  const end = sx + 2
  place(w, 'belt', end, 12, 3)
  place(w, 'belt', end, 11, 3)
  for (let x = end; x > 12; x--) place(w, 'belt', x, 10, 2)
  place(w, 'belt', 12, 10, 1)
  return get(w, sx, 11)!
}

describe('the salon (GDD 5)', () => {
  it('shearing gives by how many of the three steps a sheep went through; the bath gives felt whatever else; the dye colours', () => {
    const s = { marks: noMarks() } as SheepT
    const of = (m: Partial<SheepT['marks']>) => shearYield({ ...s, marks: { ...noMarks(), ...m } })
    expect(of({})).toEqual(['wool', 2])
    expect(of({ curl: true })).toEqual(['thread', 2])
    expect(of({ knit: true, comb: true })).toEqual(['yarn', 2])
    expect(of({ comb: true, curl: true, knit: true })).toEqual(['sweater', 1])
    expect(of({ bath: true, comb: true, curl: true })).toEqual(['felt', 2])
    expect(of({ dye: true })).toEqual(['cwool', 2])
    expect(of({ dye: true, comb: true, curl: true, knit: true })).toEqual(['csweater', 1])
  })
  it('the stations work in any order: curl before comb shears yarn, and the sheep comes out plain again', () => {
    const w = world()
    const sh = salon(w, ['curl', 'comb'])
    for (const s of sheepOf(w)) s.fed = true
    res(w, GameState).food = false
    run(w, 14)
    expect(sh.count).toBeGreaterThan(0)
    expect(pilesBy(w, sh).length).toBeGreaterThan(0)
    expect(new Set(pilesBy(w, sh).map((q) => q.kind))).toEqual(new Set(['yarn']))
    expect(get(w, 14, 11)!.count).toBeGreaterThan(0)
    // shorn, a sheep's marks are gone
    const shorn = sheepOf(w).filter((q) => q.wool < 1 && q.state !== 'machine')
    expect(shorn.length).toBeGreaterThan(0)
    for (const q of shorn) expect(q.marks).toEqual(noMarks())
  })
  it('a station passes a sheep it has marked already, and a shorn one', () => {
    const w = world()
    const sh = salon(w, ['comb', 'comb'])
    res(w, GameState).food = false
    run(w, 14)
    expect(get(w, 14, 11)!.count).toBeGreaterThan(0)
    expect(get(w, 16, 11)!.count).toBe(0)
    expect(new Set(pilesBy(w, sh).map((q) => q.kind))).toEqual(new Set(['thread']))
  })
  it('the bath stands only by water', () => {
    const w = world()
    putTerrain(w, 'water', [22, 16, 23, 17])
    expect(whyNot(w, 'bath', 28, 10, 0)).toBe('needWater')
    expect(whyNot(w, 'bath', 19, 16, 0)).toBe('')
  })
  it('shearing by hand gives what the shearer would', () => {
    const w = world()
    const s = sheepOf(w)[0]!
    s.marks = { ...noMarks(), comb: true, dye: true }
    for (let i = 0; i < 3; i++) shearClick(w, s)
    expect(lying(w)).toEqual(['cthread', 'cthread'])
    expect(s.marks).toEqual(noMarks())
  })
  it('an empty hand selects a machine; with the good it takes in the hand, a click loads it as far as it holds', () => {
    const w = world()
    place(w, 'feeder', 16, 16, 0)
    handClick(w, 16.5, 16.5)
    expect(get(w, 16, 16)!.inv).toEqual({})
    expect(res(w, Ui).sel).toEqual({ kind: 'b', key: key(16, 16) })
    res(w, Ui).sel = null
    inHand(w, 'hay', 'hay', 'hay', 'hay', 'hay', 'wool')
    clickBuilding(w, get(w, 16, 16)!)
    expect(get(w, 16, 16)!.inv.hay).toBe(BELT.bufMax)
    expect(res(w, Ui).carry.map((q) => q.kind).sort()).toEqual(['hay', 'wool'])
  })
  it('goods in the hand go where they are put down: into the market, onto an empty belt, on the ground; left in the hand what goes nowhere', () => {
    const w = startWorld({ seed: 1 })
    worlds.push(w)
    res(w, Unlocks).cardQ.length = 0
    // into the market, all of them, to its stock
    inHand(w, 'wool', 'wool', 'wool')
    expect(dropCarry(w, MARKET.x + 3.5, MARKET.y + 3.5)).toBe(3)
    expect(stockOf(w, 'wool')).toBe(3)
    // onto the ground: a pile of up to PILE.max; then picked up again, the whole of it
    inHand(w, ...Array.from({ length: PILE.max }, () => 'hay' as const))
    expect(dropCarry(w, 10.5, 18.5)).toBe(PILE.max)
    expect(pileAt(w, 10, 18)!.length).toBe(PILE.max)
    inHand(w, 'hay')
    expect(dropCarry(w, 10.5, 18.5)).toBe(0)
    expect(res(w, Ui).carry.length).toBe(1)
    res(w, Ui).carry = []
    expect(pickUp(w, 10, 18)).toBe(true)
    expect(res(w, Ui).carry.length).toBe(PILE.max)
    expect(pileAt(w, 10, 18)).toBeUndefined()
    // one onto an empty belt, the rest stays in the hand
    res(w, Unlocks).unlocked.add('belt')
    place(w, 'belt', 10, 20, 0, true)
    expect(dropCarry(w, 10.5, 20.5)).toBe(1)
    expect(get(w, 10, 20)!.item?.kind).toBe('hay')
    expect(res(w, Ui).carry.length).toBe(PILE.max - 1)
    // put down when cancelled: on the ground, as near as there is room; never lost — far over the sky, on the nearest
    // own land; never on land for sale
    putDownCarry(w, 11.5, 18.5)
    expect(res(w, Ui).carry).toEqual([])
    expect(lying(w).length).toBe(PILE.max - 1)
    inHand(w, 'wool', 'wool')
    putDownCarry(w, -30, -30)
    expect(res(w, Ui).carry).toEqual([])
    expect(lying(w).length).toBe(PILE.max + 1)
    for (const k of res(w, Field).piles.keys()) expect(owned(w, ...unkey(k)), k).toBe(true)
    // a pen put down on goods moves them aside
    res(w, Unlocks).unlocked.add('pen')
    const [px, py] = unkey([...res(w, Field).piles.keys()][0]!)
    expect(place(w, 'pen', px - 1, py - 1, 0, true)).toBe(true)
    for (const k of res(w, Field).piles.keys()) expect(pastureAt(w, ...unkey(k)), k).toBeNull()
    expect(lying(w).length).toBe(PILE.max + 1)
  })
})

describe('building', () => {
  it('removing returns the coins and keeps the goods; no copy costs more', () => {
    const w = world()
    const c0 = res(w, GameState).coins
    place(w, 'feeder', 16, 16, 0)
    const c1 = res(w, GameState).coins
    place(w, 'feeder', 16, 13, 0)
    expect(c0 - c1).toBe(c1 - res(w, GameState).coins)
    const m = get(w, 16, 16)!
    m.inv.hay = 3
    remove(w, 16, 16)
    remove(w, 16, 13)
    expect(res(w, GameState).coins).toBe(c0)
    // what it held falls in a pile where it stood
    expect(pileAt(w, 16, 16)?.map((q) => q.kind)).toEqual(['hay', 'hay', 'hay'])
    expect(stockOf(w, 'hay')).toBe(0)
  })
  it('a moved machine keeps what it holds and costs nothing; a move called off puts it back', () => {
    const w = world()
    place(w, 'feeder', 16, 16, 0)
    const m = get(w, 16, 16)!
    m.inv.hay = 3
    const c0 = res(w, GameState).coins
    expect(liftUp(w, m)).toBe(true)
    expect(putDown(w, 16, 40, 0)).toBe(false)
    expect(putDown(w, 16, 13, 1)).toBe(true)
    expect(get(w, 17, 14)).toBe(m)
    expect(m.inv.hay).toBe(3)
    expect(res(w, GameState).coins).toBe(c0)
    liftUp(w, m)
    putBack(w)
    expect(get(w, 16, 13)).toBe(m)
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
    for (const t of ['comb', 'curl', 'knit', 'bath'] as const) expect(inCells(w, one(t)).length, t).toBe(1)
    for (const t of ['feeder', 'dyer'] as const) expect(inCells(w, one(t)).length, t).toBe(2)
  })
})

describe('the market and its clients (GDD 7–8)', () => {
  it('the market stands fixed in the middle of the start; it takes a good only at its ways in, two on each side, and no sheep', () => {
    const w = startWorld({ seed: 1 })
    worlds.push(w)
    const m = market(w)
    expect([m.type, m.x, m.y, m.w, m.h]).toEqual(['dock', MARKET.x, MARKET.y, MARKET.size, MARKET.size])
    expect(get(w, MARKET.x + MARKET.size - 1, MARKET.y + MARKET.size - 1)).toBe(m)
    for (let y = MARKET.y; y < MARKET.y + MARKET.size; y++) for (let x = MARKET.x; x < MARKET.x + MARKET.size; x++) expect(owned(w, x, y), `${x},${y}`).toBe(true)
    expect(remove(w, MARKET.x, MARKET.y)).toBe(false)
    expect(liftUp(w, m)).toBe(false)
    expect(whyNot(w, 'belt', MARKET.x + 2, MARKET.y + 2, 0)).toBe('taken')
    // a belt at each way in hands its goods in (the plots round it bought first); one beside a way in does not
    res(w, Unlocks).unlocked.add('belt')
    res(w, Field).plots.add(key(2, 1)).add(key(3, 2)).add(key(2, 3))
    const [a, b] = MARKET.ports
    const sides: [number, number, Dir][] = [
      [MARKET.x - 1, MARKET.y + a, 0],
      [MARKET.x + MARKET.size, MARKET.y + b, 2],
      [MARKET.x + b, MARKET.y - 1, 1],
      [MARKET.x + a, MARKET.y + MARKET.size, 3],
    ]
    for (const [x, y, d] of sides) {
      expect(place(w, 'belt', x, y, d, true), `${x},${y}`).toBe(true)
      onBelt(w, x, y, 'thread')
    }
    expect(place(w, 'belt', MARKET.x - 1, MARKET.y + a + 1, 0, true)).toBe(true)
    onBelt(w, MARKET.x - 1, MARKET.y + a + 1, 'wool')
    res(w, Fx).q.length = 0
    stepSimulation(w)
    expect(stockOf(w, 'thread')).toBe(4)
    expect(res(w, Fx).q.filter((e) => e.kind === 'deliver').length).toBe(4)
    expect(get(w, MARKET.x - 1, MARKET.y + a + 1)!.item?.kind).toBe('wool')
    expect(inCells(w, m).length).toBe(8)
    // a sheep is not taken: it waits on its belt
    const [x, y] = sides[0]!
    onBelt(w, x, y, 'sheep', sheepOf(w)[0])
    stepSimulation(w)
    expect(get(w, x, y)!.item?.kind).toBe('sheep')
  })
  it('a client takes its good from the stock so many a minute and pays its price; fed less it is never content, fed all it is', () => {
    const w = startWorld({ seed: 1 })
    worlds.push(w)
    res(w, Unlocks).cardQ.length = 0
    const gs = res(w, GameState)
    const n = res(w, Market).needs[0]!
    expect([n.client, n.kind, n.rate]).toEqual([...LEVELS[0]!.needs[0]!])
    // three in the stock: taken one by one at its rate, each paid in full
    res(w, Stock).n.wool = 3
    const c0 = gs.coins
    res(w, Fx).q.length = 0
    run(w, (3 * 60) / n.rate + 0.1)
    expect(stockOf(w, 'wool')).toBe(0)
    expect(gs.coins - c0).toBe(3 * ITEMS.wool.price)
    expect(res(w, Fx).q.filter((e) => e.kind === 'take').length).toBe(3)
    // fed half of what it takes, its bar settles about half way: never content, the level stays
    for (let t = 0; t < 300; t += (2 * 60) / n.rate) {
      res(w, Stock).n.wool = 1
      run(w, (2 * 60) / n.rate)
    }
    expect(n.fill).toBeGreaterThan(0.3)
    expect(n.fill).toBeLessThan(0.7)
    expect(gs.level).toBe(0)
    // fed all it takes it is content within about three times CLIENT.fillSec, and the next level opens one new thing
    const t0 = gs.clock
    nextLevel(w)
    expect(gs.level).toBe(1)
    expect(gs.clock - t0).toBeLessThan(CLIENT.fillSec * 4)
    expect(res(w, Unlocks).unlocked.has(LEVELS[1]!.open[0] as BuildingId)).toBe(true)
  })
  it('a client once come never leaves: each level brings a new one or more for the old, every bar empty again', () => {
    const w = startWorld({ seed: 1 })
    worlds.push(w)
    for (let i = 1; i < LEVELS.length + 2; i++) {
      const before = res(w, Market).needs.map((q) => ({ ...q }))
      for (const q of res(w, Market).needs) q.fill = 1
      openLevel(w, i)
      res(w, Unlocks).cardQ.length = 0
      const after = res(w, Market).needs
      for (const b of before) expect(after.find((q) => q.client === b.client && q.kind === b.kind)!.rate, `level ${i + 1}: ${b.client}`).toBeGreaterThanOrEqual(b.rate)
      // every level asks more than the one before: a new client or more of the old
      expect(after.length + after.reduce((a, q) => a + q.rate, 0), `level ${i + 1}`).toBeGreaterThan(before.length + before.reduce((a, q) => a + q.rate, 0))
      expect(after.every((q) => q.fill === 0)).toBe(true)
    }
  })
  it('a good past what the stock keeps for the clients is sold at once for a quarter', () => {
    const w = startWorld({ seed: 1 })
    worlds.push(w)
    const gs = res(w, GameState),
      m = market(w)
    const c0 = gs.coins
    res(w, Fx).q.length = 0
    const y = MARKET.y + MARKET.ports[0]!
    expect(dockAccept(w, m, newItem('felt'), MARKET.x, y, 0)).toBe(true)
    expect(stockOf(w, 'felt')).toBe(1)
    expect(gs.coins).toBe(c0)
    expect(res(w, Fx).q).toContainEqual({ kind: 'deliver', x: MARKET.x, y, fx: MARKET.x - 1, fy: y, good: 'felt' })
    res(w, Stock).n.felt = MARKET.keep
    dockAccept(w, m, newItem('felt'), MARKET.x, y, 0)
    expect(stockOf(w, 'felt')).toBe(MARKET.keep)
    expect(gs.coins - c0).toBe(sellPrice('felt'))
  })
  it('the endless mode: everything open from the start, the island whole, no card; coins and clients as in the long game, without end', () => {
    const w = startWorld({ seed: 1, endless: true })
    worlds.push(w)
    const un = res(w, Unlocks),
      gs = res(w, GameState),
      f = res(w, Field)
    expect(gs.endless).toBe(true)
    for (const t of TOOL_ORDER) expect(un.unlocked.has(t), t).toBe(true)
    expect(gs.trade && gs.food).toBe(true)
    expect([f.top, f.right]).toEqual([0, GRID.cols])
    expect(un.cardQ).toEqual([])
    expect(gs.coins).toBe(START.coins)
    expect(gs.level).toBe(0)
    // the levels go on past the table, and no card comes — the chapter's neither
    while (gs.level <= LEVELS.length) {
      nextLevel(w)
      expect(un.cardQ).toEqual([])
    }
    expect(res(w, Market).needs.length).toBeGreaterThan(0)
  })
  it("trade in the market's window sells from the stock for a quarter and buys at twice the price, put out in a pile by a way in", () => {
    const w = world()
    res(w, Stock).n.yarn = 4
    const c0 = res(w, GameState).coins
    sell(w, 'yarn', 4)
    expect(res(w, GameState).coins - c0).toBe(4 * sellPrice('yarn'))
    buy(w, 'hay', 3)
    expect(res(w, GameState).coins - c0).toBe(4 * sellPrice('yarn') - 3 * buyPrice('hay'))
    expect(stockOf(w, 'hay')).toBe(0)
    const at = inCells(w, { ...blankBuilding('dock', MARKET.x, MARKET.y, 0), w: MARKET.size, h: MARKET.size }).find((c) => pileAt(w, c.x, c.y))!
    expect(pileAt(w, at.x, at.y)!.map((q) => q.kind)).toEqual(['hay', 'hay', 'hay'])
    // more than one pile holds: put out round it, every one paid for
    const c1 = res(w, GameState).coins
    expect(buy(w, 'hay', 10)).toBe(10)
    expect(c1 - res(w, GameState).coins).toBe(10 * buyPrice('hay'))
    expect(lying(w).length).toBe(13)
  })
  it('the island grows at its levels, ring by ring round the start: the east, the south, then the west and the north', () => {
    const w = startWorld({ seed: 1 })
    worlds.push(w)
    const gs = res(w, GameState),
      f = res(w, Field)
    const edges = () => [f.left, f.top, f.right, f.bottom]
    expect(edges()).toEqual([ISLAND_START.left, ISLAND_START.top, ISLAND_START.right, ISLAND_START.bottom])
    for (const g of ISLAND_GROW) {
      const before = edges()
      // finish levels until the one where the island grows: only its own edges move
      while (gs.level + 1 < g.level) nextLevel(w)
      expect(edges()).toEqual([g.left ?? before[0], g.top ?? before[1], g.right ?? before[2], g.bottom ?? before[3]])
      expect(res(w, Unlocks).seen.has('island') || res(w, Unlocks).cardQ.includes('island')).toBe(true)
    }
    expect(edges()).toEqual([0, 0, GRID.cols, GRID.rows])
  })
})

describe('systems (TDD 3)', () => {
  it('each system switches off by its name; the menu’s farm works but counts nothing, shows no numbers, plays no sound', () => {
    expect(PLAY).toEqual(SYSTEMS.filter((s) => s !== 'orbit'))
    const w = startWorld({ seed: 1, systems: DEMO })
    worlds.push(w)
    const gs = res(w, GameState)
    const m = market(w)
    const coins = gs.coins
    // the market takes what comes, and nothing is counted: no stock, no coins, no level, no card
    for (let i = 0; i < 5; i++) expect(dockAccept(w, m, newItem('wool'), MARKET.x, MARKET.y, 0)).toBe(true)
    expect(stockOf(w, 'wool')).toBe(0)
    expect(gs.coins).toBe(coins)
    expect(gs.level).toBe(0)
    // the goods still hop in, for the eye
    expect(res(w, Fx).q.filter((e) => e.kind === 'deliver').length).toBe(5)
    res(w, Fx).q.length = 0
    // no client takes anything: their system is off
    res(w, Stock).n.wool = 5
    for (let i = 0; i < 600; i++) stepSimulation(w)
    expect(stockOf(w, 'wool')).toBe(5)
    res(w, Fx).q.length = 0
    // no numbers float up and no sound plays; a wool puff still does
    float(w, 1, 1, '+3')
    sound(w, 'place')
    puff(w, 1, 1, '#fff')
    expect(res(w, Fx).q.map((e) => e.kind)).toEqual(['puff'])
    // the farm still works: a good rides its belt; with the belts off it stands
    res(w, Unlocks).unlocked.add('belt')
    place(w, 'belt', 9, 17, 0, true)
    place(w, 'belt', 10, 17, 0, true)
    const b = get(w, 9, 17)!
    b.item = newItem('wool')
    for (let i = 0; i < 60; i++) stepSimulation(w)
    expect(get(w, 10, 17)!.item?.kind).toBe('wool')
    res(w, Systems).on.delete('belts')
    const it = get(w, 10, 17)!.item!
    const p = it.p
    for (let i = 0; i < 60; i++) stepSimulation(w)
    expect(get(w, 10, 17)!.item).toBe(it)
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
    expect(ins(blankBuilding('comb', 12, 15, 0))).toEqual(['sheep'])
    expect(outs(blankBuilding('comb', 12, 15, 0))).toEqual(['sheep'])
    expect(outs(blankBuilding('mower', 12, 15, 0))).toEqual(['hay'])
    // a splitter or a belt takes anything: no icon
    expect(ins(blankBuilding('splitter', 12, 15, 0))).toEqual([null])
  })
})
