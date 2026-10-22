import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Euler, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry, type Group } from 'three'
import { LOOK, ROOF, type BuildingId } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { machineState } from '@/game/systems/machines'
import { Plant, isOn, res, type Building, type SplitRule } from '@/game/world'
import { Icon } from '@/ui/Icon'
import { GEO, machineYaw, mat, vmat, yawOf } from './kit'
import { machineModel } from './machineModels'
import { frame } from './frame'


/** The colour a splitter shows for a rule: the station's own colour, white for a ready sheep, pink for a shorn one. */
const RULE_COLOR: Readonly<Record<SplitRule, string>> = {
  any: LOOK.machine,
  wash: ROOF.wash,
  comb: ROOF.comb,
  pick: ROOF.pick,
  ready: LOOK.wool,
  shorn: LOOK.skin,
  off: LOOK.bad,
}

/** Re-renders the list only when buildings are added, removed, turned or re-ruled. */
function useBuildings() {
  const { world } = useGame()
  const [list, setList] = useState<Building[]>([])
  const sig = useRef('')
  useFrame(() => {
    const b = res(world, Plant).b
    let s = ''
    for (const q of b.values()) if (q.type !== 'belt') s += q.type + q.x + ',' + q.y + q.dir + (q.rules ? q.rules.l + q.rules.f + q.rules.r : '') + ';'
    if (s === sig.current) return
    sig.current = s
    setList([...b.values()].filter((q) => q.type !== 'belt'))
  })
  return list
}

export function Machines() {
  const list = useBuildings()
  return (
    <group>
      <MachineMeshes list={list} />
      {list.map((b) => (
        <MachineView key={b.type + b.x + ',' + b.y + ':' + b.dir + (b.rules ? b.rules.l + b.rules.f + b.rules.r : '')} b={b} />
      ))}
    </group>
  )
}

/**
 * A building's sign (GDD 4.3): over a sheep it may not take, standing at its way in and stopping the line — red, with
 * what that sheep needs first (the station for it, the shears, or the portal for a shorn one) — and a red «!» over a
 * station whose way out is blocked. A carrot with no fluffy sheep in its circle shows a sheep. Nothing while it works
 * or waits: on a line that is most of the time. Its body and parts are drawn with every other machine's
 * (MachineMeshes); the portal is its own (Portal.tsx).
 */
function MachineView({ b }: { b: Building }) {
  const { world } = useGame()
  const [mood, setMood] = useState('')
  const at = useRef<Group>(null)
  useFrame(() => {
    const st = machineState(world, b)
    const m = st.text === 'wrongSheep' ? 'bad:' + st.need : st.text === 'outBlocked' ? 'bad:!' : st.text === 'nearSheep' && !st.n ? 'warn:sheep' : ''
    if (m !== mood) setMood(m)
    // the sign over the wrong sheep itself, where the player must take it off; else over the building
    const g = at.current
    if (!g) return
    const s = b.wrong?.sheep,
      spot = s && st.text === 'wrongSheep' ? frame.sheep.get(s) : null
    if (spot) g.position.set(spot.x, 1.35, spot.z)
    else g.position.set(b.x + b.w / 2, b.type === 'dock' ? 1 : machineModel(b.type).top + 0.55, b.y + b.h / 2)
  })
  if (b.type === 'splitter' || b.type === 'merger') return <BeltPiece b={b} />
  return (
    <group ref={at}>
      {mood && isOn(world, 'tags') && (
        <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          {mood.startsWith('bad:') ? (
            // the line stands: a red stop sign, and what the sheep needs first
            <div className="bubble bubble--stop">
              <b>!</b>
              {mood !== 'bad:!' && <Icon kind={mood.slice(4)} size={22} />}
            </div>
          ) : (
            <div className={'bubble bubble--' + mood.split(':')[0]}>
              <Icon kind={mood.split(':')[1]!} size={16} />
            </div>
          )}
        </Html>
      )}
    </group>
  )
}

/** A machine just placed: it falls from the height it was held at (Ghost.tsx) for `fall` s, then settles for `settle` s. */
const DROP = { lift: 0.24, fall: 0.16, settle: 0.24 } as const

