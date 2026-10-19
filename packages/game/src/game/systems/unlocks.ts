import { BUILDINGS, GRID, LEVELS, LOW_LAND, ONCE_CARDS, type BuildingId, type CardId, type OpenId } from '../balance'
import { owned, plotOnIsland, plotRes } from '../grid'
import { Field, Flock, GameState, Unlocks, addMarket, key, res, unkey, type World } from '../world'

/**
 * Growth one thing at a time (the author: «каждый продукт открывается и объясняется отдельно»). Each village level
 * opens one thing with one «Новое» card; the game pauses while a card is up. A level may open one more thing once the
 * player has placed the first (`LevelDef.after`: the belt after the shearer). A hint comes once, when it is needed
 * (`fireEvent`): land running out.
 */

/** Queue a card; a building id also unlocks that building (unless `alsoUnlock` is false). */
export function queueCard(w: World, id: CardId, alsoUnlock = true) {
  const un = res(w, Unlocks)
  if (alsoUnlock && id in BUILDINGS) {
    un.unlocked.add(id as BuildingId)
    un.fresh.add(id as BuildingId)
  }
  if (un.seen.has(id)) return
  if (ONCE_CARDS.includes(id)) {
    if (un.seenEver.has(id)) return
    un.seenEver.add(id)
    un.shownEver.push(id)
  }
  un.seen.add(id)
  un.cardQ.push(id)
}

/**
 * Open a building (the workshop comes knowing the sweater), a recipe or trade (the market's trading post), with its card. The feeder brings
 * food into the game: from now on a shorn sheep has to eat before its fleece grows again.
 */
export function unlock(w: World, id: OpenId) {
  const un = res(w, Unlocks)
  // the first level's card: shearing by hand, nothing to build
  if (id === 'shear') return queueCard(w, 'shear', false)
  if (id === 'market') {
    res(w, GameState).trade = true
    addMarket(w)
    queueCard(w, 'market', false)
    return
  }
  if (id === 'feeder' && !res(w, GameState).food) {
    res(w, GameState).food = true
    // a fluffy sheep's next fleece is the first that needs a meal; a shorn one finishes the fleece it grows
    for (const s of res(w, Flock).sheep) if (s.wool >= 1) s.fed = false
  }
  if (id === 'valenki') {
    if (un.recipes.has('valenki')) return
    un.recipes.add('valenki')
    queueCard(w, 'valenki', false)
    return
  }
  if (id === 'workshop') un.recipes.add('sweater')
  if (un.unlocked.has(id)) return
  queueCard(w, id)
}

/** The hint, once: land running out. */
const EVENT_CARD: Readonly<Record<string, CardId>> = { lowland: 'land' }
/** Something happened for the first time (a building placed, land running low): its card, and what the level opens after it. */
export function fireEvent(w: World, ev: string) {
  const un = res(w, Unlocks)
  if (un.events.has(ev)) return
  un.events.add(ev)
  const c = EVENT_CARD[ev]
  if (c) queueCard(w, c, false)
  const after = LEVELS[res(w, GameState).level]?.after
  if (after && ev === 'placed:' + after.placed) unlock(w, after.open)
}

/** A needed resource on own land is nearly gone and a plot with it is for sale. */
export function lowLand(w: World) {
  const f = res(w, Field)
  const need = ['meadow', ...(res(w, Unlocks).unlocked.has('berry') ? ['bush'] : [])] as ('meadow' | 'bush')[]
  return need.some((t) => {
    let left = 0
    for (const [k, r] of f.res) if (r.t === t && owned(w, ...unkey(k))) left += r.left
    if (left > LOW_LAND) return false
    for (let py = 0; py * GRID.plotH < GRID.roadY; py++) for (let px = 0; px * GRID.plotW < GRID.cols; px++) if (plotOnIsland(w, px, py) && !f.plots.has(key(px, py)) && plotRes(w, px, py)[t]) return true
    return false
  })
}

/** Checks the land hint every two seconds. */
export function landHintSystem(w: World, dt: number) {
  const gs = res(w, GameState)
  gs.landT -= dt
  if (gs.landT > 0) return
  gs.landT = 2
  if (lowLand(w)) fireEvent(w, 'lowland')
}
