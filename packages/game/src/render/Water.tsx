import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, CapsuleGeometry, Color, CylinderGeometry, Mesh, MeshBasicMaterial } from 'three'
import { GRID, LOOK, WATER } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { onIsland } from '@/game/grid'
import { Field, GameState, res, unkey, type World } from '@/game/world'
import { Batch, useInstanced } from './instancing'
import { flat, model, vmat } from './kit'
import { withReach } from './reach'
import { ball, put } from './models'
import { frame } from './frame'

/**
 * The ponds and the canal, drawn after the author's reference dioramas (a critic's recipe, 15.10.2026: «a rounded
 * contour with a raised green kerb and an opaque candy-blue surface turns the pool and gutter into a pond and a
 * stream»). Water cells are gameplay squares; the picture is not: a fine field over them (R samples a cell) is blurred
 * by half a cell, and its iso-line is the shore — straight runs stay straight, convex corners round, concave ones
 * fillet. The surface is the inside of that line, flat and unlit in hard steps of colour by distance to the shore
 * (foam, shallows, body, deep); a half-round green kerb runs along the line. Lily pads float on the bigger ponds and
 * soft light dashes drift.
 * Rebuilt only when the water changes.
 */
export function Water() {
  const { world } = useGame()
  const surface = useMemo(() => new Mesh(new BufferGeometry(), bandMaterial()), [])
  const kerb = useMemo(() => {
    const m = new Mesh(new BufferGeometry(), vmat())
    m.receiveShadow = true
    return m
  }, [])
  useEffect(
    () => () => {
      surface.geometry.dispose()
      ;(surface.material as MeshBasicMaterial).dispose()
      kerb.geometry.dispose()
    },
    [surface, kerb],
  )
  const pads = useInstanced(lilyPad(), vmat(), 64, 'lily_pads', 'receive')
  const blooms = useInstanced(lilyBloom(), vmat(), 32, 'lily_blooms', false)
  const dashes = useInstanced(useMemo(() => new CapsuleGeometry(0.5, 2, 2, 8).rotateZ(Math.PI / 2), []), flat(LOOK.waterFoam, 0.5), 128, 'water_dashes', false)
  const b = useMemo(() => ({ pads: new Batch(pads), blooms: new Batch(blooms), dashes: new Batch(dashes) }), [pads, blooms, dashes])
  const ver = useRef('')
  const spots = useRef<{ x: number; z: number; r: number }[]>([])
  useFrame(() => {
    const v = res(world, GameState).fieldVersion + ':' + waterSig(world)
    if (v !== ver.current) {
      ver.current = v
      const f = waterField(world)
      surface.geometry.dispose()
      surface.geometry = surfaceGeometry(f)
      kerb.geometry.dispose()
      kerb.geometry = kerbGeometry(f)
      // lily pads where the water is wide, one in about two cells, in little clusters; dashes over all of it
      b.pads.begin()
      b.blooms.begin()
      spots.current = []
      for (let j = 0; j < f.n; j++)
        for (let i = 0; i < f.m; i++) {
          if ((i % WATER.R) - WATER.R / 2 || (j % WATER.R) - WATER.R / 2) continue
          const d = f.dist[j * f.m + i]!
          const x = f.x0 + (i + 0.5) / WATER.R,
            z = f.z0 + (j + 0.5) / WATER.R
          if (d <= 0) continue
          spots.current.push({ x, z, r: hash(x, z, 9) })
          if (d < 0.45 || hash(x, z, 1) > 0.5) continue
          const yaw = hash(x, z, 2) * Math.PI * 2,
            s = 0.8 + hash(x, z, 3) * 0.4,
            px = x + (hash(x, z, 4) - 0.5) * 0.3,
            pz = z + (hash(x, z, 5) - 0.5) * 0.3
          b.pads.put(px, WATER.level + 0.004, pz, yaw, s, 1, s)
          if (hash(x, z, 6) < 0.3) b.blooms.put(px + 0.04, WATER.level + 0.03, pz, yaw, s)
        }
      b.pads.end()
      b.blooms.end()
    }
    // soft light dashes drifting along, each fading in and out on its own beat
    const t = frame.t
    b.dashes.begin()
    spots.current.forEach((p, i) => {
      if (i % 3) return
      const phase = (t / WATER.dashLife + p.r) % 1
      const k = Math.sin(phase * Math.PI)
      if (k < 0.15) return
      // 0.2–0.35 long, 0.07 wide, turned up to 25° either way
      const len = 0.2 + p.r * 0.15
      b.dashes.put(p.x - 0.2 + phase * WATER.dashDrift * WATER.dashLife, WATER.level + 0.003, p.z + (p.r - 0.5) * 0.4, (p.r - 0.5) * 0.87, (len / 3) * k, 0.004, 0.07 * k)
    })
    b.dashes.end()
  })
  return (
    <group>
      <primitive object={surface} />
      <primitive object={kerb} />
      {Object.values(b).map((q) => (
        <primitive key={q.mesh.name} object={q.mesh} />
      ))}
    </group>
  )
}

