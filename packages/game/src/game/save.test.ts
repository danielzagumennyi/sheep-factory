import { afterEach, describe, expect, it } from 'vitest'
import { liftUp } from './actions/build'
import { pickSheep } from './actions/hand'
import { GRID, LEVELS, MARKET } from './balance'
import { runBot } from './bot'
import { SAVE_VERSION, loadGame, saveGame, saveInfo, type SaveData } from './save'
import { startWorld } from './start'
import { stepSimulation } from './systems'
import { get } from './grid'
import { levelDef } from './systems/village'
import { Flock, GameState, Market, Plant, Stock, key, res, type World } from './world'

let worlds: World[] = []
afterEach(() => {
  for (const w of worlds) w.destroy()
  worlds = []
})
const keep = (w: World | null) => {
  if (!w) throw new Error('no world')
  worlds.push(w)
  return w
}
/** A save as it comes back from storage: through JSON text. */
const stored = (d: SaveData) => JSON.parse(JSON.stringify(d)) as unknown
/**
 * A save made now turned into one of version v, before the market in the middle: the village's asks with their
 * trucks, a dock along the road and a stall past it instead of the market.
 */
function asBefore(d: SaveData, v: number) {
  const dock = d.game.plant.find((q) => q.type === 'dock')!
  const old = { ...d, v } as SaveData
  old.game.plant = d.game.plant.filter((q) => q.type !== 'dock')
  old.game.plant.push({ ...dock, x: 0, y: GRID.rows, w: 32, h: 1 }, { ...dock, x: 8, y: GRID.rows + 1, w: 3, h: 2 })
  Object.assign(old.game, {
    market: { asks: [{ id: 1, client: 'post', kind: 'wool', total: 10, have: 3, stall: 0 }], trucks: [{ ask: 1, x: 9, tx: 9, state: 'park', lane: 0 }], askUid: 2 },
  })
  return old
}
/** The game in a save, without the time it was written. */
const state = (w: World) => JSON.stringify(saveGame(w).game)

