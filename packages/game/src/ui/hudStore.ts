import { create } from 'zustand'
import type { BuildingId, CardId, KindId } from '@/game/balance'
import type { Selection, Tool } from '@/game/world'

/**
 * What the HUD shows, as plain data. GameLoop rebuilds it a few times a second from the world (TDD 4.3); HUD
 * components subscribe to the slices they draw. Clicks in the HUD act on the world directly and the next refresh
 * shows the result.
 */
export interface ToolHud {
  id: BuildingId
  price: number
  short: boolean
  fresh: boolean
}
export type GoalHud = { tone: 'warn' | 'plain'; icon: string; text: string; params?: Record<string, string | number> } | null

export interface HudState {
  coins: number
  noMoney: number
  /** Bumped when the hand tried to work the field on pause. */
  pauseNudge: number
  clock: number
  speed: number
  /** Sheep gone into the portal, and the goal (GDD 7). */
  shorn: number
  goal: number
  won: boolean
  /** The next kind of sheep to come and how many more sheep it waits for (GDD 6); null once all have come. */
  nextKind: { kind: KindId; left: number } | null
  /** The line at the top: what to do next. */
  hint: GoalHud
  /** The quick bar's ten slots (an empty slot is null). */
  tools: (ToolHud | null)[]
  tool: Tool
  sel: Selection
  /** Screen position of the selection's popup anchor. */
  popAt: { x: number; y: number } | null
  card: CardId | null
  /** Bumped every refresh: popups re-read the world on it. */
  tick: number
  set: (s: Partial<HudState>) => void
}

export const useHudStore = create<HudState>((set) => ({
  coins: 0,
  noMoney: 0,
  pauseNudge: 0,
  clock: 0,
  speed: 1,
  shorn: 0,
  goal: 0,
  won: false,
  nextKind: null,
  hint: null,
  tools: [],
  tool: 'hand',
  sel: null,
  popAt: null,
  card: null,
  tick: 0,
  set: (s) => set(s),
}))
