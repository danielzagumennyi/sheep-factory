import { AFTER, BAY_X, BUY_SHARE, ISLAND_GROW, ITEMS, LEVELS, MARKET, MARKET_SHARE, ROAD, type ClientId, type GrowDef, type ItemId, type LevelDef } from '../balance'
import { Field, GameState, Market, Plant, Stats, Unlocks, addMarket, emit, float, isOn, newItem, res, stockAdd, stockTake, type AskT, type Building, type Item, type World } from '../world'
import { queueCard, unlock } from './unlocks'

/**
 * The village (GDD 7–8): one long game, no missions. A level is a set of asks, one per client; each ask pays its good's
 * price for every one that comes. When all of a level's asks are done the next level opens one new thing (its card)
 * and new asks; at the levels of ISLAND_GROW the island grows. After the table the same clients ask again, more each time.
 * Every good goes to the market, by the row beside the road: it fills the asks and sells the rest at a quarter of its
 * price, so no line jams. From the stock the player loads an ask or trades in the market's popup (the author: «он
 * выбирает что и/или сколько»).
 */

/** What the market pays for one good, and what it asks for one. */
export const sellPrice = (k: ItemId) => Math.max(1, Math.round(ITEMS[k].price * MARKET_SHARE))
export const buyPrice = (k: ItemId) => Math.max(1, Math.ceil(ITEMS[k].price * BUY_SHARE))

export const openAsks = (w: World) => res(w, Market).asks.filter((a) => a.have < a.total)
export const askFor = (w: World, client: ClientId) => res(w, Market).asks.find((a) => a.client === client && a.have < a.total) ?? null

/** Where a client's truck parks in front of the market, and where the market's numbers for it float up. */
export const bayX = (client: ClientId) => (client === 'market' ? 0 : BAY_X[client]) + 0.5
/** The market's front, past the road, where its numbers float up. */
const FRONT = MARKET.row + 3.3

export function earn(w: World, n: number) {
  res(w, GameState).coins += n
  res(w, Stats).earned += n
}

/** The level as written, or past the table: the last level's clients asking for the same, `AFTER.grow` times more each level. */
export function levelDef(i: number): LevelDef {
  if (i < LEVELS.length) return LEVELS[i]!
  const last = LEVELS[LEVELS.length - 1]!
  const k = Math.pow(AFTER.grow, i - LEVELS.length + 1)
  return { open: [], asks: last.asks.map(([c, g, n]) => [c, g, Math.round(n * k)] as const) }
}

/** Open level i: what it opens (one card each), the island growing at its level, its asks and their trucks. */
export function openLevel(w: World, i: number) {
  const gs = res(w, GameState),
    market = res(w, Market)
  gs.level = i
  const L = levelDef(i)
  for (const id of L.open) unlock(w, id)
  for (const g of ISLAND_GROW) if (g.level === i + 1) growIsland(w, g)
  for (const [client, kind, total] of L.asks) {
    const a: AskT = { id: ++market.askUid, client, kind, total, have: 0 }
    market.asks.push(a)
    market.trucks.push({ ask: a.id, x: -2 - market.trucks.filter((t) => t.state === 'arrive').length * 2, tx: bayX(client) - 0.5, state: 'arrive', lane: 1 })
  }
}

/** A strip of plots rises with fresh deposits, for sale; the market's row grows with it (the author, 16–18.10.2026). */
export function growIsland(w: World, g: GrowDef) {
  const f = res(w, Field)
  if (f.top <= (g.top ?? f.top) && f.right >= (g.right ?? f.right)) return
  f.top = Math.min(f.top, g.top ?? f.top)
  f.right = Math.max(f.right, g.right ?? f.right)
  addMarket(w)
  res(w, GameState).fieldVersion++
  // its card every time it grows
  res(w, Unlocks).seen.delete('island')
  queueCard(w, 'island', false)
}

/** The game's first level, at the start. */
export function startVillage(w: World) {
  openLevel(w, 0)
}

/** An ask is done: its truck leaves; when it was the level's last, the next level opens. */
function askDone(w: World, a: AskT) {
  const market = res(w, Market)
  for (const t of market.trucks) if (t.ask === a.id && t.state !== 'leave') t.state = 'out'
  if (openAsks(w).length) return
  const gs = res(w, GameState)
  market.asks = []
  if (gs.level + 1 === LEVELS.length && !gs.chapterDone) {
    gs.chapterDone = true
    queueCard(w, 'chapter', false)
  }
  openLevel(w, gs.level + 1)
}

/**
 * A good handed to the market at column x (TDD 3): the view carries it over the road on that column's bridge. The
 * market gives it to the open ask that wants it, at its full price; one nobody asks for it sells at once, for a quarter
 * (the author: «рынок сам раздаёт клиентам»). So no line ever jams at the road.
 */
