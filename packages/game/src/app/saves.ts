import { loadGame, saveGame, saveInfo, type SaveInfo } from '@/game/save'
import type { World, WorldOptions } from '@/game/world'

/**
 * Where the game is kept between visits (TDD 3.5): one save in localStorage under `ovf.game`, written as the game goes
 * (RunScreen) and read by the main menu. Every touch of the storage is inside try/catch: in a private window, or with
 * the storage full, the game just isn't kept.
 */
const KEY = 'ovf.game'

function read(): unknown {
  try {
    const v = globalThis.localStorage?.getItem(KEY)
    return v ? (JSON.parse(v) as unknown) : null
  } catch {
    return null
  }
}

/** The kept game's score and time, for the main menu; null when there is none that loads. */
export function savedInfo(): SaveInfo | null {
  return saveInfo(read())
}

/** The kept game, going on; null when there is none. One that no longer loads is dropped. */
export function loadSaved(opts: WorldOptions): World | null {
  const d = read()
  if (!d) return null
  const w = loadGame(d, opts)
  if (!w) clearSave()
  return w
}

/** Keep the game. */
export function writeSave(w: World) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(saveGame(w)))
  } catch {
    // private mode or no room: the game is not kept
  }
}

export function clearSave() {
  try {
    globalThis.localStorage?.removeItem(KEY)
  } catch {
    // private mode
  }
}
