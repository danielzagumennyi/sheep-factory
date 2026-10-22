import { ARRIVE, DROP, GRID, KIND_ORDER, KINDS, SHEEP } from '../balance'
import { Flock, GameState, Rng, makeSheep, res, type World } from '../world'
import { grazeable, scared } from './sheep'
import { queueCard } from './unlocks'

/**
 * Arrivals (GDD 6; the author, 22.10.2026: «одновременно на карте должно быть много овец»). Sheep come down on
 * parachutes to keep the flock at its bar — ARRIVE.bar plus ARRIVE.perShorn for each sheep gone into the portal, up to
 * ARRIVE.most and never past SHEEP.most — one at a time, the whole gap made good in about ARRIVE.refill seconds, so the
 * higher the bar, the quicker they come. With the flock at the bar they wait. Each lands on free ground anywhere, out of
 * scarecrows' circles; its kind is one of those the score has opened (KINDS.at), each as likely. A kind opening comes
 * with its card.
 */

/** How many sheep the map keeps now. */
export const flockBar = (w: World) => Math.min(ARRIVE.most, SHEEP.most, ARRIVE.bar + ARRIVE.perShorn * res(w, GameState).shorn)
/** The kinds the score has opened. */
export const kindsOpen = (w: World) => KIND_ORDER.filter((k) => KINDS[k].at <= res(w, GameState).shorn)
/** The next kind to open and how many more sheep it waits for; null once all are open. */
export function nextKind(w: World) {
  const shorn = res(w, GameState).shorn,
    k = KIND_ORDER.find((q) => KINDS[q].at > shorn)
  return k ? { kind: k, left: KINDS[k].at - shorn } : null
}

export function arriveSystem(w: World, dt: number) {
  const gs = res(w, GameState),
    flock = res(w, Flock).sheep
  const kinds = kindsOpen(w)
  for (const k of kinds) if (k !== 'plain') queueCard(w, k)
  const bar = flockBar(w)
  if (flock.length >= bar) {
    gs.arriveT = 0
    return
  }
  gs.arriveT += dt
  const gap = ARRIVE.refill / bar,
    rnd = res(w, Rng).next
  while (gs.arriveT >= gap && flock.length < bar) {
    gs.arriveT -= gap
    const at = landing(w)
    if (!at) break
    const s = makeSheep(w, kinds[Math.floor(rnd() * kinds.length)]!, at)
    s.drop = DROP.fall + DROP.land
    flock.push(s)
  }
}

/** A free cell for a sheep to come down on, anywhere on the map out of the scarecrows' circles; null when none was found. */
function landing(w: World) {
  const rnd = res(w, Rng).next
  for (let t = 0; t < 24; t++) {
    const x = 1 + Math.floor(rnd() * (GRID.cols - 2)),
      y = 1 + Math.floor(rnd() * (GRID.rows - 2))
    if (grazeable(w, x, y) && !scared(w, x + 0.5, y + 0.5)) return { x: x + 0.3 + rnd() * 0.4, y: y + 0.3 + rnd() * 0.4 }
  }
  return null
}
