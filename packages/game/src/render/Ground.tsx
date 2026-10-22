import { useEffect, useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, CanvasTexture, ExtrudeGeometry, LinearFilter, LinearMipmapLinearFilter, MeshToonMaterial, RepeatWrapping, Shape, ShapeGeometry, SRGBColorSpace } from 'three'
import { CONTACT, ISLAND, LOOK } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { Field, GameState, Plant, Ui, isOn, res, unkey, type World } from '@/game/world'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { softMat, toonBands } from './kit'
import { withReach } from './reach'
import { inIsland, island } from './island'

/** Pixels per cell of the ground texture. */
const PX = 32
const M = ISLAND.margin
/** The island's edges (island.ts) with the margin. */
const X0 = () => island.left - M
const Z0 = () => island.top - M
const X1 = () => island.right + M
const Z1 = () => island.bottom + M

/**
 * The board as a diorama island, like the author's reference scenes (15.10.2026): a grass top with a rounded lip over
 * thick soil sides, floating on the sky. The top is one flat mesh with a painted texture — one green with faint patches,
 * trodden earth and contact shadows round what stands on it, tilled soil under meadows; the water lies on it as a
 * surface of its own. The cell grid is a second, transparent layer shown only while building: one cell's tile repeated.
 * The green is painted once; what stands on it is painted over it again only when a building or the land changes.
 */
export function Ground() {
  const { world } = useGame()
  const ground = useCanvasTexture()
  const grid = useMemo(() => gridTile(), [])
  useEffect(() => () => grid.dispose(), [grid])
  const top = useMemo(() => topGeometry(), [])
  const gridMesh = useRef<Mesh>(null)
  const ver = useRef('')
  const painted = useRef(-1)
  const parts = useMemo(() => islandBody(), [])
  const base = useMemo(() => paintBase(ground.canvas.width, ground.canvas.height), [ground])
  const groundMat = useMemo(() => withReach(new MeshToonMaterial({ map: ground.tex, gradientMap: toonBands })), [ground])
  useEffect(() => () => groundMat.dispose(), [groundMat])
  useFrame((state) => {
    if (gridMesh.current) gridMesh.current.visible = isOn(world, 'ghost') && res(world, Ui).tool !== 'hand'
    const gs = res(world, GameState)
    const v = gs.fieldVersion + ':' + gs.plantVersion
    // a belt dragged out changes the plant every few frames: the whole top is painted and sent again at most every
    // REPAINT seconds, the last change always shown
    const now = state.clock.elapsedTime
    if (v === ver.current || now - painted.current < REPAINT) return
    ver.current = v
    painted.current = now
    paint(world, ground.canvas, base)
    ground.tex.needsUpdate = true
  })
  return (
    <group>
      <mesh geometry={top} material={groundMat} receiveShadow />
      <mesh ref={gridMesh} geometry={top} visible={false} renderOrder={1}>
        <meshBasicMaterial map={grid} transparent depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      <mesh geometry={parts.lip} material={parts.lipMat} receiveShadow />
      <mesh geometry={parts.soil} material={parts.soilMat} receiveShadow />
    </group>
  )
}

/** A canvas texture over the island top, repainted on demand. */
function useCanvasTexture() {
  const out = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = Math.round((X1() - X0()) * PX)
    c.height = Math.round((Z1() - Z0()) * PX)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.magFilter = LinearFilter
    t.minFilter = LinearMipmapLinearFilter
    t.anisotropy = 8
    return { canvas: c, tex: t }
  }, [])
  useEffect(() => () => out.tex.dispose(), [out])
  return out
}

/** The ground's top is painted and sent to the GPU again at most this often, seconds. */
const REPAINT = 0.3

// ---------------------------------------------------------------- the island's shape

/**
 * The top: the island's rounded outline as one flat shape, its corners on the lip's own curve, UVs from world
 * position. A grid of six vertices a cell it was, 240 000 triangles drawn every frame for a flat plane.
 */
