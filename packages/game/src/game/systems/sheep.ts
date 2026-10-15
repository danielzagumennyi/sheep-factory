import { DIRS, SHEEP, type Dir, type ItemId } from '../balance'
import { get, inGrid } from '../grid'
import { Flock, Mission, Plant, Rng, newItem, pastureSpot, res, stockOf, stockTake, type PastureT, type SheepT, type World } from '../world'
import { tryPush } from './belts'
import { fireEvent } from './unlocks'

/**
 * Sheep and pastures (GDD 5). A pasture works like a machine with a recipe, «1 hay + 1 water → a fleece»: a shorn
 * sheep in it takes one hay and one water from the stock and then grows its wool in SHEEP.grow seconds (the author:
 * «сено и воду потребляло пастбище в зависимости от того сколько в нём животных»). With too little in stock it waits,
 * and whoever has waited longest is fed first — across every pasture, since the stock is one. A fleece already paid
 * for always grows to the end. A fluffy sheep walks out through the exit by itself when a belt or a shearer stands
 * there.
 */

/** The goods one fleece costs in this mission (none on mission 1). */
export function fleeceCost(w: World): ItemId[] {
  const needs = res(w, Mission).def.needs
  return [...(needs.food ? (['hay'] as const) : []), ...(needs.water ? (['water'] as const) : [])]
}
/** A sheep in the pasture waiting for its hay and water. */
export const hungry = (s: SheepT) => s.state === 'pasture' && s.wool < 1 && !s.fed

export function toPasture(w: World, s: SheepT, p: PastureT, x: number, y: number) {
  s.state = 'pasture'
  s.home = p.id
  s.px = Math.min(p.x + p.w - 0.28, Math.max(p.x + 0.28, x))
  s.py = Math.min(p.y + p.h - 0.6, Math.max(p.y + 0.3, y))
  const t = pastureSpot(w, p)
  s.tx = t.x
  s.ty = t.y
  s.waitAt = null
}

export function sendHome(w: World, s: SheepT) {
  const flock = res(w, Flock)
  const p = flock.pastures[s.home] ?? flock.pastures[0]!
  const t = pastureSpot(w, p)
  toPasture(w, s, p, t.x, t.y)
}

export function sheepSystem(w: World, dt: number) {
  const flock = res(w, Flock),
    cost = fleeceCost(w)
  for (const p of flock.pastures) {
    if (p.exitT > 0) p.exitT -= dt
    p.want = []
  }
  // the hungry, longest wait first, one queue for every pasture: each takes its fleece's goods while the stock has them
  const queue = flock.sheep.filter(hungry).sort((a, b) => b.waitT - a.waitT)
  for (const s of queue) {
    s.waitT += dt
    const lack = cost.filter((k) => stockOf(w, k) < 1)
    if (lack.length) {
      const p = flock.pastures[s.home]!
      for (const k of lack) if (!p.want.includes(k)) p.want.push(k)
      continue
    }
    for (const k of cost) stockTake(w, k, 1)
    s.fed = true
    s.waitT = 0
  }
  for (const p of flock.pastures) for (const k of p.want) fireEvent(w, k === 'hay' ? 'lowhay' : 'lowwater')
  for (const s of flock.sheep) {
    if (s.state !== 'pasture') continue
    const p = flock.pastures[s.home]!
    if (s.fed && s.wool < 1) {
      s.wool = Math.min(1, s.wool + dt / SHEEP.grow)
      // the fleece is grown: the next one is paid for when it has been shorn
      if (s.wool >= 1) s.fed = false
    }
    // a fluffy sheep walks out by itself when the exit has a belt or a shearer
    if (s.wool >= 1 && s.clicks === 0 && p.exitT <= 0) {
      const ex = p.exit,
        sx = ex.x - DIRS[p.dir]![0],
        sy = ex.y - DIRS[p.dir]![1]
      const t = inGrid(ex.x, ex.y) ? get(w, ex.x, ex.y) : null
      if (t && t.type !== 'dock' && tryPush(w, newItem('sheep', s), sx, sy, p.dir)) {
        p.exitT = SHEEP.exitGap
        continue
      }
    }
    s.wanderT -= dt
    if (s.wanderT <= 0) {
      const t = pastureSpot(w, p)
      s.tx = t.x
      s.ty = t.y
      s.wanderT = 2 + res(w, Rng).next() * 3
    }
    const dx = s.tx - s.px,
      dy = s.ty - s.py,
      dist = Math.hypot(dx, dy)
    if (dist > 0.02) {
      const v = Math.min(dist, SHEEP.walk * dt)
      s.px += (dx / dist) * v
      s.py += (dy / dist) * v
      s.face = (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3) as Dir
    }
  }
  // a sheep waiting beside a removed shearer goes home
  const plant = res(w, Plant)
  for (const s of flock.sheep) if (s.state === 'waiting' && s.waitAt && !plant.b.get(s.waitAt)) sendHome(w, s)
}
