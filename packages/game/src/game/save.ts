import { BUILDINGS, RECIPES, dimsOf, type BuildingId, type CardId, type ItemId, type Job, type RecipeId, type ResId, type TerrainId } from './balance'
import { sendHome } from './systems/sheep'
import {
  Field,
  Flock,
  GameState,
  Market,
  Plant,
  Rng,
  Stats,
  Stock,
  Time,
  Ui,
  Unlocks,
  emptyWorld,
  key,
  res,
  type AskT,
  type Building,
  type Item,
  type PastureT,
  type ResCell,
  type SheepT,
  type TruckT,
  type World,
  type WorldOptions,
} from './world'

/**
 * The long game saved and loaded whole (TDD 3.5): every resource of the world that the game needs to go on, as plain
 * JSON. A loaded world goes on exactly as the saved one would have — the generator's state is in it too. Pure: where
 * the save is kept is the app's business (app/saves.ts).
 *
 * What is not saved: the effects queue, the pointer's state (a building held to move goes back where it stood, a sheep
 * in the hand walks home), which systems are on, and the once-per-game cards (the app keeps those).
 */

/** The format's version. When the shape changes it goes up by one, and MIGRATE gets the step from the one before. */
export const SAVE_VERSION = 1
/** Steps from each older version to the next: `MIGRATE[n]` turns a version-n save into a version n+1 one. */
const MIGRATE: Readonly<Record<number, (g: unknown) => unknown>> = {}

/** A good as saved: the sheep it carries by its id. */
type ItemSave = Omit<Item, 'sheep'> & { sheep?: number }
/** A building as saved: its goods as ItemSave, the sheep in its slot by id, its job by what it makes. */
type BuildingSave = Omit<Building, 'item' | 'buf' | 'outs' | 'pile' | 'slot'> & {
  item: ItemSave | null
  buf: ItemSave[]
  outs: { item: ItemSave; dir: Building['dir'] }[]
  pile: ItemSave[]
  slot: { sheep?: number; pass?: boolean; job?: ItemId } | null
}

export interface GameSave {
  time: { t: number; frame: number }
  gs: ReturnType<typeof res<typeof GameState>>
  field: {
    terrain: [string, TerrainId][]
    res: [string, ResCell][]
    sprouts: [string, { t: ResId; left: number }][]
    plots: string[]
    forSale: string[]
    top: number
    right: number
  }
  plant: BuildingSave[]
  flock: { sheep: SheepT[]; pastures: PastureT[]; penUid: number }
  market: { asks: AskT[]; trucks: TruckT[]; askUid: number }
  stock: Partial<Record<ItemId, number>>
  unlocks: { unlocked: BuildingId[]; recipes: RecipeId[]; fresh: BuildingId[]; cardQ: CardId[]; seen: CardId[]; events: string[]; shownEver: CardId[] }
  /** The player's last picks: the recipe a new workshop starts with, what the hand sows. */
  ui: { recipe: RecipeId; seed: ResId }
  stats: ReturnType<typeof res<typeof Stats>>
  rng: number
}
export interface SaveData {
  v: number
  /** When it was written (ms since 1970). */
  at: number
  game: GameSave
}

/** What a save says about itself, for the main menu: the village level and the game time. */
export interface SaveInfo {
  level: number
  clock: number
}

// ---------------------------------------------------------------- saving

const itemOut = (it: Item): ItemSave => {
  const { sheep, ...rest } = it
  return sheep ? { ...rest, sheep: sheep.id } : { ...rest }
}
function buildingOut(b: Building): BuildingSave {
  return {
    ...b,
    item: b.item && itemOut(b.item),
    buf: b.buf.map(itemOut),
    outs: b.outs.map((o) => ({ item: itemOut(o.item), dir: o.dir })),
    pile: b.pile.map(itemOut),
    rules: b.rules && { ...b.rules },
    inv: { ...b.inv },
    slot: b.slot && {
      ...(b.slot.pass !== undefined ? { pass: b.slot.pass } : {}),
      ...(b.slot.sheep ? { sheep: b.slot.sheep.id } : {}),
      ...(b.slot.job ? { job: b.slot.job.out } : {}),
    },
  }
}

/** The world as a save. Nothing in the world changes. */
export function saveGame(w: World): SaveData {
  const f = res(w, Field),
    flock = res(w, Flock),
    market = res(w, Market),
    un = res(w, Unlocks),
    ui = res(w, Ui),
    time = res(w, Time)
  const plant = [...res(w, Plant).b.values()].map(buildingOut)
  // a building held to move is saved where it stood
  const m = ui.moving
  if (m) {
    const [bw, bh] = dimsOf(m.b.type as BuildingId, m.dir)
    plant.push({ ...buildingOut(m.b), x: m.x, y: m.y, dir: m.dir, w: bw, h: bh })
  }
  const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
  return {
    v: SAVE_VERSION,
    at: Date.now(),
    game: {
      time: { t: time.t, frame: time.frame },
      gs: { ...res(w, GameState) },
      field: {
        terrain: [...f.terrain],
        res: [...f.res].map(([k, r]) => [k, { ...r }]),
        sprouts: [...f.sprouts].map(([k, s]) => [k, { ...s }]),
        plots: [...f.plots],
        forSale: [...f.forSale],
        top: f.top,
        right: f.right,
      },
      plant,
      flock: { sheep: copy(flock.sheep), pastures: copy(flock.pastures), penUid: flock.penUid },
      market: { asks: copy(market.asks), trucks: copy(market.trucks), askUid: market.askUid },
      stock: { ...res(w, Stock).n },
      unlocks: { unlocked: [...un.unlocked], recipes: [...un.recipes], fresh: [...un.fresh], cardQ: [...un.cardQ], seen: [...un.seen], events: [...un.events], shownEver: [...un.shownEver] },
      ui: { recipe: ui.recipe, seed: ui.seed },
      stats: { ...res(w, Stats) },
      rng: res(w, Rng).next.state,
    },
  }
}

