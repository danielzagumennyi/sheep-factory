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

/** The colours a coloured good is striped in, from the first (the author: «просто цветная», not one colour). */
const STRIPES = LOOK.colors

/** A ball of yarn: three wraps a shade darker — or, coloured, a ball of one colour wrapped in the others. */
const yarnBall = (c: string, wraps: readonly string[] | null) =>
  model([
    put(ball(0.17), c, [0, 0, 0]),
    put(ring(0.17, 0.028), wraps ? wraps[0]! : shade(c, 0.75), [0, 0, 0], [0.5, 0, 0]),
    put(ring(0.17, 0.028), wraps ? wraps[1]! : shade(c, 0.75), [0, 0, 0], [-0.4, 0.9, 0]),
    put(ring(0.17, 0.028), wraps ? wraps[2]! : shade(c, 0.75), [0, 0, 0], [1.3, 0.3, 0.4]),
  ])

/** A jumper laid flat, facing up: a body, two sleeves, a collar, a cuffed hem — or, coloured, in stripes. */
function sweater(c: string, stripes: readonly string[] | null) {
  const p: BufferGeometry[] = []
  if (stripes) stripes.forEach((k, i) => p.push(put(rb(0.3, 0.3 / stripes.length + 0.004, 0.1, 0.02), k, [0, 0.15 - (i + 0.5) * (0.3 / stripes.length), 0])))
  else p.push(put(rb(0.3, 0.3, 0.1, 0.05), c, [0, 0, 0]))
  const sleeve = stripes ? stripes[1]! : c
  p.push(put(rb(0.1, 0.24, 0.09, 0.04), sleeve, [-0.18, 0.02, 0], [0, 0, -0.5]), put(rb(0.1, 0.24, 0.09, 0.04), sleeve, [0.18, 0.02, 0], [0, 0, 0.5]))
  p.push(put(rb(0.12, 0.04, 0.11, 0.02), shade(stripes ? stripes[0]! : c, 0.75), [0, 0.15, 0]))
  p.push(put(rb(0.3, 0.04, 0.105, 0.02), shade(stripes ? stripes.at(-1)! : c, 0.8), [0, -0.13, 0]))
  return model(p)
}

/** A wooden spool of thread: white, or wound in bands of colour. */
function spool(c: string, bands: readonly string[] | null) {
  const p: BufferGeometry[] = [put(cyl(0.05, 0.3, 10), WOOD_DARK, [0, 0.15, 0])]
  for (const y of [0.025, 0.275]) p.push(put(cyl(0.13, 0.05, 16), WOOD, [0, y, 0]))
  if (bands) bands.forEach((k, i) => p.push(put(cyl(0.1, 0.2 / bands.length + 0.002, 16), k, [0, 0.05 + (i + 0.5) * (0.2 / bands.length), 0])))
  else p.push(put(cyl(0.1, 0.2, 16), c, [0, 0.15, 0]), put(ring(0.1, 0.012), shade(c, 0.85), [0, 0.15, 0], [Math.PI / 2, 0, 0]))
  return model(p)
}

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

// ---------------------------------------------------------------- the sheep (a round fluffy animal, like the references)

/**
 * A soft low-poly puff of wool, and a bead for the small bits (eyes' shine, blush, bell): fewer facets than `ball`, a
 * sheep is many of them and the flock may be 256 (a woolly sheep is ~3.1k triangles, the cube one was ~2.3k).
 */
const puff = (r: number) => new SphereGeometry(r, 9, 7)
const bead = (r: number) => new SphereGeometry(r, 6, 4)
/** `n` directions spread evenly round a sphere (a Fibonacci spiral), from the top down. */
function spread(n: number) {
  const out: Vector3[] = []
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n,
      r = Math.sqrt(1 - y * y),
      a = i * 2.39996
    out.push(new Vector3(Math.cos(a) * r, y, Math.sin(a) * r))
  }
  return out
}
/** A copy of `g` turned so its local +Y points along `n`, then moved to `at`. */
function along(g: BufferGeometry, n: Vector3, at: V3) {
  return g.applyQuaternion(_q.setFromUnitVectors(_p.set(0, 1, 0), n.clone().normalize())).translate(...at)
}

