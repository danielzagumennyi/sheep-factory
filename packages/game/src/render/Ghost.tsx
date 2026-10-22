import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { BufferGeometry, Color, ExtrudeGeometry, Float32BufferAttribute, MeshBasicMaterial, MeshToonMaterial, RingGeometry, ShaderMaterial, Shape, Sprite, Vector2, Vector3, type Group, type Mesh } from 'three'
import { BUILDINGS, CARROT, DIRS, LIGHT, LOOK, SCARE, WATER_REACH, type BuildingId, type Dir, dimsOf } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { anchorAt, buildPrice, circle, footprint, get, inCells, inGood, inGrid, outCells, outGood, terr, whyNot } from '@/game/grid'
import { pathDirs, routeCells } from '@/game/actions/path'
import { Flock, GameState, Plant, Ui, blankBuilding, isOn, key, res } from '@/game/world'
import { RING_IN, RING_OUT, badgeMaterial } from './iconSprite'
import { useT } from '@/i18n'
import { UI } from '@/i18n/ui'
import { WHY_TEXT } from '@/i18n/content'
import { Icon } from '@/ui/Icon'
import { GEO, flat, machineYaw, toonBands, vmat, yawOf } from './kit'
import { Batch, useInstanced } from './instancing'
import { machineBody, machineModel } from './machineModels'
import { drawBelt, useBeltPieces } from './Belts'
import { reach } from './reach'
import { cam } from './camera'
import { hillHeight } from './hillShape'
import { markOutlined, unmarkOutlined } from '@kit/outline'

/**
 * Placing, after Tower Factory (the author's screenshot of a belt piece in hand): what is held — a building or a line
 * of belt, the same way — is its own model in its own colours, turned as it will stand, held up on a see-through
 * sky-blue block that fills the gap to the ground, the model outlined in cream; a pink arrow before it shows the way
 * in, a periwinkle one after it the way out, and the ways in and out of whatever stands right next to it show too, so
 * it can be lined up (the author). A carrot's circle, a scarecrow's and a wash's reach for water tint everything inside
 * them a cool blue (reach.ts) inside a lemon border; thin lemon dashes run to the carrot from the fluffy sheep it calls,
 * and to the wash from the water it reaches. Where it can't stand, or there aren't the coins for it, the block and the
 * outline go red, the model reddens a little, and the reason shows above it.
 */
/** `chip`: the icon badge beside an arrow, its size and how far past the arrow it sits (cells). */
const PLACE = { lift: 0.24, sway: 0.008, arrowOut: 0.3, arrowFar: 0.45, chip: 0.42, chipGap: 0.4, chips: 48 } as const
/**
 * What is held keeps its own colours, outside a circle's tint (a critic: the tint greyed the building in hand);
 * where it can't stand, it only reddens a little: the red block and line say it.
 */
const HELD_MAT = new MeshToonMaterial({ vertexColors: true, gradientMap: toonBands })
const BLOCKED_MAT = new MeshToonMaterial({ vertexColors: true, color: LOOK.blockedTint, gradientMap: toonBands })
/** The in and out arrows draw over everything, so no model or belt ever hides one (the author). */
const arrowMat = (c: string) => new MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, toneMapped: false })
const ARROW_IN = arrowMat(LOOK.arrowIn),
  ARROW_OUT = arrowMat(LOOK.arrowOut)
/** The dashes to the sheep and the water draw over everything, like a line on the screen. */
const DASH_MAT = new MeshBasicMaterial({ color: LOOK.reachDash, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, toneMapped: false })

/** Where the sun comes from, along the ground. */
const SUN = new Vector2(LIGHT.sunFrom[0], LIGHT.sunFrom[2]).normalize()
/**
 * The block under what is held: its sides pale where they face the sun and a deep blue where they face away (so it
 * agrees with the scene's light whichever way the camera has turned), more solid at the foot than at the top; its
 * floor a flat sky blue. Solid enough that the grass under it doesn't turn it teal (a critic).
 */
