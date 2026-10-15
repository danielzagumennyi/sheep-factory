import type { BufferGeometry } from 'three'
import { Color, ConeGeometry, CylinderGeometry, Euler, LatheGeometry, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { LOOK, type ItemId } from '@/game/balance'
import { model, tint } from './kit'

/**
 * Model builders: every prop is a few soft primitives merged into one vertex-coloured geometry (one draw call, or one
 * instanced mesh for many), in the look of the author's reference dioramas (15.10.2026). The machines have their own
 * file (machineModels.ts). Models sit on the ground at y = 0, footprint centred.
 */

export type V3 = readonly [number, number, number]
const _m = new Matrix4(),
  _q = new Quaternion(),
  _e = new Euler(),
  _p = new Vector3(),
  _s = new Vector3()

/** A copy of `g` moved, turned and scaled, in one colour. */
export function put(g: BufferGeometry, color: string, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) {
  const c = g.clone()
  _m.compose(_p.set(...p), _q.setFromEuler(_e.set(...r)), _s.set(...s))
  c.applyMatrix4(_m)
  return tint(c, color)
}

/** A rounded box; the radius is kept below half the smallest side. */
// small parts get fewer facets: nobody sees the difference, and a petal no longer costs as much as a tree
export const rb = (w: number, h: number, d: number, r = 0.05) => new RoundedBoxGeometry(w, h, d, Math.min(w, h, d) < 0.15 ? 1 : 2, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002))
export const cyl = (r: number, h: number, n = 16, r2 = r) => new CylinderGeometry(r2, r, h, Math.max(r, r2) < 0.07 ? Math.min(n, 8) : Math.max(r, r2) < 0.15 ? Math.min(n, 12) : n)
export const ball = (r: number) => {
  const n = r < 0.05 ? 6 : r < 0.1 ? 8 : r < 0.2 ? 12 : 16
  return new SphereGeometry(r, n, Math.max(4, Math.round(n * 0.7)))
}
export const cone = (r: number, h: number, n = 14) => new ConeGeometry(r, h, n)
export const ring = (r: number, t: number) => new TorusGeometry(r, t, 8, 20)

/** Model geometries are built once and shared. */
const partsCache = new Map<string, BufferGeometry>()
export const cached = (k: string, make: () => BufferGeometry) => {
  let g = partsCache.get(k)
  if (!g) {
    g = make()
    partsCache.set(k, g)
  }
  return g
}

export const WOOD = '#b9773f',
  WOOD_DARK = '#8a5530',
  WALL = '#f8efdc',
  STONE = '#cfc7b9',
  GLASS = '#8fd6f0',
  METAL = '#dfe6ee',
  INKY = '#3a3550'

/** A darker or lighter version of a colour (k < 1 darker). */
export function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1))))
  const r = f((n >> 16) & 255),
    g = f((n >> 8) & 255),
    b = f(n & 255)
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

/** A workshop's product, shown big on its stand so the recipe reads from afar (and, smaller, as a good). */
export const product = (kind: ItemId) =>
  cached('product' + kind, () => {
    const c: string = { sweater: LOOK.sweater, valenki: LOOK.valenki, cyarn: LOOK.cyarn, yarn: LOOK.yarn }[kind as string] ?? '#ffffff'
    switch (kind) {
      case 'sweater':
        return model([
          put(rb(0.3, 0.3, 0.1, 0.05), c, [0, 0, 0]),
          put(rb(0.1, 0.24, 0.09, 0.04), c, [-0.18, 0.02, 0], [0, 0, -0.5]),
          put(rb(0.1, 0.24, 0.09, 0.04), c, [0.18, 0.02, 0], [0, 0, 0.5]),
          put(rb(0.12, 0.04, 0.11, 0.02), shade(c, 0.75), [0, 0.15, 0]),
          put(rb(0.3, 0.04, 0.105, 0.02), shade(c, 0.8), [0, -0.13, 0]),
        ])
      case 'valenki':
        return model([0, 1].flatMap((i) => [put(rb(0.11, 0.3, 0.12, 0.05), c, [i * 0.14 - 0.07, 0, 0]), put(rb(0.11, 0.1, 0.22, 0.05), c, [i * 0.14 - 0.07, -0.1, 0.06])]))
      default:
        // a ball of yarn: three wraps a shade darker
        return model([
          put(ball(0.17), c, [0, 0, 0]),
          put(ring(0.17, 0.028), shade(c, 0.75), [0, 0, 0], [0.5, 0, 0]),
          put(ring(0.17, 0.028), shade(c, 0.75), [0, 0, 0], [-0.4, 0.9, 0]),
          put(ring(0.17, 0.028), shade(c, 0.75), [0, 0, 0], [1.3, 0.3, 0.4]),
        ])
    }
  })


