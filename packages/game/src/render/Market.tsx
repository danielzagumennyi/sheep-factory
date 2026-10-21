import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderGeometry, Mesh, type Group } from 'three'
import { LOOK, MARKET, type ClientId, type ItemId } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { key } from '@/game/world'
import { mat, vmat } from './kit'
import { MARKET_COIN_Y, MARKET_HALL, good, marketHall } from './models'
import { useView, views } from './pick'
import { frame } from './frame'

/**
 * The market (GDD 2, 7): one big hall in the middle of the map (models.ts `marketHall`), its ways in two troughs on
 * every side. A good handed in slides along its trough and goes in at the door; a good a client takes pops up off the
 * coin on the roof as a coin. What the clients want is the HUD's, not the hall's (the author: «товары не надо на рынке
 * выводить, лучше просто в интерфейсе»).
 */

/** The hall's middle, on the field. */
const MID = { x: MARKET.x + MARKET.size / 2, z: MARKET.y + MARKET.size / 2 }

/** A good on its way into the market, and a coin off the roof. */
interface Flight {
  good: ItemId
  from: [number, number, number]
  to: [number, number, number]
  t: number
}
interface Coin {
  t: number
  spin: number
}
/** Seconds of a good's slide in; how high it hops at the trough's mouth; a coin's rise; how many at once. */
const FLY = { dur: 0.7, hop: 0.25, coin: 0.8, max: 48, coins: 16 } as const
const flights: Flight[] = [],
  coins: Coin[] = []

/** A good handed to the market at cell (x, y) from (fx, fy): it slides along that way in's trough to its door. */
export function startFlight(e: { x: number; y: number; fx: number; fy: number; good: ItemId }) {
  const dx = e.x - e.fx,
    dz = e.y - e.fy
  // from the trough's mouth on the market's edge to the door on the wall's line, along the way the good moves
  const inward = MARKET.size / 2 - MARKET_HALL.wall / 2
  const from: [number, number, number] = [e.fx + 0.5 + dx * 0.5, 0.3, e.fy + 0.5 + dz * 0.5]
  const to: [number, number, number] = [from[0] + dx * inward, 0.3, from[2] + dz * inward]
  flights.push({ good: e.good, from, to, t: 0 })
  while (flights.length > FLY.max) flights.shift()
}
/** A good a client took: a coin pops up off the roof. */
export function startCoin(_e: { client: ClientId; good: ItemId }) {
  coins.push({ t: 0, spin: Math.random() * Math.PI })
  while (coins.length > FLY.coins) coins.shift()
}

export function Market() {
  const { world } = useGame()
  const hall = useRef<Group>(null)
  useView(views.buildings, key(MARKET.x, MARKET.y), hall)
  const fly = useMemo(() => Array.from({ length: FLY.max }, () => new Mesh(good('wool'), vmat())), [])
  const coin = useMemo(() => {
    const g = new CylinderGeometry(0.16, 0.16, 0.05, 18).rotateX(Math.PI / 2)
    return Array.from({ length: FLY.coins }, () => new Mesh(g, mat(LOOK.coin)))
  }, [])
  // a new world starts with nothing on its way
  useEffect(() => {
    flights.length = 0
    coins.length = 0
  }, [world])
  useFrame(() => {
    const dt = frame.dt
    for (let i = flights.length - 1; i >= 0; i--) {
      flights[i]!.t += dt
      if (flights[i]!.t >= FLY.dur) flights.splice(i, 1)
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
      const k = q.t / FLY.dur
      // a little hop over the trough's mouth, then a slide along its floor, smaller as it goes in at the door
      const hop = k < 0.35 ? FLY.hop * Math.sin((k / 0.35) * Math.PI) : 0
      m.position.set(q.from[0] + (q.to[0] - q.from[0]) * k, q.from[1] + hop, q.from[2] + (q.to[2] - q.from[2]) * k)
      m.scale.setScalar(k < 0.75 ? 1 : 1 - (k - 0.75) * 3.2)
    })
    coin.forEach((m, i) => {
      const q = coins[i]
      m.visible = !!q
      if (!q) return
      const k = q.t / FLY.coin
      m.position.set(MID.x, MARKET_COIN_Y + 0.25 + 0.8 * Math.sin((k * Math.PI) / 2), MID.z)
      m.rotation.y = q.spin + k * 9
      m.scale.setScalar(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3)
    })
  })
  return (
    <group>
      <group ref={hall} position={[MID.x, 0, MID.z]}>
        <mesh geometry={marketHall()} material={vmat()} castShadow receiveShadow />
      </group>
      {fly.map((m, i) => (
        <primitive key={'fly' + i} object={m} />
      ))}
      {coin.map((m, i) => (
        <primitive key={'coin' + i} object={m} />
      ))}
    </group>
  )
}
