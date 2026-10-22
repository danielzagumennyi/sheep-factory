import { afterEach, describe, expect, it } from 'vitest'
import { ARRIVE, BUILDINGS, CARROT, GOAL, GRID, HAND, KINDS, PORTAL, SCARE, SHEEP, START, TOOL_ORDER, type KindId } from './balance'
import { get, whyNot } from './grid'
import { buyRecipe, liftUp, place, putBack, remove } from './actions/build'
import { dropSheep, handClick, pickSheep, shearClick } from './actions/hand'
import { ruleFits } from './systems/belts'
import { flockBar, kindsOpen } from './systems/arrive'
import { stepSimulation } from './systems'
import { startWorld } from './start'
import { openField, putTerrain } from './testing'
import { createGameWorld, Field, Flock, GameState, Plant, Unlocks, key, makeSheep, newItem, ready, res, type SheepT, type World } from './world'

/** The rules of «Все овечки должны быть пострижены» (docs/01-GDD.md), each as the player meets it. */
let worlds: World[] = []
afterEach(() => {
  for (const w of worlds) w.destroy()
  worlds = []
})
const keep = (w: World) => {
  worlds.push(w)
  return w
}
/** A bare field (testing.ts) with every recipe bought and coins to build. */
function field(keepPortal = false) {
  const w = keep(openField(createGameWorld({ seed: 5 }), keepPortal))
  for (const b of TOOL_ORDER) res(w, Unlocks).unlocked.add(b)
  res(w, GameState).coins = 5000
  return w
}
const run = (w: World, s: number) => {
  for (let t = 0; t < s; t += 1 / 60) {
    stepSimulation(w)
    res(w, Unlocks).cardQ.length = 0
  }
}
/** A sheep of a kind roaming at (x, y), in the flock. */
function sheep(w: World, kind: KindId, x: number, y: number) {
  const s = makeSheep(w, kind, { x, y })
  res(w, Flock).sheep.push(s)
  return s
}
/** A sheep of a kind on a belt cell, about to leave it. */
function onBelt(w: World, kind: KindId, x: number, y: number, wool = 1) {
  const s = sheep(w, kind, x + 0.5, y + 0.5)
  s.wool = wool
  const b = get(w, x, y)!
  b.item = newItem(s)
  b.item.p = 1
  s.state = 'belt'
  return s
}

describe('a new game (GDD 6, 8)', () => {
  it('starts with no coins and only the hand; the big flock already roams, some of it round the portal in the middle', () => {
    const w = keep(startWorld({ seed: 2 }))
    expect(res(w, GameState).coins).toBe(START.coins)
    expect(res(w, Unlocks).unlocked.size).toBe(0)
    expect(res(w, Unlocks).cardQ).toEqual(['shear'])
    const flock = res(w, Flock).sheep
    expect(flock.length).toBeGreaterThan(ARRIVE.start * 0.95)
    expect(flock.every((s) => s.kind === 'plain' && s.wool === 1 && s.state === 'roam')).toBe(true)
    const mid = PORTAL.x + PORTAL.size / 2
    expect(flock.filter((s) => Math.hypot(s.px - mid, s.py - mid) < 14).length).toBeGreaterThanOrEqual(ARRIVE.nearPortal * 0.9)
    // the portal stands in the middle of the 112×112 map
    expect(GRID.cols).toBe(112)
    expect(get(w, PORTAL.x + 3, PORTAL.y + 3)?.type).toBe('dock')
  })
  it('the same seed makes the same map; another seed another one', () => {
    const a = keep(createGameWorld({ seed: 4 })),
      b = keep(createGameWorld({ seed: 4 })),
      c = keep(createGameWorld({ seed: 9 }))
    const sig = (w: World) => JSON.stringify([...res(w, Field).terrain].slice(0, 200)) + [...res(w, Field).hills].length
    expect(sig(a)).toBe(sig(b))
    expect(sig(a)).not.toBe(sig(c))
  })
})

