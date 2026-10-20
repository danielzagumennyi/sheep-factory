import { createWorld, trait, type Trait, type World } from 'koota'
import { dimsOf, GRID, ISLAND_START, MAP_TERRAIN, MARKET, PEN, RES, ROAM, SHEEP, SHEEP_NAMES, START, type BuildingId, type CardId, type ClientId, type Dir, type ItemId, type ResId, type TerrainId } from './balance'
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
  /** A machine's input store, by item (a station's good, a seeder's seeds). */
  inv: Partial<Record<ItemId, number>>
  /** The sheep in a station, and whether it only passes through. */
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
  /** What a seeder sows (null for every other building). */
  seed: ResId | null
  count: number
  /** A producer's (or a seeder's) progress towards the next take, seconds. */
  prog: number
  status: MachineStatus
  rules: SplitRules | null
  /** Coins spent on it (refunded on removal). */
  paid: number
  /** For the market's parts (type `dock`): its row beside the field, one of its stalls, or the trading post. */
  part?: MarketPart
  fixed?: boolean
  /** Round-robin cursor of a splitter. */
  rr: number
  /** Belt chevron phase (drawing). */
  phase: number
}

/** `transit`: crossing a pen that is not its own, from its way in to its way out, on the way home round a shared loop. */
/** In its pen, on a belt, in a station, roaming the own land (GDD 5), in the hand, crossing another pen on its way home. */
export type SheepState = 'pasture' | 'belt' | 'machine' | 'roam' | 'held' | 'transit'
export interface SheepT {
  id: number
  name: string
  wool: number
  /** The pen it lives in (its id; 0 for one that never had one). A sheep roaming out of its pen keeps its place there. */
  home: number
  /** The pen it is crossing on its way home (state `transit`), or null. */
  via: number | null
  state: SheepState
  /** Position in cells (floats). */
  px: number
  py: number
  tx: number
  ty: number
  wanderT: number
  clicks: number
  /** It has eaten (at a feeder, or from the hand): its next fleece grows. */
  fed: boolean
  /** What its fleece went through in the salon since it was last shorn: what shearing it gives (SHEAR_YIELD). */
  marks: SheepMarks
  face: Dir
  /** Seconds left of its arrival (DROP): a bought sheep floats down on a parachute, then lands. Absent once it is here. */
  drop?: number
}

/** The salon's marks on a fleece: combed, curled, knitted into a sweater, felted in the bath, coloured. */
export interface SheepMarks {
  comb: boolean
  curl: boolean
  knit: boolean
  bath: boolean
  dye: boolean
}
export const noMarks = (): SheepMarks => ({ comb: false, curl: false, knit: false, bath: false, dye: false })

/** A pen (GDD 5): a 3×3 building of its own, with a way out and a way in, for PEN.cap sheep. */
export interface PastureT {
  id: number
  x: number
  y: number
  w: number
  h: number
  dir: Dir
  cap: number
  exitT: number
  exit: { x: number; y: number }
  /** The cell just outside where sheep come back in, and the way they move as they come in. */
  entry: { x: number; y: number; d: Dir }
  paid: number
}

/** The market's parts: the row beside the field that takes goods in, a stall where a truck is loaded, the trading post. */
export type MarketPart = 'row' | 'stall' | 'buy'

/** A client's ask (GDD 7): this many of a good. It pays the good's price for each one as it comes. */
export interface AskT {
  id: number
  client: ClientId
  kind: ItemId
  total: number
  have: number
  /** The stall its truck parks at (an index of MARKET.stalls). */
  stall: number
}

export type TruckState = 'arrive' | 'in' | 'park' | 'out' | 'leave'
export interface TruckT {
  ask: number
  x: number
  tx: number
  state: TruckState
  /** 0 = parking lane A, 1 = driving lane B. */
  lane: number
  /** Parked: towards the next good it takes from the stock (MARKET.loadRate a second). */
  load?: number
}

export interface ResCell {
  t: ResId
  left: number
  /** What it held when it was new: a wild cell more, a sown one less (SOW). */
  max: number
}

/** Something for the view to show once: a number floating up, a puff, a sound. Drained every frame. */
export type FxEvent =
  | { kind: 'float'; x: number; y: number; text: string; tone: 'good' | 'soft' | 'bad' | 'accent' | 'water' }
  | { kind: 'puff'; x: number; y: number; color: string; n: number }
  | { kind: 'sound'; id: SoundId }
  /** A good handed to the market's row at column x: it rides the chute to a stall, then into the truck there or into the stall's store. */
  | { kind: 'deliver'; x: number; good: ItemId; stall: number; truck: boolean }
  /** A good taken from the stock into the truck at a stall. */
  | { kind: 'load'; stall: number; good: ItemId }
