import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Color, Euler, InstancedMesh, Matrix4, Quaternion, Vector3, type Group } from 'three'
import { HAND, LOOK } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { Flock, isOn, res, type SheepT } from '@/game/world'
import { Icon } from '@/ui/Icon'
import { vmat } from './kit'
import { fleece, fleeceCurls, fleeceFelt, fleeceSleek, fleeceSweater, sheepHead, sheepLegs, shorn } from './models'
import { frame } from './frame'
import { sheepPoses, type SheepPose } from './pick'

/** Most sheep drawn at once. */
const CAP = 256

const _m = new Matrix4(),
  _p = new Vector3(),
  _q = new Quaternion(),
  _s = new Vector3(),
  _e = new Euler()
/** Tints over the white fleece meshes: plain white, the bath's felt, a coloured sheep's colour, a sweater's red. */
const WHITE = new Color('#ffffff'),
  FELT = new Color(LOOK.feltFleece),
  SWEATER = new Color(LOOK.sweater),
  DYED = LOOK.fleeceColors.map((c) => new Color(c)),
  STRIPE = LOOK.colors.map((c) => new Color(c))

/**
 * The flock: cube sheep with big eyes, like the animals of the reference dioramas. The fleece grows from a pink shorn
 * body to a big white block, and shows where the sheep has been in the salon (the author, 19.10.2026: the sheep's path
 * must be plain): sleek after the comb, matted after the bath, curls after the curling, a sweater after the knitting,
 * and the colour it took at the dye station. A bubble shows what a sheep needs. All of them are a few instanced meshes —
 * legs, the fleeces, the curls, the sweater, the shorn body, the head — posed in one pass (a sheep of four meshes cost
 * eight draw calls with its shadow: 48 sheep, 380); each sheep's pose is also kept in `sheepPoses`, which the pointer and
 * the hover line read.
 */
export function Flock3D() {
  const { world } = useGame()
  const [ids, setIds] = useState<SheepT[]>([])
  const meshes = useMemo(() => {
    const make = (geo: ReturnType<typeof fleece>, name: string) => {
      const m = new InstancedMesh(geo, vmat(), CAP)
      m.name = name
      m.count = 0
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false
      return m
    }
    const out = {
      legs: make(sheepLegs(), 'sheep_legs'),
      fleece: make(fleece(), 'sheep_fleece'),
      sleek: make(fleeceSleek(), 'sheep_sleek'),
      felt: make(fleeceFelt(), 'sheep_felt'),
      curls: make(fleeceCurls(), 'sheep_curls'),
      sweater: make(fleeceSweater(), 'sheep_sweater'),
      skin: make(shorn(), 'sheep_shorn'),
      head: make(sheepHead(), 'sheep_heads'),
    }
    // the tints from the start, so their shaders are built with them
    for (const m of [out.fleece, out.sleek, out.felt, out.curls, out.sweater]) for (let i = 0; i < CAP; i++) m.setColorAt(i, WHITE)
    return out
  }, [])
  useEffect(() => () => Object.values(meshes).forEach((m) => m.dispose()), [meshes])
  useFrame(() => {
    const list = res(world, Flock).sheep
    if (list.length !== ids.length || list.some((s, i) => ids[i] !== s)) setIds([...list])
    const t = frame.t
    let nl = 0,
      ns = 0,
      nh = 0
    const n = { fleece: 0, sleek: 0, felt: 0, curls: 0, sweater: 0 }
    const add = (k: keyof typeof n, mx: Matrix4, c: Color) => {
      meshes[k].setColorAt(n[k], c)
      meshes[k].setMatrixAt(n[k]++, mx)
    }
    const seen = new Set<number>()
    for (const s of list) {
      const spot = frame.sheep.get(s)
      if (!spot || spot.inMachine) {
        sheepPoses.delete(s.id)
        continue
      }
      seen.add(s.id)
      const hop = (s.state === 'pasture' || s.state === 'transit' || s.state === 'roam') && Math.hypot(s.tx - s.px, s.ty - s.py) > 0.05 ? Math.abs(Math.sin(t * 9 + s.id)) * 0.05 : 0
      // the whole sheep: where it stands, which way it faces, a waddle while it walks
      const base = poseOf(s.id).base
      base.compose(_p.set(spot.x, (s.state === 'held' ? 0.5 : s.state === 'belt' ? 0.13 : (spot.lift ?? 0)) + hop, spot.z), _q.setFromEuler(_e.set(hop ? Math.sin(t * 9 + s.id) * 0.08 : 0, spot.yaw, 0, 'YXZ')), _s.set(1, 1, 1))
      const pose = poseOf(s.id)
      pose.legs.copy(base)
      meshes.legs.setMatrixAt(nl++, pose.legs)
      // the fleece sits on the legs however big it is
      const w = Math.max(0, s.wool * (1 - s.clicks / HAND.shearClicks))
      pose.woolly = w > 0.12
      if (pose.woolly) {
        const k = 0.62 + 0.5 * w
        pose.fleece.multiplyMatrices(base, _m.compose(_p.set(-0.02, 0.15 + 0.18 * k, 0), _q.identity(), _s.set(k, k, k)))
        // the salon's marks: the fleece itself (woolly, sleek or felted), then curls and a sweater over it
        const m = s.marks,
          tint = m.dye ? DYED[s.id % DYED.length]! : m.bath ? FELT : WHITE
        add(m.bath ? 'felt' : m.comb ? 'sleek' : 'fleece', pose.fleece, tint)
        if (m.curl) add('curls', pose.fleece, tint)
        if (m.knit) add('sweater', pose.fleece, m.dye ? STRIPE[s.id % STRIPE.length]! : SWEATER)
      } else {
        pose.fleece.multiplyMatrices(base, _m.makeTranslation(-0.02, 0.27, 0))
        meshes.skin.setMatrixAt(ns++, pose.fleece)
      }
      // a slow nod while it grazes
      const nod = 0.2 + ((s.state === 'pasture' || s.state === 'roam') && !hop ? Math.sin(t * 1.3 + s.id * 1.7) * 0.1 : 0)
      pose.head.multiplyMatrices(base, _m.compose(_p.set(0.34, 0.45, 0), _q.setFromEuler(_e.set(0, 0, nod)), _s.set(0.78, 0.78, 0.78)))
      meshes.head.setMatrixAt(nh++, pose.head)
    }
    for (const id of sheepPoses.keys()) if (!seen.has(id)) sheepPoses.delete(id)
    meshes.legs.count = nl
    for (const k of Object.keys(n) as (keyof typeof n)[]) {
      meshes[k].count = n[k]
      if (meshes[k].instanceColor) meshes[k].instanceColor.needsUpdate = true
    }
    meshes.skin.count = ns
    meshes.head.count = nh
    for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      {Object.values(meshes).map((m) => (
        <primitive key={m.name} object={m} />
      ))}
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
    p = { base: new Matrix4(), legs: new Matrix4(), fleece: new Matrix4(), head: new Matrix4(), woolly: true }
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
