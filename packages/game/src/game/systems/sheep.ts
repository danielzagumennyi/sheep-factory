import { DIRS, SHEEP, type Dir } from '../balance'
import { get, inGrid, isStation, outCells, pastureAt, step } from '../grid'
import { Flock, GameState, Plant, Rng, Time, key, newItem, pastureSpot, penOf, res, type Building, type PastureT, type SheepT, type World } from '../world'
import { tryPush } from './belts'

/**
 * Sheep and pens (GDD 5). Until food comes into the game (the feeder's level) a shorn sheep grows its next fleece by
 * itself; from then on only once it has eaten: at a feeder on the loop, or from the hand. A fluffy sheep walks out
 * through its pen's exit by itself when a belt or a station stands there; so does a hungry one when its pen's loop has
 * a feeder with hay, to eat on its way round. Otherwise it waits in the pen. A pen takes in four sheep at most.
 */

/** A sheep in its pen, shorn, that hasn't eaten. */
export const hungry = (s: SheepT) => s.state === 'pasture' && s.wool < 1 && !s.fed

export function toPasture(w: World, s: SheepT, p: PastureT, x: number, y: number) {
  s.state = 'pasture'
  s.home = p.id
  s.via = null
  s.px = Math.min(p.x + p.w - 0.28, Math.max(p.x + 0.28, x))
  s.py = Math.min(p.y + p.h - 0.4, Math.max(p.y + 0.3, y))
  const t = pastureSpot(w, p)
  s.tx = t.x
  s.ty = t.y
  s.waitAt = null
}

/**
 * A sheep comes into a pen that is not its own (the author, 17.10.2026: several pens may share one loop): it crosses
 * the pen to its way out and rides on home. Only while that way out leads onto a belt or a station, and while few
 * others are crossing; otherwise it waits on the belt. True when it went in.
 */
export function crossPen(w: World, s: SheepT, p: PastureT, x: number, y: number) {
  const out = inGrid(p.exit.x, p.exit.y) ? get(w, p.exit.x, p.exit.y) : null
  if (!out || out.type === 'dock') return false
  if (res(w, Flock).sheep.filter((q) => q.state === 'transit' && q.via === p.id).length >= SHEEP.transitMax) return false
  s.state = 'transit'
  s.via = p.id
  s.px = x
  s.py = y
  const [dx, dy] = DIRS[p.dir]!
  s.tx = p.exit.x - dx + 0.5
  s.ty = p.exit.y - dy + 0.5
  s.waitAt = null
  return true
}

export function sendHome(w: World, s: SheepT) {
  const flock = res(w, Flock)
  const p = penOf(w, s.home) ?? flock.pastures[0]
  if (!p) return
  const t = pastureSpot(w, p)
  toPasture(w, s, p, t.x, t.y)
}

/** The feeder on the way out of a pen, before the way comes back in — through any other pens the loop crosses. */
function traceFeeder(w: World, p: PastureT): Building | null {
  let x = p.exit.x,
    y = p.exit.y
  for (let i = 0; i < 200; i++) {
    const pen = pastureAt(w, x, y)
    if (pen) {
      // home again; or another pen on the loop, crossed from its way in to its way out
      if (pen === p) return null
      ;[x, y] = [pen.exit.x, pen.exit.y]
      continue
    }
    const b = inGrid(x, y) ? get(w, x, y) : null
    if (!b || b.type === 'dock') return null
    if (b.type === 'feeder') return b
    if (isStation(b)) {
      const c = outCells(b).find((o) => o.d === b.dir)
      if (!c) return null
      ;[x, y] = [c.x, c.y]
    } else [x, y] = step(x, y, b.dir)
  }
  return null
}
const feederSeen = new WeakMap<PastureT, { t: number; f: Building | null }>()
/**
 * The pen's loop has a feeder with hay in it (the loop looked up once a second). A hungry sheep goes out only then: with
 * the feeder empty it waits at home, where the hand can feed it.
 */
export function loopHasFeeder(w: World, p: PastureT) {
  const t = res(w, Time).t
  let c = feederSeen.get(p)
  if (!c || t - c.t >= 1) {
    c = { t, f: traceFeeder(w, p) }
    feederSeen.set(p, c)
  }
  return !!c.f && (c.f.inv.hay ?? 0) > 0 && res(w, Plant).b.get(key(c.f.x, c.f.y)) === c.f
}

export function sheepSystem(w: World, dt: number) {
  const flock = res(w, Flock),
    food = res(w, GameState).food
  for (const p of flock.pastures) if (p.exitT > 0) p.exitT -= dt
  for (const s of flock.sheep) {
    if (s.state === 'transit') {
      crossing(w, s, dt)
      continue
    }
    if (s.state !== 'pasture') continue
    const p = penOf(w, s.home)
    if (!p) continue
    if (s.fed && s.wool < 1) {
      s.wool = Math.min(1, s.wool + dt / SHEEP.grow)
      // the fleece is grown: the next one needs another meal, once sheep need food at all
      if (s.wool >= 1) s.fed = !food
    }
    const feeder = hungry(s) && loopHasFeeder(w, p)
    // a fluffy sheep walks out by itself when the exit has a belt or a station; a hungry one too when its loop has a feeder
    const out = (s.wool >= 1 && s.clicks === 0) || feeder
    if (out && p.exitT <= 0) {
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
  // a sheep waiting beside a removed station goes home
  const plant = res(w, Plant)
  for (const s of flock.sheep) if (s.state === 'waiting' && s.waitAt && !plant.b.get(s.waitAt)) sendHome(w, s)
}

/** A sheep crossing another pen walks briskly to its way out and leaves by it as soon as the gate is free. */
function crossing(w: World, s: SheepT, dt: number) {
  const p = s.via === null ? null : penOf(w, s.via)
  if (!p) return sendHome(w, s)
  const dx = s.tx - s.px,
    dy = s.ty - s.py,
    dist = Math.hypot(dx, dy)
  if (dist > 0.05) {
    const v = Math.min(dist, SHEEP.transit * dt)
    s.px += (dx / dist) * v
    s.py += (dy / dist) * v
    s.face = (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3) as Dir
    return
  }
  if (p.exitT > 0) return
  const [ox, oy] = DIRS[p.dir]!
  if (tryPush(w, newItem('sheep', s), p.exit.x - ox, p.exit.y - oy, p.dir)) {
    s.via = null
    p.exitT = SHEEP.exitGap
  }
}
