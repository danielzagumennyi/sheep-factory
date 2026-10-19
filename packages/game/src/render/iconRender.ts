import { Box3, DirectionalLight, HemisphereLight, Mesh, OrthographicCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderTarget, type BufferGeometry, type WebGLRenderer } from 'three'
import { BUILDINGS, LIGHT, LOOK, ROOF, type BuildingId, type ItemId } from '@/game/balance'
import { RENDERED_ICONS, type RenderedIcon } from '@/ui/iconKinds'
import { model, vmat } from './kit'
import { machineBody } from './machineModels'
import { METAL, WOOD, ball, bushBody, cyl, good, grassClump, put, rb, ring, sheepModel, shade } from './models'

/** A straight piece of belt: the bed, three planks and the two walls with their caps. */
const belt = () =>
  model([
    put(rb(1, 0.1, 0.8, 0.04), LOOK.beltBed, [0, 0.05, 0]),
    ...[-0.32, 0, 0.32].map((x) => put(rb(0.13, 0.035, 0.6, 0.015), LOOK.beltSlat, [x, 0.115, 0])),
    ...[-0.42, 0.42].flatMap((z) => [put(rb(1, 0.2, 0.12, 0.04), LOOK.beltWall, [0, 0.12, z]), put(rb(1, 0.04, 0.14, 0.02), LOOK.beltWallTop, [0, 0.225, z])]),
  ])

/** A gold coin standing up, with a rim and a raised middle. */
const coin = () =>
  model([
    put(cyl(0.3, 0.08, 28), LOOK.coin, [0, 0, 0], [Math.PI / 2, 0, 0]),
    put(ring(0.27, 0.035), shade(LOOK.coin, 0.82), [0, 0, 0.04]),
    put(cyl(0.16, 0.1, 22), shade(LOOK.coin, 1.15), [0, 0, 0], [Math.PI / 2, 0, 0]),
  ])

/** A pair of chunky shears, open. */
const shears = () => {
  const blade = (s: number) => [
    put(rb(0.46, 0.13, 0.07, 0.04), METAL, [0.2, 0, s * 0.04], [0, 0, s * 0.32]),
    put(ring(0.11, 0.05), ROOF.shearer, [-0.12, -s * 0.07, s * 0.04]),
  ]
  return model([...blade(1), ...blade(-1), put(cyl(0.05, 0.16, 10), LOOK.machineEdge, [0.02, 0, 0], [Math.PI / 2, 0, 0])])
}

/** Sowing by hand: a mound of earth with a young shoot, a seed bale beside it. */
const sow = () =>
  model([
    put(ball(0.3), LOOK.sproutSoil, [0, 0, 0], [0, 0, 0], [1.2, 0.35, 1.2]),
    put(cyl(0.025, 0.2, 8), LOOK.sprout, [0, 0.16, 0]),
    put(ball(0.08), LOOK.sprout, [0.07, 0.25, 0], [0, 0, 0.6], [1.4, 0.5, 0.8]),
    put(ball(0.08), LOOK.sprout, [-0.07, 0.22, 0], [0, 0, -0.6], [1.4, 0.5, 0.8]),
    good('hay').clone().translate(0.36, 0, 0.18),
  ])

/** The stock: an open crate of what the farm has gathered — hay, a fleece, a ball of yarn. */
const stock = () =>
  model([
    put(rb(0.62, 0.34, 0.46, 0.04), WOOD, [0, 0.17, 0]),
    ...[-0.12, 0.12].map((y) => put(rb(0.64, 0.05, 0.48, 0.02), shade(WOOD, 0.8), [0, 0.17 + y, 0])),
    good('hay').clone().translate(-0.14, 0.3, 0),
    good('wool').clone().translate(0.14, 0.28, -0.04),
    good('yarn').clone().translate(0.06, 0.28, 0.12),
  ])

/** A berry bush, its berries on. */
const bush = () => model([bushBody().clone(), ...[[0.12, 0.38, 0.2], [-0.16, 0.33, 0.18], [0.02, 0.48, 0.12], [0.24, 0.26, 0.05], [-0.04, 0.28, 0.27]].map((c) => put(ball(0.05), LOOK.berry, c as [number, number, number]))])

const MACHINES: BuildingId[] = ['pen', 'shearer', 'feeder', 'dyer', 'comb', 'curl', 'knit', 'bath', 'mower', 'berry', 'seeder', 'splitter', 'merger']
function geometryOf(kind: RenderedIcon): BufferGeometry {
  if ((MACHINES as string[]).includes(kind)) {
    // a 2×1 lies along z; for its icon it is turned to lie across the frame, machine on the left
    const g = machineBody(kind as BuildingId)
    return BUILDINGS[kind as BuildingId].size?.[0] === 2 && BUILDINGS[kind as BuildingId].size?.[1] === 1 ? g.clone().rotateY(Math.PI / 2) : g
  }
  switch (kind) {
    case 'belt':
      return belt()
    case 'sheep':
      return sheepModel()
    case 'coin':
      return coin()
    case 'shear':
      return shears()
    case 'sow':
      return sow()
    case 'stock':
      return stock()
    case 'meadow':
      return grassClump(0)
    case 'bush':
      return bush()
    default:
      return good(kind as ItemId)
  }
}

