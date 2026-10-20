import { useEffect, useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, CanvasTexture, ExtrudeGeometry, LinearFilter, LinearMipmapLinearFilter, MeshToonMaterial, Shape, SRGBColorSpace } from 'three'
import { CONTACT, GRID, ISLAND, LOOK, MARKET, ROAD } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { Field, Flock, GameState, Plant, Ui, isOn, key, res, unkey, type World } from '@/game/world'
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mat, softMat, toonBands } from './kit'
import { rb } from './models'
import { withReach } from './reach'
import { island } from './island'

/** Pixels per cell of the ground texture; vertices per cell of the ground mesh. */
const PX = 32
const SUB = 6
const M = ISLAND.margin
const X0 = -M,
  Z1 = GRID.rows + M
/** The island's far and east edges: its first row and last column (island.ts) with the margin. */
const Z0 = () => island.top - M
const X1 = () => island.right + M

/**
 * The board as a diorama island, like the author's reference scenes (15.10.2026): a grass top with a rounded lip over
 * thick soil sides, floating on the sky. The top is one flat mesh with a painted texture — one green with faint patches,
 * the dock row paved, the road in two lanes; the water lies on it as a surface of its own.
 * The cell grid is a second, transparent layer shown only while building. All of it is rebuilt only when the land
 * changes (`fieldVersion`).
 */
export function Ground() {
  const { world } = useGame()
  const ground = useCanvasTexture(true)
  const grid = useCanvasTexture(false)
  const top = useMemo(() => topGeometry(), [])
  const gridMesh = useRef<Mesh>(null)
  const ver = useRef('')
  const parts = useMemo(() => islandBody(), [])
  const groundMat = useMemo(() => withReach(new MeshToonMaterial({ map: ground.tex, gradientMap: toonBands })), [ground])
  useEffect(() => () => groundMat.dispose(), [groundMat])
  useFrame(() => {
    if (gridMesh.current) gridMesh.current.visible = isOn(world, 'ghost') && res(world, Ui).tool !== 'hand'
    const plant = res(world, Plant)
    const v = res(world, GameState).fieldVersion + ':' + plant.b.size + ':' + plant.occ.size + ':' + res(world, Flock).pastures.length + ':' + res(world, Field).plots.size
    if (v === ver.current) return
    ver.current = v
    paint(world, ground.canvas)
    paintGrid(world, grid.canvas)
    ground.tex.needsUpdate = true
    grid.tex.needsUpdate = true
  })
  return (
    <group>
      <mesh geometry={top} material={groundMat} receiveShadow />
      <mesh ref={gridMesh} geometry={top} visible={false} renderOrder={1}>
        <meshBasicMaterial map={grid.tex} transparent depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      <mesh geometry={parts.lip} material={parts.lipMat} receiveShadow />
      <mesh geometry={parts.soil} material={parts.soilMat} receiveShadow />
      <mesh geometry={parts.curbs} material={mat(LOOK.curb)} castShadow receiveShadow />
    </group>
  )
}

/** A canvas texture over the island top, repainted on demand. */
function useCanvasTexture(mips: boolean) {
  const out = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = Math.round((X1() - X0) * PX)
    c.height = Math.round((Z1 - Z0()) * PX)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.magFilter = LinearFilter
    t.minFilter = mips ? LinearMipmapLinearFilter : LinearFilter
    t.generateMipmaps = mips
    t.anisotropy = 8
    return { canvas: c, tex: t }
  }, [mips])
  useEffect(() => () => out.tex.dispose(), [out])
  return out
}

// ---------------------------------------------------------------- the island's shape

/** A point of the top pulled onto the rounded corner when it lies outside it. */
function inCorner(x: number, z: number): [number, number] {
  const R = ISLAND.corner
  const cx = Math.min(X1() - R, Math.max(X0 + R, x)),
    cz = Math.min(Z1 - R, Math.max(Z0() + R, z))
  const dx = x - cx,
    dz = z - cz,
    d = Math.hypot(dx, dz)
  return d <= R ? [x, z] : [cx + (dx / d) * R, cz + (dz / d) * R]
}

