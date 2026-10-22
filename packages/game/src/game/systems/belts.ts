import { BELT, type Dir } from '../balance'
import { back, beltInDir, entersAt, get, inGrid, isBeltLike, isStation, step } from '../grid'
import { Plant, ready, res, type Building, type Item, type SheepT, type SplitRule, type World } from '../world'
import { stationTake } from './machines'
import { dockAccept } from './portal'

/**
 * Sheep on belts (GDD 4.2). A sheep crosses a cell in 1/BELT.speed s, then tries to move on. A belt takes from one side
 * only (`beltInDir`); joining two lines needs a merger. A splitter sends each sheep to the side whose rule fits what it
 * needs now (GDD 4.4), round-robin among equals. A station takes only the sheep its job is for, the portal only shorn
 * ones: any other stands at the way in, and the line behind it stands (GDD 4.3).
 */

export function enterBelt(it: Item, d: Dir) {
  it.p = 0
  it.ed = d
  it.sheep.state = 'belt'
}

/** Push a sheep from (x, y) into the neighbour towards d. True when it was taken. */
export function tryPush(w: World, it: Item, x: number, y: number, d: Dir): boolean {
  const [tx, ty] = step(x, y, d)
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
  if (!entersAt(t, tx, ty, d)) return false
  if (t.type === 'dock') return dockAccept(w, t, it, tx, ty)
  return isStation(t) && stationTake(w, t, it.sheep)
}

/** Does a splitter's rule fit the sheep (GDD 4.4): by what it needs now — a station, shearing, the portal. */
export function ruleFits(rule: SplitRule, s: SheepT) {
  if (rule === 'any') return true
  if (rule === 'off') return false
  if (rule === 'shorn') return s.wool < 1
  if (rule === 'ready') return ready(s)
  return s.wool >= 1 && s.needs.includes(rule)
}

const SPLIT_OUT = { f: 0, r: 1, l: 3 } as const
function routeSplit(w: World, b: Building, it: Item) {
  const own: Dir[] = [],
    any: Dir[] = []
  for (const k of ['l', 'f', 'r'] as const) {
    const rule = b.rules![k],
      d = ((b.dir + SPLIT_OUT[k]) % 4) as Dir
    if (rule === 'any') any.push(d)
    else if (ruleFits(rule, it.sheep)) own.push(d)
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
    if (b.type === 'splitter' ? routeSplit(w, b, it) : tryPush(w, it, b.x, b.y, b.dir)) b.item = null
  }
}
