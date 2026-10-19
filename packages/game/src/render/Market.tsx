import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Mesh, type Group } from 'three'
import { GRID, MARKET, ROAD, type ItemId } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { openAsks, stallX } from '@/game/systems/village'
import { Field, GameState, isOn, key, res, stockOf, type AskT } from '@/game/world'
import { useT } from '@/i18n'
import { CLIENT_NAMES, ITEM_NAMES } from '@/i18n/content'
import { Icon } from '@/ui/Icon'
import { vmat } from './kit'
import { Batch, useInstanced } from './instancing'
import { STALL, buyBody, good, intakeBody, stallBody } from './models'
import { useView, views } from './pick'
import { frame } from './frame'

/**
 * The market (GDD 7; the author, 18.10.2026: «поменяй местами дорогу с лавками … 4 разных»): the row beside the field
 * is a wooden chute along the whole island; past it stand four stalls, each its own, and the trading post at the west
 * end; the road runs past them along the island's edge (Road.tsx). A good handed to the row slides along the chute to a
 * stall and hops onto its counter: into the truck parked there if it wants it, else it waits on the counter — it is in
 * the stock — until a truck comes for it. A sign over each stall with an ask says whose it is and what they want.
 */

/** A good on its way: along the chute from column x to a stall and onto its counter, then into the truck there or onto the counter to wait. */
interface Flight {
  good: ItemId
  stall: number
  truck: boolean
  x: number
  /** Seconds into the leg. */
  t: number
  leg: 'slide' | 'hop' | 'load'
  /** The stall and counter slot it leaves for the truck from (for `load`; -1 when it only passes over the counter). */
  from: number
  slot: number
}
/** Goods handed to the market, and goods taken from the stock into a truck (filled by FxView from the `deliver` and `load` effects). */
export const flights: Flight[] = []

/**
 * Cells a second along the chute; seconds of a hop onto a counter, of one into a truck and more for each cell between
 * the counter and the truck; how many at once; goods waiting on one counter.
 */
const FLY = { slide: 9, hop: 0.35, load: 0.3, loadPerCell: 0.04, max: 64, perStall: 8 } as const
/** Where the chute and the stalls' counters are along z, and the truck boxes parked in front of them. */
const CHUTE_Z = MARKET.row + 0.5,
  STALL_Z = MARKET.row + 1 + MARKET.rows / 2,
  COUNTER_Z = STALL_Z + STALL.counterZ,
  BOX = { x: -0.14, y: 0.42, z: ROAD.laneA }

/** A counter's slots (x along the stall, y up, z), front row then back row; the last one is where goods for a truck pass over. */
function slotAt(stall: number, j: number): [number, number, number] {
  if (j < 0) return [stallX(stall), STALL.counterY, COUNTER_Z]
  const front = j < FLY.perStall / 2
  return [stallX(stall) - 1.05 + (j % (FLY.perStall / 2)) * 0.7, STALL.counterY, COUNTER_Z + (front ? 0.1 : -0.1)]
}
/** A point on an arc from a to b, `h` higher in the middle. */
function arc(a: readonly number[], b: readonly number[], t: number, h: number, out: Mesh) {
  out.position.set(a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t + h * Math.sin(Math.PI * t), a[2]! + (b[2]! - a[2]!) * t)
}

/**
 * A flight starting from a 'deliver' or 'load' effect. A load takes a waiting good of its kind off the counter nearest
 * to the truck that has one, and it flies from there; with none waiting it comes up over the truck's own counter.
 */
export function startFlight(e: { kind: 'deliver'; x: number; good: ItemId; stall: number; truck: boolean } | { kind: 'load'; stall: number; good: ItemId }) {
  if (e.kind === 'deliver') flights.push({ good: e.good, stall: e.stall, truck: e.truck, x: e.x, t: 0, leg: 'slide', from: e.stall, slot: -1 })
  else {
    const near = MARKET.stalls.map((_, i) => i).sort((a, b) => Math.abs(a - e.stall) - Math.abs(b - e.stall))
    let from = e.stall,
      slot = -1
    for (const i of near) {
      const list = waiting.get(i) ?? []
      const j = list.indexOf(e.good)
      if (j < 0) continue
      list[j] = null
      from = i
      slot = j
      break
    }
    flights.push({ good: e.good, stall: e.stall, truck: true, x: 0, t: 0, leg: 'load', from, slot })
  }
  while (flights.length > FLY.max) flights.shift()
}
/** How long a load flies: further from another stall's counter. */
const loadTime = (q: Flight) => FLY.load + FLY.loadPerCell * Math.abs(stallX(q.from) - stallX(q.stall))
/** The goods waiting on each stall's counter, by slot (null for an empty one). */
const waiting = new Map<number, (ItemId | null)[]>()