/** The top: a grid of SUB vertices per cell over the island, corners rounded, UVs from world position. */
function topGeometry() {
  const nx = Math.round((X1() - X0) * SUB),
    nz = Math.round((Z1 - Z0()) * SUB)
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3),
    uv = new Float32Array((nx + 1) * (nz + 1) * 2)
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const [x, z] = inCorner(X0 + i / SUB, Z0() + j / SUB)
      const v = j * (nx + 1) + i
      pos[v * 3] = x
      pos[v * 3 + 2] = z
      uv[v * 2] = (x - X0) / (X1() - X0)
      uv[v * 2 + 1] = 1 - (z - Z0()) / (Z1 - Z0())
    }
  const idx: number[] = []
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        b = a + 1,
        c = a + nx + 1,
        d = c + 1
      idx.push(a, c, b, b, c, d)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** A rounded rectangle in the XZ plane, as a shape whose y is world z: its corners true quarter circles, as the top's. */
function rounded(x0: number, z0: number, x1: number, z1: number, r: number) {
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
  const outer = rounded(X0 + inset, Z0() + inset, X1() - inset, Z1 - inset, ISLAND.corner - inset)
  const w = inset + width
  outer.holes.push(rounded(X0 + w, Z0() + w, X1() - w, Z1 - w, Math.max(0.2, ISLAND.corner - w)))
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
  // stone curbs along both sides of the road
  const len = X1() - X0 - 0.5
  const curb = (z: number) => rb(len, 0.07, 0.12, 0.03).translate((X0 + X1()) / 2, 0.035, z)
  const curbs = mergeGeometries([curb(ROAD.row + 0.03), curb(ROAD.row + 1.97)])!
  // the rounded sides in bands blended smoothly, so the corners don't show as stripes
  return { lip, soil, curbs, lipMat: softMat(LOOK.lip), soilMat: softMat(LOOK.soil) }
}

// ---------------------------------------------------------------- the painted top

const wx = (x: number) => (x - X0) * PX
const wz = (z: number) => (z - Z0()) * PX

/** A stable pseudo-random number for a seed. */
const hash = (n: number) => {
  const j = Math.sin(n * 12.9898) * 43758.5453
  return j - Math.floor(j)
}

