import { BUILDINGS, CARROT, DROP, GRID, LOOK, ROAM, SCARE, SHEEP, type BuildingId, type Dir } from '../balance'
import { get, inGrid, isBeltLike, levelAt, terr } from '../grid'
import { Flock, GameState, Plant, Rng, Time, Ui, puff, res, type Building, type SheepT, type World } from '../world'

/**
 * Sheep (GDD 5). A sheep roams the map and grazes: now and then it walks a little way to a spot it can reach straight.
 * A fluffy one within a carrot's circle walks to the carrot instead and crowds round it (GDD 4.5), where the carrot
 * puts it onto its belt (systems/machines.ts); one within a scarecrow's circle walks out of it and never picks a spot in
 * one (GDD 4.6). Built over, it runs to the nearest free ground. The sheep under the hand stands still (the author,
 * 19.10.2026: «при наведении овца останавливается»). A sheep coming down on its parachute does nothing till it lands.
 */

/** Ground a roaming sheep may stop on: on the map, not up a hill, nothing built, none of ROAM's blocking ground. */
export function grazeable(w: World, x: number, y: number) {
  return inGrid(x, y) && levelAt(w, x, y) === 1 && !get(w, x, y) && !ROAM.blocking.includes(terr(w, x, y) as never)
}
/** Ground it may walk over: that, or a belt, a splitter or a merger (it steps over them). Never up a hill. */
function walkable(w: World, x: number, y: number) {
  if (!inGrid(x, y) || levelAt(w, x, y) > 1 || ROAM.blocking.includes(terr(w, x, y) as never)) return false
  const b = get(w, x, y)
  return !b || isBeltLike(b)
}
/** A spot with free ground all round it, ROAM.room cells each way: a sheep there stands clear of buildings. */
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
/** The middle of the free ground nearest to a point; null when there is none. */
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

/**
 * The carrots and the scarecrows standing now, by their middles — looked up again only when a building is set down,
 * taken off or turned (a big flock asked every sheep's wander).
 */
const placed = new WeakMap<World, { v: number; lures: { x: number; y: number; b: Building }[]; scares: { x: number; y: number }[] }>()
function circles(w: World) {
  const v = res(w, GameState).plantVersion
  let c = placed.get(w)
  if (!c || c.v !== v) {
    c = { v, lures: [], scares: [] }
    for (const b of res(w, Plant).b.values()) {
      if (b.type === 'dock') continue
      const def = BUILDINGS[b.type as BuildingId]
      if (def.lure) c.lures.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, b })
      else if (def.scare) c.scares.push({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
    }
    placed.set(w, c)
  }
  return c
}
/** The carrots standing now, by their middles (GDD 4.5). */
export const lures = (w: World) => circles(w).lures
/** Is the point within a scarecrow's circle (GDD 4.6)? */
export function scared(w: World, x: number, y: number) {
  for (const s of circles(w).scares) if ((s.x - x) ** 2 + (s.y - y) ** 2 < SCARE.radius * SCARE.radius) return true
  return false
}
/** The scarecrow whose circle the point is in, if any. */
function scarer(w: World, x: number, y: number) {
  return circles(w).scares.find((s) => (s.x - x) ** 2 + (s.y - y) ** 2 < SCARE.radius * SCARE.radius) ?? null
}
/** The nearest carrot whose circle reaches the point, if any. */
function lureFor(w: World, x: number, y: number) {
  let best: { x: number; y: number } | null = null,
    bd = CARROT.radius * CARROT.radius
  for (const l of circles(w).lures) {
    const d = (l.x - x) ** 2 + (l.y - y) ** 2
    if (d <= bd) {
      bd = d
      best = l
    }
  }
  return best
}

/** A sheep put down, let out of a station with no belt, or built over roams from a point — from the nearest free ground if that is not. */
export function toRoam(w: World, s: SheepT, x: number, y: number) {
  const at = grazeable(w, Math.floor(x), Math.floor(y)) ? { x, y } : nearestGround(w, x, y)
  s.state = 'roam'
  if (at) {
    s.px = at.x
    s.py = at.y
  }
  s.tx = s.px
  s.ty = s.py
  s.wanderT = ROAM.rest
}

