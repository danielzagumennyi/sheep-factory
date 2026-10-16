import { createWorld, trait, type Trait, type World } from 'koota'
import { dimsOf, MARKET, DOCK, GRID, RES, SHEEP_NAMES, missionDef, type BuildingId, type CardId, type ClientId, type Dir, type ItemId, type MissionDef, type MissionId, type OrderDef, type RecipeId, type ResId, type TerrainId } from './balance'
import { makeRng } from './rng'

export type { World }

/**
 * The simulation's state (TDD 3). As in Cubocalypse, koota holds world-level resources (`res(world, X)`); the many
 * small things — buildings, items, sheep — are plain objects inside those resources, keyed by cell, because the grid
 * is what every rule asks about ("what is on this cell", "who feeds this belt").
 */

// ---------------------------------------------------------------- data types

/** Something that rides a belt or lies in the hand. A sheep on a belt is an item that points at its sheep. */
export interface Item {
  kind: ItemId | 'sheep'
  sheep?: SheepT
  /** Progress across the current cell, 0 → 1. */
  p: number
  /** The direction it entered the cell from (drawing only). */
  ed: Dir
  strayT: number
}

export type MachineStatus = '' | 'jam' | 'full' | 'wait' | 'empty'
export type SplitRule = 'any' | 'off' | ItemId | 'sheep'
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
  /** A belt or splitter carries one item; a merger buffers a few. */
  item: Item | null
  buf: Item[]
  /** A workshop's input store, by item. */
  inv: Partial<Record<ItemId, number>>
  /** The current job: a sheep in the shearer, or a workshop's batch. */
  slot: { sheep?: SheepT; pass?: boolean } | null
  timer: number
  total: number
  /** Finished outputs waiting for room. */
  outs: { item: Item; dir: Dir }[]
  /** Outputs dropped beside a machine that has no belt, on the cell (pileX, pileY). */
  pile: Item[]
  pileX: number
  pileY: number
  /** Footprint in cells along x and y; (x, y) is its top-left cell. */
  w: number
  h: number
  /** What a workshop makes now (null for every other building). */
  recipe: RecipeId | null
  lvl: number
  count: number
  /** A producer's progress towards the next take, seconds. */
  prog: number
  status: MachineStatus
  rules: SplitRules | null
  /** Coins spent on it (refunded on removal). */
  paid: number
  client?: ClientId
  fixed?: boolean
  /** Round-robin cursor of a splitter. */
  rr: number
  /** Belt chevron phase (drawing). */
  phase: number
}

export type SheepState = 'pasture' | 'belt' | 'machine' | 'waiting' | 'held'
export interface SheepT {
  id: number
  name: string
  wool: number
  home: number
  state: SheepState
  /** Position in cells (floats). */
  px: number
  py: number
  tx: number
  ty: number
  wanderT: number
  clicks: number
  /** This fleece is paid for: the pasture took its hay and water from the stock, and it grows. */
  fed: boolean
  /** Seconds it has waited in the pasture for its hay and water: the longest wait is fed first. */
  waitT: number
  face: Dir
  waitAt: string | null
}

export interface PastureT {
  id: number
  x: number
  y: number
  w: number
  h: number
  dir: Dir
  cap: number
  grown: number
  exitT: number
  /** What its hungry sheep wait for that the stock hasn't got: shown once over the pasture. */
  want: ItemId[]
  exit: { x: number; y: number }
  /** The cell just outside where sheep come back in, and the way they move as they come in. */
  entry: { x: number; y: number; d: Dir }
  /** Its feeder and trough (keys into Plant.b), fixed 2×1 stores on its two free sides; null where the mission needs none. */
  feeder: string | null
  trough: string | null
}

export interface OrderT extends OrderDef {
  idx: number
  done: boolean
  have: number
  paid: number
  /** Items delivered after the order was done (GDD 7.3). */
  extra: number
}

export type TruckState = 'arrive' | 'in' | 'park' | 'out' | 'leave'
export interface TruckT {
  order: string
  x: number
  tx: number
  state: TruckState
  /** 0 = parking lane A, 1 = driving lane B. */
  lane: number
}

export interface ResCell {
  t: ResId
  left: number
}

