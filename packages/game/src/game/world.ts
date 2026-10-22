import { createWorld, trait, type Trait, type World } from 'koota'
import {
  ARRIVE,
  dimsOf,
  GRID,
  ISLAND_START,
  KINDS,
  PORTAL,
  ROAM,
  SHEEP_NAMES,
  START,
  type BuildingId,
  type CardId,
  type Dir,
  type KindId,
  type NeedId,
  type SPLIT_RULES,
  type TerrainId,
} from './balance'
import { makeMap, type HillRect } from './land'
import { makeRng } from './rng'

export type { World }

/**
 * The simulation's state (TDD 3). As in Cubocalypse, koota holds world-level resources (`res(world, X)`); the many
 * small things — buildings, sheep — are plain objects inside those resources, keyed by cell, because the grid is what
 * every rule asks about ("what is on this cell", "who feeds this belt").
 */

// ---------------------------------------------------------------- data types

/** A sheep riding a belt (or waiting in a building's way out): its place across the cell and the side it came in from. */
export interface Item {
  kind: 'sheep'
  sheep: SheepT
  /** Progress across the current cell, 0 → 1. */
  p: number
  /** The direction it entered the cell from (drawing only). */
  ed: Dir
}

/** `wrong`: a sheep the building may not take stands at its way in (GDD 4.3), so the line behind it stands. */
export type MachineStatus = '' | 'wrong'
export type SplitRule = (typeof SPLIT_RULES)[number]
export interface SplitRules {
  l: SplitRule
  f: SplitRule
  r: SplitRule
}

export interface Building {
  type: BuildingId | 'dock'
  x: number
  y: number
  dir: Dir
  /** A belt or splitter carries one sheep; a merger buffers a few. */
  item: Item | null
  buf: Item[]
  /** The sheep in a station. */
  slot: { sheep: SheepT } | null
  timer: number
  total: number
  /** Sheep done, waiting for room on the way out. */
  outs: { item: Item; dir: Dir }[]
  /** Footprint in cells along x and y; (x, y) is its top-left cell. */
  w: number
  h: number
  /** Sheep done so far. */
  count: number
  /** A carrot's progress towards putting the next sheep out, seconds. */
  prog: number
  status: MachineStatus
  /** The sheep that last stood at its way in that it may not take, and when (game seconds): the sign over it (GDD 4.3). */
  wrong: { sheep: SheepT; t: number } | null
  rules: SplitRules | null
  /** Coins spent on it (refunded on removal). */
  paid: number
  /** Can't be moved or removed: the portal. */
  fixed?: boolean
  /** Round-robin cursor of a splitter. */
  rr: number
  /** Belt chevron phase (drawing). */
  phase: number
}

/** On a belt, in a station, roaming the map (GDD 5), in the hand. */
export type SheepState = 'belt' | 'machine' | 'roam' | 'held'
export interface SheepT {
  id: number
  name: string
  /** What it was when it arrived (GDD 5). */
  kind: KindId
  /** The stations it still needs before shearing (GDD 4.3); empty — ready, once fluffy. */
  needs: NeedId[]
  /** Its fleece: 1 fluffy, 0 shorn. */
  wool: number
  state: SheepState
  /** Position in cells (floats). */
  px: number
  py: number
  tx: number
  ty: number
  wanderT: number
  clicks: number
  face: Dir
  /** Seconds left of its arrival (DROP): it floats down on a parachute, then lands. Absent once it is here. */
  drop?: number
}

/** Something for the view to show once: a number floating up, a puff, a sound. Drained every frame. */
export type FxEvent =
  | { kind: 'float'; x: number; y: number; text: string; tone: 'good' | 'soft' | 'bad' | 'accent' | 'water' }
  | { kind: 'puff'; x: number; y: number; color: string; n: number }
  | { kind: 'sound'; id: SoundId }
  /** A sheep went into the portal through its way in at (x, y): its coins fly up. */
  | { kind: 'portal'; x: number; y: number; coins: number }
