import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Euler, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three'
import { BUILDINGS, LOOK, PRODUCERS, RECIPES, ROOF, UPGRADE, type BuildingId, type ItemId, DIRS } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { inCell, jobOf, outCells } from '@/game/grid'
import { machineState } from '@/game/systems/machines'
import { Plant, res, type Building } from '@/game/world'
import { Icon } from '@/ui/Icon'
import { GEO, flat, mat, vmat, yawOf } from './kit'
import { chute, machineModel, type PartSpec } from './machineModels'
import { cached, product } from './models'
import { Batch, useInstanced } from './instancing'
import { frame } from './frame'

/** The icon a producer shows when nothing is left in its reach. */
const NEAR_ICON: Readonly<Record<string, string>> = { meadow: 'meadow', water: 'pond', bush: 'bush' }

/** A building's own colour: its accents in the field, its stripe on the build tile. */
export const MACHINE_COLOR = ROOF

/** The colour a splitter shows for a rule: the good's own colour. */
const RULE_COLOR: Readonly<Record<string, string>> = { wool: LOOK.wool, roving: LOOK.roving, yarn: LOOK.yarn, felt: LOOK.felt, dye: LOOK.dye, cyarn: LOOK.cyarn, sweater: LOOK.sweater, valenki: LOOK.valenki, hay: LOOK.hay, water: LOOK.waterItem, sheep: LOOK.skin }

/** Re-renders the list only when buildings are added, removed, turned, re-ruled or given a new recipe. */
function useBuildings() {
  const { world } = useGame()
  const [list, setList] = useState<Building[]>([])
  const sig = useRef('')
  useFrame(() => {
    const b = res(world, Plant).b
    let s = ''
    for (const q of b.values()) if (q.type !== 'belt' && q.type !== 'dock') s += q.type + q.x + ',' + q.y + q.dir + q.lvl + (q.rules ? q.rules.l + q.rules.f + q.rules.r : '') + (q.recipe ?? '') + ';'
    if (s === sig.current) return
    sig.current = s
    setList([...b.values()].filter((q) => q.type !== 'belt' && q.type !== 'dock'))
  })
  return list
}

export function Machines() {
  const list = useBuildings()
  return (
    <group>
      <MachineMeshes list={list} />
      <Stubs list={list} />
      {list.map((b) => (
        <MachineView key={b.type + b.x + ',' + b.y + ':' + b.dir + (b.rules ? b.rules.l + b.rules.f + b.rules.r : '') + (b.recipe ?? '')} b={b} />
      ))}
    </group>
  )
}

/**
 * The stubs of belt on every machine: one per output, on the edge of the cell it leaves from, its arrow pointing out;
 * one at the way in, on the back edge, its arrow (a light one) pointing in (the author: «у зданий должен быть
 * конкретный выход и вход»). Three instanced meshes for all machines, laid again only when the machines change.
 */
function Stubs({ list }: { list: Building[] }) {
  const stubs = useInstanced(chute(), vmat(), 512, 'machine_stubs')
  const outs = useInstanced(GEO.chevron(), mat(LOOK.chevron), 512, 'machine_out_arrows', false)
  const ins = useInstanced(GEO.chevron(), mat(LOOK.inlet), 256, 'machine_in_arrows', false)
  const b = useMemo(() => ({ stubs: new Batch(stubs), outs: new Batch(outs), ins: new Batch(ins) }), [stubs, outs, ins])
  useEffect(() => {
    for (const q of Object.values(b)) q.begin()
    const stub = (x: number, z: number, d: number, arrows: Batch) => {
      const yaw = yawOf(d)
      b.stubs.put(x, 0.13, z, yaw)
      // the arrow rides on the stub, a little towards its outer end
      arrows.put(x + Math.cos(yaw) * 0.02, 0.28, z - Math.sin(yaw) * 0.02, yaw)
    }
    for (const m of list) {
      if (m.type === 'splitter' || m.type === 'merger') continue
      for (const c of outCells(m)) stub(c.sx + 0.5 + DIRS[c.d]![0] * 0.3, c.sy + 0.5 + DIRS[c.d]![1] * 0.3, c.d, b.outs)
      const i = inCell(m)
      if (i) stub(i.sx + 0.5 - DIRS[i.d]![0] * 0.3, i.sy + 0.5 - DIRS[i.d]![1] * 0.3, i.d, b.ins)
    }
    for (const q of Object.values(b)) q.end()
  }, [list, b])
  return (
    <group>
      {Object.values(b).map((q) => (
        <primitive key={q.mesh.name} object={q.mesh} />
      ))}
    </group>
  )
}

