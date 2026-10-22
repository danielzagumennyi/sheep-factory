import { CAMERA, GRID, PORTAL } from '@/game/balance'
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

/** The game opens over the portal, the flock round it in view (GDD 6): the default distance, the portal a little up the screen. */
export function frameStart() {
  cam.x = PORTAL.x + PORTAL.size / 2
  cam.z = PORTAL.y + PORTAL.size / 2 + 4
  cam.dist = CAMERA.distance
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