/** The game's sounds for now (the author's recordings): a building set down, one removed. The UI click is the HUD's own. */
export type SoundId = 'place' | 'remove'

export type Tool = 'hand' | 'erase' | BuildingId
export type Selection = { kind: 'b'; key: string } | null

// ---------------------------------------------------------------- traits (world resources)

export const Time = trait(() => ({ t: 0, dt: 1 / 60, frame: 0, alpha: 0 }))

export const GameState = trait(() => ({
  /** The map's seed (land.ts): the hills come from it again when a game is loaded. */
  seed: 1,
  /** Seconds of game time. */
  clock: 0,
  coins: 0,
  /** 0 = pause; 1, 2, 4 = speed. */
  speed: 1,
  /** Sheep gone into the portal (GDD 7). */
  shorn: 0,
  /** The goal was reached, and when (game seconds; the win screen shows it). */
  won: false,
  wonAt: 0,
  /** Seconds towards the next arrival (GDD 6). */
  arriveT: 0,
  uid: 0,
  /** Counts failed purchases; the HUD shakes the coin counter when it changes. */
  noMoney: 0,
  /** Bumped when the hand tries to work the field on pause: the pause line nudges. */
  pauseNudge: 0,
  /** Bumped when the terrain changes (a building clears a meadow), so the 3D field rebuilds only then. */
  fieldVersion: 0,
  /** Bumped whenever a building is set down, taken off or turned: cached routes and views go stale on it. */
  plantVersion: 0,
}))

export const Field = trait(() => ({
  terrain: new Map<string, TerrainId>(),
  /** The level of each hill's cell, 2 or 3 (HILL): the map's, never changed by play, so not saved. */
  hills: new Map<string, number>(),
  /** The hills as their steps' rectangles, for drawing them (render/Hills.tsx). */
  hillRects: [] as HillRect[],
  /** The island's edges (from `left` to before `right`, from `top` to before `bottom`): the whole map. */
  left: ISLAND_START.left,
  top: ISLAND_START.top,
  right: ISLAND_START.right,
  bottom: ISLAND_START.bottom,
}))

/** Buildings by their top-left cell; `occ` maps every other cell a 2×2 building covers to that cell. */
export const Plant = trait(() => ({ b: new Map<string, Building>(), occ: new Map<string, string>() }))

export const Flock = trait(() => ({ sheep: [] as SheepT[] }))

export const Unlocks = trait(() => ({
  /** Recipes bought (GDD 8): the buildings the player may build. */
  unlocked: new Set<BuildingId>(),
  /** Tools that glow on the hotbar until first picked. */
  fresh: new Set<BuildingId>(),
  /** «Новое» cards waiting to be shown; the game pauses while one is up. */
  cardQ: [] as CardId[],
  seen: new Set<CardId>(),
}))

/** What the pointer is doing: tool, rotation, selection, belt start, hover cell, the sheep in the hand. */
export const Ui = trait(() => ({
  tool: 'hand' as Tool,
  rot: 0 as Dir,
  sel: null as Selection,
  pending: null as { x: number; y: number } | null,
  /** The cell and ground point under the pointer, and the sheep or building it is over (picked by its model, the nearest one). */
  hover: null as { x: number; y: number; wx: number; wy: number; sheep: number | null; b: string | null } | null,
  drag: null as SheepT | null,
  /** A building picked up to move (its menu, a right click), and where it stood: it goes back there if the move is called off. */
  moving: null as { b: Building; x: number; y: number; dir: Dir } | null,
}))

export const Fx = trait(() => ({ q: [] as FxEvent[] }))

export const Stats = trait(() => ({ earned: 0, spent: 0, handShear: 0 }))

export const Rng = trait(() => ({ next: makeRng(1) }))

// ---------------------------------------------------------------- switches

/**
 * The game's systems by name, each of which can be switched off (the author, 17.10.2026: «игра должна быть разбита на
 * системы и их легко должно быть отключать»). A world keeps the set that is on (`Systems`); the simulation's steps, the
 * effects, the keys and the views each look up their own. The main menu's farm is the game with most of them off
 * (DEMO): only to look at.
 */
