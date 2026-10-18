import { loadGame, saveGame, saveInfo, type SaveInfo } from '@/game/save'
import { GameState, res, type World, type WorldOptions } from '@/game/world'

/**
 * Where the games are kept between visits (TDD 3.5): one save per mode in localStorage — the long game under
 * `ovf.game`, the endless mode under `ovf.endless` — written as the game goes (RunScreen) and read by the main menu.
 * Every touch of the storage is inside try/catch: in a private window, or with the storage full, the game just isn't kept.
 */
export type Mode = 'story' | 'endless'
const KEY: Readonly<Record<Mode, string>> = { story: 'ovf.game', endless: 'ovf.endless' }

function read(mode: Mode): unknown {
  try {
    const v = globalThis.localStorage?.getItem(KEY[mode])
    return v ? (JSON.parse(v) as unknown) : null
  } catch {
    return null
  }
}

/** The kept game's level and time, for the main menu; null when there is none that loads. */
export function savedInfo(mode: Mode): SaveInfo | null {
  return saveInfo(read(mode))
}

/** The kept game of a mode, going on; null when there is none. One that no longer loads is dropped. */
export function loadSaved(mode: Mode, opts: WorldOptions): World | null {
  const d = read(mode)
  if (!d) return null
  const w = loadGame(d, opts)
  if (!w) clearSave(mode)
  return w
}

/** Keep a game, in its own mode's place. */
export function writeSave(w: World) {
  try {
    globalThis.localStorage?.setItem(KEY[res(w, GameState).endless ? 'endless' : 'story'], JSON.stringify(saveGame(w)))
  } catch {
    // private mode or no room: the game is not kept
  }
}

export function clearSave(mode: Mode) {
  try {
    globalThis.localStorage?.removeItem(KEY[mode])
  } catch {
    // private mode
  }
}
