import { useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { playSound } from '@/audio'
import { useGame } from '@/game/GameContext'
import { Fx, GameState, res } from '@/game/world'
import { tx } from '@/i18n'
import { FX_TEXT } from '@/i18n/content'
import { GEO, mat } from './kit'
import { Batch, useInstanced } from './instancing'
import { startCoin, startFlight } from './Market'
import { clearFalls } from './falls'

interface Puff {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  t: number
  life: number
  r: number
  color: string
}
interface Float {
  id: number
  x: number
  z: number
  text: string
  tone: string
}
let floatId = 0
/** The puffs in the air: from the simulation's events, and from the views (a good landing on a pile, falls.ts). */
const puffs: Puff[] = []
/** A few puffs of `color` bursting from the ground at (x, z). */
export function puffAt(x: number, z: number, color: string, n: number, y = 0.15) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2,
      v = 0.3 + Math.random() * 0.4
    puffs.push({ x, y, z, vx: Math.cos(a) * v, vy: 0.4 + Math.random() * 0.4, vz: Math.sin(a) * v, t: 0, life: 0.4, r: 0.05 + Math.random() * 0.04, color })
  }
}

/**
 * Drains the simulation's effect queue every frame: sounds go to the synth, numbers float up from the field, puffs of
 * wool and grass burst and fall, goods handed to the market hop in, a good a client takes pops up as a coin, goods put on
 * the ground fall onto their piles. Sounds stay quiet while the game is paused.
 */
export function FxView() {
  const { world } = useGame()
  const [floats, setFloats] = useState<Float[]>([])
  const mesh = useInstanced(GEO.sphere(), mat('#ffffff'), 256, 'puffs', false)
  const batch = useMemo(() => new Batch(mesh), [mesh])
  // a new world starts with nothing in the air
  useEffect(() => {
    clearFalls()
    puffs.length = 0
  }, [world])
  useFrame((_, dt) => {
    const q = res(world, Fx).q
    const speed = res(world, GameState).speed
    const add: Float[] = []
    for (const e of q) {
      if (e.kind === 'sound') {
        if (speed > 0) playSound(e.id)
      } else if (e.kind === 'float') add.push({ id: ++floatId, x: e.x, z: e.y, text: FX_TEXT[e.text] ? tx(FX_TEXT[e.text]!) : e.text, tone: e.tone })
      // a good handed to the market hops onto its client's sign; one a client takes pops up off it as a coin (Market.tsx)
      else if (e.kind === 'deliver') startFlight(e)
      else if (e.kind === 'take') startCoin(e)
      // a good falling onto a pile is frame.ts's: it set it off before the piles were drawn
      else if (e.kind === 'fall') continue
      else
        for (let i = 0; i < e.n; i++) {
          const a = Math.random() * Math.PI * 2,
            v = 0.5 + Math.random() * 0.7
          puffs.push({ x: e.x, y: 0.35, z: e.y, vx: Math.cos(a) * v, vy: 0.6 + Math.random() * 0.6, vz: Math.sin(a) * v, t: 0, life: 0.55, r: 0.07 + Math.random() * 0.07, color: e.color })
        }
    }
    q.length = 0
    if (add.length) {
      setFloats((f) => [...f.slice(-24), ...add])
      const ids = new Set(add.map((a) => a.id))
      setTimeout(() => setFloats((f) => f.filter((x) => !ids.has(x.id))), 1100)
    }
    batch.begin()
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]!
      p.t += dt
      if (p.t >= p.life) {
        puffs.splice(i, 1)
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      p.vy -= 2.5 * dt
      batch.put(p.x, Math.max(0.05, p.y), p.z, 0, p.r * (1 - p.t / p.life), p.r * (1 - p.t / p.life), p.r * (1 - p.t / p.life), p.color)
    }
    batch.end()
  })
  return (
    <group>
      <primitive object={mesh} />
      {floats.map((f) => (
        <Html key={f.id} position={[f.x, 0.8, f.z]} center zIndexRange={[7, 0]} style={{ pointerEvents: 'none' }}>
          <span className={'float float--' + f.tone}>{f.text}</span>
        </Html>
      ))}
    </group>
  )
}
