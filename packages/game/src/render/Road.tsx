import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Group } from 'three'
import { ISLAND, ROAD } from '@/game/balance'
import { island } from './island'
import { useGame } from '@/game/GameContext'
import { Market, isOn, res, type TruckT } from '@/game/world'
import type { ItemId } from '@/game/balance'
import { vmat } from './kit'
import { good, truckBody } from './models'
import { Market as MarketView } from './Market'

/** Where goods sit in a truck's open box: two layers of three, the second rising above the rim. */
const LOAD_SPOTS: [number, number, number][] = [
  [-0.44, 0.36, -0.1],
  [-0.14, 0.36, 0.1],
  [0.14, 0.36, -0.1],
  [-0.44, 0.36, 0.12],
  [-0.3, 0.56, 0],
  [0.02, 0.56, 0.02],
]

/** The market and its row (Market.tsx), and the trucks that come for each ask and park at the market. */
export function Road() {
  return (
    <group>
      <MarketView />
      <Trucks />
    </group>
  )
}

function Trucks() {
  const { world } = useGame()
  const [ids, setIds] = useState<number[]>([])
  useFrame(() => {
    const now = res(world, Market).trucks.map((t) => t.ask)
    if (now.join() !== ids.join()) setIds(now)
  })
  return (
    <group>
      {ids.map((id) => (
        <Truck key={id} id={id} />
      ))}
    </group>
  )
}

/** A small lorry: drives along lane B, parks on lane A at its bay in front of the market and shows the ask's count while parked. */
function Truck({ id }: { id: number }) {
  const { world } = useGame()
  const g = useRef<Group>(null)
  const label = useRef<HTMLSpanElement>(null)
  const tag = useRef<HTMLDivElement>(null)
  const load = useRef<Group>(null)
  useFrame(() => {
    const m = res(world, Market)
    const tr: TruckT | undefined = m.trucks.find((q) => q.ask === id)
    const o = m.asks.find((q) => q.id === id)
    if (!tr || !g.current) return
    g.current.position.set(tr.x + 0.5, 0, ROAD.laneA + (ROAD.laneB - ROAD.laneA) * tr.lane)
    // they grow out of the island's edge as they come and shrink into it as they go: the road ends at the edge
    const inside = Math.min(tr.x + 0.5 - (-ISLAND.margin + 0.9), island.right + ISLAND.margin - 0.9 - (tr.x + 0.5))
    const k = Math.max(0, Math.min(1, inside / 0.8))
    g.current.scale.setScalar(k * k * (3 - 2 * k))
    g.current.visible = k > 0
    const parked = tr.state === 'park' || tr.state === 'out'
    if (tag.current) tag.current.style.display = parked && o && isOn(world, 'tags') ? '' : 'none'
    if (label.current && o) label.current.textContent = o.have + '/' + o.total
    // the load grows in the open box as the ask fills
    if (load.current && o) {
      const n = Math.ceil(Math.min(1, o.have / o.total) * LOAD_SPOTS.length)
      load.current.children.forEach((c, i) => (c.visible = i < n))
    }
  })
  const order = res(world, Market).asks.find((q) => q.id === id)
  return (
    <group ref={g}>
      <mesh geometry={truckBody()} material={vmat()} castShadow />
      {/* the load: the very goods of the ask, stacked in the open box as it fills */}
      <group ref={load}>
        {LOAD_SPOTS.map((p, i) => (
          <mesh key={i} position={p} geometry={good((order?.kind ?? 'wool') as ItemId)} material={vmat()} scale={1.25} visible={false} castShadow />
        ))}
      </group>
      <Html position={[-0.14, 1.05, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={tag} className="tag tag--truck" style={{ display: 'none' }}>
          <span ref={label} />
        </div>
      </Html>
    </group>
  )
}
