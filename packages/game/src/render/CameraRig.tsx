import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { cam, placeCamera } from './camera'

/** Puts the camera behind and above `cam` every frame. */
export function CameraRig() {
  const camera = useThree((s) => s.camera)
  useFrame(() => placeCamera(camera))
  return null
}

/** Behind the main menu: the whole farm in view, turning slowly round it (a whole turn in about two and a half minutes). */
export function TitleCamera() {
  useEffect(() => {
    Object.assign(cam, { x: 17, z: 10.5, dist: 25, yaw: -0.6 })
  }, [])
  useFrame((_, dt) => {
    cam.yaw += Math.min(dt, 0.1) * 0.04
  })
  return null
}
