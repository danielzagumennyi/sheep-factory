import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { GRID } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { owned } from '@/game/grid'
import { Field, GameState, key, res, type World } from '@/game/world'
import { Batch, useInstanced } from './instancing'
import { vmat } from './kit'
import { fencePost, fenceSpan } from './models'
import { island } from './island'

const fieldCell = (x: number, y: number) => x >= 0 && y >= island.top && x < island.right && y < GRID.rows
const wet = (w: World, x: number, y: number) => {
  const t = res(w, Field).terrain.get(key(x, y))
  return t === 'water'
}

/**
 * The fence round the farm's own land (the author: «просто сделай заборы вокруг зон, используй тот же забор что
 * вокруг карты»): the rim's fence, along every cell edge where owned land meets land for sale, open over water. It
 * moves out as plots are bought. Only between two cells of the field: where own land meets the sky (the far row before
 * it rises), the rim's own fence already stands, and a second one beside it looked odd (the author, 20.10.2026). A span
 * carries the post at its own start; a post closes every other end.
 */
export function PlotFence() {
  const { world } = useGame()
  const spans = useInstanced(fenceSpan(), vmat(), 240, 'plot_fence')
  const posts = useInstanced(fencePost(), vmat(), 80, 'plot_fence_posts')
  const b = useMemo(() => ({ spans: new Batch(spans), posts: new Batch(posts) }), [spans, posts])
  const ver = useRef('')
  useFrame(() => {
    const v = res(world, GameState).fieldVersion + ':' + res(world, Field).plots.size
    if (v === ver.current) return
    ver.current = v
    b.spans.begin()
    b.posts.begin()
    // the ends of the spans, and the ends that already have a post
    const ends = new Set<string>(),
      posted = new Set<string>()
    for (let y = 0; y < GRID.rows; y++)
      for (let x = 0; x < GRID.cols; x++) {
        const mine = owned(world, x, y)
        // the edge east of this cell: a span along z, its post at the south end
        if (fieldCell(x, y) && fieldCell(x + 1, y) && owned(world, x + 1, y) !== mine && !wet(world, x, y) && !wet(world, x + 1, y)) {
          b.spans.put(x + 1, 0, y + 0.5, Math.PI / 2)
          ends.add(key(x + 1, y)).add(key(x + 1, y + 1))
          posted.add(key(x + 1, y + 1))
        }
        // the edge south of this cell: a span along x, its post at the west end
        if (fieldCell(x, y) && fieldCell(x, y + 1) && owned(world, x, y + 1) !== mine && !wet(world, x, y) && !wet(world, x, y + 1)) {
          b.spans.put(x + 0.5, 0, y + 1, 0)
          ends.add(key(x, y + 1)).add(key(x + 1, y + 1))
          posted.add(key(x, y + 1))
        }
      }
    for (const k of ends)
      if (!posted.has(k)) {
        const [x, y] = k.split(',').map(Number) as [number, number]
        b.posts.put(x, 0, y)
      }
    b.spans.end()
    b.posts.end()
  })
  return (
    <group>
      <primitive object={spans} />
      <primitive object={posts} />
    </group>
  )
}
