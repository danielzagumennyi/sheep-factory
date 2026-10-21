import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { ITEMS, type ItemId } from '@/game/balance'
import { vmat } from './kit'
import { good } from './models'
import { Batch, useInstanced } from './instancing'
import { frame } from './frame'

const KINDS = Object.keys(ITEMS) as ItemId[]
/** A good's size lying or riding, and held in the hand (a little bigger); how far a lying one sinks into what it is on. */
const GOOD_SIZE = 1.45,
  HELD_SIZE = 1.6,
  GOOD_DOWN = 0.12

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
    // it casts its shadow on the ground under it, as the goods let go of keep casting theirs as they fall
    for (const m of held) {
      m.renderOrder = 10
      m.castShadow = true
    }
    return Object.fromEntries(KINDS.map((k, i) => [k, new Batch(held[i]!)])) as Record<ItemId, Batch>
  }, [held])
  useFrame(() => {
    for (const k of KINDS) {
      batches[k].begin()
      heldBatches[k].begin()
    }
    const t = frame.t
    for (const g of frame.goods) {
      // round goods turn slowly as they ride; flat ones keep square to the belt. One on its way down from the hand
      // turns from how it was held into that, and from the hand's size and height into a lying one's
      const spin = g.kind === 'wool' || g.kind === 'cwool' || g.kind === 'yarn' || g.kind === 'cyarn' || g.kind === 'thread' || g.kind === 'cthread' || g.kind === 'dye'
      const lie = 1 - (g.held ?? 0)
      batches[g.kind].put(g.x, g.y - GOOD_DOWN * lie, g.z, spin ? (t * 0.6 + g.x) * lie : 0, HELD_SIZE + (GOOD_SIZE - HELD_SIZE) * lie)
    }
    for (const g of frame.carry) heldBatches[g.kind].put(g.x, g.y, g.z, 0, HELD_SIZE)
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