describe('saves (TDD 3.5)', () => {
  it('a loaded game goes on exactly as the saved one would have', () => {
    const a = keep(startWorld({ seed: 11 }))
    runBot(a, 20 * 60)
    const b = keep(loadGame(stored(saveGame(a))))
    expect(state(b)).toBe(state(a))
    // goods ride belts with sheep among them, machines are mid-job: five more minutes, step for step
    for (let i = 0; i < 5 * 60 * 60; i++) {
      stepSimulation(a)
      stepSimulation(b)
    }
    expect(state(b)).toBe(state(a))
    expect(res(b, Flock).sheep.length).toBeGreaterThan(8)
    expect([...res(b, Plant).b.values()].some((q) => q.item?.sheep)).toBe(true)
  })

  it('a sheep in the hand walks home, a building held to move stands where it stood', () => {
    const w = keep(startWorld({ seed: 2 }))
    runBot(w, 3 * 60)
    const s = res(w, Flock).sheep.find((q) => q.state === 'pasture')!
    pickSheep(w, s)
    const m = [...res(w, Plant).b.values()].find((q) => q.type === 'shearer')!
    liftUp(w, m)
    expect(res(w, Plant).b.has(key(m.x, m.y))).toBe(false)
    const l = keep(loadGame(stored(saveGame(w))))
    expect(res(l, Flock).sheep.find((q) => q.id === s.id)!.state).toBe('pasture')
    expect(res(l, Plant).b.get(key(m.x, m.y))?.type).toBe('shearer')
  })

  it('a save from before the market in the middle loads with it: what stood there goes, its coins back; the clients come as the level has them', () => {
    const w = keep(startWorld({ seed: 5 }))
    runBot(w, 9 * 60)
    const old = asBefore(stored(saveGame(w)) as SaveData, 5)
    // a feeder holding hay where the market now stands
    const feeder = { ...old.game.plant.find((q) => q.type === 'shearer')!, type: 'feeder' as const, x: MARKET.x + 2, y: MARKET.y + 3, paid: 50, inv: { hay: 3 } }
    old.game.plant.push(feeder)
    // and a pen of two sheep, its id the next one
    const pen0 = old.game.flock.pastures[0]!,
      id = ++old.game.flock.penUid
    old.game.flock.pastures.push({ ...pen0, id, x: MARKET.x + 4, y: MARKET.y + 4, paid: 40 })
    const top = Math.max(...old.game.flock.sheep.map((q) => q.id))
    for (const k of [1, 2]) {
      const px = MARKET.x + 5 + k * 0.3,
        py = MARKET.y + 5.5
      old.game.flock.sheep.push({ ...old.game.flock.sheep[0]!, id: top + k, home: id, state: 'pasture', px, py, tx: px, ty: py })
    }
    const sheep = old.game.flock.sheep.length
    const coins = old.game.gs.coins,
      hay = old.game.stock.hay ?? 0
    const l = keep(loadGame(old))
    const docks = [...res(l, Plant).b.values()].filter((q) => q.type === 'dock')
    expect(docks.map((q) => [q.x, q.y, q.w, q.h])).toEqual([[MARKET.x, MARKET.y, MARKET.size, MARKET.size]])
    expect(res(l, GameState).coins).toBe(coins + 50 + 40)
    expect(res(l, Flock).pastures.some((p) => p.id === id)).toBe(false)
    // its sheep are kept: they roam outside the market
    expect(res(l, Flock).sheep.length).toBe(sheep)
    expect(res(l, Stock).n.hay ?? 0).toBe(hay + 3)
    const gs = res(l, GameState)
    expect(res(l, Market).needs.map((n) => [n.client, n.kind, n.rate])).toEqual(levelDef(gs.level).needs.map((q) => [...q]))
    expect(res(l, Market).needs.every((n) => n.fill === 0)).toBe(true)
    expect(gs.trade).toBe(gs.level >= LEVELS.findIndex((L) => L.open.includes('market')))
    // no sheep stands in the market
    for (const q of res(l, Flock).sheep) expect(get(l, Math.floor(q.px), Math.floor(q.py))?.type, `sheep ${q.id}`).not.toBe('dock')
  })

  it('a save of the first version, a dock for each client, loads all the way to the market in the middle', () => {
    const w = keep(startWorld({ seed: 5 }))
    runBot(w, 9 * 60)
    const old = asBefore(stored(saveGame(w)) as SaveData, 1)
    delete (old.game.gs as Partial<SaveData['game']['gs']>).trade
    const l = keep(loadGame(old))
    expect([...res(l, Plant).b.values()].filter((q) => q.type === 'dock').length).toBe(1)
    expect(res(l, Market).needs.length).toBe(levelDef(res(l, GameState).level).needs.length)
  })

  it('the endless mode is kept as the endless mode', () => {
    const w = keep(startWorld({ seed: 4, endless: true }))
    runBot(w, 3 * 60)
    const l = keep(loadGame(stored(saveGame(w))))
    expect(res(l, GameState).endless).toBe(true)
    expect(state(l)).toBe(state(w))
  })

  it('a broken save, another game’s or a newer one is not loaded', () => {
    const w = keep(startWorld({ seed: 3 }))
    const d = saveGame(w)
    expect(saveInfo(stored(d))).toEqual({ level: 0, clock: 0 })
    expect(loadGame(null)).toBeNull()
    expect(loadGame('hello')).toBeNull()
    expect(loadGame({ v: SAVE_VERSION + 1, at: 0, game: d.game })).toBeNull()
    expect(saveInfo({ v: SAVE_VERSION + 1, at: 0, game: d.game })).toBeNull()
    // a good that points at a sheep the flock doesn't have
    const bad = stored(d) as SaveData
    bad.game.plant[0]!.item = { kind: 'sheep', sheep: 999, p: 0, ed: 0, strayT: 0 }
    expect(loadGame(bad)).toBeNull()
  })
})