/**
 * The full fleece's half-widths (to the puffs' tops), and how the sweater and the curls are fitted over each fleece:
 * the woolly one, the combed one (smaller and smooth), the felted one (flatter) — `[x, y, z]` scale and the lift of its
 * middle for both, and a further scale for the curls, which sit lower on the woolly one, between its puffs.
 */
export const FLEECE: V3 = [0.37, 0.34, 0.355]
export const FLEECE_FIT = {
  fleece: { scale: [1, 1, 1], lift: 0, curls: 0.98 },
  sleek: { scale: [0.93, 0.88, 0.9], lift: 0, curls: 1 },
  felt: { scale: [0.946, 0.794, 0.93], lift: -0.03, curls: 1 },
} as const satisfies Record<string, { scale: V3; lift: number; curls: number }>

/**
 * Fleece: one big round ball of wool with soft puffs standing a little out of it (the author's reference: a big round
 * woolly body, the face small in front), and a tail tuft. Facing +X, its middle at the origin; scaled by how much wool
 * has grown.
 */
export const fleece = () =>
  cached('fleece', () => {
    const p: BufferGeometry[] = [put(new SphereGeometry(0.3, 12, 8), LOOK.wool, [0, 0, 0], [0, 0, 0], [1.1, 1, 1.05])]
    const rnd = rng(3)
    spread(15).forEach((d, i) => {
      // none under the belly, where nobody sees them
      if (d.y < -0.5) return
      const r = 0.1 + rnd() * 0.02
      p.push(put(puff(r), i % 3 ? LOOK.wool : LOOK.woolShade, [d.x * 0.25, d.y * 0.22, d.z * 0.235]))
    })
    p.push(put(puff(0.07), LOOK.wool, [-0.37, 0.06, 0]))
    return model(p)
  })

/**
 * The salon's marks on a fleece (the author, 19.10.2026: the sheep's path must show on it), drawn white and tinted per
 * sheep. A combed fleece is smooth and sleek, its combed lines running nose to tail, in place of the woolly one; the
 * bath's felted one is flat and matted, with pressed patches. Facing +X, posed like the fleece.
 */
export const fleeceSleek = () =>
  cached('fleeceSleek', () => {
    const [rx, ry, rz] = [FLEECE[0] * 0.93, FLEECE[1] * 0.88, FLEECE[2] * 0.9]
    const p: BufferGeometry[] = [put(ball(0.3), LOOK.combed, [0, 0, 0], [0, 0, 0], [rx / 0.3, ry / 0.3, rz / 0.3])]
    for (const z of [-0.2, -0.1, 0, 0.1, 0.2]) {
      const k = Math.sqrt(1 - (z / rz) ** 2) * 0.995
      // a thin raised line over the back, from the shoulder to the rump, half sunk into the coat
      const line = new TorusGeometry(1, 0.05, 4, 18, 1.75)
      line.rotateZ(0.7)
      line.scale(rx * k, ry * k, 0.5)
      p.push(tint(line.translate(0, 0, z), LOOK.combedLine))
    }
    // the sheen of a groomed coat, on the rump, where a sweater leaves it showing
    p.push(put(puff(0.1), '#ffffff', [-0.12, ry * 0.86, rz * 0.3], [0.35, 0, 0.3], [1, 0.25, 0.5]))
    // and a neat round tail
    p.push(put(puff(0.06), LOOK.combed, [-rx - 0.01, 0.05, 0]))
    return model(p)
  })
export const fleeceFelt = () =>
  cached('fleeceFelt', () => {
    const lift = FLEECE_FIT.felt.lift
    const [rx, ry, rz] = [0.35, 0.27, 0.33]
    const p: BufferGeometry[] = [put(ball(0.3), '#ffffff', [0, lift, 0], [0, 0, 0], [rx / 0.3, ry / 0.3, rz / 0.3])]
    // pressed patches, lying flat on it
    const rnd = rng(11)
    for (const d of spread(11)) {
      if (d.y < -0.15 || d.x > 0.8) continue
      const n = new Vector3(d.x / rx, d.y / ry, d.z / rz).normalize()
      // round and soft-edged: a squashed puff of few rings, many sides
      const g = new SphereGeometry(0.1 + rnd() * 0.03, 14, 5).scale(1, 0.4, 0.85)
      p.push(tint(along(g, n, [d.x * rx * 0.92, lift + d.y * ry * 0.92, d.z * rz * 0.92]), LOOK.feltPatch))
    }
    p.push(put(puff(0.06), '#ffffff', [-rx - 0.01, lift + 0.03, 0], [0, 0, 0], [1, 0.7, 1]))
    return model(p)
  })

