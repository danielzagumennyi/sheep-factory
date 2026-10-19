import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color } from 'three'
import { GRID, ISLAND, LOOK, ROAD } from '@/game/balance'
import { Batch, useInstanced } from './instancing'
import { mat, vmat } from './kit'
import { fenceSpan, pine, tile } from './models'
import { island } from './island'

const _c = new Color()
const hash = (n: number) => {
  const j = Math.sin(n * 91.345 + 7.13) * 43758.5453
  return j - Math.floor(j)
}

/**
 * The still dressing of the island, like the reference dioramas: soft pastel paving on the dock row, a low wooden
 * fence round the rim (open where the road runs through) and trees on the far rim. Built
 * once — none of it changes with play.
 */
export function Props() {
  const tiles = useInstanced(tile(), mat('#ffffff'), (GRID.cols + 4) * 4, 'paving', 'receive')
  const fence = useInstanced(fenceSpan(), vmat(), 160, 'rim_fence')
  const pines = useInstanced(pine(0), vmat(), 40, 'rim_pines')
  const trees = useInstanced(pine(1), vmat(), 40, 'rim_firs')
  const b = useMemo(() => ({ tiles: new Batch(tiles), fence: new Batch(fence), pines: new Batch(pines), trees: new Batch(trees) }), [tiles, fence, pines, trees])
  // filled on the first frame, then left alone
  const done = useMemo(() => ({ v: false }), [])
  useFrame(() => {
    if (done.v) return
    done.v = true
    for (const q of Object.values(b)) q.begin()
    // the dock row: two rows of warm stone slabs of mixed lengths with dark gaps, now and then one missing
    // from one edge of the island to the other, like the road below it
    const p0 = -ISLAND.margin + 0.28,
      p1 = island.right + ISLAND.margin - 0.28
    for (let row = 0; row < 2; row++) {
      let x = p0 + (row ? 0 : 0.25),
        n = row * 1000
      while (x < p1 - 0.15) {
        const len = Math.min(p1 - x, 0.34 + hash(n) * 0.36)
        if (hash(n + 7) > 0.05) {
          _c.set(LOOK.paving[Math.floor(hash(n + 3) * LOOK.paving.length)]!)
          b.tiles.put(x + len / 2, 0.005, GRID.roadY + 0.26 + row * 0.48, (hash(n + 50) - 0.5) * 0.06, len / 0.44, 1, 1, _c)
        }
        x += len + 0.05
        n++
      }
    }
    // the rim fence, inset from the island's edge, open at the corners and where the road crosses
    const m = ISLAND.margin - 0.42,
      R = ISLAND.corner
    const x0 = -m,
      x1 = island.right + m,
      z0 = island.top - m,
      z1 = GRID.rows + m
    for (let x = x0 + R; x + 1 <= x1 - R; x += 1) b.fence.put(x + 0.5, 0, z0, 0)
    for (let x = x0 + R; x + 1 <= x1 - R; x += 1) b.fence.put(x + 0.5, 0, z1, 0)
    const road0 = ROAD.row - 0.2,
      road1 = ROAD.row + 2.2
    for (const fx of [x0, x1])
      for (let z = z0 + R; z + 1 <= z1 - R; z += 1) {
        if (z + 1 > road0 && z < road1) continue
        b.fence.put(fx, 0, z + 0.5, Math.PI / 2)
      }
    // trees on the far rim and the sides, never in front of the road
    for (let i = 0; i < 40; i++) {
      const side = i % 3
      const t = hash(i * 3.7)
      let x: number, z: number
      if (side === 0) {
        x = x0 + R + t * (x1 - x0 - 2 * R)
        z = z0 - 0.45 + hash(i * 5.1) * 0.3
      } else {
        x = (side === 1 ? x0 - 0.45 : x1 + 0.45) + (hash(i * 5.1) - 0.5) * 0.3
        z = z0 + R + t * (GRID.roadY - 1 - z0 - R)
      }
      if (hash(i * 9.3) < 0.35) continue
      ;(hash(i * 2.2) < 0.5 ? b.pines : b.trees).put(x, 0, z, hash(i) * 6, 0.75 + hash(i * 4.4) * 0.35)
    }
    for (const q of Object.values(b)) q.end()
  })
  return (
    <group>
      {Object.values(b).map((q) => (
        <primitive key={q.mesh.name} object={q.mesh} />
      ))}
    </group>
  )
}