describe('the hand (GDD 3)', () => {
  it('shears a ready sheep in three clicks: the fleece bursts into fluff and nothing is left on the ground', () => {
    const w = field()
    const s = sheep(w, 'plain', 20.5, 20.5)
    for (let i = 0; i < HAND.shearClicks - 1; i++) shearClick(w, s)
    expect(s.wool).toBe(1)
    shearClick(w, s)
    expect([s.wool, s.clicks]).toEqual([0, 0])
  })
  it('does not shear a sheep that is not ready', () => {
    const w = field()
    const s = sheep(w, 'dirty', 20.5, 20.5)
    for (let i = 0; i < 5; i++) expect(shearClick(w, s)).toBe(false)
    expect(s.wool).toBe(1)
    // by a click on the field too
    handClick(w, s.px, s.py)
    expect(s.wool).toBe(1)
  })
  it('carries a shorn sheep into the portal: it leaves the map, the score and the coins go up; a fluffy one is not taken', () => {
    const w = field(true)
    const fluffy = sheep(w, 'plain', 20.5, 20.5),
      shorn = sheep(w, 'plain', 21.5, 20.5)
    shorn.wool = 0
    const coins = res(w, GameState).coins
    pickSheep(w, fluffy)
    dropSheep(w, fluffy, PORTAL.x + 2.5, PORTAL.y + 2.5)
    expect([fluffy.state, res(w, GameState).shorn]).toEqual(['roam', 0])
    pickSheep(w, shorn)
    dropSheep(w, shorn, PORTAL.x + 2.5, PORTAL.y + 2.5)
    expect(res(w, GameState).shorn).toBe(1)
    expect(res(w, GameState).coins).toBe(coins + SHEEP.coins)
    expect(res(w, Flock).sheep.includes(shorn)).toBe(false)
  })
})

describe('recipes and building (GDD 4.1, 8)', () => {
  it('a building is built only once its recipe is bought; a recipe is bought once, for coins', () => {
    const w = keep(openField(createGameWorld({ seed: 5 })))
    res(w, GameState).coins = BUILDINGS.belt.recipe - 1
    expect(place(w, 'belt', 10, 10, 0)).toBe(false)
    expect(buyRecipe(w, 'belt')).toBe(false)
    res(w, GameState).coins = BUILDINGS.belt.recipe + BUILDINGS.belt.cost
    expect(buyRecipe(w, 'belt')).toBe(true)
    expect(res(w, Unlocks).cardQ).toContain('belt')
    expect(buyRecipe(w, 'belt')).toBe(false)
    expect(place(w, 'belt', 10, 10, 0)).toBe(true)
    expect(res(w, GameState).coins).toBe(0)
  })
  it('a building may not stand on a hill, water, rocks, trees or bushes; a meadow is cleared by it', () => {
    const w = field()
    putTerrain(w, 'water', [10, 10, 10, 10])
    putTerrain(w, 'bush', [14, 10, 14, 10])
    putTerrain(w, 'meadow', [18, 10, 19, 11])
    res(w, Field).hills.set(key(22, 10), 2)
    expect(whyNot(w, 'belt', 10, 10)).toBe('onWater')
    expect(whyNot(w, 'belt', 14, 10)).toBe('bush')
    expect(whyNot(w, 'belt', 22, 10)).toBe('hill')
    expect(place(w, 'comb', 18, 10, 0)).toBe(true)
    expect(res(w, Field).terrain.has(key(18, 10))).toBe(false)
  })
  it('the wash stands only by water', () => {
    const w = field()
    expect(whyNot(w, 'wash', 30, 30, 0)).toBe('needWater')
    putTerrain(w, 'water', [33, 30, 34, 31])
    expect(whyNot(w, 'wash', 30, 30, 0)).toBe('')
  })
  it('nothing is built where a sheep stands — but a belt is: sheep step over belts; a sheep built round runs off', () => {
    const w = field()
    const s = sheep(w, 'plain', 30.5, 30.5)
    expect(whyNot(w, 'comb', 30, 30, 0)).toBe('sheepHere')
    expect(place(w, 'belt', 30, 30, 0)).toBe(true)
    remove(w, 30, 30)
    // a scarecrow clears the ground (below); with the sheep gone the comb goes up
    s.px = s.tx = 40.5
    expect(place(w, 'comb', 30, 30, 0)).toBe(true)
  })
  it('a removed building gives its coins back; the sheep in it roam', () => {
    const w = field()
    place(w, 'belt', 13, 16, 0)
    place(w, 'comb', 14, 15, 0)
    const s = onBelt(w, 'tangled', 13, 16)
    run(w, 1)
    expect(s.state).toBe('machine')
    const coins = res(w, GameState).coins
    remove(w, 14, 15)
    expect(res(w, GameState).coins).toBe(coins + BUILDINGS.comb.cost)
    expect(s.state).toBe('roam')
  })
})

