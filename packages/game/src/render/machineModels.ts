import { Color, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three'
import { LOOK, ROOF, type BuildingId } from '@/game/balance'
import { model } from './kit'
import { INKY, METAL, WOOD, WOOD_DARK, ball, cached, cone, cyl, put, rb, ring, shade, type V3 } from './models'

/**
 * The buildings, designed like Tower Factory's (the author, 15.10.2026: «визуально дают легко понять что делает каждое
 * из них, … главное дизайн»): not houses but contraptions, each with its own silhouette and one big working part that
 * says what it does — giant shears over a striped tent, a little log bathhouse puffing steam by a tub of water, a big
 * brush and a giant comb, huge tweezers over a basket of burrs, a carrot on a pedestal, a scarecrow with a crow on its
 * arm. The stations are arches the sheep walk under (the author's salon, 19.10.2026): in by a gate at the back, out by
 * one in front, along their left half. They stand on cream stone plinths (the belts are wood). Every part is chunky:
 * nothing thinner than ~0.06 of a cell, no fuzz of small bits (docs/04-ART.md).
 *
 * Local frame: x to the right of the screen, z towards the camera, y up, footprint centred. A model is built facing
 * south (dir 1, towards the camera at the start) and the whole of it turns with its building (`machineYaw`). A body is
 * one merged vertex-coloured geometry; each moving part is another, placed by `MachineSpec.parts`.
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

/** A gate's leaf, on a plinth: two rails and a stile at its free end, from its hinge along +x. */
const leaf = (len: number) => [
  put(rb(len, 0.08, 0.07, 0.03), LOOK.fenceRail, [len / 2, 0.31, 0]),
  put(rb(len, 0.08, 0.07, 0.03), LOOK.fenceRail, [len / 2, 0.52, 0]),
  put(rb(0.09, 0.32, 0.08, 0.03), LOOK.fenceRail, [len - 0.045, 0.415, 0]),
  put(rb(len - 0.06, 0.06, 0.06, 0.025), LOOK.fenceRail, [len / 2, 0.415, 0], [0, 0, 0.6]),
]

// ---------------------------------------------------------------- the machines

/** Turn freshly built pieces about the vertical by `yaw`, then move them to (x, z). */
function setAt(list: BufferGeometry[], x: number, z: number, yaw = 0) {
  for (const g of list) g.rotateY(yaw).translate(x, 0, z)
  return list
}

/**
 * A gate at `z` across the sheep's lane (the left half, facing south), between a post `P` from the middle and a capped
 * post of its own, its leaves swung open by `swing` the way the sheep go.
 */
function gate(c: string, P: number, z: number, swing: number): BufferGeometry[] {
  return [
    put(rb(0.15, 0.6, 0.15, 0.05), LOOK.fence, [-0.08, 0.45, z]),
    put(ball(0.12), c, [-0.08, 0.78, z], [0, 0, 0], [1, 0.8, 1]),
    ...setAt(leaf(0.28), -P + 0.085, z, -swing),
    ...setAt(leaf(0.28), -0.155, z, Math.PI + swing),
  ]
}
/** A station's two gates: the sheep come in at the back and leave in front along the left half. */
const gates = (c: string, P: number) => [...gate(c, P, -P, 0.9), ...gate(c, P, P, 0.62)]

/** An arch over the sheep's lane: two posts and a beam, the posts capped in the station's colour. */
function arch(c: string, beam = WOOD): BufferGeometry[] {
  const p: BufferGeometry[] = []
  for (const x of [-0.92, 0.02]) {
    p.push(put(rb(0.16, 1.12, 0.2, 0.06), WOOD_DARK, [x, 0.68, 0]))
    p.push(put(ball(0.12), c, [x, 1.28, 0], [0, 0, 0], [1, 0.8, 1]))
  }
  p.push(put(rb(1.1, 0.12, 0.26, 0.05), beam, [-0.45, 1.18, 0]))
  return p
}

/** A burr: a brown ball stuck all over with short spikes. */
function burr(r: number): BufferGeometry {
  const p: BufferGeometry[] = [put(ball(r), LOOK.burrs, [0, 0, 0])]
  for (let i = 0; i < 10; i++) {
    const y = 1 - (2 * (i + 0.5)) / 10,
      a = i * 2.4,
      q = Math.sqrt(1 - y * y)
    const n = new Vector3(Math.cos(a) * q, y, Math.sin(a) * q)
    const g = cone(r * 0.35, r * 0.7, 6)
    g.applyMatrix4(new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n)))
    p.push(put(g, shade(LOOK.burrs, 0.8), [n.x * r * 1.1, n.y * r * 1.1, n.z * r * 1.1]))
  }
  return model(p)
}

