import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { key } from '@/game/world'
import { Batch, useInstanced } from './instancing'
import { vmat } from './kit'
import { fencePost, fenceSpan, pine } from './models'
import { island, rimTree } from './island'

/**
 * The still dressing of the island, like the reference dioramas: a low wooden fence along the field's edge and trees
 * on the ring of grass outside it. Built once — none of it changes with play.
 */
export function Props() {
  const fence = useInstanced(fenceSpan(), vmat(), 160, 'rim_fence')
  const posts = useInstanced(fencePost(), vmat(), 8, 'rim_fence_posts')
  const pines = useInstanced(pine(0), vmat(), 48, 'rim_pines')
  const trees = useInstanced(pine(1), vmat(), 48, 'rim_firs')
  const b = useMemo(() => ({ fence: new Batch(fence), posts: new Batch(posts), pines: new Batch(pines), trees: new Batch(trees) }), [fence, posts, pines, trees])
  // filled on the first frame, then left alone
  const done = useMemo(() => ({ v: false }), [])
  useFrame(() => {
    if (done.v) return
    done.v = true
    for (const q of Object.values(b)) q.begin()
    // the rim fence along the field's own edge, a cell in from the island's, all round. A span carries its post at one end
    // (the west one along x, the south one along z); a post closes every other end, so none stops in mid-air (the
    // author, 20.10.2026)
    const { left: x0, top: z0, right: x1, bottom: z1 } = island
    const ends = new Set<string>(),
      posted = new Set<string>()
    for (const fz of [z0, z1])
      for (let x = x0; x < x1; x++) {
        b.fence.put(x + 0.5, 0, fz, 0)
        ends.add(key(x, fz)).add(key(x + 1, fz))
        posted.add(key(x, fz))
      }
    for (const fx of [x0, x1])
      for (let z = z0; z < z1; z++) {
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
    for (let y = z0 - 1; y < z1; y++)
      for (let x = x0 - 1; x <= x1; x++) {
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
