import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { LOOK, RES, SOW } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { Field, res, unkey } from '@/game/world'
import { GEO, mat, vmat } from './kit'
import { Batch, useInstanced } from './instancing'
import { bushBody, grassClump } from './models'
import { frame } from './frame'

const CAP = 700

/** Where a bush's berries sit on its lobes (before the bush's turn). */
const BERRY_SPOTS: readonly [number, number, number][] = [
  [0.12, 0.5, 0.14],
  [0.33, 0.3, 0.2],
  [-0.3, 0.3, 0.2],
  [0.1, 0.36, -0.3],
]

/**
 * Terrain and deposits. What a cell holds shows in its shape: a meadow's tall grass gets shorter as it is mown, a bush
 * loses its berries one by one — and an empty cell is simply gone. A sown seed is a mound of earth with a shoot that
 * grows into its grass or bush.
 */
export function Terrain() {
  const { world } = useGame()
  const grass = useInstanced(grassClump(0), vmat(), CAP, 'meadow')
  const bushes = useInstanced(bushBody(), vmat(), CAP, 'bushes')
  const berries = useInstanced(GEO.ball(), mat(LOOK.berry), CAP * 4, 'berries', false)
  const mounds = useInstanced(GEO.ball(), mat(LOOK.sproutSoil), CAP, 'mounds')
  const b = useMemo(() => ({ grass: new Batch(grass), bushes: new Batch(bushes), berries: new Batch(berries), mounds: new Batch(mounds) }), [grass, bushes, berries, mounds])
  useFrame(() => {
    const f = res(world, Field)
    const t = frame.t
    for (const q of Object.values(b)) q.begin()
    for (const [k, kind] of f.terrain) {
      const [x, y] = unkey(k),
        X = x + 0.5,
        Z = y + 0.5
      // under the sky until the island grows
      if (y < f.top || x >= f.right) continue
      const r = f.res.get(k)
      // a little per-cell variety, stable across frames
      const j = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453,
        rnd = j - Math.floor(j)
      if (kind === 'meadow') {
        const left = r ? Math.min(1, r.left / Math.max(r.max, 1)) : 1
        b.grass.put(X, 0, Z, Math.floor(rnd * 4) * (Math.PI / 2), 1, 0.22 + 0.5 * left, 1)
      } else if (kind === 'sprout') {
        const sp = f.sprouts.get(k)
        const g = sp ? 1 - sp.left / SOW.grow : 1
        b.mounds.put(X, 0, Z, 0, 0.62, 0.1, 0.62)
        if (sp?.t === 'bush') b.bushes.put(X, 0.02, Z, rnd * 6, 0.25 + 0.5 * g)
        else b.grass.put(X, 0.02, Z, Math.floor(rnd * 4) * (Math.PI / 2), 0.4 + 0.4 * g, 0.12 + 0.45 * g, 0.4 + 0.4 * g)
      } else if (kind === 'bush') {
        const n = r ? r.left : RES.bush.max
        const yaw = rnd * 6,
          c = Math.cos(yaw),
          s = Math.sin(yaw)
        b.bushes.put(X, 0, Z, yaw, 1.05)
        for (let i = 0; i < n && i < 4; i++) {
          const [dx, dy, dz] = BERRY_SPOTS[i]!
          // the same turn as the bush (a yaw maps x, z → x·cos + z·sin, −x·sin + z·cos)
          b.berries.put(X + (dx * c + dz * s) * 1.05, dy * 1.05 + 0.015 * Math.sin(t * 2 + i), Z + (-dx * s + dz * c) * 1.05, 0, 0.13)
        }
      }
      // trees and rocks: Nature.tsx
    }
    for (const q of Object.values(b)) q.end()
  })
  return (
    <group>
      <primitive object={grass} />
      <primitive object={bushes} />
      <primitive object={berries} />
      <primitive object={mounds} />
    </group>
  )
}
