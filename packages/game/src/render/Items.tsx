import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ItemId } from '@/game/balance'
import { vmat } from './kit'
import { good } from './models'
import { Batch, useInstanced } from './instancing'
import { frame } from './frame'

const KINDS: readonly ItemId[] = ['wool', 'pwool', 'roving', 'proving', 'yarn', 'pyarn', 'felt', 'dye', 'sweater', 'valenki', 'hay']

/** Every good on a belt, a pile or the ground: one instanced mesh per kind. */
export function Items() {
  const meshes = KINDS.map((k) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- a fixed list, same order every render
    return useInstanced(good(k), vmat(), 768, 'goods_' + k)
  })
  const batches = useMemo(() => Object.fromEntries(KINDS.map((k, i) => [k, new Batch(meshes[i]!)])) as Record<ItemId, Batch>, [meshes])
  useFrame(() => {
    for (const k of KINDS) batches[k].begin()
    const t = frame.t
    for (const g of frame.goods) {
      // round goods turn slowly as they ride; flat ones keep square to the belt
      const spin = g.kind === 'wool' || g.kind === 'pwool' || g.kind === 'yarn' || g.kind === 'pyarn' || g.kind === 'dye'
      batches[g.kind].put(g.x, g.y - 0.12, g.z, spin ? t * 0.6 + g.x : 0, 1.45)
    }
    for (const k of KINDS) batches[k].end()
  })
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  )
}