function paint(world: World, c: HTMLCanvasElement) {
  const g = c.getContext('2d')!
  g.fillStyle = LOOK.ground
  g.fillRect(0, 0, c.width, c.height)
  // big soft patches of a lighter and a deeper green, faint, so the lawn is never one flat colour; the land for sale
  // is the same green as the owned, the fence round the owned land is what tells them apart
  const blob = (x: number, y: number, r: number, color: string, a: number) => {
    // straight from the hex: three's Color holds linear values, which painted every patch far too dark — and so all the
    // owned land, the land for sale being painted over them (the author: «почему темная именно доступная зона»)
    const n = parseInt(color.slice(1), 16)
    const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, `rgba(${rgb},${a})`)
    grad.addColorStop(0.6, `rgba(${rgb},${a * 0.7})`)
    grad.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = grad
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < 70; i++) blob(hash(i * 3.1) * c.width, hash(i * 7.7 + 1) * c.height, (2.2 + hash(i * 1.3 + 2) * 3.2) * PX, i % 2 ? LOOK.groundLight : LOOK.groundDark, 0.55)
  for (let i = 0; i < 160; i++) blob(hash(i * 5.3 + 9) * c.width, hash(i * 2.9 + 4) * c.height, (0.6 + hash(i * 4.1 + 3) * 1.2) * PX, i % 3 ? LOOK.groundLight : LOOK.groundDark, 0.35)
  // trodden earth round every building and the pen, where feet and carts wear the grass away
  g.filter = 'blur(7px)'
  g.fillStyle = LOOK.trodden
  g.globalAlpha = 0.55
  for (const b of res(world, Plant).b.values()) {
    if (b.type === 'dock' || b.type === 'belt' || b.type === 'splitter' || b.type === 'merger') continue
    g.beginPath()
    g.roundRect(wx(b.x - 0.28), wz(b.y - 0.28), (b.w + 0.56) * PX, (b.h + 0.56) * PX, 14)
    g.fill()
  }
  for (const p of res(world, Flock).pastures) {
    g.beginPath()
    g.roundRect(wx(p.x - 0.3), wz(p.y - 0.3), (p.w + 0.6) * PX, (p.h + 0.6) * PX, 16)
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
  for (const p of res(world, Flock).pastures) {
    g.globalAlpha = CONTACT.belt
    g.beginPath()
    g.roundRect(wx(p.x - 0.06), wz(p.y - 0.06), (p.w + 0.12) * PX, (p.h + 0.12) * PX, 8)
    g.fill()
  }
  g.globalAlpha = 1
  g.filter = 'none'
  // the market's row: grout under the pastel paving tiles (Props.tsx); the stalls' floor past it, from edge to edge;
  // then the road in two lanes along the island's edge
  const rowY = wz(GRID.roadY),
    roadY = wz(ROAD.row)
  g.fillStyle = LOOK.dockTile
  g.fillRect(wx(X0 + 0.2), rowY, (X1() - X0 - 0.4) * PX, PX)
  g.fillStyle = LOOK.dockRow
  g.fillRect(wx(X0 + 0.2), rowY + PX, (X1() - X0 - 0.4) * PX, MARKET.rows * PX)
  g.fillStyle = LOOK.road
  g.fillRect(wx(X0), roadY, (X1() - X0) * PX, 2 * PX)
  g.strokeStyle = LOOK.roadLine
  g.lineWidth = 3
  g.setLineDash([16, 14])
  g.beginPath()
  g.moveTo(wx(X0), roadY + PX)
  g.lineTo(wx(X1()), roadY + PX)
  g.stroke()
  g.setLineDash([])
  // a parking bay in front of each stall, on the lane by the stalls
  g.strokeStyle = 'rgba(255,255,255,0.75)'
  g.lineWidth = 2
  for (const x of MARKET.stalls) g.strokeRect(wx(x + MARKET.stallW / 2 - 0.8) + 4, roadY + 5, 1.6 * PX - 8, PX - 10)
  // meadows: tilled soil with two furrows under the sheaves — on the island only: one still under the sky (it grows
  // later) left a bare patch on the rim's grass
  for (const [k, t] of res(world, Field).terrain) {
    if (t !== 'meadow') continue
    const [x, y] = unkey(k)
    if (y < island.top || x >= island.right) continue
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

/** The cell grid over owned plots: thin lines on a transparent layer. */
function paintGrid(world: World, c: HTMLCanvasElement) {
  const g = c.getContext('2d')!
  const plots = res(world, Field).plots
  g.clearRect(0, 0, c.width, c.height)
  g.strokeStyle = LOOK.grid
  g.lineWidth = 1
  g.beginPath()
  for (let py = 0; py * GRID.plotH < GRID.roadY; py++)
    for (let px = 0; px * GRID.plotW < island.right; px++) {
      if (!plots.has(key(px, py))) continue
      const x = wx(px * GRID.plotW),
        y = wz(py * GRID.plotH)
      for (let i = 0; i <= GRID.plotW; i++) {
        g.moveTo(x + i * PX, y)
        g.lineTo(x + i * PX, y + GRID.plotH * PX)
      }
      for (let i = 0; i <= GRID.plotH; i++) {
        g.moveTo(x, y + i * PX)
        g.lineTo(x + GRID.plotW * PX, y + i * PX)
      }
    }
  g.stroke()
}
