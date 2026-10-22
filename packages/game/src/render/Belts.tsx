import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderGeometry, ExtrudeGeometry, Shape, TorusGeometry } from 'three'
import { DIRS, LOOK } from '@/game/balance'
import { GEO, flat, mat } from './kit'
import { Batch, useInstanced } from './instancing'
import { frame } from './frame'

const CAP = 700
const yaw = (d: number) => -d * (Math.PI / 2)
/** Slats per half cell, running with the sheep; wedge planks round a bend. */
const SLATS = 3
const CORNER_SLATS = 5
/** A wedge plank: a pie slice about the bend's corner, from just inside the belt to its outer edge, pointing +Z. */
const wedgeGeo = (() => {
  // a ring sector from 0.22 to 0.82 about the corner, 0.26 rad wide, centred on +Z
  const s = new Shape()
  const a0 = -0.13,
    a1 = 0.13,
    r0 = 0.22,
    r1 = 0.82
  s.moveTo(Math.sin(a0) * r0, Math.cos(a0) * r0)
  s.lineTo(Math.sin(a0) * r1, Math.cos(a0) * r1)
  s.absarc(0, 0, r1, Math.PI / 2 - a0, Math.PI / 2 - a1, true)
  s.lineTo(Math.sin(a1) * r0, Math.cos(a1) * r0)
  s.absarc(0, 0, r0, Math.PI / 2 - a1, Math.PI / 2 - a0, false)
  const g = new ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false, curveSegments: 4 })
  // shape xy → world x, z (y up = extrusion)
  // the shape's +y (the sector's middle) becomes +Z, the extrusion goes down; lift it to sit on the bed
  g.rotateX(Math.PI / 2)
  g.translate(0, 0.035, 0)
  return g
})()
/** The outer wall of a bend: a quarter ring about the corner, from +X round to +Z. */
const arcGeo = new TorusGeometry(0.92, 0.07, 8, 14, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1.6, 1)
/** The cap along the top of a bend's wall, like the straight walls' caps. */
const arcCapGeo = new TorusGeometry(0.92, 0.078, 6, 14, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 0.32, 1)
/** The bed of a bend: a quarter disc about the corner, from +X round to +Z, so nothing pokes out past the wall. */
const bendBedGeo = new CylinderGeometry(0.9, 0.9, 0.1, 14, 1, false, 0, Math.PI / 2)
/** A colour mixed `k` of the way toward another. */
function mixHex(a: string, b: string, k: number) {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  return '#' + [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * k).toString(16).padStart(2, '0')).join('')
}

/** How wide a plank still is near a seam (0 at the seam): it is clipped there, its other half in the next cell. */
const clip = (u: number, half: number) => Math.min(1, u / half, (1 - u) / half)

/** The instanced meshes one set of belts is drawn with: the field's belts, or the line being drawn (Ghost.tsx). */
export function useBeltPieces(cap: number, name: string, shadows = true, tint = '', tintBy = 0) {
  const sh = shadows ? true : false
  // a line in hand is tinted a little toward the placing blue, so it doesn't look laid yet
  const m = (c: string) => mat(tint ? mixHex(c, tint, tintBy) : c)
  const bed = useInstanced(GEO.sbox(), m(LOOK.beltBed), cap * 2, name + '_bed', sh ? 'receive' : false)
  const bendBeds = useInstanced(bendBedGeo, m(LOOK.beltBed), cap, name + '_bend_beds', sh ? 'receive' : false)
  // a plank is a plain box: a thousand of them on a big factory, and nobody sees a plank's rounded corner
  const slats = useInstanced(GEO.box(), m(LOOK.beltSlat), cap * 2 * SLATS, name + '_slats', false)
  const walls = useInstanced(GEO.lowBox(), m(LOOK.beltWall), cap * 2, name + '_walls', sh)
  const wedges = useInstanced(wedgeGeo, m(LOOK.beltSlat), cap * CORNER_SLATS, name + '_corner_slats', false)
  const arcs = useInstanced(arcGeo, m(LOOK.beltWall), cap, name + '_corner_walls', sh)
  const arcCaps = useInstanced(arcCapGeo, m(LOOK.beltWallTop), cap, name + '_corner_caps', false)
  const posts = useInstanced(GEO.cyl(), m(LOOK.beltWall), cap, name + '_corner_posts', sh)
  const caps = useInstanced(GEO.lowBox(), m(LOOK.beltWallTop), cap * 2, name + '_wall_tops', false)
  const chev = useInstanced(GEO.chevron(), m(LOOK.chevron), cap, name + '_arrows', false)
  return useMemo(
    () => ({ bed: new Batch(bed), bendBeds: new Batch(bendBeds), slats: new Batch(slats), wedges: new Batch(wedges), arcs: new Batch(arcs), arcCaps: new Batch(arcCaps), posts: new Batch(posts), walls: new Batch(walls), caps: new Batch(caps), chev: new Batch(chev) }),
    [bed, bendBeds, slats, wedges, arcs, arcCaps, posts, walls, caps, chev],
  )
}
export type BeltPieces = ReturnType<typeof useBeltPieces>

/**
 * One cell of belt: sheep come in moving `inDir` and leave moving `dir`; `phase` runs the planks along; `y` lifts it
 * (the line being drawn is held up, like a building in hand). A straight cell has a bed, planks, an arrow and two
 * walls; a turn a quarter-disc bed, fanned planks, a curved outer wall and a post on the inside corner.
 */
