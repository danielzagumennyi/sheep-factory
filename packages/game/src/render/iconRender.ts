import { Box3, Color, DirectionalLight, HemisphereLight, Mesh, OrthographicCamera, Scene, SRGBColorSpace, TorusGeometry, Vector3, WebGLRenderer, WebGLRenderTarget, type BufferGeometry } from 'three'
import { LIGHT, LOOK, ROOF, TOOL_ORDER, type BuildingId } from '@/game/balance'
import { RENDERED_ICONS, type RenderedIcon } from '@/ui/iconKinds'
import { model, sheepVmat, vmat } from './kit'
import { machineBody } from './machineModels'
import { FLEECE_FIT, METAL, SHEEP_AT, ball, cone, cyl, fleece, fleeceBurrs, fleeceFelt, fleeceMud, put, rb, ring, sheepHead, sheepLegs, sheepModel, sheepTuft, shade, shornSheepModel } from './models'

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

/** A copy of `g` with its vertex colours multiplied by `color`: a fleece muddied, matted or browned. */
function tinted(g: BufferGeometry, color: string) {
  const out = g.clone(),
    c = new Color(color),
    col = out.getAttribute('color')
  for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b)
  return out
}

/** A sheep standing as the sheep icon does, its fleece as each kind has it (GDD 5; sheepLook.ts draws the flock so). */
const kindSheep = (kind: 'dirty' | 'tangled' | 'burrs') => {
  const fl = kind === 'tangled' ? tinted(fleeceFelt(), LOOK.feltFleece) : fleece().clone()
  const parts = [sheepLegs().clone(), fl.translate(...SHEEP_AT.fleece), sheepHead().clone().translate(...SHEEP_AT.head), tinted(sheepTuft(), kind === 'tangled' ? LOOK.feltFleece : '#ffffff').translate(...SHEEP_AT.head)]
  const k = FLEECE_FIT.fleece.burrs
  if (kind === 'burrs') parts.push(tinted(fleeceBurrs(), LOOK.burrs).scale(k, k, k).translate(...SHEEP_AT.fleece))
  if (kind === 'dirty') parts.push(tinted(fleeceMud(), LOOK.dirtFleece).scale(k, k, k).translate(...SHEEP_AT.fleece))
  return model(parts).rotateY(-0.5)
}

/**
 * What a sheep needs, each by the one thing it is about, big enough to tell apart at 22 pixels (the sign over a sheep,
 * the scissors' list): a drop of water with bubbles for the wash, a big comb, tweezers holding a burr.
 */
const water = () =>
  model([
    put(ball(0.34), LOOK.water, [0, 0, 0], [0, 0, 0], [1, 1.05, 1]),
    put(cone(0.27, 0.42, 20), LOOK.water, [0, 0.38, 0]),
    put(ball(0.07), LOOK.waterFoam, [0.11, 0.12, 0.26]),
    put(ball(0.13), LOOK.waterFoam, [0.42, 0.42, 0.05]),
    put(ball(0.09), LOOK.waterFoam, [-0.4, 0.3, 0.08]),
  ])
const combing = () =>
  model([put(rb(0.95, 0.24, 0.14, 0.09), ROOF.comb, [0, 0.2, 0]), ...Array.from({ length: 8 }, (_, i) => put(rb(0.075, 0.42, 0.1, 0.035), shade(ROOF.comb, 0.82), [-0.39 + i * 0.111, -0.1, 0]))]).rotateZ(-0.25)
const tweezers = () =>
  model([
    put(rb(0.1, 0.8, 0.08, 0.04), METAL, [-0.07, 0.05, 0], [0, 0, -0.14]),
    put(rb(0.1, 0.8, 0.08, 0.04), METAL, [0.07, 0.05, 0], [0, 0, 0.14]),
    put(ball(0.09), ROOF.pick, [0, 0.46, 0]),
    put(ball(0.17), LOOK.burrs, [0, -0.42, 0]),
    ...Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2
      return put(ball(0.06), shade(LOOK.burrs, 0.85), [Math.cos(a) * 0.17, -0.42 + Math.sin(a) * 0.17, 0.05])
    }),
  ]).rotateZ(0.3)

/** The portal as its icon: the stone ring standing up, the swirl inside it, the gem on top (models.ts `portalModel`). */
const portal = () =>
  model([
    put(new TorusGeometry(0.5, 0.1, 10, 40), LOOK.portalStone, [0, 0, 0]),
    put(cyl(0.42, 0.04, 32), LOOK.portalSwirl[0], [0, 0, 0], [Math.PI / 2, 0, 0]),
    put(cyl(0.24, 0.05, 28), LOOK.portalSwirl[2], [0, 0, 0], [Math.PI / 2, 0, 0]),
    put(ball(0.09), LOOK.portalRune, [0, 0.6, 0], [0, 0, 0], [0.8, 1.2, 0.8]),
    put(rb(0.5, 0.12, 0.3, 0.04), shade(LOOK.portalStone, 0.88), [0, -0.6, 0]),
  ]).rotateY(0.5)

const MACHINES = TOOL_ORDER.filter((t) => t !== 'belt')
function geometryOf(kind: RenderedIcon): BufferGeometry {
  if ((MACHINES as string[]).includes(kind)) return machineBody(kind as BuildingId)
  switch (kind) {
    case 'belt':
      return belt()
    case 'sheep':
      return sheepModel()
    case 'dirty':
    case 'tangled':
    case 'burrs':
      return kindSheep(kind)
    case 'shorn':
      return shornSheepModel().clone().rotateY(-0.5)
    case 'portal':
      return portal()
    case 'water':
      return water()
    case 'combing':
      return combing()
    case 'tweezers':
      return tweezers()
    case 'coin':
      return coin()
    case 'shear':
      return shears()
    default:
      return sheepModel()
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
 * front, a little from the right and above, through an orthographic camera fitted to it. It draws with the game's
 * renderer, or with one of its own when the field is not running (a hidden tab:
 * `(await import('/src/render/iconRender.ts')).renderIcons()`).
 */
export async function renderIcons(given?: WebGLRenderer) {
  const gl = given ?? new WebGLRenderer({ antialias: true })
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
    // a sheep in its own soft light, as in the field
    mesh.material = ['sheep', 'dirty', 'tangled', 'burrs', 'shorn'].includes(kind) ? sheepVmat() : vmat()
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
  if (!given) gl.dispose()
  return RENDERED_ICONS.length
}