/** Something for the view to show once: a number floating up, a puff, a sound. Drained every frame. */
export type FxEvent =
  | { kind: 'float'; x: number; y: number; text: string; tone: 'good' | 'soft' | 'bad' | 'accent' | 'water' }
  | { kind: 'puff'; x: number; y: number; color: string; n: number }
  | { kind: 'sound'; id: SoundId }
/** The game's sounds for now (the author's recordings): a building set down, one removed. The UI click is the HUD's own. */
export type SoundId = 'place' | 'remove'

export type Tool = 'hand' | 'erase' | BuildingId
export type Selection = { kind: 'b'; key: string } | { kind: 'plot'; px: number; py: number } | { kind: 'p'; id: number } | null

// ---------------------------------------------------------------- traits (world resources)

export const Time = trait(() => ({ t: 0, dt: 1 / 60, frame: 0, alpha: 0 }))

export const GameState = trait(() => ({
  mission: 'm1' as MissionId,
  /** Seconds of mission time (stars count from it). */
  clock: 0,
  coins: 0,
  /** 0 = pause; 1, 2, 4 = speed. */
  speed: 1,
  finished: false,
  stars: 0,
  finishT: 0,
  /** A short beat between the last batch and the result screen. */
  resultT: 0,
  showResult: false,
  /** While true, deliveries don't float their own numbers (a hand delivery floats one total). */
  quiet: false,
  strayT: 0,
  strayAt: '',
  landT: 0,
  plotsBought: 0,
  uid: 0,
  /** Counts failed purchases; the HUD shakes the coin counter when it changes. */
  noMoney: 0,
  /** Bumped when the hand tries to work the field on pause: the pause line nudges. */
  pauseNudge: 0,
  /** Bumped when terrain or plots change, so the 3D field rebuilds only then. */
  fieldVersion: 0,
  /** Bumped whenever a building is set down, taken off or turned: cached routes and views go stale on it. */
  plantVersion: 0,
}))

export const Mission = trait(() => ({ def: missionDef('m1') as MissionDef }))

export const Field = trait(() => ({
  terrain: new Map<string, TerrainId>(),
  res: new Map<string, ResCell>(),
  plots: new Set<string>(),
  /** Plots that held anything at the start: for sale even once picked bare by hand (an empty one never is). */
  forSale: new Set<string>(),
}))

/** Buildings by their top-left cell; `occ` maps every other cell a 2×2 building covers to that cell. */
export const Plant = trait(() => ({ b: new Map<string, Building>(), occ: new Map<string, string>() }))

export const Flock = trait(() => ({ sheep: [] as SheepT[], pastures: [] as PastureT[] }))

export const Market = trait(() => ({ orders: [] as OrderT[], trucks: [] as TruckT[] }))

/**
 * The barn's stock, which is the hand too (the author: «этот склад и рука одно и тоже»): what the player gathers,
 * shears and picks up, and what belts bring into a barn, all counts here with no limit. The sheep eat and drink from
 * it, docks are loaded and the market trades from it.
 */
export const Stock = trait(() => ({ n: {} as Partial<Record<ItemId, number>> }))

export const Unlocks = trait(() => ({
  unlocked: new Set<BuildingId>(),
  /** Recipes the workshop knows in this mission. */
  recipes: new Set<RecipeId>(),
  /** Tools that glow on the hotbar until first picked. */
  fresh: new Set<BuildingId>(),
  /** «Новое» cards waiting to be shown; the game pauses while one is up. */
  cardQ: [] as CardId[],
  seen: new Set<CardId>(),
  events: new Set<string>(),
  /** Once-per-game cards the player has already seen (filled from the app's saved state). */
  seenEver: new Set<CardId>(),
  /** Once-per-game cards shown in this run, for the app to save. */
  shownEver: [] as CardId[],
}))

