import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useGame } from '@/game/GameContext'
import { residents } from '@/game/grid'
import { hungry, loopHasFeeder } from '@/game/systems/sheep'
import { Flock, isOn, res, type PastureT } from '@/game/world'
import { Icon } from '@/ui/Icon'
import { machineYaw, vmat } from './kit'
import { machineBody } from './machineModels'
import { useView, views } from './pick'
import type { Group } from 'three'

/**
 * A pen, a building of its own (the author): a fenced lawn with two gates, a way out and a way in, each a leaf swung
 * open the way the sheep go through it — outward at the exit, inward at the entry — so the pen says itself where sheep
 * leave and where they come back (the author: «калитки, которые открыты в определённую сторону»). Its model is the one
 * it has in hand when it is placed (machineModels.ts), and its tag says how many of its four places are taken. When its hungry
 * sheep have no feeder with hay on their loop, one hay bubble over the pen says so (not one per sheep: the author) —
 * a click on a sheep feeds it from the stock.
 */
export function Pastures() {
  const { world } = useGame()
  const [list, setList] = useState<PastureT[]>([])
  const sig = useRef('')
  // pens are built and cleared like any building: the list is read again when it changes
  useFrame(() => {
    const ps = res(world, Flock).pastures
    const s = ps.map((p) => p.id).join(',')
    if (s === sig.current) return
    sig.current = s
    setList([...ps])
  })
  return (
    <group>
      {list.map((p) => (
        <PastureView key={p.id} p={p} />
      ))}
    </group>
  )
}

function PastureView({ p }: { p: PastureT }) {
  const { world } = useGame()
  const label = useRef<HTMLSpanElement>(null)
  const [want, setWant] = useState('')
  const tags = isOn(world, 'tags')
  // the hover line finds the pen by its id
  const root = useRef<Group>(null)
  useView(views.pastures, p.id, root)
  useFrame(() => {
    if (label.current) label.current.textContent = residents(world, p) + '/' + p.cap
    const k = res(world, Flock).sheep.some((s) => s.home === p.id && hungry(s)) && !loopHasFeeder(world, p) ? 'hay' : ''
    if (k !== want) setWant(k)
  })
  return (
    <group ref={root}>
      {/* the same model the pen has in hand when it is placed (machineModels.ts), turned the way it faces */}
      <mesh position={[p.x + p.w / 2, 0, p.y + p.h / 2]} rotation-y={machineYaw('pen', p.dir)} geometry={machineBody('pen')} material={vmat()} castShadow receiveShadow />
      {want && tags && (
        <Html position={[p.x + p.w / 2, 1.3, p.y + p.h / 2]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="bubble bubble--warn">
            {want.split(',').map((k) => (
              <Icon key={k} kind={k} size={18} />
            ))}
          </div>
        </Html>
      )}
      {tags && (
        <Html position={[p.x + p.w - 0.3, 0.5, p.y + 0.15]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <span className="tag tag--pasture">
            <Icon kind="sheep" size={14} />
            <span ref={label} />
          </span>
        </Html>
      )}
    </group>
  )
}
