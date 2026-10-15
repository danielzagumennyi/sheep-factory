import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { LOOK } from '@/game/balance'
import { GEO, mat } from './kit'
import { frame } from './frame'

/** Butterflies over the island: where each one wanders (centre, reach), its colour and pace. */
const FLIGHTS = [
  [4, 3, 3, 0],
  [27, 4, 3.5, 1],
  [6, 18.6, 4, 2],
  [24, 18.8, 4, 3],
  [16, -0.6, 5, 4],
  [-0.6, 10, 3, 0],
  [32.6, 9, 3, 2],
  [12, 18.4, 3, 1],
] as const

/**
 * A little life on the island, like the reference dioramas: butterflies flutter about the rim and the meadows (the
 * water's own light dashes are in Water.tsx). Nothing here touches the game.
 */
export function Ambient() {
  return (
    <group>
      {FLIGHTS.map(([x, z, r, c], i) => (
        <Butterfly key={i} cx={x} cz={z} reach={r} color={LOOK.butterflies[c]!} seed={i * 1.7} />
      ))}
    </group>
  )
}

function Butterfly({ cx, cz, reach, color, seed }: { cx: number; cz: number; reach: number; color: string; seed: number }) {
  const g = useRef<Group>(null)
  const l = useRef<Group>(null)
  const r = useRef<Group>(null)
  useFrame(() => {
    const t = frame.t * 0.35 + seed
    if (!g.current) return
    const x = cx + Math.sin(t * 1.3) * reach * 0.6 + Math.sin(t * 3.1) * 0.4,
      z = cz + Math.cos(t * 0.9) * reach * 0.5 + Math.cos(t * 2.3) * 0.3
    const dx = Math.cos(t * 1.3) * 1.3 * reach * 0.6 + Math.cos(t * 3.1) * 1.2,
      dz = -Math.sin(t * 0.9) * 0.9 * reach * 0.5 - Math.sin(t * 2.3) * 0.7
    g.current.position.set(x, 0.55 + Math.sin(t * 7) * 0.12, z)
    g.current.rotation.y = Math.atan2(-dz, dx)
    const flap = Math.sin(frame.t * 22 + seed) * 0.9
    if (l.current) l.current.rotation.x = 0.3 + flap
    if (r.current) r.current.rotation.x = -0.3 - flap
  })
  const wing = mat(color)
  return (
    <group ref={g} scale={0.9}>
      <mesh geometry={GEO.ball()} material={mat(LOOK.machineEdge)} scale={[0.14, 0.035, 0.035]} />
      <group ref={l}>
        <mesh position={[0.02, 0, 0.07]} geometry={GEO.ball()} material={wing} scale={[0.12, 0.012, 0.13]} />
        <mesh position={[-0.05, 0, 0.05]} geometry={GEO.ball()} material={wing} scale={[0.07, 0.01, 0.08]} />
      </group>
      <group ref={r}>
        <mesh position={[0.02, 0, -0.07]} geometry={GEO.ball()} material={wing} scale={[0.12, 0.012, 0.13]} />
        <mesh position={[-0.05, 0, -0.05]} geometry={GEO.ball()} material={wing} scale={[0.07, 0.01, 0.08]} />
      </group>
    </group>
  )
}

