import { BELT, BUILDINGS, type Dir } from '../balance'
import { back, beltInDir, entersAt, entersPasture, get, inGrid, isBeltLike, isStation, pastureAt, step, usesGood } from '../grid'
import { GameState, Plant, float, key, res, toStock, type Building, type Item, type World } from '../world'
import { stationTake } from './machines'
import { dockAccept } from './village'
import { crossPen, toPasture } from './sheep'

/**
 * Items on belts (GDD 4.2). An item crosses a cell in 1/BELT.speed s, then tries to move on. A belt takes items from
 * one side only (`beltInDir`); joining two lines needs a merger. A splitter sends each item to the side whose rule
 * matches it, round-robin among equals. A machine takes a good only by the way in meant for it.
 */

export function enterBelt(it: Item, d: Dir) {
  it.p = 0
  it.ed = d
  it.strayT = 0
  if (it.sheep) it.sheep.state = 'belt'
}

/** Push an item from (x, y) into the neighbour towards d. True when it was taken. */
export function tryPush(w: World, it: Item, x: number, y: number, d: Dir): boolean {
  const [tx, ty] = step(x, y, d)
  const p = pastureAt(w, tx, ty)
  if (p) {
    // only sheep go into a pen, and only through its way in: its own sheep stay home, any other crosses it to its way
    // out and rides on (several pens may share one loop), while that way out leads somewhere
    if (!it.sheep || !entersPasture(p, x, y, d)) return false
    if (it.sheep.home === p.id) toPasture(w, it.sheep, p, tx + 0.5, ty + 0.5)
    else if (!crossPen(w, it.sheep, p, tx + 0.5, ty + 0.5)) return false
    return true
  }
  if (!inGrid(tx, ty)) return false
  const t = get(w, tx, ty)
  if (!t) return false
  if (t.type === 'merger') {
    if (t.dir === back(d) || t.buf.length >= BELT.mergerBuf) return false
    enterBelt(it, d)
    t.buf.push(it)
    return true
  }
  if (t.type === 'splitter') {
    if (d !== t.dir || t.item) return false
    enterBelt(it, d)
    t.item = it
    return true
  }
  if (t.type === 'belt') {
    if (t.item || t.dir === back(d) || d !== beltInDir(w, t)) return false
    enterBelt(it, d)
    t.item = it
    return true
  }
  if (t.type === 'dock') return dockAccept(w, t, it)
  const way = entersAt(t, tx, ty, d)
  if (!way) return false
  return machineAccept(w, t, it, way === true ? undefined : way.takes)
}

/**
 * A machine takes an item by one of its ways in (`takes` says what that way takes; a hand dropping a sheep gives
 * 'sheep'): a station its sheep, or its good up to BELT.bufMax; any other machine a good one of its jobs uses.
 */
export function machineAccept(_w: World, m: Building, it: Item, takes?: string): boolean {
  if (it.sheep) return takes === 'sheep' && isStation(m) && stationTake(m, it.sheep)
  if (takes === 'sheep') return false
  const kind = it.kind as Exclude<Item['kind'], 'sheep'>
  if (takes ? takes !== kind : !usesGood(m, kind)) return false
  if (!takes && BUILDINGS[m.type as keyof typeof BUILDINGS]?.station) return false
  if ((m.inv[kind] ?? 0) >= BELT.bufMax) return false
  m.inv[kind] = (m.inv[kind] ?? 0) + 1
  return true
}

const SPLIT_OUT = { f: 0, r: 1, l: 3 } as const
function routeSplit(w: World, b: Building, it: Item) {
  const own: Dir[] = [],
    any: Dir[] = []
  for (const k of ['l', 'f', 'r'] as const) {
    const rule = b.rules![k],
      d = ((b.dir + SPLIT_OUT[k]) % 4) as Dir
    if (rule === 'any') any.push(d)
    else if (rule !== 'off' && rule === it.kind) own.push(d)
  }
  const main = own.length ? own : any
  for (let i = 0; i < main.length; i++) {
    const d = main[(b.rr + i) % main.length]!
    if (tryPush(w, it, b.x, b.y, d)) {
      b.rr = (b.rr + i + 1) % main.length
      return true
    }
  }
  if (own.length) for (const d of any) if (tryPush(w, it, b.x, b.y, d)) return true
  return false
}

/** Does the cell ahead of a belt lead into the sheep's lane: a pen, or a station's way in for sheep? */
function sheepLaneAhead(w: World, b: Building) {
  const [nx, ny] = step(b.x, b.y, b.dir)
  if (pastureAt(w, nx, ny)) return true
  const nb = inGrid(nx, ny) ? get(w, nx, ny) : null
  if (!nb || !isStation(nb)) return false
  const way = entersAt(nb, nx, ny, b.dir)
  return !!way && way !== true && way.takes === 'sheep'
}

export function beltSystem(w: World, dt: number) {
  const gs = res(w, GameState)
  for (const b of res(w, Plant).b.values()) {
    if (b.type === 'merger') {
      const it = b.buf[0]
      if (!it) continue
      if (it.p < 1) it.p = Math.min(1, it.p + BELT.speed * dt)
      if (it.p >= 1 && tryPush(w, it, b.x, b.y, b.dir)) b.buf.shift()
      continue
    }
    if (!isBeltLike(b)) continue
    // a belt runs all the time, loaded or empty (the author)
    b.phase = (b.phase + dt * 0.9) % 1
    const it = b.item
    if (!it) continue
    if (it.p < 1) {
      it.p = Math.min(1, it.p + BELT.speed * dt)
      continue
    }
    const pushed = b.type === 'splitter' ? routeSplit(w, b, it) : tryPush(w, it, b.x, b.y, b.dir)
    if (pushed) {
      b.item = null
      continue
    }
    // a good stuck in front of the sheep's lane jumps into the stock, so the sheep loop never stops (GDD 4.4)
    if (!it.sheep && b.type === 'belt' && sheepLaneAhead(w, b)) {
      it.strayT += dt
      if (it.strayT > BELT.strayAfter) {
        toStock(w, it)
        b.item = null
        gs.strayAt = key(b.x, b.y)
        gs.strayT = 6
        float(w, b.x + 0.5, b.y, 'toHand', 'bad')
      }
    }
  }
  if (gs.strayT > 0) gs.strayT -= dt
}