/** Curls after the curling: little spirals all over the back and sides, sitting on the woolly fleece. */
export const fleeceCurls = () =>
  cached('fleeceCurls', () => {
    const p: BufferGeometry[] = []
    for (const d of spread(24)) {
      // not under the belly, not over the face
      if (d.y < -0.2 || (d.x > 0.62 && d.y < 0.6)) continue
      const at: V3 = [d.x * FLEECE[0] * 0.96, d.y * FLEECE[1] * 0.96, d.z * FLEECE[2] * 0.96]
      const n = new Vector3(d.x / FLEECE[0], d.y / FLEECE[1], d.z / FLEECE[2])
      p.push(tint(along(new TorusGeometry(0.05, 0.022, 4, 9).rotateX(Math.PI / 2), n, at), LOOK.curls))
      p.push(tint(along(bead(0.028), n, at), LOOK.curls))
    }
    return model(p)
  })

/**
 * A knitted jumper over the front half of the fleece, from a turtleneck round the neck (clear of the horns) to a cuff at
 * the middle: plain red with a white band, or, on a coloured sheep, in the stripes of every colour (like the coloured
 * goods). It is the fleece's own round shape a little bigger, cut short underneath so the legs show. Facing +X, posed
 * like the fleece; not tinted.
 */
function sweaterOn(bands: readonly string[], cuff: string) {
  // the back half stays out, so what else the sheep went through (curls, a combed coat) still shows
  const x0 = -0.05,
    x1 = 0.22,
    // just over the fleece, the puffs' and curls' tops inside it
    k = 1.08
  // a belt of the fleece's own ellipsoid from x = a to x = b: a sphere's belt between two polar angles, its axis turned to X
  const angle = (x: number) => Math.acos(x / FLEECE[0])
  const belt = (a: number, b: number) => new SphereGeometry(1, 22, 3, 0, Math.PI * 2, angle(b), angle(a) - angle(b)).rotateZ(-Math.PI / 2).scale(FLEECE[0] * k, FLEECE[1] * k, FLEECE[2] * k)
  const p: BufferGeometry[] = []
  const w = (x1 - x0) / bands.length
  bands.forEach((c, i) => p.push(tint(belt(x0 + i * w, x0 + (i + 1) * w), c)))
  // the cuff at the back, thick enough to reach down into the wool, and the turtleneck at the front
  for (const [x, t, sink] of [
    [x0, 0.12, 0.91],
    [x1, 0.09, 1],
  ] as const) {
    const r = Math.sin(angle(x)) * k * sink
    // thick round the sheep, narrow along it
    p.push(tint(new TorusGeometry(1, t, 5, 22).rotateY(Math.PI / 2).scale(0.13, r * FLEECE[1], r * FLEECE[2]).translate(x, 0, 0), cuff))
  }
  // the fleece has no puffs underneath: neither has the sweater
  const g = model(p),
    pos = g.getAttribute('position'),
    nor = g.getAttribute('normal'),
    n = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) >= 0) continue
    pos.setY(i, pos.getY(i) * 0.84)
    // a squashed surface's normal leans the other way: scaled by the inverse, kept smooth
    n.fromBufferAttribute(nor, i)
    n.y /= 0.84
    n.normalize()
    nor.setXYZ(i, n.x, n.y, n.z)
  }
  return g
}
export const fleeceSweater = () => cached('fleeceSweater', () => sweaterOn([LOOK.sweater, LOOK.sweater, '#ffffff', LOOK.sweater, LOOK.sweater], '#ffffff'))
export const fleeceSweaterColored = () => cached('fleeceSweaterColored', () => sweaterOn(LOOK.colors, '#ffffff'))

/** The shorn sheep's pink body, round, with a stub of a tail: as long as the first wool that grows on it. */
export const shorn = () =>
  cached('shorn', () => model([put(ball(0.2), LOOK.skin, [0, 0, 0], [0, 0, 0], [1.22, 0.92, 1.02]), put(puff(0.05), LOOK.skin, [-0.25, 0.06, 0])]))

