import { useEffect, useMemo } from 'react'
import { ExtrudeGeometry, Mesh, type BufferGeometry } from 'three'
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HILL, LOOK } from '@/game/balance'
import { unkey } from '@/game/world'
import { Batch, useInstanced } from './instancing'
import { softMat, vmat } from './kit'
import { flowers, pine } from './models'
import { rounded } from './Ground'
import { inIsland, island, levelOf } from './island'
import { hillHeight, onHillTop } from './hillShape'

const hash = (x: number, y: number, k: number) => {
  const j = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453
  return j - Math.floor(j)
}

/** A step's soil and its grass cap: how far in from its cells' edge, the corners' radius, the cap's thickness and its rounded lip. */
const STEP = { soilIn: 0.07, capIn: 0.02, corner: 0.34, cap: 0.05, lip: 0.07, soilBevel: 0.05 } as const

/**
 * The hills (the author, 21.10.2026: «ландшафт, 2–3 уровень высоты, на нём строить нельзя»), like the island itself
 * and the reference dioramas: each level a step of soil with rounded corners under a grass cap whose rounded lip
 * overhangs it, a tier high (HILL); the third level a smaller step on the second. Their lawn is Grass.tsx's; a few firs
 * and flowers stand on top. Built once — the island's parts are built again when it grows.
 */
export function Hills() {
  const parts = useMemo(() => {
    const soil = new Mesh(steps('soil'), softMat(LOOK.hill.side)),
      cap = new Mesh(steps('cap', 2), softMat(LOOK.hill.top)),
      capHigh = new Mesh(steps('cap', 3), softMat(LOOK.hill.high))
    soil.castShadow = true
    // the thin caps only take shadows: the soil under them casts the hill's, and a cap's lip cast jagged ones on it
    for (const m of [soil, cap, capHigh]) m.receiveShadow = true
    return [soil, cap, capHigh]
  }, [])
  useEffect(() => () => parts.forEach((m) => m.geometry.dispose()), [parts])
  const firs = useInstanced(pine(0), vmat(), 24, 'hill_firs')
  const bloom = useInstanced(flowers(LOOK.flowers[0]!), vmat(), 48, 'hill_flowers', 'receive')
  useEffect(() => {
    const a = new Batch(firs),
      b = new Batch(bloom)
    a.begin()
    b.begin()
    for (const k of island.hills.keys()) {
      const [x, y] = unkey(k)
      if (!inIsland(x, y)) continue
      const l = levelOf(x, y)
      // a fir in the middle of a cell of its top, now and then — not at the foot of the step above; flowers scattered on the tops
      const clear = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => levelOf(x + dx!, y + dy!) <= l)
      if (clear && hash(x, y, 1) < 0.3) a.put(x + 0.5, hillHeight(x + 0.5, y + 0.5), y + 0.5, hash(x, y, 2) * Math.PI * 2, 0.7 + hash(x, y, 3) * 0.2)
      else if (hash(x, y, 4) < 0.4) {
        const fx = x + 0.2 + hash(x, y, 5) * 0.6,
          fz = y + 0.2 + hash(x, y, 6) * 0.6
        if (onHillTop(fx, fz)) b.put(fx, hillHeight(fx, fz), fz, hash(x, y, 7) * Math.PI * 2, 1.1)
      }
    }
    a.end()
    b.end()
  }, [firs, bloom])
  return (
    <group>
      {parts.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <primitive object={firs} />
      <primitive object={bloom} />
    </group>
  )
}

/**
 * Every step of the hills on the island (Field.hillRects), merged: its soil from the
 * step below up to under its cap, or the grass caps of one level, thin slabs whose lips round over the soil.
 */
function steps(part: 'soil' | 'cap', level?: number) {
  const out: BufferGeometry[] = []
  for (const [l, x0, y0, x1, y1] of island.hillRects) {
    if (!inIsland(x0, y0) || levelOf(x0, y0) < l || (level && l !== level)) continue
    const top = (l - 1) * HILL.tier,
      under = (l - 2) * HILL.tier
    const s = part === 'soil' ? STEP.soilIn : STEP.capIn
    const shape = rounded(x0 + s, y0 + s, x1 + 1 - s, y1 + 1 - s, STEP.corner - s)
    const bevel = part === 'soil' ? STEP.soilBevel : STEP.lip
    // the soil reaches a little into the step below, so no seam shows at its foot
    const depth = part === 'soil' ? top - STEP.cap - under : STEP.cap
    const topY = part === 'soil' ? top - STEP.cap : top
    const g = new ExtrudeGeometry(shape, { depth: Math.max(0.01, depth - 2 * bevel + 0.04), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 10 })
    // shape y → world z, extrusion → down
    g.rotateX(Math.PI / 2)
    g.translate(0, topY - bevel, 0)
    g.deleteAttribute('uv')
    out.push(toCreasedNormals(g, Math.PI / 4))
  }
  return out.length ? mergeGeometries(out)! : new ExtrudeGeometry()
}
