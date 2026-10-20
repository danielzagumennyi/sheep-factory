import { Color, Euler, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three'
import { DROP, LOOK } from '@/game/balance'
import type { SheepMarks } from '@/game/world'
import { sheepVmat } from './kit'
import { CHUTE, FLEECE_FIT, SHEEP_AT, parachute, fleece, fleeceCurls, fleeceFelt, fleeceSleek, fleeceSweater, fleeceSweaterColored, sheepHead, sheepLegs, sheepLids, sheepTuft, shorn } from './models'
import type { SheepPose } from './pick'

/**
 * How one sheep is drawn, for the flock (SheepView.tsx) and for the sheet of every kind of sheep (sheepSheet.ts): the
 * meshes a sheep is made of, each one instanced mesh for all of them, and the pass that poses a sheep into them.
 */

const PARTS = {
  legs: sheepLegs,
  fleece,
  sleek: fleeceSleek,
  felt: fleeceFelt,
  curls: fleeceCurls,
  sweater: fleeceSweater,
  sweaterColored: fleeceSweaterColored,
  skin: shorn,
  head: sheepHead,
  tuft: sheepTuft,
  lids: sheepLids,
  chute: parachute,
} satisfies Record<string, () => BufferGeometry>
export type SheepPart = keyof typeof PARTS
export type SheepMeshes = Record<SheepPart, InstancedMesh>
/** The parts tinted per sheep, by the colour of its fleece. */
const TINTED: readonly SheepPart[] = ['fleece', 'sleek', 'felt', 'curls', 'tuft']

/** Tints over the white fleece meshes: plain white, the bath's felt, a coloured sheep's colour. */
const WHITE = new Color('#ffffff'),
  FELT = new Color(LOOK.feltFleece),
  DYED = LOOK.fleeceColors.map((c) => new Color(c))
/** How the sweater, and then the curls, are fitted over each fleece. */
const FIT = Object.fromEntries(Object.entries(FLEECE_FIT).map(([k, f]) => [k, new Matrix4().compose(new Vector3(0, f.lift, 0), new Quaternion(), new Vector3(...f.scale))])) as Record<keyof typeof FLEECE_FIT, Matrix4>
const CURLS = Object.fromEntries(Object.entries(FLEECE_FIT).map(([k, f]) => [k, new Matrix4().makeScale(f.curls, f.curls, f.curls)])) as Record<keyof typeof FLEECE_FIT, Matrix4>

/** What a sheep looks like: its id (its colour, if dyed), how much fleece it has (0 shorn … 1 full), the salon's marks. */
export interface SheepLook {
  id: number
  wool: number
  marks: SheepMarks
}

/**
 * How a sheep is moving this frame: its head bowed by `nod`, its fleece swelling by `breath` (−1…1), its eyes shut, and
 * the parachute over it while it comes down (`dropPose`).
 */
export interface SheepMotion {
  nod: number
  breath: number
  blink: boolean
  chute?: Matrix4 | null
}
/** A sheep's own breathing and blinking at time `t`: slow and out of step with the others, a blink every few seconds. */
export function liveliness(id: number, t: number) {
  const every = 3.2 + (id % 5) * 0.45
  return { breath: Math.sin(t * 2.1 + id * 1.3), blink: (t + id * 1.37) % every < 0.14 }
}

/** The flock's meshes, room for `cap` sheep. */
export function sheepMeshes(cap: number): SheepMeshes {
  const out = {} as SheepMeshes
  for (const k of Object.keys(PARTS) as SheepPart[]) {
    const m = new InstancedMesh(PARTS[k](), sheepVmat(), cap)
    m.name = 'sheep_' + k
    m.count = 0
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    out[k] = m
  }
  // the tints from the start, so their shaders are built with them
  for (const k of TINTED) for (let i = 0; i < cap; i++) out[k].setColorAt(i, WHITE)
  return out
}

const _m = new Matrix4(),
  _p = new Vector3(),
  _q = new Quaternion(),
  _s = new Vector3(),
  _e = new Euler(),
  _over = new Matrix4(),
  _curls = new Matrix4()

/**
 * Poses sheep into the meshes, a frame at a time: `begin`, `add` each sheep where it stands, `end`. The fleece grows
 * from a pink shorn body to a big round cloud, and shows where the sheep has been in the salon (the author, 19.10.2026:
 * the sheep's path must be plain): sleek after the comb, matted after the bath, curls after the curling, a sweater after
 * the knitting, and the colour it took at the dye station (its tuft too; a coloured sweater is striped).
 */
export function sheepDrawer(meshes: SheepMeshes) {
  const n = Object.fromEntries(Object.keys(meshes).map((k) => [k, 0])) as Record<SheepPart, number>
  const put = (k: SheepPart, mx: Matrix4, c?: Color) => {
    if (c) meshes[k].setColorAt(n[k], c)
    meshes[k].setMatrixAt(n[k]++, mx)
  }
  return {
    begin() {
      for (const k of Object.keys(n) as SheepPart[]) n[k] = 0
    },
    /** One sheep standing at `base` (facing +X), moving by `mo`; the matrices the pointer reads go into `pose`. */
    add(s: SheepLook, base: Matrix4, mo: SheepMotion, pose: SheepPose) {
      pose.base.copy(base)
      pose.legs.copy(base)
      put('legs', pose.legs)
      // the fleece sits on the legs however big it is; the head comes a little down and back with it
      pose.woolly = s.wool > 0.12
      const k = pose.woolly ? 0.62 + 0.38 * s.wool : 0.62,
        m = s.marks,
        tint = !pose.woolly ? WHITE : m.dye ? DYED[s.id % DYED.length]! : m.bath ? FELT : WHITE
      const [fx, fy] = SHEEP_AT.fleece
      if (pose.woolly) {
        // breathing: the fleece swells a little, more up than out
        const b = mo.breath * 0.012
        pose.fleece.multiplyMatrices(base, _m.compose(_p.set(fx, 0.07 + (fy - 0.07) * k, 0), _q.identity(), _s.set(k * (1 + b * 0.5), k * (1 + b), k * (1 + b * 0.5))))
        // the salon's marks: the fleece itself (woolly, sleek or felted), then curls and a sweater over it
        const fleece = m.bath ? 'felt' : m.comb ? 'sleek' : 'fleece'
        put(fleece, pose.fleece, tint)
        _over.multiplyMatrices(pose.fleece, FIT[fleece])
        if (m.curl) put('curls', _curls.multiplyMatrices(_over, CURLS[fleece]), tint)
        if (m.knit) put(m.dye ? 'sweaterColored' : 'sweater', _over)
      } else {
        pose.fleece.multiplyMatrices(base, _m.makeTranslation(fx, 0.22, 0))
        put('skin', pose.fleece)
      }
      const [hx, hy] = SHEEP_AT.head
      pose.head.multiplyMatrices(base, _m.compose(_p.set(hx - (1 - k) * 0.15, hy - (1 - k) * 0.2, 0), _q.setFromEuler(_e.set(0, 0, mo.nod)), _s.set(1, 1, 1)))
      put('head', pose.head)
      put('tuft', pose.head, tint)
      if (mo.blink) put('lids', pose.head)
      if (mo.chute) put('chute', mo.chute)
    },
    end() {
      for (const k of Object.keys(n) as SheepPart[]) {
        const m = meshes[k]
        m.count = n[k]
        m.instanceMatrix.needsUpdate = true
        if (m.instanceColor) m.instanceColor.needsUpdate = true
      }
    },
  }
}

const _d = new Matrix4(),
  _y = new Matrix4()
/**
 * A bought sheep coming down (DROP), `e` seconds after it was bought, to stand at (x, z) facing `yaw`. Into `body` goes
 * the sheep's pose: swaying under the canopy as it sinks, slowing near the grass, then squashing on it and bouncing
 * back. Into `chute` goes the parachute's: over its back while it falls, then keeling over and folding away; false once
 * it has gone.
 */
export function dropPose(e: number, t: number, id: number, x: number, z: number, yaw: number, body: Matrix4, chute: Matrix4) {
  _y.makeRotationY(yaw)
  if (e < DROP.fall) {
    const k = e / DROP.fall,
      h = DROP.height * (1 - k) * (1 - 0.35 * k),
      calm = 1 - 0.7 * k
    // a pendulum hung from the canopy: the sheep swings under it
    const pivot = CHUTE.back + CHUTE.top
    _d.makeTranslation(x, h + pivot, z)
      .multiply(_m.makeRotationFromEuler(_e.set(Math.cos(t * 2.9 + id * 1.3) * 0.12 * calm, 0, Math.sin(t * 3.6 + id) * 0.22 * calm)))
      .multiply(_m.makeTranslation(0, -pivot, 0))
    body.multiplyMatrices(_d, _y)
    chute.copy(_d).multiply(_m.makeTranslation(0, CHUTE.back, 0)).multiply(_m.makeRotationY(t * 0.8))
    return true
  }
  const l = Math.min(1, (e - DROP.fall) / DROP.land),
    // squashed flat as it touches down, then springing back
    sy = 1 - 0.3 * Math.exp(-4 * l) * Math.cos(10 * l),
    sxz = 1 + (1 - sy) * 0.6
  body.makeTranslation(x, 0, z).multiply(_y).multiply(_m.makeScale(sxz, sy, sxz))
  // the canopy keels over to one side of it, in the sheep's own frame so never into its fleece: the far side from the
  // camera's usual place in the south, so it never hides the sheep's bounce
  const c = 1 - l,
    side = Math.cos(yaw) > 0 ? -1 : 1
  chute
    .makeTranslation(x, 0, z)
    .multiply(_y)
    .multiply(_m.makeTranslation(0, 0.15 + (CHUTE.back - 0.15) * c, side * 0.7 * Math.min(1, 1.8 * l)))
    .multiply(_d.makeRotationX(side * 1.1 * l))
    .multiply(_m.makeScale(c * (1 + 0.3 * l), c * c * 0.95 + 0.05, c * (1 + 0.3 * l)))
  return c > 0.02
}

/** A pose to fill, for a sheep the pointer does not need to find. */
export const newPose = (): SheepPose => ({ base: new Matrix4(), legs: new Matrix4(), fleece: new Matrix4(), head: new Matrix4(), woolly: true })
