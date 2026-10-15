import { Color, CylinderGeometry, Euler, ExtrudeGeometry, Float32BufferAttribute, Matrix4, Shape, SphereGeometry, type BufferGeometry } from 'three'
import { LOOK, ROOF, type BuildingId } from '@/game/balance'
import { model } from './kit'
import { INKY, METAL, WOOD, WOOD_DARK, ball, cached, cone, cyl, good, put, rb, ring, shade, type V3 } from './models'

/**
 * The machines, designed like Tower Factory's (the author, 15.10.2026: «визуально дают легко понять что делает каждое
 * из них, … главное дизайн»): not houses but contraptions, each with its own silhouette and one big working part that
 * says what it does — giant shears over a striped tent, spiky carding drums, a great spinning wheel, felting stamps,
 * a windpump over a barrel, a roller mower, a berry cart with a scooping arm, a craft table with yarn and needles and
 * what it makes on a stand. They stand on cream stone plinths (the belts are wood), and a chute in the machine's colour
 * marks each output. Every part is chunky: nothing thinner than ~0.06 of a cell, no fuzz of small bits
 * (docs/04-ART.md).
 *
 * Local frame: x to the right of the screen, z towards the camera, y up, footprint centred. The bodies keep this
 * orientation whatever way a machine works, so each reads the same from the camera; its output chutes turn with it.
 * A body is one merged vertex-coloured geometry; each moving part is another, placed by `MachineSpec.parts`.
 */

/** A moving part: where it sits, how it is turned at rest (`tilt`), how it moves while the machine works. */
export type PartSpec = { geo: () => BufferGeometry; at: V3; motion: Motion; phase?: number; scale?: number; tilt?: V3 }
/** How a part moves while the machine works. */
export type Motion = 'spinX' | 'spinX-' | 'spinZ' | 'spinZ-' | 'spinY' | 'snip' | 'snip-' | 'stamp' | 'swing' | 'bob' | 'still'
export type MachineSpec = { body: BufferGeometry; top: number; parts: PartSpec[] }

const specs = new Map<string, MachineSpec>()
/**
 * A machine's body and moving parts, built once per type and lie: a 2×1 producer lies either wide (along x) or deep
 * (along z) as it is turned. `top` is where its signs float.
 */
export function machineModel(type: BuildingId, wide = true): MachineSpec {
  const k = type + (wide ? '' : ':deep')
  let s = specs.get(k)
  if (!s) {
    s = build(type, wide)
    specs.set(k, s)
  }
  return s
}
/** The whole machine still, body and parts in one geometry: the placement ghost shows it see-through. */
export const machineBody = (type: BuildingId, wide = true) =>
  cached('ghost' + type + (wide ? '' : ':deep'), () => {
    const s = machineModel(type, wide)
    const parts = s.parts.map((p) => {
      const g = p.geo().clone()
      const k = p.scale ?? 1
      g.scale(k, k, k)
      if (p.tilt) g.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...p.tilt)))
      g.translate(...p.at)
      return g
    })
    return model([s.body.clone(), ...parts])
  })

/** An output: a short stub of wooden belt coming out of the machine along +X, the way its goods leave. */
export const chute = () =>
  cached('chute', () =>
    model([
      put(rb(0.4, 0.1, 0.72, 0.035), LOOK.beltBed, [0, 0.05, 0]),
      put(rb(0.12, 0.035, 0.56, 0.015), LOOK.beltSlat, [-0.08, 0.115, 0]),
      put(rb(0.12, 0.035, 0.56, 0.015), LOOK.beltSlat, [0.1, 0.115, 0]),
      put(rb(0.4, 0.2, 0.1, 0.035), LOOK.beltWall, [0, 0.12, 0.33]),
      put(rb(0.4, 0.2, 0.1, 0.035), LOOK.beltWall, [0, 0.12, -0.33]),
    ]),
  )

// ---------------------------------------------------------------- shared pieces

const STONE_DARK = '#c9b896',
  STONE_A = '#f1e7d2',
  STONE_B = '#e6d9be'

/** A cream stone plinth of soft tiles: what every machine stands on, unlike the wooden belts. */
function plinth(w: number, d: number): BufferGeometry[] {
  const p = [put(rb(w, 0.12, d, 0.05), STONE_DARK, [0, 0.06, 0])]
  const n = Math.max(2, Math.round(w / 0.45)),
    m = Math.max(2, Math.round(d / 0.45))
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++)
      p.push(put(rb(w / n - 0.04, 0.04, d / m - 0.04, 0.02), (i + j) % 2 ? STONE_A : STONE_B, [-w / 2 + (i + 0.5) * (w / n), 0.13, -d / 2 + (j + 0.5) * (d / m)]))
  return p
}

/** A toothed gear, axis along X. */
function gear(r: number, teeth: number, color: string, t = 0.08): BufferGeometry[] {
  const p = [put(cyl(r, t, 20), color, [0, 0, 0], [0, 0, Math.PI / 2]), put(cyl(r * 0.38, t + 0.04, 12), INKY, [0, 0, 0], [0, 0, Math.PI / 2])]
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2
    p.push(put(rb(t, r * 0.36, r * 0.32, 0.025), color, [0, Math.cos(a) * r, Math.sin(a) * r], [a, 0, 0]))
  }
  return p
}