/** Is this machine at work: a sheep in hand, or a carrot putting the next one out? Its parts move only then. */
const busyOf = (b: Building) => !!b.slot || (b.type === 'carrot' && b.prog > 0)

const _m = new Matrix4(),
  _n = new Matrix4(),
  _a = new Matrix4(),
  _b = new Matrix4(),
  _p = new Vector3(),
  _q = new Quaternion(),
  _s = new Vector3(),
  _e = new Euler()

/**
 * Every machine's body and moving parts: one instanced mesh per model (the body of a
 * kind, each of its parts), posed in one pass each frame — 30 machines of five meshes each cost 300 draw calls with
 * their shadows, this costs about 40. The whole model turns with its building (machineYaw). A part moves while its
 * machine works: spins keep their angle per machine.
 */
function MachineMeshes({ list }: { list: Building[] }) {
  const machines = useMemo(() => list.filter((b) => b.type !== 'splitter' && b.type !== 'merger' && b.type !== 'dock'), [list])
  // one instanced mesh per geometry in use, sized for how many machines use it
  const meshes = useMemo(() => {
    const need = new Map<BufferGeometry, number>()
    const want = (g: BufferGeometry) => need.set(g, (need.get(g) ?? 0) + 1)
    for (const b of machines) {
      const spec = machineModel(b.type as BuildingId)
      want(spec.body)
      for (const pt of spec.parts) want(pt.geo())
    }
    const out = new Map<BufferGeometry, InstancedMesh>()
    for (const [g, n] of need) {
      const m = new InstancedMesh(g, vmat(), n)
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false
      m.count = 0
      out.set(g, m)
    }
    return out
  }, [machines])
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes])
  // the angle each spinning part has turned to, per machine and part
  const spins = useRef(new Map<string, number>())
  // when each machine was first drawn: one placed now comes down from where it was held and settles (the ones there
  // from the start just stand)
  const born = useRef(new Map<string, number>())
  const first = useRef(true)
  useFrame((state) => {
    for (const m of meshes.values()) m.count = 0
    const put = (g: BufferGeometry, mx: Matrix4) => {
      const mesh = meshes.get(g)
      if (mesh) mesh.setMatrixAt(mesh.count++, mx)
    }
    // a machine just placed comes down in real time, paused or not; its parts move on the game's clock
    const now = state.clock.elapsedTime,
      t0 = frame.t,
      dt = frame.dt
    for (const b of machines) {
      const spec = machineModel(b.type as BuildingId)
      const cx = b.x + b.w / 2,
        cz = b.y + b.h / 2
      const id = b.type + b.x + ',' + b.y
      if (!born.current.has(id)) born.current.set(id, first.current ? -9 : now)
      // the whole model turned the way the building faces
      _q.setFromEuler(_e.set(0, machineYaw(b.type, b.dir), 0))
      const base = _n.compose(_p.set(cx, 0, cz), _q, _s.set(1, 1, 1))
      const age = now - born.current.get(id)!
      if (age < DROP.fall + DROP.settle) {
        // down from the height it was held at, then a little squash as it lands
        const f = Math.min(1, age / DROP.fall),
          k = age > DROP.fall ? Math.sin((Math.PI * (age - DROP.fall)) / DROP.settle) : 0
        base.compose(_p.set(cx, DROP.lift * (1 - f * f), cz), _q, _s.set(1 + 0.05 * k, 1 - 0.1 * k, 1 + 0.05 * k))
      }
      put(spec.body, base)
      const busy = busyOf(b)
      for (let i = 0; i < spec.parts.length; i++) {
        const pt = spec.parts[i]!
        const t = t0 + (pt.phase ?? 0)
        const k = b.x + ',' + b.y + ':' + i
        let rx = 0,
          ry = 0,
          rz = 0,
          py = 0
        let a = spins.current.get(k) ?? 0
        switch (pt.motion) {
          case 'spinX':
            if (busy) a += dt * 4
            rx = a
            break
          case 'spinX-':
            if (busy) a -= dt * 6
            rx = a
            break
          case 'spinZ':
            if (busy) a += dt * 5
            rz = a
            break
          case 'spinZ-':
            if (busy) a -= dt * 3
            rz = a
            break
          case 'spinY':
            a += dt * (busy ? 2 : 0.3)
            ry = a
            break
          case 'snip':
          case 'snip-': {
            const open = busy ? 0.06 + Math.abs(Math.sin(t * 9)) * 0.32 : 0.16
            rz = pt.motion === 'snip' ? open : -open
            break
          }
          case 'swing':
            ry = busy ? Math.sin(t * 1.6) * 0.9 : 0.3
            break
          case 'bob':
            // a pitchfork in its rack, steam over a chimney: it hops while at work and sways a little
            py = busy ? Math.abs(Math.sin(t * 4)) * 0.06 : 0
            ry = Math.sin(t * 0.8) * 0.3
            break
        }
        spins.current.set(k, a)
        // where the part sits and how it leans at rest, then its own motion, then its size
        _m.compose(_p.set(...pt.at), _q.setFromEuler(_e.set(...(pt.tilt ?? [0, 0, 0]))), _s.set(1, 1, 1))
        _a.multiplyMatrices(_m, _b.compose(_p.set(0, py, 0), _q.setFromEuler(_e.set(rx, ry, rz)), _s.setScalar(pt.scale ?? 1)))
        put(pt.geo(), _a.premultiply(base))
      }
    }
    first.current = false
    for (const m of meshes.values()) m.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      {[...meshes.values()].map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </group>
  )
}

/** A splitter (square with three arrows) or a merger (round, arrows pointing in), sitting on the belt. */
function BeltPiece({ b }: { b: Building }) {
  const isSplit = b.type === 'splitter'
  const sides = isSplit ? [0, 1, 3] : [1, 2, 3]
  return (
    <group position={[b.x + 0.5, 0, b.y + 0.5]} rotation-y={yawOf(b.dir)}>
      <mesh position={[0, 0.13, 0]} geometry={isSplit ? GEO.rboxOf(0.5, 0.2, 0.5, 0.07) : GEO.cyl()} material={mat(LOOK.machine)} scale={isSplit ? 1 : [0.5, 0.2, 0.5]} castShadow />
      <mesh position={[0, 0.24, 0]} geometry={isSplit ? GEO.rboxOf(0.52, 0.04, 0.52, 0.02) : GEO.cyl()} material={mat(ROOF.splitter)} scale={isSplit ? 1 : [0.52, 0.04, 0.52]} />
      {sides.map((s) => {
        const a = (-s * Math.PI) / 2
        const out = isSplit
        return (
          <group key={s} rotation-y={a}>
            <mesh position={[0.33, 0.12, 0]} rotation-z={out ? -Math.PI / 2 : Math.PI / 2} geometry={GEO.cone()} material={mat(out ? LOOK.machineEdge : LOOK.accent)} scale={[0.14, 0.12, 0.14]} />
          </group>
        )
      })}
      {!isSplit && <mesh position={[0.31, 0.12, 0]} rotation-z={-Math.PI / 2} geometry={GEO.cone()} material={mat(LOOK.machineEdge)} scale={[0.14, 0.12, 0.14]} />}
      {/* a splitter's rules: the colour of the sheep each side takes, or a red bar on a closed side */}
      {isSplit &&
        (['f', 'r', 'l'] as const).map((k, i) => {
          const rule = b.rules![k]
          if (rule === 'any') return null
          const a = (-[0, 1, 3][i]! * Math.PI) / 2
          return (
            <group key={k} rotation-y={a}>
              {rule === 'off' ? (
                <mesh position={[0.46, 0.14, 0]} geometry={GEO.rbox()} material={mat(LOOK.bad)} scale={[0.07, 0.07, 0.34]} />
              ) : (
                <mesh position={[0.46, 0.2, 0]} geometry={GEO.ball()} material={mat(RULE_COLOR[rule])} scale={0.17} />
              )}
            </group>
          )
        })}
    </group>
  )
}
