import { AFTER, BUILDINGS, BUY_SHARE, CLIENT, DIRS, ISLAND_GROW, ITEMS, LEVELS, MARKET, MARKET_SHARE, type CardId, type Dir, type GrowDef, type ItemId, type LevelDef } from '../balance'
import { Field, GameState, Market, Stats, Unlocks, emit, float, isOn, res, stockAdd, stockOf, stockTake, type Building, type Item, type NeedT, type World } from '../world'
import { queueCard, unlock } from './unlocks'

/**
 * The market and its clients (GDD 7–8): one long game, no missions. Every good goes to the market in the middle of the
 * land — a belt to any of its sides — and into the stock, where the clients take theirs: each its own good, so many a
 * minute, for good (the author, 21.10.2026: постоянные клиенты), paying its price for each one. A level is done when
 * every client is content at once; the next opens one new thing (its card) and a new client or more for the old ones,
 * and at the levels of ISLAND_GROW the island grows. After the table every client takes more each level. Clients never
 * leave, so the whole farm is needed all the time, and it grows. In the market's window the player buys and sells.
 */

/** What the market pays for one good nobody wants, and what it asks for one. */
export const sellPrice = (k: ItemId) => Math.max(1, Math.round(ITEMS[k].price * MARKET_SHARE))
export const buyPrice = (k: ItemId) => Math.max(1, Math.ceil(ITEMS[k].price * BUY_SHARE))

/** The market's middle, where its numbers float up. */
const MID = { x: MARKET.x + MARKET.size / 2, y: MARKET.y + MARKET.size / 2 }

export function earn(w: World, n: number) {
  res(w, GameState).coins += n
  res(w, Stats).earned += n
}

/** The level as written, or past the table: the last level's clients, each taking `AFTER.grow` times more each level. */
export function levelDef(i: number): LevelDef {
  if (i < LEVELS.length) return LEVELS[i]!
  const last = LEVELS[LEVELS.length - 1]!
  const k = Math.pow(AFTER.grow, i - LEVELS.length + 1)
  return { open: [], needs: last.needs.map(([c, g, n]) => [c, g, Math.round(n * k)] as const) }
}

/**
 * Open level i: what it opens (one card each), the island growing at its level, and every client's need at this level
 * — a new client comes, an old one takes its new rate. Every bar starts empty: a level is the whole farm keeping every
 * client content at the new rates (else a level that only raises them would be done the moment it opened).
 */
export function openLevel(w: World, i: number) {
  const gs = res(w, GameState),
    market = res(w, Market)
  gs.level = i
  const L = levelDef(i)
  for (const id of L.open) unlock(w, id)
  for (const g of ISLAND_GROW) if (g.level === i + 1) growIsland(w, g)
  for (const n of market.needs) n.fill = 0
  for (const [client, kind, rate] of L.needs) {
    const n = market.needs.find((q) => q.client === client && q.kind === kind)
    if (n) n.rate = rate
    else market.needs.push({ client, kind, rate, due: 0, fill: 0 })
  }
}

/** A strip of plots rises with fresh deposits, for sale (the author, 16–18.10.2026). */
export function growIsland(w: World, g: GrowDef) {
  const f = res(w, Field)
  if (f.top <= (g.top ?? f.top) && f.right >= (g.right ?? f.right)) return
  f.top = Math.min(f.top, g.top ?? f.top)
  f.right = Math.max(f.right, g.right ?? f.right)
  res(w, GameState).fieldVersion++
  // its card every time it grows
  res(w, Unlocks).seen.delete('island')
  queueCard(w, 'island', false)
}

/** The game's first level, at the start. */
export function startVillage(w: World) {
  openLevel(w, 0)
}

/** Every card the game can show: the buildings, trade, the hints, the chapter. */
const ALL_CARDS: readonly CardId[] = [...(Object.keys(BUILDINGS) as CardId[]), 'market', 'shear', 'land', 'island', 'chapter']