/**
 * Head, looking along +X (the author's reference): a dark rounded face narrowing to the muzzle, big eyes with a white
 * and a shine, ears out to the sides, horns curled into spirals, a red collar with a golden tag under the chin. The wool
 * tuft on top is its own mesh, tinted like the fleece (`sheepTuft`), and so are the lids that shut the eyes for a blink
 * (`sheepLids`).
 */
export const sheepHead = () =>
  cached('sheepHead', () => {
    const face = LOOK.sheepFace
    const p: BufferGeometry[] = [put(ball(0.13), face, [0, 0, 0], [0, 0, 0], [0.95, 1, 1]), put(ball(0.1), face, [0.06, -0.07, 0], [0, 0, 0], [1, 0.82, 1.02])]
    for (const s of [-1, 1]) {
      // a big eye on each side of the front, looking up at the player above: white, pupil, shine
      p.push(put(ball(0.052), '#ffffff', [0.096, 0.025, s * 0.066], [0, s * -0.35, 0], [0.55, 1.1, 1]))
      p.push(put(ball(0.034), '#17131f', [0.122, 0.032, s * 0.068], [0, s * -0.35, 0], [0.5, 1.1, 0.95]))
      p.push(put(bead(0.012), '#ffffff', [0.138, 0.05, s * 0.06]))
      // a blush under it
      p.push(put(bead(0.03), LOOK.sheepBlush, [0.1, -0.05, s * 0.088], [0, s * -0.6, 0], [0.4, 0.65, 1]))
      // an ear out to the side and a little down, pink inside
      p.push(put(ball(0.07), face, [-0.01, -0.02, s * 0.165], [s * 0.5, 0, 0], [0.5, 0.3, 1.45]))
      p.push(put(bead(0.05), LOOK.skin, [0.004, -0.024, s * 0.172], [s * 0.5, 0, 0], [0.4, 0.18, 1.25]))
      // a horn curled into a spiral at the side of the head, its inner turn lighter
      p.push(put(new TorusGeometry(0.06, 0.027, 5, 12, Math.PI * 1.65), LOOK.sheepHorn, [-0.04, 0.06, s * 0.125], [0, 0, 0.9]))
      p.push(put(new TorusGeometry(0.026, 0.018, 4, 8, Math.PI * 1.5), shade(LOOK.sheepHorn, 1.25), [-0.04, 0.06, s * 0.13], [0, 0, 2.6]))
    }
    // the collar round the neck and its golden tag
    p.push(put(new TorusGeometry(0.125, 0.034, 4, 14), LOOK.sheepCollar, [-0.05, -0.08, 0], [0, Math.PI / 2, 0.5]))
    p.push(put(rb(0.026, 0.08, 0.07, 0.012), LOOK.sheepTag, [0.03, -0.2, 0], [0, 0, 0.35]))
    return model(p)
  })

/** The big top-knot of wool on the head (the reference's most loved bit), tinted per sheep like its fleece. Posed like the head. */
export const sheepTuft = () =>
  cached('sheepTuft', () =>
    model([
      put(puff(0.095), LOOK.wool, [0.01, 0.15, 0]),
      put(puff(0.07), LOOK.woolShade, [-0.035, 0.115, 0.06]),
      put(puff(0.07), LOOK.wool, [-0.035, 0.115, -0.06]),
      put(puff(0.06), LOOK.wool, [0.035, 0.13, 0]),
    ]),
  )

/** The lids over both eyes, in the face's colour: drawn only while a sheep blinks. Posed like the head. */
export const sheepLids = () =>
  cached('sheepLids', () => model([-1, 1].map((s) => put(ball(0.058), LOOK.sheepFace, [0.104, 0.025, s * 0.066], [0, s * -0.35, 0], [0.85, 1.12, 1.05]))))

/** Four stubby legs, tucked in under the round belly. */
export const sheepLegs = () =>
  cached('sheepLegs', () => {
    const p: BufferGeometry[] = []
    for (const [x, z] of [
      [0.12, 0.095],
      [0.12, -0.095],
      [-0.12, 0.095],
      [-0.12, -0.095],
    ] as const)
      p.push(put(cyl(0.054, 0.14, 8, 0.048), LOOK.sheepFace, [x, 0.07, z]))
    return model(p)
  })

/** Where a full-grown sheep's parts sit on its legs (sheepLook.ts poses the flock the same way). */
export const SHEEP_AT = { fleece: [-0.02, 0.33, 0], head: [0.34, 0.44, 0] } as const satisfies Record<string, V3>

