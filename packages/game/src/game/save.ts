import { dimsOf, type BuildingId, type CardId, type TerrainId } from './balance'
import { toRoam } from './systems/sheep'
import { Field, Flock, GameState, Plant, Rng, Stats, Time, Ui, Unlocks, addPortal, emptyWorld, key, layMap, res, type Building, type Item, type SheepT, type World, type WorldOptions } from './world'

/**
 * The game saved and loaded whole (TDD 3.5): every resource of the world that the game needs to go on, as plain JSON.
 * A loaded world goes on exactly as the saved one would have — the generator's state is in it too. Pure: where the
 * save is kept is the app's business (app/saves.ts).
 *
 * What is not saved: the effects queue, the pointer's state (a building held to move goes back where it stood, a sheep
 * in the hand comes down where it was), which systems are on, and the hills (they come from the map's seed again).
 */

/**
 * The format's version. When the shape changes it goes up by one, and MIGRATE gets the step from the one before. Saves
 * before 9 are of the game before «Все овечки должны быть пострижены» (22.10.2026): another game, another map — they
 * are not loaded.
 */
export const SAVE_VERSION = 9

/** Steps from each older version to the next: `MIGRATE[n]` turns a version-n save into a version n+1 one. */
const MIGRATE: Readonly<Record<number, (g: unknown) => unknown>> = {}

/** A sheep on a belt as saved: by its id. */
type ItemSave = Omit<Item, 'sheep'> & { sheep: number }
/** A building as saved: its sheep by id. */
type BuildingSave = Omit<Building, 'item' | 'buf' | 'outs' | 'slot' | 'wrong'> & {
  item: ItemSave | null
  buf: ItemSave[]
  outs: { item: ItemSave; dir: Building['dir'] }[]
  slot: { sheep: number } | null
}

export interface GameSave {
  time: { t: number; frame: number }
  gs: ReturnType<typeof res<typeof GameState>>
  /** The terrain as it is now (buildings clear meadows); the hills come from the seed. */
  terrain: [string, TerrainId][]
  plant: BuildingSave[]
  sheep: SheepT[]
  unlocks: { unlocked: BuildingId[]; fresh: BuildingId[]; cardQ: CardId[]; seen: CardId[] }
  stats: ReturnType<typeof res<typeof Stats>>
  rng: number
}
export interface SaveData {
  v: number
  /** When it was written (ms since 1970). */
  at: number
  game: GameSave
}

/** What a save says about itself, for the main menu: sheep into the portal and the game time. */
export interface SaveInfo {
  shorn: number
  clock: number
}

// ---------------------------------------------------------------- saving

const itemOut = (it: Item): ItemSave => ({ ...it, sheep: it.sheep.id })
function buildingOut(b: Building): BuildingSave {
  const { wrong: _wrong, ...rest } = b
  return {
    ...rest,
    item: b.item && itemOut(b.item),
    buf: b.buf.map(itemOut),
    outs: b.outs.map((o) => ({ item: itemOut(o.item), dir: o.dir })),
    rules: b.rules && { ...b.rules },
    slot: b.slot && { sheep: b.slot.sheep.id },
  }
}

/** The world as a save. Nothing in the world changes. */
export function saveGame(w: World): SaveData {
  const un = res(w, Unlocks),
    ui = res(w, Ui),
    time = res(w, Time)
  const plant = [...res(w, Plant).b.values()].map(buildingOut)
  // a building held to move is saved where it stood
  const m = ui.moving
  if (m) {
    const [bw, bh] = dimsOf(m.b.type as BuildingId, m.dir)
    plant.push({ ...buildingOut(m.b), x: m.x, y: m.y, dir: m.dir, w: bw, h: bh })
  }
  return {
    v: SAVE_VERSION,
    at: Date.now(),
    game: {
      time: { t: time.t, frame: time.frame },
      gs: { ...res(w, GameState) },
      terrain: [...res(w, Field).terrain],
      plant,
      sheep: JSON.parse(JSON.stringify(res(w, Flock).sheep)) as SheepT[],
      unlocks: { unlocked: [...un.unlocked], fresh: [...un.fresh], cardQ: [...un.cardQ], seen: [...un.seen] },
      stats: { ...res(w, Stats) },
      rng: res(w, Rng).next.state,
    },
  }
}

// ---------------------------------------------------------------- loading

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
  return g && typeof g.gs?.shorn === 'number' ? { shorn: g.gs.shorn, clock: g.gs.clock } : null
}

/**
 * The world a save holds, going on from where it was saved; null when the save is broken, of another game or of a
 * newer build. `opts` are as for a new world (the systems that are on).
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
  Object.assign(gs, g.gs)
  // a game saved on pause (the menu pauses it) comes back running
  if (!gs.speed) gs.speed = 1
  layMap(w, gs.seed)
  res(w, Field).terrain = new Map(g.terrain)
  const flock = res(w, Flock)
  flock.sheep = g.sheep
  // belts and slots point at sheep by id
  const byId = new Map(flock.sheep.map((s) => [s.id, s]))
  const sheepOf = (id: number) => {
    const s = byId.get(id)
    if (!s) throw new Error('save: a sheep that is not in the flock')
    return s
  }
  const itemIn = ({ sheep, ...rest }: ItemSave): Item => ({ ...rest, sheep: sheepOf(sheep) })
  const plant = res(w, Plant)
  for (const bs of g.plant) {
    const b: Building = {
      ...bs,
      item: bs.item && itemIn(bs.item),
      buf: bs.buf.map(itemIn),
      outs: bs.outs.map((o) => ({ item: itemIn(o.item), dir: o.dir })),
      slot: bs.slot && { sheep: sheepOf(bs.slot.sheep) },
      wrong: null,
    }
    plant.b.set(key(b.x, b.y), b)
    for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) if (dx || dy) plant.occ.set(key(b.x + dx, b.y + dy), key(b.x, b.y))
  }
  addPortal(w)
  const un = res(w, Unlocks)
  un.unlocked = new Set(g.unlocks.unlocked)
  un.fresh = new Set(g.unlocks.fresh)
  un.cardQ = [...g.unlocks.cardQ]
  un.seen = new Set(g.unlocks.seen)
  Object.assign(res(w, Stats), g.stats)
  res(w, Rng).next.state = g.rng
  // a sheep that was in the hand comes down where it was and roams; so does one on a belt or in a station that is gone
  const carried = new Set<number>()
  for (const b of plant.b.values()) for (const q of [b.item, ...b.buf, ...b.outs.map((o) => o.item), b.slot]) if (q?.sheep) carried.add(q.sheep.id)
  for (const s of flock.sheep) {
    const lost = (s.state === 'belt' || s.state === 'machine') && !carried.has(s.id)
    if (s.state === 'held' || lost) toRoam(w, s, s.px, s.py)
  }
}
