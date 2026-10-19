import { Color, Euler, Float32BufferAttribute, Matrix4, SphereGeometry, type BufferGeometry } from 'three'
import { DIRS, LOOK, PEN, ROOF, type BuildingId, type Dir } from '@/game/balance'
import { entryOf, exitOf } from '@/game/world'
import { model } from './kit'
import { INKY, METAL, WOOD, WOOD_DARK, ball, cached, cone, cyl, good, knitSign, put, rb, ring, shade, sheepModel, type V3 } from './models'

/**
 * The machines, designed like Tower Factory's (the author, 15.10.2026: «визуально дают легко понять что делает каждое
 * из них, … главное дизайн»): not houses but contraptions, each with its own silhouette and one big working part that
 * says what it does — giant shears over a striped tent, a hay manger over a trough, a tub of dye rocking over a vat, a
 * big brush and a giant comb, a salon's dryer hood and curlers, a ball of yarn with huge knitting needles, a little log
 * bathhouse puffing steam, a roller mower, a berry cart with a scooping arm, a seed spreader by its sacks. The salon's
 * stations are arches the sheep walk under (the author's salon, 19.10.2026). They stand on cream stone plinths (the belts are wood), and the model itself says where
 * goods go in and out (the author, 16.10.2026, as the pasture's open gates do): a funnel tray between two capped posts
 * at the way in, a chute sloping down to the edge with what it makes on it at the way out (`inlet`, `outlet`, on the
 * cells of grid.ts `machineIns` / `outCells`). A station on the sheep loop lets the sheep through by two gates, as the
 * pen does, and takes its hay or dye by a tray on its right. Every part is chunky: nothing thinner than ~0.06 of a cell, no fuzz of small
 * bits (docs/04-ART.md).
 *
 * Local frame: x to the right of the screen, z towards the camera, y up, footprint centred. A model is built facing
 * south (dir 1, towards the camera at the start) and the whole of it turns with its building (`machineYaw`): a 2×1 lies
 * along z, the machine on its back cell and what it fills on its front cell, where its output is. A body is one merged
 * vertex-coloured geometry; each moving part is another, placed by `MachineSpec.parts`.
 */

/** A moving part: where it sits, how it is turned at rest (`tilt`), how it moves while the machine works. */
export type PartSpec = { geo: () => BufferGeometry; at: V3; motion: Motion; phase?: number; scale?: number; tilt?: V3 }
/** How a part moves while the machine works. */
export type Motion = 'spinX' | 'spinX-' | 'spinZ' | 'spinZ-' | 'spinY' | 'snip' | 'snip-' | 'swing' | 'bob' | 'still'
export type MachineSpec = { body: BufferGeometry; top: number; parts: PartSpec[] }