// ---------------------------------------------------------------- nature (instanced: one geometry per kind)

/** Colour a geometry from `c0` at its foot to `c1` at its top. */
export function tintUp(g: BufferGeometry, c0: string, c1: string, y0: number, y1: number) {
  tint(g, c0)
  const a = new Color(c0),
    b = new Color(c1),
    p = g.getAttribute('position'),
    col = g.getAttribute('color'),
    c = new Color()
  for (let i = 0; i < p.count; i++) {
    c.copy(a).lerp(b, Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0))))
    col.setXYZ(i, c.r, c.g, c.b)
  }
  return g
}

/** A stable pseudo-random sequence for a seed, for model variety. */
function rng(seed: number) {
  let s = seed * 9301 + 49297
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280)
}

/** A pine of three soft tiers on a short trunk (refs: pack 3's rounded conifers). Height ≈ 1.9. */
export const pine = (v: number) =>
  cached('pine' + v, () => {
    const r = rng(11 + v)
    const p: BufferGeometry[] = [put(cyl(0.09, 0.4, 10, 0.11), WOOD, [0, 0.2, 0])]
    // three soft tiers: each a lathe with a rounded, slightly drooping rim
    for (let i = 0; i < 3; i++) {
      const rad = 0.56 - i * 0.14 + r() * 0.04,
        h = 0.62 - i * 0.07,
        y = 0.3 + i * 0.4
      const prof = [
        new Vector2(0.001, h),
        new Vector2(rad * 0.25, h * 0.86),
        new Vector2(rad * 0.62, h * 0.45),
        new Vector2(rad * 0.94, h * 0.12),
        new Vector2(rad, h * 0.03),
        new Vector2(rad * 0.9, -h * 0.04),
        new Vector2(rad * 0.5, -h * 0.02),
        new Vector2(0.001, 0),
      ]
      // bottom to top, as a lathe wants for outward faces
      const g = new LatheGeometry(prof.reverse(), 16)
      tintUp(g, LOOK.pineDark, LOOK.pine, 0, h)
      _m.compose(_p.set(0, y, 0), _q.setFromEuler(_e.set(0, r() * 3, 0)), _s.set(1, 1, 1))
      g.applyMatrix4(_m)
      p.push(g)
    }
    return model(p)
  })

/** A rounded grey boulder with a smaller stone beside it. */
export const boulder = (v: number) =>
  cached('boulder' + v, () => {
    const r = rng(37 + v)
    const p: BufferGeometry[] = []
    const a = new SphereGeometry(0.34, 14, 10)
    tintUp(a, LOOK.rockDark, LOOK.rock, -0.2, 0.3)
    a.scale(1.15, 0.78, 1)
    a.translate(0, 0.24, 0)
    p.push(a)
    const b = new SphereGeometry(0.17, 12, 8)
    tintUp(b, LOOK.rockDark, LOOK.rock, -0.1, 0.15)
    b.scale(1.1, 0.75, 1)
    b.translate(0.3 + r() * 0.05, 0.1, 0.18)
    p.push(b)
    return model(p)
  })

/** A berry bush without its berries (those come and go with the stock): three leafy lobes. */
export const bushBody = () =>
  cached('bush', () => {
    const p: BufferGeometry[] = []
    const lobes: [number, number, number, number][] = [
      [0, 0.26, 0, 0.3],
      [0.17, 0.2, 0.1, 0.22],
      [-0.17, 0.2, 0.08, 0.22],
      [0.02, 0.2, -0.17, 0.22],
    ]
    for (const [x, y, z, rad] of lobes) {
      const g = new SphereGeometry(rad, 16, 12)
      tintUp(g, LOOK.leafDark, LOOK.bush, -rad, rad)
      g.translate(x, y, z)
      p.push(g)
    }
    return model(p)
  })

/**
 * A meadow cell (hay to mow): four sheaves of thick straw spikes, green at the foot and gold at the tips, on tilled
 * soil (Ground.tsx paints it) — chunky, never a fuzz of thin blades. Height ≈ 0.6 (scaled down as it is mown).
 */
