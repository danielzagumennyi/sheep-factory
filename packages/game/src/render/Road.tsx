import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Group } from 'three'
import { GRID, ISLAND, ROAD } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { doneFor, orderFor } from '@/game/systems/orders'
import { Market, Plant, key, res, type Building, type TruckT } from '@/game/world'
import { useView, views } from './pick'
import { useT } from '@/i18n'
import { ITEM_NAMES } from '@/i18n/content'
import { UI } from '@/i18n/ui'
import type { ItemId } from '@/game/balance'
import { Icon } from '@/ui/Icon'
import { vmat } from './kit'
import { dockBody, good, marketBody, truckBody } from './models'

/** Where goods sit in a truck's open box: two layers of three, the second rising above the rim. */
const LOAD_SPOTS: [number, number, number][] = [
  [-0.44, 0.36, -0.1],
  [-0.14, 0.36, 0.1],
  [0.14, 0.36, -0.1],
  [-0.44, 0.36, 0.12],
  [-0.3, 0.56, 0],
  [0.02, 0.56, 0.02],
]

/** Docks on the row above the road, and the trucks that come for each order. */
export function Road() {
  const { world } = useGame()
  const docks = [...res(world, Plant).b.values()].filter((b) => b.type === 'dock')
  return (
    <group>
      {docks.map((d) => (
        <Dock key={d.x} d={d} />
      ))}
      <Trucks />
    </group>
  )
}

/** A loading platform with a signpost: the good it wants now, by icon and name; the market says it is the market. */
function Dock({ d }: { d: Building }) {
  const { world } = useGame()
  const { t } = useT()
  const [want, setWant] = useState<string>('')
  const root = useRef<Group>(null)
  useView(views.buildings, key(d.x, d.y), root)
  useFrame(() => {
    const o = orderFor(world, d.client!) ?? doneFor(world, d.client!)
    const w = o?.kind ?? ''
    if (w !== want) setWant(w)
  })
  if (d.client === 'market')
    return (
      <group ref={root} position={[d.x + d.w / 2, 0, d.y + d.h / 2]}>
        <MarketStall />
        <Html position={[0, 2.0, 0.3]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <span className="tag tag--dock tag--market">
            <Icon kind="coin" size={16} />
            {t(UI.market)}
          </span>
        </Html>
      </group>
    )
  return (
    <group ref={root} position={[d.x + d.w / 2, 0, d.y + d.h / 2]}>
      <mesh geometry={dockBody()} material={vmat()} receiveShadow castShadow />
      <Html position={[0, 1.0, -0.3]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
        <span className={'tag tag--dock' + (want ? ' tag--on' : '')}>
          {want && <Icon kind={want} size={16} />}
          {want ? t(ITEM_NAMES[want as ItemId]) : ''}
        </span>
      </Html>
    </group>
  )
}

/** The market: a stall of its own — counter, striped awning on posts, crates of goods — with no truck and no parking bay. */
function MarketStall() {
  return <mesh geometry={marketBody()} material={vmat()} castShadow receiveShadow />
}

function Trucks() {
  const { world } = useGame()
  const [ids, setIds] = useState<string[]>([])
  useFrame(() => {
    const now = res(world, Market).trucks.map((t) => t.order)
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

/** A small lorry: drives along lane B, parks on lane A at its dock and shows the order's count while parked. */
function Truck({ id }: { id: string }) {
  const { world } = useGame()
  const g = useRef<Group>(null)
  const label = useRef<HTMLSpanElement>(null)
  const tag = useRef<HTMLDivElement>(null)
  const load = useRef<Group>(null)
  useFrame(() => {
    const m = res(world, Market)
    const tr: TruckT | undefined = m.trucks.find((q) => q.order === id)
    const o = m.orders.find((q) => q.id === id)
    if (!tr || !g.current) return
    g.current.position.set(tr.x + 0.5, 0, ROAD.laneA + (ROAD.laneB - ROAD.laneA) * tr.lane)
    // they grow out of the island's edge as they come and shrink into it as they go: the road ends at the edge
    const inside = Math.min(tr.x + 0.5 - (-ISLAND.margin + 0.9), GRID.cols + ISLAND.margin - 0.9 - (tr.x + 0.5))
    const k = Math.max(0, Math.min(1, inside / 0.8))
    g.current.scale.setScalar(k * k * (3 - 2 * k))
    g.current.visible = k > 0
    const parked = tr.state === 'park' || tr.state === 'out'
    if (tag.current) tag.current.style.display = parked && o ? '' : 'none'
    if (label.current && o) label.current.textContent = o.done ? '½ ' + (o.extra % o.batch) + '/' + o.batch : o.have + '/' + o.total
    // the load grows in the open box as the order fills
    if (load.current && o) {
      const n = Math.ceil((o.done ? 1 : o.have / o.total) * LOAD_SPOTS.length)
      load.current.children.forEach((c, i) => (c.visible = i < n))
    }
  })
  const order = res(world, Market).orders.find((q) => q.id === id)
  return (
    <group ref={g}>
      <mesh geometry={truckBody()} material={vmat()} castShadow />
      {/* the load: the very goods of the order, stacked in the open box as it fills */}
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