export const SYSTEMS = [
  // the simulation's steps (systems/index.ts), in their order
  'arrive', // sheep come down on parachutes to keep the flock at its bar, new kinds by the score
  'sheep', // sheep roam, walk to carrots and away from scarecrows
  'belts', // sheep ride the belts, the portal takes the shorn
  'machines', // stations work, carrots put sheep out
  'goal', // the goal reached: the win
  // what the factory tells the player
  'floats', // numbers float up from the field
  'sound',
  // the player's hands and what shows them
  'keys', // the keyboard on the field: tools, rotate, erase, pause, the camera
  'pointer', // the mouse and touchpad on the field: the hand, building, the camera
  'ghost', // what is in hand: its preview, the cell grid, the circles
  'hover', // the outline and the label under the pointer
  'tags', // labels on the field: the signs over stations and sheep
  'portIcons', // beside every way in and out, while building or pointing at it: what goes through it
  'hud', // the screen's panels, fed a few times a second
  'fps', // the frame rate panel
  'orbit', // the camera turning slowly round the farm by itself
] as const
export type SystemId = (typeof SYSTEMS)[number]
/** The game as played: everything but the camera's own turning. */
export const PLAY: readonly SystemId[] = SYSTEMS.filter((s) => s !== 'orbit')
/**
 * The main menu's farm (the author: «в демо на главном меню должно быть только визуально»): the factory works and the
 * camera turns round it; no hands, no grid, no numbers, no sound, no goal.
 */
export const DEMO: readonly SystemId[] = ['arrive', 'sheep', 'belts', 'machines', 'orbit']
export const Systems = trait(() => ({ on: new Set<SystemId>(PLAY) }))

// ---------------------------------------------------------------- access

/** World-level resource accessor. Every resource is added in createGameWorld, so a miss is a programming error. */
export function res<T extends Trait>(world: World, t: T) {
  const v = world.get(t)
  if (v === undefined) throw new Error('missing world resource')
  return v
}

export const key = (x: number, y: number) => x + ',' + y
export const unkey = (k: string): [number, number] => {
  const i = k.indexOf(',')
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))]
}

/** Is this system of the world on? */
export const isOn = (world: World, id: SystemId) => res(world, Systems).on.has(id)

export function emit(world: World, e: FxEvent) {
  if ((e.kind === 'float' && !isOn(world, 'floats')) || (e.kind === 'sound' && !isOn(world, 'sound'))) return
  const q = res(world, Fx).q
  // headless runs never drain the queue: keep it bounded
  if (q.length < 400) q.push(e)
}
export const sound = (world: World, id: SoundId) => emit(world, { kind: 'sound', id })
export const float = (world: World, x: number, y: number, text: string, tone: 'good' | 'soft' | 'bad' | 'accent' | 'water' = 'soft') => emit(world, { kind: 'float', x, y, text, tone })
export const puff = (world: World, x: number, y: number, color: string, n = 6) => emit(world, { kind: 'puff', x, y, color, n })

// ---------------------------------------------------------------- creation

export interface WorldOptions {
  seed?: number
  /** The systems that are on (PLAY when not given). */
  systems?: readonly SystemId[]
}

/** A world with every resource and nothing in it yet: what a fresh game and a loaded one start from. */
export function emptyWorld(opts: WorldOptions = {}): World {
  const world = createWorld()
  for (const t of [Time, GameState, Field, Plant, Flock, Unlocks, Ui, Fx, Stats, Rng, Systems]) world.add(t)
  res(world, Rng).next = makeRng(opts.seed ?? 1)
  if (opts.systems) res(world, Systems).on = new Set(opts.systems)
  return world
}

/** The map of a seed laid into a world: its terrain and hills (land.ts). */
export function layMap(world: World, seed: number) {
  const f = res(world, Field),
    m = makeMap(seed)
  f.terrain = m.terrain
  f.hills = m.hills
  f.hillRects = m.hillRects
}

