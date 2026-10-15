import { BUY_SHARE, EXTRA_SHARE, GRID, ITEMS, MARKET_SHARE, ROAD, STARS, type ClientId, type ItemId } from '../balance'
import { GameState, Market, Mission, Plant, Stats, float, newItem, res, stockAdd, stockTake, type Building, type Item, type OrderT, type World } from '../world'
import { queueCard, unlock } from './unlocks'

/**
 * Docks and orders (GDD 7). Every order is open from the start: «надо 100 шерсти и оплата за каждую партию из 10».
 * A batch pays the moment it is complete; the mission ends when every order is done. A done order stays and keeps
 * buying the same good at half a batch's pay (the author, 14.10.2026), so a finished line still earns. The market
 * takes anything at a quarter of its price and sells anything at twice it; a dock pays one coin for a good that isn't
 * its order, so no line jams. From the stock the player loads a dock or trades at the market in their popups, picking
 * what and how much (the author: «он выбирает что и/или сколько он хочет продать/погрузить»).
 */

/** What the market pays for one good, and what it asks for one. */
export const sellPrice = (k: ItemId) => (k === 'water' ? 0 : Math.max(1, Math.round(ITEMS[k].price * MARKET_SHARE)))
export const buyPrice = (k: ItemId) => Math.max(1, Math.ceil(ITEMS[k].price * BUY_SHARE))

export const openOrders = (w: World) => res(w, Market).orders.filter((o) => !o.done)
export const orderFor = (w: World, client: ClientId) => res(w, Market).orders.find((o) => !o.done && o.dock === client)
export const doneFor = (w: World, client: ClientId) => res(w, Market).orders.find((o) => o.done && o.dock === client)
export const extraPay = (o: OrderT) => Math.ceil(o.pay * EXTRA_SHARE)

export function dockX(w: World, client: ClientId) {
  for (const b of res(w, Plant).b.values()) if (b.type === 'dock' && b.client === client) return b.x
  return 0
}

export function earn(w: World, n: number) {
  res(w, GameState).coins += n
}

export function dockAccept(w: World, d: Building, it: Item): boolean {
  if (it.kind === 'sheep') return false
  const gs = res(w, GameState)
  const x = d.x + 0.5,
    y = d.y - 0.15
  const client = d.client!
  if (client === 'market') {
    const g = sellPrice(it.kind)
    earn(w, g)
    if (!gs.quiet) float(w, x, y, '+' + g)
    return true
  }
  const o = orderFor(w, client)
  if (o && o.kind === it.kind) {
    o.have++
    if (o.have % o.batch === 0 || o.have >= o.total) payBatch(w, o)
    else if (!gs.quiet) float(w, x, y, o.have + '/' + o.total)
    return true
  }
  const od = doneFor(w, client)
  if (od && od.kind === it.kind) {
    od.extra++
    if (od.extra % od.batch === 0) {
      earn(w, extraPay(od))
      if (!gs.quiet) float(w, x, y - 0.3, '+' + extraPay(od), 'good')
    } else if (!gs.quiet) float(w, x, y, (od.extra % od.batch) + '/' + od.batch)
    return true
  }
  const g = it.kind === 'water' ? 0 : 1
  earn(w, g)
  if (!gs.quiet) float(w, x, y, '+' + g)
  return true
}

/**
 * Load up to n of the good a dock's order wants from the stock (its popup): each one counts as delivered, the dock
 * floats one total for the lot. Returns how many went.
 */
export function loadDock(w: World, d: Building, n: number) {
  const client = d.client!,
    o = orderFor(w, client) ?? doneFor(w, client)
  if (!o || client === 'market') return 0
  const gs = res(w, GameState)
  const c0 = gs.coins,
    h0 = o.have + o.extra
  const got = stockTake(w, o.kind, n)
  gs.quiet = true
  for (let i = 0; i < got; i++) dockAccept(w, d, newItem(o.kind))
  gs.quiet = false
  const x = d.x + 0.5,
    y = d.y - 0.15
  if (gs.coins > c0) float(w, x, y - 0.35, '+' + (gs.coins - c0), 'good')
  if (got && !o.done) float(w, x, y, '+' + (o.have - h0) + ' · ' + o.have + '/' + o.total)
  else if (got) float(w, x, y, '+' + (o.have + o.extra - h0) + ' · ' + (o.extra % o.batch) + '/' + o.batch)
  return got
}

/** Sell up to n of a good from the stock at the market. Returns how many were sold. */
export function sell(w: World, k: ItemId, n: number) {
  const p = sellPrice(k)
  if (!p) return 0
  const got = stockTake(w, k, n)
  if (!got) return 0
  earn(w, got * p)
  const m = [...res(w, Plant).b.values()].find((b) => b.client === 'market')
  if (m) float(w, m.x + 1, m.y - 0.15, '+' + got * p, 'good')
  return got
}

/** Buy up to n of a good into the stock, as many as the coins allow. Returns how many were bought. */
export function buy(w: World, k: ItemId, n: number) {
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

/** A batch is complete: pay now; the first batches open new things. */
function payBatch(w: World, o: OrderT) {
  o.paid++
  earn(w, o.pay)
  float(w, dockX(w, o.dock) + 0.5, GRID.roadY - 0.5, '+' + o.pay, 'good')
  for (const u of o.unlocks ?? []) if (u.at === o.paid) unlock(w, u.id)
  if (o.have >= o.total) {
    o.done = true
    o.extra = 0
    if (openOrders(w).length) queueCard(w, 'extra')
    else finishMission(w)
  }
}

function finishMission(w: World) {
  const gs = res(w, GameState),
    par = res(w, Mission).def.par
  gs.stars = gs.clock <= par ? 3 : gs.clock <= par * STARS.twoStar ? 2 : 1
  gs.finished = true
  gs.finishT = gs.clock
  gs.resultT = 1.6
}

/** Trucks: arrive on the far lane keeping their distance, park on the near lane at their dock, leave by the far lane. */
export function truckSystem(w: World, dt: number) {
  const market = res(w, Market)
  const onB = (t: (typeof market.trucks)[number]) => t.lane > 0.5
  const ahead = (t: (typeof market.trucks)[number]) => market.trucks.filter((q) => q !== t && onB(q) && q.x > t.x).reduce((m, q) => Math.min(m, q.x), 1e9)
  for (const t of market.trucks) {
    if (t.state === 'arrive') {
      t.x = Math.min(t.tx, ahead(t) - ROAD.gap, t.x + dt * ROAD.arriveSpeed)
      if (t.x >= t.tx) t.state = 'in'
    } else if (t.state === 'in') {
      t.lane = Math.max(0, t.lane - dt * ROAD.laneSpeed)
      if (t.lane === 0) t.state = 'park'
    } else if (t.state === 'out') {
      if (t.lane === 0 && market.trucks.some((q) => q !== t && onB(q) && Math.abs(q.x - t.x) < ROAD.gap)) continue
      t.lane = Math.min(1, t.lane + dt * ROAD.laneSpeed)
      if (t.lane === 1) t.state = 'leave'
    } else if (t.state === 'leave') t.x = Math.min(ahead(t) - ROAD.gap, t.x + dt * ROAD.leaveSpeed)
  }
  market.trucks = market.trucks.filter((t) => t.x < GRID.cols + 3)
}

/** The short beat between the last batch and the result screen. */
export function resultSystem(w: World, dt: number) {
  const gs = res(w, GameState)
  if (!gs.finished || gs.resultT <= 0) return
  gs.resultT -= dt
  if (gs.resultT <= 0) gs.showResult = true
}