describe('stations (GDD 4.3)', () => {
  it('each takes only the sheep its job is for: the comb a tangled one, the wash a dirty one, the picker one with burrs', () => {
    for (const [type, kind] of [
      ['comb', 'tangled'],
      ['pick', 'burrs'],
    ] as const) {
      const w = field()
      place(w, 'belt', 13, 16, 0)
      place(w, type, 14, 15, 0)
      const s = onBelt(w, kind, 13, 16)
      run(w, BUILDINGS[type].time! + 1)
      expect(s.needs, type).toEqual([])
      expect(ready(s)).toBe(true)
    }
  })
  it('a wrong sheep stands at the way in and the line behind it stands; the sign says what it needs', () => {
    const w = field()
    for (const x of [11, 12, 13]) place(w, 'belt', x, 16, 0)
    place(w, 'shearer', 14, 15, 0)
    const dirty = onBelt(w, 'dirty', 13, 16)
    const plain = onBelt(w, 'plain', 12, 16)
    run(w, 5)
    expect(dirty.state).toBe('belt')
    expect(get(w, 13, 16)!.item?.sheep).toBe(dirty)
    expect(get(w, 12, 16)!.item?.sheep).toBe(plain)
    expect(get(w, 14, 15)!.wrong?.sheep).toBe(dirty)
    // the hand takes it off: the line goes on and the plain one is shorn
    pickSheep(w, dirty)
    dropSheep(w, dirty, 30.5, 30.5)
    run(w, 6)
    expect(plain.wool).toBe(0)
  })
  it('the shearer shears a ready sheep and lets it out; with nothing at its way out the sheep roams off', () => {
    const w = field()
    place(w, 'belt', 13, 16, 0)
    place(w, 'shearer', 14, 15, 0)
    const s = onBelt(w, 'plain', 13, 16)
    run(w, BUILDINGS.shearer.time! + 1)
    expect([s.wool, s.state]).toEqual([0, 'roam'])
  })
})

describe('the carrot and the scarecrow (GDD 4.5, 4.6)', () => {
  it('fluffy sheep in a carrot’s circle walk to it and it puts them onto its belt; shorn ones it does not call', () => {
    const w = field()
    place(w, 'carrot', 20, 20, 0)
    // its way out is (22, 21): a belt going east takes the sheep away
    for (const x of [22, 23, 24, 25]) place(w, 'belt', x, 21, 0)
    const near = sheep(w, 'plain', 21 + CARROT.radius - 0.6, 18.4)
    const shorn = sheep(w, 'plain', 19, 22.6)
    shorn.wool = 0
    const far = sheep(w, 'plain', 21 + CARROT.radius + 4, 21)
    run(w, 30)
    expect(near.state).toBe('belt')
    expect(shorn.state).toBe('roam')
    expect(far.state).toBe('roam')
  })
  it('sheep leave a scarecrow’s circle and arrivals don’t land in it', () => {
    const w = field()
    const s = sheep(w, 'plain', 31.2, 31)
    place(w, 'scare', 34, 30, 0)
    run(w, 30)
    expect(Math.hypot(s.px - 35, s.py - 31)).toBeGreaterThan(SCARE.radius - 0.2)
  })
  it('a scarecrow goes up where sheep stand: it is how a place is cleared, they run off it', () => {
    const w = field()
    const s = sheep(w, 'plain', 30.5, 30.5)
    expect(whyNot(w, 'scare', 30, 30, 0)).toBe('')
    expect(place(w, 'scare', 30, 30, 0)).toBe(true)
    expect(get(w, Math.floor(s.px), Math.floor(s.py))).toBeNull()
  })
})

describe('moving a building', () => {
  it('a move called off puts it back even if a sheep wandered onto its place meanwhile; the sheep steps off', () => {
    const w = field()
    place(w, 'comb', 30, 30, 0)
    const coins = res(w, GameState).coins
    liftUp(w, get(w, 30, 30)!)
    const s = sheep(w, 'plain', 30.5, 30.5)
    putBack(w)
    expect(get(w, 30, 30)?.type).toBe('comb')
    expect(res(w, GameState).coins).toBe(coins)
    expect(get(w, Math.floor(s.px), Math.floor(s.py))).toBeNull()
  })
})

