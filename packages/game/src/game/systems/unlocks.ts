import { BUILDINGS, GRID, LOW_LAND, ONCE_CARDS, type BuildingId, type CardId } from '../balance'
import { owned, plotRes } from '../grid'
import { Field, GameState, Mission, Unlocks, key, res, unkey, type World } from '../world'

/**
 * Growth one thing at a time (the author: «каждый продукт открывается и объясняется отдельно»). A new building comes
 * with one «Новое» card; the game pauses while a card is up. Mission events (`placed:shearer`, `lowgrass`…) open
 * buildings or cards once.
 */

const CARD_IDS: ReadonlySet<string> = new Set<CardId>([
  'shear',
  'shearer',
  'belt',
  'needs',
  'hay',
  'mower',
  'water',
  'pump',
  'barn',
  'carder',
  'spinner',
  'splitter',
  'merger',
  'felter',
  'dye',
  'berry',
  'extra',
  'land',
  'market',
  'workshop',
  'sweater',
  'valenki',
])
const isCard = (id: string): id is CardId => CARD_IDS.has(id)

/** Queue a card; a building id also unlocks that building (unless `alsoUnlock` is false). */
export function queueCard(w: World, id: CardId | BuildingId, alsoUnlock = true) {
  const un = res(w, Unlocks)
  if (alsoUnlock && id in BUILDINGS) {
    un.unlocked.add(id as BuildingId)
    un.fresh.add(id as BuildingId)
  }
  if (!isCard(id) || un.seen.has(id)) return
  if (ONCE_CARDS.includes(id)) {
    if (un.seenEver.has(id)) return
    un.seenEver.add(id)
    un.shownEver.push(id)
  }
  un.seen.add(id)
  un.cardQ.push(id)
}

export function unlock(w: World, id: BuildingId) {
  if (res(w, Unlocks).unlocked.has(id)) return
  queueCard(w, id)
}

export function fireEvent(w: World, ev: string) {
  const un = res(w, Unlocks)
  if (un.events.has(ev)) return
  un.events.add(ev)
  for (const e of res(w, Mission).def.events)
    if (e.when === ev) {
      if (e.unlock) unlock(w, e.unlock)
      if (e.card) queueCard(w, e.card, false)
    }
}

/** A needed resource on own land is nearly gone (water: there is none at all, since it never runs out) and a plot with it is for sale. */
export function lowLand(w: World) {
  const def = res(w, Mission).def,
    f = res(w, Field)
  const need = [def.needs.food && 'meadow', def.needs.water && 'water', res(w, Unlocks).unlocked.has('berry') && 'bush'].filter(Boolean) as ('meadow' | 'water' | 'bush')[]
  return need.some((t) => {
    let left = 0
    for (const [k, r] of f.res) if (r.t === t && owned(w, ...unkey(k))) left += t === 'water' ? LOW_LAND + 1 : r.left
    if (left > LOW_LAND) return false
    for (let py = 0; py * GRID.plotH < GRID.roadY; py++) for (let px = 0; px * GRID.plotW < GRID.cols; px++) if (!f.plots.has(key(px, py)) && plotRes(w, px, py)[t]) return true
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