/** What the pointer is doing: tool, rotation, selection, belt start, hover cell, dragged sheep. */
export const Ui = trait(() => ({
  tool: 'hand' as Tool,
  rot: 0 as Dir,
  /** The recipe a newly placed workshop starts with: the last one picked, or the newest learnt. */
  recipe: 'cyarn' as RecipeId,
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

export function emit(world: World, e: FxEvent) {
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
  /** Once-per-game cards already seen in earlier runs. */
  seenEver?: Iterable<CardId>
}

/** A fresh world for one mission: terrain, plots, the pasture with its flock, docks with their trucks, opening cards. */
export function createGameWorld(id: MissionId = 'm1', opts: WorldOptions = {}): World {
  const world = createWorld()
  for (const t of [Time, GameState, Mission, Field, Plant, Flock, Market, Stock, Unlocks, Ui, Fx, Stats, Rng]) world.add(t)
  const def = missionDef(id)
  res(world, Mission).def = def
  res(world, Rng).next = makeRng(opts.seed ?? 1)
  const gs = res(world, GameState)
  gs.mission = def.id
  gs.coins = def.coins
  const un = res(world, Unlocks)
  for (const b of def.start) un.unlocked.add(b)
  for (const r of def.recipes) un.recipes.add(r)
  res(world, Ui).recipe = def.recipes[def.recipes.length - 1] ?? 'cyarn'
  for (const c of opts.seenEver ?? []) un.seenEver.add(c)
  const f = res(world, Field)
  for (const [px, py] of def.plots) f.plots.add(key(px, py))
  for (const [t, cells] of Object.entries(def.terrain) as [TerrainId, readonly (readonly [number, number])[]][])
    for (const [x, y] of cells) {
      f.terrain.set(key(x, y), t)
      if (t === 'meadow' || t === 'water' || t === 'bush') f.res.set(key(x, y), { t, left: RES[t].max })
    }
  for (const k of f.res.keys()) {
    const [x, y] = unkey(k)
    f.forSale.add(key(Math.floor(x / GRID.plotW), Math.floor(y / GRID.plotH)))
  }
  const flock = res(world, Flock)
  const plant = res(world, Plant)
  def.pastures.forEach((q, i) => {
    const p: PastureT = { id: i, x: q.x, y: q.y, w: q.w, h: q.h, dir: q.dir, cap: q.w * q.h, grown: 0, exitT: 0, want: [], exit: exitOf(q), entry: entryOf(q), feeder: null, trough: null }
    flock.pastures.push(p)
    // its trough on the side right of the exit, its feeder on the back side — where the mission feeds and waters
    if (def.needs.water) p.trough = key(...standBy(world, 'trough', p, ((p.dir + 1) % 4) as Dir))
    if (def.needs.food) p.feeder = key(...standBy(world, 'feeder', p, ((p.dir + 2) % 4) as Dir))
  })
  for (let i = 0; i < def.sheep; i++) flock.sheep.push(makeSheep(world, 0, true))
  Object.assign(res(world, Stock).n, def.stock ?? {})
  // docks are 2×1 on the dock row; the market is a 2×2 stall reaching up into the row above
  for (const [client, x] of def.docks) {
    const m = client === 'market',
      y = m ? GRID.roadY - MARKET.h + 1 : GRID.roadY
    const d: Building = { ...blankBuilding('dock', x, y, 3), client, fixed: true, ...(m ? { w: MARKET.w, h: MARKET.h } : {}) }
    plant.b.set(key(x, y), d)
    for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) if (dx || dy) plant.occ.set(key(x + dx, y + dy), key(x, y))
  }
  const market = res(world, Market)
  def.orders.forEach((o, i) => {
    const q: OrderT = { ...o, idx: i, done: false, have: 0, paid: 0, extra: 0 }
    market.orders.push(q)
    market.trucks.push({ order: q.id, x: -2 - market.trucks.length * 2, tx: dockXOf(def, o.dock) + (DOCK.w - 1) / 2, state: 'arrive', lane: 1 })
  })
  return world
}

function dockXOf(def: MissionDef, client: ClientId) {
  return def.docks.find(([c]) => c === client)?.[1] ?? 0
}

/** The cell just outside the pasture where its sheep leave (the middle of the side it faces). */
export function exitOf(p: { x: number; y: number; w: number; h: number; dir: Dir }) {
  const mx = p.x + Math.floor((p.w - 1) / 2),
    my = p.y + Math.floor((p.h - 1) / 2)
  return p.dir === 0 ? { x: p.x + p.w, y: my } : p.dir === 1 ? { x: mx, y: p.y + p.h } : p.dir === 2 ? { x: p.x - 1, y: my } : { x: mx, y: p.y - 1 }
}

/**
 * The cell just outside the pasture where sheep come back in (the author: «у загона нет понятного входа и выхода»): the
 * middle of the side a quarter turn left of the exit — so the loop from the shearer on the exit comes round and down
 * in — and the way they move as they come in.
 */
export function entryOf(p: { x: number; y: number; w: number; h: number; dir: Dir }) {
  const side = ((p.dir + 3) % 4) as Dir
  const e = exitOf({ ...p, dir: side })
  return { ...e, d: ((side + 2) % 4) as Dir }
}

/**
 * Where a pasture's 2×1 store stands on side `s`: the last two cells along that side, just outside the fence, turned to
 * face the pasture, so its way in is from the open side away from the pen.
 */
export function storeSpot(p: { x: number; y: number; w: number; h: number }, s: Dir): { x: number; y: number; dir: Dir } {
  const along = s === 0 || s === 2 ? p.h : p.w,
    i = along - 2
  if (s === 0) return { x: p.x + p.w, y: p.y + i, dir: 2 }
  if (s === 2) return { x: p.x - 1, y: p.y + i, dir: 0 }
  if (s === 1) return { x: p.x + i, y: p.y + p.h, dir: 3 }
  return { x: p.x + i, y: p.y - 1, dir: 1 }
}
/** Set a fixed store (a feeder or a trough) down by a pasture's side `s`; its top-left cell. */
function standBy(world: World, type: 'feeder' | 'trough', p: PastureT, s: Dir): [number, number] {
  const at = storeSpot(p, s)
  const b: Building = { ...blankBuilding(type, at.x, at.y, at.dir), fixed: true }
  const plant = res(world, Plant)
  plant.b.set(key(b.x, b.y), b)
  for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) if (dx || dy) plant.occ.set(key(b.x + dx, b.y + dy), key(b.x, b.y))
  return [at.x, at.y]
}

export function blankBuilding(type: BuildingId | 'dock', x: number, y: number, dir: Dir): Building {
  const [w, h] = type === 'dock' ? [DOCK.w, DOCK.h] : dimsOf(type, dir)
  return { type, x, y, dir, item: null, buf: [], inv: {}, slot: null, timer: 0, total: 0, outs: [], pile: [], pileX: x, pileY: y, w, h, recipe: null, lvl: 1, count: 0, prog: 0, status: '', rules: type === 'splitter' ? { l: 'any', f: 'any', r: 'any' } : null, paid: 0, rr: 0, phase: 0 }
}

/** A random spot inside a pasture where a sheep may stand (clear of the fence). */
export function pastureSpot(world: World, p: PastureT) {
  const rnd = res(world, Rng).next
  return { x: p.x + 0.35 + rnd() * (p.w - 0.7), y: p.y + 0.4 + rnd() * (p.h - 1.15) }
}

export function makeSheep(world: World, home: number, start = false): SheepT {
  const gs = res(world, GameState),
    flock = res(world, Flock),
    rnd = res(world, Rng).next
  const p = flock.pastures[home]!
  const at = pastureSpot(world, p)
  return {
    id: ++gs.uid,
    name: SHEEP_NAMES[flock.sheep.length % SHEEP_NAMES.length]!,
    wool: start ? 0.4 + rnd() * 0.6 : 0,
    home,
    state: 'pasture',
    px: at.x,
    py: at.y,
    tx: at.x,
    ty: at.y,
    wanderT: 0,
    clicks: 0,
    // the flock a mission starts with has its first fleece paid for, so wool comes from the first minute
    fed: start,
    waitT: 0,
    face: 0,
    waitAt: null,
  }
}

/** Stock helpers: how many there are, add some, take up to n (returns how many were taken). */
export const stockOf = (world: World, k: ItemId) => res(world, Stock).n[k] ?? 0
export function stockAdd(world: World, k: ItemId, n = 1) {
  const s = res(world, Stock).n
  s[k] = (s[k] ?? 0) + n
}
export function stockTake(world: World, k: ItemId, n: number) {
  const s = res(world, Stock).n,
    got = Math.max(0, Math.min(n, s[k] ?? 0))
  if (got) s[k] = (s[k] ?? 0) - got
  return got
}
/** A good (not a sheep) into the stock. */
export function toStock(world: World, it: Item) {
  if (it.kind !== 'sheep') stockAdd(world, it.kind)
}
export const newItem = (kind: ItemId | 'sheep', sheep?: SheepT): Item => ({ kind, sheep, p: 0, ed: 0, strayT: 0 })
