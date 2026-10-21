import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { GRID } from '@/game/balance'
import { cam, placeCamera } from './camera'

/** Puts the camera behind and above `cam` every frame. */
export function CameraRig() {
  const camera = useThree((s) => s.camera)
  useFrame(() => placeCamera(camera))
  return null
}

/**
 * The camera turning by itself (the `orbit` system, behind the main menu): over the middle of the farm, turning slowly
 * round it (a whole turn in about two and a half minutes).
 */
export function TitleCamera() {
  useEffect(() => {
    Object.assign(cam, { x: GRID.cols / 2, z: GRID.rows / 2, dist: 25, yaw: -0.6 })
  }, [])
  useFrame((_, dt) => {
    cam.yaw += Math.min(dt, 0.1) * 0.04
  })
  return null
}
