import { CAMERA, GRID } from '@/game/balance'
import { Field, res, unkey, type World } from '@/game/world'
import { island } from './island'

/**
 * The camera looks down at the field from the south at CAMERA.pitch to begin with; the player pans it (drag the empty
 * ground, WASD / arrows), zooms it (wheel, pinch) and turns it round (Option- or right-drag, Q/E, a sideways
 * two-finger swipe — the author: «чтобы камеру можно было поворачивать», but «по вертикали не надо»). `cam` is plain module
 * state: the pointer writes it, CameraRig reads it every frame, nothing re-renders. `yaw` 0 looks north from the south.
 */
export const cam = { x: GRID.cols / 2, z: GRID.rows / 2, dist: CAMERA.distance as number, yaw: 0, pitch: (CAMERA.pitch * Math.PI) / 180 }

export function clampCam() {
  cam.dist = Math.min(CAMERA.maxDistance, Math.max(CAMERA.minDistance, cam.dist))
  cam.x = Math.min(island.right, Math.max(island.left, cam.x))
  cam.z = Math.min(island.bottom, Math.max(island.top, cam.z))
}

/** Frame the owned land (the market stands on it), the way the prototype opens a mission. */
export function fitOwned(world: World, aspect: number) {
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1e9,
    y1 = -1e9
  for (const k of res(world, Field).plots) {
    const [px, py] = unkey(k)
    x0 = Math.min(x0, px * GRID.plotW)
    y0 = Math.min(y0, py * GRID.plotH)
    x1 = Math.max(x1, (px + 1) * GRID.plotW)
    y1 = Math.max(y1, (py + 1) * GRID.plotH)
  }
  cam.x = (x0 + x1) / 2 + 1.2
  cam.z = (y0 + y1) / 2 + 0.6
  const w = x1 - x0 + 5,
    h = y1 - y0 + 2
  const vfov = (CAMERA.fov * Math.PI) / 180
  // distance that fits the height (foreshortened by the pitch) and the width
  const byH = h / 2 / Math.tan(vfov / 2) / 1.15
  const byW = w / 2 / Math.tan(vfov / 2) / Math.max(0.6, aspect)
  cam.dist = Math.max(byH, byW)
  clampCam()
}

/** Put a camera where `cam` says (CameraRig does it every frame; the pointer also right after panning). */
export function placeCamera(camera: { position: { set: (x: number, y: number, z: number) => void }; lookAt: (x: number, y: number, z: number) => void; updateMatrixWorld: () => void }) {
  const flat = Math.cos(cam.pitch) * cam.dist
  camera.position.set(cam.x + Math.sin(cam.yaw) * flat, Math.sin(cam.pitch) * cam.dist, cam.z + Math.cos(cam.yaw) * flat)
  camera.lookAt(cam.x, 0, cam.z)
  camera.updateMatrixWorld()
}
/** Turn the camera round the point it looks at, in radians. Its tilt stays as set (the author: no turning up or down). */
export function turnCam(dYaw: number) {
  cam.yaw += dYaw
}
