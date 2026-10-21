import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderGeometry, Mesh, type Group } from 'three'
import { LOOK, MARKET, type ClientId, type ItemId } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { contentBar } from '@/game/systems/village'
import { Market as Clients, key, res } from '@/game/world'
import { flat, mat, vmat } from './kit'
import { MARKET_HALL, SIGN, good, marketHall, signBoard } from './models'
import { useView, views } from './pick'
import { frame } from './frame'

/**
 * The market (GDD 2, 7): one big hall in the middle of the land the game starts on (models.ts `marketHall`). Each
 * client's sign hangs on its walls, in the order the clients came: its good on a shelf, and under it the bar of how
 * content the client is. A good handed in hops from where it came onto the sign of the client that takes it (into the
 * hall when none does); a good a client takes pops up off its sign as a coin.
 */

/** The hall's middle, on the field. */
const MID = { x: MARKET.x + MARKET.size / 2, z: MARKET.y + MARKET.size / 2 }
/**
 * Where the signs hang on the upper storey's walls, in the order the clients come: three on the front wall (south,
 * towards the camera), then two on the east wall (the market stands left of the start's middle, so the camera sees
 * that side), the west wall, the back wall. Each faces out (yaw).
 */
const W2 = MARKET_HALL.upper / 2 + 0.04,
  A = 0.92,
  F = 1.22
const SLOTS: readonly { x: number; z: number; yaw: number }[] = [
  { x: -F, z: W2, yaw: 0 },
  { x: 0, z: W2, yaw: 0 },
  { x: F, z: W2, yaw: 0 },
  { x: W2, z: A, yaw: Math.PI / 2 },
  { x: W2, z: -A, yaw: Math.PI / 2 },
  { x: -W2, z: A, yaw: -Math.PI / 2 },
  { x: -W2, z: -A, yaw: -Math.PI / 2 },
  { x: A, z: -W2, yaw: Math.PI },
]
/** A point `out` in front of a sign of slot i, `up` above its middle, on the field. */
function onSign(i: number, up: number, out: number): [number, number, number] {
  const s = SLOTS[i]!
  return [MID.x + s.x + Math.sin(s.yaw) * out, MARKET_HALL.signY + up, MID.z + s.z + Math.cos(s.yaw) * out]
}

/** A good on its way into the market, and a coin off a sign. */
interface Flight {
  good: ItemId
  from: [number, number, number]
  to: [number, number, number]
  t: number
  dur: number
}
interface Coin {
  at: [number, number, number]
  t: number
}
/** Seconds of a good's hop, and more for each cell it flies; how high it arcs; a coin's rise; how many at once. */
const FLY = { hop: 0.4, perCell: 0.05, arc: 0.8, coin: 0.7, max: 48, coins: 24 } as const
const flights: Flight[] = [],
  coins: Coin[] = []
/** The slot of each client's need on the hall, by client and good, as last drawn. */
const slotOf = new Map<string, number>()
const needKey = (client: ClientId, good: ItemId) => client + ':' + good

/** A good handed to the market at cell (x, y) from (fx, fy): it hops onto the sign of the client that takes it, or into the hall. */
export function startFlight(e: { x: number; y: number; fx: number; fy: number; good: ItemId }) {
  let to: [number, number, number] = [MID.x, MARKET_HALL.signY, MID.z]
  for (const [k, i] of slotOf) if (k.endsWith(':' + e.good)) to = onSign(i, SIGN.good.y + 0.15, 0.2)
  const from: [number, number, number] = [(e.x + e.fx) / 2 + 0.5, 0.3, (e.y + e.fy) / 2 + 0.5]
  flights.push({ good: e.good, from, to, t: 0, dur: FLY.hop + FLY.perCell * Math.hypot(to[0] - from[0], to[2] - from[2]) })
  while (flights.length > FLY.max) flights.shift()
}
/** A good a client took: a coin pops up off its sign. */
export function startCoin(e: { client: ClientId; good: ItemId }) {
  const i = slotOf.get(needKey(e.client, e.good))
  if (i === undefined) return
  coins.push({ at: onSign(i, SIGN.h / 2, 0.2), t: 0 })
  while (coins.length > FLY.coins) coins.shift()
}