/** A roaming sheep standing where it may not (built over) runs to the nearest free ground. True when it had to. */
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

/** A new spot for a roaming sheep: by a carrot that calls it, out of a scarecrow's circle, or a little way off at random. */
function pickSpot(w: World, s: SheepT) {
  const rnd = res(w, Rng).next
  // in a scarecrow's circle: straight out of it, a little past its edge
  const sc = scarer(w, s.px, s.py)
  if (sc) {
    const a = Math.atan2(s.py - sc.y, s.px - sc.x)
    for (let i = 0; i < ROAM.tries; i++) {
      const b = a + (rnd() * 2 - 1) * ROAM.scareSpread * (1 + i / 3),
        r = SCARE.radius + ROAM.scarePast + rnd()
      const tx = sc.x + Math.cos(b) * r,
        ty = sc.y + Math.sin(b) * r
      if (roomy(w, tx, ty) && clearWay(w, s.px, s.py, tx, ty) && !scared(w, tx, ty)) return { x: tx, y: ty, rest: ROAM.rest }
    }
  }
  // a fluffy one in a carrot's circle: to a place in the crowd round it
  const l = s.wool >= 1 ? lureFor(w, s.px, s.py) : null
  if (l)
    for (let i = 0; i < ROAM.tries; i++) {
      const a = rnd() * Math.PI * 2,
        r = CARROT.near + rnd() * (CARROT.crowd - CARROT.near)
      const tx = l.x + Math.cos(a) * r,
        ty = l.y + Math.sin(a) * r
      if (roomy(w, tx, ty) && clearWay(w, s.px, s.py, tx, ty) && !scared(w, tx, ty)) return { x: tx, y: ty, rest: ROAM.lureRest }
    }
  for (let i = 0; i < ROAM.tries; i++) {
    const tx = s.px + (rnd() * 2 - 1) * ROAM.reach,
      ty = s.py + (rnd() * 2 - 1) * ROAM.reach
    if (roomy(w, tx, ty) && clearWay(w, s.px, s.py, tx, ty) && !scared(w, tx, ty)) return { x: tx, y: ty, rest: ROAM.rest + rnd() * ROAM.restMore }
  }
  return null
}

/** A roaming sheep: grazes; now and then walks to a new spot (pickSpot); under the hand (`still`) it stands. */
function roam(w: World, s: SheepT, dt: number, still: boolean, tick: number) {
  // its ground gone from under it some other way (shooRoamers sees to building), or a scarecrow put by it: it looks a few
  // times a second, a big roaming flock's step was mostly this
  if ((tick + s.id) % ROAM.look === 0) {
    if (runOff(w, s)) return
    if (scared(w, s.tx, s.ty)) s.wanderT = 0
  }
  if (still) {
    s.tx = s.px
    s.ty = s.py
    return
  }
  s.wanderT -= dt
  if (s.wanderT <= 0) {
    const spot = pickSpot(w, s)
    if (spot) {
      s.tx = spot.x
      s.ty = spot.y
      s.wanderT = spot.rest
    } else s.wanderT = ROAM.rest
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
 * A sheep coming down on its parachute (DROP): touching the grass it raises a puff of wool. Arrivals go on all game, a
 * thousand of them: no sound, no heart.
 */
function land(w: World, s: SheepT, dt: number) {
  const was = s.drop!
  s.drop = was - dt
  if (was > DROP.land && s.drop <= DROP.land) puff(w, s.px, s.py, LOOK.wool, 6)
  if (s.drop <= 0) delete s.drop
}

export function sheepSystem(w: World, dt: number) {
  // the sheep the hand is over (Hover.tsx keeps it; none headless), and the step's number
  const under = res(w, Ui).hover?.sheep ?? null,
    tick = res(w, Time).frame
  for (const s of res(w, Flock).sheep) {
    if (s.drop !== undefined) land(w, s, dt)
    else if (s.state === 'roam') roam(w, s, dt, s.id === under, tick)
  }
}