// ---------------------------------------------------------------- loading

/** Every job a machine can be busy with, by what it makes (each good is made by one job). */
const JOB_BY_OUT: ReadonlyMap<ItemId, Job> = new Map([...Object.values(BUILDINGS).flatMap((d) => d.jobs ?? []), ...Object.values(RECIPES)].map((j) => [j.out, j]))

/** A save brought up to this version, or null when it is no save of ours (or one newer than this build). */
function upgrade(data: unknown): GameSave | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Partial<SaveData>
  if (typeof d.v !== 'number' || d.v > SAVE_VERSION || !d.game) return null
  let game: unknown = d.game
  for (let v = d.v; v < SAVE_VERSION; v++) {
    const step = MIGRATE[v]
    if (!step) return null
    game = step(game)
  }
  return game as GameSave
}

/** What the save says about itself, or null when it can't be loaded. */
export function saveInfo(data: unknown): SaveInfo | null {
  const g = upgrade(data)
  return g && typeof g.gs?.level === 'number' ? { level: g.gs.level, clock: g.gs.clock } : null
}

/**
 * The world a save holds, going on from where it was saved; null when the save is broken, of another game or of a
 * newer build. `opts` are as for a new world (the systems that are on, the once-per-game cards seen).
 */
export function loadGame(data: unknown, opts: WorldOptions = {}): World | null {
  const g = upgrade(data)
  if (!g) return null
  const w = emptyWorld(opts)
  try {
    fill(w, g)
    return w
  } catch {
    w.destroy()
    return null
  }
}

function fill(w: World, g: GameSave) {
  Object.assign(res(w, Time), { t: g.time.t, frame: g.time.frame })
  const gs = res(w, GameState)
  Object.assign(gs, g.gs, { quiet: false })
  // a game saved on pause (the menu pauses it) comes back running
  if (!gs.speed) gs.speed = 1
  const f = res(w, Field)
  f.terrain = new Map(g.field.terrain)
  f.res = new Map(g.field.res)
  f.sprouts = new Map(g.field.sprouts)
  f.plots = new Set(g.field.plots)
  f.forSale = new Set(g.field.forSale)
  f.top = g.field.top
  f.right = g.field.right
  const flock = res(w, Flock)
  flock.sheep = g.flock.sheep
  flock.pastures = g.flock.pastures
  flock.penUid = g.flock.penUid
  // goods and slots point at sheep by id
  const byId = new Map(flock.sheep.map((s) => [s.id, s]))
  const sheepOf = (id: number) => {
    const s = byId.get(id)
    if (!s) throw new Error('save: a sheep that is not in the flock')
    return s
  }
  const itemIn = ({ sheep, ...rest }: ItemSave): Item => (sheep === undefined ? { ...rest } : { ...rest, sheep: sheepOf(sheep) })
  const slotIn = (sl: NonNullable<BuildingSave['slot']>): Building['slot'] => {
    const out: NonNullable<Building['slot']> = {}
    if (sl.pass !== undefined) out.pass = sl.pass
    if (sl.sheep !== undefined) out.sheep = sheepOf(sl.sheep)
    if (sl.job) out.job = JOB_BY_OUT.get(sl.job)
    return out
  }
  const plant = res(w, Plant)
  for (const bs of g.plant) {
    const b: Building = {
      ...bs,
      item: bs.item && itemIn(bs.item),
      buf: bs.buf.map(itemIn),
      outs: bs.outs.map((o) => ({ item: itemIn(o.item), dir: o.dir })),
      pile: bs.pile.map(itemIn),
      slot: bs.slot && slotIn(bs.slot),
    }
    plant.b.set(key(b.x, b.y), b)
    for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) if (dx || dy) plant.occ.set(key(b.x + dx, b.y + dy), key(b.x, b.y))
  }
  const market = res(w, Market)
  market.asks = g.market.asks
  market.trucks = g.market.trucks
  market.askUid = g.market.askUid
  res(w, Stock).n = { ...g.stock }
  const un = res(w, Unlocks)
  un.unlocked = new Set(g.unlocks.unlocked)
  un.recipes = new Set(g.unlocks.recipes)
  un.fresh = new Set(g.unlocks.fresh)
  un.cardQ = [...g.unlocks.cardQ]
  un.seen = new Set(g.unlocks.seen)
  un.events = new Set(g.unlocks.events)
  un.shownEver = [...g.unlocks.shownEver]
  Object.assign(res(w, Ui), { recipe: g.ui.recipe, seed: g.ui.seed })
  Object.assign(res(w, Stats), g.stats)
  res(w, Rng).next.state = g.rng
  // a sheep that was in the hand walks home; one whose pen is gone goes to the first
  for (const s of flock.sheep) if (s.state === 'held' || !flock.pastures.some((p) => p.id === s.home)) sendHome(w, s)
}
