import { create } from 'zustand'
import { TOOL_ORDER, type BuildingId, type CardId } from '@/game/balance'
import type { Mode } from './saves'

/**
 * The app around the game: which screen is up (the title over a big farm, or the long game), the once-per-game cards
 * already seen, the quick bar's slots, the switches. Saved in localStorage under `ovf.*` (inside try/catch: private
 * mode just forgets on reload). The games themselves are kept by app/saves.ts, one per mode: «Продолжить» goes on with one.
 */
type Screen = 'title' | 'run'
/** The quick bar: ten slots, keys 1–9 and 0 (the clearing tool stands apart, on X). */
export const SLOTS = 10
export type Bar = (BuildingId | null)[]

const load = <T,>(k: string, d: T): T => {
  try {
    const v = globalThis.localStorage?.getItem(k)
    return v ? (JSON.parse(v) as T) : d
  } catch {
    return d
  }
}
const save = (k: string, v: unknown) => {
  try {
    globalThis.localStorage?.setItem(k, JSON.stringify(v))
  } catch {
    // private mode
  }
}

interface AppState {
  screen: Screen
  /** Bumped on every start, so «again» builds a fresh world. */
  runId: number
  /** How the run screen gets its world: a new game, or the kept one; of the long game or the endless mode. */
  from: 'new' | 'save'
  mode: Mode
  /** True while the menu is open over the running game. */
  menuOver: boolean
  seenEver: CardId[]
  sound: boolean
  /** The lawn can be switched on; it starts off (the author: «трава по-умолчанию выключена»). */
  grass: boolean
  /** The quick bar as the player set it in the book (empty slots fill with unlocked buildings: `barOf`). */
  bar: Bar
  /** The book of buildings and goods is open (the game waits), and the building the pointer is over in it. */
  book: boolean
  bookHover: BuildingId | null
  /** A new game of a mode (the one played last, by default): it takes that mode's kept game's place. */
  start: (mode?: Mode) => void
  /** Go on with a mode's kept game. */
  cont: (mode?: Mode) => void
  toTitle: () => void
  setBook: (open: boolean) => void
  setBookHover: (id: BuildingId | null) => void
  /** Put a building in slot i (taking it out of any other slot); `shown` is the bar as it is shown now. */
  assignSlot: (i: number, id: BuildingId, shown: Bar) => void
  openMenu: () => void
  closeMenu: () => void
  sawCards: (ids: readonly CardId[]) => void
  setSound: (on: boolean) => void
  setGrass: (on: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'title',
  runId: 0,
  from: 'new',
  mode: 'story',
  menuOver: false,
  seenEver: load('ovf.seen', []),
  sound: load('ovf.sound', true),
  grass: load('ovf.grass', false),
  bar: load<Bar>('ovf.bar', []),
  book: false,
  bookHover: null,
  start: (mode = get().mode) => set({ screen: 'run', from: 'new', mode, runId: get().runId + 1, menuOver: false, book: false }),
  cont: (mode = get().mode) => set({ screen: 'run', from: 'save', mode, runId: get().runId + 1, menuOver: false, book: false }),
  toTitle: () => set({ screen: 'title', menuOver: false, book: false, runId: get().runId + 1 }),
  setBook: (open) => set({ book: open, bookHover: null }),
  setBookHover: (id) => set({ bookHover: id }),
  assignSlot: (i, id, shown) => {
    const bar: Bar = Array.from({ length: SLOTS }, (_, k) => (shown[k] === id ? null : (shown[k] ?? null)))
    bar[i] = id
    save('ovf.bar', bar)
    set({ bar })
  },
  openMenu: () => set({ menuOver: true }),
  closeMenu: () => set({ menuOver: false }),
  sawCards: (ids) => {
    const seen = [...new Set([...get().seenEver, ...ids])]
    save('ovf.seen', seen)
    set({ seenEver: seen })
  },
  setSound: (on) => {
    save('ovf.sound', on)
    set({ sound: on })
  },
  setGrass: (on) => {
    save('ovf.grass', on)
    set({ grass: on })
  },
}))

/**
 * The quick bar as shown in the game: the player's slots, a building not open yet leaves its slot empty, and every
 * open building that has no slot takes the first empty one (so a new player's bar fills by itself, in TOOL_ORDER).
 */
export function barOf(saved: Bar, open: ReadonlySet<BuildingId>): Bar {
  const bar: Bar = Array.from({ length: SLOTS }, (_, i) => {
    const id = saved[i] ?? null
    return id && open.has(id) ? id : null
  })
  for (const id of TOOL_ORDER) {
    if (!open.has(id) || bar.includes(id)) continue
    const free = bar.indexOf(null)
    if (free < 0) break
    bar[free] = id
  }
  return bar
}

/** Dev-only switches from the address (a release build reads none): `?play` starts the game straight away. */
export const DEV_PARAMS = new URLSearchParams(import.meta.env.DEV ? globalThis.location?.search ?? '' : '')
