import { BUILDINGS, ITEMS, LEVELS, MARKET, dimsOf, type BuildingId, type CardId, type ItemId, type ResId, type TerrainId } from './balance'
import { sendHome } from './systems/sheep'
import { openLevel, stallX } from './systems/village'
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
  addMarket,
  emptyWorld,
  key,
  penOf,
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
  noMarks,
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
export const SAVE_VERSION = 5
/** The level the market starts trading at (a version-1 save knew no `trade`). */
const TRADE_LEVEL = LEVELS.findIndex((L) => L.open.includes('market'))
/** Steps from each older version to the next: `MIGRATE[n]` turns a version-n save into a version n+1 one. */
const MIGRATE: Readonly<Record<number, (g: unknown) => unknown>> = {
  // 2: one market along the road instead of a dock per client and a market stall (18.10.2026); trading is a flag
  1: (g) => {
    const s = g as GameSave
    s.plant = s.plant.filter((b) => b.type !== 'dock')
    s.gs = { ...s.gs, trade: s.gs.level >= TRADE_LEVEL }
    return s
  },
  // 3: four stalls past the row and the road along the island's edge (18.10.2026); each ask has the stall its truck parks at
  2: (g) => {
    const s = g as GameSave
    s.plant = s.plant.filter((b) => b.type !== 'dock')
    s.market.asks.forEach((a, i) => (a.stall = i % MARKET.stalls.length))
    for (const t of s.market.trucks) {
      const a = s.market.asks.find((q) => q.id === t.ask)
      if (!a) continue
      t.tx = stallX(a.stall) - 0.5
      if (t.state !== 'arrive' && t.state !== 'leave') t.x = t.tx
    }
    return s
  },
  // 4: sheep roam (19.10.2026). A first level of shearing by hand came before the others and the pen's level before the
  // shearer's, so a level is now one later — the shearer's (then first) is now third; what the levels up to it open is
  // open. A sheep that waited beside a station roams
  3: (g) => {
    const s = g as GameSave
    const old = s.gs.level
    s.gs = { ...s.gs, level: old === 0 ? 2 : old === 1 ? 1 : old + 1 }
    for (const L of LEVELS.slice(0, s.gs.level + 1))
      for (const id of [...L.open, ...(L.after ? [L.after.open] : [])]) if (id in BUILDINGS && !s.unlocks.unlocked.includes(id as BuildingId)) s.unlocks.unlocked.push(id as BuildingId)
    if (!s.unlocks.seen.includes('shear')) s.unlocks.seen.push('shear')
    for (const q of s.flock.sheep) {
      const sh = q as SheepT & { waitAt?: string | null }
      if ((sh.state as string) === 'waiting') Object.assign(sh, { state: 'roam', home: 0, tx: sh.px, ty: sh.py })
      delete sh.waitAt
    }
    return s
  },
  // 5: the salon (19.10.2026): everything is made on the sheep. The goods-only machines are gone — their coins come back,
  // what they held goes to the stock — and the stations they opened with take their place in the levels (the carder's
  // level opens the comb, the spinner's the curl, the felter's the bath, the workshop's the knitting); the felt boots'
  // level went with them, so a level past it is one earlier. Pink goods are the coloured ones, roving is thread, felt
  // boots are sold. A level whose asks were for goods that are gone is opened anew.
  4: (g) => {
    const s = g as GameSave & { unlocks: { recipes?: string[] }; ui: { recipe?: string } }
    const RENAME: Record<string, string> = { carder: 'comb', spinner: 'curl', felter: 'bath', workshop: 'knit' }
    const GOOD: Record<string, ItemId | null> = { pwool: 'cwool', roving: 'thread', proving: 'cthread', pyarn: 'cyarn', valenki: null }
    const good = (k: string) => (k in GOOD ? GOOD[k]! : (k as ItemId))
    const stock: Partial<Record<ItemId, number>> = {}
    const add = (k: string, n: number) => {
      const to = good(k)
      if (to) stock[to] = (stock[to] ?? 0) + n
      else s.gs.coins += Math.round(n * 13)
    }
    for (const [k, n] of Object.entries(s.stock)) add(k, n ?? 0)
    s.plant = s.plant.filter((b) => {
      if (!(b.type in RENAME)) return true
      s.gs.coins += b.paid
      for (const [k, n] of Object.entries(b.inv)) add(k, n ?? 0)
      for (const q of [b.item, ...b.buf, ...b.pile, ...b.outs.map((o) => o.item)]) if (q && q.sheep === undefined) add(q.kind, 1)
      return false
    })
    for (const b of s.plant) {
      const old = b as BuildingSave & { recipe?: unknown; slot: (BuildingSave['slot'] & { job?: unknown }) | null }
      delete old.recipe
      if (old.slot?.job !== undefined) old.slot = null
      for (const q of [b.item, ...b.buf, ...b.pile, ...b.outs.map((o) => o.item)])
        if (q && q.sheep === undefined && q.kind !== 'sheep') {
          const to = good(q.kind)
          if (to) q.kind = to
        }
      b.buf = b.buf.filter((q) => q.kind in ITEMS || q.sheep !== undefined)
      b.pile = b.pile.filter((q) => q.kind in ITEMS)
      b.outs = b.outs.filter((o) => o.item.kind in ITEMS || o.item.sheep !== undefined)
      if (b.item && !(b.item.kind in ITEMS) && b.item.sheep === undefined) b.item = null
      if (b.rules) for (const k of ['l', 'f', 'r'] as const) b.rules[k] = (good(b.rules[k]) ?? 'any') as typeof b.rules.l
      b.inv = Object.fromEntries(Object.entries(b.inv).flatMap(([k, n]) => (good(k) ? [[good(k)!, n]] : [])))
    }
    s.stock = stock
    for (const q of s.flock.sheep) {
      const sh = q as SheepT & { pink?: boolean }
      sh.marks = { ...noMarks(), dye: !!sh.pink }
      delete sh.pink
    }
    const ren = <T extends string>(a: T[]) => a.map((id) => (RENAME[id] ?? id) as T).filter((id) => id !== ('valenki' as T))
    s.unlocks = { ...s.unlocks, unlocked: ren(s.unlocks.unlocked), fresh: ren(s.unlocks.fresh), cardQ: ren(s.unlocks.cardQ), seen: ren(s.unlocks.seen) }
    delete s.unlocks.recipes
    delete s.ui.recipe
    if (s.gs.level > 16) s.gs.level--
    // asks for goods that are gone are opened anew once the world is up
    if (s.market.asks.some((a) => !(a.kind in ITEMS))) {
      s.market.asks = []
      s.market.trucks = []
      reopen.add(s)
    }
    return s
  },
}
/** Saves whose level has to be opened anew once loaded: its asks were for goods that are gone. */
const reopen = new WeakSet<object>()

