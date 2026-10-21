import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor, Stats } from '@react-three/drei'
import { useState } from 'react'
import { useFrame } from '@react-three/fiber'
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
import { Hills } from './Hills'
import { Hover } from './Hover'
import { PlotFence } from './PlotFence'
import { Items } from './Items'
import { Machines } from './Machines'
import { Market } from './Market'
import { Nature } from './Nature'
import { Pastures } from './Pastures'
import { PlotTags } from './PlotTags'
import { Props } from './Props'
import { Pointer } from './Pointer'
import { Flock3D } from './SheepView'
import { Terrain } from './Terrain'
import { Water } from './Water'
import { island } from './island'
import { useGame } from '@/game/GameContext'
import { Field, isOn, res, type SystemId } from '@/game/world'

/**
 * The 3D field: one canvas, a warm sun with soft shadows over the island, a sky-blue fill, haze over the far sea, and
 * no post pass: the canvas draws straight to the screen with the browser's own antialiasing, colours as painted (`flat`:
 * no tone mapping), the soft contact shadows painted into the ground (Ground.tsx) — the post pass cost ten times the
 * scene (docs/02-TDD.md, «Цена кадра»).
 */
/** The sharpest the field is drawn: the screen's own density, at most 2. */
const MAX_DPR = Math.min(2, globalThis.devicePixelRatio || 1)

/**
 * The world's switches (world.ts, `SYSTEMS`) say which parts are here: the hands (pointer), the camera turning by
 * itself (orbit), the frame counter, what is in hand, the outline under the pointer, the labels on the field.
 */
export function Scene() {
  const { world } = useGame()
  const on = (id: SystemId) => isOn(world, id)
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
      {on('fps') && <Stats className="fps-stats" />}
      <CameraRig />
      {on('orbit') && <TitleCamera />}
      {on('pointer') && <Pointer />}
      <hemisphereLight args={[LOOK.skyLight, LOOK.groundBounce, LIGHT.hemi]} />
      <directionalLight
        position={[GRID.cols / 2 + LIGHT.sunFrom[0], LIGHT.sunFrom[1], GRID.rows / 2 + LIGHT.sunFrom[2]]}
        color={LOOK.sun}
        intensity={LIGHT.sun}
        castShadow
        shadow-mapSize={[SHADOW.map, SHADOW.map]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={100}
        shadow-bias={-0.0005}
        shadow-normalBias={0.025}
      >
        <object3D attach="target" position={[GRID.cols / 2, 0, GRID.rows / 2]} />
      </directionalLight>
      <Island />
      <Ambient />
      <Pastures />
      <Belts />
      <Machines />
      <Items />
      <Market />
      <Flock3D />
      {on('tags') && <PlotTags />}
      {on('ghost') && <Ghost />}
      {on('hover') && <Hover />}
      <FxView />
    </Canvas>
  )
}

/**
 * The island and what grows on it. When it grows (ISLAND_GROW), every part is built again for the new edges: they read
 * `island` as they build.
 */
function Island() {
  const { world } = useGame()
  const f = res(world, Field)
  const edge = () => [f.left, f.top, f.right, f.bottom].join(',')
  const [k, setK] = useState(edge)
  useFrame(() => {
    const e = edge()
    if (e !== k) setK(e)
  })
  Object.assign(island, { left: f.left, top: f.top, right: f.right, bottom: f.bottom, hills: f.hills })
  return (
    <group key={k}>
      <Ground />
      <Water />
      <Hills />
      <PlotFence />
      <Terrain />
      <Grass />
      <Decor />
      <Props />
      <Nature />
    </group>
  )
}
