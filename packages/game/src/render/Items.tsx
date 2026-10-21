import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { ITEMS, type ItemId } from '@/game/balance'
import { vmat } from './kit'
import { good } from './models'
import { Batch, useInstanced } from './instancing'
import { frame } from './frame'

const KINDS = Object.keys(ITEMS) as ItemId[]

/** Every good on a belt, a pile or the ground: one instanced mesh per kind; and those in the hand, over everything. */
export function Items() {
  const meshes = KINDS.map((k) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- a fixed list, same order every render
    return useInstanced(good(k), vmat(), 768, 'goods_' + k)
  })
  // the hand's stack is drawn last and through whatever stands under the pointer, so it never hides in a building
  const over = useMemo(() => {
    const m = vmat().clone()
    m.depthTest = false
    m.depthWrite = false
    return m
  }, [])
  const held = KINDS.map((k) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- a fixed list, same order every render
    return useInstanced(good(k), over, 8, 'held_' + k, false)
  })
  const batches = useMemo(() => Object.fromEntries(KINDS.map((k, i) => [k, new Batch(meshes[i]!)])) as Record<ItemId, Batch>, [meshes])
  const heldBatches = useMemo(() => {
    for (const m of held) m.renderOrder = 10
    return Object.fromEntries(KINDS.map((k, i) => [k, new Batch(held[i]!)])) as Record<ItemId, Batch>
  }, [held])
  useFrame(() => {
    for (const k of KINDS) {
      batches[k].begin()
      heldBatches[k].begin()
    }
    const t = frame.t
    for (const g of frame.goods) {
      // round goods turn slowly as they ride; flat ones keep square to the belt
      const spin = g.kind === 'wool' || g.kind === 'cwool' || g.kind === 'yarn' || g.kind === 'cyarn' || g.kind === 'thread' || g.kind === 'cthread' || g.kind === 'dye'
      batches[g.kind].put(g.x, g.y - 0.12, g.z, spin ? t * 0.6 + g.x : 0, 1.45)
    }
    for (const g of frame.carry) heldBatches[g.kind].put(g.x, g.y, g.z, 0, 1.6)
    for (const k of KINDS) {
      batches[k].end()
      heldBatches[k].end()
    }
  })
  return (
    <group>
      {[...meshes, ...held].map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  )
}
