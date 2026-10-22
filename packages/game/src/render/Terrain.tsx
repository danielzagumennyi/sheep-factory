import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { LOOK } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { Field, GameState, res, unkey } from '@/game/world'
import { GEO, mat, vmat } from './kit'
import { Batch, useInstanced } from './instancing'
import { bushBody, grassClump } from './models'

/** Room for the map's meadow cells and bushes (MAP.patches: some 900 and 150 on a map), with some to spare. */
const CAP = { meadow: 3000, bush: 800 } as const

/** Where a bush's berries sit on its lobes (before the bush's turn). */
const BERRY_SPOTS: readonly [number, number, number][] = [
  [0.12, 0.5, 0.14],
  [0.33, 0.3, 0.2],
  [-0.3, 0.3, 0.2],
  [0.1, 0.36, -0.3],
]

/**
 * The landscape that grows (GDD 2): a meadow's tall grass, and bushes with a few berries — only to look at; sheep don't
 * eat them and nothing is gathered. Laid again only when the land changes (a building set down on a meadow clears it).
 */
export function Terrain() {
  const { world } = useGame()
  const grass = useInstanced(grassClump(0), vmat(), CAP.meadow, 'meadow')
  const bushes = useInstanced(bushBody(), vmat(), CAP.bush, 'bushes')
  const berries = useInstanced(GEO.ball(), mat(LOOK.berry), CAP.bush * 4, 'berries', false)
  const b = useMemo(() => ({ grass: new Batch(grass), bushes: new Batch(bushes), berries: new Batch(berries) }), [grass, bushes, berries])
  const ver = useRef(-1)
  useFrame(() => {
    const f = res(world, Field),
      v = res(world, GameState).fieldVersion
    if (v === ver.current) return
    ver.current = v
    for (const q of Object.values(b)) q.begin()
    for (const [k, kind] of f.terrain) {
      const [x, y] = unkey(k),
        X = x + 0.5,
        Z = y + 0.5
      // a little per-cell variety, stable across frames
      const j = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453,
        rnd = j - Math.floor(j)
      if (kind === 'meadow') b.grass.put(X, 0, Z, Math.floor(rnd * 4) * (Math.PI / 2), 1, 0.72, 1)
      else if (kind === 'bush') {
        const yaw = rnd * 6,
          c = Math.cos(yaw),
          s = Math.sin(yaw)
        b.bushes.put(X, 0, Z, yaw, 1.05)
        for (let i = 0; i < 1 + (Math.floor(rnd * 37) % 4); i++) {
          const [dx, dy, dz] = BERRY_SPOTS[i]!
          // the same turn as the bush (a yaw maps x, z → x·cos + z·sin, −x·sin + z·cos)
          b.berries.put(X + (dx * c + dz * s) * 1.05, dy * 1.05, Z + (-dx * s + dz * c) * 1.05, 0, 0.13)
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
    </group>
  )
}
