import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color } from 'three'
import { GRID, ISLAND, LOOK } from '@/game/balance'
import { key } from '@/game/world'
import { Batch, useInstanced } from './instancing'
import { mat, vmat } from './kit'
import { fencePost, fenceSpan, pine, tile } from './models'
import { island, rimTree } from './island'

const _c = new Color()
const hash = (n: number) => {
  const j = Math.sin(n * 91.345 + 7.13) * 43758.5453
  return j - Math.floor(j)
}

/**
 * The still dressing of the island, like the reference dioramas: soft pastel paving on the dock row, a low wooden
 * fence along the field's edge (open where the road runs through) and trees on the ring of grass outside it. Built
 * once — none of it changes with play.
 */
export function Props() {
  const tiles = useInstanced(tile(), mat('#ffffff'), (GRID.cols + 4) * 4, 'paving', 'receive')
  const fence = useInstanced(fenceSpan(), vmat(), 160, 'rim_fence')
  const posts = useInstanced(fencePost(), vmat(), 8, 'rim_fence_posts')
  const pines = useInstanced(pine(0), vmat(), 40, 'rim_pines')
  const trees = useInstanced(pine(1), vmat(), 40, 'rim_firs')
  const b = useMemo(() => ({ tiles: new Batch(tiles), fence: new Batch(fence), posts: new Batch(posts), pines: new Batch(pines), trees: new Batch(trees) }), [tiles, fence, posts, pines, trees])
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
    // the rim fence along the field's own edge, a cell in from the island's: the far row, the near one past the road, and
    // both sides down to the dock row — the market and the road run on out to the island's ends like a street. A span
    // carries its post at one end (the west one along x, the south one along z); a post closes every other end, so none
    // stops in mid-air (the author, 20.10.2026)
    const x1 = island.right,
      z0 = island.top,
      z1 = GRID.rows
    const ends = new Set<string>(),
      posted = new Set<string>()
    for (const fz of [z0, z1])
      for (let x = 0; x < x1; x++) {
        b.fence.put(x + 0.5, 0, fz, 0)
        ends.add(key(x, fz)).add(key(x + 1, fz))
        posted.add(key(x, fz))
      }
    for (const fx of [0, x1])
      for (let z = z0; z < GRID.roadY; z++) {
        b.fence.put(fx, 0, z + 0.5, Math.PI / 2)
        ends.add(key(fx, z)).add(key(fx, z + 1))
        posted.add(key(fx, z + 1))
      }
    for (const k of ends)
      if (!posted.has(k)) {
        const [x, z] = k.split(',').map(Number) as [number, number]
        b.posts.put(x, 0, z)
      }
    // the rim's trees, each in the middle of its cell of the ring round the field
    for (let y = z0 - 1; y < GRID.roadY; y++)
      for (let x = -1; x <= x1; x++) {
        const t = rimTree(x, y)
        if (t) (t.fir ? b.trees : b.pines).put(x + 0.5, 0, y + 0.5, t.yaw, t.size)
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