export const grassClump = (v: number) =>
  cached('grass' + v, () => {
    const r = rng(53 + v)
    const p: BufferGeometry[] = []
    const spots: [number, number][] = [
      [-0.22, -0.2],
      [0.23, -0.17],
      [-0.2, 0.23],
      [0.22, 0.24],
    ]
    for (const [cx, cz] of spots) {
      p.push(put(ball(0.13), LOOK.meadowBase, [cx, 0.03, cz], [0, 0, 0], [1, 0.5, 1]))
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + r() * 0.6,
          lean = i === 0 ? 0.05 : 0.32
        const g = new SphereGeometry(0.065, 5, 4)
        g.scale(1, 3.6, 1)
        g.translate(0, 0.23, 0)
        tintUp(g, LOOK.meadowBase, LOOK.meadowEar, 0.02, 0.4)
        _m.compose(_p.set(cx + (i ? Math.cos(a) * 0.05 : 0), 0, cz + (i ? Math.sin(a) * 0.05 : 0)), _q.setFromEuler(_e.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean)), _s.set(1, 0.85 + r() * 0.3, 1))
        g.applyMatrix4(_m)
        p.push(g)
      }
    }
    return model(p)
  })

// ---------------------------------------------------------------- the sheep (a cube animal, like the references)

/** Fleece: a soft white block with curls on top. Facing +X; scaled by how much wool has grown. */
export const fleece = () =>
  cached('fleece', () => {
    // a big woolly body, the head small beside it (the author: «сделай овцам меньше морду и больше само тело»)
    const p: BufferGeometry[] = [put(rb(0.56, 0.42, 0.5, 0.17), LOOK.wool, [0, 0, 0])]
    const curls: V3[] = [
      [0.13, 0.19, 0.12],
      [-0.13, 0.19, -0.11],
      [-0.1, 0.2, 0.13],
      [0.14, 0.19, -0.12],
    ]
    for (const c of curls) p.push(put(ball(0.09), LOOK.wool, c, [0, 0, 0], [1, 0.6, 1]))
    return model(p)
  })

/** The shorn sheep's pink body. */
export const shorn = () => cached('shorn', () => model([put(rb(0.44, 0.3, 0.36, 0.13), LOOK.skin, [0, 0, 0])]))

/** Head with big eyes, ears and a woolly fringe, looking along +X. */
export const sheepHead = () =>
  cached('sheepHead', () => {
    const face = LOOK.sheepFace
    const p: BufferGeometry[] = [put(rb(0.3, 0.29, 0.32, 0.11), face, [0, 0, 0])]
    p.push(put(rb(0.18, 0.09, 0.28, 0.045), LOOK.wool, [-0.03, 0.16, 0]))
    for (const s of [-1, 1]) {
      // a big eye on each front corner: white, pupil, highlight
      p.push(put(ball(0.095), '#ffffff', [0.13, 0.06, s * 0.1], [0, 0, 0], [0.75, 1, 0.75]))
      p.push(put(ball(0.06), '#141220', [0.18, 0.055, s * 0.11], [0, 0, 0], [0.6, 1, 0.6]))
      p.push(put(ball(0.022), '#ffffff', [0.2, 0.085, s * 0.1]))
      // ear
      p.push(put(rb(0.11, 0.06, 0.14, 0.025), face, [-0.03, 0.08, s * 0.21], [s * 0.5, 0, 0]))
      p.push(put(rb(0.07, 0.03, 0.09, 0.012), LOOK.skin, [-0.025, 0.095, s * 0.215], [s * 0.5, 0, 0]))
    }
    // a little pink nose
    p.push(put(ball(0.03), '#e98aa5', [0.155, -0.07, 0], [0, 0, 0], [0.6, 0.7, 1.2]))
    return model(p)
  })

/** Four short legs and a tail tuft. */
export const sheepLegs = () =>
  cached('sheepLegs', () => {
    const p: BufferGeometry[] = []
    for (const [x, z] of [
      [0.15, 0.12],
      [0.15, -0.12],
      [-0.15, 0.12],
      [-0.15, -0.12],
    ] as const)
      p.push(put(rb(0.08, 0.16, 0.08, 0.03), LOOK.sheepFace, [x, 0.08, z]))
    return model(p)
  })