/** The game's sounds for now (the author's recordings): a building set down, one removed. The UI click is the HUD's own. */
export type SoundId = 'place' | 'remove'

export type Tool = 'hand' | 'erase' | BuildingId
export type Selection = { kind: 'b'; key: string } | { kind: 'plot'; px: number; py: number } | { kind: 'p'; id: number } | null

// ---------------------------------------------------------------- traits (world resources)

export const Time = trait(() => ({ t: 0, dt: 1 / 60, frame: 0, alpha: 0 }))

export const GameState = trait(() => ({
  /** Seconds of game time. */
  clock: 0,
  coins: 0,
  /** 0 = pause; 1, 2, 4 = speed. */
  speed: 1,
  /** The village level open now, from 0 (LEVELS[level], or past the table). */
  level: 0,
  /** The first chapter's last level is done (its card shown once). */
  chapterDone: false,
  /** The endless mode: everything open from the start, no chapter (village.ts `openEverything`). */
  endless: false,
  /** Sheep need food (from the feeder's level on): until then a shorn sheep grows its fleece by itself. */
  food: false,
  /** Trade is open (from its level on): the market's trading post buys from the stock and sells into it. */
  trade: false,
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

export const Field = trait(() => ({
  terrain: new Map<string, TerrainId>(),
  res: new Map<string, ResCell>(),
  /** Seeds growing: what they will be and the seconds left (GDD 6.1). */
  sprouts: new Map<string, { t: ResId; left: number }>(),
  plots: new Set<string>(),
  /** Plots that held anything at the start: for sale (an empty one never is). */
  forSale: new Set<string>(),
  /** The island's first row and the column past its east edge: the rest is under the sky until it rises (ISLAND_GROW). */
  top: ISLAND_START.top as number,
  right: ISLAND_START.right as number,
}))

/** Buildings by their top-left cell; `occ` maps every other cell a 2×2 building covers to that cell. */
export const Plant = trait(() => ({ b: new Map<string, Building>(), occ: new Map<string, string>() }))

export const Flock = trait(() => ({ sheep: [] as SheepT[], pastures: [] as PastureT[], penUid: 0 }))

export const Market = trait(() => ({ asks: [] as AskT[], trucks: [] as TruckT[], askUid: 0 }))

/**
 * The stock, which is the hand too (the author: «этот склад и рука одно и тоже»): what the player gathers, shears and
 * picks up counts here with no limit. Docks are loaded and the market trades from it, the hand feeds sheep and sows
 * from it; machines take only from belts (docs/05-REWORK.md).
 */
export const Stock = trait(() => ({ n: {} as Partial<Record<ItemId, number>> }))

export const Unlocks = trait(() => ({
  unlocked: new Set<BuildingId>(),
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
  /** What the hand sows, and what a new seeder starts with. */
  seed: 'meadow' as ResId,
  sel: null as Selection,
  pending: null as { x: number; y: number } | null,
  /** The cell and ground point under the pointer, and the sheep or building it is over (picked by its model, the nearest one). */
  hover: null as { x: number; y: number; wx: number; wy: number; sheep: number | null; b: string | null } | null,
  drag: null as SheepT | null,
  /** A building picked up to move (its menu, a right click), and where it stood: it goes back there if the move is called off. */
  moving: null as { b: Building; x: number; y: number; dir: Dir } | null,
}))

export const Fx = trait(() => ({ q: [] as FxEvent[] }))

export const Stats = trait(() => ({ earned: 0, spent: 0, handShear: 0, handSow: 0 }))

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
  'trucks', // trucks drive to their docks and away
  'sheep', // sheep walk their loops, eat, grow their wool
  'sprouts', // sown cells grow
  'hints', // the land hint: its card when the owned land runs low
  'belts', // goods ride the belts
  'machines', // machines and stations work
  // what the farm tells the player
  'village', // asks are counted, a done level opens the next with its cards, the island grows
  'floats', // numbers float up from the field
  'sound',
  // the player's hands and what shows them
  'keys', // the keyboard on the field: tools, rotate, erase, pause, the camera
  'pointer', // the mouse and touchpad on the field: the hand, building, the camera
  'ghost', // what is in hand: its preview, the cell grid, the reach
  'hover', // the outline and the label under the pointer
  'tags', // labels on the field: plots' prices, docks' signs, trucks' and pens' counts, the signs over machines and sheep
  'portIcons', // beside every way in and out, while building or pointing at it: what goes through it
  'hud', // the screen's panels, fed a few times a second
  'fps', // the frame rate panel
  'orbit', // the camera turning slowly round the farm by itself
] as const
export type SystemId = (typeof SYSTEMS)[number]
/** The game as played: everything but the camera's own turning. */
export const PLAY: readonly SystemId[] = SYSTEMS.filter((s) => s !== 'orbit')
/**
 * The main menu's farm (the author: «в демо на главном меню должно быть только визуально»): the farm works and the
 * camera turns round it; no hands, no grid, no numbers, no sound, no levels.
 */
export const DEMO: readonly SystemId[] = ['trucks', 'sheep', 'sprouts', 'belts', 'machines', 'orbit']
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
  /** Once-per-game cards already seen in earlier runs. */
  seenEver?: Iterable<CardId>
  /** The systems that are on (PLAY when not given). */
  systems?: readonly SystemId[]
}

/** A world with every resource and nothing in it yet: what a fresh game and a loaded one start from. */
export function emptyWorld(opts: WorldOptions = {}): World {
  const world = createWorld()
  for (const t of [Time, GameState, Field, Plant, Flock, Market, Stock, Unlocks, Ui, Fx, Stats, Rng, Systems]) world.add(t)
  res(world, Rng).next = makeRng(opts.seed ?? 1)
  if (opts.systems) res(world, Systems).on = new Set(opts.systems)
  const un = res(world, Unlocks)
  for (const c of opts.seenEver ?? []) un.seenEver.add(c)
  return world
}

/**
 * A fresh long game (docs/05-REWORK.md): the map's terrain, the four central plots, the fluffy sheep roaming them (no
 * pen yet: the author, 19.10.2026), the market. The village's first level (asks, cards) is opened by `startWorld`.
 */
export function createGameWorld(opts: WorldOptions = {}): World {
  const world = emptyWorld(opts)
  res(world, GameState).coins = START.coins
  const f = res(world, Field)
  for (const [px, py] of START.plots) f.plots.add(key(px, py))
  for (const [t, cells] of Object.entries(MAP_TERRAIN) as [TerrainId, readonly (readonly [number, number])[]][])
    for (const [x, y] of cells) {
      f.terrain.set(key(x, y), t)
      if (t === 'meadow' || t === 'bush') f.res.set(key(x, y), { t, left: RES[t].max, max: RES[t].max })
    }
  for (const k of f.res.keys()) {
    const [x, y] = unkey(k)
    f.forSale.add(key(Math.floor(x / GRID.plotW), Math.floor(y / GRID.plotH)))
  }
  addMarket(world)
  const rnd = res(world, Rng).next
  // each on open grass: not in the bushes or among the stones round where the first pen will stand
  const open = (p: { x: number; y: number }) => !ROAM.blocking.includes(f.terrain.get(key(Math.floor(p.x), Math.floor(p.y))) as never)
  for (let i = 0; i < START.sheep; i++) {
    let at = { x: START.pen.x + 0.5 + rnd() * 3, y: START.pen.y + 0.5 + rnd() * 3 }
    for (let k = 0; k < 8 && !open(at); k++) at = { x: START.pen.x + 0.5 + rnd() * 3, y: START.pen.y + 0.5 + rnd() * 2.4 }
    res(world, Flock).sheep.push(makeSheep(world, 0, true, at))
  }
  return world
}

/**
 * The market (TDD 3.4.1, GDD 7), as docks: the row beside the field, as wide as the island (it grows with it), taking
 * goods from every cell a belt brings them to; past it four stalls, and the trading post once trade is open. None of
 * them takes a cell of the field. Kept as they are, added where missing.
 */
export function addMarket(world: World) {
  const plant = res(world, Plant),
    right = res(world, Field).right
  const part = (p: MarketPart, x: number, y: number, w: number, h: number) => {
    let d = plant.b.get(key(x, y))
    if (!d) {
      d = { ...blankBuilding('dock', x, y, 3), part: p, fixed: true }
      plant.b.set(key(x, y), d)
    }
    d.w = w
    d.h = h
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (dx || dy) plant.occ.set(key(x + dx, y + dy), key(x, y))
    return d
  }
  const row = part('row', 0, MARKET.row, right, 1)
  for (const x of MARKET.stalls) part('stall', x, MARKET.row + 1, MARKET.stallW, MARKET.rows)
  if (res(world, GameState).trade) part('buy', MARKET.buyX, MARKET.row + 1, MARKET.buyW, MARKET.rows)
  return row
}

/** A pen standing at (x, y), facing `dir` (its way out): not yet on the field. */
export function makePen(world: World, x: number, y: number, dir: Dir, paid = 0): PastureT {
  const [w, h] = dimsOf('pen', dir)
  const q = { x, y, w, h, dir }
  return { id: ++res(world, Flock).penUid, ...q, cap: PEN.cap, exitT: 0, exit: exitOf(q), entry: entryOf(q), paid }
}
/** A pen by its id. */
export const penOf = (world: World, id: number) => res(world, Flock).pastures.find((p) => p.id === id) ?? null

/** The cell just outside the pen where its sheep leave (the middle of the side it faces). */
export function exitOf(p: { x: number; y: number; w: number; h: number; dir: Dir }) {
  const mx = p.x + Math.floor((p.w - 1) / 2),
    my = p.y + Math.floor((p.h - 1) / 2)
  return p.dir === 0 ? { x: p.x + p.w, y: my } : p.dir === 1 ? { x: mx, y: p.y + p.h } : p.dir === 2 ? { x: p.x - 1, y: my } : { x: mx, y: p.y - 1 }
}

/**
 * The cell just outside the pen where sheep come back in (the author: «у загона нет понятного входа и выхода»): the
 * middle of the side a quarter turn left of the exit — so a loop from the exit comes round and down in — and the way
 * they move as they come in.
 */
export function entryOf(p: { x: number; y: number; w: number; h: number; dir: Dir }) {
  const side = ((p.dir + 3) % 4) as Dir
  const e = exitOf({ ...p, dir: side })
  return { ...e, d: ((side + 2) % 4) as Dir }
}

export function blankBuilding(type: BuildingId | 'dock', x: number, y: number, dir: Dir): Building {
  const [w, h] = type === 'dock' ? [1, 1] : dimsOf(type, dir)
  return { type, x, y, dir, item: null, buf: [], inv: {}, slot: null, timer: 0, total: 0, outs: [], pile: [], pileX: x, pileY: y, w, h, seed: null, count: 0, prog: 0, status: '', rules: type === 'splitter' ? { l: 'any', f: 'any', r: 'any' } : null, paid: 0, rr: 0, phase: 0 }
}

/**
 * A spot inside a pen where a sheep may stand (clear of the fence), away from the others there: the best of
 * `SHEEP.spotTries` random spots, the furthest from where its pen-mates stand and are going, taken at once when it is
 * `SHEEP.apart` from all of them (the round sheep are big: put anywhere, they stood inside one another).
 */
export function pastureSpot(world: World, p: PastureT, self?: SheepT) {
  const rnd = res(world, Rng).next
  const mates = res(world, Flock).sheep.filter((s) => s.home === p.id && s.state === 'pasture' && s !== self)
  let best = { x: 0, y: 0 },
    far = -1
  for (let i = 0; i < SHEEP.spotTries; i++) {
    const c = { x: p.x + 0.35 + rnd() * (p.w - 0.7), y: p.y + 0.4 + rnd() * (p.h - 0.9) }
    let d = Infinity
    for (const m of mates) d = Math.min(d, Math.hypot(m.px - c.x, m.py - c.y), Math.hypot(m.tx - c.x, m.ty - c.y))
    if (d > far) {
      best = c
      far = d
    }
    if (d >= SHEEP.apart) break
  }
  return best
}

/**
 * A new sheep in pen `home`: fluffy (the flock a game starts with, a bought one) or shorn; hungry only once sheep need
 * food. With no pen (`home` 0) it roams from `at`.
 */
export function makeSheep(world: World, home: number, fluffy = true, at0?: { x: number; y: number }): SheepT {
  const gs = res(world, GameState),
    flock = res(world, Flock)
  const p = penOf(world, home)
  const at = p ? pastureSpot(world, p) : (at0 ?? { x: START.pen.x + 1.5, y: START.pen.y + 1.5 })
  return {
    id: ++gs.uid,
    name: SHEEP_NAMES[flock.sheep.length % SHEEP_NAMES.length]!,
    wool: fluffy ? 1 : 0,
    home,
    via: null,
    state: p ? 'pasture' : 'roam',
    px: at.x,
    py: at.y,
    tx: at.x,
    ty: at.y,
    wanderT: 0,
    clicks: 0,
    // before food comes into the game every sheep counts as fed, so its fleece grows by itself
    fed: !gs.food,
    marks: noMarks(),
    face: 0,
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
