import { Color, Euler, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three'
import { LOOK } from '@/game/balance'
import type { SheepMarks } from '@/game/world'
import { sheepVmat } from './kit'
import { FLEECE_FIT, SHEEP_AT, fleece, fleeceCurls, fleeceFelt, fleeceSleek, fleeceSweater, fleeceSweaterColored, sheepHead, sheepLegs, sheepLids, sheepTuft, shorn } from './models'
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

/** How a sheep is moving this frame: its head bowed by `nod`, its fleece swelling by `breath` (−1…1), its eyes shut. */
export interface SheepMotion {
  nod: number
  breath: number
  blink: boolean
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

/** A pose to fill, for a sheep the pointer does not need to find. */
export const newPose = (): SheepPose => ({ base: new Matrix4(), legs: new Matrix4(), fleece: new Matrix4(), head: new Matrix4(), woolly: true })
