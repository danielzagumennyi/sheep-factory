import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, CircleGeometry, CylinderGeometry, DoubleSide, Mesh, MeshBasicMaterial, SRGBColorSpace, type Group } from 'three'
import { LOOK, PORTAL } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { key } from '@/game/world'
import { mat, vmat } from './kit'
import { PORTAL_COIN_Y, PORTAL_RING, portalModel, shornSheepModel } from './models'
import { useView, views } from './pick'
import { frame } from './frame'

/**
 * The portal (GDD 7): the plaza, the dais and the stone ring (models.ts `portalModel`), the swirl inside the ring
 * turning all the time. A shorn sheep handed in slides along its way in's trough to the dais and shrinks into the
 * ring; its coins pop up off the ring's top.
 */

/** The portal's middle, on the field. */
const MID = { x: PORTAL.x + PORTAL.size / 2, z: PORTAL.y + PORTAL.size / 2 }

/** A sheep on its way into the portal, and a coin off the ring. */
interface Flight {
  from: [number, number, number]
  t: number
}
interface Coin {
  t: number
  spin: number
}
/** Seconds of a sheep's way in; a coin's rise; how many at once. */
const FLY = { dur: 1.1, coin: 0.8, max: 48, coins: 16 } as const
const flights: Flight[] = [],
  coins: Coin[] = []

/** A shorn sheep went into the portal at its way in (x, y): it slides to the ring and goes in; its coins pop up. */
export function startPortal(e: { x: number; y: number }) {
  flights.push({ from: [e.x + 0.5, 0.2, e.y + 0.5], t: 0 })
  while (flights.length > FLY.max) flights.shift()
  coins.push({ t: 0, spin: Math.random() * Math.PI })
  while (coins.length > FLY.coins) coins.shift()
}

/** The swirl's picture: soft arms of the portal's colours wound round the middle. */
function swirlTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.35, LOOK.portalSwirl[2])
  grad.addColorStop(0.75, LOOK.portalSwirl[0])
  grad.addColorStop(1, LOOK.portalSwirl[1])
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  g.lineCap = 'round'
  for (let arm = 0; arm < 5; arm++) {
    g.beginPath()
    for (let t = 0; t < 1; t += 0.02) {
      const a = arm * ((Math.PI * 2) / 5) + t * 4.2,
        r = 10 + t * 112
      const x = 128 + Math.cos(a) * r,
        y = 128 + Math.sin(a) * r
      if (t === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.strokeStyle = 'rgba(255,255,255,0.55)'
    g.lineWidth = 9
    g.stroke()
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

export function Portal() {
  const { world } = useGame()
  const root = useRef<Group>(null)
  useView(views.buildings, key(PORTAL.x, PORTAL.y), root)
  const swirl = useMemo(() => {
    const m = new Mesh(new CircleGeometry(PORTAL_RING.r - PORTAL_RING.tube * 0.6, 48), new MeshBasicMaterial({ map: swirlTexture(), side: DoubleSide, fog: false }))
    m.position.set(MID.x, PORTAL_RING.y, MID.z)
    return m
  }, [])
  const fly = useMemo(() => Array.from({ length: FLY.max }, () => new Mesh(shornSheepModel(), vmat())), [])
  const coin = useMemo(() => {
    const g = new CylinderGeometry(0.16, 0.16, 0.05, 18).rotateX(Math.PI / 2)
    return Array.from({ length: FLY.coins }, () => new Mesh(g, mat(LOOK.coin)))
  }, [])
  useEffect(
    () => () => {
      swirl.geometry.dispose()
      ;(swirl.material as MeshBasicMaterial).map?.dispose()
    },
    [swirl],
  )
  // a new world starts with nothing on its way
  useEffect(() => {
    flights.length = 0
    coins.length = 0
  }, [world])
  useFrame(() => {
    const dt = frame.dt
    swirl.rotation.z -= dt * 1.3
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
      const k = q.t / FLY.dur
      // along the trough to the dais, then up into the ring, smaller as it goes in
      const toX = MID.x,
        toZ = MID.z
      const walk = Math.min(1, k / 0.6),
        up = Math.max(0, (k - 0.6) / 0.4)
      m.position.set(q.from[0] + (toX - q.from[0]) * walk, q.from[1] + up * (PORTAL_RING.y - 0.4), q.from[2] + (toZ - q.from[2]) * walk)
      m.rotation.y = Math.atan2(-(toZ - q.from[2]), toX - q.from[0]) + up * 6
      m.scale.setScalar(1 - up * 0.9)
    })
    coin.forEach((m, i) => {
      const q = coins[i]
      m.visible = !!q
      if (!q) return
      const k = q.t / FLY.coin
      m.position.set(MID.x, PORTAL_COIN_Y + 0.8 * Math.sin((k * Math.PI) / 2), MID.z)
      m.rotation.y = q.spin + k * 9
      m.scale.setScalar(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3)
    })
  })
  return (
    <group>
      <group ref={root} position={[MID.x, 0, MID.z]}>
        <mesh geometry={portalModel()} material={vmat()} castShadow receiveShadow />
      </group>
      <primitive object={swirl} />
      {fly.map((m, i) => (
        <primitive key={'fly' + i} object={m} />
      ))}
      {coin.map((m, i) => (
        <primitive key={'coin' + i} object={m} />
      ))}
    </group>
  )
}