// ---------------------------------------------------------------- decor (scattered on free land)

/** Three five-petal flowers of one colour on stems, with broad leaves. */
export const flowers = (color: string) =>
  cached('flowers' + color, () => {
    const p: BufferGeometry[] = []
    // short stems (the author: «цветы сделать ниже, стебель уменьши раза в 2»)
    const spots: [number, number, number][] = [
      [0, 0, 0.15],
      [0.13, 0.08, 0.11],
      [-0.1, 0.1, 0.12],
    ]
    for (const [x, z, h] of spots) {
      p.push(put(cyl(0.03, h, 8), LOOK.stem, [x, h / 2, z]))
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        p.push(put(ball(0.045), color, [x + Math.cos(a) * 0.05, h, z + Math.sin(a) * 0.05], [0, -a, 0], [1, 0.45, 0.75]))
      }
      p.push(put(ball(0.03), LOOK.flowerHeart, [x, h + 0.015, z], [0, 0, 0], [1, 0.6, 1]))
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4
      p.push(put(ball(0.07), LOOK.leafDark, [Math.cos(a) * 0.1, 0.04, Math.sin(a) * 0.1], [0, -a, 0.5], [1.6, 0.3, 0.7]))
    }
    return model(p)
  })

/** A red toadstool with white spots and a small brother. */
export const mushroom = () =>
  cached('mushroom', () => {
    const p: BufferGeometry[] = []
    for (const [x, z, k] of [
      [0, 0, 1],
      [0.12, 0.08, 0.65],
    ] as const) {
      p.push(put(cyl(0.035 * k, 0.12 * k, 8), '#f6ecd6', [x, 0.06 * k, z]))
      const cap = new SphereGeometry(0.09 * k, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2)
      p.push(put(cap, '#e8473f', [x, 0.11 * k, z], [0, 0, 0], [1, 0.75, 1]))
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2
        p.push(put(ball(0.016 * k), '#ffffff', [x + Math.cos(a) * 0.055 * k, 0.15 * k, z + Math.sin(a) * 0.055 * k]))
      }
    }
    return model(p)
  })

// ---------------------------------------------------------------- the road: trucks, docks, the market

/** A chunky little lorry facing +X: rounded cab with windows, a cream cargo box with a stripe, fat wheels. */
export const truckBody = () =>
  cached('truck', () => {
    const cab = LOOK.truckCab
    const p: BufferGeometry[] = [
      // an open cargo box: floor and four sides
      put(rb(1.0, 0.1, 0.66, 0.04), LOOK.truck, [-0.14, 0.3, 0]),
      put(rb(1.0, 0.36, 0.09, 0.04), LOOK.truck, [-0.14, 0.5, 0.29]),
      put(rb(1.0, 0.36, 0.09, 0.04), LOOK.truck, [-0.14, 0.5, -0.29]),
      put(rb(0.09, 0.36, 0.66, 0.04), LOOK.truck, [-0.6, 0.5, 0]),
      put(rb(0.09, 0.36, 0.66, 0.04), LOOK.truck, [0.32, 0.5, 0]),
      put(rb(1.02, 0.08, 0.68, 0.03), cab, [-0.14, 0.27, 0]),
      put(rb(0.42, 0.46, 0.62, 0.12), cab, [0.6, 0.42, 0]),
      put(rb(0.06, 0.2, 0.48, 0.03), GLASS, [0.8, 0.52, 0]),
      put(rb(0.2, 0.17, 0.06, 0.03), GLASS, [0.62, 0.53, 0.3]),
      put(rb(0.2, 0.17, 0.06, 0.03), GLASS, [0.62, 0.53, -0.3]),
      put(rb(0.1, 0.12, 0.66, 0.04), INKY, [0.8, 0.2, 0]),
      put(rb(1.34, 0.06, 0.6, 0.03), INKY, [0.06, 0.2, 0]),
    ]
    for (const z of [-0.2, 0.2]) p.push(put(ball(0.045), '#fff3b0', [0.82, 0.32, z], [0, 0, 0], [0.5, 1, 1]))
    for (const x of [-0.42, 0.06, 0.6])
      for (const z of [-0.31, 0.31]) {
        p.push(put(cyl(0.14, 0.1, 16), '#2b2a36', [x, 0.14, z], [Math.PI / 2, 0, 0]))
        p.push(put(cyl(0.06, 0.11, 12), METAL, [x, 0.14, z], [Math.PI / 2, 0, 0]))
      }
    return model(p)
  })