/** A carding drum, axis along X, with a few rows of big rounded teeth. */
function spikyDrum(r: number, len: number, color: string): BufferGeometry {
  const p: BufferGeometry[] = [put(cyl(r, len, 22), color, [0, 0, 0], [0, 0, Math.PI / 2])]
  for (const x of [-len / 2, len / 2]) p.push(put(cyl(r * 1.1, 0.07, 22), INKY, [x, 0, 0], [0, 0, Math.PI / 2]))
  const rows = 3,
    around = r > 0.3 ? 6 : 5,
    tooth = r > 0.3 ? 0.11 : 0.085
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < around; i++) {
      const a = (i / around) * Math.PI * 2 + (j % 2) * (Math.PI / around)
      const x = -len / 2 + (j + 0.5) * (len / rows)
      // a round-tipped cone pointing out of the drum
      p.push(put(cone(tooth, tooth * 1.6, 10), METAL, [x, Math.cos(a) * (r + tooth * 0.6), Math.sin(a) * (r + tooth * 0.6)], [a, 0, 0]))
      p.push(put(ball(tooth * 0.45), METAL, [x, Math.cos(a) * (r + tooth * 1.35), Math.sin(a) * (r + tooth * 1.35)]))
    }
  return model(p)
}

/** A round tent roof in stripes of two colours, its rim at `y`. */
function stripedTent(r: number, h: number, a: string, b: string, y: number): BufferGeometry {
  const g = cone(r, h, 16).toNonIndexed()
  g.translate(0, y + h / 2, 0)
  const pos = g.getAttribute('position'),
    col = new Float32Array(pos.count * 3),
    ca = new Color(a),
    cb = new Color(b)
  for (let t = 0; t < pos.count; t += 3) {
    const x = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3,
      z = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3
    const k = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 8) % 2 ? ca : cb
    for (let i = 0; i < 3; i++) col.set([k.r, k.g, k.b], (t + i) * 3)
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  return g
}

/** A half ball, open side up: a scoop or a bowl. */
const bowl = (r: number) => new SphereGeometry(r, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)

// ---------------------------------------------------------------- the machines

/** Move freshly built pieces by (dx, dz). */
function shift(list: BufferGeometry[], dx: number, dz: number) {
  for (const g of list) g.translate(dx, 0, dz)
  return list
}

/**
 * A 2×1 producer: the machine itself (A) and what it fills (B) side by side on one plinth — wide: A on the left, deep:
 * A in front, towards the camera. Returns the merged body and A's offset for its moving parts.
 */
function pair(wide: boolean, a: BufferGeometry[], b: BufferGeometry[], tallA = false) {
  // a tall A (the windpump's tower) goes behind when deep, so it never hides B
  const front = tallA ? -0.48 : 0.48
  const [ax, az] = wide ? [-0.48, 0] : [0, front],
    [bx, bz] = wide ? [0.48, 0] : [0, -front]
  return { body: model([...plinth(wide ? 1.84 : 0.9, wide ? 0.9 : 1.84), ...shift(a, ax, az), ...shift(b, bx, bz)]), ax, az }
}
const moved = (p: V3, dx: number, dz: number): V3 => [p[0] + dx, p[1], p[2] + dz]