export function Market() {
  const { world } = useGame()
  const hall = useRef<Group>(null)
  useView(views.buildings, key(MARKET.x, MARKET.y), hall)
  const fly = useMemo(() => Array.from({ length: FLY.max }, () => new Mesh(good('wool'), vmat())), [])
  const coin = useMemo(() => {
    const g = new CylinderGeometry(0.14, 0.14, 0.04, 18).rotateX(Math.PI / 2)
    return Array.from({ length: FLY.coins }, () => new Mesh(g, mat(LOOK.coin)))
  }, [])
  // what hangs where: each need's client and good, by slot
  const [signs, setSigns] = useState<{ client: ClientId; good: ItemId }[]>([])
  const sig = useRef('')
  const bars = useRef<(Mesh | null)[]>([])
  const goods = useRef<(Mesh | null)[]>([])
  // a new world starts with nothing on its way
  useEffect(() => {
    flights.length = 0
    coins.length = 0
    slotOf.clear()
  }, [world])
  useFrame(() => {
    const needs = res(world, Clients).needs.slice(0, SLOTS.length)
    const s = needs.map((n) => needKey(n.client, n.kind)).join(',')
    if (s !== sig.current) {
      sig.current = s
      slotOf.clear()
      needs.forEach((n, i) => slotOf.set(needKey(n.client, n.kind), i))
      setSigns(needs.map((n) => ({ client: n.client, good: n.kind })))
    }
    const t = frame.t,
      dt = frame.dt
    needs.forEach((n, i) => {
      const bar = bars.current[i]
      if (bar) {
        // the bar fills from its left end
        const w = Math.max(0.001, contentBar(n))
        bar.scale.x = w
        bar.position.x = (-SIGN.bar.w / 2) * (1 - w)
        bar.material = flat(w >= 1 ? LOOK.barFull : LOOK.barFill)
      }
      const g = goods.current[i]
      // the good on its shelf hops a little and turns
      if (g) {
        g.position.y = SIGN.good.y + 0.02 + Math.sin(t * 2 + i) * 0.02
        g.rotation.y = Math.sin(t * 0.8 + i) * 0.5
      }
    })
    for (let i = flights.length - 1; i >= 0; i--) {
      flights[i]!.t += dt
      if (flights[i]!.t >= flights[i]!.dur) flights.splice(i, 1)
    }
    for (let i = coins.length - 1; i >= 0; i--) {
      coins[i]!.t += dt
      if (coins[i]!.t >= FLY.coin) coins.splice(i, 1)
    }
    fly.forEach((m, i) => {
      const q = flights[i]
      m.visible = !!q
      if (!q) return
      m.geometry = good(q.good)
      const k = q.t / q.dur
      m.position.set(q.from[0] + (q.to[0] - q.from[0]) * k, q.from[1] + (q.to[1] - q.from[1]) * k + FLY.arc * Math.sin(Math.PI * k), q.from[2] + (q.to[2] - q.from[2]) * k)
      // it shrinks into the sign at the end
      m.scale.setScalar(k < 0.8 ? 1 : 1 - (k - 0.8) * 3.5)
    })
    coin.forEach((m, i) => {
      const q = coins[i]
      m.visible = !!q
      if (!q) return
      const k = q.t / FLY.coin
      m.position.set(q.at[0], q.at[1] + 0.5 * Math.sin((k * Math.PI) / 2), q.at[2])
      m.rotation.y = k * 9
      m.scale.setScalar(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3)
    })
  })
  return (
    <group>
      <group ref={hall} position={[MID.x, 0, MID.z]}>
        <mesh geometry={marketHall()} material={vmat()} castShadow receiveShadow />
      </group>
      {signs.map((n, i) => {
        const s = SLOTS[i]!
        return (
          <group key={n.client + n.good} position={[MID.x + s.x, MARKET_HALL.signY, MID.z + s.z]} rotation={[0, s.yaw, 0]}>
            <mesh geometry={signBoard(LOOK.client[n.client])} material={vmat()} castShadow />
            <mesh
              ref={(m) => {
                goods.current[i] = m
              }}
              geometry={good(n.good)}
              material={vmat()}
              position={[0, SIGN.good.y + 0.02, 0.1]}
              scale={SIGN.good.s}
              castShadow
            />
            <mesh
              ref={(m) => {
                bars.current[i] = m
              }}
              material={flat(LOOK.barFill)}
              position={[0, SIGN.bar.y, 0.075]}
            >
              <boxGeometry args={[SIGN.bar.w, SIGN.bar.h, 0.02]} />
            </mesh>
          </group>
        )
      })}
      {fly.map((m, i) => (
        <primitive key={'fly' + i} object={m} />
      ))}
      {coin.map((m, i) => (
        <primitive key={'coin' + i} object={m} />
      ))}
    </group>
  )
}