/**
 * A fresh game (GDD 6): the map of its seed, the portal in the middle, no coins, and the big flock already roaming —
 * some of it round the portal, the rest anywhere on open ground.
 */
export function createGameWorld(opts: WorldOptions = {}): World {
  const world = emptyWorld(opts)
  res(world, GameState).coins = START.coins
  res(world, GameState).seed = opts.seed ?? 1
  layMap(world, opts.seed ?? 1)
  addPortal(world)
  const rnd = res(world, Rng).next,
    f = res(world, Field),
    flock = res(world, Flock).sheep
  const open = (x: number, y: number) => {
    const c = key(Math.floor(x), Math.floor(y))
    return (
      x > 1 && y > 1 && x < GRID.cols - 1 && y < GRID.rows - 1 && !f.hills.has(c) && !ROAM.blocking.includes(f.terrain.get(c) as never) && !res(world, Plant).b.has(c) && !res(world, Plant).occ.has(c)
    )
  }
  const mid = PORTAL.x + PORTAL.size / 2
  for (let i = 0; i < ARRIVE.start; i++)
    for (let t = 0; t < 20; t++) {
      // the first ones in a ring round the portal, the rest anywhere
      const a = rnd() * Math.PI * 2,
        r = PORTAL.size / 2 + ARRIVE.ring[0] + rnd() * ARRIVE.ring[1]
      const [x, y] = i < ARRIVE.nearPortal ? [mid + Math.cos(a) * r, mid + Math.sin(a) * r] : [1 + rnd() * (GRID.cols - 2), 1 + rnd() * (GRID.rows - 2)]
      if (!open(x, y)) continue
      flock.push(makeSheep(world, 'plain', { x, y }))
      break
    }
  return world
}

/**
 * The portal (GDD 7): one fixed building of PORTAL.size×PORTAL.size in the middle of the map, as a dock — it takes
 * shorn sheep at its ways in on every side. Added if missing.
 */
export function addPortal(world: World) {
  const plant = res(world, Plant)
  const { x, y, size } = PORTAL
  let d = plant.b.get(key(x, y))
  if (!d) {
    d = { ...blankBuilding('dock', x, y, 3), fixed: true }
    plant.b.set(key(x, y), d)
  }
  d.w = d.h = size
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) if (dx || dy) plant.occ.set(key(x + dx, y + dy), key(x, y))
  return d
}

export function blankBuilding(type: BuildingId | 'dock', x: number, y: number, dir: Dir): Building {
  const [w, h] = type === 'dock' ? [1, 1] : dimsOf(type, dir)
  return {
    type,
    x,
    y,
    dir,
    item: null,
    buf: [],
    slot: null,
    timer: 0,
    total: 0,
    outs: [],
    w,
    h,
    count: 0,
    prog: 0,
    status: '',
    wrong: null,
    rules: type === 'splitter' ? { l: 'any', f: 'any', r: 'any' } : null,
    paid: 0,
    rr: 0,
    phase: 0,
  }
}

/** A new fluffy sheep of a kind, roaming from `at` (GDD 5): it needs its kind's stations before shearing. */
export function makeSheep(world: World, kind: KindId, at: { x: number; y: number }): SheepT {
  const gs = res(world, GameState),
    flock = res(world, Flock)
  return {
    id: ++gs.uid,
    name: SHEEP_NAMES[flock.sheep.length % SHEEP_NAMES.length]!,
    kind,
    needs: [...KINDS[kind].needs],
    wool: 1,
    state: 'roam',
    px: at.x,
    py: at.y,
    tx: at.x,
    ty: at.y,
    wanderT: 0,
    clicks: 0,
    face: 0,
  }
}

/** A sheep is ready for shearing: fluffy, with nothing left to do to it (GDD 4.3). */
export const ready = (s: SheepT) => s.wool >= 1 && s.needs.length === 0

export const newItem = (sheep: SheepT): Item => ({ kind: 'sheep', sheep, p: 0, ed: 0 })
