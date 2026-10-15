import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor, Stats } from '@react-three/drei'
import { useState } from 'react'
import { CAMERA, GRID, LIGHT, LOOK, SHADOW } from '@/game/balance'
import { Ambient } from './Ambient'
import { Belts } from './Belts'
import { CameraRig, TitleCamera } from './CameraRig'
import { Decor } from './Decor'
import { FxView } from './FxView'
import { GameLoop } from './GameLoop'
import { Ghost } from './Ghost'
import { Grass } from './Grass'
import { Ground } from './Ground'
import { Hover } from './Hover'
import { PlotFence } from './PlotFence'
import { Items } from './Items'
import { Machines } from './Machines'
import { Nature } from './Nature'
import { Pastures } from './Pastures'
import { PlotTags } from './PlotTags'
import { Props } from './Props'
import { Pointer } from './Pointer'
import { Road } from './Road'
import { Flock3D } from './SheepView'
import { Terrain } from './Terrain'
import { Water } from './Water'

/**
 * The 3D field: one canvas, a warm sun with soft shadows over the island, a sky-blue fill, haze over the far sea, and
 * no post pass: the canvas draws straight to the screen with the browser's own antialiasing, colours as painted (`flat`:
 * no tone mapping), the soft contact shadows painted into the ground (Ground.tsx) — the post pass cost ten times the
 * scene (docs/02-TDD.md, «Цена кадра»).
 */
/** The sharpest the field is drawn: the screen's own density, at most 2. */
const MAX_DPR = Math.min(2, globalThis.devicePixelRatio || 1)

/** `title`: the field behind the main menu — the camera circles slowly, nothing takes the pointer, no frame counter. */
export function Scene({ title = false }: { title?: boolean }) {
  // the pixel density follows the frame rate: down when the frame can't keep up (a big factory on a small GPU), back up
  // when there is room — drei's PerformanceMonitor, from 1 to the screen's own density in tenths
  const [dpr, setDpr] = useState(MAX_DPR)
  return (
    <Canvas className="field" shadows="soft" flat dpr={dpr} camera={{ fov: CAMERA.fov, near: 0.5, far: 300, position: [16, 22, 30] }} gl={{ antialias: true, powerPreference: 'high-performance' }} onCreated={({ gl }) => gl.setClearColor(LOOK.sky)}>
      <color attach="background" args={[LOOK.sky]} />
      <fog attach="fog" args={[LOOK.sky, 110, 230]} />
      <GameLoop />
      <PerformanceMonitor factor={1} step={0.1} bounds={(hz) => (hz > 100 ? [80, 110] : [50, 58])} onChange={({ factor }) => setDpr(Math.round(Math.min(MAX_DPR, 1 + factor) * 10) / 10)} />
      {/* the frame rate (the author: «выведи счетчик фпс»): three's own stats.js panel */}
      {!title && <Stats className="fps-stats" />}
      <CameraRig />
      {title ? <TitleCamera /> : <Pointer />}
      <hemisphereLight args={[LOOK.skyLight, LOOK.groundBounce, LIGHT.hemi]} />
      <directionalLight
        position={[GRID.cols / 2 + LIGHT.sunFrom[0], LIGHT.sunFrom[1], GRID.rows / 2 + LIGHT.sunFrom[2]]}
        color={LOOK.sun}
        intensity={LIGHT.sun}
        castShadow
        shadow-mapSize={[SHADOW.map, SHADOW.map]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.0005}
        shadow-normalBias={0.025}
      >
        <object3D attach="target" position={[GRID.cols / 2, 0, GRID.rows / 2]} />
      </directionalLight>
      <Ground />
      <Water />
      <PlotFence />
      <Terrain />
      <Grass />
      <Decor />
      <Props />
      <Ambient />
      <Nature />
      <Pastures />
      <Belts />
      <Machines />
      <Items />
      <Road />
      <Flock3D />
      <PlotTags />
      <Ghost />
      <Hover />
      <FxView />
    </Canvas>
  )
}
