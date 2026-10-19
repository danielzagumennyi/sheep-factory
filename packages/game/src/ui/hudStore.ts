import { create } from 'zustand'
import type { BuildingId, CardId, ClientId, ItemId, RecipeId, ResId } from '@/game/balance'
import type { Selection, Tool } from '@/game/world'

/**
 * What the HUD shows, as plain data. GameLoop rebuilds it a few times a second from the world (TDD 4.3); HUD
 * components subscribe to the slices they draw. Clicks in the HUD act on the world directly and the next refresh
 * shows the result.
 */
export interface AskHud {
  id: number
  client: ClientId
  kind: ItemId
  have: number
  total: number
  /** What one pays. */
  price: number
}
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
  /** The stock: how many of each good. */
  stock: Partial<Record<ItemId, number>>
  clock: number
  /** The village level open now, from 1. */
  level: number
  speed: number
  goal: GoalHud
  asks: AskHud[]
  /** The quick bar's ten slots (an empty slot is null). */
  tools: (ToolHud | null)[]
  /** The recipes the workshop knows in this mission. */
  recipes: RecipeId[]
  tool: Tool
  /** The recipe a new workshop starts with. */
  recipe: RecipeId
  /** What the hand sows, and what a new seeder starts with. */
  seed: ResId
  /** Kinds the farm has met so far: the splitter's rules and the market offer only these. */
  met: ItemId[]
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
  stock: {},
  clock: 0,
  level: 1,
  speed: 1,
  goal: null,
  asks: [],
  tools: [],
  recipes: [],
  tool: 'hand',
  recipe: 'sweater',
  seed: 'meadow',
  met: [],
  sel: null,
  popAt: null,
  card: null,
  tick: 0,
  set: (s) => set(s),
}))
