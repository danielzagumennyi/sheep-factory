import { FALL, LOOK, type ItemId } from '@/game/balance'
import type { GoodSpot } from './frame'
import { puffAt } from './FxView'

/** Where the goods of a pile lie on their cell: three, two on them, one on top. */
export const HEAP: readonly (readonly [number, number, number])[] = [
  [-0.2, 0.1, 0.1],
  [0.02, 0.14, 0.1],
  [0.22, 0.06, 0.1],
  [-0.1, -0.1, 0.13],
  [0.12, -0.08, 0.13],
  [0.02, 0.02, 0.32],
]

/**
 * Goods falling onto piles (FxEvent 'fall'; FALL): each flies in an arc from where it came off — a shorn sheep's back,
 * a belt, a machine's way out — to its own place in the heap, hops there and settles; till then its place in the pile
 * stays empty (frame.ts), so it never just appears. Let go from the hand, a good drops straight down from just where it
 * was drawn in the hand, as big and as turned as it was there, and becomes the pile's on the way.
 */
interface Fall {
  good: ItemId
  from: readonly [number, number, number]
  to: readonly [number, number, number]
  cell: string
  slot: number
  /** Seconds since it set off; below zero it waits for the goods of its fall before it. */
  t: number
  dur: number
  landed: boolean
  /** Let go from the hand: down with no arc, speeding up. */
  hand: boolean
}
const falls: Fall[] = []

/** A fall the simulation set off; `held` — where its good was drawn in the hand, when it was let go from there. */
export function startFall(e: { x: number; y: number; slot: number; good: ItemId; fx: number; fy: number; fh: number; n: number }, held?: GoodSpot) {
  const [dx, dz, dy] = HEAP[e.slot % HEAP.length]!
  const to = [e.x + 0.5 + dx, dy, e.y + 0.5 + dz] as const,
    cell = e.x + ',' + e.y
  if (held) {
    // all at once, as the hand lets them all go: the time a fall from that high takes
    const dur = Math.sqrt((2 * Math.max(0.05, held.y - to[1])) / FALL.gravity)
    falls.push({ good: e.good, from: [held.x, held.y, held.z], to, cell, slot: e.slot, t: 0, dur, landed: false, hand: true })
    return
  }
  const dist = Math.hypot(to[0] - e.fx, to[2] - e.fy)
  falls.push({ good: e.good, from: [e.fx, e.fh, e.fy], to, cell, slot: e.slot, t: -e.n * FALL.stagger, dur: FALL.base + FALL.perCell * dist, landed: false, hand: false })
}

/** A new world starts with nothing falling. */
export const clearFalls = () => {
  falls.length = 0
}

/**
 * Move every fall on by dt; call `draw` for each one in the air or hopping (with how much it still looks as in the hand,
 * GoodSpot `held`), and return the pile places still waiting for theirs (`cell:slot`). A fall whose place is gone (its
 * pile taken up meanwhile) is dropped.
 */
export function stepFalls(dt: number, slots: (cell: string) => number, draw: (good: ItemId, x: number, y: number, z: number, held: number) => void) {
  const waiting = new Set<string>()
  for (let i = falls.length - 1; i >= 0; i--) {
    const f = falls[i]!
    f.t += dt
    if (f.slot >= slots(f.cell) || f.t >= f.dur + FALL.bounce) {
      falls.splice(i, 1)
      continue
    }
    waiting.add(f.cell + ':' + f.slot)
    if (f.t < 0) continue
    if (f.t < f.dur) {
      const k = f.t / f.dur,
        x = f.from[0] + (f.to[0] - f.from[0]) * k,
        z = f.from[2] + (f.to[2] - f.from[2]) * k
      // from the hand: straight down, faster and faster; else an arc from where it came off to its place
      if (f.hand) draw(f.good, x, f.from[1] + (f.to[1] - f.from[1]) * k * k, z, 1 - k)
      else draw(f.good, x, f.from[1] + (f.to[1] - f.from[1]) * k + 4 * FALL.arc * k * (1 - k), z, 0)
      continue
    }
    // down: a little dust, and a hop in its place
    if (!f.landed) {
      f.landed = true
      puffAt(f.to[0], f.to[2], LOOK.dust, 3)
    }
    const u = (f.t - f.dur) / FALL.bounce
    draw(f.good, f.to[0], f.to[1] + FALL.hop * Math.sin(Math.PI * u) * (1 - u * 0.5), f.to[2], 0)
  }
  return waiting
}