/** Pixels the icon is drawn at, and what it is kept at (drawn big, shrunk: smooth edges). */
const DRAW = 512,
  KEEP = 160
/** The ink line round each icon, in drawn pixels, so it reads on the light panels like the old drawn icons. */
const LINE = 9

/**
 * Draw every rendered icon from its model and post it to the dev server, which keeps it in public/icons (dev console:
 * `__game.icons()`). Each model is lit like the field — the same sun, sky fill and toon bands — and seen from the
 * front, a little from the right and above, through an orthographic camera fitted to it.
 */
export async function renderIcons(gl: WebGLRenderer) {
  const rt = new WebGLRenderTarget(DRAW, DRAW, { samples: 4 })
  rt.texture.colorSpace = SRGBColorSpace
  const scene = new Scene()
  scene.add(new HemisphereLight(LOOK.skyLight, LOOK.groundBounce, LIGHT.hemi))
  const sun = new DirectionalLight(LOOK.sun, LIGHT.sun)
  scene.add(sun, sun.target)
  const mesh = new Mesh(undefined, vmat())
  scene.add(mesh)
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0.01, 100)
  const view = new Vector3(Math.sin(0.5) * Math.cos(0.55), Math.sin(0.55), Math.cos(0.5) * Math.cos(0.55))
  const px = new Uint8Array(DRAW * DRAW * 4)
  const draw = document.createElement('canvas')
  draw.width = draw.height = DRAW
  const keep = document.createElement('canvas')
  keep.width = keep.height = KEEP
  const box = new Box3(),
    c = new Vector3(),
    v = new Vector3()
  const before = gl.getRenderTarget()
  for (const kind of RENDERED_ICONS) {
    const geo = geometryOf(kind)
    mesh.geometry = geo
    box.setFromObject(mesh)
    box.getCenter(c)
    const r = box.getSize(v).length()
    cam.position.copy(c).addScaledVector(view, r * 3)
    cam.lookAt(c)
    cam.updateMatrixWorld()
    // fit the frame to the model's box as the camera sees it
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(cam.matrixWorldInverse)
      x0 = Math.min(x0, v.x)
      x1 = Math.max(x1, v.x)
      y0 = Math.min(y0, v.y)
      y1 = Math.max(y1, v.y)
    }
    // a thin margin for the ink line
    const half = Math.max(x1 - x0, y1 - y0) * 0.5 * 1.05,
      mx = (x0 + x1) / 2,
      my = (y0 + y1) / 2
    cam.left = mx - half
    cam.right = mx + half
    cam.top = my + half
    cam.bottom = my - half
    cam.near = 0.01
    cam.far = r * 6
    cam.updateProjectionMatrix()
    sun.position.copy(c).add(new Vector3(-r, r * 2.2, r * 1.6))
    sun.target.position.copy(c)
    gl.setRenderTarget(rt)
    gl.setClearColor(0x000000, 0)
    gl.clear()
    gl.render(scene, cam)
    gl.readRenderTargetPixels(rt, 0, 0, DRAW, DRAW, px)
    // the target's rows run bottom up
    const img = draw.getContext('2d')!.createImageData(DRAW, DRAW)
    for (let y = 0; y < DRAW; y++) img.data.set(px.subarray((DRAW - 1 - y) * DRAW * 4, (DRAW - y) * DRAW * 4), y * DRAW * 4)
    const shape = document.createElement('canvas')
    shape.width = shape.height = DRAW
    shape.getContext('2d')!.putImageData(img, 0, 0)
    // the ink line: the silhouette in ink, stamped round in a ring, under the picture
    const ink = document.createElement('canvas')
    ink.width = ink.height = DRAW
    const ig = ink.getContext('2d')!
    ig.drawImage(shape, 0, 0)
    ig.globalCompositeOperation = 'source-in'
    ig.fillStyle = LOOK.iconInk
    ig.fillRect(0, 0, DRAW, DRAW)
    const g = draw.getContext('2d')!
    g.clearRect(0, 0, DRAW, DRAW)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      g.drawImage(ink, Math.cos(a) * LINE, Math.sin(a) * LINE)
    }
    g.drawImage(shape, 0, 0)
    const kg = keep.getContext('2d')!
    kg.clearRect(0, 0, KEEP, KEEP)
    kg.imageSmoothingQuality = 'high'
    kg.drawImage(draw, 0, 0, KEEP, KEEP)
    await fetch('/__icon?name=' + kind, { method: 'POST', body: keep.toDataURL('image/png') })
  }
  gl.setRenderTarget(before)
  gl.setClearColor(LOOK.sky)
  rt.dispose()
  return RENDERED_ICONS.length
}
