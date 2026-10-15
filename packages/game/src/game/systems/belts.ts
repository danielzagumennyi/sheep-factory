import { BELT, BUILDINGS, type Dir } from '../balance'
import { back, beltInDir, entersAt, entersPasture, get, inGrid, isBeltLike, jobOf, pastureAt, speedOf, step } from '../grid'
import { GameState, Plant, float, key, res, toStock, type Building, type Item, type World } from '../world'
import { dockAccept } from './orders'
import { toPasture } from './sheep'

/**
 * Items on belts (GDD 4.2). An item crosses a cell in 1/BELT.speed s, then tries to move on. A belt takes items from
 * one side only (`beltInDir`); joining two lines needs a merger. A splitter sends each item to the side whose rule
 * matches it, round-robin among equals.
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
    // only sheep go into a pasture, and only through its way in (hay and water go to a barn)
    if (!it.sheep || !entersPasture(p, x, y, d)) return false
    toPasture(w, it.sheep, p, tx + 0.5, ty + 0.5)
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
  // a machine takes goods only through its one way in, from behind
  if (!entersAt(t, tx, ty, d)) return false
  return machineAccept(w, t, it)
}

/** A machine takes an item it can use (it came in through the way in, or a hand dropped it there); a barn takes any good. */
export function machineAccept(w: World, m: Building, it: Item): boolean {
  if (m.type === 'barn') {
    if (it.sheep) return false
    toStock(w, it)
    return true
  }
  if (m.type === 'shearer') {
    if (!it.sheep || m.slot) return false
    const s = it.sheep,
      pass = s.wool < 0.95
    s.state = 'machine'
    m.slot = { sheep: s, pass }
    m.timer = m.total = pass ? 0.3 : BUILDINGS.shearer.time! / speedOf(m)
    return true
  }
  const r = jobOf(m)?.inp
  if (r && it.kind !== 'sheep' && r[it.kind]) {
    if ((m.inv[it.kind] ?? 0) >= BELT.bufMax) return false
    m.inv[it.kind] = (m.inv[it.kind] ?? 0) + 1
    return true
  }
  return false
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
    // a good stuck in front of the sheep's path jumps into the stock, so the sheep loop never stops (GDD 4.4)
    if (!it.sheep && b.type === 'belt') {
      const [nx, ny] = step(b.x, b.y, b.dir)
      const nb = inGrid(nx, ny) ? get(w, nx, ny) : null
      if (pastureAt(w, nx, ny) || nb?.type === 'shearer') {
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
  }
  if (gs.strayT > 0) gs.strayT -= dt
}
