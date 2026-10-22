import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CircleGeometry, Frustum, InstancedMesh, Matrix4, Sphere, Vector3, type Group, type PerspectiveCamera } from 'three'
import { BUBBLE, CAMERA, DROP, HAND, LOOK, SHEEP } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { Flock, isOn, res, type SheepT } from '@/game/world'
import { Icon } from '@/ui/Icon'
import { cam } from './camera'
import { upload } from './instancing'
import { flat } from './kit'
import { frame } from './frame'
import { sheepPoses, type SheepPose } from './pick'
import { dropPose, liveliness, newPose, sheepDrawer, sheepMeshes, standAt, type SheepLook, type SheepMotion } from './sheepLook'

const _p = new Vector3(),
  _chute = new Matrix4(),
  _mark = new Matrix4(),
  _view = new Matrix4(),
  _frustum = new Frustum(),
  _ball = new Sphere(new Vector3(), 0)
/** Most sheep coming down at once, each with its mark on the grass. */
const MARKS = 16
/** What each sheep looks like and how it moves this frame, filled anew for each (no garbage for a big flock). */
const _look: SheepLook = { id: 0, wool: 0, needs: [] },
  _mo: SheepMotion = { nod: 0, breath: 0, blink: false, chute: null }

/**
 * The flock, drawn as a few instanced meshes (sheepLook.ts) posed in one pass (a sheep of four meshes cost eight draw
 * calls with its shadow: 48 sheep, 380): each sheep where it stands, a waddle while it walks, a slow nod while it
 * grazes, breathing and blinking all the while. Only the sheep in view are posed, plainer far off. Each one's pose is also kept in
 * `sheepPoses`, which the pointer and the hover line read. What a sheep needs shows on its fleece (sheepLook.ts) and, under
 * the pointer, by the scissors (ui/ShearCursor.tsx): a flock of a thousand carries no bubbles. While a sheep is being
 * shorn by hand its bubble counts the clicks, on the page.
 */
