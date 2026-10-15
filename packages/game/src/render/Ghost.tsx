import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { BufferGeometry, Color, ExtrudeGeometry, Float32BufferAttribute, MeshBasicMaterial, MeshToonMaterial, RingGeometry, ShaderMaterial, Shape, Vector2, Vector3, type Group, type Mesh } from 'three'
import { BUILDINGS, DIRS, LIGHT, LOOK, REACH, RES, type BuildingId, type Dir, dimsOf } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { anchorAt, footprint, get, inCell, inCells, inGrid, outCells, pastureAt, reachCells, whyNot } from '@/game/grid'
import { pathDirs, routeCells } from '@/game/actions/path'
import { Field, GameState, Plant, Ui, blankBuilding, key, res, unkey } from '@/game/world'
import { useT } from '@/i18n'
import { RES_NAMES, WHY_TEXT } from '@/i18n/content'
import { Icon } from '@/ui/Icon'
import { GEO, flat, toonBands, vmat, yawOf } from './kit'
import { Batch, useInstanced } from './instancing'
import { chute, machineBody, machineModel } from './machineModels'
import { drawBelt, useBeltPieces } from './Belts'
import { reach } from './reach'
import { cam } from './camera'
import { markOutlined, unmarkOutlined } from '@kit/outline'

/**
 * Placing, after Tower Factory (the author's screenshot of a belt piece in hand): what is held — a building or a line
 * of belt, the same way — is its own model in its own colours, held up on a see-through sky-blue block that fills the
 * gap to the ground, the model outlined in cream; a pink arrow before it shows the way in, a periwinkle one after it the
 * way out. A producer's reach tints everything inside it a cool blue (reach.ts) inside a lemon border, and two or three
 * thin lemon dashes run from the nearest resources. Where it can't stand, the block and the outline go red, the model
 * reddens a little, and the reason shows above it.
 */
const PLACE = { lift: 0.24, sway: 0.008, arrowOut: 0.3, arrowFar: 0.45 } as const
/**
 * What is held keeps its own colours, outside a producer's reach tint (a critic: the tint greyed the mower in hand);
 * where it can't stand, it only reddens a little: the red block and line say it.
 */
const HELD_MAT = new MeshToonMaterial({ vertexColors: true, gradientMap: toonBands })
const BLOCKED_MAT = new MeshToonMaterial({ vertexColors: true, color: LOOK.blockedTint, gradientMap: toonBands })
const HELD_OUT = new MeshToonMaterial({ color: LOOK.chevron, gradientMap: toonBands }),
  HELD_IN = new MeshToonMaterial({ color: LOOK.inlet, gradientMap: toonBands })
/** The in and out arrows draw over everything, so no model or belt ever hides one (the author). */
const arrowMat = (c: string) => new MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, toneMapped: false })
const ARROW_IN = arrowMat(LOOK.arrowIn),
  ARROW_OUT = arrowMat(LOOK.arrowOut)
/** The dashes to the resources draw over everything, like a line on the screen. */
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

/** The lemon border of a reach: a ring 0.1 wide round the circle, flat on the ground, centred on the origin. */
const borderGeo = new RingGeometry(REACH - 0.05, REACH + 0.05, 72).rotateX(-Math.PI / 2)

/**
 * What the pointer is about to do: the building in hand (or one being moved) at the hover cell turned the way the
 * player chose (R), its way in and way out, a producer's reach, a belt line's pieces and price, the reason it can't be
 * built; with the hand, the hovered machine's reach and its in and out; with the clearing tool, a red frame and the
 * refund.
 */
