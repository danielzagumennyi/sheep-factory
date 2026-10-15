import type { BufferGeometry } from 'three'
import { BoxGeometry, CapsuleGeometry, Color, ConeGeometry, CylinderGeometry, DataTexture, DodecahedronGeometry, Float32BufferAttribute, LinearFilter, MeshBasicMaterial, MeshToonMaterial, NearestFilter, RedFormat, SphereGeometry, TorusGeometry, type Material } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { DIRS } from '@/game/balance'
import type { Building } from '@/game/world'
import { withReach } from './reach'

/**
 * Shared materials and geometry for the whole scene (TDD 4). Every object is built here from a few soft primitives —
 * rounded boxes, smooth spheres, cones — and drawn in toon shading: three light bands, like the author's «Cute Magic»
 * reference dioramas (15.10.2026); every lit material takes the reach tint while a producer is placed (reach.ts). Geometries are created once
 * and reused by every view and instanced mesh.
 */

/** Three light bands: shade, half-light, full sun. */
const bands = (() => {
  const t = new DataTexture(new Uint8Array([135, 212, 255]), 3, 1, RedFormat)
  t.minFilter = t.magFilter = NearestFilter
  t.needsUpdate = true
  return t
})()

/** The same three bands blended into one another: for big curved surfaces, where a hard band edge shows as a seam. */
const softBands = (() => {
  const t = new DataTexture(new Uint8Array([135, 212, 255]), 3, 1, RedFormat)
  t.minFilter = t.magFilter = LinearFilter
  t.needsUpdate = true
  return t
})()
/** A toon material whose bands run smoothly into one another (the island's rounded sides: the author, «стыки исправь»). */
export const softMat = (color: string) => new MeshToonMaterial({ color: new Color(color), gradientMap: softBands })

const mats = new Map<string, MeshToonMaterial>()
/** One toon material per colour (and opacity), shared by everything of that colour. */
export function mat(color: string, opacity = 1): MeshToonMaterial {
  const k = color + ':' + opacity
  let m = mats.get(k)
  if (!m) {
    m = withReach(new MeshToonMaterial({ color: new Color(color), gradientMap: bands, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }))
    mats.set(k, m)
  }
  return m
}
/** A toon material that takes its colours from the geometry (merged multi-colour models: trees, flowers, stones). */
const vertexMat = withReach(new MeshToonMaterial({ color: new Color('#ffffff'), gradientMap: bands, vertexColors: true }))
export const vmat = () => vertexMat
export const toonBands = bands
const flats = new Map<string, MeshBasicMaterial>()
/** An unlit material for markers that must read the same in any light (ghost outlines, status dots). */
export function flat(color: string, opacity = 1): MeshBasicMaterial {
  const k = color + ':' + opacity
  let m = flats.get(k)
  if (!m) {
    m = new MeshBasicMaterial({ color: new Color(color), transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false })
    flats.set(k, m)
  }
  return m
}
export const disposeAll = (list: Material[]) => list.forEach((m) => m.dispose())

const geos = new Map<string, BufferGeometry>()
export const once = (k: string, make: () => BufferGeometry) => {
  let g = geos.get(k)
  if (!g) {
    g = make()
    geos.set(k, g)
  }
  return g
}