const specs = new Map<string, MachineSpec>()
/** A machine's body and moving parts, built once per type. `top` is where its signs float. */
export function machineModel(type: BuildingId): MachineSpec {
  let s = specs.get(type)
  if (!s) {
    s = build(type)
    specs.set(type, s)
  }
  return s
}
/** The whole machine still, body and parts in one geometry: the placement ghost shows it see-through. */
export const machineBody = (type: BuildingId) =>
  cached('ghost' + type, () => {
    const s = machineModel(type)
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

/** A brush drum, axis along X, with a few rows of big rounded teeth. */
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

/** How far from the middle a port sits: on the footprint's edge, just past the plinth, where it meets the belt. */
const EDGE = 0.95

/**
 * The way in, on the edge goods come in by: a low tray whose walls open out like a gate's leaves swung in (wide at the
 * edge, narrow at the machine), between two posts with round caps in the machine's colour. Built for goods coming in
 * along +z, its mouth on z = 0.
 */
function inlet(c: string, depth = 0.34): BufferGeometry[] {
  const a = Math.atan2(0.14, depth)
  const p = [put(rb(0.66, 0.05, depth, 0.02), WOOD_DARK, [0, 0.17, depth / 2])]
  for (const s of [-1, 1]) {
    p.push(put(rb(0.09, 0.18, Math.hypot(depth, 0.14), 0.04), LOOK.fenceRail, [s * 0.29, 0.27, depth / 2], [0, -s * a, 0]))
    p.push(put(rb(0.15, 0.6, 0.15, 0.05), LOOK.fence, [s * 0.4, 0.3, 0.075]))
    p.push(put(ball(0.12), c, [s * 0.4, 0.63, 0.075], [0, 0, 0], [1, 0.8, 1]))
  }
  return p
}

/**
 * The way out, on the edge goods leave by: a wooden chute sloping down from `top` to the edge, its walls in the
 * machine's colour, one of what it makes lying at its lip. Built pointing +z, its lip on z = 0.
 */
function outlet(c: string, good: BufferGeometry | null, len = 0.4, top = 0.36): BufferGeometry[] {
  const lip = 0.2,
    a = Math.asin((top - lip) / len),
    y = (top + lip) / 2
  const p = [put(rb(0.42, 0.06, len, 0.025), WOOD, [0, y, -len / 2], [a, 0, 0])]
  for (const s of [-1, 1]) p.push(put(rb(0.09, 0.19, len, 0.04), c, [s * 0.245, y + 0.07, -len / 2], [a, 0, 0]))
  // the block its upper end rests on
  p.push(put(rb(0.38, top - 0.12, 0.12, 0.03), WOOD_DARK, [0, 0.12 + (top - 0.12) / 2, -len + 0.08]))
  if (good) {
    const g = good.clone()
    g.scale(1.25, 1.25, 1.25).rotateX(a)
    g.translate(0, lip + 0.03 + 0.16 * Math.sin(a), -0.16)
    p.push(g)
  }
  return p
}

/** A gate's leaf, as the pasture's (Pastures.tsx), on a plinth: two rails and a stile at its free end, from its hinge along +x. */
const leaf = (len: number) => [
  put(rb(len, 0.08, 0.07, 0.03), LOOK.fenceRail, [len / 2, 0.31, 0]),
  put(rb(len, 0.08, 0.07, 0.03), LOOK.fenceRail, [len / 2, 0.52, 0]),
  put(rb(0.09, 0.32, 0.08, 0.03), LOOK.fenceRail, [len - 0.045, 0.415, 0]),
  put(rb(len - 0.06, 0.06, 0.06, 0.025), LOOK.fenceRail, [len / 2, 0.415, 0], [0, 0, 0.6]),
]

// ---------------------------------------------------------------- the pen

/** A pen's gates: how far each leaf stands open from the fence line (radians), how long it is. */
const GATE = { open: 1.1, leaf: 0.9 } as const

/**
 * A pen, the same in the field and in hand when it is being placed (the author: the two were different), built facing
 * south (dir 1) and centred like every model: its way out in the middle of the front, its way in in the middle of the
 * east side (grid.ts exitOf / entryOf). A lawn with a trodden rim inside the fence, a post at every cell corner round
 * it with two rails between, a gate hung in each gap and swung open the way the sheep go — out at the exit, in at the
 * entry — and a few wisps of straw and pebbles on the floor.
 */
function penBody(): BufferGeometry[] {
  const N = PEN.size,
    o = N / 2
  const pen = { x: 0, y: 0, w: N, h: N, dir: 1 as Dir }
  const ex = exitOf(pen),
    en = entryOf(pen)
  // each gap: the two posts it lies between (cell corners) and the way the sheep go through it
  const gap = (cx: number, cy: number, side: number, d: number) =>
    side === 0
      ? { ax: cx + 1, az: cy, bx: cx + 1, bz: cy + 1, d }
      : side === 2
        ? { ax: cx, az: cy, bx: cx, bz: cy + 1, d }
        : side === 1
          ? { ax: cx, az: cy + 1, bx: cx + 1, bz: cy + 1, d }
          : { ax: cx, az: cy, bx: cx + 1, bz: cy, d }
  const [dx, dy] = DIRS[pen.dir]!,
    [ix, iy] = DIRS[en.d]!
  const gates = [gap(ex.x - dx, ex.y - dy, pen.dir, pen.dir), gap(en.x + ix, en.y + iy, (en.d + 2) % 4, en.d)]
  const p: BufferGeometry[] = [put(rb(N - 0.08, 0.04, N - 0.08, 0.02), LOOK.pasture, [0, 0.02, 0])]
  for (const [x, z, sx, sz] of [
    [0, -o + 0.12, N - 0.1, 0.18],
    [0, o - 0.12, N - 0.1, 0.18],
    [-o + 0.12, 0, 0.18, N - 0.1],
    [o - 0.12, 0, 0.18, N - 0.1],
  ] as const)
    p.push(put(rb(sx, 0.02, sz, 0.01), LOOK.penRim, [x, 0.045, z]))
  // a post at every cell corner round the edge, two rails between neighbours, none across a gate
  const posts: [number, number][] = []
  for (let i = 0; i <= N; i++) posts.push([i, 0], [i, N])
  for (let j = 1; j < N; j++) posts.push([0, j], [N, j])
  const has = new Set(posts.map(([x, y]) => x + ',' + y))
  const gaps = new Set(gates.map((g) => (g.ax + g.bx) / 2 + ',' + (g.az + g.bz) / 2))
  for (const [x, y] of posts) {
    p.push(put(rb(0.12, 0.48, 0.12, 0.04), LOOK.fence, [x - o, 0.24, y - o]))
    const rails = (cx: number, cz: number, along: boolean) => {
      for (const h of [0.17, 0.34]) p.push(put(rb(1, 0.07, 0.06, 0.025), LOOK.fenceRail, [cx - o, h, cz - o], [0, along ? 0 : Math.PI / 2, 0]))
    }
    if ((y === 0 || y === N) && has.has(x + 1 + ',' + y) && !gaps.has(x + 0.5 + ',' + y)) rails(x + 0.5, y, true)
    if ((x === 0 || x === N) && has.has(x + ',' + (y + 1)) && !gaps.has(x + ',' + (y + 0.5))) rails(x, y + 0.5, false)
  }
  // a gate in each gap, hinged on one post and swung open the way the sheep go
  for (const g of gates) {
    const ux = g.bx - g.ax,
      uz = g.bz - g.az,
      [vx, vz] = DIRS[g.d]!
    const lx = ux * Math.cos(GATE.open) + vx * Math.sin(GATE.open),
      lz = uz * Math.cos(GATE.open) + vz * Math.sin(GATE.open)
    const L = GATE.leaf
    const leafs = [
      put(rb(0.14, 0.6, 0.14, 0.045), LOOK.fence, [0, 0.3, 0]),
      put(ball(0.5), LOOK.fence, [0, 0.61, 0], [0, 0, 0], [0.17, 0.1, 0.17]),
      ...[0.16, 0.36].map((h) => put(rb(L, 0.07, 0.06, 0.025), LOOK.fenceRail, [L / 2, h, 0])),
      put(rb(0.08, 0.34, 0.07, 0.025), LOOK.fenceRail, [L - 0.04, 0.26, 0]),
      put(rb(L - 0.1, 0.05, 0.05, 0.02), LOOK.fenceRail, [L / 2, 0.26, 0], [0, 0, 0.28]),
    ]
    p.push(...setAt(leafs, g.ax - o, g.az - o, -Math.atan2(lz, lx)))
  }
  // a bale, wisps of straw and pebbles on the floor, always the same
  p.push(put(rb(0.34, 0.24, 0.26, 0.06), LOOK.hay, [-0.7, 0.15, -0.75], [0, 0.4, 0]))
  for (const [x, z, k, a] of [
    [0.55, -0.6, 1, 1.3],
    [-0.2, 0.5, 1, 2.6],
    [0.7, 0.35, 0, 3.9],
    [-0.75, 0.2, 1, 5.2],
    [0.15, -0.15, 0, 6.5],
  ] as const)
    p.push(k ? put(ball(0.5), LOOK.hay, [x, 0.09, z], [0, a, 0], [0.26, 0.16, 0.2]) : put(ball(0.5), LOOK.stone, [x, 0.05, z], [0, a, 0], [0.14, 0.07, 0.11]))
  return p
}

// ---------------------------------------------------------------- the machines

/** Move freshly built pieces by (dx, dz). */
function shift(list: BufferGeometry[], dx: number, dz: number) {
  for (const g of list) g.translate(dx, 0, dz)
  return list
}
/** Turn freshly built pieces about the vertical by `yaw` (a port built along +z: −π/2 points it west), then move them to (x, z). */
function setAt(list: BufferGeometry[], x: number, z: number, yaw = 0) {
  for (const g of list) g.rotateY(yaw).translate(x, 0, z)
  return list
}

/** Where a 2×1's machine (A) stands: on the back cell, behind what it fills (B) on the front cell, where its output is. */
const A_Z = -0.48
/**
 * A 2×1: the machine itself (A) on the back cell and what it fills (B) on the front one, on one plinth, and the chute
 * its goods leave by, out of B at the front edge (none for a seeder). Returns the merged body; A's parts sit at
 * `moved(…, 0, A_Z)`.
 */
function pair(a: BufferGeometry[], b: BufferGeometry[], out: BufferGeometry[]) {
  return { body: model([...plinth(0.9, 1.84), ...shift(a, 0, A_Z), ...shift(b, 0, -A_Z), ...setAt(out, 0, EDGE)]) }
}

/**
 * A station's two gates, as the shearer's: the sheep come in at the back and leave in front along the left half (the
 * line of its way in and out), each gate between a post `P` from the middle and a capped post of its own.
 */
function gates(c: string, P: number): BufferGeometry[] {
  const p: BufferGeometry[] = []
  for (const [z, swing] of [
    [-P, 0.9],
    [P, 0.62],
  ] as const) {
    p.push(put(rb(0.15, 0.6, 0.15, 0.05), LOOK.fence, [-0.08, 0.45, z]))
    p.push(put(ball(0.12), c, [-0.08, 0.78, z], [0, 0, 0], [1, 0.8, 1]))
    p.push(...setAt(leaf(0.28), -P + 0.085, z, -swing), ...setAt(leaf(0.28), -0.155, z, Math.PI + swing))
  }
  return p
}
/** A station's tray for its good: on its right (the west, facing south), into the back cell, goods moving east. */
const sideInlet = (c: string) => setAt(inlet(c, 0.28), -EDGE, -0.5, Math.PI / 2)
const moved = (p: V3, dx: number, dz: number): V3 => [p[0] + dx, p[1], p[2] + dz]

function build(type: BuildingId): MachineSpec {
  const c = ROOF[type]
  switch (type) {
    case 'comb': {
      // a brushing arch over the sheep's lane: a big brush drum turning between two posts, and the station's sign beside
      // it, a giant comb standing on its back; a basket of combed-out fluff by it
      const p = plinth(1.84, 1.84)
      for (const x of [-0.92, 0.02]) {
        p.push(put(rb(0.16, 1.12, 0.2, 0.06), WOOD_DARK, [x, 0.68, 0]))
        p.push(put(ball(0.12), c, [x, 1.28, 0], [0, 0, 0], [1, 0.8, 1]))
      }
      p.push(put(rb(1.1, 0.12, 0.26, 0.05), WOOD, [-0.45, 1.18, 0]))
      // the giant comb: a rounded spine in the station's colour, its teeth pointing down
      p.push(put(rb(0.82, 0.2, 0.14, 0.08), c, [0.5, 1.12, -0.38]))
      for (let i = 0; i < 7; i++) p.push(put(rb(0.07, 0.42, 0.09, 0.03), shade(c, 0.85), [0.17 + i * 0.11, 0.82, -0.38]))
      for (const x of [0.2, 0.8]) p.push(put(rb(0.1, 0.62, 0.1, 0.04), WOOD_DARK, [x, 0.42, -0.38]))
      p.push(put(cyl(0.22, 0.22, 16, 0.18), '#c9935a', [0.55, 0.26, 0.45]))
      for (const [x, z, r] of [
        [0.5, 0.42, 0.11],
        [0.62, 0.5, 0.09],
        [0.47, 0.54, 0.08],
      ] as const)
        p.push(put(ball(r), LOOK.combed, [x, 0.4, z], [0, 0, 0], [1.2, 0.7, 1]))
      p.push(...gates(c, 0.78))
      return {
        body: model(p),
        top: 1.6,
        parts: [{ geo: () => cached('combBrush', () => spikyDrum(0.22, 0.86, shade(c, 1.15))), at: [-0.45, 0.88, 0], motion: 'spinX' }],
      }
    }
    case 'curl': {
      // a salon's hood dryer over the sheep's lane on a stout stand, curlers in the station's colours on a tray beside it,
      // and its sign, a giant curler standing upright, its rack of small ones turning
      const p = plinth(1.84, 1.84)
      p.push(put(rb(0.16, 1.18, 0.16, 0.06), WOOD_DARK, [0.06, 0.7, -0.6]))
      p.push(put(rb(0.62, 0.12, 0.14, 0.05), WOOD_DARK, [-0.22, 1.24, -0.6]))
      const hood = new SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)
      p.push(put(hood, shade(c, 1.25), [-0.45, 1.0, -0.12], [0, 0, 0], [1, 0.8, 1.1]))
      p.push(put(ring(0.5, 0.06), c, [-0.45, 1.0, -0.12], [Math.PI / 2, 0, 0], [1, 1.1, 1]))
      // the tray of curlers
      p.push(put(rb(0.6, 0.08, 0.4, 0.03), WOOD, [0.5, 0.36, 0.4]))
      for (let i = 0; i < 4; i++) p.push(put(cyl(0.06, 0.32, 12), LOOK.colors[i]!, [0.3 + i * 0.13, 0.46, 0.4], [Math.PI / 2, 0, 0]))
      // the giant curler: a ridged roller on a post
      p.push(put(rb(0.1, 0.6, 0.1, 0.04), WOOD_DARK, [0.55, 0.45, -0.3]))
      p.push(put(cyl(0.2, 0.62, 18), c, [0.55, 1.06, -0.3]))
      for (const y of [0.84, 1.0, 1.14, 1.28]) p.push(put(ring(0.2, 0.035), shade(c, 0.8), [0.55, y, -0.3], [Math.PI / 2, 0, 0]))
      p.push(...gates(c, 0.78))
      return {
        body: model(p),
        top: 1.75,
        parts: [
          {
            geo: () =>
              cached('curlRack', () => {
                const r: BufferGeometry[] = [put(cyl(0.05, 0.06, 10), INKY, [0, 0, 0])]
                for (let i = 0; i < 4; i++) {
                  const a = (i / 4) * Math.PI * 2
                  r.push(put(cyl(0.05, 0.18, 10), LOOK.colors[i]!, [Math.cos(a) * 0.14, 0.06, Math.sin(a) * 0.14]))
                }
                return model(r)
              }),
            at: [0.55, 1.4, -0.3],
            motion: 'spinY',
          },
        ],
      }
    }
    case 'knit': {
      // a knitting arch over the sheep's lane: on its beam a big ball of yarn pierced by two huge needles that click while
      // it knits — its silhouette — and beside it a basket of balls with a striped scarf hanging off a peg
      const p = plinth(1.84, 1.84)
      for (const x of [-0.92, 0.02]) p.push(put(rb(0.16, 1.1, 0.2, 0.06), WOOD_DARK, [x, 0.67, 0]))
      p.push(put(rb(1.1, 0.12, 0.26, 0.05), c, [-0.45, 1.18, 0]))
      p.push(knitSign().clone().scale(1.7, 1.7, 1.7).translate(-0.45, 1.52, 0))
      p.push(put(cyl(0.26, 0.26, 16, 0.2), '#c9935a', [0.5, 0.27, 0.42]))
      for (const [x, z, k] of [
        [0.42, 0.38, 0],
        [0.6, 0.48, 1],
        [0.5, 0.52, 2],
      ] as const)
        p.push(put(ball(0.1), LOOK.colors[k]!, [x, 0.46, z]))
      // a peg with a scarf in stripes
      p.push(put(rb(0.1, 1.0, 0.1, 0.04), WOOD_DARK, [0.6, 0.6, -0.5]))
      p.push(put(rb(0.36, 0.06, 0.08, 0.03), WOOD, [0.48, 1.06, -0.5]))
      LOOK.colors.forEach((k, i) => p.push(put(rb(0.16, 0.12, 0.04, 0.02), k, [0.38, 0.97 - i * 0.12, -0.5])))
      p.push(...gates(c, 0.78))
      const needle = (flip: boolean) => () =>
        cached('needle' + flip, () => {
          const g = model([put(cyl(0.05, 1.0, 10), METAL, [0, 0.2, 0]), put(ball(0.11), LOOK.coin, [0, 0.72, 0])])
          g.rotateZ(flip ? -0.5 : 0.5)
          return g
        })
      return {
        body: model(p),
        top: 2.2,
        parts: [
          { geo: needle(false), at: [-0.45, 1.5, 0.08], motion: 'snip' },
          { geo: needle(true), at: [-0.45, 1.5, 0.08], motion: 'snip-' },
        ],
      }
    }
    case 'bath': {
      // a little log bathhouse the sheep walk through: log walls either side of their lane, a gabled roof, a chimney
      // puffing steam; beside it a tub of water with a ladle and a birch besom
      const p = plinth(1.84, 1.84)
      for (const x of [-0.92, 0.02])
        for (let i = 0; i < 4; i++) p.push(put(cyl(0.08, 1.5, 10), i % 2 ? WOOD : shade(WOOD, 0.88), [x, 0.26 + i * 0.16, 0], [Math.PI / 2, 0, 0]))
      for (const s of [-1, 1]) p.push(put(rb(0.72, 0.06, 1.62, 0.02), '#9b5a3c', [-0.45 + s * 0.27, 1.06, 0], [0, 0, s * -0.55]))
      p.push(put(rb(0.08, 0.07, 1.64, 0.03), shade('#9b5a3c', 0.78), [-0.45, 1.24, 0]))
      p.push(put(rb(0.18, 0.4, 0.18, 0.04), '#b8b2a6', [-0.18, 1.3, -0.4]))
      // the tub, its water in the station's colour, a ladle in it; the besom leaning on it
      p.push(put(cyl(0.3, 0.34, 18, 0.26), WOOD, [0.5, 0.3, 0.32]))
      for (const y of [0.22, 0.4]) p.push(put(cyl(0.31, 0.05, 18), INKY, [0.5, y, 0.32]))
      p.push(put(cyl(0.26, 0.04, 18), c, [0.5, 0.46, 0.32]))
      p.push(put(cyl(0.035, 0.5, 8), WOOD_DARK, [0.6, 0.58, 0.32], [0, 0, -0.6]))
      p.push(put(rb(0.08, 0.5, 0.08, 0.03), WOOD_DARK, [0.55, 0.45, -0.45], [0.2, 0, 0.1]))
      p.push(put(ball(0.16), '#7cbf5a', [0.55, 0.72, -0.5], [0, 0, 0], [1, 1.4, 0.8]))
      p.push(...gates(c, 0.78))
      return {
        body: model(p),
        top: 1.9,
        parts: [
          {
            geo: () => cached('steam', () => model([put(ball(0.12), '#ffffff', [0, 0, 0]), put(ball(0.09), '#f2f6fb', [0.08, 0.16, 0.02]), put(ball(0.07), '#ffffff', [-0.02, 0.3, -0.02])])),
            at: [-0.18, 1.6, -0.4],
            motion: 'bob',
          },
        ],
      }
    }
    case 'shearer': {
      // a big striped tent on four stout posts that the sheep walk under, a shearing stand inside, giant chunky shears
      // standing on its top. The sheep go through it in a straight line, as through the pasture: in by a gate at the
      // back swung in, out by one in front swung out, each between a tent post and a capped post of its own; the wool
      // slides out down a chute on their right, a fleece on it
      const p = plinth(1.84, 1.84)
      const P = 0.78
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(put(rb(0.17, 1.02, 0.17, 0.06), WOOD_DARK, [sx * P, 0.64, sz * P]))
      for (const s of [-1, 1]) {
        p.push(put(rb(2 * P + 0.1, 0.12, 0.14, 0.05), WOOD, [0, 1.16, s * P]))
        p.push(put(rb(0.14, 0.12, 2 * P + 0.1, 0.05), WOOD, [s * P, 1.16, 0]))
      }
      p.push(stripedTent(1.1, 0.62, c, '#ffffff', 1.2))
      p.push(put(rb(0.16, 0.22, 0.16, 0.05), INKY, [0, 1.92, 0]))
      // the shearing stand
      p.push(put(rb(0.8, 0.12, 0.6, 0.05), WOOD, [0.2, 0.2, -0.04]))
      for (const x of [-0.12, 0.52]) p.push(put(rb(0.08, 0.3, 0.08, 0.03), WOOD_DARK, [x, 0.38, -0.3]))
      p.push(put(rb(0.72, 0.08, 0.08, 0.03), WOOD_DARK, [0.2, 0.52, -0.3]))
      // the two gates: leaves swung the way the sheep go, into the tent at the back, out of it in front
      for (const [z, swing] of [
        [-P, 0.9],
        [P, 0.62],
      ] as const) {
        p.push(put(rb(0.15, 0.6, 0.15, 0.05), LOOK.fence, [-0.08, 0.45, z]))
        p.push(put(ball(0.12), c, [-0.08, 0.78, z], [0, 0, 0], [1, 0.8, 1]))
        p.push(...setAt(leaf(0.28), -P + 0.085, z, -swing), ...setAt(leaf(0.28), -0.155, z, Math.PI + swing))
      }
      p.push(...setAt(outlet(c, good('wool').clone().scale(1.2, 1.2, 1.2), 0.36, 0.38), -EDGE, -0.32, -Math.PI / 2))
      // a few tufts on the floor
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
      // a chunky yellow mower with a big red reel in front, and a hay wagon with its load of bales before it, its
      // tailgate let down into the chute a bale slides out by
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
      const { body } = pair(m, shift(w, 0, -0.08), outlet(c, good('hay'), 0.3, 0.38))
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
            at: moved([0, 0.3, 0.36], 0, A_Z),
            motion: 'spinX-',
          },
        ],
      }
    }
    case 'berry': {
      // a berry cart (big spoked wheels, a basket heaped with berries, a crane boom with a scoop that swings out to the
      // bushes) behind a big vat of purple dye, a pot of it sliding out down the chute in front
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
      const { body } = pair(k, shift(v, 0, -0.1), outlet(c, good('dye').clone().scale(1.1, 1.1, 1.1), 0.32, 0.36))
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
            at: moved([-0.3, 0.76, -0.26], 0, A_Z),
            motion: 'swing',
          },
        ],
      }
    }
    case 'feeder': {
      // a hay manger the sheep walk under: four stout posts, a slatted V rack heaped with hay on top, a long trough of
      // hay beside their lane, a bale by it, a pitchfork bobbing in the rack while it feeds; the hay comes in on the right
      const p = plinth(1.84, 1.84)
      const P = 0.78
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(put(rb(0.17, 1.0, 0.17, 0.06), WOOD_DARK, [sx * P, 0.63, sz * P]))
      for (const s of [-1, 1]) p.push(put(rb(2 * P + 0.1, 0.12, 0.14, 0.05), c, [0, 1.14, s * P]))
      for (const s of [-1, 1]) {
        p.push(put(rb(1.7, 0.08, 0.62, 0.03), WOOD, [0, 1.36, s * 0.34], [s * 0.55, 0, 0]))
        for (let i = 0; i < 5; i++) p.push(put(rb(0.08, 0.1, 0.64, 0.03), WOOD_DARK, [-0.68 + i * 0.34, 1.37, s * 0.34], [s * 0.55, 0, 0]))
      }
      for (const [x, y, r] of [
        [-0.5, 1.42, 0.28],
        [0, 1.48, 0.32],
        [0.5, 1.42, 0.28],
        [-0.24, 1.6, 0.22],
        [0.26, 1.6, 0.22],
      ] as const)
        p.push(put(ball(r), LOOK.hay, [x, y, 0], [0, 0, 0], [1.3, 0.75, 1]))
      // the trough along the sheep's lane, on its left, full of hay, and a bale in the corner
      p.push(put(rb(0.36, 0.22, 1.1, 0.05), WOOD, [0.3, 0.26, -0.05]))
      p.push(put(rb(0.26, 0.08, 1.0, 0.03), LOOK.hay, [0.3, 0.38, -0.05]))
      p.push(put(rb(0.28, 0.24, 0.36, 0.06), LOOK.hay, [0.62, 0.27, 0.56]))
      p.push(put(rb(0.03, 0.25, 0.37, 0.012), WOOD, [0.55, 0.27, 0.56]))
      p.push(put(rb(0.03, 0.25, 0.37, 0.012), WOOD, [0.69, 0.27, 0.56]))
      p.push(...gates(c, P), ...sideInlet(c))
      return {
        body: model(p),
        top: 2.05,
        parts: [
          {
            geo: () =>
              cached('pitchfork', () =>
                model([
                  put(cyl(0.04, 0.9, 8), WOOD, [0, 0.2, 0]),
                  put(rb(0.3, 0.06, 0.06, 0.025), METAL, [0, -0.26, 0]),
                  ...[-0.12, 0, 0.12].map((x) => put(cone(0.035, 0.2, 6), METAL, [x, -0.38, 0], [Math.PI, 0, 0])),
                ]),
              ),
            at: [0.42, 1.92, 0.08],
            tilt: [0, 0, -0.35],
            motion: 'bob',
          },
        ],
      }
    }
    case 'dyer': {
      // a dyeing arch the sheep walk under: two striped posts with a beam, a big tub of dye on top that rocks and drips
      // every colour onto them, a vat of dye beside their lane, pots of berry dye by it; the dye comes in on the right
      const p = plinth(1.84, 1.84)
      for (const sx of [-1, 1]) {
        p.push(put(rb(0.22, 1.1, 0.22, 0.07), c, [sx * 0.76, 0.68, 0]))
        for (const y of [0.4, 0.8]) p.push(put(rb(0.24, 0.1, 0.24, 0.04), '#ffffff', [sx * 0.76, y, 0]))
      }
      p.push(put(rb(1.74, 0.16, 0.3, 0.06), WOOD_DARK, [0, 1.28, 0]))
      // the vat by the lane, brimful of colour, with dark hoops
      p.push(put(cyl(0.34, 0.5, 22, 0.3), WOOD, [0.46, 0.4, -0.4]))
      for (const y of [0.26, 0.56]) p.push(put(cyl(0.35, 0.06, 22), INKY, [0.46, y, -0.4]))
      p.push(put(cyl(0.3, 0.05, 22), LOOK.colors[0]!, [0.46, 0.66, -0.4]))
      // splashes of every colour in the lane where the sheep stand, and pots of dye
      LOOK.colors.forEach((k, i) => p.push(put(cyl(0.16, 0.03, 16), k, [-0.62 + (i % 2) * 0.32, 0.16 + i * 0.002, -0.3 + i * 0.2])))
      for (const [x, z] of [
        [0.62, 0.52],
        [0.36, 0.62],
      ] as const)
        p.push(good('dye').clone().scale(1.3, 1.3, 1.3).translate(x, 0.12, z))
      p.push(...gates(c, 0.78), ...sideInlet(c))
      return {
        body: model(p),
        top: 2.1,
        parts: [
          {
            geo: () =>
              cached('dyeTub', () => {
                const t: BufferGeometry[] = [put(cyl(0.34, 0.34, 20, 0.28), shade(c, 1.1), [0, 0, 0])]
                t.push(put(cyl(0.35, 0.06, 20), INKY, [0, 0.12, 0]))
                t.push(put(cyl(0.3, 0.05, 20), LOOK.colors[3]!, [0, 0.16, 0]))
                // drips of every colour falling from its spout
                for (const [x, y, k] of [
                  [0.36, -0.12, 0],
                  [0.38, -0.32, 1],
                  [0.34, -0.5, 2],
                ] as const)
                  t.push(put(ball(0.06), LOOK.colors[k]!, [x, y, 0], [0, 0, 0], [0.8, 1.2, 0.8]))
                return model(t)
              }),
            at: [-0.5, 1.56, 0],
            motion: 'swing',
          },
        ],
      }
    }
    case 'seeder': {
      // a seed spreader: a green hopper on three legs with a spinning disc under it that flings the seeds about, its
      // tray behind for the seeds a belt brings; in front the sacks of seed with a sprout pot. Nothing comes out
      const t: BufferGeometry[] = []
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        t.push(put(rb(0.09, 0.6, 0.09, 0.035), WOOD_DARK, [Math.cos(a) * 0.24, 0.42, Math.sin(a) * 0.24], [Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15]))
      }
      t.push(put(cone(0.36, 0.42, 18), c, [0, 0.9, 0], [Math.PI, 0, 0]))
      t.push(put(cyl(0.36, 0.1, 18), shade(c, 1.15), [0, 1.14, 0]))
      t.push(put(cyl(0.32, 0.04, 18), LOOK.hay, [0, 1.19, 0]))
      const k: BufferGeometry[] = []
      for (const [x, z, col] of [
        [-0.16, -0.08, '#e9dcc0'],
        [0.14, 0.1, '#dccba6'],
      ] as const) {
        k.push(put(rb(0.32, 0.42, 0.28, 0.12), col, [x, 0.36, z]))
        k.push(put(ball(0.09), WOOD_DARK, [x, 0.6, z], [0, 0, 0], [1.2, 0.6, 1]))
      }
      k.push(put(cyl(0.12, 0.14, 14, 0.09), '#c9935a', [0.24, 0.22, -0.26]))
      k.push(put(cone(0.08, 0.2, 8), LOOK.sprout, [0.24, 0.38, -0.26]))
      const { body } = pair(t, k, [])
      return {
        body: model([body, ...setAt(inlet(c, 0.24), 0, -EDGE)]),
        top: 1.5,
        parts: [
          {
            geo: () =>
              cached('seedDisc', () => {
                const d: BufferGeometry[] = [put(cyl(0.24, 0.04, 18), METAL, [0, 0, 0])]
                for (let i = 0; i < 4; i++) d.push(put(rb(0.4, 0.05, 0.05, 0.02), INKY, [0, 0.03, 0], [0, (i / 4) * Math.PI, 0]))
                for (let i = 0; i < 5; i++) {
                  const a = (i / 5) * Math.PI * 2
                  d.push(put(ball(0.035), LOOK.hay, [Math.cos(a) * 0.32, 0.02, Math.sin(a) * 0.32]))
                }
                return model(d)
              }),
            at: moved([0, 0.62, 0], 0, A_Z),
            motion: 'spinY',
          },
        ],
      }
    }
    case 'pen':
      return { body: model(penBody()), top: 0.9, parts: [] }
    case 'sheep':
      // a sheep in hand, bought into the pen it is put on
      return { body: sheepModel().clone().translate(0, 0.02, 0), top: 0.9, parts: [] }
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