export function Market() {
  const { world } = useGame()
  const row = useRef<Group>(null)
  useView(views.buildings, key(0, MARKET.row), row)
  const intakes = useInstanced(intakeBody(), vmat(), GRID.cols, 'market_intakes', 'receive')
  const chute = useMemo(() => new Batch(intakes), [intakes])
  // goods in the air and on the counters: a pool of plain meshes, given the good's shape as they show it
  const fly = useMemo(() => Array.from({ length: FLY.max }, () => new Mesh(good('wool'), vmat())), [])
  const shelf = useMemo(() => Array.from({ length: MARKET.stalls.length * FLY.perStall }, () => new Mesh(good('wool'), vmat())), [])
  const [trade, setTrade] = useState(false)
  const sig = useRef(-1)
  // a new world starts with nothing on its way and nothing waiting
  useEffect(() => {
    flights.length = 0
    waiting.clear()
  }, [world])
  useFrame(() => {
    const f = res(world, Field),
      gs = res(world, GameState)
    if (gs.trade !== trade) setTrade(gs.trade)
    // the chute: built again when the island grows
    if (f.right !== sig.current) {
      sig.current = f.right
      chute.begin()
      for (let x = 0; x < f.right; x++) chute.put(x + 0.5, 0, CHUTE_Z)
      chute.end()
    }
    const dt = frame.dt
    const counter = (stall: number) => {
      const list = waiting.get(stall) ?? Array.from({ length: FLY.perStall }, () => null)
      waiting.set(stall, list)
      return list
    }
    const land = (q: Flight) => {
      const list = counter(q.stall)
      let j = q.slot >= 0 && !list[q.slot] ? q.slot : list.indexOf(null)
      // a full counter: the oldest goes (it is in the stock all the same)
      if (j < 0) {
        list.shift()
        list.push(null)
        j = list.length - 1
      }
      list[j] = q.good
    }
    for (let i = flights.length - 1; i >= 0; i--) {
      const q = flights[i]!
      q.t += dt
      if (q.leg === 'slide' && q.t >= Math.max(0.12, Math.abs(stallX(q.stall) - q.x - 0.5) / FLY.slide)) {
        // onto the counter: over it for a truck, else to the free slot it will wait in
        q.leg = 'hop'
        q.t = 0
        q.slot = q.truck ? -1 : counter(q.stall).indexOf(null)
      } else if (q.leg === 'hop' && q.t >= FLY.hop) {
        if (q.truck) {
          q.leg = 'load'
          q.t = 0
          q.from = q.stall
          q.slot = -1
        } else {
          land(q)
          flights.splice(i, 1)
        }
      } else if (q.leg === 'load' && q.t >= loadTime(q)) flights.splice(i, 1)
    }
    // the counters hold what the stock holds: what was sold or used by hand leaves them, oldest first
    if (isOn(world, 'village')) {
      const seen = new Map<ItemId, number>()
      for (const list of waiting.values())
        for (let j = 0; j < list.length; j++) {
          const k = list[j]
          if (!k) continue
          const n = (seen.get(k) ?? 0) + 1
          seen.set(k, n)
          if (n > stockOf(world, k)) list[j] = null
        }
    }
    fly.forEach((m, i) => {
      const q = flights[i]
      m.visible = !!q
      if (!q) return
      m.geometry = good(q.good)
      const sx = stallX(q.stall)
      if (q.leg === 'slide') {
        const d = sx - q.x - 0.5,
          dur = Math.max(0.12, Math.abs(d) / FLY.slide)
        m.position.set(q.x + 0.5 + d * Math.min(1, q.t / dur), STALL.chuteY, CHUTE_Z)
      } else if (q.leg === 'hop') arc([sx, STALL.chuteY, CHUTE_Z], slotAt(q.stall, q.slot), Math.min(1, q.t / FLY.hop), 0.55, m)
      else arc(slotAt(q.from, q.slot), [sx + BOX.x, BOX.y, BOX.z], Math.min(1, q.t / loadTime(q)), 0.45 + 0.08 * Math.abs(stallX(q.from) - sx), m)
    })
    let n = 0
    for (const [stall, list] of waiting)
      list.forEach((k, j) => {
        if (!k) return
        const m = shelf[n++]
        if (!m) return
        m.visible = true
        m.geometry = good(k)
        m.position.set(...slotAt(stall, j))
      })
    for (; n < shelf.length; n++) shelf[n]!.visible = false
  })
  return (
    <group>
      <group ref={row}>
        <primitive object={chute.mesh} />
      </group>
      {MARKET.stalls.map((x, i) => (
        <Stall key={x} i={i} x={x} />
      ))}
      {trade && <TradingPost />}
      {fly.map((m, i) => (
        <primitive key={'fly' + i} object={m} />
      ))}
      {shelf.map((m, i) => (
        <primitive key={'shelf' + i} object={m} />
      ))}
      {isOn(world, 'tags') && <StallSigns />}
    </group>
  )
}

/** One stall, its own model; the pointer finds it by its cell. */
function Stall({ i, x }: { i: number; x: number }) {
  const g = useRef<Group>(null)
  useView(views.buildings, key(x, MARKET.row + 1), g)
  return (
    <group ref={g} position={[x + MARKET.stallW / 2, 0, STALL_Z]}>
      <mesh geometry={stallBody(i)} material={vmat()} castShadow receiveShadow />
    </group>
  )
}

function TradingPost() {
  const g = useRef<Group>(null)
  useView(views.buildings, key(MARKET.buyX, MARKET.row + 1), g)
  return (
    <group ref={g} position={[MARKET.buyX + MARKET.buyW / 2, 0, STALL_Z]}>
      <mesh geometry={buyBody()} material={vmat()} castShadow receiveShadow />
    </group>
  )
}

/** Over each stall with an ask open: whose it is and the good it wants. */
function StallSigns() {
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
        <Html key={a.id} position={[stallX(a.stall), 1.75, STALL_Z]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <span className="tag tag--dock tag--on">
            <Icon kind={a.kind} size={16} />
            {t(CLIENT_NAMES[a.client])} · {t(ITEM_NAMES[a.kind])}
          </span>
        </Html>
      ))}
    </>
  )
}
