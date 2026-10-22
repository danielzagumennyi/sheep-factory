import { afterEach, describe, expect, it } from 'vitest'
import { TOOL_ORDER } from './balance'
import { liftUp } from './actions/build'
import { pickSheep } from './actions/hand'
import { runBot } from './bot'
import { buildLine, portalPorts } from './lines'
import { SAVE_VERSION, loadGame, saveGame, saveInfo, type SaveData } from './save'
import { startWorld } from './start'
import { stepSimulation } from './systems'
import { Field, Flock, GameState, Plant, Unlocks, key, res, type World } from './world'

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
    runBot(a, 5 * 60)
    const b = keep(loadGame(stored(saveGame(a))))
    expect(state(b)).toBe(state(a))
    // the hills come back from the seed
    expect([...res(b, Field).hills].length).toBe([...res(a, Field).hills].length)
    // sheep ride belts, stations are mid-job: two more minutes, step for step
    for (let i = 0; i < 2 * 60 * 60; i++) {
      stepSimulation(a)
      stepSimulation(b)
    }
    expect(state(b)).toBe(state(a))
    expect([...res(b, Plant).b.values()].some((q) => q.item?.sheep)).toBe(true)
  }, 60000)
  it('a sheep in the hand comes down where it was; a building held to move stands where it stood', () => {
    const w = keep(startWorld({ seed: 2 }))
    for (const t of TOOL_ORDER) res(w, Unlocks).unlocked.add(t)
    res(w, GameState).coins = 1000
    buildLine(w, portalPorts(w)[0]!)
    const s = res(w, Flock).sheep.find((q) => q.state === 'roam')!
    pickSheep(w, s)
    s.px = 18.5
    s.py = 26.5
    const m = [...res(w, Plant).b.values()].find((q) => q.type === 'shearer')!
    liftUp(w, m)
    expect(res(w, Plant).b.has(key(m.x, m.y))).toBe(false)
    const l = keep(loadGame(stored(saveGame(w))))
    const ls = res(l, Flock).sheep.find((q) => q.id === s.id)!
    expect([ls.state, Math.floor(ls.px), Math.floor(ls.py)]).toEqual(['roam', 18, 26])
    expect(res(l, Plant).b.get(key(m.x, m.y))?.type).toBe('shearer')
  })
  it('a save of the game before «Все овечки должны быть пострижены» is not loaded', () => {
    const w = keep(startWorld({ seed: 5 }))
    for (const v of [1, 8, SAVE_VERSION - 1]) {
      const old = { ...(stored(saveGame(w)) as SaveData), v }
      expect(loadGame(old), `version ${v}`).toBeNull()
      expect(saveInfo(old), `version ${v}`).toBeNull()
    }
  })
  it('a broken save, another game’s or a newer one is not loaded', () => {
    const w = keep(startWorld({ seed: 3 }))
    for (const t of TOOL_ORDER) res(w, Unlocks).unlocked.add(t)
    res(w, GameState).coins = 1000
    buildLine(w, portalPorts(w)[0]!)
    const d = saveGame(w)
    expect(saveInfo(stored(d))).toEqual({ shorn: 0, clock: 0 })
    expect(loadGame(null)).toBeNull()
    expect(loadGame('hello')).toBeNull()
    expect(loadGame({ v: SAVE_VERSION + 1, at: 0, game: d.game })).toBeNull()
    expect(saveInfo({ v: SAVE_VERSION + 1, at: 0, game: d.game })).toBeNull()
    // a sheep on a belt that the flock doesn't have
    const bad = stored(d) as SaveData
    bad.game.plant.find((b) => b.type === 'belt')!.item = { kind: 'sheep', sheep: 999_999, p: 0, ed: 0 }
    expect(loadGame(bad)).toBeNull()
  })
})