function build(type: BuildingId, wide: boolean): MachineSpec {
  const c = ROOF[type]
  switch (type) {
    case 'barn': {
      // the stock's barn: red plank walls with cream corner trims under a dark gable roof, big cream-crossed doors in the
      // gable end facing the camera, a loft hatch with hay peeking out, a bale and a bucket beside it, and a weathervane
      const p = plinth(1.84, 1.84)
      const W = 1.44,
        D = 1.24,
        H = 0.76,
        y0 = 0.15,
        z0 = -0.12,
        TRIM = '#fff4e2'
      p.push(put(rb(W, H, D, 0.05), c, [0, y0 + H / 2, z0]))
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(put(rb(0.09, H + 0.02, 0.09, 0.03), TRIM, [(sx * W) / 2, y0 + H / 2, z0 + (sz * D) / 2]))
      // the gable: a red triangle the depth of the barn, a roof slab on each side of the ridge, a cream ridge board
      const rise = 0.5
      const gable = new Shape()
      gable.moveTo(-W / 2, 0)
      gable.lineTo(W / 2, 0)
      gable.lineTo(0, rise)
      gable.closePath()
      p.push(put(new ExtrudeGeometry(gable, { depth: D - 0.02, bevelEnabled: false }).translate(0, 0, -(D - 0.02) / 2), c, [0, y0 + H, z0]))
      const a = Math.atan2(rise, W / 2),
        len = Math.hypot(rise, W / 2) + 0.14
      for (const s of [-1, 1]) p.push(put(rb(len, 0.09, D + 0.16, 0.035), WOOD_DARK, [(s * W) / 4 + s * 0.02, y0 + H + rise / 2 + 0.06, z0], [0, 0, -s * a]))
      p.push(put(rb(0.12, 0.1, D + 0.2, 0.04), TRIM, [0, y0 + H + rise + 0.05, z0]))
      // the doors: a cream frame, darker red boards, a cream cross on each leaf
      const zf = z0 + D / 2 + 0.02
      p.push(put(rb(0.66, 0.6, 0.04, 0.02), TRIM, [0, y0 + 0.3, zf]))
      for (const s of [-1, 1]) {
        p.push(put(rb(0.28, 0.52, 0.04, 0.015), shade(c, 0.82), [s * 0.15, y0 + 0.3, zf + 0.012]))
        for (const r of [-1, 1]) p.push(put(rb(0.36, 0.05, 0.03, 0.012), TRIM, [s * 0.15, y0 + 0.3, zf + 0.03], [0, 0, r * 1.07]))
      }
      // the loft hatch, hay peeking out of it
      p.push(put(rb(0.3, 0.22, 0.04, 0.02), TRIM, [0, y0 + H + 0.16, zf]))
      p.push(put(rb(0.22, 0.15, 0.05, 0.02), shade(c, 0.55), [0, y0 + H + 0.16, zf + 0.01]))
      p.push(put(rb(0.2, 0.07, 0.07, 0.03), LOOK.hay, [0, y0 + H + 0.11, zf + 0.03]))
      // a bale by the door and a bucket of water
      p.push(put(rb(0.32, 0.2, 0.24, 0.05), LOOK.hay, [0.66, y0 + 0.1, 0.66]))
      p.push(put(rb(0.33, 0.21, 0.03, 0.012), WOOD, [0.66, y0 + 0.1, 0.6]))
      p.push(put(rb(0.33, 0.21, 0.03, 0.012), WOOD, [0.66, y0 + 0.1, 0.72]))
      p.push(good('water').clone().scale(1.3, 1.3, 1.3).translate(-0.66, y0, 0.66))
      return {
        body: model(p),
        top: y0 + H + rise + 0.45,
        parts: [
          {
            geo: () =>
              cached('weathervane', () =>
                model([
                  put(cyl(0.025, 0.36, 8), INKY, [0, 0.18, 0]),
                  put(ball(0.05), METAL, [0, 0.36, 0]),
                  put(rb(0.34, 0.04, 0.03, 0.012), INKY, [0, 0.3, 0]),
                  put(cone(0.06, 0.1, 4), INKY, [0.19, 0.3, 0], [0, 0, -Math.PI / 2]),
                  put(rb(0.08, 0.1, 0.02, 0.01), INKY, [-0.16, 0.3, 0]),
                ]),
              ),
            at: [0, y0 + H + rise + 0.08, z0],
            motion: 'spinY',
          },
        ],
      }
    }
    case 'carder': {
      // two big toothed drums between wooden cheeks, a hopper of fleece behind them, roving coiling out in front
      const p = plinth(1.84, 1.84)
      for (const sx of [-1, 1]) {
        p.push(put(rb(0.16, 0.9, 1.36, 0.06), WOOD, [sx * 0.78, 0.6, -0.02]))
        p.push(put(rb(0.18, 0.1, 1.42, 0.04), WOOD_DARK, [sx * 0.78, 1.07, -0.02]))
        p.push(put(cyl(0.09, 0.22, 12), INKY, [sx * 0.8, 0.7, -0.16], [0, 0, Math.PI / 2]))
        p.push(put(cyl(0.07, 0.22, 12), INKY, [sx * 0.8, 0.48, 0.44], [0, 0, Math.PI / 2]))
      }
      p.push(put(rb(1.36, 0.32, 0.38, 0.06), WOOD_DARK, [0, 1.12, -0.66]))
      // a lumpy heap of fleece in the hopper
      const fleece: [number, number, number, number][] = [
        [-0.42, 1.3, -0.68, 0.17],
        [-0.15, 1.36, -0.64, 0.2],
        [0.14, 1.33, -0.7, 0.18],
        [0.42, 1.29, -0.64, 0.16],
        [0, 1.45, -0.66, 0.14],
      ]
      for (const [x, y, z, r] of fleece) p.push(put(ball(r), LOOK.wool, [x, y, z], [0, 0, 0], [1.25, 0.8, 1]))
      p.push(put(cyl(0.24, 0.18, 18, 0.27), '#c9935a', [0.56, 0.24, 0.66]))
      p.push(put(ring(0.16, 0.08), LOOK.roving, [0.56, 0.34, 0.66], [Math.PI / 2, 0, 0]))
      return {
        body: model(p),
        top: 1.42,
        parts: [
          { geo: () => cached('carderBig', () => spikyDrum(0.38, 1.3, c)), at: [0, 0.7, -0.16], motion: 'spinX' },
          { geo: () => cached('carderSmall', () => spikyDrum(0.2, 1.3, shade(c, 1.15))), at: [0, 0.48, 0.44], motion: 'spinX-' },
          { geo: () => cached('carderGear', () => model(gear(0.3, 8, shade(c, 0.8)))), at: [0.92, 0.7, -0.16], motion: 'spinX' },
        ],
      }
    }
    case 'spinner': {
      // a great spinning wheel leaning back to face the camera, its stand, the bobbin with yarn and a ball of it
      const p = plinth(1.84, 1.84)
      p.push(put(rb(1.4, 0.12, 0.44, 0.05), WOOD, [0.15, 0.5, -0.55]))
      for (const x of [-0.45, 0.75]) for (const z of [-0.7, -0.4]) p.push(put(rb(0.09, 0.36, 0.09, 0.03), WOOD_DARK, [x, 0.32, z]))
      // the wheel's two uprights, leaning back with it
      for (const x of [-0.62, 0.12]) p.push(put(rb(0.1, 1.0, 0.1, 0.04), WOOD_DARK, [x, 0.62, 0.08], [-0.25, 0, 0]))
      p.push(put(rb(0.9, 0.08, 0.36, 0.03), WOOD_DARK, [-0.25, 0.18, 0.2]))
      p.push(put(rb(0.4, 0.06, 0.24, 0.025), WOOD, [-0.25, 0.22, 0.6], [0.2, 0, 0]))
      // the flyer's stand, and yarn
      for (const x of [0.5, 0.95]) p.push(put(rb(0.1, 0.48, 0.1, 0.04), WOOD_DARK, [x, 0.4, 0.3]))
      p.push(put(ball(0.18), LOOK.yarn, [0.75, 0.76, -0.55]))
      p.push(put(ring(0.18, 0.05), shade(LOOK.yarn, 0.8), [0.75, 0.76, -0.55], [0.5, 0, 0]))
      // the distaff: a tall stick with a fluffy bundle of wool waiting to be spun
      p.push(put(rb(0.09, 0.92, 0.09, 0.035), WOOD_DARK, [-0.8, 0.6, -0.55]))
      p.push(put(ball(0.2), LOOK.wool, [-0.8, 1.12, -0.55], [0, 0, 0], [1, 1.25, 1]))
      p.push(put(ball(0.14), LOOK.wool, [-0.72, 0.98, -0.47]))
      return {
        body: model(p),
        top: 1.62,
        parts: [
          {
            geo: () =>
              cached('spinWheel', () => {
                // a deep rim, so the wheel stays a wheel when seen from the side
                const w: BufferGeometry[] = [put(ring(0.6, 0.1), WOOD, [0, 0, 0], [0, 0, 0], [1, 1, 1.5]), put(ring(0.48, 0.06), c, [0, 0, 0], [0, 0, 0], [1, 1, 1.6])]
                for (let i = 0; i < 6; i++) w.push(put(rb(0.09, 1.08, 0.09, 0.035), WOOD_DARK, [0, 0, 0], [0, 0, (i / 6) * Math.PI]))
                w.push(put(cyl(0.15, 0.2, 16), c, [0, 0, 0], [Math.PI / 2, 0, 0]))
                return model(w)
              }),
            at: [-0.25, 0.92, 0.12],
            tilt: [-0.55, 0, 0],
            motion: 'spinZ-',
          },
          {
            geo: () => cached('bobbin', () => model([put(cyl(0.07, 0.5, 12), WOOD_DARK, [0, 0, 0], [0, 0, Math.PI / 2]), put(cyl(0.14, 0.26, 16), LOOK.yarn, [0, 0, 0], [0, 0, Math.PI / 2]), put(cyl(0.17, 0.07, 16), c, [-0.16, 0, 0], [0, 0, Math.PI / 2]), put(cyl(0.17, 0.07, 16), c, [0.16, 0, 0], [0, 0, Math.PI / 2])])),
            at: [0.72, 0.68, 0.3],
            motion: 'spinX',
          },
        ],
      }
    }
    case 'felter': {
      // a stamp mill: a tall wooden frame with a cap in the machine's colour, two heavy square stamps on long rods through
      // it that rise and drop onto cream sheets of felt in the trough below; the drive gear on the front post turns the
      // cams that lift them; a gearbox behind, finished felt stacked beside
      const p = plinth(1.84, 1.84)
      p.push(put(cyl(0.7, 0.28, 24, 0.66), WOOD_DARK, [0, 0.28, 0.3], [0, 0, 0], [1.08, 1, 0.62]))
      p.push(put(cyl(0.62, 0.06, 24), shade(WOOD_DARK, 0.8), [0, 0.42, 0.3], [0, 0, 0], [1.08, 1, 0.62]))
      for (const [x, a] of [
        [-0.32, 0.12],
        [0.3, -0.1],
      ] as const)
        p.push(put(rb(0.5, 0.07, 0.42, 0.03), LOOK.felt, [x, 0.47, 0.3], [0, a, 0]))
      // the frame: two stout posts, a guide rail and the top beam with its coloured cap
      for (const x of [-0.8, 0.8]) p.push(put(rb(0.18, 1.5, 0.2, 0.06), WOOD_DARK, [x, 0.87, 0.3]))
      p.push(put(rb(1.7, 0.12, 0.16, 0.05), WOOD, [0, 1.02, 0.3]))
      p.push(put(rb(1.84, 0.22, 0.26, 0.08), WOOD, [0, 1.58, 0.3]))
      p.push(put(rb(1.9, 0.08, 0.32, 0.035), c, [0, 1.72, 0.3]))
      // the gearbox behind
      p.push(put(rb(1.3, 0.62, 0.42, 0.1), WOOD, [0.1, 0.46, -0.52]))
      p.push(put(rb(1.34, 0.08, 0.46, 0.04), c, [0.1, 0.79, -0.52]))
      for (let i = 0; i < 3; i++) p.push(put(rb(0.36, 0.08, 0.32, 0.035), shade(LOOK.felt, 1 - i * 0.07), [-0.7, 0.2 + i * 0.085, -0.62 + i * 0.01], [0, i * 0.15, 0]))
      const stampGeo = () =>
        cached('felterStamp', () =>
          model([
            put(rb(0.36, 0.3, 0.32, 0.07), WOOD, [0, 0.15, 0]),
            put(rb(0.38, 0.07, 0.34, 0.03), INKY, [0, 0.07, 0]),
            put(rb(0.38, 0.07, 0.34, 0.03), INKY, [0, 0.25, 0]),
            put(cyl(0.075, 1.3, 12), WOOD_DARK, [0, 0.95, 0]),
            // the tappet the cam lifts it by
            put(rb(0.1, 0.08, 0.2, 0.03), METAL, [0, 0.82, 0.12]),
            put(rb(0.2, 0.08, 0.2, 0.03), INKY, [0, 1.25, 0]),
          ]),
        )
      return {
        body: model(p),
        top: 2.05,
        parts: [
          { geo: stampGeo, at: [-0.34, 0.45, 0.3], motion: 'stamp' },
          { geo: stampGeo, at: [0.34, 0.45, 0.3], motion: 'stamp', phase: Math.PI },
          { geo: () => cached('felterGear', () => model(gear(0.24, 8, shade(c, 0.85)))), at: [0.8, 1.2, 0.46], tilt: [0, Math.PI / 2, 0], motion: 'spinX' },
        ],
      }
    }
    case 'workshop': {
      // a craft workshop: on a wooden table a big ball of yarn pierced by two huge knitting needles — its silhouette —
      // spools beside it, and in front a cream stand where what it makes (the recipe) shows big
      const p = plinth(1.84, 1.84)
      p.push(put(rb(1.5, 0.42, 0.6, 0.06), WOOD, [0, 0.36, -0.48]))
      p.push(put(rb(1.56, 0.08, 0.66, 0.035), shade(WOOD, 1.2), [0, 0.6, -0.48]))
      p.push(put(rb(1.58, 0.085, 0.2, 0.03), c, [0, 0.605, -0.48]))
      // the booth: a back wall, two posts, a round awning striped mustard and cream, scalloped along the front
      p.push(put(rb(1.66, 0.9, 0.14, 0.05), WOOD_DARK, [0, 0.62, -0.84]))
      for (const x of [-0.8, 0.8]) p.push(put(rb(0.12, 1.1, 0.12, 0.04), WOOD_DARK, [x, 0.66, -0.12]))
      const STRIPES = 7
      for (let i = 0; i < STRIPES; i++)
        p.push(put(new CylinderGeometry(0.56, 0.56, 1.9 / STRIPES, 16, 1, false, 0, Math.PI), i % 2 ? LOOK.awningLight : LOOK.workshopRoof, [-0.95 + (i + 0.5) * (1.9 / STRIPES), 1.16, -0.47], [0, 0, Math.PI / 2], [1, 1, 0.62]))
      p.push(put(rb(1.94, 0.08, 0.1, 0.035), shade(LOOK.workshopRoof, 0.78), [0, 1.17, -0.12]))
      for (let i = 0; i < STRIPES; i++) p.push(put(ball(0.13), i % 2 ? LOOK.awningLight : LOOK.workshopRoof, [-0.95 + (i + 0.5) * (1.9 / STRIPES), 1.12, -0.11], [0, 0, 0], [1.05, 0.8, 0.55]))
      // its sign on the roof: a big ball of yarn with two huge knitting needles through it
      p.push(put(ball(0.32), '#6fa8f0', [-0.1, 1.66, -0.56]))
      p.push(put(ring(0.32, 0.055), shade('#6fa8f0', 0.78), [-0.1, 1.66, -0.56], [0.6, 0, 0]))
      p.push(put(ring(0.32, 0.055), shade('#6fa8f0', 0.78), [-0.1, 1.66, -0.56], [-0.3, 1.1, 0]))
      for (const tilt of [0.42, -0.32]) {
        p.push(put(cyl(0.065, 1.1, 12), METAL, [-0.1, 1.9, -0.54], [0.1, 0, tilt]))
        p.push(put(ball(0.13), '#f2c14e', [-0.1 - Math.sin(tilt) * 0.55, 1.9 + Math.cos(tilt) * 0.55, -0.54 + 0.06]))
      }
      const spools = [LOOK.cyarn, '#9fd36a', LOOK.hay]
      spools.forEach((col, i) => p.push(put(cyl(0.1, 0.19, 14), col, [0.36 + i * 0.2, 0.74, -0.4])))
      p.push(put(cyl(0.36, 0.14, 22), STONE_DARK, [0, 0.2, 0.42]))
      p.push(put(cyl(0.32, 0.07, 22), STONE_A, [0, 0.3, 0.42]))
      return { body: model(p), top: 2.3, parts: [] }
    }
    case 'shearer': {
      // a big striped tent on four stout posts that the sheep walk under, a shearing stand inside, giant chunky shears
      // standing on its top, and a basket heaped with fleece where the wool comes out
      const p = plinth(1.84, 1.84)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(put(rb(0.17, 1.02, 0.17, 0.06), WOOD_DARK, [sx * 0.74, 0.64, sz * 0.74]))
      for (const s of [-1, 1]) {
        p.push(put(rb(1.66, 0.12, 0.14, 0.05), WOOD, [0, 1.16, s * 0.74]))
        p.push(put(rb(0.14, 0.12, 1.66, 0.05), WOOD, [s * 0.74, 1.16, 0]))
      }
      p.push(stripedTent(1.1, 0.62, c, '#ffffff', 1.2))
      p.push(put(rb(0.16, 0.22, 0.16, 0.05), INKY, [0, 1.92, 0]))
      // the shearing stand
      p.push(put(rb(0.84, 0.12, 0.6, 0.05), WOOD, [0.1, 0.2, -0.1]))
      for (const x of [-0.24, 0.44]) p.push(put(rb(0.08, 0.3, 0.08, 0.03), WOOD_DARK, [x, 0.38, -0.36]))
      p.push(put(rb(0.76, 0.08, 0.08, 0.03), WOOD_DARK, [0.1, 0.52, -0.36]))
      // the fleece basket, and a few tufts on the floor
      p.push(put(cyl(0.28, 0.28, 18, 0.24), WOOD, [-0.5, 0.28, 0.5]))
      p.push(put(cyl(0.29, 0.06, 18), WOOD_DARK, [-0.5, 0.4, 0.5]))
      for (const [x, z, r] of [
        [-0.56, 0.46, 0.17],
        [-0.4, 0.56, 0.15],
        [-0.52, 0.6, 0.13],
      ] as const)
        p.push(put(ball(r), LOOK.wool, [x, 0.46, z], [0, 0, 0], [1.2, 0.85, 1]))
      for (const [x, z] of [
        [0.5, 0.5],
        [0.2, 0.6],
      ] as const)
        p.push(put(ball(0.12), LOOK.wool, [x, 0.2, z], [0, 0, 0], [1.3, 0.6, 1]))
      // one blade with its ring, pointing up and to the right (the pair opens and closes about the pivot)
      const blade = (flip: boolean) => () =>
        cached('shears' + flip, () => {
          const z = flip ? 0.05 : -0.05
          const g = model([put(rb(0.44, 0.15, 0.09, 0.045), METAL, [0.18, 0, z]), put(ball(0.075), METAL, [0.4, 0, z], [0, 0, 0], [1.3, 1, 0.6]), put(ring(0.11, 0.06), c, [-0.15, 0, z]), put(cyl(0.05, 0.12, 10), INKY, [0, 0, 0], [Math.PI / 2, 0, 0])])
          g.rotateZ(Math.PI / 4)
          return g
        })
      return {
        body: model(p),
        top: 2.35,
        parts: [
          { geo: blade(false), at: [0, 1.98, 0.04], motion: 'snip', scale: 1.6 },
          { geo: blade(true), at: [0, 1.98, 0.04], motion: 'snip-', scale: 1.6 },
        ],
      }
    }
    case 'mower': {
      // a chunky yellow mower with a big red reel in front, and a hay wagon with its load of bales beside it
      const m: BufferGeometry[] = []
      m.push(put(rb(0.66, 0.36, 0.54, 0.1), c, [0, 0.42, -0.06]))
      m.push(put(rb(0.44, 0.22, 0.34, 0.08), shade(c, 1.15), [0, 0.68, -0.1]))
      m.push(put(rb(0.36, 0.14, 0.06, 0.03), '#8fd6f0', [0, 0.7, 0.08]))
      for (const sx of [-1, 1]) {
        m.push(put(cyl(0.24, 0.14, 18), '#3b3550', [sx * 0.37, 0.3, -0.14], [0, 0, Math.PI / 2]))
        m.push(put(cyl(0.1, 0.15, 12), METAL, [sx * 0.37, 0.3, -0.14], [0, 0, Math.PI / 2]))
        m.push(put(rb(0.09, 0.2, 0.32, 0.035), INKY, [sx * 0.35, 0.28, 0.26]))
      }
      const w: BufferGeometry[] = [put(rb(0.72, 0.14, 0.62, 0.04), WOOD, [0, 0.34, 0])]
      for (const sx of [-1, 1]) w.push(put(rb(0.06, 0.24, 0.62, 0.025), WOOD_DARK, [sx * 0.34, 0.48, 0]))
      for (const sz of [-1, 1]) {
        w.push(put(cyl(0.17, 0.09, 16), WOOD_DARK, [0, 0.24, sz * 0.33], [Math.PI / 2, 0, 0]))
        w.push(put(cyl(0.07, 0.1, 12), METAL, [0, 0.24, sz * 0.33], [Math.PI / 2, 0, 0]))
      }
      const bales: [number, number, number][] = [
        [-0.16, 0.5, -0.14],
        [0.16, 0.5, -0.14],
        [-0.16, 0.5, 0.14],
        [0.16, 0.5, 0.14],
        [0, 0.7, 0],
      ]
      for (const [x, y, z] of bales) {
        w.push(put(rb(0.28, 0.18, 0.24, 0.05), LOOK.hay, [x, y, z]))
        w.push(put(rb(0.06, 0.185, 0.245, 0.02), WOOD_DARK, [x, y, z]))
      }
      const { body, ax, az } = pair(wide, m, w)
      return {
        body,
        top: 1.15,
        parts: [
          {
            geo: () =>
              cached('reel', () => {
                const r: BufferGeometry[] = [put(cyl(0.08, 0.84, 14), INKY, [0, 0, 0], [0, 0, Math.PI / 2])]
                for (const x of [-0.4, 0.4]) r.push(put(cyl(0.2, 0.06, 18), LOOK.reel, [x, 0, 0], [0, 0, Math.PI / 2]))
                for (let i = 0; i < 5; i++) {
                  const a = (i / 5) * Math.PI * 2
                  r.push(put(rb(0.82, 0.08, 0.1, 0.035), LOOK.reel, [0, Math.cos(a) * 0.16, Math.sin(a) * 0.16], [a, 0, 0]))
                }
                return model(r)
              }),
            at: moved([0, 0.3, 0.36], ax, az),
            motion: 'spinX-',
          },
        ],
      }
    }
    case 'pump': {
      // a windpump: a sturdy four-legged tower carrying a big wind wheel facing the camera, and beside it the barrel it
      // fills, with a thick pipe between them and a little trough
      const t: BufferGeometry[] = []
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) t.push(put(rb(0.11, 1.08, 0.11, 0.045), WOOD, [sx * 0.15, 0.68, sz * 0.15], [sz * 0.1, 0, -sx * 0.1]))
      for (const y of [0.44, 0.84]) t.push(put(rb(0.36, 0.08, 0.36, 0.03), WOOD_DARK, [0, y, 0]))
      t.push(put(rb(0.22, 0.18, 0.26, 0.06), INKY, [0, 1.24, 0]))
      t.push(put(rb(0.08, 0.28, 0.4, 0.035), c, [0, 1.28, -0.36]))
      t.push(put(cyl(0.09, 0.9, 12), METAL, [0, 0.6, 0]))
      const r: BufferGeometry[] = [put(cyl(0.3, 0.46, 22, 0.26), WOOD, [0, 0.38, -0.04])]
      for (const y of [0.24, 0.52]) r.push(put(cyl(0.31, 0.06, 22), INKY, [0, y, -0.04]))
      r.push(put(cyl(0.26, 0.05, 22), LOOK.waterItem, [0, 0.6, -0.04]))
      r.push(put(rb(0.46, 0.14, 0.2, 0.05), WOOD_DARK, [0, 0.23, 0.32]))
      r.push(put(rb(0.4, 0.04, 0.14, 0.02), LOOK.waterItem, [0, 0.3, 0.32]))
      const { body, ax, az } = pair(wide, t, r, true)
      // the pipe from the tower over to the barrel, a spout bent down over it and the water pouring in
      const [bx, bz] = wide ? [0.48, -0.04] : [0, 0.44]
      const pipe = [
        wide ? put(cyl(0.085, 0.9, 12), METAL, [0, 0.98, 0], [0, 0, Math.PI / 2]) : put(cyl(0.085, 0.9, 12), METAL, [0, 0.98, 0], [Math.PI / 2, 0, 0]),
        put(ball(0.11), METAL, [bx, 0.98, bz]),
        put(cyl(0.085, 0.2, 12), METAL, [bx, 0.86, bz]),
        put(cyl(0.11, 0.06, 12), INKY, [bx, 0.76, bz]),
        put(cyl(0.07, 0.16, 10, 0.06), LOOK.waterItem, [bx, 0.66, bz]),
      ]
      return {
        body: model([body, ...pipe]),
        top: 1.7,
        parts: [
          {
            geo: () =>
              cached('windWheel', () => {
                const f: BufferGeometry[] = [put(cyl(0.12, 0.14, 14), INKY, [0, 0, 0], [Math.PI / 2, 0, 0]), put(ring(0.42, 0.05), WOOD_DARK, [0, 0, 0])]
                for (let i = 0; i < 12; i++) {
                  const a = (i / 12) * Math.PI * 2
                  f.push(put(rb(0.16, 0.34, 0.06, 0.04), i % 2 ? '#ffffff' : c, [Math.sin(a) * 0.27, Math.cos(a) * 0.27, (i % 2) * 0.02], [0, 0.25, -a]))
                }
                return model(f)
              }),
            at: moved([0, 1.24, 0.2], ax, az),
            tilt: [-0.5, 0, 0],
            motion: 'spinZ',
          },
        ],
      }
    }
    case 'berry': {
      // a berry cart (big spoked wheels, a basket heaped with berries, a crane boom with a scoop that swings out to the
      // bushes) beside a big vat of purple dye
      const k: BufferGeometry[] = []
      k.push(put(rb(0.72, 0.16, 0.56, 0.05), WOOD, [0.04, 0.38, 0]))
      for (const sz of [-1, 1]) {
        k.push(put(ring(0.21, 0.06), WOOD_DARK, [0.04, 0.28, sz * 0.31]))
        for (let i = 0; i < 3; i++) k.push(put(rb(0.06, 0.4, 0.06, 0.025), WOOD_DARK, [0.04, 0.28, sz * 0.31], [0, 0, (i / 3) * Math.PI]))
        k.push(put(cyl(0.08, 0.1, 12), METAL, [0.04, 0.28, sz * 0.31], [Math.PI / 2, 0, 0]))
      }
      k.push(put(cyl(0.34, 0.28, 20, 0.27), '#c9935a', [0.1, 0.6, 0]))
      k.push(put(ring(0.34, 0.06), WOOD_DARK, [0.1, 0.74, 0], [Math.PI / 2, 0, 0]))
      const heap: V3[] = [
        [0, 0.8, 0],
        [0.16, 0.78, 0.08],
        [-0.14, 0.78, 0.1],
        [0.08, 0.78, -0.16],
        [-0.1, 0.79, -0.12],
        [0.18, 0.77, -0.06],
        [-0.18, 0.77, -0.02],
        [0.02, 0.9, 0.02],
      ]
      for (const [x, y, z] of heap) k.push(put(ball(0.1), LOOK.dye, [x + 0.1, y, z]))
      k.push(put(rb(0.16, 0.36, 0.16, 0.06), c, [-0.3, 0.58, -0.26]))
      const v: BufferGeometry[] = [put(cyl(0.34, 0.44, 22, 0.3), WOOD_DARK, [0, 0.36, 0])]
      for (const y of [0.24, 0.5]) v.push(put(cyl(0.35, 0.06, 22), INKY, [0, y, 0]))
      v.push(put(cyl(0.3, 0.05, 22), shade(LOOK.dye, 1.2), [0, 0.58, 0]))
      v.push(put(cyl(0.05, 0.6, 10), WOOD, [0.12, 0.72, 0.05], [0.3, 0, -0.5]))
      const { body, ax, az } = pair(wide, k, v)
      return {
        body,
        top: 1.25,
        parts: [
          {
            geo: () =>
              cached('boom', () =>
                model([
                  put(rb(0.66, 0.13, 0.13, 0.055), c, [0.3, 0.16, 0], [0, 0, 0.48]),
                  put(bowl(0.15), '#c9935a', [0.6, 0.27, 0]),
                  put(ring(0.15, 0.04), WOOD_DARK, [0.6, 0.27, 0], [Math.PI / 2, 0, 0]),
                  put(ball(0.08), LOOK.dye, [0.6, 0.3, 0]),
                ]),
              ),
            at: moved([-0.3, 0.76, -0.26], ax, az),
            motion: 'swing',
          },
        ],
      }
    }
    case 'splitter':
    case 'merger': {
      // the hub on its piece of belt, as the field draws it (BeltPiece in Machines.tsx), facing +X, its way out: a
      // splitter's square hub with arrows pointing out of three sides, a merger's round one with arrows pointing in
      // from three sides and one out in front. Held in hand and shown on the icon with its belt bed under it
      const split = type === 'splitter'
      const p: BufferGeometry[] = [put(rb(1.0, 0.1, 0.8, 0.035), LOOK.beltBed, [0, 0.05, 0])]
      for (let i = 0; i < 6; i++) p.push(put(rb(0.11, 0.035, 0.6, 0.015), LOOK.beltSlat, [-0.42 + i * 0.168, 0.115, 0]))
      p.push(split ? put(rb(0.5, 0.2, 0.5, 0.07), LOOK.machine, [0, 0.13, 0]) : put(cyl(0.25, 0.2, 18), LOOK.machine, [0, 0.13, 0]))
      p.push(split ? put(rb(0.52, 0.04, 0.52, 0.02), ROOF.splitter, [0, 0.24, 0]) : put(cyl(0.26, 0.04, 18), ROOF.splitter, [0, 0.24, 0]))
      const arrow = (side: number, out: boolean, at = 0.33) => {
        const a = (-side * Math.PI) / 2
        p.push(put(cone(0.07, 0.12, 10), out ? LOOK.machineEdge : LOOK.accent, [Math.cos(a) * at, 0.12, -Math.sin(a) * at], [0, a, out ? -Math.PI / 2 : Math.PI / 2]))
      }
      for (const sd of split ? [0, 1, 3] : [1, 2, 3]) arrow(sd, split)
      if (!split) arrow(0, true, 0.31)
      return { body: model(p), top: 0.3, parts: [] }
    }
    default:
      return { body: model(plinth(0.9, 0.9)), top: 0.5, parts: [] }
  }
}