/** A whole sheep in full fleece, standing still and facing a little towards the camera: its icon, and a sheep in hand. */
export const sheepModel = () =>
  cached('sheepWhole', () => {
    const g = model([sheepLegs().clone(), fleece().clone().translate(...SHEEP_AT.fleece), sheepHead().clone().translate(...SHEEP_AT.head), sheepTuft().clone().translate(...SHEEP_AT.head)])
    g.rotateY(-0.5)
    return g
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

// ---------------------------------------------------------------- the road: trucks and the market

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

/**
 * One cell of the market's row beside the field: a low wooden chute of planks along the row, with a lip on the stalls'
 * side, where a belt hands its goods over and they slide along to a stall.
 */
export const intakeBody = () =>
  cached('intake', () => {
    const p: BufferGeometry[] = [put(rb(1.0, 0.1, 0.9, 0.03), WOOD_DARK, [0, 0.05, 0])]
    for (let i = 0; i < 4; i++) p.push(put(rb(0.96, 0.035, 0.2, 0.012), i % 2 ? WOOD : shade(WOOD, 1.15), [0, 0.13 - i * 0.012, -0.32 + i * 0.22], [0.08, 0, 0]))
    p.push(put(rb(1.0, 0.1, 0.06, 0.02), shade(WOOD_DARK, 0.9), [0, 0.15, 0.44]))
    return model(p)
  })

/**
 * The market's stalls past the row, `MARKET.stallW` wide and two deep, their counter at the front by the road where
 * goods wait and from where they go into the truck parked there (STALL.counter: its top and how far forward); the
 * height goods slide along the chute at.
 */
export const STALL = { counterY: 0.45, counterZ: 0.62, chuteY: 0.14 } as const
/** Four stalls, each its own: a striped awning, a flat canopy, two parasols, a tent (the author: «4 разных»). */
export const STALL_LOOKS = 4

/**
 * What every stall stands on and sells from: a plank floor, the counter at the front, a few crates and a basket at the
 * back. Each roof covers only the back, behind the counter, so what waits on the counter is never under it.
 */
function stallBase(top: string, crate: string): BufferGeometry[] {
  const p: BufferGeometry[] = [put(rb(2.9, 0.05, 1.9, 0.02), shade(WOOD, 1.2), [0, 0.025, 0])]
  p.push(put(rb(2.6, 0.38, 0.4, 0.05), WOOD, [0, 0.21, STALL.counterZ]))
  p.push(put(rb(2.72, 0.05, 0.48, 0.02), top, [0, STALL.counterY - 0.025, STALL.counterZ]))
  const crates: [number, number][] = [
    [-1.05, -0.55],
    [-0.62, -0.62],
    [1.05, -0.58],
  ]
  for (const [x, z] of crates) {
    p.push(put(rb(0.36, 0.3, 0.34, 0.05), crate, [x, 0.17, z]))
    p.push(put(rb(0.38, 0.05, 0.36, 0.02), WOOD_DARK, [x, 0.19, z]))
  }
  return p
}
const post = (x: number, z: number, h: number) => put(cyl(0.035, h, 8), WOOD_DARK, [x, h / 2, z])

export const stallBody = (i: number) =>
  cached('stall' + i, () => {
    switch (i % STALL_LOOKS) {
      case 0: {
        // a striped awning, red and white, high at the back and sloping down to a row of scallops over the counter's back
        const p = stallBase('#f6d8a8', '#d8a663')
        for (const x of [-1.32, 1.32]) p.push(post(x, 0.32, 0.98), post(x, -0.84, 1.26))
        for (let k = 0; k < 8; k++) p.push(put(rb(0.36, 0.035, 1.24, 0.012), k % 2 ? '#ffffff' : '#e0525e', [-1.26 + k * 0.36, 1.12, -0.26], [0.22, 0, 0]))
        for (let k = 0; k < 8; k++) p.push(put(ball(0.09), k % 2 ? '#ffffff' : '#e0525e', [-1.26 + k * 0.36, 0.95, 0.36], [0, 0, 0], [1.9, 0.7, 0.5]))
        p.push(put(cyl(0.2, 0.18, 18, 0.24), '#e2c15e', [0.3, 0.12, -0.55]))
        return model(p)
      }
      case 1: {
        // a flat canopy in blue and white stripes running to the road, on four posts, with a blue valance
        const p = stallBase('#dfe8f2', '#c9a06a')
        for (const x of [-1.32, 1.32]) for (const z of [-0.84, 0.3]) p.push(post(x, z, 1.12))
        for (let k = 0; k < 7; k++) p.push(put(rb(0.42, 0.04, 1.24, 0.012), k % 2 ? '#ffffff' : '#5b8fd6', [-1.26 + k * 0.42, 1.14, -0.26]))
        p.push(put(rb(2.96, 0.12, 0.04, 0.012), '#5b8fd6', [0, 1.08, 0.36]))
        p.push(put(cyl(0.18, 0.36, 18, 0.16), WOOD, [0.2, 0.2, -0.55]))
        return model(p)
      }
      case 2: {
        // two round parasols, green and cream, over barrels
        const p = stallBase('#e8efd0', '#d3a15c')
        for (const x of [-0.72, 0.72]) {
          p.push(put(cyl(0.035, 1.2, 8), WOOD_DARK, [x, 0.6, -0.36]))
          for (let k = 0; k < 8; k++) p.push(put(new ConeGeometry(0.76, 0.26, 3, 1, true, 0, Math.PI / 4), k % 2 ? '#fff6dc' : '#5fae6a', [x, 1.22, -0.36], [0, (k / 8) * Math.PI * 2, 0]))
          p.push(put(ball(0.06), '#f2c14e', [x, 1.38, -0.36]))
        }
        p.push(put(cyl(0.17, 0.34, 18, 0.15), WOOD, [0.15, 0.19, -0.6]))
        p.push(put(cyl(0.17, 0.34, 18, 0.15), shade(WOOD, 0.9), [0.52, 0.19, -0.5]))
        return model(p)
      }
      default: {
        // a little tent: a four-sided roof of orange and yellow on four posts, a pennant on top
        const p = stallBase('#f7e3b0', '#d9a35f')
        for (const x of [-1.3, 1.3]) for (const z of [-0.82, 0.3]) p.push(post(x, z, 0.95))
        for (let k = 0; k < 4; k++) p.push(put(new ConeGeometry(1.95, 0.55, 1, 1, true, (k * Math.PI) / 2, Math.PI / 2), k % 2 ? '#ffd166' : '#f08a3c', [0, 1.22, -0.26], [0, Math.PI / 4, 0], [1, 1, 0.46]))
        p.push(put(cyl(0.02, 0.36, 6), WOOD_DARK, [0, 1.62, -0.26]))
        p.push(put(rb(0.22, 0.12, 0.02, 0.01), '#e0525e', [0.12, 1.74, -0.26]))
        p.push(put(ball(0.16), '#e9d7a8', [0.35, 0.16, -0.58], [0, 0, 0], [1, 0.9, 1]))
        p.push(put(ball(0.14), '#e2cc96', [0.68, 0.14, -0.5], [0, 0, 0], [1, 0.9, 1]))
        return model(p)
      }
    }
  })

/**
 * The trading post (the author: «отдельный блок где игрок будет именно покупать товары»): a closed wooden kiosk with a
 * window and a counter to the road, a gabled roof and a big gold coin over the window; crates of goods beside it.
 */
export const buyBody = () =>
  cached('buy', () => {
    const p: BufferGeometry[] = [put(rb(2.9, 0.05, 1.9, 0.02), STONE, [0, 0.025, 0])]
    // the kiosk: back and side walls, the front wall under and over the window
    p.push(put(rb(1.9, 0.95, 0.1, 0.03), WALL, [-0.3, 0.5, -0.55]))
    for (const x of [-1.22, 0.62]) p.push(put(rb(0.1, 0.95, 1.2, 0.03), WALL, [x, 0.5, 0.0]))
    p.push(put(rb(1.9, 0.4, 0.1, 0.03), WOOD, [-0.3, 0.22, 0.55]))
    p.push(put(rb(1.9, 0.18, 0.1, 0.03), WALL, [-0.3, 0.88, 0.55]))
    p.push(put(rb(2.0, 0.05, 0.36, 0.02), shade(WOOD, 1.25), [-0.3, 0.44, 0.66]))
    // the roof, two slopes, and its ridge
    for (const s of [-1, 1]) p.push(put(rb(2.2, 0.06, 0.82, 0.02), '#b5523b', [-0.3, 1.16, s * 0.34], [s * 0.55, 0, 0]))
    p.push(put(rb(2.22, 0.07, 0.08, 0.03), shade('#b5523b', 0.8), [-0.3, 1.38, 0]))
    // the coin over the window
    p.push(put(cyl(0.24, 0.07, 22), '#f2c14e', [-0.3, 1.1, 0.78], [Math.PI / 2, 0, 0]))
    p.push(put(cyl(0.17, 0.08, 20), '#e2a93a', [-0.3, 1.1, 0.79], [Math.PI / 2, 0, 0]))
    // crates and a sack of goods outside, east of the kiosk
    const crates: [number, number, number][] = [
      [1.05, 0.17, -0.35],
      [1.05, 0.47, -0.35],
      [1.1, 0.17, 0.2],
    ]
    for (const [x, y, z] of crates) {
      p.push(put(rb(0.36, 0.3, 0.34, 0.05), '#d8a663', [x, y, z]))
      p.push(put(rb(0.38, 0.05, 0.36, 0.02), WOOD_DARK, [x, y + 0.02, z]))
    }
    p.push(put(ball(0.15), '#e9d7a8', [1.18, 0.15, 0.62], [0, 0, 0], [1, 0.9, 1]))
    return model(p)
  })

// ---------------------------------------------------------------- goods (on belts, piles and the ground; base at y = 0)

export const good = (kind: ItemId) =>
  cached('good' + kind, () => {
    switch (kind) {
      case 'wool':
      case 'cwool': {
        // a fleece: white, or in tufts of every colour off a dyed sheep
        const c = (i: number) => (kind === 'cwool' ? STRIPES[i % STRIPES.length]! : LOOK.wool)
        return model([put(ball(0.12), c(0), [0, 0.11, 0]), put(ball(0.09), c(1), [0.1, 0.09, 0.04]), put(ball(0.09), c(2), [-0.09, 0.09, -0.03]), put(ball(0.08), c(3), [0.01, 0.18, 0.02])])
      }
      case 'thread':
      case 'cthread': {
        const g = spool(LOOK.thread, kind === 'cthread' ? STRIPES : null)
        g.scale(0.85, 0.85, 0.85)
        return g
      }
      case 'yarn':
      case 'cyarn': {
        const g = kind === 'cyarn' ? yarnBall(STRIPES[0]!, STRIPES.slice(1)) : yarnBall(LOOK.yarn, null)
        g.scale(0.72, 0.72, 0.72)
        g.translate(0, 0.125, 0)
        return g
      }
      case 'sweater':
      case 'csweater': {
        const g = sweater(LOOK.sweater, kind === 'csweater' ? STRIPES : null)
        g.rotateX(-Math.PI / 2)
        g.scale(0.9, 0.9, 0.9)
        g.translate(0, 0.05, 0)
        return g
      }
      case 'felt':
      case 'cfelt': {
        const [a, b] = kind === 'cfelt' ? [STRIPES[2]!, STRIPES[0]!] : [LOOK.felt, shade(LOOK.felt, 1.12)]
        return model([put(rb(0.3, 0.06, 0.26, 0.025), a, [0, 0.03, 0]), put(rb(0.28, 0.05, 0.24, 0.022), b, [0.01, 0.08, 0.01], [0, 0.2, 0])])
      }
      case 'dye':
        // a little pot of berry dye with a cork
        return model([put(cyl(0.1, 0.16, 16, 0.085), LOOK.dye, [0, 0.08, 0]), put(cyl(0.07, 0.03, 14), shade(LOOK.dye, 1.4), [0, 0.165, 0]), put(cyl(0.045, 0.05, 10), '#c9935a', [0, 0.19, 0])])
      case 'hay':
        return model([put(rb(0.3, 0.2, 0.22, 0.05), LOOK.hay, [0, 0.1, 0]), put(rb(0.31, 0.21, 0.03, 0.012), WOOD, [0, 0.1, -0.06]), put(rb(0.31, 0.21, 0.03, 0.012), WOOD, [0, 0.1, 0.06])])
      default:
        return model([put(ball(0.1), '#ffffff', [0, 0.1, 0])])
    }
  })

/** A ball of yarn as the knitting station's sign shows it: big, white, its wraps coloured. */
export const knitSign = () => cached('knitSign', () => yarnBall('#fff6e8', STRIPES))

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