/** A 2×1 loading platform of planks, with stacks of crates at its back. */
export const dockBody = () =>
  cached('dock', () => {
    const p: BufferGeometry[] = [put(rb(1.9, 0.12, 0.88, 0.035), WOOD_DARK, [0, 0.06, 0])]
    for (let i = 0; i < 7; i++) p.push(put(rb(0.25, 0.035, 0.9, 0.014), i % 2 ? WOOD : shade(WOOD, 1.15), [-0.78 + i * 0.26, 0.13, 0]))
    const crates: [number, number, number, number][] = [
      [-0.64, 0.29, -0.24, 0],
      [-0.3, 0.29, -0.26, 0.2],
      [-0.48, 0.55, -0.25, 0.4],
      [0.66, 0.29, -0.24, -0.15],
    ]
    for (const [x, y, z, r] of crates) {
      p.push(put(rb(0.32, 0.28, 0.3, 0.05), '#d8a663', [x, y, z], [0, r, 0]))
      p.push(put(rb(0.34, 0.05, 0.32, 0.02), WOOD_DARK, [x, y, z], [0, r, 0]))
    }
    return model(p)
  })

/** The market: a 2×2 stall — stone floor, a long counter of goods under a pink-striped awning on four posts, crates. */
export const marketBody = () =>
  cached('market', () => {
    const p: BufferGeometry[] = [put(rb(1.9, 0.1, 1.86, 0.04), STONE, [0, 0.05, 0])]
    p.push(put(rb(1.6, 0.4, 0.5, 0.05), WOOD, [0, 0.3, 0.28]))
    p.push(put(rb(1.66, 0.06, 0.56, 0.03), shade(WOOD, 1.25), [0, 0.53, 0.28]))
    for (const x of [-0.84, 0.84]) for (const z of [-0.72, 0.5]) p.push(put(rb(0.1, 1.3, 0.1, 0.04), WOOD_DARK, [x, 0.7, z]))
    for (let i = 0; i < 8; i++) p.push(put(rb(0.24, 0.06, 1.5, 0.025), i % 2 ? '#ffffff' : LOOK.accent, [-0.84 + i * 0.24, 1.3, -0.1], [0.22, 0, 0]))
    for (let i = 0; i < 8; i++) p.push(put(ball(0.12), i % 2 ? '#ffffff' : LOOK.accent, [-0.84 + i * 0.24, 1.14, 0.62], [0, 0, 0], [1, 0.7, 0.6]))
    // goods on the counter
    const goods: [string, number][] = [
      [LOOK.hay, -0.56],
      [LOOK.cyarn, -0.2],
      [LOOK.wool, 0.16],
      [LOOK.sweater, 0.52],
    ]
    for (const [c, x] of goods) p.push(put(ball(0.15), c, [x, 0.68, 0.28]))
    // crates and a barrel behind
    p.push(put(rb(0.4, 0.34, 0.36, 0.05), '#d8a663', [-0.5, 0.27, -0.44]))
    p.push(put(rb(0.42, 0.05, 0.38, 0.02), WOOD_DARK, [-0.5, 0.27, -0.44]))
    p.push(put(cyl(0.2, 0.42, 18, 0.18), WOOD, [0.46, 0.31, -0.44]))
    p.push(put(ball(0.14), LOOK.dye, [0.46, 0.55, -0.44]))
    // a gold coin sign on the front post
    p.push(put(cyl(0.18, 0.06, 20), '#f2c14e', [0, 1.62, 0.5], [Math.PI / 2, 0, 0]))
    p.push(put(rb(0.06, 0.24, 0.06, 0.02), WOOD_DARK, [0, 1.42, 0.5]))
    return model(p)
  })

// ---------------------------------------------------------------- goods (on belts, piles and the ground; base at y = 0)