function topGeometry() {
  const shape = new ShapeGeometry(rounded(X0(), Z0(), X1(), Z1(), ISLAND.corner), 16)
  const src = shape.getAttribute('position'),
    n = src.count,
    pos = new Float32Array(n * 3),
    nor = new Float32Array(n * 3),
    uv = new Float32Array(n * 2)
  for (let v = 0; v < n; v++) {
    const x = src.getX(v),
      z = src.getY(v)
    pos.set([x, 0, z], v * 3)
    nor[v * 3 + 1] = 1
    uv.set([(x - X0()) / (X1() - X0()), 1 - (z - Z0()) / (Z1() - Z0())], v * 2)
  }
  // shape y → world z mirrors it: each triangle turned back to face up
  const idx = Array.from(shape.index!.array)
  for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2]!, idx[t + 1]!]
  shape.dispose()
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('normal', new BufferAttribute(nor, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** A rounded rectangle in the XZ plane, as a shape whose y is world z: its corners true quarter circles, as the top's. */
export function rounded(x0: number, z0: number, x1: number, z1: number, r: number) {
  const s = new Shape()
  s.moveTo(x0 + r, z0)
  s.lineTo(x1 - r, z0)
  s.absarc(x1 - r, z0 + r, r, -Math.PI / 2, 0, false)
  s.lineTo(x1, z1 - r)
  s.absarc(x1 - r, z1 - r, r, 0, Math.PI / 2, false)
  s.lineTo(x0 + r, z1)
  s.absarc(x0 + r, z1 - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x0, z0 + r)
  s.absarc(x0 + r, z0 + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}

/**
 * A ring along the island's outline, `depth` thick with a rounded bevel, its top at `topY` — a ring, not a slab, so it
 * never covers the ponds' hollows.
 */
function slab(depth: number, bevel: number, topY: number, inset: number, width = 1) {
  const outer = rounded(X0() + inset, Z0() + inset, X1() - inset, Z1() - inset, ISLAND.corner - inset)
  const w = inset + width
  outer.holes.push(rounded(X0() + w, Z0() + w, X1() - w, Z1() - w, Math.max(0.2, ISLAND.corner - w)))
  const g = new ExtrudeGeometry(outer, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 5,
    curveSegments: 16,
  })
  // shape y → world z, extrusion → down
  g.rotateX(Math.PI / 2)
  g.translate(0, topY - bevel, 0)
  // an extrusion is shaded face by face: round the corners that showed as stripes (the author: «стыки исправь»).
  // Normals are smoothed across its small steps and kept sharp where the side meets the top
  return toCreasedNormals(g, Math.PI / 4)
}

function islandBody() {
  const lip = slab(0.12, 0.14, -0.006, 0.02, 0.6)
  const soil = slab(ISLAND.soil, 0.3, -0.3, 0.2, 1.2)
  // the rounded sides in bands blended smoothly, so the corners don't show as stripes
  return { lip, soil, lipMat: softMat(LOOK.lip), soilMat: softMat(LOOK.soil) }
}

// ---------------------------------------------------------------- the painted top

const wx = (x: number) => (x - X0()) * PX
const wz = (z: number) => (z - Z0()) * PX

/** A stable pseudo-random number for a seed. */
const hash = (n: number) => {
  const j = Math.sin(n * 12.9898) * 43758.5453
  return j - Math.floor(j)
}

/** The green of the whole top, painted once: what stands on it is painted over a copy of it (`paint`). */
function paintBase(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = LOOK.ground
  g.fillRect(0, 0, c.width, c.height)
  // big soft patches of a lighter and a deeper green, faint, so the lawn is never one flat colour
  const blob = (x: number, y: number, r: number, color: string, a: number) => {
    // straight from the hex: three's Color holds linear values, which painted every patch far too dark (the author:
    // «почему темная именно доступная зона»)
    const n = parseInt(color.slice(1), 16)
    const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, `rgba(${rgb},${a})`)
    grad.addColorStop(0.6, `rgba(${rgb},${a * 0.7})`)
    grad.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = grad
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // as many patches to a cell of land as on the first, smaller map
  const n = (c.width * c.height) / (58 * 58 * PX * PX)
  for (let i = 0; i < 70 * n; i++) blob(hash(i * 3.1) * c.width, hash(i * 7.7 + 1) * c.height, (2.2 + hash(i * 1.3 + 2) * 3.2) * PX, i % 2 ? LOOK.groundLight : LOOK.groundDark, 0.55)
  for (let i = 0; i < 160 * n; i++) blob(hash(i * 5.3 + 9) * c.width, hash(i * 2.9 + 4) * c.height, (0.6 + hash(i * 4.1 + 3) * 1.2) * PX, i % 3 ? LOOK.groundLight : LOOK.groundDark, 0.35)
  return c
}

function paint(world: World, c: HTMLCanvasElement, base: HTMLCanvasElement) {
  const g = c.getContext('2d')!
  g.drawImage(base, 0, 0)
  // trodden earth round every building, where feet and carts wear the grass away
  g.filter = 'blur(7px)'
  g.fillStyle = LOOK.trodden
  g.globalAlpha = 0.55
  for (const b of res(world, Plant).b.values()) {
    if (b.type === 'dock' || b.type === 'belt' || b.type === 'splitter' || b.type === 'merger') continue
    g.beginPath()
    g.roundRect(wx(b.x - 0.28), wz(b.y - 0.28), (b.w + 0.56) * PX, (b.h + 0.56) * PX, 14)
    g.fill()
  }
  g.globalAlpha = 1
  // contact shadows: a soft dark halo round the foot of every building and belt, which screen-space AO used to draw at
  // ten times the cost of the scene
  g.filter = `blur(${CONTACT.blur}px)`
  g.fillStyle = LOOK.contact
  for (const b of res(world, Plant).b.values()) {
    const belt = b.type === 'belt' || b.type === 'splitter' || b.type === 'merger'
    g.globalAlpha = belt ? CONTACT.belt : CONTACT.building
    const e = belt ? 0.02 : 0.08
    g.beginPath()
    g.roundRect(wx(b.x - e), wz(b.y - e), (b.w + 2 * e) * PX, (b.h + 2 * e) * PX, 8)
    g.fill()
  }
  g.globalAlpha = 1
  g.filter = 'none'
  // meadows: tilled soil with two furrows under the sheaves
  for (const [k, t] of res(world, Field).terrain) {
    if (t !== 'meadow') continue
    const [x, y] = unkey(k)
    if (!inIsland(x, y)) continue
    g.fillStyle = LOOK.meadowGround
    g.beginPath()
    g.roundRect(wx(x) + 1.5, wz(y) + 1.5, PX - 3, PX - 3, 8)
    g.fill()
    g.strokeStyle = LOOK.meadowFurrow
    g.lineWidth = 2.5
    g.beginPath()
    for (const f of [0.33, 0.67]) {
      g.moveTo(wx(x) + 5, wz(y + f))
      g.lineTo(wx(x + 1) - 5, wz(y + f))
    }
    g.stroke()
  }
}

/**
 * The cell grid: one cell's tile — a thin line along two of its edges — repeated over the top, a cell a tile (the top's
 * UVs run over the island and its margin, a whole number of cells).
 */
function gridTile() {
  const c = document.createElement('canvas')
  c.width = c.height = PX
  const g = c.getContext('2d')!
  g.fillStyle = LOOK.grid
  g.fillRect(0, 0, PX, 1)
  g.fillRect(0, 0, 1, PX)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(X1() - X0(), Z1() - Z0())
  t.magFilter = LinearFilter
  t.minFilter = LinearFilter
  t.generateMipmaps = false
  t.anisotropy = 8
  return t
}
