import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color, MeshToonMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GRASS, GRID, ISLAND, LOOK } from '@/game/balance'
import { useAppStore } from '@/app/store'
import { useGame } from '@/game/GameContext'
import { get, owned, pastureAt } from '@/game/grid'
import { Field, Flock, GameState, Plant, key, res, type World } from '@/game/world'
import { Batch, useInstanced } from './instancing'
import { cam } from './camera'
import { toonBands } from './kit'
import { withReach } from './reach'
import { frame } from './frame'

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

/** One tuft shape for the whole lawn (one instanced mesh, so the far-to-near order holds across all of it). */
const KINDS = 1

/**
 * A lawn of broad soft grass over all the free land: dense tufts on every cell where nothing stands — not on
 * buildings, belts, water, meadows, the pen, the road or where goods lie. It sways in the wind. It writes no depth,
 * so the contact shadows see the ground beneath, not a thousand blade edges; drawn after everything else and from the
 * far side to the near, it still lies in front of what it should. It stays up while building (the author: «убери
 * сжатие травы при строительстве»).
 */
export function Grass() {
  // the player can switch the lawn off (the author: «сделай траву и обводку выключаемой»)
  const on = useAppStore((s) => s.grass)
  return on ? <Lawn /> : null
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
        // no two tufts alike: every leaf of every tuft its own height (one mesh, so the far-to-near order holds; the
        // author's sample has no repeated stamp)
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
  const geos = useMemo(() => Array.from({ length: KINDS }, (_, i) => tuft(i + 1)), [])
  const meshes = geos.map((g, i) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- a fixed list, same order every render
    const m = useInstanced(g, material, GRASS.cap, 'grass_' + i, false)
    return m
  })
  for (const m of meshes) {
    m.receiveShadow = true
    m.renderOrder = 5
  }
  const batches = useMemo(() => meshes.map((m) => new Batch(m)), [meshes])
  const sig = useRef('')
  useFrame(() => {
    time.current.value = frame.t
    yaw.current.value = cam.yaw
    const s = signature(world)
    if (s === sig.current) return
    sig.current = s
    for (const b of batches) b.begin()
    lay(world, (k, x, z, yaw, s, h, shade) => batches[k]!.put(x, 0, z, yaw, s, h, s, shade))
    for (const b of batches) b.end()
  })
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  )
}

function signature(w: World) {
  const p = res(w, Plant),
    f = res(w, Field)
  let piles = ''
  for (const b of p.b.values()) if (b.pile.length) piles += b.pileX + ',' + b.pileY + ';'
  return p.b.size + ':' + p.occ.size + ':' + res(w, GameState).fieldVersion + ':' + res(w, Flock).pastures.length + ':' + f.plots.size + ':' + piles
}

const _c = new Color()

/**
 * Does the lawn grow on this cell? Everywhere the ground is free (the author: «должна занимать всё пространство что
 * есть свободное на земле») — round trees, rocks and bushes too, which stand in it — but not on water, meadows,
 * buildings and belts, the pen, the road, or where goods lie.
 */
function grows(w: World, x: number, y: number, bare: Set<string>) {
  if (y >= GRID.roadY && y <= GRID.roadY + 2) return false
  const inside = x >= 0 && y >= 0 && x < GRID.cols && y < GRID.rows
  if (!inside) return true
  const t = res(w, Field).terrain.get(key(x, y))
  if (t === 'water' || t === 'bridge' || t === 'meadow') return false
  return !get(w, x, y) && !pastureAt(w, x, y) && !bare.has(key(x, y))
}

/** Inside the island's rounded top. */
function onIsland(px: number, pz: number) {
  const x0 = -ISLAND.margin + 0.25,
    z0 = -ISLAND.margin + 0.25,
    x1 = GRID.cols + ISLAND.margin - 0.25,
    z1 = GRID.rows + ISLAND.margin - 0.25
  if (px < x0 || pz < z0 || px > x1 || pz > z1) return false
  const R = ISLAND.corner - 0.25
  const cx = Math.min(x1 - R, Math.max(x0 + R, px)),
    cz = Math.min(z1 - R, Math.max(z0 + R, pz))
  return Math.hypot(px - cx, pz - cz) <= R
}

/** Where the lawn grows: every free cell of the island, tufts scattered over it, laid far side first. */
function lay(w: World, put: (k: number, x: number, z: number, yaw: number, s: number, h: number, shade: Color) => void) {
  // where goods lie — a machine's pile — the grass gives way
  const bare = new Set<string>()
  for (const b of res(w, Plant).b.values()) if (b.pile.length) bare.add(key(b.pileX, b.pileY))
  const m = Math.ceil(ISLAND.margin)
  const spots: [number, number, number, number, number, number, Color][] = []
  for (let y = -m; y < GRID.rows + m; y++)
    for (let x = -m; x < GRID.cols + m; x++) {
      const inside = x >= 0 && y >= 0 && x < GRID.cols && y < GRID.rows
      if (!grows(w, x, y, bare)) continue
      // land for sale grows a deeper green
      const mine = !inside || owned(w, x, y)
      // by a belt or a building the grass gets short instead of stopping: no leaf lies across it, no bare strip
      const open = (dx: number, dy: number) => grows(w, x + dx, y + dy, bare)
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
        // keep inside the island's rounded outline
        if (!onIsland(px, pz)) continue
        const v = 0.97 + hash(n + 2) * 0.06
        _c.setRGB(v, v, v)
        if (!mine) _c.multiplyScalar(0.95)
        // tufts by a building or a belt sit in its shade, a touch darker
        const near = Math.min(x0 ? px - x : 9, x1 < 1 ? x + 1 - px : 9, z0 ? pz - y : 9, z1 < 1 ? y + 1 - pz : 9)
        // as thick, only shorter and a shade darker, close to what stands there
        const k = Math.min(1, Math.max(0, near / GRASS.inset)),
          ease = k * k * (3 - 2 * k)
        _c.multiplyScalar(0.94 + 0.06 * ease)
        const size = 0.85 + hash(n + 5) * 0.35
        spots.push([Math.floor(hash(n + 3) * KINDS), px, pz, (hash(n + 4) - 0.5) * 0.6, size * (0.8 + hash(n + 6) * 0.4), size * (0.45 + 0.55 * ease), _c.clone()])
      }
    }
  // far side first, so later (nearer) tufts are drawn over earlier ones
  spots.sort((a, b) => a[2] - b[2])
  for (const [k, x, z, yaw, s, h, c] of spots) put(k, x, z, yaw, s, h, c)
}