function blockMaterial(light: string, dark: string, floor: string) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uLight: { value: new Color(light) }, uDark: { value: new Color(dark) }, uFloor: { value: new Color(floor) }, uSun: { value: SUN } },
    vertexShader: `varying float vH; varying vec3 vN;
      void main() {
        vH = position.y;
        vN = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: `uniform vec3 uLight; uniform vec3 uDark; uniform vec3 uFloor; uniform vec2 uSun; varying float vH; varying vec3 vN;
      void main() {
        vec3 c = mix( uDark, uLight, clamp( 0.5 + 0.7 * dot( vN.xz, uSun ), 0.0, 1.0 ) );
        gl_FragColor = vN.y > 0.5 ? vec4( uFloor, 0.55 ) : vec4( c, mix( 0.86, 0.66, clamp( vH, 0.0, 1.0 ) ) );
        #include <colorspace_fragment>
      }`,
  })
}
const BLOCK_OK = blockMaterial(LOOK.blockLight, LOOK.blockDark, LOOK.blockFloor)
const BLOCK_BAD = blockMaterial(LOOK.blockBadLight, LOOK.blockBadDark, LOOK.blockBadFloor)

const geos = new Map<string, BufferGeometry>()
/**
 * The block under a set of cells, one unit high (the mesh is scaled to the lift): a floor on each cell and a side only
 * where the set ends, so a line of belt stands on one block with no walls inside it.
 */
function blockOf(cells: readonly (readonly [number, number])[]) {
  const k = cells.map((c) => c[0] + ',' + c[1]).join(';')
  let g = geos.get(k)
  if (g) return g
  const has = new Set(cells.map((c) => c[0] + ',' + c[1]))
  const pos: number[] = [],
    nor: number[] = []
  const v = new Vector3(),
    u = new Vector3(),
    n = new Vector3()
  // a quad a-b-c-d facing n: wound so its front is the side n points to
  const quad = (q: number[][], nx: number, ny: number, nz: number) => {
    const [a, b, c, d] = q as [number[], number[], number[], number[]]
    v.set(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!)
    u.set(c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!)
    const flip = n.crossVectors(v, u).dot(new Vector3(nx, ny, nz)) < 0
    for (const p of flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d]) {
      pos.push(...p)
      nor.push(nx, ny, nz)
    }
  }
  for (const [x, z] of cells) {
    quad([[x, 0.004, z], [x + 1, 0.004, z], [x + 1, 0.004, z + 1], [x, 0.004, z + 1]], 0, 1, 0)
    if (!has.has(x + 1 + ',' + z)) quad([[x + 1, 0, z], [x + 1, 0, z + 1], [x + 1, 1, z + 1], [x + 1, 1, z]], 1, 0, 0)
    if (!has.has(x - 1 + ',' + z)) quad([[x, 0, z], [x, 0, z + 1], [x, 1, z + 1], [x, 1, z]], -1, 0, 0)
    if (!has.has(x + ',' + (z + 1))) quad([[x, 0, z + 1], [x + 1, 0, z + 1], [x + 1, 1, z + 1], [x, 1, z + 1]], 0, 0, 1)
    if (!has.has(x + ',' + (z - 1))) quad([[x, 0, z], [x + 1, 0, z], [x + 1, 1, z], [x, 1, z]], 0, 0, -1)
  }
  g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  geos.set(k, g)
  if (geos.size > 400) geos.delete(geos.keys().next().value!)
  return g
}

/** A chunky flat arrow pointing along +X, its corners soft: the way in or out. */
const arrowGeo = (() => {
  const s = new Shape()
  s.moveTo(-0.2, -0.075)
  s.lineTo(0.02, -0.075)
  s.lineTo(0.02, -0.17)
  s.lineTo(0.22, 0)
  s.lineTo(0.02, 0.17)
  s.lineTo(0.02, 0.075)
  s.lineTo(-0.2, 0.075)
  s.closePath()
  return new ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.025, bevelSegments: 2 }).rotateX(-Math.PI / 2)
})()

/** The lemon border of a circle of radius r: a ring 0.1 wide round it, flat on the ground, centred on the origin. */
const borders = new Map<number, RingGeometry>()
const borderGeo = (r: number) => {
  let g = borders.get(r)
  if (!g) borders.set(r, (g = new RingGeometry(r - 0.05, r + 0.05, 72).rotateX(-Math.PI / 2) as RingGeometry))
  return g
}
/** A building's circle on the ground (reach.ts): the carrot's, the scarecrow's, the wash's reach for water. */
const circleOf = (type: BuildingId) => {
  const d = BUILDINGS[type]
  return d.lure ? CARROT.radius : d.scare ? SCARE.radius : d.needsWater ? WATER_REACH : 0
}

/**
 * What the pointer is about to do: the building in hand (or one being moved) at the hover cell turned the way the
 * player chose (R), its way in and way out, its circle, a belt line's pieces and price, the reason it can't be built;
 * with the hand, the hovered building's circle and its in and out; with the clearing tool, a red frame and the refund.
 */
export function Ghost() {
  const { world } = useGame()
  const { t } = useT()
  const ghost = useRef<Group>(null)
  const body = useRef<Mesh>(null)
  const block = useRef<Mesh>(null)
  const border = useRef<Mesh>(null)
  const sel = useRef<Mesh>(null)
  const frameM = useInstanced(GEO.box(), flat(LOOK.bad, 0.9), 8, 'ghost_frame', false)
  const inArrows = useInstanced(arrowGeo, ARROW_IN, 64, 'ghost_in_arrows', false)
  const outArrows = useInstanced(arrowGeo, ARROW_OUT, 64, 'ghost_out_arrows', false)
  const dashes = useInstanced(GEO.box(), DASH_MAT, 900, 'ghost_reach_dashes', false)
  const belt = useBeltPieces(160, 'ghost_belt', false)
  const b = useMemo(() => ({ frame: new Batch(frameM), inArrows: new Batch(inArrows), outArrows: new Batch(outArrows), dashes: new Batch(dashes) }), [frameM, inArrows, outArrows, dashes])
  // the icon beside each arrow: what goes in or comes out there (the `portIcons` system)
  const chips = useMemo(
    () =>
      Array.from({ length: PLACE.chips }, () => {
        const c = new Sprite()
        c.renderOrder = 31
        c.visible = false
        c.scale.setScalar(PLACE.chip)
        return c
      }),
    [],
  )
  dashes.renderOrder = 20
  inArrows.renderOrder = outArrows.renderOrder = 30
  // the line of belt in hand is outlined as one thing, as a building in hand is
  const beltLine = useRef<Group>(null)
  const beltOutlined = useRef<'' | 'place' | 'blocked'>('')
  // the outline round the building in hand: cream, or red where it can't stand
  const tint = useRef<'' | 'place' | 'blocked'>('')
  const building = useRef(false)
  const [label, setLabel] = useState<{ x: number; y: number; z: number; text: string; tone: string; icon?: string } | null>(null)
  const last = useRef('')
  useFrame((state) => {
    const ui = res(world, Ui),
      h = ui.hover,
      time = state.clock.elapsedTime
    for (const q of [...Object.values(b), ...Object.values(belt)]) q.begin()
    let nChip = 0
    const icons = isOn(world, 'portIcons')
    let lab: typeof label = null
    if (ghost.current) ghost.current.visible = false
    if (block.current) block.current.visible = false
    if (border.current) border.current.visible = false
    reach.uReachOn.value = 0
    let held = false,
      beltHeld: '' | 'place' | 'blocked' = ''
    // over a hill, over its top
    const lift = PLACE.lift + Math.sin(time * 3) * PLACE.sway + (h ? hillHeight(h.x + 0.5, h.y + 0.5) : 0)
    // bubbles over sheep and machines step back while something is being built
    const nowBuilding = ui.tool !== 'hand'
    if (nowBuilding !== building.current) {
      building.current = nowBuilding
      document.body.classList.toggle('is-building', nowBuilding)
    }
    /** The block under these cells, at this height, red if `bad`. */
    const showBlock = (cells: readonly (readonly [number, number])[], y: number, bad: boolean) => {
      if (!block.current) return
      block.current.geometry = blockOf(cells)
      block.current.material = bad ? BLOCK_BAD : BLOCK_OK
      block.current.scale.y = y
      block.current.visible = true
    }
    // up the screen, along the ground: an arrow beyond an edge facing that way stands further out, clear of the model
    const fx = -Math.sin(cam.yaw),
      fz = -Math.cos(cam.yaw)
    /** An arrow just outside the edge (ex, ez), along d: into it (the way in) or out of it; past it, the icon of what goes through. */
    const arrow = (ex: number, ez: number, d: number, into: boolean, y: number, kind?: string | null) => {
      const [dx, dz] = DIRS[d]!,
        side = into ? -1 : 1,
        away = (dx * fx + dz * fz) * side > 0.5
      const k = side * (away ? PLACE.arrowFar : PLACE.arrowOut)
      ;(into ? b.inArrows : b.outArrows).put(ex + dx * k, y, ez + dz * k, yawOf(d))
      if (!kind || !icons || nChip >= chips.length) return
      const c = chips[nChip++]!,
        far = k + side * PLACE.chipGap
      c.material = badgeMaterial(kind, into ? RING_IN : RING_OUT)
      c.position.set(ex + dx * far, y + 0.2, ez + dz * far)
      c.visible = true
    }
    // every way in and out of a building, at height `at` — the same for every building, from the rules (inCells,
    // outCells)
    const showFlow = (type: BuildingId | 'dock', x: number, y: number, dir: Dir, at: number, probe = blankBuilding(type, x, y, dir)) => {
      for (const c of outCells(probe)) arrow(c.sx + 0.5 + DIRS[c.d]![0] * 0.5, c.sy + 0.5 + DIRS[c.d]![1] * 0.5, c.d, false, at, outGood(probe, c))
      for (const i of inCells(world, probe)) arrow(i.sx + 0.5 - DIRS[i.d]![0] * 0.5, i.sy + 0.5 - DIRS[i.d]![1] * 0.5, i.d, true, at, inGood(probe, i))
    }
    /**
     * The ways in and out of what stands right next to these cells (the author: the neighbours' ports while building,
     * but no «мессиво из стрелок»): only a port whose outside cell touches the cells, corners included, and never a
     * plain belt's.
     */
    const showNear = (cells: readonly (readonly [number, number])[]) => {
      const near = new Set<string>()
      for (const [x, y] of cells) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near.add(key(x + dx, y + dy))
      for (const nb of res(world, Plant).b.values()) {
        if (nb.type === 'belt') continue
        for (const c of outCells(nb)) if (near.has(key(c.x, c.y))) arrow(c.sx + 0.5 + DIRS[c.d]![0] * 0.5, c.sy + 0.5 + DIRS[c.d]![1] * 0.5, c.d, false, 0.3, outGood(nb, c))
        for (const i of inCells(world, nb)) if (near.has(key(i.x, i.y))) arrow(i.sx + 0.5 - DIRS[i.d]![0] * 0.5, i.sy + 0.5 - DIRS[i.d]![1] * 0.5, i.d, true, 0.3, inGood(nb, i))
      }
    }
    /** A dashed lemon line from (fx, fz) towards the middle of the footprint, up to its edge. */
    const run = (time * 0.4) % 0.24
    const dashTo = (fx: number, fz: number, x: number, y: number, bw: number, bh: number) => {
      const cx = x + bw / 2,
        cz = y + bh / 2
      const dx = cx - fx,
        dz = cz - fz,
        len = Math.hypot(dx, dz)
      if (len < 0.01) return
      const yaw = Math.atan2(-dz, dx)
      for (let d = 0.12 + run * 0.5; d < len; d += 0.24) {
        const px = fx + (dx / len) * d,
          pz = fz + (dz / len) * d
        if (px > x - 0.02 && px < x + bw + 0.02 && pz > y - 0.02 && pz < y + bh + 0.02) break
        b.dashes.put(px, 0.12, pz, yaw, 0.12, 0.01, 0.035)
      }
    }
    /**
     * A building's circle (circleOf): everything inside it goes a cool blue (reach.ts), a lemon line round it. A carrot
     * draws a dash from every fluffy sheep it calls and says how many; a wash, from the water it reaches; a scarecrow
     * says how many sheep it will drive out.
     */
    const showCircle = (type: BuildingId, x: number, y: number, bw: number, bh: number) => {
      const r = circleOf(type)
      if (!r) return null
      const cx = x + bw / 2,
        cz = y + bh / 2
      reach.uReach.value.set(cx, cz, 0)
      reach.uReachR.value = r
      reach.uReachOn.value = 1
      if (border.current) {
        border.current.geometry = borderGeo(r)
        border.current.position.set(cx, 0.05, cz)
        border.current.visible = true
      }
      const def = BUILDINGS[type]
      if (def.needsWater) {
        for (const c of circle(x, y, bw, bh, r)) if (terr(world, c.x, c.y) === 'water') dashTo(c.x + 0.5, c.y + 0.5, x, y, bw, bh)
        return null
      }
      let n = 0
      for (const s of res(world, Flock).sheep) {
        if (s.state !== 'roam' || s.drop !== undefined || (s.px - cx) ** 2 + (s.py - cz) ** 2 > r * r) continue
        if (def.lure && s.wool < 1) continue
        n++
        if (def.lure) dashTo(s.px, s.py, x, y, bw, bh)
      }
      // how many, on its edge up and to the right
      return { x: cx + r * 0.72, y: 0.3, z: cz - r * 0.72, text: String(n), tone: n || def.scare ? 'ink' : 'bad', icon: 'sheep' }
    }
    const hovered = h?.b ? (res(world, Plant).b.get(h.b) ?? null) : null
    if (h && inGrid(h.x, h.y)) {
      const tool = ui.tool
      if (tool === 'hand') {
        const hb = hovered
        if (hb) {
          if (hb.type !== 'dock') lab = showCircle(hb.type, hb.x, hb.y, hb.w, hb.h)
          // every building the same, the portal too: its ways in and out, above the belts that may run up to it
          showFlow(hb.type, hb.x, hb.y, hb.dir, 0.3, hb)
        }
      } else if (tool === 'erase') {
        const hb = hovered ?? get(world, h.x, h.y)
        if (hb && !hb.fixed) {
          b.frame.put(hb.x + hb.w / 2, 0.5, hb.y + hb.h / 2, 0, hb.w - 0.04, 0.96, hb.h - 0.04)
          lab = { x: hb.x + hb.w / 2, y: 0.9, z: hb.y + 0.1, text: '+' + hb.paid, tone: 'bad' }
        }
      } else if (tool === 'belt') {
        // the line in hand is held like a building: its pieces up on one block, a pink arrow in, a periwinkle one out
        const phase = (time * 0.9) % 1
        const coins = res(world, GameState).coins
        const line = (cells: { x: number; y: number }[], dirs: Dir[], short = false) => {
          cells.forEach((c, i) => {
            const ex = get(world, c.x, c.y)
            if (!ex || ex.type === 'belt') drawBelt(belt, c.x, c.y, i > 0 ? dirs[i - 1]! : dirs[i]!, dirs[i]!, phase, lift)
          })
          showBlock(
            cells.map((c) => [c.x, c.y] as const),
            lift,
            short,
          )
          const a = cells[0]!,
            z = cells[cells.length - 1]!,
            d0 = dirs[0]!,
            d1 = dirs[dirs.length - 1]!
          arrow(a.x + 0.5 - DIRS[d0]![0] * 0.5, a.y + 0.5 - DIRS[d0]![1] * 0.5, d0, true, lift)
          arrow(z.x + 0.5 + DIRS[d1]![0] * 0.5, z.y + 0.5 + DIRS[d1]![1] * 0.5, d1, false, lift)
          // what stands by its ends, so the line can be led into it
          showNear(cells.length > 1 ? [[a.x, a.y], [z.x, z.y]] : [[a.x, a.y]])
          beltHeld = short ? 'blocked' : 'place'
        }
        const bad = () => {
          showBlock([[h.x, h.y]], lift, true)
          beltHeld = 'blocked'
        }
        if (ui.pending) {
          const list = routeCells(world, ui.pending, h)
          if (list) {
            const cost = list.filter((c) => !get(world, c.x, c.y)).length * BUILDINGS.belt.cost
            line(list, pathDirs(world, list, ui.rot), coins < cost)
            // the price beside the pointer, half a cell to the right on the screen, clear of the arrow at the end
            lab = { x: h.x + 0.5 + Math.cos(cam.yaw) * 0.5, y: lift + 0.55, z: h.y + 0.5 - Math.sin(cam.yaw) * 0.5, text: String(cost), tone: coins >= cost ? 'ink' : 'bad', icon: 'coin' }
          } else bad()
        } else {
          const why = whyNot(world, 'belt', h.x, h.y)
          // a belt cell being moved can't come down on another belt; a new one turns the belt it is put on
          const onBelt = !ui.moving && get(world, h.x, h.y)?.type === 'belt'
          const short = !ui.moving && !onBelt && coins < BUILDINGS.belt.cost
          if (why && !onBelt) {
            bad()
            lab = { x: h.x + 0.5, y: lift + 0.6, z: h.y + 0.6, text: t(WHY_TEXT[why]), tone: 'bad' }
          } else {
            // a single cell goes the way its neighbours suggest; one being moved goes as the player turned it
            line([{ x: h.x, y: h.y }], ui.moving ? [ui.rot] : pathDirs(world, [{ x: h.x, y: h.y }], ui.rot), short)
            if (short) lab = { x: h.x + 0.5, y: lift + 0.6, z: h.y + 0.6, text: t(UI.noCoins), tone: 'bad', icon: 'coin' }
          }
        }
      } else {
        const type = tool as BuildingId
        // centred on the pointer and turned as the player chose (a 2×1 lies along its output)
        const [bw, bh] = dimsOf(type, ui.rot),
          [ax, ay] = anchorAt(type, ui.rot, h.wx, h.wy)
        const why = whyNot(world, type, ax, ay, ui.rot)
        // a move is free; a new building needs its coins (the author: the hand said nothing about them)
        const short = !why && !ui.moving && res(world, GameState).coins < buildPrice(world, type)
        if (ghost.current && body.current) {
          ghost.current.visible = true
          held = true
          ghost.current.position.set(ax + bw / 2, lift, ay + bh / 2)
          // the building itself, in its own colours, turned as it will stand
          body.current.geometry = machineBody(type)
          body.current.material = why || short ? BLOCKED_MAT : HELD_MAT
          body.current.rotation.y = machineYaw(type, ui.rot)
          showBlock(footprint(ax, ay, bw, bh), lift, !!why || short)
          const want = why || short ? 'blocked' : 'place'
          if (tint.current !== want) {
            if (tint.current) unmarkOutlined(body.current)
            markOutlined(body.current, want, true)
            tint.current = want
          }
        }
        const over = machineModel(type).top + lift + 0.6
        // its circle shows where it can't stand too: the place is chosen by it
        const circleLab = showCircle(type, ax, ay, bw, bh)
        if (why) lab = { x: ax + bw / 2, y: over, z: ay + bh / 2, text: t(WHY_TEXT[why]), tone: 'bad' }
        else {
          lab = circleLab
          if (short) lab = { x: ax + bw / 2, y: over, z: ay + bh / 2, text: t(UI.noCoins), tone: 'bad', icon: 'coin' }
          showFlow(type, ax, ay, ui.rot, lift)
          showNear(footprint(ax, ay, bw, bh))
        }
      }
    }
    // the selected building
    const s = ui.sel
    if (sel.current) {
      const sb = s?.kind === 'b' ? res(world, Plant).b.get(s.key) : null
      sel.current.visible = !!sb
      if (sb) {
        sel.current.position.set(sb.x + sb.w / 2, 0.02, sb.y + sb.h / 2)
        sel.current.scale.set(sb.w, 0.02, sb.h)
      }
    }
    for (const q of [...Object.values(b), ...Object.values(belt)]) q.end()
    for (let i = nChip; i < chips.length; i++) chips[i]!.visible = false
    // nothing in hand: its outline goes
    if (!held && tint.current && body.current) {
      unmarkOutlined(body.current)
      tint.current = ''
    }
    if (beltLine.current && beltHeld !== beltOutlined.current) {
      if (beltOutlined.current) unmarkOutlined(beltLine.current)
      if (beltHeld) markOutlined(beltLine.current, beltHeld, true)
      beltOutlined.current = beltHeld
    }
    const sig = lab ? lab.x + ',' + lab.y + ',' + lab.z + lab.text + lab.tone + lab.icon : ''
    if (sig !== last.current) {
      last.current = sig
      setLabel(lab)
    }
  })
  return (
    <group>
      <group ref={ghost} visible={false}>
        <mesh ref={body} geometry={GEO.box()} material={vmat()} castShadow />
      </group>
      <mesh ref={block} geometry={GEO.box()} material={BLOCK_OK} visible={false} renderOrder={4} />
      <mesh ref={border} geometry={borderGeo(CARROT.radius)} material={flat(LOOK.reachEdge, 0.95)} position-y={0.05} visible={false} />
      <mesh ref={sel} geometry={GEO.box()} material={flat(LOOK.accent, 0.5)} scale={[1, 0.02, 1]} visible={false} />
      {Object.values(b).map((q) => (
        <primitive key={q.mesh.name} object={q.mesh} />
      ))}
      {chips.map((c, i) => (
        <primitive key={'chip' + i} object={c} />
      ))}
      <group ref={beltLine}>
        {Object.values(belt).map((q) => (
          <primitive key={q.mesh.name} object={q.mesh} />
        ))}
      </group>
      {label && (
        <Html position={[label.x, label.y, label.z]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <span className={'tag tag--ghost tag--' + label.tone}>
            {label.icon && <Icon kind={label.icon} size={14} />}
            {label.text}
          </span>
        </Html>
      )}
    </group>
  )
}