/** A good as saved: the sheep it carries by its id. */
type ItemSave = Omit<Item, 'sheep'> & { sheep?: number }
/** A building as saved: its goods as ItemSave, the sheep in its slot by id. */
type BuildingSave = Omit<Building, 'item' | 'buf' | 'outs' | 'pile' | 'slot'> & {
  item: ItemSave | null
  buf: ItemSave[]
  outs: { item: ItemSave; dir: Building['dir'] }[]
  pile: ItemSave[]
  slot: { sheep?: number; pass?: boolean } | null
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
  unlocks: { unlocked: BuildingId[]; fresh: BuildingId[]; cardQ: CardId[]; seen: CardId[]; events: string[]; shownEver: CardId[] }
  /** The player's last pick: what the hand sows. */
  ui: { seed: ResId }
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
      unlocks: { unlocked: [...un.unlocked], fresh: [...un.fresh], cardQ: [...un.cardQ], seen: [...un.seen], events: [...un.events], shownEver: [...un.shownEver] },
      ui: { seed: ui.seed },
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
  Object.assign(gs, g.gs)
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
  // the market's parts, the row as wide as the island (a save from before them had none)
  addMarket(w)
  const market = res(w, Market)
  market.asks = g.market.asks
  market.trucks = g.market.trucks
  market.askUid = g.market.askUid
  res(w, Stock).n = { ...g.stock }
  const un = res(w, Unlocks)
  un.unlocked = new Set(g.unlocks.unlocked)
  un.fresh = new Set(g.unlocks.fresh)
  un.cardQ = [...g.unlocks.cardQ]
  un.seen = new Set(g.unlocks.seen)
  un.events = new Set(g.unlocks.events)
  un.shownEver = [...g.unlocks.shownEver]
  Object.assign(res(w, Ui), { seed: g.ui.seed })
  Object.assign(res(w, Stats), g.stats)
  res(w, Rng).next.state = g.rng
  // a sheep that was in the hand walks home; one in a pen that is gone roams
  for (const s of flock.sheep) if (s.state === 'held' || (s.state === 'pasture' && !penOf(w, s.home))) sendHome(w, s)
  // a level whose asks were for goods that are gone is opened anew: its asks and trucks (its cards are seen)
  if (reopen.has(g)) openLevel(w, gs.level)
}
