import { BufferGeometry, Color, ConeGeometry, CylinderGeometry, Euler, Float32BufferAttribute, LatheGeometry, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3 } from 'three'
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

/**
 * A bought sheep's parachute (DROP): a canopy of eight gores, red and white, with a knob on top, and four cords down to
 * where they meet on the sheep's back, the origin. `CHUTE.top` is the canopy's rim above that point.
 */
export const CHUTE = { top: 0.95, r: 0.55, back: 0.72 } as const
export const parachute = () =>
  cached('parachute', () => {
    const p: BufferGeometry[] = []
    // the canopy stops short of a half sphere: its rim flares a little
    const cut = Math.PI / 2.2
    for (let i = 0; i < 8; i++) p.push(tint(new SphereGeometry(CHUTE.r, 3, 5, (i * Math.PI) / 4, Math.PI / 4, 0, cut).scale(1, 0.62, 1).translate(0, CHUTE.top, 0), i % 2 ? '#ffffff' : LOOK.chute))
    p.push(put(bead(0.06), LOOK.chute, [0, CHUTE.top + CHUTE.r * 0.62, 0]))
    const rimR = Math.sin(cut) * CHUTE.r,
      rimY = CHUTE.top + Math.cos(cut) * CHUTE.r * 0.62
    for (let i = 0; i < 4; i++) {
      const a = (i + 0.5) * (Math.PI / 2),
        to = new Vector3(Math.cos(a) * rimR * 0.96, rimY, Math.sin(a) * rimR * 0.96)
      p.push(tint(along(cyl(0.009, to.length(), 4).translate(0, to.length() / 2, 0), to, [0, 0, 0]), LOOK.chuteCord))
    }
    return model(p)
  })

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

// ---------------------------------------------------------------- the market

/** A copy of `g` with a normal per face: a hip roof's slopes read as planes, not as a rounded cone. */
const faceted = (g: BufferGeometry) => {
  const f = g.index ? g.toNonIndexed() : g
  f.computeVertexNormals()
  return f
}

/**
 * An awning all round a square: from the inner square (half side `a`, at height `ya`) it slopes down and out to the
 * outer one (`b`, `yb`), in `n` stripes a side of two colours (n even, so they alternate round the hips); a scalloped
 * valance hangs from its edge, a tooth under each stripe. Its four sides meet along the hips.
 */
