import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ISLAND, LOOK } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { get, levelAt, owned, pastureAt } from '@/game/grid'
import { Field, Flock, GameState, Plant, key, res, type World } from '@/game/world'
import { Batch, useInstanced } from './instancing'
import { vmat } from './kit'
import { flowers, mushroom } from './models'
import { inIsland, island, rimTree } from './island'

const CAP = 900
const KINDS: readonly string[] = ['mushroom', ...LOOK.flowers.map((_, i) => 'flowers' + i)]
type Kind = string

/** A stable pseudo-random number in [0, 1) for a cell and a salt. */
const hash = (x: number, y: number, salt: number) => {
  const j = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453
  return j - Math.floor(j)
}

/**
 * Small life on free land, like the reference dioramas: tufts of grass, flowers, stepping stones, a toadstool here and
 * there. Denser on the island's rim and on land for sale, sparse on the player's own plots so the factory stays readable;
 * nothing grows where something stands, so building there simply clears it. Placed from stable per-cell numbers and
 * rebuilt only when the land or the buildings change.
 */
export function Decor() {
  const { world } = useGame()
  const meshes = KINDS.map((k) => {
    const geo = k === 'mushroom' ? mushroom() : flowers(LOOK.flowers[Number(k.slice(7))]!)
    // eslint-disable-next-line react-hooks/rules-of-hooks -- a fixed list, same order every render
    const m = useInstanced(geo, vmat(), CAP, 'decor_' + k, k === 'mushroom')
    // drawn after the lawn, so what the ink outlines is what shows: no stem traced through the grass in front of it
    m.renderOrder = 6
    return m
  })
  const batches = useMemo(() => Object.fromEntries(KINDS.map((k, i) => [k, new Batch(meshes[i]!)])) as Record<Kind, Batch>, [meshes])
  const sig = useRef('')
  useFrame(() => {
    const s = signature(world)
    if (s === sig.current) return
    sig.current = s
    for (const k of KINDS) batches[k]!.begin()
    scatter(world, (k, x, z, yaw, sc) => batches[k]!.put(x, 0, z, yaw, sc))
    for (const k of KINDS) batches[k]!.end()
  })
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  )
}

function signature(w: World) {
  const p = res(w, Plant)
  return p.b.size + ':' + p.occ.size + ':' + res(w, GameState).fieldVersion + ':' + res(w, Flock).pastures.map((q) => q.x + ',' + q.y + q.w + 'x' + q.h).join()
}

/** Is a cell free for decor: no terrain, no hill (Hills.tsx dresses its own), no building (the market is one), no pasture. */
function free(w: World, x: number, y: number) {
  if (!inIsland(x, y)) return true
  if (res(w, Field).terrain.has(key(x, y)) || levelAt(w, x, y) > 1) return false
  if (get(w, x, y) || pastureAt(w, x, y)) return false
  return true
}

/** Is the cell next to a pen, a pond, a hill, a building or a resource (anything but open lawn)? */
function besideSomething(w: World, x: number, y: number) {
  const t = res(w, Field).terrain
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = x + dx,
        ny = y + dy
      if (!inIsland(nx, ny)) continue
      if (t.has(key(nx, ny)) || levelAt(w, nx, ny) > 1 || pastureAt(w, nx, ny)) return true
      const b = get(w, nx, ny)
      if (b && b.type !== 'belt') return true
    }
  return false
}

/** A smooth value noise over the land, 0..1, varying over about four cells. */
function patch(x: number, y: number) {
  const gx = Math.floor(x / 4),
    gy = Math.floor(y / 4),
    fx = x / 4 - gx,
    fy = y / 4 - gy
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy)
  const v = (i: number, j: number) => hash(gx + i, gy + j, 11)
  return (v(0, 0) * (1 - sx) + v(1, 0) * sx) * (1 - sy) + (v(0, 1) * (1 - sx) + v(1, 1) * sx) * sy
}

function scatter(w: World, put: (k: Kind, x: number, z: number, yaw: number, s: number) => void) {
  const m = Math.ceil(ISLAND.margin) - 1
  for (let y = island.top - m - 1; y < island.bottom + m + 1; y++)
    for (let x = island.left - m - 1; x < island.right + m + 1; x++) {
      // a rim tree's cell is its own
      if (!free(w, x, y) || rimTree(x, y)) continue
      const inside = inIsland(x, y)
      // the rim of the island is a little garden; the player's land stays mostly clear
      const rim = !inside
      const mine = inside && !rim && owned(w, x, y)
      // flowers gather where something stands — by fences, water, machines and the rim — and in a few clumps on
      // the open lawn, which otherwise stays clear
      const by = besideSomething(w, x, y)
      // only where the slow wave of clusters is high: a few clumps, not a sprinkle
      const clump = patch(x, y)
      if (clump < 0.62) continue
      // half what it was (the author: «уменьши кол-во цветов на половину»)
      const density = (rim ? 0.27 : by ? 0.22 : 0.12) * (mine ? 0.7 : 1)
      const r0 = hash(x, y, 1)
      if (r0 > density) continue
      // keep inside the island's outline
      const fx = x + 0.2 + hash(x, y, 2) * 0.6,
        fz = y + 0.2 + hash(x, y, 3) * 0.6
      if (fx < island.left - ISLAND.margin + 0.35 || fz < island.top - ISLAND.margin + 0.35 || fx > island.right + ISLAND.margin - 0.35 || fz > island.bottom + ISLAND.margin - 0.35) continue
      const r1 = hash(x, y, 4),
        yaw = hash(x, y, 5) * Math.PI * 2
      // the lawn itself is Grass.tsx: here only flowers, stones and toadstools
      const k: Kind = r1 < 0.9 ? 'flowers' + Math.floor(hash(x, y, 6) * LOOK.flowers.length) : 'mushroom'
      // big enough to stand out of the lawn
      put(k, fx, fz, yaw, (k === 'mushroom' ? 1.5 : 1.12) + hash(x, y, 7) * 0.3)
    }
}
