import { DIRS, DROP, GRID, LOOK, ROAM, SHEEP, type Dir } from '../balance'
import { get, inGrid, isBeltLike, isStation, levelAt, outCells, owned, pastureAt, step, terr } from '../grid'
import { Flock, GameState, Plant, Rng, Time, Ui, float, key, newItem, pastureSpot, penOf, puff, res, sound, type Building, type PastureT, type SheepT, type World } from '../world'
import { tryPush } from './belts'

/**
 * Sheep and pens (GDD 5). A sheep with no pen roams the own land and grazes (ROAM): the game starts so, and a sheep a
 * station lets out with no belt to take it roams off; the player carries it into a pen. In a pen, until food comes
 * into the game (the feeder's level) a shorn sheep grows its next fleece by itself; from then on only once it has
 * eaten: at a feeder on the loop, or from the hand. A fluffy sheep walks out through its pen's exit by itself when a
 * belt or a station stands there; so does a hungry one when its pen's loop has a feeder with hay, to eat on its way
 * round. Otherwise it waits in the pen. A pen takes in four sheep at most. The sheep under the hand stands still, in a
 * pen or roaming, so it is easy to click and to take (the author, 19.10.2026: «при наведении овца останавливается»).
 */

/** A sheep in its pen, shorn, that hasn't eaten. */
export const hungry = (s: SheepT) => s.state === 'pasture' && s.wool < 1 && !s.fed

export function toPasture(w: World, s: SheepT, p: PastureT, x: number, y: number) {
  s.state = 'pasture'
  s.home = p.id
  s.via = null
  s.px = Math.min(p.x + p.w - 0.28, Math.max(p.x + 0.28, x))
  s.py = Math.min(p.y + p.h - 0.4, Math.max(p.y + 0.3, y))
  const t = pastureSpot(w, p, s)
  s.tx = t.x
  s.ty = t.y
}

/** Ground a roaming sheep may stop on: own land with nothing built, no pen, none of ROAM's blocking ground. */
export function grazeable(w: World, x: number, y: number) {
  return inGrid(x, y) && owned(w, x, y) && levelAt(w, x, y) === 1 && !get(w, x, y) && !pastureAt(w, x, y) && !ROAM.blocking.includes(terr(w, x, y) as never)
}
/** Ground it may walk over: that, or a belt, a splitter or a merger (it steps over them). Never up a hill. */
function walkable(w: World, x: number, y: number) {
  if (!inGrid(x, y) || !owned(w, x, y) || levelAt(w, x, y) > 1 || pastureAt(w, x, y) || ROAM.blocking.includes(terr(w, x, y) as never)) return false
  const b = get(w, x, y)
  return !b || isBeltLike(b)
}
/** A spot with free ground all round it, ROAM.room cells each way: a sheep there stands clear of fences and buildings. */
const roomy = (w: World, x: number, y: number) =>
  grazeable(w, Math.floor(x - ROAM.room), Math.floor(y - ROAM.room)) &&
  grazeable(w, Math.floor(x + ROAM.room), Math.floor(y - ROAM.room)) &&
  grazeable(w, Math.floor(x - ROAM.room), Math.floor(y + ROAM.room)) &&
  grazeable(w, Math.floor(x + ROAM.room), Math.floor(y + ROAM.room))
/** The straight way from one point to another is walkable all along. */
function clearWay(w: World, x0: number, y0: number, x1: number, y1: number) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.2)
  for (let i = 1; i <= n; i++) if (!walkable(w, Math.floor(x0 + ((x1 - x0) * i) / n), Math.floor(y0 + ((y1 - y0) * i) / n))) return false
  return true
}
/** The middle of the free ground nearest to a point; null when the own land has none. */
export function nearestGround(w: World, x: number, y: number) {
  const cx = Math.floor(x),
    cy = Math.floor(y)
  for (let r = 0; r < GRID.cols; r++) {
    let best: { x: number; y: number } | null = null,
      bd = Infinity
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !grazeable(w, cx + dx, cy + dy)) continue
        const d = Math.hypot(cx + dx + 0.5 - x, cy + dy + 0.5 - y)
        if (d < bd) {
          bd = d
          best = { x: cx + dx + 0.5, y: cy + dy + 0.5 }
        }
      }
    if (best) return best
  }
  return null
}

/** A sheep put down, let out of a station or left with no pen roams from a point — from the nearest free ground if that is not. It belongs to no pen. */
export function toRoam(w: World, s: SheepT, x: number, y: number) {
  const at = grazeable(w, Math.floor(x), Math.floor(y)) ? { x, y } : nearestGround(w, x, y)
  s.state = 'roam'
  s.home = 0
  s.via = null
  if (at) {
    s.px = at.x
    s.py = at.y
  }
  s.tx = s.px
  s.ty = s.py
  s.wanderT = ROAM.rest
}

/** A roaming sheep standing where it may not (built over, a pen put down on it) runs to the nearest free ground. True when it had to. */
function runOff(w: World, s: SheepT) {
  if (walkable(w, Math.floor(s.px), Math.floor(s.py))) return false
  const at = nearestGround(w, s.px, s.py)
  if (!at) return true
  puff(w, s.px, s.py, LOOK.wool, 3)
  s.px = s.tx = at.x
  s.py = s.ty = at.y
  return true
}
/** Something was built or put down: the roaming sheep it stands on run off at once. */
export function shooRoamers(w: World) {
  for (const s of res(w, Flock).sheep) if (s.state === 'roam' && s.drop === undefined) runOff(w, s)
}

