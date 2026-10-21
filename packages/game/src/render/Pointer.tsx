import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { BUILDINGS, CAMERA, DIRS, HILL, type Dir } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { anchorAt, freeCell, get, isBeltLike, levelAt, pileAt } from '@/game/grid'
import { liftUp, place, putDown, remove } from '@/game/actions/build'
import { clickBuilding, dropCarry, dropSheep, handClick, pickFromBelt, pickSheep, pickUp, putDownCarry } from '@/game/actions/hand'
import { beltStart, buildPath, pathDirs, stepDir } from '@/game/actions/path'
import { hungry, toRoam } from '@/game/systems/sheep'
import { GameState, Ui, Unlocks, res, type SheepT } from '@/game/world'
import { cam, clampCam, placeCamera, turnCam } from './camera'
import { pickAt, pointer } from './pick'
import { setTool } from '@/ui/actions'

const ground = new Plane(new Vector3(0, 1, 0), 0)
/** The tops of the hills' third and second levels (HILL): the pointer's ray meets them before the ground behind. */
const tops = [3, 2].map((l) => ({ l, plane: new Plane(new Vector3(0, 1, 0), -(l - 1) * HILL.tier) }))
const ray = new Raycaster(),
  ndc = new Vector2(),
  hit = new Vector3()

/**
 * The mouse on the field (GDD 3): a click does what the tool says; with the belt tool, two clicks lay a line or a
 * drag paints one; with the clearing tool a drag clears; with the hand a drag lifts a sheep, and a drag over empty
 * ground pans the camera. The wheel or a pinch zooms; a sideways two-finger swipe, an Option-drag or a right-drag turn
 * the camera round (never up or down: the author). A right click on a machine picks it up to move it (the author); a
 * right click elsewhere drops the tool, or calls a move off. What the pointer is over is found by the models (pick.ts).
 */