/** Which cells hold water. */
function waterSig(w: World) {
  const f = res(w, Field)
  let s = ''
  for (const [k, t] of f.terrain) if (t === 'water' && onIsland(w, ...unkey(k))) s += k + ';'
  return s
}

const hash = (x: number, z: number, k: number) => {
  const j = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453
  return j - Math.floor(j)
}

/** The water field over the grid and a cell round it: blurred cell weights, and inside it the distance to the shore. */
export interface WaterField {
  m: number
  n: number
  x0: number
  z0: number
  v: Float32Array
  dist: Float32Array
}

/** Every water cell weighs the same: ponds are scenery, nothing drains them (docs/05-REWORK.md). */
function bodyWeights(w: World) {
  const weight = new Map<string, number>()
  const f = res(w, Field)
  for (const [k, t] of f.terrain) if (t === 'water' && onIsland(w, ...unkey(k))) weight.set(k, 1)
  return weight
}

export function waterField(w: World): WaterField {
  const R = WATER.R
  const x0 = -1,
    z0 = -1,
    m = (GRID.cols + 2) * R,
    n = (GRID.rows + 2) * R
  const raw = new Float32Array(m * n)
  for (const [k, wgt] of bodyWeights(w)) {
    const [cx, cz] = k.split(',').map(Number) as [number, number]
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) raw[((cz - z0) * R + j) * m + (cx - x0) * R + i] = wgt
  }
  // a box blur half a cell wide, along x then along z
  const r = Math.round(R * WATER.blur)
  const tmp = new Float32Array(m * n),
    v = new Float32Array(m * n)
  for (let j = 0; j < n; j++) {
    let acc = 0
    for (let i = -r; i <= r; i++) acc += raw[j * m + Math.max(0, Math.min(m - 1, i))]!
    for (let i = 0; i < m; i++) {
      tmp[j * m + i] = acc / (2 * r + 1)
      acc += raw[j * m + Math.min(m - 1, i + r + 1)]! - raw[j * m + Math.max(0, i - r)]!
    }
  }
  for (let i = 0; i < m; i++) {
    let acc = 0
    for (let j = -r; j <= r; j++) acc += tmp[Math.max(0, Math.min(n - 1, j)) * m + i]!
    for (let j = 0; j < n; j++) {
      v[j * m + i] = acc / (2 * r + 1)
      acc += tmp[Math.min(n - 1, j + r + 1) * m + i]! - tmp[Math.max(0, j - r) * m + i]!
    }
  }
  // distance to the shore inside, in cells: a two-pass chamfer, 0 outside
  const T = WATER.iso
  const dist = new Float32Array(m * n)
  const BIG = 1e6,
    s1 = 1 / R,
    s2 = Math.SQRT2 / R
  for (let k = 0; k < m * n; k++) dist[k] = v[k]! >= T ? BIG : 0
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= m || j >= n ? 0 : dist[j * m + i]!)
  for (let j = 0; j < n; j++)
    for (let i = 0; i < m; i++) {
      const k = j * m + i
      if (!dist[k]) continue
      dist[k] = Math.min(dist[k]!, at(i - 1, j) + s1, at(i, j - 1) + s1, at(i - 1, j - 1) + s2, at(i + 1, j - 1) + s2)
    }
  for (let j = n - 1; j >= 0; j--)
    for (let i = m - 1; i >= 0; i--) {
      const k = j * m + i
      if (!dist[k]) continue
      dist[k] = Math.min(dist[k]!, at(i + 1, j) + s1, at(i, j + 1) + s1, at(i + 1, j + 1) + s2, at(i - 1, j + 1) + s2)
    }
  // near the shore the blurred field falls off evenly with distance — a smooth measure for the foam and the shallows;
  // further in, the chamfer's
  const across = (2 * r + 1) / R
  for (let k = 0; k < m * n; k++) {
    if (!dist[k]) continue
    const near = (v[k]! - T) * across
    dist[k] = near < 0.3 ? Math.max(0.001, near) : Math.max(0.3, dist[k]! - s1 / 2)
  }
  return { m, n, x0, z0, v, dist }
}

