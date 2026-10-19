import { DIRS, type ItemId } from '@/game/balance'
import { beltInDir, feeds, get, inCell, isBeltLike, isStation, outCells, targetOk } from '@/game/grid'
import { Flock, Plant, res, type SheepT, type World } from '@/game/world'
import { beltPoint } from './kit'

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
  /** Each sheep drawn: where, facing, inside a machine, and `lift` — a roaming one stepping over a belt walks on it. */
  sheep: new Map<SheepT, { x: number; z: number; yaw: number; inMachine: boolean; lift?: number }>(),
  /** Belt cells with their input side, for the belt view. */
  belts: [] as { x: number; y: number; dir: number; inDir: number; phase: number; kind: string; blocked: number[]; dead: boolean }[],
}

const yawOfDir = (d: number) => -d * (Math.PI / 2)
/** How high a sheep walks over a belt: on its slats; through a station: on its plinth. */
const BELT_LIFT = 0.2,
  PLINTH_LIFT = 0.14

export function collectFrame(world: World) {
  frame.goods.length = 0
  frame.sheep.clear()
  frame.belts.length = 0
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
        }
        else frame.goods.push({ kind: it.kind as ItemId, x: px, z: py, y: 0.255 })
      }
    }
    if (b.pile.length) {
      const px = b.pileX + 0.5,
        pz = b.pileY + 0.5
      b.pile.forEach((it, i) => frame.goods.push({ kind: it.kind as ItemId, x: px - 0.18 + i * 0.18, z: pz + 0.1 - i * 0.08, y: 0.1 + i * 0.05 }))
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