/** A roaming sheep: grazes and grows its fleece, now and then walks a little way to a spot it can reach straight; under the hand (`still`) it stands. */
function roam(w: World, s: SheepT, dt: number, still: boolean, tick: number) {
  if (s.wool < 1) {
    s.wool = Math.min(1, s.wool + dt / SHEEP.grow)
    // it has grazed: put into a pen, its next fleece still grows once without a meal
    if (s.wool >= 1) s.fed = true
  }
  // its ground gone from under it some other way (shooRoamers sees to building): it looks a few times a second, a big
  // roaming flock's step was mostly this
  if ((tick + s.id) % ROAM.look === 0 && runOff(w, s)) return
  if (still) return stand(s)
  s.wanderT -= dt
  if (s.wanderT <= 0) {
    const rnd = res(w, Rng).next
    s.wanderT = ROAM.rest + rnd() * ROAM.restMore
    for (let i = 0; i < ROAM.tries; i++) {
      const tx = s.px + (rnd() * 2 - 1) * ROAM.reach,
        ty = s.py + (rnd() * 2 - 1) * ROAM.reach
      if (!roomy(w, tx, ty) || !clearWay(w, s.px, s.py, tx, ty)) continue
      s.tx = tx
      s.ty = ty
      break
    }
  }
  const dx = s.tx - s.px,
    dy = s.ty - s.py,
    dist = Math.hypot(dx, dy)
  if (dist <= 0.02) return
  const v = Math.min(dist, SHEEP.walk * dt),
    nx = s.px + (dx / dist) * v,
    ny = s.py + (dy / dist) * v
  // something was built on its way: it stops and looks for another spot (looked at as it steps onto the next cell)
  if ((Math.floor(nx) !== Math.floor(s.px) || Math.floor(ny) !== Math.floor(s.py)) && !walkable(w, Math.floor(nx), Math.floor(ny))) {
    s.tx = s.px
    s.ty = s.py
    s.wanderT = Math.min(s.wanderT, 0.5)
    return
  }
  s.px = nx
  s.py = ny
  s.face = (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3) as Dir
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
  return true
}

/** A sheep into a pen, at a spot of its own there. */
export function penIn(w: World, s: SheepT, p: PastureT) {
  const t = pastureSpot(w, p, s)
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

/** A sheep coming down on its parachute (DROP): touching the grass it raises a puff of wool, with a thump and a heart. */
function land(w: World, s: SheepT, dt: number) {
  const was = s.drop!
  s.drop = was - dt
  if (was > DROP.land && s.drop <= DROP.land) {
    puff(w, s.px, s.py, LOOK.wool, 10)
    sound(w, 'place')
    float(w, s.px, s.py, '♥', 'accent')
  }
  if (s.drop <= 0) delete s.drop
}

/** The pens' sheep by pen, and the pens whose way out is shut, for the step under way (`sheepSystem`). */
const homes = new Map<number, SheepT[]>()
const shut = new Set<PastureT>()

/** It stops where it is: the way it was going is dropped, it picks a new one once its rest is over. */
function stand(s: SheepT) {
  s.tx = s.px
  s.ty = s.py
}

export function sheepSystem(w: World, dt: number) {
  const flock = res(w, Flock),
    food = res(w, GameState).food
  // the sheep the hand is over (Hover.tsx keeps it; none headless), and the step's number
  const under = res(w, Ui).hover?.sheep ?? null,
    frameNo = res(w, Time).frame
  for (const p of flock.pastures) if (p.exitT > 0) p.exitT -= dt
  // each pen's sheep, gathered once a step: one looking for a new spot weighs only its pen-mates (it looked through the
  // whole flock, every sheep — a big flock's step grew as its square)
  homes.clear()
  for (const s of flock.sheep)
    if (s.state === 'pasture') {
      const mates = homes.get(s.home)
      if (mates) mates.push(s)
      else homes.set(s.home, [s])
    }
  // a pen whose way out refused a sheep this step refuses the rest the same (a belt or a station takes any sheep or none)
  shut.clear()
  for (const s of flock.sheep) {
    // a bought sheep comes down first: nothing else happens to it till it has landed
    if (s.drop !== undefined) {
      land(w, s, dt)
      continue
    }
    if (s.state === 'transit') {
      crossing(w, s, dt)
      continue
    }
    if (s.state === 'roam') {
      roam(w, s, dt, s.id === under, frameNo)
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
    // under the hand it neither walks nor goes out
    if (s.id === under) {
      stand(s)
      continue
    }
    const feeder = hungry(s) && loopHasFeeder(w, p)
    // a fluffy sheep walks out by itself when the exit has a belt or a station; a hungry one too when its loop has a feeder
    const out = (s.wool >= 1 && s.clicks === 0) || feeder
    if (out && p.exitT <= 0 && !shut.has(p)) {
      const ex = p.exit,
        sx = ex.x - DIRS[p.dir]![0],
        sy = ex.y - DIRS[p.dir]![1]
      const t = inGrid(ex.x, ex.y) ? get(w, ex.x, ex.y) : null
      if (t && t.type !== 'dock' && tryPush(w, newItem('sheep', s), sx, sy, p.dir)) {
        p.exitT = SHEEP.exitGap
        continue
      }
      shut.add(p)
    }
    s.wanderT -= dt
    if (s.wanderT <= 0) {
      const t = pastureSpot(w, p, s, homes.get(p.id))
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
}

/** A sheep crossing another pen walks briskly to its way out and leaves by it as soon as the gate is free; with that pen gone, it roams from where it is. */
function crossing(w: World, s: SheepT, dt: number) {
  const p = s.via === null ? null : penOf(w, s.via)
  if (!p) return toRoam(w, s, s.px, s.py)
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
