import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type { BufferGeometry } from 'three'
import { useGame } from '@/game/GameContext'
import { Field, res, unkey } from '@/game/world'
import { Batch, useInstanced } from './instancing'
import { vmat } from './kit'
import { boulder, pine } from './models'

const CAP = 96

/** The models a terrain cell picks from, by a stable per-cell number. */
const SETS: Readonly<Record<'tree' | 'rock', readonly { geo: () => BufferGeometry; scale: number }[]>> = {
  tree: [
    { geo: () => pine(0), scale: 1 },
    { geo: () => pine(1), scale: 0.85 },
  ],
  rock: [
    { geo: () => boulder(0), scale: 1 },
    { geo: () => boulder(1), scale: 0.85 },
  ],
}
const ALL = [...SETS.tree, ...SETS.rock]

/**
 * Trees and rocks of the terrain, in the style of the reference dioramas: soft-tiered firs (only firs: the author), smooth
 * boulders. Each cell picks a model, a turn and a size from a stable per-cell number, so the field looks the same frame
 * to frame and game to game.
 */
export function Nature() {
  const { world } = useGame()
  const meshes = ALL.map((m, i) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- a fixed list, same order every render
    return useInstanced(m.geo(), vmat(), CAP, 'nature_' + i)
  })
  const batches = useMemo(() => meshes.map((m) => new Batch(m)), [meshes])
  useFrame(() => {
    for (const b of batches) b.begin()
    const f = res(world, Field)
    for (const [k, kind] of f.terrain) {
      if (kind !== 'tree' && kind !== 'rock') continue
      const [x, y] = unkey(k)
      if (x < f.left || y < f.top || x >= f.right || y >= f.bottom) continue
      const j = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453,
        rnd = j - Math.floor(j)
      const set = SETS[kind]
      const pick = set[Math.floor(rnd * set.length) % set.length]!
      const s = pick.scale * (0.9 + 0.2 * ((rnd * 7) % 1))
      batches[ALL.indexOf(pick)]!.put(x + 0.5, 0, y + 0.5, rnd * Math.PI * 2, s)
    }
    for (const b of batches) b.end()
  })
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  )
}