export function Pointer() {
  const { world } = useGame()
  const { gl, camera } = useThree()
  useEffect(() => {
    const el = gl.domElement
    const toGround = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      pointer.ndc.copy(ndc)
      pointer.inside = true
      ray.setFromCamera(ndc, camera)
      // a hill's top where the ray crosses it over a cell of that level, else the ground
      for (const t of tops) if (ray.ray.intersectPlane(t.plane, hit) && levelAt(world, Math.floor(hit.x), Math.floor(hit.z)) === t.l) return { x: hit.x, y: hit.z }
      return ray.ray.intersectPlane(ground, hit) ? { x: hit.x, y: hit.z } : null
    }
    /** The sheep or building under the pointer, by their models (pick.ts). */
    const under = (e: PointerEvent | WheelEvent, sheep = true) => {
      toGround(e)
      return pickAt(world, camera, ndc, sheep)
    }
    let down: { sx: number; sy: number; p: { x: number; y: number }; moved: boolean; sheep?: SheepT; goods?: { x: number; y: number }; carried?: boolean; paint?: { x: number; y: number }; erase?: boolean; cam: { x: number; z: number } } | null = null
    // turning the camera: Option-drag or right-drag, from where the pointer last was
    let turn: { x: number; y: number; right: boolean; moved: boolean } | null = null
    let drag: SheepT | null = null
    const cell = (p: { x: number; y: number }) => ({ x: Math.floor(p.x), y: Math.floor(p.y) })

    const onDown = (e: PointerEvent) => {
      const ui = res(world, Ui)
      if (res(world, Unlocks).cardQ.length) return
      if (e.button === 2 || (e.button === 0 && e.altKey)) {
        turn = { x: e.clientX, y: e.clientY, right: e.button === 2, moved: false }
        try {
          el.setPointerCapture(e.pointerId)
        } catch {
          // capture is a nicety
        }
        return
      }
      const p = toGround(e)
      if (!p) return
      const c = cell(p)
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        // capture is a nicety
      }
      down = { sx: e.clientX, sy: e.clientY, p, moved: false, cam: { x: cam.x, z: cam.z } }
      // on pause the hand doesn't pick sheep up (the author); one being shorn by hand is carried too, its clicks kept
      // (the author: «невозможно перетаскивать овцу которую начали стричь») — a click is told from a drag by the move
      if (ui.tool === 'hand' && res(world, GameState).speed > 0) {
        const pk = under(e)
        if (pk.sheep && !ui.carry.length) down.sheep = pk.sheep
        // goods lying there, or riding a belt, are dragged off in the hand
        else if (!ui.carry.length && (pileAt(world, c.x, c.y) || (pk.b && isBeltLike(pk.b) && pk.b.item && !pk.b.item.sheep))) down.goods = pk.b && !pileAt(world, c.x, c.y) ? { x: pk.b.x, y: pk.b.y } : c
      }
      if (ui.tool === 'belt' && !ui.pending && !ui.moving && (freeCell(world, c.x, c.y) || get(world, c.x, c.y)?.type === 'belt')) down.paint = c
      if (ui.tool === 'erase') {
        down.erase = true
        const hb = under(e, false).b
        remove(world, hb?.x ?? c.x, hb?.y ?? c.y)
      }
    }
    const onMove = (e: PointerEvent) => {
      const ui = res(world, Ui)
      if (turn) {
        // the pointer moves while the camera turns: keep its place current, or the hover would stay where the turn began
        toGround(e)
        const dx = e.clientX - turn.x,
          dy = e.clientY - turn.y
        if (Math.hypot(dx, dy) > 3) turn.moved = true
        turnCam(-dx * CAMERA.turnPerPixel)
        turn.x = e.clientX
        turn.y = e.clientY
        placeCamera(camera)
        return
      }
      const p = toGround(e)
      if (!p) return
      const c = cell(p)
      // what it is over is looked for every frame (Hover.tsx): sheep walk and the camera moves under a still pointer
      ui.hover = { x: c.x, y: c.y, wx: p.x, wy: p.y, sheep: ui.hover?.sheep ?? null, b: ui.hover?.b ?? null }
      if (!down) return
      if (!down.moved && Math.hypot(e.clientX - down.sx, e.clientY - down.sy) > 6) down.moved = true
      if (down.erase) {
        remove(world, c.x, c.y)
        return
      }
      if (!down.moved) return
      if (down.sheep && !drag) {
        drag = down.sheep
        pickSheep(world, drag)
        ui.drag = drag
      }
      if (down.goods && !down.carried) {
        const g = down.goods,
          b = get(world, g.x, g.y)
        down.carried = b && isBeltLike(b) ? pickFromBelt(world, b) : pickUp(world, g.x, g.y)
      }
      // the goods ride in the hand under the pointer (hover); nothing else moves while they are dragged
      if (down.carried) return
      if (drag) {
        drag.px = p.x
        drag.py = p.y
        return
      }
      if (down.paint) {
        const l = down.paint
        if (c.x !== l.x || c.y !== l.y) {
          const d = stepDir(l, c)
          const n = { x: l.x + DIRS[d]![0], y: l.y + DIRS[d]![1] }
          const lb = get(world, l.x, l.y)
          if (lb && lb.type === 'belt') lb.dir = d
          else place(world, 'belt', l.x, l.y, d)
          if (freeCell(world, n.x, n.y)) place(world, 'belt', n.x, n.y, d)
          else {
            const nb = get(world, n.x, n.y)
            if (nb && nb.type === 'belt' && nb.dir === (d + 2) % 4) nb.dir = d
          }
          down.paint = n
        }
        return
      }
      // dragging empty ground pans: keep the grabbed ground point under the pointer
      const dx = p.x - down.p.x,
        dz = p.y - down.p.y
      cam.x -= dx
      cam.z -= dz
      clampCam()
      placeCamera(camera)
    }
    const onUp = (e: PointerEvent) => {
      const ui = res(world, Ui)
      if (turn) {
        // a right click that didn't turn anything picks a machine up to move it, or drops the tool (and a move)
        if (turn.right && !turn.moved) {
          // goods in the hand go down on the ground under the pointer
          const at = ui.hover
          if (ui.carry.length && at) {
            putDownCarry(world, at.wx, at.wy)
            turn = null
            return
          }
          const hb = ui.tool === 'hand' && !ui.pending ? under(e, false).b : null
          if (hb && liftUp(world, hb)) {
            turn = null
            return
          }
          if (ui.tool !== 'hand' || ui.pending) setTool(world, 'hand')
          ui.sel = null
        }
        turn = null
        return
      }
      if (!down) return
      const p = toGround(e),
        d = down
      down = null
      if (drag) {
        if (p) dropSheep(world, drag, p.x, p.y)
        else toRoam(world, drag, drag.px, drag.py)
        drag = null
        ui.drag = null
        return
      }
      // goods dragged in the hand go down where they are let go — into the building under the pointer, by its model, else
      // on the ground there; what finds no place stays in the hand
      if (d.carried) {
        const pk = under(e)
        if (pk.b && pk.exact) clickBuilding(world, pk.b)
        else if (p) dropCarry(world, p.x, p.y)
        return
      }
      if (d.moved || !p) return
      const c = cell(p)
      if (ui.tool === 'erase') return
      if (ui.tool === 'hand') {
        // a click on a sheep goes to that sheep: handClick at its own spot finds it first; one on a machine's model to
        // that machine, wherever on it; anything else to the ground point
        // a sheep takes the click only when there is something to do to it — shear it, or feed it the hay in the hand —
        // else it goes to what lies under it (a pile beside it)
        const pk = under(e),
          s = pk.sheep
        if (s && (s.wool >= 1 || (hungry(s) && ui.carry.some((q) => q.kind === 'hay')))) handClick(world, s.px, s.py)
        else if (pk.b && pk.exact) clickBuilding(world, pk.b)
        else handClick(world, p.x, p.y)
      }
      else if (ui.tool === 'belt') {
        // a belt cell being moved comes down where clicked, turned as the player chose
        if (ui.moving) {
          if (putDown(world, c.x, c.y, ui.rot)) setTool(world, 'hand')
        } else if (!ui.pending) {
          const st = beltStart(world, c)
          if (st) ui.pending = st
        } else if (ui.pending.x === c.x && ui.pending.y === c.y) {
          // a second click on the same cell: a belt there turns a quarter; an empty cell gets one belt, going the way
          // its neighbours suggest (R breaks ties)
          const ex = get(world, c.x, c.y)
          if (ex && ex.type === 'belt') ex.dir = ((ex.dir + 1) % 4) as Dir
          else place(world, 'belt', c.x, c.y, pathDirs(world, [c], ui.rot)[0]!)
          ui.pending = null
        } else {
          buildPath(world, ui.pending, c, ui.rot)
          ui.pending = null
        }
      } else {
        // a building goes centred on the pointer, turned as the player chose, as its ghost shows
        const [ax, ay] = anchorAt(ui.tool, ui.rot, p.x, p.y)
        if (ui.moving) {
          if (putDown(world, ax, ay, ui.rot)) setTool(world, 'hand')
        } else if (place(world, ui.tool, ax, ay, ui.rot) && !BUILDINGS[ui.tool].onBelt && !BUILDINGS[ui.tool].repeat) setTool(world, 'hand')
      }
    }
    const onCancel = () => {
      if (drag) toRoam(world, drag, drag.px, drag.py)
      drag = null
      res(world, Ui).drag = null
      down = null
    }
    const onLeave = () => {
      pointer.inside = false
      res(world, Ui).hover = null
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // a sideways two-finger swipe turns the camera; up and down (or a pinch) zooms
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        turnCam(e.deltaX * CAMERA.turnPerPixel * 0.6)
        placeCamera(camera)
        return
      }
      const before = toGround(e)
      cam.dist *= e.deltaY < 0 ? 1 / 1.1 : 1.1
      clampCam()
      // zoom towards the pointer: shift so the ground point under it stays put (approximately)
      if (before) {
        const k = e.deltaY < 0 ? 0.09 : -0.09
        cam.x += (before.x - cam.x) * k
        cam.z += (before.y - cam.z) * k
        clampCam()
      }
      placeCamera(camera)
    }
    const onMenu = (e: Event) => e.preventDefault()
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', onMenu)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('contextmenu', onMenu)
    }
  }, [world, gl, camera])
  return null
}
