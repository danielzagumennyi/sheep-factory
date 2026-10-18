import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, Mesh, type Object3D } from 'three'
import { OUTLINE_LAYER, OutlinePass, markOutlined, outlined, unmarkOutlined } from '@kit/outline'
import { useGame } from '@/game/GameContext'
import { beltInDir, pastureAt } from '@/game/grid'
import { Plant, Ui, key, res } from '@/game/world'
import { machineYaw, vmat } from './kit'
import { drawBelt, useBeltPieces } from './Belts'
import { machineBody } from './machineModels'
import { pickAt, poseProxy, pointer, sheepPoses, sheepProxy, views } from './pick'

/**
 * What the hand is over — a machine, a dock, a sheep, a belt, a pasture — gets a warm line round its silhouette (the author: «при
 * наведении на объект он обводится по силуэту»), drawn by Cubocalypse's outline pass (@kit/outline) with only its
 * highlight half on: the hovered object alone goes into the id buffer, its parts share one id, so the line runs round
 * the outside of the whole thing and never between its pieces.
 */
export function Hover() {
  const { world } = useGame()
  const camera = useThree((s) => s.camera)
  const cur = useRef<Object3D | null>(null)
  // the flock is instanced: a sheep is outlined through a proxy in its pose, drawn only into the outline's id buffer
  const proxy = useMemo(() => {
    const p = sheepProxy()
    p.group.traverse((o) => o.layers.set(OUTLINE_LAYER))
    return p
  }, [])
  // machines are instanced too: one of them is outlined through a mesh of its whole model in its place
  const machine = useMemo(() => {
    const m = new Mesh(undefined, vmat())
    m.layers.set(OUTLINE_LAYER)
    return m
  }, [])
  // belts are instanced as well: the hovered cell is drawn again, into the outline's id buffer only (the author:
  // «наведение на ленты … не подсвечивается»); a splitter or a merger goes through the machine mesh, turned its way
  const beltProxy = useBeltPieces(2, 'hover_belt', false)
  const belt = useMemo(() => {
    const g = new Group()
    for (const q of Object.values(beltProxy)) {
      q.mesh.layers.set(OUTLINE_LAYER)
      g.add(q.mesh)
    }
    return { g }
  }, [beltProxy])
  // the pass renders an id buffer and a full-screen line every frame: only while something is outlined
  const pass = useRef<Group>(null)
  useFrame(() => {
    for (const q of Object.values(beltProxy)) q.begin()
    const ui = res(world, Ui),
      h = ui.hover
    let next: Object3D | null = null
    // sheep walk and the camera moves: look again under the still pointer every frame, by the models (pick.ts)
    if (h && pointer.inside) {
      const look = ui.tool === 'hand' || ui.tool === 'erase'
      const pk = look ? pickAt(world, camera, pointer.ndc, ui.tool === 'hand' && !ui.drag) : null
      h.sheep = pk?.sheep?.id ?? null
      h.b = pk?.b ? key(pk.b.x, pk.b.y) : null
    }
    if (h && ui.tool === 'hand' && !ui.pending && !ui.drag) {
      const pose = h.sheep !== null ? sheepPoses.get(h.sheep) : undefined
      if (pose) {
        poseProxy(proxy, pose)
        next = proxy.group
      } else {
        const b = h.b ? res(world, Plant).b.get(h.b) : null
        if (b?.type === 'belt') {
          drawBelt(beltProxy, b.x, b.y, beltInDir(world, b), b.dir, b.phase, 0, true)
          next = belt.g
        } else if (b && b.type !== 'dock') {
          // a machine, a splitter or a merger: a mesh of its whole model in its place, turned as it stands
          machine.geometry = machineBody(b.type)
          machine.position.set(b.x + b.w / 2, 0, b.y + b.h / 2)
          machine.rotation.y = machineYaw(b.type, b.dir)
          next = machine
        } else if (b && b.part !== 'row') next = views.buildings.get(key(b.x, b.y)) ?? null
        else if (b) next = null
        else {
          // a pasture is outlined the same way, fence and lawn
          const pa = pastureAt(world, h.x, h.y)
          next = pa ? (views.pastures.get(pa.id) ?? null) : null
        }
      }
    }
    for (const q of Object.values(beltProxy)) q.end()
    // the pass runs while anything is outlined: the hovered thing, or the building in hand (Ghost.tsx)
    if (pass.current) pass.current.visible = outlined.size > 0 || !!next
    if (next === cur.current) return
    if (cur.current) unmarkOutlined(cur.current)
    if (next) markOutlined(next, 'hover', true)
    cur.current = next
  })
  useEffect(
    () => () => {
      if (cur.current) unmarkOutlined(cur.current)
    },
    [],
  )
  return (
    <>
      <primitive object={proxy.group} />
      <primitive object={machine} />
      <primitive object={belt.g} />
      <group ref={pass} visible={false}>
        <OutlinePass world={false} />
      </group>
    </>
  )
}