export function Flock3D() {
  const { world } = useGame()
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const meshes = useMemo(() => sheepMeshes(SHEEP.most), [])
  const draw = useMemo(() => sheepDrawer(meshes), [meshes])
  // the spots where arriving sheep will land, darkening as they come down
  const marks = useMemo(() => {
    const m = new InstancedMesh(new CircleGeometry(1, 20).rotateX(-Math.PI / 2), flat(LOOK.dropMark, DROP.mark.opacity), MARKS)
    m.name = 'sheep_drop_marks'
    m.count = 0
    m.frustumCulled = false
    return m
  }, [])
  // the flock drawn plain, far off (CAMERA.plainFlock)
  const far = useRef(false)
  // the frames drawn: a pose drawn this frame carries the number
  const frames = useRef(0)
  // the sheep being shorn, whose bubbles count the clicks
  const [shorn, setShorn] = useState<SheepT[]>([])
  const cut = useRef<SheepT[]>([])
  // when each sheep still coming down began its drop, on the animation clock: it is drawn smoothly between the steps
  const dropStart = useRef(new Map<number, number>())
  useEffect(() => () => Object.values(meshes).forEach((m) => m.dispose()), [meshes])
  useEffect(() => () => marks.geometry.dispose(), [marks])
  useFrame(() => {
    const list = res(world, Flock).sheep
    const t = frame.t
    // the view, a frame's sheep tested against it
    camera.updateMatrixWorld()
    _frustum.setFromProjectionMatrix(_view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))

    // the click counters: while the labels are on
    const tags = isOn(world, 'tags')
    const stamp = ++frames.current
    cut.current.length = 0
    let nm = 0
    far.current = cam.dist > CAMERA.plainFlock[far.current ? 1 : 0]
    draw.begin(far.current)
    for (const s of list) {
      const spot = frame.sheep.get(s)
      if (!spot || spot.inMachine || !_frustum.intersectsSphere(_ball.set(_p.set(spot.x, 0.4, spot.z), CAMERA.flockReach))) continue
      const hop = s.state === 'roam' && Math.hypot(s.tx - s.px, s.ty - s.py) > 0.05 ? Math.abs(Math.sin(t * 9 + s.id)) * 0.05 : 0
      const pose = poseOf(s.id)
      pose.seen = stamp
      _look.id = s.id
      _look.needs = s.needs
      liveliness(s.id, t, _mo)
      // an arriving sheep coming down on its parachute
      if (s.drop !== undefined) {
        let t0 = dropStart.current.get(s.id)
        if (t0 === undefined) dropStart.current.set(s.id, (t0 = t - (DROP.fall + DROP.land - s.drop)))
        const k = Math.min(1, (t - t0) / DROP.fall)
        if (k < 1 && nm < MARKS) {
          const r = DROP.mark.from + (DROP.mark.to - DROP.mark.from) * k
          marks.setMatrixAt(nm++, _mark.makeTranslation(spot.x, 0.02, spot.z).multiply(_chute.makeScale(r, 1, r)))
        }
        const chute = dropPose(t - t0, t, s.id, spot.x, spot.z, spot.yaw, pose.base, _chute)
        _look.wool = s.wool
        _mo.nod = 0.3
        _mo.chute = chute ? _chute : null
        draw.add(_look, pose.base, _mo, pose)
        continue
      }
      if (dropStart.current.size) dropStart.current.delete(s.id)
      // the whole sheep: where it stands, which way it faces, a waddle while it walks
      const y = s.state === 'held' ? 0.5 : s.state === 'belt' ? 0.13 : (spot.lift ?? 0)
      standAt(pose.base, spot.x, y + hop, spot.z, spot.yaw, hop ? Math.sin(t * 9 + s.id) * 0.08 : 0)
      // a slow nod while it grazes
      _mo.nod = 0.2 + (s.state === 'roam' && !hop ? Math.sin(t * 1.3 + s.id * 1.7) * 0.1 : 0)
      _mo.chute = null
      _look.wool = Math.max(0, s.wool * (1 - s.clicks / HAND.shearClicks))
      draw.add(_look, pose.base, _mo, pose)
      if (tags && s.clicks > 0) cut.current.push(s)
    }
    draw.end()
    marks.count = nm
    upload(marks, nm)
    // the poses of sheep not drawn this frame go (in a machine, out of view, gone)
    for (const [id, p] of sheepPoses) if (p.seen !== stamp) sheepPoses.delete(id)
    for (const id of dropStart.current.keys()) if (sheepPoses.get(id)?.seen !== stamp) dropStart.current.delete(id)
    const now = cut.current
    if (now.length !== shorn.length || now.some((s, i) => shorn[i] !== s)) setShorn([...now])
  })
  return (
    <group>
      {Object.values(meshes).map((m) => (
        <primitive key={m.name} object={m} />
      ))}
      <primitive object={marks} />
      {shorn.map((s) => (
        <ShearBubble key={s.id} s={s} />
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

/** The bubble of a sheep being shorn, following it: its clicks so far, and the shears while its fleece is still on. */
function ShearBubble({ s }: { s: SheepT }) {
  const g = useRef<Group>(null)
  const [fluffy, setFluffy] = useState(false)
  const [clicks, setClicks] = useState(s.clicks)
  useFrame(() => {
    const spot = frame.sheep.get(s)
    if (!g.current) return
    g.current.visible = !!spot && !spot.inMachine
    if (spot) g.current.position.set(spot.x, s.state === 'held' ? 0.5 : s.state === 'belt' ? 0.13 : (spot.lift ?? 0), spot.z)
    const f = s.state === 'roam' && s.wool >= 1
    if (f !== fluffy) setFluffy(f)
    if (s.clicks !== clicks) setClicks(s.clicks)
  })
  return (
    <group ref={g}>
      <Html position={[0, BUBBLE.up, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className="bubble bubble--shear">
          {fluffy ? <Icon kind="shear" size={16} /> : null}
          <span className="bubble__clicks">
            {Array.from({ length: HAND.shearClicks }, (_, i) => (
              <i key={i} className={i < clicks ? 'on' : ''} />
            ))}
          </span>
        </div>
      </Html>
    </group>
  )
}