export function drawBelt(b: BeltPieces, x: number, z: number, inDir: number, dir: number, phase: number, y = 0, walls = true, arrow = true) {
  const X = x + 0.5,
    Z = z + 0.5
  const [ix, iz] = DIRS[inDir]!,
    [ox, oz] = DIRS[dir]!
  if (inDir !== dir) {
    // a quarter belt round the corner: planks fanned along an arc about the corner between the two open edges
    const ex = -ix * 0.5,
      ez = -iz * 0.5,
      xx = ox * 0.5,
      xz = oz * 0.5
    const cx = ex + xx,
      cz = ez + xz
    const a0 = Math.atan2(ez - cz, ex - cx)
    let da = Math.atan2(xz - cz, xx - cx) - a0
    if (da > Math.PI) da -= Math.PI * 2
    if (da < -Math.PI) da += Math.PI * 2
    // a quarter-disc bed and one curved wall round the outside of the bend
    const turnYaw = -Math.min(a0, a0 + da)
    b.bendBeds.put(X + cx, 0.05 + y, Z + cz, turnYaw)
    b.arcs.put(X + cx, 0.12 + y, Z + cz, turnYaw)
    b.arcCaps.put(X + cx, 0.235 + y, Z + cz, turnYaw)
    // a post on the inside corner, where the two inner walls of the straight runs meet
    b.posts.put(X + cx, 0.12 + y, Z + cz, 0, 0.2, 0.22, 0.2)
    // wedge planks fanned about the corner, edge to edge, clipped at the seams with the straight runs
    for (let i = 0; i < CORNER_SLATS; i++) {
      const u = (i / CORNER_SLATS + phase) % 1
      b.wedges.put(X + cx, 0.115 + y, Z + cz, Math.PI / 2 - (a0 + da * u), clip(u, 0.13 / Math.abs(da)), 1, 1)
    }
    return
  }
  // a straight run: one bed, planks moving along it, a small dark arrow riding on them
  b.bed.put(X, 0.05 + y, Z, yaw(dir), 1.0, 0.1, 0.8)
  for (let i = 0; i < SLATS * 2; i++) {
    const t = (i / (SLATS * 2) + phase) % 1
    b.slats.put(X - ox * 0.5 + ox * t, 0.115 + y, Z - oz * 0.5 + oz * t, yaw(dir), 0.13 * clip(t, 0.065), 0.035, 0.6)
  }
  if (arrow) b.chev.put(X - ox * 0.5 + ox * phase, 0.137 + y, Z - oz * 0.5 + oz * phase, yaw(dir), 0.9)
  // a wall on each side the line doesn't pass through
  if (!walls) return
  const open0 = (inDir + 2) % 4,
    open1 = dir
  for (let s = 0; s < 4; s++) {
    if (s === open0 || s === open1) continue
    const [sx, sz] = DIRS[s]!
    const alongZ = s === 0 || s === 2
    b.walls.put(X + sx * 0.42, 0.12 + y, Z + sz * 0.42, 0, alongZ ? 0.12 : 1.0, 0.2, alongZ ? 1.0 : 0.12)
    b.caps.put(X + sx * 0.42, 0.225 + y, Z + sz * 0.42, 0, alongZ ? 0.14 : 1.0, 0.04, alongZ ? 1.0 : 0.14)
  }
}

/**
 * Belts in the manner of Tower Factory's wooden conveyors: a dark wooden bed, a floor of light planks laid across the
 * way that run along with the sheep, and a side wall on every edge the line doesn't pass through — so a straight cell
 * has two walls and a turn an outer corner, its planks fanned round a quarter arc. A small dark arrow rides on straight
 * runs; a red cross marks a side input it refuses (a merger is needed), a red dot a belt that leads nowhere.
 */
export function Belts() {
  const pieces = useBeltPieces(CAP, 'belt')
  const marks = useInstanced(GEO.box(), flat(LOOK.bad), 128, 'belt_marks', false)
  const dots = useInstanced(GEO.ball(), flat(LOOK.bad), 128, 'belt_dead', false)
  const b = useMemo(() => ({ ...pieces, marks: new Batch(marks), dots: new Batch(dots) }), [pieces, marks, dots])
  useFrame(() => {
    for (const q of Object.values(b)) q.begin()
    for (const c of frame.belts) {
      const X = c.x + 0.5,
        Z = c.y + 0.5
      const [ox, oz] = DIRS[c.dir]!
      // a splitter or merger stands on its own bed: no walls round it
      drawBelt(b, c.x, c.y, c.kind === 'belt' ? c.inDir : c.dir, c.dir, c.phase, 0, c.kind === 'belt')
      for (const sd of c.blocked) {
        const mx = X - DIRS[sd]![0] * 0.4,
          mz = Z - DIRS[sd]![1] * 0.4
        b.marks.put(mx, 0.3, mz, Math.PI / 4, 0.3, 0.05, 0.07)
        b.marks.put(mx, 0.3, mz, -Math.PI / 4, 0.3, 0.05, 0.07)
      }
      if (c.dead) b.dots.put(X + ox * 0.36, 0.3, Z + oz * 0.36, 0, 0.18)
    }
    for (const q of Object.values(b)) q.end()
  })
  return (
    <group>
      {Object.values(b).map((q) => (
        <primitive key={q.mesh.name} object={q.mesh} />
      ))}
    </group>
  )
}
