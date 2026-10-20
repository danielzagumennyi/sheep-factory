import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CircleGeometry, Euler, InstancedMesh, Matrix4, Quaternion, Vector3, type Group } from 'three'
import { DROP, HAND, LOOK } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { Flock, isOn, res, type SheepT } from '@/game/world'
import { Icon } from '@/ui/Icon'
import { flat } from './kit'
import { frame } from './frame'
import { sheepPoses, type SheepPose } from './pick'
import { dropPose, liveliness, newPose, sheepDrawer, sheepMeshes } from './sheepLook'

/** Most sheep drawn at once. */
const CAP = 256

const _p = new Vector3(),
  _q = new Quaternion(),
  _s = new Vector3(),
  _e = new Euler(),
  _chute = new Matrix4(),
  _mark = new Matrix4()
/** Most sheep coming down at once, each with its mark on the grass. */
const MARKS = 16

/**
 * The flock, drawn as a few instanced meshes (sheepLook.ts) posed in one pass (a sheep of four meshes cost eight draw
 * calls with its shadow: 48 sheep, 380): each sheep where it stands, a waddle while it walks, a slow nod while it
 * grazes, breathing and blinking all the while. Each sheep's pose is also kept in `sheepPoses`, which the pointer and the hover line read. A bubble shows what
 * a sheep needs.
 */
export function Flock3D() {
  const { world } = useGame()
  const [ids, setIds] = useState<SheepT[]>([])
  const meshes = useMemo(() => sheepMeshes(CAP), [])
  const draw = useMemo(() => sheepDrawer(meshes), [meshes])
  // the spots where bought sheep will land, darkening as they come down
  const marks = useMemo(() => {
    const m = new InstancedMesh(new CircleGeometry(1, 20).rotateX(-Math.PI / 2), flat(LOOK.dropMark, DROP.mark.opacity), MARKS)
    m.name = 'sheep_drop_marks'
    m.count = 0
    m.frustumCulled = false
    return m
  }, [])
  // when each sheep still coming down began its drop, on the animation clock: it is drawn smoothly between the steps
  const dropStart = useRef(new Map<number, number>())
  useEffect(() => () => Object.values(meshes).forEach((m) => m.dispose()), [meshes])
  useEffect(() => () => marks.geometry.dispose(), [marks])
  useFrame(() => {
    const list = res(world, Flock).sheep
    if (list.length !== ids.length || list.some((s, i) => ids[i] !== s)) setIds([...list])
    const t = frame.t
    const seen = new Set<number>()
    let nm = 0
    draw.begin()
    for (const s of list) {
      const spot = frame.sheep.get(s)
      if (!spot || spot.inMachine) {
        sheepPoses.delete(s.id)
        continue
      }
      seen.add(s.id)
      const hop = (s.state === 'pasture' || s.state === 'transit' || s.state === 'roam') && Math.hypot(s.tx - s.px, s.ty - s.py) > 0.05 ? Math.abs(Math.sin(t * 9 + s.id)) * 0.05 : 0
      const pose = poseOf(s.id)
      // a bought sheep coming down on its parachute
      if (s.drop !== undefined) {
        let t0 = dropStart.current.get(s.id)
        if (t0 === undefined) dropStart.current.set(s.id, (t0 = t - (DROP.fall + DROP.land - s.drop)))
        const k = Math.min(1, (t - t0) / DROP.fall)
        if (k < 1 && nm < MARKS) {
          const r = DROP.mark.from + (DROP.mark.to - DROP.mark.from) * k
          marks.setMatrixAt(nm++, _mark.makeTranslation(spot.x, 0.02, spot.z).multiply(_chute.makeScale(r, 1, r)))
        }
        const chute = dropPose(t - t0, t, s.id, spot.x, spot.z, spot.yaw, pose.base, _chute)
        draw.add({ id: s.id, wool: s.wool, marks: s.marks }, pose.base, { nod: 0.3, ...liveliness(s.id, t), chute: chute ? _chute : null }, pose)
        continue
      }
      dropStart.current.delete(s.id)
      // the whole sheep: where it stands, which way it faces, a waddle while it walks
      pose.base.compose(_p.set(spot.x, (s.state === 'held' ? 0.5 : s.state === 'belt' ? 0.13 : (spot.lift ?? 0)) + hop, spot.z), _q.setFromEuler(_e.set(hop ? Math.sin(t * 9 + s.id) * 0.08 : 0, spot.yaw, 0, 'YXZ')), _s.set(1, 1, 1))
      // a slow nod while it grazes
      const nod = 0.2 + ((s.state === 'pasture' || s.state === 'roam') && !hop ? Math.sin(t * 1.3 + s.id * 1.7) * 0.1 : 0)
      draw.add({ id: s.id, wool: Math.max(0, s.wool * (1 - s.clicks / HAND.shearClicks)), marks: s.marks }, pose.base, { nod, ...liveliness(s.id, t) }, pose)
    }
    draw.end()
    marks.count = nm
    marks.instanceMatrix.needsUpdate = true
    for (const id of sheepPoses.keys()) if (!seen.has(id)) sheepPoses.delete(id)
    for (const id of dropStart.current.keys()) if (!seen.has(id)) dropStart.current.delete(id)
  })
  return (
    <group>
      {Object.values(meshes).map((m) => (
        <primitive key={m.name} object={m} />
      ))}
      <primitive object={marks} />
      {isOn(world, 'tags') &&
        ids.map((s) => (
          <SheepBubble key={s.id} s={s} />
        ))}
    </group>
  )
}

function poseOf(id: number): SheepPose {
  let p = sheepPoses.get(id)
  if (!p) {
    p = newPose()
    sheepPoses.set(id, p)
  }
  return p
}

/** A sheep's bubble — ready to shear, in a pen or roaming — following it; what the pasture lacks shows over the pasture. */
function SheepBubble({ s }: { s: SheepT }) {
  const g = useRef<Group>(null)
  const [need, setNeed] = useState('')
  const [clicks, setClicks] = useState(0)
  useFrame(() => {
    const spot = frame.sheep.get(s)
    if (!g.current) return
    g.current.visible = !!spot && !spot.inMachine
    if (spot) g.current.position.set(spot.x, s.state === 'held' ? 0.5 : s.state === 'belt' ? 0.13 : (spot.lift ?? 0), spot.z)
    const n = (s.state === 'pasture' || s.state === 'roam') && s.wool >= 1 ? 'shear' : ''
    if (n !== need) setNeed(n)
    if (s.clicks !== clicks) setClicks(s.clicks)
  })
  return (
    <group ref={g}>
      {(need || clicks > 0) && (
        <Html position={[0, 0.9, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className={'bubble bubble--' + (need || 'shear')}>
            {need ? <Icon kind={need} size={16} /> : null}
            {clicks > 0 && (
              <span className="bubble__clicks">
                {Array.from({ length: HAND.shearClicks }, (_, i) => (
                  <i key={i} className={i < clicks ? 'on' : ''} />
                ))}
              </span>
            )}
          </div>
        </Html>
      )}
    </group>
  )
}
