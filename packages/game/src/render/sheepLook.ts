import { Color, Euler, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three'
import { DROP, LOOK } from '@/game/balance'
import type { NeedId } from '@/game/balance'
import { upload } from './instancing'
import { sheepVmat } from './kit'
import { CHUTE, FLEECE_FIT, SHEEP_AT, plain, parachute, fleece, fleeceBurrs, fleeceFelt, fleeceMud, sheepHead, sheepLegs, sheepLids, sheepShade, sheepShadeHead, sheepShadeSkin, sheepTuft, shorn } from './models'
import type { SheepPose } from './pick'

/**
 * How one sheep is drawn, for the flock (SheepView.tsx) and for the sheet of every kind of sheep (sheepSheet.ts): the
 * meshes a sheep is made of, each one instanced mesh for all of them, and the pass that poses a sheep into them.
 */

const PARTS = {
  legs: sheepLegs,
  fleece,
  felt: fleeceFelt,
  burrs: fleeceBurrs,
  mud: fleeceMud,
  skin: shorn,
  head: sheepHead,
  tuft: sheepTuft,
  lids: sheepLids,
  chute: parachute,
  shade: sheepShade,
  shadeSkin: sheepShadeSkin,
  shadeHead: sheepShadeHead,
} satisfies Record<string, () => BufferGeometry>
export type SheepPart = keyof typeof PARTS
export type SheepMeshes = Record<SheepPart, InstancedMesh>
/** The parts tinted per sheep, by the colour of its fleece. */
const TINTED: readonly SheepPart[] = ['fleece', 'felt', 'burrs', 'mud', 'tuft']
/**
 * The parts drawn only into the sun's shadow map (models.ts, `sheepShade`): the sheep's shadow from a few plain lumps.
 * Of the parts seen, only the legs and the parachute cast their own.
 */
const SHADES: readonly SheepPart[] = ['shade', 'shadeSkin', 'shadeHead']
const CASTS: readonly SheepPart[] = ['legs', 'chute', ...SHADES]
/** The parts seen that have a plain build for the flock far off (models.ts `plain`); the rest are cheap already. */
const PLAINED: readonly SheepPart[] = ['legs', 'fleece', 'felt', 'burrs', 'mud', 'skin', 'head', 'tuft', 'lids']

/** Tints over the white meshes: clean white, a tangled sheep's matted cream; the mud's brown, the burrs' brown. */
const WHITE = new Color('#ffffff'),
  FELT = new Color(LOOK.feltFleece),
  DIRT = new Color(LOOK.dirtFleece),
  BURRS = new Color(LOOK.burrs)
/** How the shadow lump, and then the burrs and the mud, are fitted over each fleece. */
const FIT = Object.fromEntries(Object.entries(FLEECE_FIT).map(([k, f]) => [k, new Matrix4().compose(new Vector3(0, f.lift, 0), new Quaternion(), new Vector3(...f.scale))])) as Record<keyof typeof FLEECE_FIT, Matrix4>
const BURRS_FIT = Object.fromEntries(Object.entries(FLEECE_FIT).map(([k, f]) => [k, new Matrix4().makeScale(f.burrs, f.burrs, f.burrs)])) as Record<keyof typeof FLEECE_FIT, Matrix4>

/** What a sheep looks like: its id, how much fleece it has (0 shorn … 1 full), what it still needs before shearing. */
export interface SheepLook {
  id: number
  wool: number
  needs: readonly NeedId[]
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
/** A sheep's own breathing and blinking at time `t`, into `mo`: slow and out of step with the others, a blink every few seconds. */
export function liveliness(id: number, t: number, mo: SheepMotion) {
  const every = 3.2 + (id % 5) * 0.45
  mo.breath = Math.sin(t * 2.1 + id * 1.3)
  mo.blink = (t + id * 1.37) % every < 0.14
  return mo
}

/** The flock's meshes, room for `cap` sheep. */
export function sheepMeshes(cap: number): SheepMeshes {
  const out = {} as SheepMeshes
  for (const k of Object.keys(PARTS) as SheepPart[]) {
    const m = new InstancedMesh(PARTS[k](), sheepVmat(), cap)
    m.name = 'sheep_' + k
    m.count = 0
    m.castShadow = CASTS.includes(k)
    m.receiveShadow = !SHADES.includes(k)
    m.frustumCulled = false
    // a shadow-only part draws none in the frame itself: its sheep are counted in for the shadow map alone
    if (SHADES.includes(k)) {
      m.userData.casts = 0
      m.onBeforeShadow = () => void (m.count = m.userData.casts as number)
      m.onAfterShadow = () => void (m.count = 0)
    }
    out[k] = m
  }
  // the tints from the start, so their shaders are built with them
  for (const k of TINTED) for (let i = 0; i < cap; i++) out[k].setColorAt(i, WHITE)
  return out
}

const _m = new Matrix4(),
  _e = new Euler(),
  _over = new Matrix4(),
  _burrs = new Matrix4()

/**
 * A sheep's whole pose, written straight into `m`: standing at (x, y, z), turned `yaw` about the vertical, rocked `roll`
 * about its length (a waddle) — the Euler YXZ turn, without the quaternion `compose` makes (a big flock is posed
 * every frame, and this is most of it).
 */
export function standAt(m: Matrix4, x: number, y: number, z: number, yaw: number, roll: number) {
  const e = m.elements,
    cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cr = Math.cos(roll),
    sr = Math.sin(roll)
  e[0] = cy
  e[1] = 0
  e[2] = -sy
  e[3] = 0
  e[4] = sy * sr
  e[5] = cr
  e[6] = cy * sr
  e[7] = 0
  e[8] = sy * cr
  e[9] = -sr
  e[10] = cy * cr
  e[11] = 0
  e[12] = x
  e[13] = y
  e[14] = z
  e[15] = 1
  return m
}
/** `out` = `a` · moved by (tx, ty, 0) · scaled by (sx, sy, sz) — a part sitting on the sheep, grown or not. */
function onPart(out: Matrix4, a: Matrix4, tx: number, ty: number, sx: number, sy: number, sz: number) {
  const o = out.elements,
    e = a.elements
  for (let i = 0; i < 4; i++) {
    o[12 + i] = e[i]! * tx + e[4 + i]! * ty + e[12 + i]!
    o[i] = e[i]! * sx
    o[4 + i] = e[4 + i]! * sy
    o[8 + i] = e[8 + i]! * sz
  }
  return out
}
/** `out` = `a` · moved by (tx, ty, 0) · tilted `nod` about the sheep's side (the head bowing). */
function onNod(out: Matrix4, a: Matrix4, tx: number, ty: number, nod: number) {
  const o = out.elements,
    e = a.elements,
    c = Math.cos(nod),
    s = Math.sin(nod)
  for (let i = 0; i < 4; i++) {
    const x = e[i]!,
      y = e[4 + i]!
    o[12 + i] = x * tx + y * ty + e[12 + i]!
    o[i] = x * c + y * s
    o[4 + i] = y * c - x * s
    o[8 + i] = e[8 + i]!
  }
  return out
}

/**
 * Poses sheep into the meshes, a frame at a time: `begin` (`far`: the plain builds, for the flock seen from far off),
 * `add` each sheep where it stands, `end`. The fleece grows
 * from a pink shorn body to a big round cloud, and shows what the sheep still needs (GDD 5): a dirty one is splashed
 * with mud, a tangled one shaggy with matted clumps, one with burrs stuck all over with brown burrs; a clean white
 * cloud is ready for shearing. Each station takes its mark off as it works.
 */
export function sheepDrawer(meshes: SheepMeshes) {
  const parts = Object.keys(meshes) as SheepPart[]
  const n = Object.fromEntries(parts.map((k) => [k, 0])) as Record<SheepPart, number>
  // each part's geometry up close and far off
  const near = Object.fromEntries(parts.map((k) => [k, meshes[k].geometry])) as Record<SheepPart, BufferGeometry>
  const far = Object.fromEntries(parts.map((k) => [k, PLAINED.includes(k) ? plain(PARTS[k]) : meshes[k].geometry])) as Record<SheepPart, BufferGeometry>
  let farOff = false
  const put = (k: SheepPart, mx: Matrix4, c?: Color) => {
    // past the meshes' room a sheep is left out: a count over it would lose the whole flock's draw
    if (n[k] >= meshes[k].instanceMatrix.count) return
    if (c) meshes[k].setColorAt(n[k], c)
    meshes[k].setMatrixAt(n[k]++, mx)
  }
  return {
    begin(isFar = false) {
      for (const k of parts) n[k] = 0
      if (isFar === farOff) return
      farOff = isFar
      for (const k of parts) meshes[k].geometry = isFar ? far[k] : near[k]
    },
    /** One sheep standing at `base` (facing +X), moving by `mo`; the matrices the pointer reads go into `pose`. */
    add(s: SheepLook, base: Matrix4, mo: SheepMotion, pose: SheepPose) {
      if (base !== pose.base) pose.base.copy(base)
      pose.legs.copy(base)
      put('legs', pose.legs)
      // the fleece sits on the legs however big it is; the head comes a little down and back with it
      pose.woolly = s.wool > 0.12
      const k = pose.woolly ? 0.62 + 0.38 * s.wool : 0.62,
        tangled = s.needs.includes('comb'),
        tint = pose.woolly && tangled ? FELT : WHITE
      const [fx, fy] = SHEEP_AT.fleece
      if (pose.woolly) {
        // breathing: the fleece swells a little, more up than out
        const b = mo.breath * 0.012
        onPart(pose.fleece, base, fx, 0.07 + (fy - 0.07) * k, k * (1 + b * 0.5), k * (1 + b), k * (1 + b * 0.5))
        // what it needs: the fleece itself (woolly or shaggy), then mud and burrs on it
        const fleece = tangled ? 'felt' : 'fleece'
        put(fleece, pose.fleece, tint)
        _over.multiplyMatrices(pose.fleece, FIT[fleece])
        if (s.needs.includes('wash') || s.needs.includes('pick')) _burrs.multiplyMatrices(_over, BURRS_FIT[fleece])
        if (s.needs.includes('wash')) put('mud', _burrs, DIRT)
        if (s.needs.includes('pick')) put('burrs', _burrs, BURRS)
        put('shade', _over)
      } else {
        onPart(pose.fleece, base, fx, 0.22, 1, 1, 1)
        put('skin', pose.fleece)
        put('shadeSkin', pose.fleece)
      }
      const [hx, hy] = SHEEP_AT.head
      onNod(pose.head, base, hx - (1 - k) * 0.15, hy - (1 - k) * 0.2, mo.nod)
      put('head', pose.head)
      put('tuft', pose.head, tint)
      put('shadeHead', pose.head)
      if (mo.blink) put('lids', pose.head)
      if (mo.chute) put('chute', mo.chute)
    },
    end() {
      for (const k of Object.keys(n) as SheepPart[]) {
        const m = meshes[k]
        m.count = n[k]
        if (SHADES.includes(k)) {
          m.userData.casts = n[k]
          m.count = 0
        }
        upload(m, n[k])
      }
    },
  }
}

const _d = new Matrix4(),
  _y = new Matrix4()
/**
 * An arriving sheep coming down (DROP), `e` seconds after it set off, to stand at (x, z) facing `yaw`. Into `body` goes
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
export const newPose = (): SheepPose => ({ base: new Matrix4(), legs: new Matrix4(), fleece: new Matrix4(), head: new Matrix4(), woolly: true, seen: 0 })
