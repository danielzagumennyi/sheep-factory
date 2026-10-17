import { AFTER, BUY_SHARE, DOCK, DOCK_X, ISLAND_GROW, ITEMS, LEVELS, MARKET_SHARE, ROAD, type ClientId, type GrowDef, type ItemId, type LevelDef } from '../balance'
import { Field, GameState, Market, Plant, Stats, Unlocks, addDock, float, isOn, newItem, res, stockAdd, stockTake, type AskT, type Building, type Item, type World } from '../world'
import { queueCard, unlock } from './unlocks'

/**
 * The village (GDD 7–8): one long game, no missions. A level is a set of asks, one per client; each ask pays its good's
 * price for every one that comes. When all of a level's asks are done the next level opens one new thing (its card)
 * and new asks; at the levels of ISLAND_GROW the island grows. After the table the same clients ask again, more each time.
 * A dock whose ask is done — like the market — takes anything at a quarter of its price, so no line jams. From the
 * stock the player loads a dock or trades at the market in their popups (the author: «он выбирает что и/или сколько»).
 */

/** What the market pays for one good, and what it asks for one. */
export const sellPrice = (k: ItemId) => Math.max(1, Math.round(ITEMS[k].price * MARKET_SHARE))
export const buyPrice = (k: ItemId) => Math.max(1, Math.ceil(ITEMS[k].price * BUY_SHARE))

export const openAsks = (w: World) => res(w, Market).asks.filter((a) => a.have < a.total)
export const askFor = (w: World, client: ClientId) => res(w, Market).asks.find((a) => a.client === client && a.have < a.total) ?? null

export function dockX(w: World, client: ClientId) {
  for (const b of res(w, Plant).b.values()) if (b.type === 'dock' && b.client === client) return b.x
  return DOCK_X[client]
}

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
    addDock(w, client)
    const a: AskT = { id: ++market.askUid, client, kind, total, have: 0 }
    market.asks.push(a)
    market.trucks.push({ ask: a.id, x: -2 - market.trucks.filter((t) => t.state === 'arrive').length * 2, tx: DOCK_X[client] + (DOCK.w - 1) / 2, state: 'arrive', lane: 1 })
  }
}

/** A strip of plots rises with fresh deposits, for sale, and the docks that come with it (the author, 16–17.10.2026). */
export function growIsland(w: World, g: GrowDef) {
  const f = res(w, Field)
  if (f.top <= (g.top ?? f.top) && f.right >= (g.right ?? f.right)) return
  f.top = Math.min(f.top, g.top ?? f.top)
  f.right = Math.max(f.right, g.right ?? f.right)
  for (const [client, x] of g.docks ?? []) addDock(w, client, x)
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

export function dockAccept(w: World, d: Building, it: Item): boolean {
  if (it.kind === 'sheep') return false
  // with the village switched off a dock only takes what comes: nothing is counted, no level opens (the menu's farm)
  if (!isOn(w, 'village')) return true
  const gs = res(w, GameState)
  const x = d.x + 0.5,
    y = d.y - 0.15
  const kind = it.kind
  const a = d.client && d.client !== 'market' ? askFor(w, d.client) : null
  if (a && a.kind === kind) {
    a.have++
    const g = ITEMS[kind].price
    earn(w, g)
    if (!gs.quiet) float(w, x, y, '+' + g + ' · ' + a.have + '/' + a.total, 'good')
    if (a.have >= a.total) askDone(w, a)
    return true
  }
  // the market, a dock whose ask is done, a good not in its ask: a quarter of the price
  const g = sellPrice(kind)
  earn(w, g)
  if (!gs.quiet) float(w, x, y, '+' + g)
  return true
}

/**
 * Load up to n of the good a dock's ask wants from the stock (its popup): each one counts as delivered, the dock floats
 * one total for the lot. Returns how many went.
 */
export function loadDock(w: World, d: Building, n: number) {
  const a = d.client && d.client !== 'market' ? askFor(w, d.client) : null
  if (!a) return 0
  const gs = res(w, GameState)
  const c0 = gs.coins,
    h0 = a.have,
    kind = a.kind,
    total = a.total
  const got = stockTake(w, kind, Math.min(n, a.total - a.have))
  gs.quiet = true
  for (let i = 0; i < got; i++) dockAccept(w, d, newItem(kind))
  gs.quiet = false
  const x = d.x + 0.5,
    y = d.y - 0.15
  if (gs.coins > c0) float(w, x, y - 0.35, '+' + (gs.coins - c0), 'good')
  if (got) float(w, x, y, '+' + got + ' · ' + Math.min(total, h0 + got) + '/' + total)
  return got
}

/** The market's stall, once its level has opened it. */
export const marketDock = (w: World) => [...res(w, Plant).b.values()].find((b) => b.type === 'dock' && b.client === 'market') ?? null

/** Sell up to n of a good from the stock at the market (none before it opens). Returns how many were sold. */
export function sell(w: World, k: ItemId, n: number) {
  const m = marketDock(w)
  if (!m) return 0
  const p = sellPrice(k)
  const got = stockTake(w, k, n)
  if (!got) return 0
  earn(w, got * p)
  float(w, m.x + 1, m.y - 0.15, '+' + got * p, 'good')
  return got
}

/** Buy up to n of a good into the stock at the market, as many as the coins allow. Returns how many were bought. */
export function buy(w: World, k: ItemId, n: number) {
  if (!marketDock(w)) return 0
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
