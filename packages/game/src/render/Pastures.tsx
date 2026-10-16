import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { DIRS, LOOK } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { residents } from '@/game/grid'
import { Flock, res, type PastureT } from '@/game/world'
import { Icon } from '@/ui/Icon'
import { GEO, mat } from './kit'
import { useView, views } from './pick'
import type { Group } from 'three'

/** How far a gate stands open, radians from the fence line; the leaf's length between its posts. */
const GATE = { open: 1.1, leaf: 0.9 } as const

/**
 * The pasture, a building of its own (the author): a fenced lawn with two gates, a way out and a way in, each a leaf
 * swung open the way the sheep go through it — outward at the exit, inward at the entry — so the pen says itself
 * where sheep leave and where they come back (the author: «калитки, которые открыты в определённую сторону»). Its
 * feeder and trough stand outside the fence on its other two sides (Machines.tsx draws them). When they run out of
 * hay or water, one bubble over the pasture says what (not one per sheep: the author).
 */
export function Pastures() {
  const { world } = useGame()
  const list = res(world, Flock).pastures
  return (
    <group>
      {list.map((p) => (
        <PastureView key={p.id} p={p} />
      ))}
    </group>
  )
}

function PastureView({ p }: { p: PastureT }) {
  const { world } = useGame()
  const label = useRef<HTMLSpanElement>(null)
  const [want, setWant] = useState('')
  // the hover line finds the pasture by its id
  const root = useRef<Group>(null)
  useView(views.pastures, p.id, root)
  // the way out and the way in: the gap in the fence by the pen cell at each, between two posts (a, b), and the way
  // the sheep go through it
  const gates = useMemo(() => {
    const [dx, dy] = DIRS[p.dir]!,
      [ix, iy] = DIRS[p.entry.d]!
    const gap = (cx: number, cy: number, side: number, d: number) => {
      if (side === 0) return { ax: cx + 1, az: cy, bx: cx + 1, bz: cy + 1, d }
      if (side === 2) return { ax: cx, az: cy, bx: cx, bz: cy + 1, d }
      if (side === 1) return { ax: cx, az: cy + 1, bx: cx + 1, bz: cy + 1, d }
      return { ax: cx, az: cy, bx: cx + 1, bz: cy, d }
    }
    return [gap(p.exit.x - dx, p.exit.y - dy, p.dir, p.dir), gap(p.entry.x + ix, p.entry.y + iy, (p.entry.d + 2) % 4, p.entry.d)]
  }, [p])
  // fence posts all round the edge: the gates hang between two of them
  const posts = useMemo(() => {
    const out: [number, number][] = []
    for (let i = 0; i <= p.w; i++) {
      out.push([p.x + i, p.y])
      out.push([p.x + i, p.y + p.h])
    }
    for (let j = 1; j < p.h; j++) {
      out.push([p.x, p.y + j])
      out.push([p.x + p.w, p.y + j])
    }
    return out
  }, [p])
  // two rails between neighbouring posts along each side, none across a gate
  const rails = useMemo(() => {
    const has = new Set(posts.map(([x, y]) => x + ',' + y))
    const gaps = new Set(gates.map((g) => (g.ax + g.bx) / 2 + ',' + (g.az + g.bz) / 2))
    const out: [number, number, boolean][] = []
    for (const [x, y] of posts) {
      if ((y === p.y || y === p.y + p.h) && has.has(x + 1 + ',' + y) && !gaps.has(x + 0.5 + ',' + y)) out.push([x + 0.5, y, true])
      if ((x === p.x || x === p.x + p.w) && has.has(x + ',' + (y + 1)) && !gaps.has(x + ',' + (y + 0.5))) out.push([x, y + 0.5, false])
    }
    return out
  }, [posts, p, gates])
  // straw and pebbles strewn on the floor, from stable numbers
  const litter = useMemo(() => {
    const out: [number, number, boolean][] = []
    for (let i = 0; i < 7; i++) {
      const h = (n: number) => {
        const j = Math.sin((p.x * 7 + p.y * 13 + i * 3.7 + n) * 12.9898) * 43758.5453
        return j - Math.floor(j)
      }
      out.push([p.x + 0.4 + h(1) * (p.w - 0.8), p.y + 0.4 + h(2) * (p.h - 1.0), i % 3 !== 0])
    }
    return out
  }, [p])
  useFrame(() => {
    if (label.current) label.current.textContent = residents(world, p) + '/' + p.cap
    const k = p.want.join(',')
    if (k !== want) setWant(k)
  })
  return (
    <group ref={root}>
      <mesh position={[p.x + p.w / 2, 0.02, p.y + p.h / 2]} receiveShadow material={mat(LOOK.pasture)} geometry={GEO.rboxOf(p.w - 0.08, 0.04, p.h - 0.08, 0.02)} />
      {/* a trodden, darker rim inside the fence */}
      {(
        [
          [p.x + p.w / 2, p.y + 0.12, p.w - 0.1, 0.18],
          [p.x + p.w / 2, p.y + p.h - 0.12, p.w - 0.1, 0.18],
          [p.x + 0.12, p.y + p.h / 2, 0.18, p.h - 0.1],
          [p.x + p.w - 0.12, p.y + p.h / 2, 0.18, p.h - 0.1],
        ] as const
      ).map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, 0.045, z]} geometry={GEO.rbox()} material={mat(LOOK.penRim)} scale={[sx, 0.02, sz]} receiveShadow />
      ))}
      {posts.map(([x, y], i) => (
        <mesh key={i} position={[x, 0.24, y]} geometry={GEO.rboxOf(0.12, 0.48, 0.12, 0.04)} material={mat(LOOK.fence)} castShadow />
      ))}
      {rails.map(([x, y, along], i) => (
        <group key={i} position={[x, 0, y]} rotation-y={along ? 0 : Math.PI / 2}>
          {[0.17, 0.34].map((h) => (
            <mesh key={h} position={[0, h, 0]} geometry={GEO.rboxOf(1, 0.07, 0.06, 0.025)} material={mat(LOOK.fenceRail)} castShadow />
          ))}
        </group>
      ))}
      {/* a little life on the pen floor: wisps of straw and a few pebbles */}
      {litter.map(([x, z, k], i) =>
        i === 0 ? (
          <mesh key={i} position={[x, 0.15, z]} geometry={GEO.rboxOf(0.34, 0.24, 0.26, 0.06)} material={mat(LOOK.hay)} rotation-y={0.4} castShadow />
        ) : k ? (
          <mesh key={i} position={[x, 0.09, z]} geometry={GEO.ball()} material={mat(LOOK.hay)} scale={[0.26, 0.16, 0.2]} rotation-y={i * 1.3} castShadow />
        ) : (
          <mesh key={i} position={[x, 0.05, z]} geometry={GEO.ball()} material={mat(LOOK.stone)} scale={[0.14, 0.07, 0.11]} rotation-y={i * 1.3} />
        ),
      )}
      {/* a gate in each gap, hinged on one post and swung open the way the sheep go: out at the exit, in at the entry */}
      {gates.map((g, i) => {
        const ux = g.bx - g.ax,
          uz = g.bz - g.az,
          [vx, vz] = DIRS[g.d]!
        const c = Math.cos(GATE.open),
          s = Math.sin(GATE.open)
        const lx = ux * c + vx * s,
          lz = uz * c + vz * s
        return (
          <group key={i} position={[g.ax, 0, g.az]} rotation-y={-Math.atan2(lz, lx)}>
            <mesh position={[0, 0.3, 0]} geometry={GEO.rboxOf(0.14, 0.6, 0.14, 0.045)} material={mat(LOOK.fence)} castShadow />
            <mesh position={[0, 0.61, 0]} geometry={GEO.ball()} material={mat(LOOK.fence)} scale={[0.17, 0.1, 0.17]} />
            {[0.16, 0.36].map((h) => (
              <mesh key={h} position={[GATE.leaf / 2, h, 0]} geometry={GEO.rboxOf(GATE.leaf, 0.07, 0.06, 0.025)} material={mat(LOOK.fenceRail)} castShadow />
            ))}
            <mesh position={[GATE.leaf - 0.04, 0.26, 0]} geometry={GEO.rboxOf(0.08, 0.34, 0.07, 0.025)} material={mat(LOOK.fenceRail)} castShadow />
            <mesh position={[GATE.leaf / 2, 0.26, 0]} rotation-z={0.28} geometry={GEO.rboxOf(GATE.leaf - 0.1, 0.05, 0.05, 0.02)} material={mat(LOOK.fenceRail)} />
          </group>
        )
      })}
      {want && (
        <Html position={[p.x + p.w / 2, 1.3, p.y + p.h / 2]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="bubble bubble--warn">
            {want.split(',').map((k) => (
              <Icon key={k} kind={k} size={18} />
            ))}
          </div>
        </Html>
      )}
      <Html position={[p.x + p.w - 0.3, 0.5, p.y + 0.15]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
        <span className="tag tag--pasture">
          <Icon kind="sheep" size={14} />
          <span ref={label} />
        </span>
      </Html>
    </group>
  )
}
