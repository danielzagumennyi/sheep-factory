import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { LOOK, RES } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { Field, key, res, unkey } from '@/game/world'
import { GEO, mat, vmat } from './kit'
import { Batch, useInstanced } from './instancing'
import { bushBody, grassClump } from './models'
import { frame } from './frame'

const CAP = 400

/** Where a bush's berries sit on its lobes (before the bush's turn). */
const BERRY_SPOTS: readonly [number, number, number][] = [
  [0.12, 0.5, 0.14],
  [0.33, 0.3, 0.2],
  [-0.3, 0.3, 0.2],
  [0.1, 0.36, -0.3],
]

/**
 * Terrain and deposits. What a cell holds shows in its shape: a meadow's tall grass gets shorter as it is mown, a pond
 * gets shallower (Ground.tsx), a bush loses its berries one by one — and an empty cell is simply gone.
 */
export function Terrain() {
  const { world } = useGame()
  const grass = useInstanced(grassClump(0), vmat(), CAP, 'meadow')
  const bushes = useInstanced(bushBody(), vmat(), CAP, 'bushes')
  const berries = useInstanced(GEO.ball(), mat(LOOK.berry), CAP * 4, 'berries', false)
  const planks = useInstanced(GEO.rbox(), mat(LOOK.plank), 128, 'planks')
  const rails = useInstanced(GEO.rbox(), mat(LOOK.trunk), 64, 'bridge_rails')
  const b = useMemo(
    () => ({ grass: new Batch(grass), bushes: new Batch(bushes), berries: new Batch(berries), planks: new Batch(planks), rails: new Batch(rails) }),
    [grass, bushes, berries, planks, rails],
  )
  useFrame(() => {
    const f = res(world, Field)
    const t = frame.t
    for (const q of Object.values(b)) q.begin()
    const wet = (x: number, y: number) => {
      const k = f.terrain.get(key(x, y))
      return k === 'water' || k === 'bridge'
    }
    for (const [k, kind] of f.terrain) {
      const [x, y] = unkey(k),
        X = x + 0.5,
        Z = y + 0.5
      const r = f.res.get(k)
      // a little per-cell variety, stable across frames
      const j = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453,
        rnd = j - Math.floor(j)
      if (kind === 'meadow') {
        const left = r ? r.left / RES.meadow.max : 1
        b.grass.put(X, 0, Z, Math.floor(rnd * 4) * (Math.PI / 2), 1, 0.22 + 0.5 * left, 1)
      } else if (kind === 'bridge') {
        // boards across the way over the water, rails along it
        const alongX = !(wet(x - 1, y) || wet(x + 1, y))
        for (let i = 0; i < 5; i++) {
          const o = -0.4 + i * 0.2
          if (alongX) b.planks.put(X + o, 0.05, Z, 0, 0.17, 0.06, 1.02)
          else b.planks.put(X, 0.05, Z + o, 0, 1.02, 0.06, 0.17)
        }
        for (const s of [-0.47, 0.47]) {
          if (alongX) b.rails.put(X, 0.09, Z + s, 0, 1.04, 0.07, 0.07)
          else b.rails.put(X + s, 0.09, Z, 0, 0.07, 0.07, 1.04)
        }
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
      <primitive object={planks} />
      <primitive object={rails} />
    </group>
  )
}