export function Ghost() {
  const { world } = useGame()
  const { t } = useT()
  const ghost = useRef<Group>(null)
  const body = useRef<Mesh>(null)
  const block = useRef<Mesh>(null)
  const border = useRef<Mesh>(null)
  const sel = useRef<Mesh>(null)
  const stray = useRef<Mesh>(null)
  const frameM = useInstanced(GEO.box(), flat(LOOK.bad, 0.9), 8, 'ghost_frame', false)
  const inArrows = useInstanced(arrowGeo, ARROW_IN, 16, 'ghost_in_arrows', false)
  const outArrows = useInstanced(arrowGeo, ARROW_OUT, 16, 'ghost_out_arrows', false)
  const dashes = useInstanced(GEO.box(), DASH_MAT, 900, 'ghost_reach_dashes', false)
  const stubs = useInstanced(chute(), HELD_MAT, 6, 'ghost_stubs', false)
  const stubOut = useInstanced(GEO.chevron(), HELD_OUT, 4, 'ghost_stub_out', false)
  const stubIn = useInstanced(GEO.chevron(), HELD_IN, 2, 'ghost_stub_in', false)
  const belt = useBeltPieces(160, 'ghost_belt', false)
  const b = useMemo(
    () => ({ frame: new Batch(frameM), inArrows: new Batch(inArrows), outArrows: new Batch(outArrows), dashes: new Batch(dashes), stubs: new Batch(stubs), stubOut: new Batch(stubOut), stubIn: new Batch(stubIn) }),
    [frameM, inArrows, outArrows, dashes, stubs, stubOut, stubIn],
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
    let lab: typeof label = null
    if (ghost.current) ghost.current.visible = false
    if (block.current) block.current.visible = false
    if (border.current) border.current.visible = false
    reach.uReachOn.value = 0
    let held = false,
      beltHeld: '' | 'place' | 'blocked' = ''
    const lift = PLACE.lift + Math.sin(time * 3) * PLACE.sway
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
    /** An arrow just outside the edge (ex, ez), along d: into it (the way in) or out of it. */
    const arrow = (ex: number, ez: number, d: number, into: boolean, y: number) => {
      const [dx, dz] = DIRS[d]!,
        side = into ? -1 : 1,
        away = (dx * fx + dz * fz) * side > 0.5
      const k = side * (away ? PLACE.arrowFar : PLACE.arrowOut)
      ;(into ? b.inArrows : b.outArrows).put(ex + dx * k, y, ez + dz * k, yawOf(d))
    }
    // every way in and out of a building, at height `at` — the same for every building, from the rules (inCells,
    // outCells); a machine in hand carries its stubs of belt, as when built
    const showFlow = (type: BuildingId | 'dock', x: number, y: number, dir: Dir, at: number, stubsAt = -1, probe = blankBuilding(type, x, y, dir)) => {
      if (stubsAt >= 0 && type !== 'dock' && !BUILDINGS[type].onBelt) {
        const stub = (sx: number, sz: number, d: number, arrows: Batch) => {
          const yaw = yawOf(d)
          b.stubs.put(sx, 0.13 + stubsAt, sz, yaw)
          arrows.put(sx + Math.cos(yaw) * 0.02, 0.28 + stubsAt, sz - Math.sin(yaw) * 0.02, yaw)
        }
        for (const c of outCells(probe)) stub(c.sx + 0.5 + DIRS[c.d]![0] * 0.3, c.sy + 0.5 + DIRS[c.d]![1] * 0.3, c.d, b.stubOut)
        const i = inCell(probe)
        if (i) stub(i.sx + 0.5 - DIRS[i.d]![0] * 0.3, i.sy + 0.5 - DIRS[i.d]![1] * 0.3, i.d, b.stubIn)
      }
      for (const c of outCells(probe)) arrow(c.sx + 0.5 + DIRS[c.d]![0] * 0.5, c.sy + 0.5 + DIRS[c.d]![1] * 0.5, c.d, false, at)
      for (const i of inCells(world, probe)) arrow(i.sx + 0.5 - DIRS[i.d]![0] * 0.5, i.sy + 0.5 - DIRS[i.d]![1] * 0.5, i.d, true, at)
    }
    const showReach = (type: BuildingId, x: number, y: number, bw: number, bh: number) => {
      const near = BUILDINGS[type].near!
      const list = reachCells(world, x, y, near, true, bw, bh)
      const cx = x + bw / 2,
        cz = y + bh / 2
      // everything inside the circle goes a cool blue (reach.ts), a lemon line round it
      reach.uReach.value.set(cx, cz, 0)
      reach.uReachOn.value = 1
      if (border.current) {
        border.current.position.set(cx, 0.05, cz)
        border.current.visible = true
      }
      // a thin lemon dashed line from every resource it takes from to the building's edge (the author: a line from each
      // one in the circle, not only the nearest)
      const run = (time * 0.4) % 0.24
      for (const c of list) {
        const dx = cx - (c.x + 0.5),
          dz = cz - (c.y + 0.5),
          len = Math.hypot(dx, dz)
        if (len < 0.01) continue
        const yaw = Math.atan2(-dz, dx)
        // from the resource towards the middle, up to where the line meets the footprint — a neighbour's line is short,
        // never missing
        for (let d = 0.12 + run * 0.5; d < len; d += 0.24) {
          const px = c.x + 0.5 + (dx / len) * d,
            pz = c.y + 0.5 + (dz / len) * d
          if (px > x - 0.02 && px < x + bw + 0.02 && pz > y - 0.02 && pz < y + bh + 0.02) break
          b.dashes.put(px, 0.12, pz, yaw, 0.12, 0.01, 0.035)
        }
      }
      const tot = list.reduce((s, c) => s + c.r.left, 0)
      // the stock the circle holds, on its edge up and to the right
      return { x: cx + REACH * 0.72, y: 0.3, z: cz - REACH * 0.72, text: String(tot), tone: tot ? 'ink' : 'bad', icon: BUILDINGS[type].gives }
    }
    const hovered = h?.b ? (res(world, Plant).b.get(h.b) ?? null) : null
    if (h && inGrid(h.x, h.y)) {
      const tool = ui.tool
      if (tool === 'hand') {
        const hb = hovered
        if (hb) {
          if (hb.type !== 'dock' && BUILDINGS[hb.type].near) lab = showReach(hb.type, hb.x, hb.y, hb.w, hb.h)
          // every building the same: its ways in and out, above the belts that may run up to it
          showFlow(hb.type, hb.x, hb.y, hb.dir, 0.3, -1, hb)
        }
        // a pasture shows its way out and its way in the same way
        const pa = hb ? null : pastureAt(world, h.x, h.y)
        if (pa) {
          const [dx, dz] = DIRS[pa.dir]!
          arrow(pa.exit.x + 0.5 - dx * 0.5, pa.exit.y + 0.5 - dz * 0.5, pa.dir, false, 0.3)
          const [ix, iz] = DIRS[pa.entry.d]!
          arrow(pa.entry.x + 0.5 + ix * 0.5, pa.entry.y + 0.5 + iz * 0.5, pa.entry.d, true, 0.3)
        }
        // a resource says what it is and how much is left in it (the author), on any land
        const rc = hb || pa || h.sheep !== null ? null : res(world, Field).res.get(key(h.x, h.y))
        if (rc) lab = { x: h.x + 0.5, y: rc.t === 'water' ? 0.45 : 0.95, z: h.y + 0.5, text: t(RES_NAMES[rc.t]) + ' · ' + rc.left + '/' + RES[rc.t].max, tone: 'ink', icon: rc.t === 'water' ? 'pond' : rc.t }
      } else if (tool === 'erase') {
        const hb = hovered ?? get(world, h.x, h.y)
        if (hb && !hb.fixed) {
          b.frame.put(hb.x + hb.w / 2, 0.5, hb.y + hb.h / 2, 0, hb.w - 0.04, 0.96, hb.h - 0.04)
          lab = { x: hb.x + hb.w / 2, y: 0.9, z: hb.y + 0.1, text: '+' + hb.paid, tone: 'bad' }
        }
      } else if (tool === 'belt') {
        // the line in hand is held like a building: its pieces up on one block, a pink arrow in, a periwinkle one out
        const phase = (time * 0.9) % 1
        const line = (cells: { x: number; y: number }[], dirs: Dir[]) => {
          cells.forEach((c, i) => {
            const ex = get(world, c.x, c.y)
            if (!ex || ex.type === 'belt') drawBelt(belt, c.x, c.y, i > 0 ? dirs[i - 1]! : dirs[i]!, dirs[i]!, phase, lift)
          })
          showBlock(
            cells.map((c) => [c.x, c.y] as const),
            lift,
            false,
          )
          const a = cells[0]!,
            z = cells[cells.length - 1]!,
            d0 = dirs[0]!,
            d1 = dirs[dirs.length - 1]!
          arrow(a.x + 0.5 - DIRS[d0]![0] * 0.5, a.y + 0.5 - DIRS[d0]![1] * 0.5, d0, true, lift)
          arrow(z.x + 0.5 + DIRS[d1]![0] * 0.5, z.y + 0.5 + DIRS[d1]![1] * 0.5, d1, false, lift)
          beltHeld = 'place'
        }
        const bad = () => {
          showBlock([[h.x, h.y]], lift, true)
          beltHeld = 'blocked'
        }
        if (ui.pending) {
          const list = routeCells(world, ui.pending, h)
          if (list) {
            line(list, pathDirs(world, list, ui.rot))
            const cost = list.filter((c) => !get(world, c.x, c.y)).length * BUILDINGS.belt.cost
            // the price beside the pointer, half a cell to the right on the screen, clear of the arrow at the end
            lab = { x: h.x + 0.5 + Math.cos(cam.yaw) * 0.5, y: lift + 0.55, z: h.y + 0.5 - Math.sin(cam.yaw) * 0.5, text: String(cost), tone: res(world, GameState).coins >= cost ? 'ink' : 'bad', icon: 'coin' }
          } else bad()
        } else {
          const why = whyNot(world, 'belt', h.x, h.y)
          // a belt cell being moved can't come down on another belt; a new one turns the belt it is put on
          const onBelt = !ui.moving && get(world, h.x, h.y)?.type === 'belt'
          if (why && !onBelt) {
            bad()
            lab = { x: h.x + 0.5, y: lift + 0.6, z: h.y + 0.6, text: t(WHY_TEXT[why]), tone: 'bad' }
          } else line([{ x: h.x, y: h.y }], [ui.rot])
        }
      } else {
        const type = tool as BuildingId
        // centred on the pointer and turned as the player chose (a 2×1 lies along its output)
        const [bw, bh] = dimsOf(type, ui.rot),
          [ax, ay] = anchorAt(type, ui.rot, h.wx, h.wy)
        const why = whyNot(world, type, ax, ay, ui.rot)
        if (ghost.current && body.current) {
          ghost.current.visible = true
          held = true
          ghost.current.position.set(ax + bw / 2, lift, ay + bh / 2)
          // the building itself, in its own colours; its body faces the camera, as when built
          body.current.geometry = machineBody(type, bw >= bh)
          body.current.material = why ? BLOCKED_MAT : HELD_MAT
          body.current.rotation.y = BUILDINGS[type].onBelt ? yawOf(ui.rot) : 0
          showBlock(footprint(ax, ay, bw, bh), lift, !!why)
          const want = why ? 'blocked' : 'place'
          if (tint.current !== want) {
            if (tint.current) unmarkOutlined(body.current)
            markOutlined(body.current, want, true)
            tint.current = want
          }
        }
        if (why) lab = { x: ax + bw / 2, y: machineModel(type, bw >= bh).top + lift + 0.6, z: ay + bh / 2, text: t(WHY_TEXT[why]), tone: 'bad' }
        else {
          if (BUILDINGS[type].near) lab = showReach(type, ax, ay, bw, bh)
          showFlow(type, ax, ay, ui.rot, lift, lift)
        }
      }
    }
    // the selected building, and a cell where goods jumped off into the hand
    const s = ui.sel
    if (sel.current) {
      const sb = s?.kind === 'b' ? res(world, Plant).b.get(s.key) : null
      sel.current.visible = !!sb
      if (sb) {
        sel.current.position.set(sb.x + sb.w / 2, 0.02, sb.y + sb.h / 2)
        sel.current.scale.set(sb.w, 0.02, sb.h)
      }
    }
    if (stray.current) {
      const gs = res(world, GameState)
      stray.current.visible = gs.strayT > 0 && !!gs.strayAt
      if (gs.strayAt) {
        const [sx, sy] = unkey(gs.strayAt)
        stray.current.position.set(sx + 0.5, 0.15, sy + 0.5)
        const k = 0.9 + 0.1 * Math.sin(time * 8)
        stray.current.scale.set(k, 0.04, k)
      }
    }
    for (const q of [...Object.values(b), ...Object.values(belt)]) q.end()
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
      <mesh ref={border} geometry={borderGeo} material={flat(LOOK.reachEdge, 0.95)} position-y={0.05} visible={false} />
      <mesh ref={sel} geometry={GEO.box()} material={flat(LOOK.accent, 0.5)} scale={[1, 0.02, 1]} visible={false} />
      <mesh ref={stray} geometry={GEO.box()} material={flat(LOOK.bad, 0.6)} visible={false} />
      {Object.values(b).map((q) => (
        <primitive key={q.mesh.name} object={q.mesh} />
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
