import { DIRS, type ItemId } from '@/game/balance'
import { beltInDir, feeds, get, inCell, isBeltLike, isStation, outCells, targetOk } from '@/game/grid'
import { Field, Flock, Fx, Plant, Ui, res, unkey, type SheepT, type World } from '@/game/world'
import { beltPoint } from './kit'
import { HEAP, startFall, stepFalls } from './falls'

/**
 * What the views draw this frame, gathered once by GameLoop right after the simulation steps: where every good on a
 * belt, pile or the ground sits, and where each sheep is (in the pasture, on a belt, walking through a station). Views
 * only read it.
 */
export interface GoodSpot {
  kind: ItemId
  x: number
  z: number
  y: number
}
export const frame = {
  /**
   * The world's own clock for everything that moves on the field — sheep, machines, goods, water, grass, butterflies:
   * it runs with the game's speed and stands still on pause or under a card (the author: «во время паузы всё
   * действительно останавливалось»). What answers the pointer (the building in hand, puffs) keeps real time.
   */
  t: 0,
  /** How far that clock moved this frame. */
  dt: 0,
  goods: [] as GoodSpot[],
  /** The goods in the hand: a little stack under the pointer, drawn over everything (Items.tsx). */
  carry: [] as GoodSpot[],
  /** Each sheep drawn: where, facing, inside a machine, and `lift` — a roaming one stepping over a belt walks on it. */
  sheep: new Map<SheepT, { x: number; z: number; yaw: number; inMachine: boolean; lift?: number }>(),
  /** Belt cells with their input side, for the belt view. */
  belts: [] as { x: number; y: number; dir: number; inDir: number; phase: number; kind: string; blocked: number[]; dead: boolean }[],
}

const yawOfDir = (d: number) => -d * (Math.PI / 2)
/** How high a sheep walks over a belt: on its slats; through a station: on its plinth. */
const BELT_LIFT = 0.2,
  PLINTH_LIFT = 0.14

/** How high over the ground the stack in the hand is held: the pointer's ray is met there (GameLoop.tsx). */
export const CARRY_Y = 1.2

export function collectFrame(world: World, carryAt: { x: number; z: number } | null = null) {
  frame.goods.length = 0
  frame.carry.length = 0
  frame.sheep.clear()
  frame.belts.length = 0
  // the goods on the ground, a heap on each cell (PILE) — those still falling there in the air (falls.ts), their places
  // in the heap empty till they land
  const piles = res(world, Field).piles
  // the falls just set off (by this frame's steps, or a click since the last frame) start here, not in FxView, which
  // runs after this: else their goods would show in their places for a frame before they fly
  const q = res(world, Fx).q
  let j = 0
  for (const e of q)
    if (e.kind === 'fall') startFall(e)
    else q[j++] = e
  q.length = j
  const falling = stepFalls(
    frame.dt,
    (cell) => piles.get(cell)?.length ?? 0,
    (kind, x, y, z) => frame.goods.push({ kind, x, z, y }),
  )
  for (const [k, items] of piles) {
    const [x, y] = unkey(k)
    items.forEach((it, i) => {
      if (falling.has(k + ':' + i)) return
      const [dx, dz, dy] = HEAP[i % HEAP.length]!
      frame.goods.push({ kind: it.kind as ItemId, x: x + 0.5 + dx, z: y + 0.5 + dz, y: dy })
    })
  }
  // what the hand carries, a little stack where the pointer's ray meets CARRY_Y
  const ui = res(world, Ui)
  if (ui.carry.length && carryAt) ui.carry.forEach((it, i) => frame.carry.push({ kind: it.kind as ItemId, x: carryAt.x + (i % 2 ? 0.08 : -0.08), z: carryAt.z, y: CARRY_Y + i * 0.13 }))
  const plant = res(world, Plant)
  for (const b of plant.b.values()) {
    if (isBeltLike(b)) {
      const inDir = b.type === 'belt' ? beltInDir(world, b) : b.dir
      // a second line pushing into a belt from the side is refused: mark it, a merger is needed there
      const blocked: number[] = []
      if (b.type === 'belt') for (const sd of [b.dir, (b.dir + 1) % 4, (b.dir + 3) % 4]) if (sd !== inDir && feeds(world, b.x - DIRS[sd]![0], b.y - DIRS[sd]![1], b.x, b.y)) blocked.push(sd)
      frame.belts.push({ x: b.x, y: b.y, dir: b.dir, inDir, phase: b.phase, kind: b.type, blocked, dead: b.type === 'belt' && !targetOk(world, b.x, b.y, b.dir) })
      const list = b.type === 'merger' ? b.buf.slice(0, 1) : b.item ? [b.item] : []
      for (const it of list) {
        const [px, py] = beltPoint(b, b.type === 'belt' ? inDir : b.dir, it.p)
        if (it.sheep) {
          frame.sheep.set(it.sheep, { x: px, z: py, yaw: yawOfDir(it.p < 0.5 ? (b.type === 'belt' ? inDir : b.dir) : b.dir), inMachine: false })
          // the hand picks sheep by position: keep a riding sheep's position current
          it.sheep.px = px
          it.sheep.py = py
        } else frame.goods.push({ kind: it.kind as ItemId, x: px, z: py, y: 0.255 })
      }
    }
    // a station's sheep walks its lane under the arch while it is worked on, from the way in to the way out, and waits at
    // the way out for room: so what the salon did to it shows as it goes (the author, 19.10.2026)
    if (isStation(b) && (b.slot?.sheep || b.outs.some((o) => o.item.sheep))) {
      const a = inCell(b),
        o = outCells(b).find((c) => c.d === b.dir)
      if (a && o) {
        const lane = (k: number) => ({ x: a.sx + 0.5 + (o.sx - a.sx) * k, z: a.sy + 0.5 + (o.sy - a.sy) * k, yaw: yawOfDir(b.dir), inMachine: false, lift: PLINTH_LIFT })
        if (b.slot?.sheep) frame.sheep.set(b.slot.sheep, lane(b.total > 0 ? 1 - Math.max(0, b.timer) / b.total : 0.5))
        for (const q of b.outs) if (q.item.sheep && !frame.sheep.has(q.item.sheep)) frame.sheep.set(q.item.sheep, lane(1))
      }
    }
  }
  for (const s of res(world, Flock).sheep) {
    if (frame.sheep.has(s)) continue
    if (s.state === 'pasture' || s.state === 'transit' || s.state === 'roam' || s.state === 'held') {
      const over = s.state === 'roam' && isBeltLike(get(world, Math.floor(s.px), Math.floor(s.py)))
      frame.sheep.set(s, { x: s.px, z: s.py, yaw: yawOfDir(s.face), inMachine: false, lift: over ? BELT_LIFT : 0 })
    }
  }
}
