import { type BuildingId, type CardId } from '../balance'
import { Unlocks, res, type World } from '../world'

/**
 * New things one at a time (the author: «каждый продукт открывается и объясняется отдельно»): a recipe bought, a kind
 * of sheep starting to arrive, the first steps, the win — each with one «Новое» card; the game pauses while a card is
 * up (GDD 8).
 */

/** Queue a card, once a game. */
export function queueCard(w: World, id: CardId) {
  const un = res(w, Unlocks)
  if (un.seen.has(id)) return
  un.seen.add(id)
  un.cardQ.push(id)
}

/** A recipe's building opens to build, with its card; its tool glows on the hotbar until first picked (GDD 8). */
export function unlock(w: World, id: BuildingId) {
  const un = res(w, Unlocks)
  if (un.unlocked.has(id)) return
  un.unlocked.add(id)
  un.fresh.add(id)
  queueCard(w, id)
}