/** A product on a workshop's stand, leaning back to face the camera. */
const onShow = (kind: ItemId) => cached('show' + kind, () => product(kind).clone().rotateX(-0.6))

/**
 * One machine's bubble when it stands still (its moving part shows that it works): what it waits for, or a red «!»
 * when its output is blocked. Its body and parts are drawn with every other machine's (MachineMeshes).
 */
function MachineView({ b }: { b: Building }) {
  const { world } = useGame()
  const [mood, setMood] = useState('')
  const type = b.type as BuildingId
  const def = BUILDINGS[type]
  const job = jobOf(b)
  useFrame(() => {
    const st = machineState(world, b)
    const m = st.tone === 'ok' || (def.time === undefined && !job) ? '' : st.tone + ':' + (st.text === 'waitsFor' ? st.item : st.text === 'emptyAround' ? NEAR_ICON[def.near!] : st.text === 'waitsSheep' || st.text === 'sheepWaits' ? 'sheep' : '!')
    if (m !== mood) setMood(m)
  })
  if (type === 'splitter' || type === 'merger') return <BeltPiece b={b} />
  if (!mood) return null
  const signY = machineModel(type, b.w >= b.h).top + 0.3
  return (
    <Html position={[b.x + b.w / 2, signY + 0.25, b.y + b.h / 2]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div className={'bubble bubble--' + mood.split(':')[0]}>{mood.split(':')[1] === '!' ? '!' : <Icon kind={mood.split(':')[1]!} size={16} />}</div>
    </Html>
  )
}

/** A machine just placed: it falls from the height it was held at (Ghost.tsx) for `fall` s, then settles for `settle` s. */
const DROP = { lift: 0.24, fall: 0.16, settle: 0.24 } as const

/** Is this machine at work: a job in hand, or a producer gathering? Its parts move only then. */
const busyOf = (b: Building) => !!b.slot || (PRODUCERS.includes(b.type as BuildingId) && b.status === '' && b.prog > 0)

/** What a workshop shows on its stand: the product of its recipe. */
const showOf = (b: Building) => onShow(b.recipe ? RECIPES[b.recipe].out : 'cyarn')
const SHOW: PartSpec = { geo: () => onShow('cyarn'), at: [0, 0.62, 0.42], motion: 'bob', scale: 1.9 }

const _m = new Matrix4(),
  _n = new Matrix4(),
  _a = new Matrix4(),
  _b = new Matrix4(),
  _p = new Vector3(),
  _q = new Quaternion(),
  _s = new Vector3(),
  _e = new Euler()

/**
 * Every machine's body, moving parts, product on show and level beads: one instanced mesh per model (the body of a
 * kind, each of its parts), posed in one pass each frame — 30 machines of five meshes each cost 300 draw calls with
 * their shadows, this costs about 40. A part moves while its machine works: spins keep their angle per machine.
 */
function MachineMeshes({ list }: { list: Building[] }) {
  const machines = useMemo(() => list.filter((b) => b.type !== 'splitter' && b.type !== 'merger'), [list])
  // one instanced mesh per geometry in use, sized for how many machines use it
  const meshes = useMemo(() => {
    const need = new Map<BufferGeometry, number>()
    const want = (g: BufferGeometry) => need.set(g, (need.get(g) ?? 0) + 1)
    for (const b of machines) {
      const spec = machineModel(b.type as BuildingId, b.w >= b.h)
      want(spec.body)
      for (const pt of spec.parts) want(pt.geo())
      if (b.type === 'workshop') want(showOf(b))
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
  const beads = useMemo(() => {
    const m = new InstancedMesh(GEO.ball(), mat('#f2c14e'), 256)
    m.castShadow = true
    m.frustumCulled = false
    m.count = 0
    const top = new InstancedMesh(GEO.ball(), flat(LOOK.warn), 128)
    top.frustumCulled = false
    top.count = 0
    return { m, top }
  }, [])
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes])
  // the angle each spinning part has turned to, per machine and part
  const spins = useRef(new Map<string, number>())
  // when each machine was first drawn: one placed now comes down from where it was held and settles (the ones there
  // from the start just stand)
  const born = useRef(new Map<string, number>())
  const first = useRef(true)
  useFrame((state) => {
    for (const m of meshes.values()) m.count = 0
    beads.m.count = 0
    beads.top.count = 0
    const put = (g: BufferGeometry, mx: Matrix4) => {
      const mesh = meshes.get(g)
      if (mesh) mesh.setMatrixAt(mesh.count++, mx)
    }
    // a machine just placed comes down in real time, paused or not; its parts move on the game's clock
    const now = state.clock.elapsedTime,
      t0 = frame.t,
      dt = frame.dt
    for (const b of machines) {
      const spec = machineModel(b.type as BuildingId, b.w >= b.h)
      const cx = b.x + b.w / 2,
        cz = b.y + b.h / 2
      const id = b.type + b.x + ',' + b.y
      if (!born.current.has(id)) born.current.set(id, first.current ? -9 : now)
      const base = _n.compose(_p.set(cx, 0, cz), _q.identity(), _s.set(1, 1, 1))
      const age = now - born.current.get(id)!
      if (age < DROP.fall + DROP.settle) {
        // down from the height it was held at, then a little squash as it lands
        const f = Math.min(1, age / DROP.fall),
          k = age > DROP.fall ? Math.sin((Math.PI * (age - DROP.fall)) / DROP.settle) : 0
        base.compose(_p.set(cx, DROP.lift * (1 - f * f), cz), _q.identity(), _s.set(1 + 0.05 * k, 1 - 0.1 * k, 1 + 0.05 * k))
      }
      put(spec.body, base)
      const busy = busyOf(b)
      const n = spec.parts.length + (b.type === 'workshop' ? 1 : 0)
      for (let i = 0; i < n; i++) {
        const pt = spec.parts[i] ?? SHOW
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
          case 'stamp':
            // lifted by the cam, then dropped onto the felt; at rest it hangs half way up
            py = busy ? Math.max(0, Math.sin(t * 6)) * 0.3 : 0.16
            break
          case 'swing':
            ry = busy ? Math.sin(t * 1.6) * 0.9 : 0.3
            break
          case 'bob':
            // a product on show: it hops while being made and sways a little
            py = busy ? Math.abs(Math.sin(t * 4)) * 0.06 : 0
            ry = Math.sin(t * 0.8) * 0.3
            break
        }
        spins.current.set(k, a)
        // where the part sits and how it leans at rest, then its own motion, then its size
        _m.compose(_p.set(...pt.at), _q.setFromEuler(_e.set(...(pt.tilt ?? [0, 0, 0]))), _s.set(1, 1, 1))
        _a.multiplyMatrices(_m, _b.compose(_p.set(0, py, 0), _q.setFromEuler(_e.set(rx, ry, rz)), _s.setScalar(pt.scale ?? 1)))
        put(pt === SHOW ? showOf(b) : pt.geo(), _a.premultiply(base))
      }
      for (let i = 0; i < b.lvl - 1; i++) beads.m.setMatrixAt(beads.m.count++, _m.compose(_p.set(b.x + 0.2 + i * 0.14, 0.18, b.y + b.h - 0.12), _q.identity(), _s.setScalar(0.11)))
      if (b.lvl >= UPGRADE.maxLevel) beads.top.setMatrixAt(beads.top.count++, _m.compose(_p.set(cx, spec.top + 0.42, cz), _q.identity(), _s.setScalar(0.07)))
    }
    first.current = false
    for (const m of meshes.values()) m.instanceMatrix.needsUpdate = true
    beads.m.instanceMatrix.needsUpdate = true
    beads.top.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      {[...meshes.values()].map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
      <primitive object={beads.m} />
      <primitive object={beads.top} />
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
      {/* a splitter's rules: the item each side takes, or a red bar on a closed side */}
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
                <mesh position={[0.46, 0.2, 0]} geometry={GEO.ball()} material={mat(RULE_COLOR[rule] ?? '#ffffff')} scale={0.17} />
              )}
            </group>
          )
        })}
    </group>
  )
}