/**
 * The endless mode (the author, 19.10.2026: «бесконечный режим где сразу всё доступно»): all that the levels open is
 * open from the start — every building, trade, sheep that eat — and the island stands whole; no card comes.
 * Coins, plots and the clients go as in the long game (the author: «обычные» coins), and the clients take more without
 * end: there is no chapter to close. Before the first level opens.
 */
export function openEverything(w: World) {
  res(w, GameState).endless = true
  for (const L of LEVELS) {
    for (const id of L.open) unlock(w, id)
    if (L.after) unlock(w, L.after.open)
  }
  for (const g of ISLAND_GROW) growIsland(w, g)
  const un = res(w, Unlocks)
  un.cardQ.length = 0
  un.fresh.clear()
  for (const id of ALL_CARDS) un.seen.add(id)
}

/** How far one good taken or missed moves a client's average towards 1 or 0: the same pull a second, whatever its rate. */
export const fillStep = (n: Pick<NeedT, 'rate'>) => Math.min(1, 60 / (n.rate * CLIENT.fillSec))
/** A client's bar, 0…1: full once it is content. */
export const contentBar = (n: Pick<NeedT, 'fill'>) => Math.min(1, n.fill / CLIENT.content)

/** Is every client content? A level waits for it. */
export function allContent(w: World) {
  const needs = res(w, Market).needs
  return needs.length > 0 && needs.every((n) => n.fill >= CLIENT.content)
}

/**
 * The clients at work (GDD 7): each need runs up to its next good, `rate` a minute; when one falls due the client
 * takes it from the stock and pays its price — its average goes up towards 1 — or finds none, and it goes down towards
 * 0 (`fillStep`). When every client is content at once the level is done: the chapter's card after the last of the
 * table, and the next level.
 */
export function clientSystem(w: World, dt: number) {
  for (const n of res(w, Market).needs) {
    n.due += (n.rate / 60) * dt
    while (n.due >= 1) {
      n.due--
      const got = stockTake(w, n.kind, 1)
      n.fill += (got - n.fill) * fillStep(n)
      if (got) {
        earn(w, ITEMS[n.kind].price)
        emit(w, { kind: 'take', client: n.client, good: n.kind })
      }
    }
  }
  if (!isOn(w, 'village') || !allContent(w)) return
  const gs = res(w, GameState)
  if (gs.level + 1 === LEVELS.length && !gs.chapterDone) {
    gs.chapterDone = true
    queueCard(w, 'chapter', false)
  }
  openLevel(w, gs.level + 1)
}

/**
 * A good handed to the market at its cell (x, y), coming in going d (TDD 3.4.1): into the stock, where the clients take
 * it, while the stock holds fewer than MARKET.keep of it — past that the market sells it at once for a quarter, so no
 * line ever jams at the market. A sheep doesn't go in.
 */
export function dockAccept(w: World, _d: Building, it: Item, x: number, y: number, d: Dir): boolean {
  if (it.kind === 'sheep') return false
  const kind = it.kind
  emit(w, { kind: 'deliver', x, y, fx: x - DIRS[d]![0], fy: y - DIRS[d]![1], good: kind })
  // with the village switched off the market only takes what comes: nothing is counted (the menu's farm)
  if (!isOn(w, 'village')) return true
  if (stockOf(w, kind) < MARKET.keep) stockAdd(w, kind)
  else {
    const g = sellPrice(kind)
    earn(w, g)
    float(w, x + 0.5, y + 0.5, '+' + g)
  }
  return true
}

/** Sell up to n of a good from the stock in the market's window (none before trade opens). Returns how many were sold. */
export function sell(w: World, k: ItemId, n: number) {
  if (!res(w, GameState).trade) return 0
  const p = sellPrice(k)
  const got = stockTake(w, k, n)
  if (!got) return 0
  earn(w, got * p)
  float(w, MID.x, MID.y, '+' + got * p, 'good')
  return got
}

/** Buy up to n of a good into the stock in the market's window, as many as the coins allow. Returns how many were bought. */
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
  float(w, MID.x, MID.y, '−' + got * p, 'soft')
  return got
}
