import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color, InstancedMesh, MeshToonMaterial, Sphere, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GRASS, ISLAND, LOOK } from '@/game/balance'
import { useAppStore } from '@/app/store'
import { useGame } from '@/game/GameContext'
import { get, levelAt } from '@/game/grid'
import { Field, GameState, Plant, key, res, unkey, type World } from '@/game/world'
import { Batch } from './instancing'
import { cam } from './camera'
import { toonBands } from './kit'
import { withReach } from './reach'
import { frame } from './frame'
import { inIsland, island } from './island'
import { hillHeight, onHillTop } from './hillShape'

/** A stable pseudo-random number in [0, 1) for a seed. */
const hash = (n: number) => {
  const j = Math.sin(n * 12.9898 + 4.1414) * 43758.5453
  return j - Math.floor(j)
}

/**
 * One leaf of grass, like the author's sample (15.10.2026: «всю землю надо усыпать вот такой травой»): broad in the
 * middle, pointed at the tip, bent a little, dark at the foot and light at the tip. Its normals all point up, so the
 * lawn shades as one soft surface rather than a fuzz of lit and dark blades.
 */
function leaf(id: number, h: number, w: number, bend: number, yaw: number, ox: number, oz: number, tilt: number): BufferGeometry {
  const rows = [0, 0.38, 0.74, 1]
  const width = [0.85, 1.12, 0.72, 0]
  const pos: number[] = [],
    col: number[] = [],
    nor: number[] = [],
    idx: number[] = []
  const foot = new Color(LOOK.grassFoot),
    tip = new Color(LOOK.grassTip),
    c = new Color()
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw)
  rows.forEach((t, i) => {
    const half = (w * width[i]!) / 2
    // the leaf leans sideways by `tilt` and bends back a little along its own z as it rises
    const side = tilt * t * h,
      back = -bend * t * t * h
    for (const s of [-1, 1]) {
      const lx = s * half + side,
        lz = back
      pos.push(ox + lx * cy + lz * sy, t * h, oz - lx * sy + lz * cy)
      c.copy(foot).lerp(tip, Math.pow(t, 0.8))
      col.push(c.r, c.g, c.b)
      nor.push(0, 1, 0)
    }
    if (i > 0) {
      const a = (i - 1) * 2,
        b = i * 2
      idx.push(a, a + 1, b, a + 1, b + 1, b)
    }
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  g.setAttribute('aLeaf', new BufferAttribute(new Float32Array(pos.length / 3).fill(id), 1))
  g.setIndex(idx)
  return g
}

/** A tuft: a handful of leaves round a point, of mixed heights and turns. One instance of the lawn. */
function tuft(seed: number): BufferGeometry {
  const parts: BufferGeometry[] = []
  for (let i = 0; i < GRASS.leaves; i++) {
    const r = (k: number) => hash(seed * 31 + i * 7 + k)
    // upright, broad and turned towards the camera (never edge-on), leaning a little left or right, in two or three
    // heights (the author's sample)
    const a = r(1) * Math.PI * 2,
      d = r(2) * 0.14
    const face = (r(7) - 0.5) * 0.9,
      lean = (r(6) - 0.5) * 0.36
    parts.push(leaf(i, GRASS.height * (0.5 + r(3) * 0.8), GRASS.width * (0.75 + r(4) * 0.5), 0.06 + r(5) * 0.1, face, Math.cos(a) * d, Math.sin(a) * d, lean))
  }
  return mergeGeometries(parts)!
}

/**
 * A lawn of broad soft grass over all the free land: dense tufts on every cell where nothing stands — not on
 * buildings (the portal is one), belts, water or meadows. It sways in the wind. It writes no depth, so the contact
 * shadows see the ground beneath, not a thousand blade edges; drawn after everything else and from the far side to the
 * near, it still lies in front of what it should. It stays up while building (the author: «убери сжатие травы при
 * строительстве»). Laid in square pieces (GRASS.chunk): a piece out of the view is not drawn, and only a piece whose
 * ground changed is laid again.
 */
export function Grass() {
  // the player can switch the lawn off (the author: «сделай траву и обводку выключаемой»)
  const on = useAppStore((s) => s.grass)
  return on ? <Lawn /> : null
}

/** The lawn is laid again at most this often, seconds, while the plant keeps changing. */
const RELAY = 0.3

/** The pieces of the lawn: the island and its rim, GRASS.chunk cells a side. */
function chunks() {
  const m = Math.ceil(ISLAND.margin),
    C = GRASS.chunk
  const x0 = island.left - m,
    y0 = island.top - m
  const nx = Math.ceil((island.right - island.left + 2 * m) / C),
    ny = Math.ceil((island.bottom - island.top + 2 * m) / C)
  const a: { x0: number; y0: number; x1: number; y1: number }[] = []
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) a.push({ x0: x0 + i * C, y0: y0 + j * C, x1: Math.min(island.right + m, x0 + (i + 1) * C), y1: Math.min(island.bottom + m, y0 + (j + 1) * C) })
  return a
}