export const good = (kind: ItemId) =>
  cached('good' + kind, () => {
    switch (kind) {
      case 'wool':
        return model([put(ball(0.12), LOOK.wool, [0, 0.11, 0]), put(ball(0.09), LOOK.wool, [0.1, 0.09, 0.04]), put(ball(0.09), LOOK.wool, [-0.09, 0.09, -0.03]), put(ball(0.08), LOOK.wool, [0.01, 0.18, 0.02])])
      case 'roving': {
        // a fat white rope of combed wool, coiled, with twist marks
        const p: BufferGeometry[] = [put(new TorusGeometry(0.11, 0.075, 10, 20), LOOK.roving, [0, 0.075, 0], [Math.PI / 2, 0, 0])]
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          p.push(put(rb(0.03, 0.16, 0.05, 0.012), shade(LOOK.roving, 0.84), [Math.cos(a) * 0.11, 0.08, Math.sin(a) * 0.11], [0, -a, 0.6]))
        }
        return model(p)
      }
      case 'yarn':
      case 'cyarn': {
        const g = product(kind).clone()
        g.scale(0.72, 0.72, 0.72)
        g.translate(0, 0.125, 0)
        return g
      }
      case 'sweater': {
        const g = product('sweater').clone()
        g.rotateX(-Math.PI / 2)
        g.scale(0.9, 0.9, 0.9)
        g.translate(0, 0.05, 0)
        return g
      }
      case 'valenki': {
        const g = product('valenki').clone()
        g.scale(0.8, 0.8, 0.8)
        g.translate(0, 0.2, -0.04)
        return g
      }
      case 'felt':
        return model([put(rb(0.3, 0.06, 0.26, 0.025), LOOK.felt, [0, 0.03, 0]), put(rb(0.28, 0.05, 0.24, 0.022), shade(LOOK.felt, 1.12), [0.01, 0.08, 0.01], [0, 0.2, 0])])
      case 'dye':
        // a little pot of berry dye with a cork
        return model([put(cyl(0.1, 0.16, 16, 0.085), LOOK.dye, [0, 0.08, 0]), put(cyl(0.07, 0.03, 14), shade(LOOK.dye, 1.4), [0, 0.165, 0]), put(cyl(0.045, 0.05, 10), '#c9935a', [0, 0.19, 0])])
      case 'hay':
        return model([put(rb(0.3, 0.2, 0.22, 0.05), LOOK.hay, [0, 0.1, 0]), put(rb(0.31, 0.21, 0.03, 0.012), WOOD, [0, 0.1, -0.06]), put(rb(0.31, 0.21, 0.03, 0.012), WOOD, [0, 0.1, 0.06])])
      case 'water':
        // a wooden bucket of water (the author: «капли воды замени на ведра»): two dark hoops, a metal handle
        return model([
          put(cyl(0.085, 0.16, 16, 0.11), '#c98f55', [0, 0.08, 0]),
          put(cyl(0.09, 0.02, 16, 0.093), '#6b5444', [0, 0.04, 0]),
          put(cyl(0.101, 0.02, 16, 0.104), '#6b5444', [0, 0.125, 0]),
          // brimful, so the water shows from the side too
          put(cyl(0.104, 0.03, 16, 0.108), LOOK.waterItem, [0, 0.158, 0]),
          put(ball(0.02), '#ffffff', [-0.04, 0.175, 0.03]),
          put(new TorusGeometry(0.105, 0.011, 6, 14, Math.PI), '#9aa3ad', [0, 0.155, 0]),
        ])
      default:
        return model([put(ball(0.1), '#ffffff', [0, 0.1, 0])])
    }
  })

// ---------------------------------------------------------------- the island's rim

/** One span of the rim fence along X: a post at its start and two rails to the next post. */
export const fenceSpan = () =>
  cached('fenceSpan', () =>
    model([
      put(rb(0.11, 0.42, 0.11, 0.035), WOOD, [-0.5, 0.21, 0]),
      put(ball(0.06), WOOD, [-0.5, 0.42, 0], [0, 0, 0], [1, 0.6, 1]),
      put(rb(1.0, 0.06, 0.05, 0.02), shade(WOOD, 1.15), [0, 0.15, 0]),
      put(rb(1.0, 0.06, 0.05, 0.02), shade(WOOD, 1.15), [0, 0.3, 0]),
    ]),
  )

/** A lone fence post, to close the end of a run of spans. */
export const fencePost = () =>
  cached('fencePost', () => model([put(rb(0.11, 0.42, 0.11, 0.035), WOOD, [0, 0.21, 0]), put(ball(0.06), WOOD, [0, 0.42, 0], [0, 0, 0], [1, 0.6, 1])]))

/** A soft paving tile. */
export const tile = () => cached('tile', () => model([put(rb(0.44, 0.05, 0.42, 0.04), '#ffffff', [0, 0.025, 0])]))