export function dockAccept(w: World, _d: Building, it: Item, x = 0): boolean {
  if (it.kind === 'sheep') return false
  const gs = res(w, GameState),
    kind = it.kind
  if (!gs.quiet) emit(w, { kind: 'deliver', x, good: kind })
  // with the village switched off the market only takes what comes: nothing is counted, no level opens (the menu's farm)
  if (!isOn(w, 'village')) return true
  const a = openAsks(w).find((q) => q.kind === kind)
  if (a) {
    a.have++
    const g = ITEMS[kind].price
    earn(w, g)
    if (!gs.quiet) float(w, bayX(a.client), FRONT, '+' + g + ' · ' + a.have + '/' + a.total, 'good')
    if (a.have >= a.total) askDone(w, a)
    return true
  }
  const g = sellPrice(kind)
  earn(w, g)
  if (!gs.quiet) float(w, x + 0.5, FRONT, '+' + g)
  return true
}

/**
 * Load up to n of what an ask wants from the stock (the market's popup): each one counts as delivered, the market floats
 * one total for the lot at the client's bay. Returns how many went.
 */
export function loadAsk(w: World, a: AskT, n: number) {
  if (a.have >= a.total) return 0
  const gs = res(w, GameState)
  const c0 = gs.coins,
    h0 = a.have,
    kind = a.kind,
    total = a.total
  const got = stockTake(w, kind, Math.min(n, a.total - a.have))
  gs.quiet = true
  const d = marketDock(w)!
  for (let i = 0; i < got; i++) dockAccept(w, d, newItem(kind))
  gs.quiet = false
  const x = bayX(a.client)
  if (gs.coins > c0) float(w, x, FRONT - 0.35, '+' + (gs.coins - c0), 'good')
  if (got) float(w, x, FRONT, '+' + got + ' · ' + Math.min(total, h0 + got) + '/' + total)
  return got
}

/** The market's row (one dock along the road, world.ts `addMarket`). */
export const marketDock = (w: World) => [...res(w, Plant).b.values()].find((b) => b.type === 'dock') ?? null

/** Sell up to n of a good from the stock at the market (none before it opens). Returns how many were sold. */
export function sell(w: World, k: ItemId, n: number) {
  if (!res(w, GameState).trade) return 0
  const p = sellPrice(k)
  const got = stockTake(w, k, n)
  if (!got) return 0
  earn(w, got * p)
  float(w, res(w, Field).right / 2, FRONT, '+' + got * p, 'good')
  return got
}

/** Buy up to n of a good into the stock at the market, as many as the coins allow. Returns how many were bought. */
export function buy(w: World, k: ItemId, n: number) {
  if (!res(w, GameState).trade) return 0
  const gs = res(w, GameState),
    p = buyPrice(k)
  const got = Math.max(0, Math.min(n, Math.floor(gs.coins / p)))
  if (!got) {
    gs.noMoney++
    return 0
  }
  gs.coins -= got * p
  res(w, Stats).spent += got * p
  stockAdd(w, k, got)
  return got
}

/** Trucks: arrive on the far lane keeping their distance, park on the near lane at their dock, leave by the far lane. */
export function truckSystem(w: World, dt: number) {
  const market = res(w, Market)
  const onB = (t: (typeof market.trucks)[number]) => t.lane > 0.5
  const ahead = (t: (typeof market.trucks)[number]) => market.trucks.filter((q) => q !== t && onB(q) && q.x > t.x).reduce((m, q) => Math.min(m, q.x), 1e9)
  for (const t of market.trucks) {
    if (t.state === 'arrive') {
      // a truck waits behind one still parked at the same dock
      const parked = market.trucks.some((q) => q !== t && q.tx === t.tx && (q.state === 'in' || q.state === 'park' || q.state === 'out'))
      const stop = parked ? t.tx - ROAD.gap : t.tx
      t.x = Math.min(stop, ahead(t) - ROAD.gap, t.x + dt * ROAD.arriveSpeed)
      if (!parked && t.x >= t.tx) t.state = 'in'
    } else if (t.state === 'in') {
      t.lane = Math.max(0, t.lane - dt * ROAD.laneSpeed)
      if (t.lane === 0) t.state = 'park'
    } else if (t.state === 'out') {
      if (t.lane === 0 && market.trucks.some((q) => q !== t && onB(q) && Math.abs(q.x - t.x) < ROAD.gap)) continue
      t.lane = Math.min(1, t.lane + dt * ROAD.laneSpeed)
      if (t.lane === 1) t.state = 'leave'
    } else if (t.state === 'leave') t.x = Math.min(ahead(t) - ROAD.gap, t.x + dt * ROAD.leaveSpeed)
  }
  market.trucks = market.trucks.filter((t) => t.x < res(w, Field).right + 3)
}