function Lawn() {
  const { world } = useGame()
  const time = useRef({ value: 0 })
  const yaw = useRef({ value: 0 })
  const material = useMemo(() => {
    const m = new MeshToonMaterial({ vertexColors: true, gradientMap: toonBands })
    m.depthWrite = false
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time.current
      shader.uniforms.uYaw = yaw.current
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uYaw;\nattribute float aLeaf;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // no two tufts alike: every leaf of every tuft its own height (the author's sample has no repeated stamp)
        vec4 root0 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float rnd = fract(sin(dot(root0.xz + aLeaf * 7.13, vec2(12.9898, 78.233))) * 43758.5453);
        transformed.y *= 0.7 + 0.6 * rnd;
        // every tuft turns its face to the camera, however the camera is turned
        float cy = cos(uYaw), sy = sin(uYaw);
        transformed.xz = vec2(cy * transformed.x + sy * transformed.z, -sy * transformed.x + cy * transformed.z);
        // sway: the higher up a leaf, the further the wind moves it; neighbouring tufts move a little out of step
        vec4 root = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float h = transformed.y;
        float gust = sin(uTime * 1.7 + root.x * 0.55 + root.z * 0.35) + 0.5 * sin(uTime * 2.9 + root.z * 1.3);
        transformed.x += gust * h * h * 1.1;
        transformed.z += cos(uTime * 1.3 + root.x * 0.8) * h * h * 0.5;`,
      )
    }
    return withReach(m, 'grass')
  }, [])
  useEffect(() => () => material.dispose(), [material])
  const geo = useMemo(() => tuft(1), [])
  useEffect(() => () => geo.dispose(), [geo])
  const pieces = useMemo(() => {
    const G = GRASS.grid
    return chunks().map((c, i) => {
      const m = new InstancedMesh(geo, material, (c.x1 - c.x0) * (c.y1 - c.y0) * G * G)
      m.name = 'grass_' + i
      m.count = 0
      m.receiveShadow = true
      m.renderOrder = 5
      // a piece is culled by its own square (and the hills' height), not by its tufts
      m.frustumCulled = true
      m.boundingSphere = new Sphere(new Vector3((c.x0 + c.x1) / 2, 0.5, (c.y0 + c.y1) / 2), Math.hypot(c.x1 - c.x0, c.y1 - c.y0) / 2 + 1)
      // null: not laid yet — a piece with nothing on it signs '' and must still be laid once
      return { ...c, mesh: m, batch: new Batch(m), sig: null as string | null }
    })
  }, [geo, material])
  useEffect(() => () => pieces.forEach((p) => p.mesh.dispose()), [pieces])
  const ver = useRef('')
  const laid = useRef(-1)
  useFrame((state) => {
    time.current.value = frame.t
    yaw.current.value = cam.yaw
    const far = cam.dist > GRASS.far
    // the pieces far side first (by the camera's own look over the ground), so nearer tufts are drawn over farther
    const fx = -Math.sin(cam.yaw),
      fz = -Math.cos(cam.yaw)
    const order = pieces.map((p) => ({ p, d: ((p.x0 + p.x1) / 2 - cam.x) * fx + ((p.y0 + p.y1) / 2 - cam.z) * fz })).sort((a, b) => b.d - a.d)
    order.forEach(({ p }, i) => {
      p.mesh.visible = !far
      p.mesh.renderOrder = 5 + i / (order.length + 1)
    })
    const gs = res(world, GameState),
      v = gs.plantVersion + ':' + gs.fieldVersion
    // a belt dragged out changes the plant every few frames: pieces are laid again at most every RELAY seconds
    const now = state.clock.elapsedTime
    if (v === ver.current || now - laid.current < RELAY) return
    ver.current = v
    laid.current = now
    const sigs = signatures(world, pieces)
    pieces.forEach((p, i) => {
      if (sigs[i] === p.sig) return
      p.sig = sigs[i]!
      p.batch.begin()
      lay(world, p, (x, y, z, yaw, s, h, shade) => p.batch.put(x, y, z, yaw, s, h, s, shade))
      p.batch.end()
    })
  })
  return (
    <group>
      {pieces.map((p) => (
        <primitive key={p.mesh.name} object={p.mesh} />
      ))}
    </group>
  )
}

/**
 * What each piece's lawn depends on: the buildings on it or a cell beside it (a building shortens the tufts next to it)
 * and the water and meadows on it. A piece is laid again only when this changes.
 */
function signatures(w: World, pieces: readonly { x0: number; y0: number; x1: number; y1: number }[]) {
  const sig = pieces.map(() => '')
  const C = GRASS.chunk,
    p0 = pieces[0]!
  const nx = Math.round((pieces[pieces.length - 1]!.x0 - p0.x0) / C) + 1
  const mark = (x0: number, y0: number, x1: number, y1: number, s: string) => {
    const seen = new Set<number>()
    for (const [x, y] of [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1],
    ] as const) {
      const i = Math.floor((x - p0.x0) / C),
        j = Math.floor((y - p0.y0) / C)
      const at = j * nx + i
      if (i < 0 || j < 0 || i >= nx || at >= pieces.length || seen.has(at)) continue
      seen.add(at)
      sig[at] += s
    }
  }
  for (const b of res(w, Plant).b.values()) mark(b.x - 1, b.y - 1, b.x + b.w, b.y + b.h, b.x + ',' + b.y + ',' + b.w + ',' + b.h + ';')
  for (const [k, t] of res(w, Field).terrain) if (t === 'water' || t === 'meadow') mark(...(unkey(k).flatMap((v) => [v, v]) as [number, number, number, number]), k + ';')
  return sig
}

const _c = new Color()

/**
 * Does the lawn grow on this cell? Everywhere the ground is free (the author: «должна занимать всё пространство что
 * есть свободное на земле») — round trees, rocks and bushes too, which stand in it, and the hills' tops — but not on
 * water, meadows, buildings or belts.
 */
function grows(w: World, x: number, y: number) {
  if (!inIsland(x, y)) return true
  const t = res(w, Field).terrain.get(key(x, y))
  if (t === 'water' || t === 'meadow') return false
  return !get(w, x, y)
}

/** Inside the island's rounded top. */
function onIsland(px: number, pz: number) {
  const x0 = island.left - ISLAND.margin + 0.25,
    z0 = island.top - ISLAND.margin + 0.25,
    x1 = island.right + ISLAND.margin - 0.25,
    z1 = island.bottom + ISLAND.margin - 0.25
  if (px < x0 || pz < z0 || px > x1 || pz > z1) return false
  const R = ISLAND.corner - 0.25
  const cx = Math.min(x1 - R, Math.max(x0 + R, px)),
    cz = Math.min(z1 - R, Math.max(z0 + R, pz))
  return Math.hypot(px - cx, pz - cz) <= R
}

/** Where a piece's lawn grows: every free cell of it, tufts scattered over it, laid far side first. */
function lay(w: World, c: { x0: number; y0: number; x1: number; y1: number }, put: (x: number, y: number, z: number, yaw: number, s: number, h: number, shade: Color) => void) {
  const spots: [number, number, number, number, number, number, Color][] = []
  for (let y = c.y0; y < c.y1; y++)
    for (let x = c.x0; x < c.x1; x++) {
      if (!grows(w, x, y)) continue
      const hill = levelAt(w, x, y) > 1
      // by a belt or a building the grass gets short instead of stopping: no leaf lies across it, no bare strip
      const open = (dx: number, dy: number) => grows(w, x + dx, y + dy)
      const x0 = open(-1, 0) ? 0 : 0.06,
        x1 = open(1, 0) ? 1 : 0.94,
        z0 = open(0, -1) ? 0 : 0.06,
        z1 = open(0, 1) ? 1 : 0.94
      // a jittered grid of tufts: as thick everywhere, no bald patches between random clumps
      const G = GRASS.grid
      for (let i = 0; i < G * G; i++) {
        const n = x * 7919 + y * 104729 + i * 31
        const px = x + x0 + ((i % G) + 0.15 + hash(n) * 0.7) * ((x1 - x0) / G),
          pz = y + z0 + (Math.floor(i / G) + 0.15 + hash(n + 1) * 0.7) * ((z1 - z0) / G)
        // keep inside the island's rounded outline; on a hill only on its top, off its lip
        if (!onIsland(px, pz) || (hill && !onHillTop(px, pz))) continue
        const py = hillHeight(px, pz)
        const v = 0.97 + hash(n + 2) * 0.06
        _c.setRGB(v, v, v)
        // tufts by a building or a belt sit in its shade, a touch darker
        const near = Math.min(x0 ? px - x : 9, x1 < 1 ? x + 1 - px : 9, z0 ? pz - y : 9, z1 < 1 ? y + 1 - pz : 9)
        // as thick, only shorter and a shade darker, close to what stands there
        const k = Math.min(1, Math.max(0, near / GRASS.inset)),
          ease = k * k * (3 - 2 * k)
        _c.multiplyScalar(0.94 + 0.06 * ease)
        const size = 0.85 + hash(n + 5) * 0.35
        spots.push([px, py, pz, (hash(n + 4) - 0.5) * 0.6, size * (0.8 + hash(n + 6) * 0.4), size * (0.45 + 0.55 * ease), _c.clone()])
      }
    }
  // far side first, so later (nearer) tufts are drawn over earlier ones
  spots.sort((a, b) => a[2] - b[2])
  for (const [x, y, z, yaw, s, h, c] of spots) put(x, y, z, yaw, s, h, c)
}