export const GEO = {
  box: () => once('box', () => new BoxGeometry(1, 1, 1)),
  sphere: () => once('sphere', () => new SphereGeometry(0.5, 18, 12)),
  ball: () => once('ball', () => new SphereGeometry(0.5, 14, 10)),
  cone: () => once('cone', () => new ConeGeometry(0.5, 1, 12)),
  cyl: () => once('cyl', () => new CylinderGeometry(0.5, 0.5, 1, 16)),
  /** A unit box with soft edges, for small scaled parts. */
  rbox: () => once('rbox', () => new RoundedBoxGeometry(1, 1, 1, 2, 0.14)),
  /** A unit box with barely softened edges, for long scaled strips (belts) that must join without seams. */
  sbox: () => once('sbox', () => new RoundedBoxGeometry(1, 1, 1, 1, 0.04)),
  /** A unit box with one bevel of soft edge: what a belt's walls and caps are, hundreds of them (44 triangles, not 300). */
  lowBox: () => once('lowBox', () => new RoundedBoxGeometry(1, 1, 1, 1, 0.14)),
  /** A box of these sizes with edges rounded by r: the radius stays true, unlike a scaled unit box. */
  rboxOf: (w: number, h: number, d: number, r = 0.06) => once('rbox' + w + 'x' + h + 'x' + d + ':' + r, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2))),
  rock: () => once('rock', () => new DodecahedronGeometry(0.5, 0)),
  torus: () => once('torus', () => new TorusGeometry(0.32, 0.1, 6, 14).rotateX(Math.PI / 2)),
  /** A short soft rope lying along X (roving). */
  rope: () => once('rope', () => new CapsuleGeometry(0.5, 1.6, 4, 8).rotateZ(Math.PI / 2)),
  /** A tuft of five blades: the meadow cell, scaled in height by what is left. */
  tuft: () =>
    once('tuft', () => {
      const parts: BufferGeometry[] = []
      const spots = [
        [0, 0],
        [0.22, 0.14],
        [-0.2, 0.18],
        [0.16, -0.22],
        [-0.18, -0.16],
        [0.3, -0.05],
        [-0.3, 0.02],
      ]
      for (const [x, z] of spots) {
        const c = new ConeGeometry(0.09, 1, 4)
        c.translate(x!, 0.5, z!)
        parts.push(c)
      }
      return mergeGeometries(parts)!
    }),
  /** A flat chevron pointing along +X, lying on the belt: two thin bars meeting at the tip. */
  chevron: () =>
    once('chevron', () => {
      const a = new BoxGeometry(0.24, 0.025, 0.07),
        b = new BoxGeometry(0.24, 0.025, 0.07)
      // rotating about Y by −45° turns a bar's +X end towards +Z: shifted to −Z, the two bars meet at the +X tip
      a.rotateY(-Math.PI / 4)
      a.translate(0, 0, -0.085)
      b.rotateY(Math.PI / 4)
      b.translate(0, 0, 0.085)
      return mergeGeometries([a, b])!
    }),
}

/** Give a geometry one flat colour as a vertex attribute, so it can be merged with parts of other colours. */
export function tint(g: BufferGeometry, color: string): BufferGeometry {
  const c = new Color(color),
    n = g.getAttribute('position').count,
    a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r
    a[i * 3 + 1] = c.g
    a[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new Float32BufferAttribute(a, 3))
  return g
}
/** Merge coloured parts into one model geometry (indexed or not, all made alike first). */
export function model(parts: BufferGeometry[]): BufferGeometry {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p))
  for (const p of flat) {
    p.deleteAttribute('uv')
    if (p.getAttribute('uv1')) p.deleteAttribute('uv1')
  }
  return mergeGeometries(flat)!
}

/** Cell centre in world units: x → X, row → Z, ground at y = 0. */
export const cx = (x: number) => x + 0.5
/** Yaw of a direction: dir 0 faces +X (east), dir 1 faces +Z (south, towards the camera). */
export const yawOf = (dir: number) => -dir * (Math.PI / 2)
export const dirVec = (d: number) => DIRS[d]!

/** Where an item sits on a belt cell at progress p: from the side it came in, through the centre, out the far side. */
export function beltPoint(b: Pick<Building, 'x' | 'y' | 'dir'>, inDir: number, p: number): [number, number] {
  const [ix, iy] = DIRS[inDir]!,
    [ox, oy] = DIRS[b.dir]!
  const c0x = b.x + 0.5 - ix * 0.5,
    c0y = b.y + 0.5 - iy * 0.5
  const c1x = b.x + 0.5,
    c1y = b.y + 0.5
  if (p < 0.5) {
    const k = p / 0.5
    return [c0x + (c1x - c0x) * k, c0y + (c1y - c0y) * k]
  }
  const k = (p - 0.5) / 0.5
  return [c1x + ox * 0.5 * k, c1y + oy * 0.5 * k]
}
