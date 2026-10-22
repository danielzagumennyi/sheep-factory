import { Color, ConeGeometry, CylinderGeometry, Euler, LatheGeometry, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3, type BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { LOOK } from '@/game/balance'
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

/**
 * How finely models are built: 1 as drawn up close. The flock seen from far off is built plain (`plain`): half the
 * facets round each part, so about a quarter of the triangles, the smallest bits (an eye's shine, a blush) left off —
 * a sheep there is a few dozen pixels tall, and the flock's triangles were half the frame's. Plain models are cached
 * apart.
 */
let detail = 1
/** How many of its facets round a part keeps when built plain. */
const PLAIN = 0.5
/** Build `make` plain (sheepLook.ts: the flock from far off). */
export function plain<T>(make: () => T): T {
  const was = detail
  detail = PLAIN
  try {
    return make()
  } finally {
    detail = was
  }
}
/** `n` facets round, fewer when built plain, never under `least`. */
const seg = (n: number, least = 3) => (detail === 1 ? n : Math.max(least, Math.round(n * detail)))
/** The smallest bits are drawn: not when built plain. */
const fine = () => detail === 1

/** A rounded box; the radius is kept below half the smallest side. */
// small parts get fewer facets: nobody sees the difference, and a petal no longer costs as much as a tree
export const rb = (w: number, h: number, d: number, r = 0.05) => new RoundedBoxGeometry(w, h, d, Math.min(w, h, d) < 0.15 ? 1 : 2, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002))
export const cyl = (r: number, h: number, n = 16, r2 = r) => new CylinderGeometry(r2, r, h, seg(Math.max(r, r2) < 0.07 ? Math.min(n, 8) : Math.max(r, r2) < 0.15 ? Math.min(n, 12) : n, 5))
/** A ball, its facets by its size; `keep`: as many when built plain (an eye, which a few facets turn to a dark blot). */
export const ball = (r: number, keep = false) => {
  const n = r < 0.05 ? 6 : r < 0.1 ? 8 : r < 0.2 ? 12 : 16,
    h = Math.max(4, Math.round(n * 0.7))
  return new SphereGeometry(r, keep ? n : seg(n, 4), keep ? h : seg(h))
}
export const cone = (r: number, h: number, n = 14) => new ConeGeometry(r, h, n)
export const ring = (r: number, t: number) => new TorusGeometry(r, t, 8, 20)