/** A carrot standing on its stalk end: orange, ridged, tapering down to its tip, a tuft of leaves on top. Origin at its tip. */
function carrot(h: number): BufferGeometry {
  const r = h * 0.27
  const p: BufferGeometry[] = [put(cone(r, h, 14), LOOK.carrot, [0, h / 2, 0], [Math.PI, 0, 0])]
  for (const k of [0.35, 0.55, 0.75]) p.push(put(ring(r * k * 1.02, 0.025), shade(LOOK.carrot, 0.82), [0, h * k, 0], [Math.PI / 2, 0, 0]))
  p.push(put(cyl(r * 0.98, 0.06, 14), shade(LOOK.carrot, 1.08), [0, h + 0.02, 0]))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    p.push(put(ball(0.11), LOOK.carrotLeaf, [Math.cos(a) * 0.09, h + 0.2, Math.sin(a) * 0.09], [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4], [0.55, 1.6, 0.55]))
  }
  p.push(put(ball(0.1), shade(LOOK.carrotLeaf, 1.1), [0, h + 0.26, 0], [0, 0, 0], [0.6, 1.8, 0.6]))
  return model(p)
}

function build(type: BuildingId): MachineSpec {
  const c = ROOF[type]
  switch (type) {
    case 'comb': {
      // a brushing arch over the sheep's lane: a big brush drum turning between two posts, and the station's sign beside
      // it, a giant comb standing on its back; a basket of combed-out fluff by it
      const p = [...plinth(1.84, 1.84), ...arch(c)]
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
        p.push(put(ball(r), LOOK.feltFleece, [x, 0.4, z], [0, 0, 0], [1.2, 0.7, 1]))
      p.push(...gates(c, 0.78))
      return {
        body: model(p),
        top: 1.6,
        parts: [{ geo: () => cached('combBrush', () => spikyDrum(0.22, 0.86, shade(c, 1.15))), at: [-0.45, 0.88, 0], motion: 'spinX' }],
      }
    }
    case 'pick': {
      // a picking arch over the sheep's lane: from a bracket on its beam hang giant tweezers that pinch while it works; its
      // sign beside it, a big burr on a post, and a basket full of the burrs it has picked
      const p = [...plinth(1.84, 1.84), ...arch(c)]
      p.push(put(rb(0.14, 0.5, 0.14, 0.05), WOOD_DARK, [-0.45, 1.45, 0.08]))
      p.push(put(rb(0.4, 0.1, 0.24, 0.04), c, [-0.45, 1.72, 0.08]))
      p.push(put(rb(0.1, 0.7, 0.1, 0.04), WOOD_DARK, [0.55, 0.5, -0.38]))
      p.push(burr(0.2).translate(0.55, 1.05, -0.38))
      p.push(put(cyl(0.24, 0.24, 16, 0.2), '#c9935a', [0.55, 0.27, 0.42]))
      for (const [x, z] of [
        [0.48, 0.36],
        [0.64, 0.46],
        [0.5, 0.52],
      ] as const)
        p.push(burr(0.08).translate(x, 0.44, z))
      p.push(...gates(c, 0.78))
      // one arm of the tweezers, hanging from the pivot, a round grip in the station's colour at its tip
      const arm = (flip: boolean) => () =>
        cached('tweezer' + flip, () => {
          const z = flip ? 0.04 : -0.04
          return model([put(rb(0.09, 0.62, 0.07, 0.035), METAL, [0, -0.31, z]), put(ball(0.07), c, [0, -0.62, z]), put(cyl(0.05, 0.12, 10), INKY, [0, 0, 0], [Math.PI / 2, 0, 0])])
        })
      return {
        body: model(p),
        top: 2.0,
        parts: [
          { geo: arm(false), at: [-0.45, 1.66, 0.24], motion: 'snip' },
          { geo: arm(true), at: [-0.45, 1.66, 0.24], motion: 'snip-' },
        ],
      }
    }
    case 'wash': {
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
      // standing on its top. The sheep go through it in a straight line: in by a gate at the back swung in, out by one in
      // front swung out, each between a tent post and a capped post of its own; a few tufts of wool on the floor
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
      p.push(...gates(c, P))
      for (const [x, z] of [
        [0.5, 0.5],
        [0.2, 0.6],
        [0.62, 0.22],
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
    case 'carrot': {
      // a statue of a carrot on a round stone pedestal, a ring of little carrots planted round its foot; sheep come to it,
      // and it lets one out at a time by a gate in front, on its left
      const p = plinth(1.84, 1.84)
      p.push(put(cyl(0.5, 0.3, 24, 0.56), LOOK.portalStone, [0.12, 0.3, -0.12]))
      p.push(put(cyl(0.44, 0.06, 24), shade(LOOK.portalStone, 1.05), [0.12, 0.48, -0.12]))
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        p.push(carrot(0.22).translate(0.12 + Math.cos(a) * 0.68, 0.12, -0.12 + Math.sin(a) * 0.68))
      }
      p.push(...gate(c, 0.78, 0.78, 0.62))
      return { body: model(p), top: 2.0, parts: [{ geo: () => cached('carrotStatue', () => carrot(1.05)), at: [0.12, 0.5, -0.12], motion: 'bob' }] }
    }
    case 'scare': {
      // a scarecrow on a mound of earth: a pole and its arms, a checked shirt and patched trousers, a sack head under a
      // straw hat, straw sticking out at its cuffs; a crow sits on its arm, looking round
      const p: BufferGeometry[] = [put(cyl(0.62, 0.12, 24, 0.7), LOOK.soil, [0, 0.06, 0]), put(cyl(0.5, 0.05, 24), shade(LOOK.soil, 1.1), [0, 0.13, 0])]
      p.push(put(rb(0.12, 1.7, 0.12, 0.04), WOOD_DARK, [0, 0.95, 0]))
      p.push(put(rb(1.3, 0.1, 0.1, 0.04), WOOD_DARK, [0, 1.28, 0]))
      p.push(put(rb(0.5, 0.52, 0.3, 0.1), LOOK.scareShirt, [0, 1.16, 0]))
      p.push(put(rb(0.16, 0.16, 0.02, 0.04), shade(LOOK.scareShirt, 0.75), [0.1, 1.08, 0.155]))
      for (const s of [-1, 1]) {
        p.push(put(rb(0.36, 0.2, 0.22, 0.08), LOOK.scareShirt, [s * 0.38, 1.28, 0]))
        p.push(put(cone(0.08, 0.2, 6), LOOK.hay, [s * 0.64, 1.28, 0], [0, 0, (s * Math.PI) / 2]))
        p.push(put(rb(0.18, 0.42, 0.22, 0.07), LOOK.scarePants, [s * 0.12, 0.72, 0]))
      }
      p.push(put(rb(0.12, 0.12, 0.02, 0.03), '#e8c45a', [-0.12, 0.66, 0.115]))
      p.push(put(ball(0.22), LOOK.hay, [0, 1.62, 0], [0, 0, 0], [1, 1.05, 0.95]))
      for (const x of [-0.08, 0.08]) p.push(put(ball(0.035), INKY, [x, 1.65, 0.2]))
      p.push(put(rb(0.12, 0.03, 0.02, 0.01), INKY, [0, 1.55, 0.21]))
      p.push(put(cyl(0.36, 0.04, 20), shade(LOOK.hay, 0.8), [0, 1.8, 0]))
      p.push(put(cone(0.2, 0.3, 14), shade(LOOK.hay, 0.75), [0, 1.96, 0]))
      p.push(put(cyl(0.205, 0.05, 14), LOOK.scareShirt, [0, 1.85, 0]))
      return {
        body: model(p),
        top: 2.1,
        parts: [
          {
            geo: () => cached('crow', () => model([put(ball(0.11), INKY, [0, 0.1, 0], [0, 0, 0], [1.3, 1, 0.9]), put(ball(0.08), INKY, [0.1, 0.2, 0]), put(cone(0.035, 0.1, 6), '#f0b23c', [0.2, 0.2, 0], [0, 0, -Math.PI / 2]), put(rb(0.14, 0.03, 0.08, 0.01), INKY, [-0.15, 0.1, 0], [0, 0, 0.3])])),
            at: [-0.45, 1.33, 0],
            motion: 'bob',
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