/** The world point of a field sample. */
const sx = (f: WaterField, i: number) => f.x0 + (i + 0.5) / WATER.R
const sz = (f: WaterField, j: number) => f.z0 + (j + 0.5) / WATER.R

/**
 * The water's colour in hard steps by distance to the shore (foam, shallows, body, deep), worked out per pixel from a
 * distance the vertices carry — so the steps are clean lines along the shore, not a sawtooth spread over the
 * triangles. Unlit, with the scene's haze.
 */
function bandMaterial() {
  const m = new MeshBasicMaterial({ fog: true })
  m.onBeforeCompile = (shader) => {
    const u = (c: string) => ({ value: new Color(c) })
    Object.assign(shader.uniforms, { uFoam: u(LOOK.waterFoam), uShallow: u(LOOK.waterShallow), uBody: u(LOOK.water), uDeep: u(LOOK.waterDeep), uSteps: { value: [WATER.foam, WATER.shallow, WATER.deep] } })
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aDist;\nvarying float vDist;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDist = aDist;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vDist;\nuniform vec3 uFoam;\nuniform vec3 uShallow;\nuniform vec3 uBody;\nuniform vec3 uDeep;\nuniform float uSteps[3];')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float aa = max(fwidth(vDist) * 0.75, 1e-4);
        vec3 band = mix(uFoam, uShallow, smoothstep(uSteps[0] - aa, uSteps[0] + aa, vDist));
        band = mix(band, uBody, smoothstep(uSteps[1] - aa, uSteps[1] + aa, vDist));
        band = mix(band, uDeep, smoothstep(uSteps[2] - aa, uSteps[2] + aa, vDist));
        vec4 diffuseColor = vec4( band, opacity );`,
      )
  }
  return withReach(m, 'water')
}

/**
 * The water's surface: every square of the field where it is inside the shore, cut along the iso-line (marching
 * squares), at the water's level, coloured by distance to the shore.
 */
function surfaceGeometry(f: WaterField): BufferGeometry {
  const T = WATER.iso
  const pos: number[] = [],
    dst: number[] = []
  const V = (i: number, j: number) => f.v[j * f.m + i]!
  const D = (i: number, j: number) => f.dist[j * f.m + i]!
  for (let j = 0; j < f.n - 1; j++)
    for (let i = 0; i < f.m - 1; i++) {
      // corners round the square, with what lies on each edge between them where the shore crosses it
      const cs: [number, number][] = [
        [i, j],
        [i + 1, j],
        [i + 1, j + 1],
        [i, j + 1],
      ]
      const vals = cs.map(([a, bb]) => V(a, bb))
      if (vals.every((q) => q < T)) continue
      const ring: [number, number, number][] = []
      for (let k = 0; k < 4; k++) {
        const [ai, aj] = cs[k]!,
          [bi, bj] = cs[(k + 1) % 4]!
        const va = vals[k]!,
          vb = vals[(k + 1) % 4]!
        if (va >= T) ring.push([sx(f, ai), sz(f, aj), D(ai, aj)])
        if (va >= T !== vb >= T) {
          const u = (T - va) / (vb - va)
          ring.push([sx(f, ai) + (sx(f, bi) - sx(f, ai)) * u, sz(f, aj) + (sz(f, bj) - sz(f, aj)) * u, 0])
        }
      }
      // a saddle whose middle is dry: two corners of water, not one strip across
      const inside = vals.filter((q) => q >= T).length
      const saddle = inside === 2 && vals[0]! >= T === vals[2]! >= T
      const polys: [number, number, number][][] = saddle && (vals[0]! + vals[1]! + vals[2]! + vals[3]!) / 4 < T ? splitSaddle(ring) : [ring]
      for (const p of polys)
        for (let k = 1; k + 1 < p.length; k++)
          for (const q of [p[0]!, p[k + 1]!, p[k]!]) {
            pos.push(q[0], WATER.level, q[1])
            dst.push(q[2])
          }
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('aDist', new BufferAttribute(new Float32Array(dst), 1))
  return g
}

/** A dry-middled saddle's ring (corner, edge, edge, corner, edge, edge) as its two corner triangles. */
function splitSaddle(ring: [number, number, number][]) {
  // the ring alternates: a wet corner, then the two crossings round it
  const out: [number, number, number][][] = []
  for (let k = 0; k < ring.length; k++)
    if (ring[k]![2] > 0) {
      const prev = ring[(k + ring.length - 1) % ring.length]!,
        next = ring[(k + 1) % ring.length]!
      out.push([prev, ring[k]!, next])
    }
  return out
}

/**
 * The kerb: a half-round green bank along the shore, from just under the water's edge up over the lawn, with an
 * earthy hairline where it meets the water. The shore is chained from the marching squares' crossings into loops,
 * smoothed once, and a profile swept along it.
 */
function kerbGeometry(f: WaterField): BufferGeometry {
  const T = WATER.iso
  const V = (i: number, j: number) => f.v[j * f.m + i]!
  // each crossing, keyed by the edge it is on; each square joins two (or, at a saddle, two pairs)
  const pts = new Map<string, [number, number]>()
  const links = new Map<string, string[]>()
  const link = (a: string, b: string) => {
    ;(links.get(a) ?? links.set(a, []).get(a)!).push(b)
    ;(links.get(b) ?? links.set(b, []).get(b)!).push(a)
  }
  const cross = (ai: number, aj: number, bi: number, bj: number) => {
    const k = ai + ',' + aj + '|' + bi + ',' + bj
    if (!pts.has(k)) {
      const va = V(ai, aj),
        vb = V(bi, bj),
        u = (T - va) / (vb - va)
      pts.set(k, [sx(f, ai) + (sx(f, bi) - sx(f, ai)) * u, sz(f, aj) + (sz(f, bj) - sz(f, aj)) * u])
    }
    return k
  }
  for (let j = 0; j < f.n - 1; j++)
    for (let i = 0; i < f.m - 1; i++) {
      const a = V(i, j) >= T,
        bq = V(i + 1, j) >= T,
        c = V(i + 1, j + 1) >= T,
        d = V(i, j + 1) >= T
      const edges: string[] = []
      // the square's edges in order: top (i,j)-(i+1,j), right, bottom (i,j+1)-(i+1,j+1), left; each keyed low corner first
      if (a !== bq) edges.push(cross(i, j, i + 1, j))
      if (bq !== c) edges.push(cross(i + 1, j, i + 1, j + 1))
      if (d !== c) edges.push(cross(i, j + 1, i + 1, j + 1))
      if (a !== d) edges.push(cross(i, j, i, j + 1))
      if (edges.length === 2) link(edges[0]!, edges[1]!)
      else if (edges.length === 4) {
        // a saddle: pair the crossings round the wet corners when the middle is dry, round the dry ones when wet
        const wetMiddle = (V(i, j) + V(i + 1, j) + V(i + 1, j + 1) + V(i, j + 1)) / 4 >= T
        // round corner a (top with left) and c when a is cut off from the middle, else round b and d
        if (a !== wetMiddle) {
          link(edges[0]!, edges[3]!)
          link(edges[1]!, edges[2]!)
        } else {
          link(edges[0]!, edges[1]!)
          link(edges[2]!, edges[3]!)
        }
      }
    }
  // chain the crossings into loops
  const loops: [number, number][][] = []
  const used = new Set<string>()
  for (const start of links.keys()) {
    if (used.has(start)) continue
    const loop: [number, number][] = []
    let cur = start,
      prev = ''
    for (let guard = 0; guard < 100000; guard++) {
      used.add(cur)
      loop.push(pts.get(cur)!)
      const next = (links.get(cur) ?? []).find((q) => q !== prev && !used.has(q))
      if (!next) break
      prev = cur
      cur = next
    }
    if (loop.length > 3) loops.push(loop)
  }
  // the profile across the bank, from the water side (o < 0) out over the lawn: [offset, height, colour]
  const PROFILE: [number, number, string][] = [
    [-0.05, WATER.level - 0.012, LOOK.kerbEdge],
    [-0.012, WATER.level + 0.01, LOOK.kerbEdge],
    [0.015, WATER.kerbTop - 0.012, LOOK.kerb],
    [0.055, WATER.kerbTop, LOOK.kerb],
    [0.095, WATER.kerbTop - 0.014, LOOK.kerb],
    [0.13, 0.024, LOOK.kerbShade],
    [0.16, 0.004, LOOK.kerbShade],
    [0.22, 0.001, LOOK.ground],
  ]
  const cols = PROFILE.map(([, , h]) => new Color(h))
  const pos: number[] = [],
    col: number[] = [],
    idx: number[] = []
  const field = (x: number, z: number) => {
    const i = Math.max(0, Math.min(f.m - 1, Math.round((x - f.x0) * WATER.R - 0.5))),
      j = Math.max(0, Math.min(f.n - 1, Math.round((z - f.z0) * WATER.R - 0.5)))
    return V(i, j)
  }
  for (const raw of loops) {
    // smooth once (Chaikin): no kinks from the field's steps
    const loop: [number, number][] = []
    for (let k = 0; k < raw.length; k++) {
      const p = raw[k]!,
        q = raw[(k + 1) % raw.length]!
      loop.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75])
    }
    const base = pos.length / 3,
      L = loop.length,
      P = PROFILE.length
    // the side to the left of the way the loop runs; outward is where the field falls — decided once for the loop
    const left = loop.map((_, k) => {
      const a = loop[(k + L - 1) % L]!,
        b2 = loop[(k + 1) % L]!
      const nx = -(b2[1] - a[1]),
        nz = b2[0] - a[0],
        len = Math.hypot(nx, nz) || 1
      return [nx / len, nz / len] as const
    })
    let votes = 0
    loop.forEach((p, k) => {
      const [nx, nz] = left[k]!
      votes += field(p[0] + nx * 0.15, p[1] + nz * 0.15) < field(p[0] - nx * 0.15, p[1] - nz * 0.15) ? 1 : -1
    })
    const out = votes >= 0 ? 1 : -1
    loop.forEach((p, k) => {
      const [nx, nz] = left[k]!
      PROFILE.forEach(([o, h], s) => {
        pos.push(p[0] + nx * out * o, h, p[1] + nz * out * o)
        col.push(cols[s]!.r, cols[s]!.g, cols[s]!.b)
      })
    })
    // faces up: the winding follows which way the loop runs
    for (let k = 0; k < L; k++)
      for (let s = 0; s + 1 < P; s++) {
        const a = base + k * P + s,
          b2 = base + ((k + 1) % L) * P + s
        if (out < 0) idx.push(a, b2, a + 1, a + 1, b2, b2 + 1)
        else idx.push(a, a + 1, b2, a + 1, b2 + 1, b2)
      }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** A lily pad: a flat round leaf with a notch, lying on the water. */
const lilyPad = () => {
  const g = new CylinderGeometry(0.18, 0.18, 0.03, 18, 1, false, 0.35, Math.PI * 2 - 0.7)
  return model([put(g, LOOK.lily, [0, 0.015, 0])])
}
/** A small pink flower on a pad. */
const lilyBloom = () => model([put(ball(0.07), LOOK.lilyFlower, [0, 0.03, 0], [0, 0, 0], [1, 0.6, 1]), put(ball(0.03), LOOK.flowerHeart, [0, 0.07, 0])])
