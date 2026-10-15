import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { DIRS, LOOK } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { residents } from '@/game/grid'
import { Flock, res, type PastureT } from '@/game/world'
import { Icon } from '@/ui/Icon'
import { GEO, mat, vmat, yawOf } from './kit'
import { chute } from './machineModels'
import { useView, views } from './pick'
import type { Group } from 'three'

/**
 * The pasture, a building of its own (the author): a fenced lawn with two gaps, a way out and a way in, each with its
 * stub of belt and arrow as every machine has; its sheep eat and drink from the stock, so no trough or drinker. When
 * the stock lacks hay or water, one bubble over the pasture says what (not one per sheep: the author).
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
  // the way out and the way in: the pen's cell by each gap, the side it opens on, and the way the sheep move
  const gates = useMemo(() => {
    const [dx, dy] = DIRS[p.dir]!,
      [ix, iy] = DIRS[p.entry.d]!
    return [
      { x: p.exit.x - dx, y: p.exit.y - dy, side: p.dir as number, d: p.dir as number, out: true },
      { x: p.entry.x + ix, y: p.entry.y + iy, side: (p.entry.d + 2) % 4, d: p.entry.d as number, out: false },
    ]
  }, [p])
  // fence posts around the edge, leaving both gaps open
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
    // drop the posts that flank each gap
    return out.filter(([x, y]) =>
      gates.every((g) => {
        if (g.side === 0 || g.side === 2) return !(x === (g.side === 0 ? p.x + p.w : p.x) && (y === g.y || y === g.y + 1))
        return !(y === (g.side === 1 ? p.y + p.h : p.y) && (x === g.x || x === g.x + 1))
      }),
    )
  }, [p, gates])
  // two rails between neighbouring posts along each side
  const rails = useMemo(() => {
    const has = new Set(posts.map(([x, y]) => x + ',' + y))
    const out: [number, number, boolean][] = []
    for (const [x, y] of posts) {
      if ((y === p.y || y === p.y + p.h) && has.has(x + 1 + ',' + y)) out.push([x + 0.5, y, true])
      if ((x === p.x || x === p.x + p.w) && has.has(x + ',' + (y + 1))) out.push([x, y + 0.5, false])
    }
    return out
  }, [posts, p])
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
      {/* a stub of belt in each gap, its arrow along the way the sheep go: dark out, light in, as on every machine */}
      {gates.map((g) => {
        const [dx, dz] = DIRS[g.side]!,
          x = g.x + 0.5 + dx * 0.3,
          z = g.y + 0.5 + dz * 0.3,
          yaw = yawOf(g.d)
        return (
          <group key={g.out ? 'out' : 'in'}>
            <mesh position={[x, 0.13, z]} rotation-y={yaw} geometry={chute()} material={vmat()} castShadow receiveShadow />
            <mesh position={[x + Math.cos(yaw) * 0.02, 0.28, z - Math.sin(yaw) * 0.02]} rotation-y={yaw} geometry={GEO.chevron()} material={mat(g.out ? LOOK.chevron : LOOK.inlet)} />
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
