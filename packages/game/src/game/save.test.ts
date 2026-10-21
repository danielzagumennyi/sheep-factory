import { afterEach, describe, expect, it } from 'vitest'
import { liftUp } from './actions/build'
import { pickSheep } from './actions/hand'
import { runBot } from './bot'
import { SAVE_VERSION, loadGame, saveGame, saveInfo, type SaveData } from './save'
import { startWorld } from './start'
import { stepSimulation } from './systems'
import { Flock, GameState, Plant, Ui, key, newItem, res, type World } from './world'

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

  it('a sheep in the hand comes down where it was, goods in the hand stay in it, a building held to move stands where it stood', () => {
    const w = keep(startWorld({ seed: 2 }))
    runBot(w, 3 * 60)
    const s = res(w, Flock).sheep.find((q) => q.state === 'pasture')!
    pickSheep(w, s)
    s.px = 18.5
    s.py = 26.5
    const m = [...res(w, Plant).b.values()].find((q) => q.type === 'shearer')!
    liftUp(w, m)
    expect(res(w, Plant).b.has(key(m.x, m.y))).toBe(false)
    Object.assign(res(w, Ui), { carry: [newItem('wool'), newItem('hay')], carryFrom: { x: 17, y: 30 } })
    const l = keep(loadGame(stored(saveGame(w))))
    const ls = res(l, Flock).sheep.find((q) => q.id === s.id)!
    expect([ls.state, Math.floor(ls.px), Math.floor(ls.py)]).toEqual(['roam', 18, 26])
    expect(res(l, Plant).b.get(key(m.x, m.y))?.type).toBe('shearer')
    expect(res(l, Ui).carry.map((q) => q.kind)).toEqual(['wool', 'hay'])
    expect(res(l, Ui).carryFrom).toEqual({ x: 17, y: 30 })
  })

  it('a save from before the bigger map is not loaded: its cells are not this map’s', () => {
    const w = keep(startWorld({ seed: 5 }))
    runBot(w, 3 * 60)
    for (const v of [1, 5, SAVE_VERSION - 1]) {
      const old = { ...(stored(saveGame(w)) as SaveData), v }
      expect(loadGame(old), `version ${v}`).toBeNull()
      expect(saveInfo(old), `version ${v}`).toBeNull()
    }
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
