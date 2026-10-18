import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Mesh, type Group } from 'three'
import { GRID, MARKET, type ItemId } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { get, outCells } from '@/game/grid'
import { bayX, openAsks } from '@/game/systems/village'
import { Field, GameState, isOn, key, res, type AskT, type World } from '@/game/world'
import { useT } from '@/i18n'
import { CLIENT_NAMES, ITEM_NAMES } from '@/i18n/content'
import { Icon } from '@/ui/Icon'
import { vmat } from './kit'
import { Batch, useInstanced } from './instancing'
import { BRIDGE, STALL, bridgeBody, bridgeY, good, intakeBody, marketBody } from './models'
import { useView, views } from './pick'
import { frame } from './frame'

/**
 * The market (GDD 7; the author, 18.10.2026: «пусть рынок будет как основная точка куда игрок приносит товар»): the
 * row beside the road is a wooden chute along the whole island; where a line comes down into it a little bridge
 * carries its goods over the road into a long market of stalls on the island's near edge, and they land on its
 * counters for a while; the trucks park in front of it at their bays (Road.tsx). A sign over each bay says whose it
 * is and what they want.
 */

/** Goods handed to the market, riding their column's bridge (filled by FxView from the `deliver` effects). */
export const deliveries: { x: number; good: ItemId; t: number }[] = []

/** Seconds a good takes over the bridge; how many fly at once; seconds a good stays on a counter; goods on one stall's counters. */
const FLY = { time: 0.9, max: 48, shelf: 25, perStall: 6 } as const
/** The stalls' middle row, past the road. */
const STALL_Z = MARKET.row + 4

/** The columns a line comes down into the market's row from: those get a bridge. */
function bridgeColumns(w: World): number[] {
  const out: number[] = []
  const right = res(w, Field).right
  for (let x = 0; x < right; x++) {
    const b = get(w, x, MARKET.row - 1)
    if (b && b.type !== 'dock' && outCells(b).some((c) => c.x === x && c.y === MARKET.row)) out.push(x)
  }
  return out
}

export function Market() {
  const { world } = useGame()
  const root = useRef<Group>(null)
  useView(views.buildings, key(0, MARKET.row), root)
  const intakes = useInstanced(intakeBody(), vmat(), GRID.cols, 'market_intakes', 'receive')
  const bridges = useInstanced(bridgeBody(), vmat(), GRID.cols, 'market_bridges')
  const stalls = useInstanced(marketBody(), vmat(), Math.ceil(GRID.cols / STALL.w), 'market_stalls')
  const b = useMemo(() => ({ intakes: new Batch(intakes), bridges: new Batch(bridges), stalls: new Batch(stalls) }), [intakes, bridges, stalls])
  // goods in the air and on the counters: a pool of plain meshes, given the good's shape as they show it
  const fly = useMemo(() => Array.from({ length: FLY.max }, () => new Mesh(good('wool'), vmat())), [])
  const shelfMeshes = useMemo(() => Array.from({ length: Math.ceil(GRID.cols / STALL.w) * FLY.perStall }, () => new Mesh(good('wool'), vmat())), [])
  const shelves = useRef(new Map<number, { good: ItemId; left: number }[]>())
  const sig = useRef('')
  useFrame(() => {
    const f = res(world, Field),
      gs = res(world, GameState)
    // the chute, the bridges and the stalls: built again when the island grows or a line comes or goes
    const s = f.right + ':' + gs.plantVersion
    if (s !== sig.current) {
      sig.current = s
      for (const q of Object.values(b)) q.begin()
      for (let x = 0; x < f.right; x++) b.intakes.put(x + 0.5, 0, MARKET.row + 0.5)
      for (const x of bridgeColumns(world)) b.bridges.put(x + 0.5, 0, MARKET.row + 0.5)
      for (let x = 0; x + STALL.w <= f.right; x += STALL.w) b.stalls.put(x + STALL.w / 2, 0, STALL_Z)
      for (const q of Object.values(b)) q.end()
    }
    // goods over the bridges: up the arch, over the road, down onto a counter
    while (deliveries.length > fly.length) deliveries.shift()
    const dt = frame.dt
    for (let i = deliveries.length - 1; i >= 0; i--) {
      const d = deliveries[i]!
      d.t += dt / FLY.time
      if (d.t < 1) continue
      deliveries.splice(i, 1)
      const stall = Math.min(Math.floor(d.x / STALL.w), Math.floor(f.right / STALL.w) - 1)
      const list = shelves.current.get(stall) ?? []
      list.push({ good: d.good, left: FLY.shelf })
      if (list.length > FLY.perStall) list.shift()
      shelves.current.set(stall, list)
    }
    fly.forEach((m, i) => {
      const d = deliveries[i]
      m.visible = !!d
      if (!d) return
      m.geometry = good(d.good)
      m.position.set(d.x + 0.5, bridgeY(d.t) + 0.07, MARKET.row + 0.5 + d.t * BRIDGE.len)
    })
    // the counters: what came in lately, a few goods each, gone after a while
    let n = 0
    for (const [stall, list] of shelves.current) {
      for (let j = list.length - 1; j >= 0; j--) if ((list[j]!.left -= dt) <= 0) list.splice(j, 1)
      list.forEach((q, j) => {
        const m = shelfMeshes[n++]
        if (!m) return
        m.visible = true
        m.geometry = good(q.good)
        m.position.set(stall * STALL.w + 0.35 + j * 0.62, STALL.counterY, STALL_Z + STALL.counterZ)
      })
    }
    for (; n < shelfMeshes.length; n++) shelfMeshes[n]!.visible = false
  })
  return (
    <group>
      <group ref={root}>
        {Object.values(b).map((q) => (
          <primitive key={q.mesh.name} object={q.mesh} />
        ))}
      </group>
      {fly.map((m, i) => (
        <primitive key={'fly' + i} object={m} />
      ))}
      {shelfMeshes.map((m, i) => (
        <primitive key={'shelf' + i} object={m} />
      ))}
      {isOn(world, 'tags') && <BaySigns />}
    </group>
  )
}

/** Over each bay with an ask open: whose it is and the good it wants, as the docks' signposts said before. */
function BaySigns() {
  const { world } = useGame()
  const { t } = useT()
  const [asks, setAsks] = useState<AskT[]>([])
  const sig = useRef('')
  useFrame(() => {
    const open = openAsks(world)
    const s = open.map((a) => a.id).join(',')
    if (s === sig.current) return
    sig.current = s
    setAsks(open)
  })
  return (
    <>
      {asks.map((a) => (
        <Html key={a.id} position={[bayX(a.client), 1.95, MARKET.row + 3.15]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <span className="tag tag--dock tag--on">
            <Icon kind={a.kind} size={16} />
            {t(CLIENT_NAMES[a.client])} · {t(ITEM_NAMES[a.kind])}
          </span>
        </Html>
      ))}
    </>
  )
}
