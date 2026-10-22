import { DIRS } from '@/game/balance'
import { beltInDir, feeds, get, inCell, isBeltLike, isStation, outCells, targetOk } from '@/game/grid'
import { Flock, GameState, Plant, res, type SheepT, type World } from '@/game/world'
import { beltPoint } from './kit'

/**
 * What the views draw this frame, gathered once by GameLoop right after the simulation steps: where each sheep is (on
 * the grass, on a belt, walking through a station) and the belt cells. Views only read it.
 */
export const frame = {
  /**
   * The world's own clock for everything that moves on the field — sheep, machines, water, grass, butterflies: it runs
   * with the game's speed and stands still on pause or under a card (the author: «во время паузы всё действительно
   * останавливалось»). What answers the pointer (the building in hand, puffs) keeps real time.
   */
  t: 0,
  /** How far that clock moved this frame. */
  dt: 0,
  /** Each sheep drawn: where, facing, inside a machine, and `lift` — a roaming one stepping over a belt walks on it. */
  sheep: new Map<SheepT, { x: number; z: number; yaw: number; inMachine: boolean; lift?: number }>(),
  /** Belt cells with their input side, for the belt view. */
  belts: [] as { x: number; y: number; dir: number; inDir: number; phase: number; kind: string; blocked: number[]; dead: boolean }[],
}

const yawOfDir = (d: number) => -d * (Math.PI / 2)
/** How high a sheep walks over a belt: on its slats; through a station: on its plinth. */
const BELT_LIFT = 0.2,
  PLINTH_LIFT = 0.14

/**
 * Whether a roaming sheep stands on a belt, kept per sheep by its cell and the plant's version: looked up again only when
 * either changes (a big flock looked up every sheep's cell, by its text key, every frame).
 */
const onBelt = new WeakMap<SheepT, { cell: number; version: number; on: boolean }>()
function overBelt(world: World, s: SheepT, version: number) {
  const x = Math.floor(s.px),
    y = Math.floor(s.py),
    cell = y * 4096 + x
  let k = onBelt.get(s)
  if (!k) onBelt.set(s, (k = { cell: -1, version: -1, on: false }))
  if (k.cell !== cell || k.version !== version) Object.assign(k, { cell, version, on: isBeltLike(get(world, x, y)) })
  return k.on
}

export function collectFrame(world: World) {
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
        frame.sheep.set(it.sheep, { x: px, z: py, yaw: yawOfDir(it.p < 0.5 ? (b.type === 'belt' ? inDir : b.dir) : b.dir), inMachine: false })
        // the hand picks sheep by position: keep a riding sheep's position current
        it.sheep.px = px
        it.sheep.py = py
      }
    }
    // a station's sheep walks its lane under the arch while it is worked on, from the way in to the way out, and waits at
    // the way out for room: so what the station did to it shows as it goes (the author, 19.10.2026)
    if (isStation(b) && (b.slot || b.outs.length)) {
      const a = inCell(b),
        o = outCells(b).find((c) => c.d === b.dir)
      if (a && o) {
        const lane = (k: number) => ({ x: a.sx + 0.5 + (o.sx - a.sx) * k, z: a.sy + 0.5 + (o.sy - a.sy) * k, yaw: yawOfDir(b.dir), inMachine: false, lift: PLINTH_LIFT })
        if (b.slot) frame.sheep.set(b.slot.sheep, lane(b.total > 0 ? 1 - Math.max(0, b.timer) / b.total : 0.5))
        for (const q of b.outs) if (!frame.sheep.has(q.item.sheep)) frame.sheep.set(q.item.sheep, lane(1))
      }
    }
  }
  const version = res(world, GameState).plantVersion
  for (const s of res(world, Flock).sheep) {
    if (frame.sheep.has(s)) continue
    if (s.state === 'roam' || s.state === 'held') {
      const over = s.state === 'roam' && overBelt(world, s, version)
      frame.sheep.set(s, { x: s.px, z: s.py, yaw: yawOfDir(s.face), inMachine: false, lift: over ? BELT_LIFT : 0 })
    }
  }
}