/** Model geometries are built once and shared. */
const partsCache = new Map<string, BufferGeometry>()
export const cached = (k: string, make: () => BufferGeometry) => {
  const key = fine() ? k : k + ':plain'
  let g = partsCache.get(key)
  if (!g) {
    g = make()
    partsCache.set(key, g)
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
 * A meadow cell (only to look at): four sheaves of thick straw spikes, green at the foot and gold at the tips, on tilled
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
 * sheep is many of them and the flock may be SHEEP.most (a woolly sheep is ~3.6k triangles, ~1k built plain).
 */
const puff = (r: number) => new SphereGeometry(r, seg(9, 4), seg(7))
const bead = (r: number) => new SphereGeometry(r, seg(6, 4), seg(4))
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
 * The full fleece's half-widths (to the puffs' tops), and how the shadow lump and the burrs and mud are fitted over each
 * fleece: the woolly one and the tangled one (flatter under its clumps) — `[x, y, z]` scale and the lift of its middle,
 * and a further scale for what sits on it.
 */
export const FLEECE: V3 = [0.37, 0.34, 0.355]
export const FLEECE_FIT = {
  fleece: { scale: [1, 1, 1], lift: 0, burrs: 0.98 },
  felt: { scale: [0.946, 0.794, 0.93], lift: -0.03, burrs: 1 },
} as const satisfies Record<string, { scale: V3; lift: number; burrs: number }>

/**
 * Fleece: one big round ball of wool with soft puffs standing a little out of it (the author's reference: a big round
 * woolly body, the face small in front), and a tail tuft. Facing +X, its middle at the origin; scaled by how much wool
 * has grown.
 */
export const fleece = () =>
  cached('fleece', () => {
    const p: BufferGeometry[] = [put(new SphereGeometry(0.3, seg(12, 4), seg(8)), LOOK.wool, [0, 0, 0], [0, 0, 0], [1.1, 1, 1.05])]
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
 * A tangled sheep's fleece (GDD 5: «шерсть клочьями»): a flatter matted ball, and big clumps of wool sticking out of it
 * well past its round outline — on the back, the sides and the rump — so its shape is shaggy, the opposite of combed.
 * White, tinted per sheep (sheepLook.ts) a matted cream.
 */
export const fleeceFelt = () =>
  cached('fleeceFelt', () => {
    const lift = FLEECE_FIT.felt.lift
    const [rx, ry, rz] = [0.35, 0.27, 0.33]
    const p: BufferGeometry[] = [put(ball(0.3), '#ffffff', [0, lift, 0], [0, 0, 0], [rx / 0.3, ry / 0.3, rz / 0.3])]
    const rnd = rng(11)
    for (const d of spread(14)) {
      if (d.y < -0.35 || d.x > 0.7) continue
      const n = new Vector3(d.x / rx, d.y / ry, d.z / rz).normalize()
      // a clump: a soft puff leaning out along the surface's normal, its tip a fifth to a third out of the outline
      const r = 0.055 + rnd() * 0.02
      const g = new SphereGeometry(r, seg(9, 5), seg(6, 4)).scale(1, 1.6, 1).translate(0, r * 0.7, 0)
      p.push(tint(along(g, n, [d.x * rx * 0.9, lift + d.y * ry * 0.9, d.z * rz * 0.9]), LOOK.feltPatch))
    }
    p.push(put(puff(0.06), '#ffffff', [-rx - 0.01, lift + 0.03, 0], [0, 0, 0], [1, 0.7, 1]))
    return model(p)
  })

/**
 * Mud on a dirty sheep (GDD 5: «грязь пятнами»): flat round splashes lying on its back and sides, over a white fleece.
 * White, tinted per sheep (sheepLook.ts) the mud's brown.
 */
export const fleeceMud = () =>
  cached('fleeceMud', () => {
    const p: BufferGeometry[] = []
    const rnd = rng(17)
    for (const d of spread(20)) {
      if (d.y < -0.25 || (d.x > 0.62 && d.y < 0.6)) continue
      const n = new Vector3(d.x / FLEECE[0], d.y / FLEECE[1], d.z / FLEECE[2]).normalize()
      const r = 0.035 + rnd() * 0.04
      const g = new SphereGeometry(r, seg(12, 6), seg(4, 2)).scale(1, 0.3, 0.8 + rnd() * 0.4)
      p.push(tint(along(g, n, [d.x * FLEECE[0] * 0.95, d.y * FLEECE[1] * 0.95, d.z * FLEECE[2] * 0.95]), '#ffffff'))
    }
    return model(p)
  })

/**
 * Burrs stuck in the fleece of a sheep with burrs (GDD 5): little knobbly balls all over its back and sides, sitting on
 * the woolly fleece, three round beads standing out of each (no sharp points: docs/04-ART.md). White, tinted per sheep
 * (sheepLook.ts) the burrs' brown.
 */
export const fleeceBurrs = () =>
  cached('fleeceBurrs', () => {
    const p: BufferGeometry[] = []
    for (const d of spread(18)) {
      // not under the belly, not over the face
      if (d.y < -0.2 || (d.x > 0.62 && d.y < 0.6)) continue
      const at: V3 = [d.x * FLEECE[0] * 0.98, d.y * FLEECE[1] * 0.98, d.z * FLEECE[2] * 0.98]
      const n = new Vector3(d.x / FLEECE[0], d.y / FLEECE[1], d.z / FLEECE[2]).normalize()
      p.push(tint(along(bead(0.04), n, at), '#ffffff'))
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        p.push(tint(along(bead(0.02).translate(Math.cos(a) * 0.034, 0.022, Math.sin(a) * 0.034), n, at), '#ffffff'))
      }
    }
    return model(p)
  })

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
      p.push(put(ball(0.052, true), '#ffffff', [0.096, 0.025, s * 0.066], [0, s * -0.35, 0], [0.55, 1.1, 1]))
      p.push(put(ball(0.034, true), '#17131f', [0.122, 0.032, s * 0.068], [0, s * -0.35, 0], [0.5, 1.1, 0.95]))
      if (fine()) p.push(put(bead(0.012), '#ffffff', [0.138, 0.05, s * 0.06]))
      // a blush under it
      if (fine()) p.push(put(bead(0.03), LOOK.sheepBlush, [0.1, -0.05, s * 0.088], [0, s * -0.6, 0], [0.4, 0.65, 1]))
      // an ear out to the side and a little down, pink inside
      p.push(put(ball(0.07), face, [-0.01, -0.02, s * 0.165], [s * 0.5, 0, 0], [0.5, 0.3, 1.45]))
      if (fine()) p.push(put(bead(0.05), LOOK.skin, [0.004, -0.024, s * 0.172], [s * 0.5, 0, 0], [0.4, 0.18, 1.25]))
      // a horn curled into a spiral at the side of the head, its inner turn lighter
      p.push(put(new TorusGeometry(0.06, 0.027, seg(5, 4), seg(12), Math.PI * 1.65), LOOK.sheepHorn, [-0.04, 0.06, s * 0.125], [0, 0, 0.9]))
      if (fine()) p.push(put(new TorusGeometry(0.026, 0.018, 4, 8, Math.PI * 1.5), shade(LOOK.sheepHorn, 1.25), [-0.04, 0.06, s * 0.13], [0, 0, 2.6]))
    }
    // the collar round the neck and its golden tag
    p.push(put(new TorusGeometry(0.125, 0.034, seg(4, 4), seg(14)), LOOK.sheepCollar, [-0.05, -0.08, 0], [0, Math.PI / 2, 0.5]))
    if (fine()) p.push(put(rb(0.026, 0.08, 0.07, 0.012), LOOK.sheepTag, [0.03, -0.2, 0], [0, 0, 0.35]))
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
 * An arriving sheep's parachute (DROP): a canopy of eight gores, red and white, with a knob on top, and four cords down to
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

/**
 * What a sheep's shadow is cast by, in place of its own many parts (the flock's shadow cost as much as the flock): a few
 * plain low lumps the size of the drawn ones, never seen themselves. The fleece's body, posed like the fleece (fitted to
 * the salon's kind); the shorn body; the head with its muzzle, ears, horns and top-knot, posed like the head. The shadow
 * map keeps their far sides: no bigger than the bodies drawn, so a fleece's underside stays in its own shade.
 */
export const sheepShade = () => cached('sheepShade', () => model([put(new SphereGeometry(0.3, 10, 6), LOOK.wool, [0, 0, 0], [0, 0, 0], [1.1, 1, 1.05])]))
export const sheepShadeSkin = () => cached('sheepShadeSkin', () => model([put(new SphereGeometry(0.2, 8, 5), LOOK.skin, [0, 0, 0], [0, 0, 0], [1.22, 0.92, 1.02])]))
export const sheepShadeHead = () =>
  cached('sheepShadeHead', () => {
    const lump = (r: number, at: V3, rot: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) => put(new SphereGeometry(r, 6, 4), LOOK.sheepFace, at, rot, s)
    const p = [put(new SphereGeometry(0.13, 8, 5), LOOK.sheepFace, [0, 0, 0], [0, 0, 0], [0.95, 1, 1]), lump(0.1, [0.06, -0.07, 0], [0, 0, 0], [1, 0.82, 1.02]), lump(0.095, [0.01, 0.15, 0])]
    for (const s of [-1, 1]) p.push(lump(0.07, [-0.01, -0.02, s * 0.165], [s * 0.5, 0, 0], [0.5, 0.3, 1.45]), lump(0.075, [-0.04, 0.06, s * 0.125], [0, 0, 0], [1, 1, 0.45]))
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

// ---------------------------------------------------------------- the portal

/**
 * The portal (GDD 7): on a stone plinth as wide as the portal, tiled round the middle, a round dais with an upright
 * stone ring on it, facing the camera's side, runes set round it glowing; the swirl inside the ring is its own mesh,
 * turning (Portal.tsx). A wooden trough runs across the paving from the edge towards the dais at each of its ways in
 * (PORTAL.ports; the author: «понятные точки подключения как это сделано в tower factory»), between coral rails, two
 * posts with round caps at its mouth like a machine's way in, chevrons on its floor pointing in. `PORTAL_RING` is the
 * ring: its middle's height, its radius, its tube. Origin at its middle, on the ground.
 */
export const PORTAL_MODEL = { plinth: 0.14, port: 1.5, dais: 2.35, daisH: 0.26 } as const
export const PORTAL_RING = { y: PORTAL_MODEL.plinth + PORTAL_MODEL.daisH + 1.75, r: 1.5, tube: 0.26 } as const
/** How high a coin pops off the portal: over the ring's top (Portal.tsx). */
export const PORTAL_COIN_Y = PORTAL_RING.y + PORTAL_RING.r + 0.5
export const portalModel = () =>
  cached('portalModel', () => {
    const { plinth: P, port: A, dais: R, daisH } = PORTAL_MODEL
    const S = 8
    const p: BufferGeometry[] = [put(rb(S - 0.1, P, S - 0.1, 0.06), LOOK.plazaStone, [0, P / 2, 0])]
    // pastel tiles on the paving round the dais, a cell each, their shades mixed — none where a trough runs
    for (let i = 0; i < S; i++)
      for (let j = 0; j < S; j++) {
        const x = i - S / 2 + 0.5,
          z = j - S / 2 + 0.5
        if (Math.hypot(x, z) < R + 0.3) continue
        if ((Math.abs(z) >= 2.5 && Math.abs(x) === A) || (Math.abs(x) >= 2.5 && Math.abs(z) === A)) continue
        p.push(put(rb(0.9, 0.03, 0.9, 0.012), LOOK.plazaTiles[(i * 7 + j * 3 + i * j) % LOOK.plazaTiles.length]!, [x, P + 0.015, z]))
      }
    const y0 = P + 0.03
    // a point on side d (0 south, then east, north, west): `along` from its middle, `out` from the portal's
    const at = (d: number, along: number, out: number, y: number): V3 => {
      const r = (d * Math.PI) / 2
      return [along * Math.cos(r) + out * Math.sin(r), y, -along * Math.sin(r) + out * Math.cos(r)]
    }
    // a box on side d, turned with it (and by `yaw` more)
    const side = (d: number, along: number, out: number, w: number, h: number, y: number, t: number, color: string, yaw = 0) =>
      put(rb(w, h, t, Math.min(0.04, w / 2 - 0.003, t / 2 - 0.003)), color, at(d, along, out, y), [0, (d * Math.PI) / 2 + yaw, 0])
    for (let d = 0; d < 4; d++)
      for (const k of [-1, 1]) {
        // the way in: a trough from the paving's edge to the dais, coral rails, two capped posts at its mouth, and cream
        // chevrons on its floor pointing in
        const inner = Math.sqrt(Math.max(0, (R + 0.1) ** 2 - A * A)),
          len = S / 2 - inner,
          mid = (S / 2 + inner) / 2
        p.push(side(d, k * A, mid, 0.62, 0.05, y0 + 0.03, len, WOOD_DARK))
        for (const j of [-1, 1]) {
          p.push(side(d, k * A + j * 0.34, mid, 0.08, 0.14, y0 + 0.1, len, LOOK.plazaTrim[0]))
          p.push(side(d, k * A + j * 0.42, S / 2 - 0.16, 0.14, 0.5, y0 + 0.25, 0.14, WOOD))
          p.push(put(ball(0.11), LOOK.plazaTrim[0], at(d, k * A + j * 0.42, S / 2 - 0.16, y0 + 0.54), [0, 0, 0], [1, 0.8, 1]))
        }
        for (const c of [S / 2 - 0.45, S / 2 - 0.95])
          for (const j of [-1, 1]) p.push(side(d, k * A + j * 0.1, c + 0.1, 0.06, 0.02, y0 + 0.065, 0.3, LOOK.plazaTrim[1], j * (Math.PI / 4)))
      }
    // the dais: a round step and its top
    p.push(put(cyl(R, daisH * 0.5, 40), shade(LOOK.portalStone, 0.92), [0, P + daisH * 0.25, 0]))
    p.push(put(cyl(R - 0.25, daisH * 0.5, 40), LOOK.portalStone, [0, P + daisH * 0.75, 0]))
    // the ring standing up, facing the south, on two feet; runes round it
    const { y: ry, r: rr, tube } = PORTAL_RING
    p.push(put(new TorusGeometry(rr, tube, 10, 40), LOOK.portalStone, [0, ry, 0]))
    p.push(put(new TorusGeometry(rr - tube * 0.9, tube * 0.35, 6, 40), shade(LOOK.portalStone, 0.8), [0, ry, 0]))
    for (const sx of [-1, 1]) p.push(put(rb(0.5, ry - rr - P - daisH + 0.35, 0.7, 0.1), shade(LOOK.portalStone, 0.88), [sx * 0.85, P + daisH + (ry - rr - P - daisH + 0.35) / 2, 0]))
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 10
      p.push(put(rb(0.16, 0.16, 0.06, 0.03), LOOK.portalRune, [Math.cos(a) * rr, ry + Math.sin(a) * rr, tube * 0.95], [0, 0, a]))
      p.push(put(rb(0.16, 0.16, 0.06, 0.03), LOOK.portalRune, [Math.cos(a) * rr, ry + Math.sin(a) * rr, -tube * 0.95], [0, 0, a]))
    }
    // a gem at the top of the ring
    p.push(put(ball(0.2), LOOK.portalRune, [0, ry + rr + tube * 0.6, 0], [0, 0, 0], [0.8, 1.2, 0.8]))
    // a round bush in a pot at each corner of the paving
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const c: V3 = [sx * (S / 2 - 0.55), y0, sz * (S / 2 - 0.55)]
        p.push(put(cyl(0.22, 0.3, 14, 0.27), '#d9825b', [c[0], y0 + 0.15, c[2]]))
        p.push(put(ball(0.32), '#7cc457', [c[0], y0 + 0.5, c[2]]))
      }
    return model(p)
  })

/** A shorn sheep standing (its legs, the pink body, the head and top-knot), for one going into the portal (Portal.tsx). */
export const shornSheepModel = () =>
  cached('shornSheep', () => model([sheepLegs().clone(), shorn().clone().translate(SHEEP_AT.fleece[0], 0.22, 0), sheepHead().clone().translate(SHEEP_AT.head[0] - 0.057, SHEEP_AT.head[1] - 0.076, 0), sheepTuft().clone().translate(SHEEP_AT.head[0] - 0.057, SHEEP_AT.head[1] - 0.076, 0)]))

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