describe('sorting (GDD 4.4)', () => {
  it('a splitter’s rules go by what the sheep needs now', () => {
    const w = field()
    const mk = (kind: KindId, wool = 1): SheepT => {
      const s = makeSheep(w, kind, { x: 1, y: 1 })
      s.wool = wool
      return s
    }
    expect(ruleFits('wash', mk('dirty'))).toBe(true)
    expect(ruleFits('wash', mk('tangled'))).toBe(false)
    expect(ruleFits('ready', mk('plain'))).toBe(true)
    expect(ruleFits('ready', mk('dirty'))).toBe(false)
    expect(ruleFits('shorn', mk('plain', 0))).toBe(true)
    expect(ruleFits('comb', mk('tangled', 0))).toBe(false)
    expect(ruleFits('off', mk('plain'))).toBe(false)
  })
  it('a splitter sends each sheep to its side, the rest straight on', () => {
    const w = field()
    for (const x of [12, 13, 14]) place(w, 'belt', x, 16, 0)
    place(w, 'splitter', 14, 16, 0)
    get(w, 14, 16)!.rules = { l: 'wash', f: 'any', r: 'off' }
    place(w, 'belt', 14, 15, 3)
    place(w, 'belt', 15, 16, 0)
    const dirty = onBelt(w, 'dirty', 13, 16)
    run(w, 2)
    expect(get(w, 14, 15)!.item?.sheep).toBe(dirty)
    const plain = onBelt(w, 'plain', 13, 16)
    run(w, 2)
    expect(get(w, 15, 16)!.item?.sheep).toBe(plain)
  })
})

describe('the portal (GDD 7)', () => {
  it('takes shorn sheep off a belt into it and counts them; a fluffy one stands at its way in', () => {
    const w = field(true)
    // its west ways in are at (PORTAL.x, PORTAL.y + 2) and (…, + 5), from the cell west of each
    const y = PORTAL.y + 2
    for (const x of [PORTAL.x - 3, PORTAL.x - 2, PORTAL.x - 1]) place(w, 'belt', x, y, 0)
    onBelt(w, 'plain', PORTAL.x - 1, y, 0)
    run(w, 1)
    expect(res(w, GameState).shorn).toBe(1)
    const fluffy = onBelt(w, 'plain', PORTAL.x - 1, y)
    run(w, 2)
    expect(get(w, PORTAL.x - 1, y)!.item?.sheep).toBe(fluffy)
    expect(res(w, GameState).shorn).toBe(1)
  })
  it('the goal reached: the win, with its card, and the game goes on', () => {
    const w = field(true)
    res(w, GameState).shorn = GOAL.sheep
    run(w, 0.1)
    expect(res(w, GameState).won).toBe(true)
  })
})

describe('arrivals (GDD 6)', () => {
  it('sheep come down on parachutes up to the bar, which rises with the score; at the bar none come', () => {
    const w = keep(startWorld({ seed: 6 }))
    const flock = res(w, Flock).sheep
    expect(flock.length).toBeLessThanOrEqual(flockBar(w))
    run(w, 5)
    const n = flock.length
    res(w, GameState).shorn = 100
    expect(flockBar(w)).toBe(ARRIVE.bar + 100 * ARRIVE.perShorn)
    run(w, 30)
    expect(flock.length).toBeGreaterThan(n)
    expect(flock.some((s) => s.drop !== undefined)).toBe(true)
    expect(flock.length).toBeLessThanOrEqual(flockBar(w))
  })
  it('a new kind opens by the score, with its card', () => {
    const w = keep(startWorld({ seed: 6 }))
    expect(kindsOpen(w)).toEqual(['plain'])
    res(w, GameState).shorn = KINDS.dirty.at
    stepSimulation(w)
    expect(kindsOpen(w)).toContain('dirty')
    expect(res(w, Unlocks).cardQ).toContain('dirty')
  })
})

describe('the field (GDD 5)', () => {
  it('a roaming sheep never stands on a building: built over, it runs off at once', () => {
    const w = field()
    const s = sheep(w, 'plain', 30.5, 30.5)
    place(w, 'belt', 30, 30, 0)
    // a belt it may stand on; a station put over it from the menu's factory pushes it off (lines.ts clears the cells)
    const plant = res(w, Plant)
    expect(plant.b.has(key(30, 30))).toBe(true)
    expect(s.state).toBe('roam')
  })
})