function awning(a: number, b: number, ya: number, yb: number, n: number, ca: string, cb: string): BufferGeometry[] {
  const pos: number[] = [],
    col: number[] = [],
    teeth: BufferGeometry[] = []
  const c = [new Color(ca), new Color(cb)]
  for (let d = 0; d < 4; d++) {
    const r = (d * Math.PI) / 2,
      cs = Math.cos(r),
      sn = Math.sin(r)
    // a point on the side facing +z, turned to side d
    const at = (x: number, y: number, z: number) => pos.push(x * cs + z * sn, y, -x * sn + z * cs)
    for (let i = 0; i < n; i++) {
      const k = c[i % 2]!
      const xa0 = -a + (2 * a * i) / n,
        xa1 = -a + (2 * a * (i + 1)) / n,
        xb0 = -b + (2 * b * i) / n,
        xb1 = -b + (2 * b * (i + 1)) / n
      // two triangles wound to face up and out, and the same two wound the other way, a shade darker, for its underside
      // (and for the sun's shadow pass, which draws the faces turned away from the sun)
      for (const [x, y, z] of [[xa0, ya, a], [xb0, yb, b], [xb1, yb, b], [xa0, ya, a], [xb1, yb, b], [xa1, ya, a]] as const) at(x, y, z)
      for (const [x, y, z] of [[xa0, ya, a], [xb1, yb, b], [xb0, yb, b], [xa0, ya, a], [xa1, ya, a], [xb1, yb, b]] as const) at(x, y, z)
      for (let j = 0; j < 6; j++) col.push(k.r, k.g, k.b)
      for (let j = 0; j < 6; j++) col.push(k.r * 0.85, k.g * 0.85, k.b * 0.85)
      const w = (xb1 - xb0) * 0.86
      teeth.push(put(new CylinderGeometry(w / 2, w / 2, 0.035, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), '#' + k.getHexString(), [((xb0 + xb1) / 2) * cs + b * sn, yb, -((xb0 + xb1) / 2) * sn + b * cs], [0, r, 0]))
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return [g, ...teeth]
}

/**
 * The market's hall (GDD 2, 7; the author, 21.10.2026: «большой рынок куда будут идти все товары», the stalls before
 * it «вообще не нравятся»): on a stone plinth as wide as the market, tiled round the hall, a hall with two doors on
 * every side, one at each of the market's ways in (MARKET.ports; the author: «понятные точки подключения как это
 * сделано в tower factory»). A wooden trough runs across the paving from the edge into each door, between rails in the
 * awning's coral, two posts with round caps at its mouth like a machine's way in, chevrons on its floor pointing in.
 * Goods set out under the awning between the doors; a striped awning all round; over it a low storey with shuttered
 * windows under a mint hip roof, a lantern and a gold coin on top. No signs: the clients are the HUD's (the author:
 * «товары не надо на рынке выводить, лучше просто в интерфейсе»). Low at its edges, so the farm behind it still shows.
 * `MARKET_HALL` is its size: the lower walls' square and height, the upper storey's square and height, the roof's
 * height, the plinth, where along a side the doors stand and how wide they are. Origin at its middle, on the ground.
 */
export const MARKET_HALL = { wall: 5.2, height: 1.3, upper: 4.0, up: 0.75, roof: 1.0, plinth: 0.14, port: 1.5, door: 0.86 } as const
/** How high the coin on the lantern stands: a sold good's coin pops up off it (Market.tsx). */
export const MARKET_COIN_Y = MARKET_HALL.plinth + 0.03 + MARKET_HALL.height + 0.5 + MARKET_HALL.up + MARKET_HALL.roof * 0.72 + 1.48
export const marketHall = () =>
  cached('marketHall', () => {
    const { wall: W, height: H, upper: U, up, roof: roofH, plinth: P, port: A, door: D } = MARKET_HALL
    const S = 8
    const p: BufferGeometry[] = [put(rb(S - 0.1, P, S - 0.1, 0.06), LOOK.marketStone, [0, P / 2, 0])]
    // pastel tiles on the paving round the hall, a cell each, their shades mixed — none where a trough runs
    for (let i = 0; i < S; i++)
      for (let j = 0; j < S; j++) {
        const x = i - S / 2 + 0.5,
          z = j - S / 2 + 0.5
        if (Math.max(Math.abs(x), Math.abs(z)) < 2.5) continue
        if ((Math.abs(z) >= 2.5 && Math.abs(x) === A) || (Math.abs(x) >= 2.5 && Math.abs(z) === A)) continue
        p.push(put(rb(0.9, 0.03, 0.9, 0.012), LOOK.marketTiles[(i * 7 + j * 3 + i * j) % LOOK.marketTiles.length]!, [x, P + 0.015, z]))
      }
    const y0 = P + 0.03
    // a point on side d (0 south, then east, north, west): `along` from its middle, `out` from the hall's
    const at = (d: number, along: number, out: number, y: number): V3 => {
      const r = (d * Math.PI) / 2
      return [along * Math.cos(r) + out * Math.sin(r), y, -along * Math.sin(r) + out * Math.cos(r)]
    }
    // a box on side d, turned with it (and by `yaw` more)
    const side = (d: number, along: number, out: number, w: number, h: number, y: number, t: number, color: string, yaw = 0) =>
      put(rb(w, h, t, Math.min(0.04, w / 2 - 0.003, t / 2 - 0.003)), color, at(d, along, out, y), [0, (d * Math.PI) / 2 + yaw, 0])
    // the lower walls: corner posts, the walls between and beside the two doors, over each door its lintel and a frame
    const post = 0.34,
      inner = W / 2 - post,
      dh = 0.9
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(put(rb(post, H + 0.1, post, 0.05), WOOD, [sx * (W / 2 - post / 2), y0 + (H + 0.1) / 2, sz * (W / 2 - post / 2)]))
    for (let d = 0; d < 4; d++) {
      const edge = inner - (A + D / 2)
      for (const k of [-1, 1]) {
        p.push(side(d, k * (A + D / 2 + edge / 2), W / 2 - 0.13, edge, H, y0 + H / 2, 0.26, LOOK.marketWall))
        p.push(side(d, k * A, W / 2 - 0.13, D, H - dh, y0 + dh + (H - dh) / 2, 0.26, LOOK.marketWall))
        for (const j of [-1, 1]) p.push(side(d, k * A + j * (D / 2 + 0.04), W / 2 - 0.08, 0.09, dh + 0.04, y0 + (dh + 0.04) / 2, 0.3, WOOD))
        p.push(side(d, k * A, W / 2 - 0.08, D + 0.18, 0.09, y0 + dh + 0.03, 0.3, WOOD))
        // the dim inside, seen through the door
        p.push(side(d, k * A, W / 2 - 0.3, D, dh, y0 + dh / 2, 0.04, LOOK.marketInside))
        // the way in: a trough from the paving's edge into the door, coral rails, two capped posts at its mouth, and
        // cream chevrons on its floor pointing in
        const len = S / 2 - (W / 2 - 0.05),
          mid = (S / 2 + W / 2 - 0.05) / 2
        p.push(side(d, k * A, mid, 0.62, 0.05, y0 + 0.03, len, WOOD_DARK))
        for (const j of [-1, 1]) {
          p.push(side(d, k * A + j * 0.34, mid, 0.08, 0.14, y0 + 0.1, len, LOOK.marketAwning[0]))
          p.push(side(d, k * A + j * 0.42, S / 2 - 0.16, 0.14, 0.5, y0 + 0.25, 0.14, WOOD))
          p.push(put(ball(0.11), LOOK.marketAwning[0], at(d, k * A + j * 0.42, S / 2 - 0.16, y0 + 0.54), [0, 0, 0], [1, 0.8, 1]))
        }
        for (const c of [S / 2 - 0.45, S / 2 - 0.95])
          for (const j of [-1, 1]) p.push(side(d, k * A + j * 0.1, c + 0.1, 0.06, 0.02, y0 + 0.065, 0.3, LOOK.marketAwning[1], j * (Math.PI / 4)))
      }
      // goods set out under the awning between the doors: a crate of wool and a sack
      p.push(side(d, -0.35, W / 2 + 0.24, 0.42, 0.36, y0 + 0.18, 0.36, '#d8a663'))
      p.push(side(d, -0.35, W / 2 + 0.24, 0.44, 0.05, y0 + 0.35, 0.38, WOOD_DARK))
      p.push(put(ball(0.21), '#e9d7a8', at(d, 0.3, W / 2 + 0.26, y0 + 0.18), [0, 0, 0], [1, 0.95, 1]))
    }
    // the band at the walls' top, under the awning
    p.push(put(rb(W + 0.1, 0.14, W + 0.1, 0.04), WOOD, [0, y0 + H, 0]))
    // the awning all round, from the upper storey's foot out past the lower walls
    const aTop = y0 + H + 0.5,
      aOut = W / 2 + 0.55
    p.push(...awning(U / 2, aOut, aTop, y0 + H - 0.15, 14, ...LOOK.marketAwning))
    // the upper storey: its walls from inside the lower ones up past the awning, wooden corners, a band at the top, and
    // two windows with coral shutters on each side
    const uy = aTop + up / 2 - 0.25
    p.push(put(rb(U, up + 0.5, U, 0.05), LOOK.marketWall, [0, uy, 0]))
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(put(rb(0.2, up + 0.5, 0.2, 0.04), WOOD, [sx * (U / 2 - 0.06), uy, sz * (U / 2 - 0.06)]))
    const wy = aTop + up / 2
    for (let d = 0; d < 4; d++)
      for (const k of [-1, 1]) {
        p.push(side(d, k * 0.95, U / 2 + 0.005, 0.5, 0.42, wy, 0.03, WOOD))
        p.push(side(d, k * 0.95, U / 2 + 0.02, 0.4, 0.32, wy, 0.03, GLASS))
        for (const j of [-1, 1]) p.push(side(d, k * 0.95 + j * 0.33, U / 2 + 0.02, 0.14, 0.4, wy, 0.04, LOOK.marketAwning[0]))
      }
    const top = aTop + up
    p.push(put(rb(U + 0.12, 0.12, U + 0.12, 0.03), WOOD, [0, top - 0.04, 0]))
    // the hip roof: a four-sided pyramid with a little overhang, and a darker band along its eaves
    const half = U / 2 + 0.22
    // lighter towards the top, so its wide slopes read round the light rather than flat; a ridge along each hip
    p.push(tintUp(faceted(new ConeGeometry(half * Math.SQRT2, roofH, 4, 1).rotateY(Math.PI / 4)).translate(0, top + roofH / 2, 0), shade(LOOK.marketRoof, 0.9), shade(LOOK.marketRoof, 1.12), top, top + roofH))
    p.push(put(rb(2 * half + 0.06, 0.09, 2 * half + 0.06, 0.03), LOOK.marketRoofEave, [0, top + 0.02, 0]))
    const hip = Math.hypot(half * Math.SQRT2, roofH)
    for (let d = 0; d < 4; d++) {
      const a = Math.PI / 4 + (d * Math.PI) / 2,
        v = new Vector3(-Math.sin(a) * half * Math.SQRT2, roofH, -Math.cos(a) * half * Math.SQRT2).normalize()
      const g = rb(0.13, hip, 0.13, 0.05).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), v))
      p.push(put(g, LOOK.marketRoofEave, [(Math.sin(a) * half * Math.SQRT2) / 2, top + roofH / 2 + 0.03, (Math.cos(a) * half * Math.SQRT2) / 2]))
    }
    // the lantern on the roof: a little house with windows, its own roof, and a gold coin on a pole
    // (it stands where the roof is narrower than it, so its walls and windows clear the slopes)
    const ly = top + roofH * 0.72
    p.push(put(rb(0.9, 0.5, 0.9, 0.06), LOOK.marketWall, [0, ly + 0.25, 0]))
    for (let d = 0; d < 4; d++) p.push(put(rb(0.34, 0.2, 0.04, 0.02), GLASS, [Math.sin((d * Math.PI) / 2) * 0.46, ly + 0.3, Math.cos((d * Math.PI) / 2) * 0.46], [0, (d * Math.PI) / 2, 0]))
    p.push(tint(faceted(new ConeGeometry(0.8, 0.5, 4, 1).rotateY(Math.PI / 4)).translate(0, ly + 0.75, 0), LOOK.marketRoof))
    p.push(put(cyl(0.025, 0.3, 6), INKY, [0, ly + 1.1, 0]))
    p.push(put(cyl(0.27, 0.08, 24).rotateX(Math.PI / 2), LOOK.marketCoin, [0, MARKET_COIN_Y, 0]))
    p.push(put(cyl(0.18, 0.09, 24).rotateX(Math.PI / 2), shade(LOOK.marketCoin, 0.86), [0, MARKET_COIN_Y, 0]))
    // a round bush in a pot at each corner of the paving
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const c: V3 = [sx * (S / 2 - 0.55), y0, sz * (S / 2 - 0.55)]
        p.push(put(cyl(0.22, 0.3, 14, 0.27), '#d9825b', [c[0], y0 + 0.15, c[2]]))
        p.push(put(ball(0.32), '#7cc457', [c[0], y0 + 0.5, c[2]]))
      }
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

