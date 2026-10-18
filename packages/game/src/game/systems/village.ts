import { AFTER, BUY_SHARE, ISLAND_GROW, ITEMS, LEVELS, MARKET, MARKET_SHARE, ROAD, type GrowDef, type ItemId, type LevelDef } from '../balance'
import { Field, GameState, Market, Stats, Unlocks, addMarket, emit, float, isOn, res, stockAdd, stockOf, stockTake, type AskT, type Building, type Item, type TruckT, type World } from '../world'
import { queueCard, unlock } from './unlocks'

/**
 * The village (GDD 7–8): one long game, no missions. A level is a set of asks, one per client; each ask pays its good's
 * price for every one that comes. When all of a level's asks are done the next level opens one new thing (its card)
 * and new asks; at the levels of ISLAND_GROW the island grows. After the table the same clients ask again, more each time.
 * Every good goes to the market, by the row beside the field, and rides its chute to a stall: into the truck parked
 * there if it wants it, else into the stock, where it waits for a truck that does (the author: «ждёт машину»). So no
 * line jams. At the trading post the player buys and sells from the stock.
 */

/** What the trading post pays for one good, and what it asks for one. */
export const sellPrice = (k: ItemId) => Math.max(1, Math.round(ITEMS[k].price * MARKET_SHARE))
export const buyPrice = (k: ItemId) => Math.max(1, Math.ceil(ITEMS[k].price * BUY_SHARE))

export const openAsks = (w: World) => res(w, Market).asks.filter((a) => a.have < a.total)
/** The open ask at stall i, if any. */
export const askAt = (w: World, i: number) => openAsks(w).find((a) => a.stall === i) ?? null

/** The middle of stall i (along x), where its truck parks. */
export const stallX = (i: number) => MARKET.stalls[i]! + MARKET.stallW / 2
/** The stall nearest to column x: where a good no truck takes there is stored. */
export function nearestStall(x: number) {
  let best = 0
  for (let i = 1; i < MARKET.stalls.length; i++) if (Math.abs(stallX(i) - x - 0.5) < Math.abs(stallX(best) - x - 0.5)) best = i
  return best
}
/** The stalls' front, by the road, where their numbers float up; the trading post's middle. */
const FRONT = MARKET.row + 1 + MARKET.rows - 0.2
const BUY_X = MARKET.buyX + MARKET.buyW / 2
/** Is the ask's truck parked at its stall? Only then it takes goods. */
const parked = (w: World, a: AskT) => res(w, Market).trucks.some((t) => t.ask === a.id && t.state === 'park')
/** The stall a truck parks at, by where it parks. */
const stallOf = (t: TruckT) => MARKET.stalls.findIndex((_, i) => stallX(i) - 0.5 === t.tx)

/** A stall for a new ask: the first that no open ask has and no truck stands at; else the first no open ask has. */
function freeStall(w: World) {
  const taken = new Set(openAsks(w).map((a) => a.stall))
  const standing = new Set(res(w, Market).trucks.filter((t) => t.state !== 'leave').map(stallOf))
  const all = MARKET.stalls.map((_, i) => i)
  return all.find((i) => !taken.has(i) && !standing.has(i)) ?? all.find((i) => !taken.has(i)) ?? 0
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
    const a: AskT = { id: ++market.askUid, client, kind, total, have: 0, stall: freeStall(w) }
    market.asks.push(a)
    market.trucks.push({ ask: a.id, x: -2 - market.trucks.filter((t) => t.state === 'arrive').length * 2, tx: stallX(a.stall) - 0.5, state: 'arrive', lane: 1 })
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
 * A good handed to the market's row at column x (TDD 3.4.1): it rides the chute to a stall. A truck parked there for
 * it takes it, at the good's full price; any other goes into the stock and waits for a truck that wants it (the author:
 * «ждёт машину»), up to MARKET.keep of a kind — the rest the market sells for a quarter. So no line ever jams at the
 * market and no farm runs out of coins.
 */
export function dockAccept(w: World, _d: Building, it: Item, x = 0): boolean {
  if (it.kind === 'sheep') return false
  const kind = it.kind
  // with the village switched off the market only takes what comes: nothing is counted, no level opens (the menu's farm)
  const on = isOn(w, 'village')
  const a = on ? openAsks(w).find((q) => q.kind === kind && parked(w, q)) : undefined
  const stall = a ? a.stall : nearestStall(x)
  emit(w, { kind: 'deliver', x, good: kind, stall, truck: !!a })
  if (!on) return true
  if (a) fillAsk(w, a)
  else if (stockOf(w, kind) < MARKET.keep) stockAdd(w, kind)
  else {
    // the stock holds enough of it for the trucks: the market sells this one at once, for a quarter
    const g = sellPrice(kind)
    earn(w, g)
    float(w, stallX(stall), FRONT, '+' + g)
  }
  return true
}

/** One good into an ask's truck: it pays the good's price; the last one sends the truck off. */
function fillAsk(w: World, a: AskT) {
  a.have++
  const g = ITEMS[a.kind].price
  earn(w, g)
  float(w, stallX(a.stall), FRONT, '+' + g + ' · ' + a.have + '/' + a.total, 'good')
  if (a.have >= a.total) askDone(w, a)
}

/** Sell up to n of a good from the stock at the trading post (none before it opens). Returns how many were sold. */
export function sell(w: World, k: ItemId, n: number) {
  if (!res(w, GameState).trade) return 0
  const p = sellPrice(k)
  const got = stockTake(w, k, n)
  if (!got) return 0
  earn(w, got * p)
  float(w, BUY_X, FRONT, '+' + got * p, 'good')
  return got
}

/** Buy up to n of a good into the stock at the trading post, as many as the coins allow. Returns how many were bought. */
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
  float(w, BUY_X, FRONT, '−' + got * p, 'soft')
  return got
}

/**
 * Trucks: arrive on the drive lane keeping their distance, park on the near lane at their stall, leave by the drive
 * lane. A parked truck takes its good from the stock, MARKET.loadRate a second (the author: «он сам грузится в неё»).
 */
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
    } else if (t.state === 'park') {
      const a = market.asks.find((q) => q.id === t.ask)
      if (!a || a.have >= a.total || !isOn(w, 'village') || !stockOf(w, a.kind)) {
        t.load = 0
        continue
      }
      t.load = (t.load ?? 0) + dt * MARKET.loadRate
      while (t.load >= 1 && a.have < a.total && stockTake(w, a.kind, 1)) {
        t.load--
        emit(w, { kind: 'load', stall: a.stall, good: a.kind })
        fillAsk(w, a)
      }
    } else if (t.state === 'out') {
      // it pulls out once the drive lane is clear beside it; one waiting just a gap behind for its stall doesn't hold it
      // (the gap less a hair: the two would wait for each other forever over a rounding)
      if (t.lane === 0 && market.trucks.some((q) => q !== t && onB(q) && Math.abs(q.x - t.x) < ROAD.gap - 0.01)) continue
      t.lane = Math.min(1, t.lane + dt * ROAD.laneSpeed)
      if (t.lane === 1) t.state = 'leave'
    } else if (t.state === 'leave') t.x = Math.min(ahead(t) - ROAD.gap, t.x + dt * ROAD.leaveSpeed)
  }
  market.trucks = market.trucks.filter((t) => t.x < res(w, Field).right + 3)
}
