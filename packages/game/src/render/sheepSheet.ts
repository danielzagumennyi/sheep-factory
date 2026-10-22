import { CircleGeometry, DirectionalLight, HemisphereLight, Matrix4, Mesh, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer, WebGLRenderTarget } from 'three'
import { CAMERA, DROP, LIGHT, LOOK } from '@/game/balance'
import { mat } from './kit'
import { dropPose, newPose, sheepDrawer, sheepMeshes, type SheepLook } from './sheepLook'

/**
 * Dev only (`__game.sheep()`): every kind of sheep on one sheet, drawn by the flock's own code (sheepLook.ts) in the
 * field's light, and kept as docs/concept/shots/sheep-sheet.png — for judging the look against the references. Rows:
 * the kinds from the front and from behind, and as small as the game shows them; then the same built plain, as the flock
 * is drawn far off (models.ts `plain`).
 * It draws with the game's renderer, or with one of its own when the field is not running (a hidden tab:
 * `(await import('/src/render/sheepSheet.ts')).renderSheepSheet()`).
 */

type Kind = readonly [label: string, look: Partial<SheepLook> & { blink?: boolean; drop?: number }]
const KINDS: Kind[] = [
  ['Готова', {}],
  ['Грязная', { needs: ['wash'] }],
  ['Нечёсаная', { needs: ['comb'] }],
  ['С репьями', { needs: ['pick'] }],
  ['Грязная + нечёсаная', { needs: ['wash', 'comb'] }],
  ['Грязная + репьи', { needs: ['wash', 'pick'] }],
  ['Нечёсаная + репьи', { needs: ['comb', 'pick'] }],
  ['Всё сразу', { needs: ['wash', 'comb', 'pick'] }],
  ['Стрижётся', { wool: 0.45 }],
  ['Стриженая', { wool: 0 }],
  ['Моргает', { blink: true }],
  // an arriving sheep just above the grass under its parachute, seen from further off
  ['Парашют', { drop: DROP.fall * 0.9 }],
]
const lookOf = ([, k]: Kind): SheepLook => ({ id: k.id ?? 0, wool: k.wool ?? 1, needs: k.needs ?? [] })

/** A cell's side in pixels, the label strip under it, and the far row's drawn size (a sheep as small as in the game). */
const CELL = 300,
  LABEL = 34,
  FAR = 72
/** The views: front three-quarters, behind, and the game's own (from the south at its pitch, the sheep facing east). */
const VIEWS = { front: { yaw: 0.85, pitch: 22 }, back: { yaw: 2.35, pitch: 22 }, far: { yaw: Math.PI / 2, pitch: CAMERA.pitch } }

export async function renderSheepSheet(given?: WebGLRenderer) {
  const gl = given ?? new WebGLRenderer({ antialias: true })
  const scene = new Scene()
  scene.add(new HemisphereLight(LOOK.skyLight, LOOK.groundBounce, LIGHT.hemi))
  const sun = new DirectionalLight(LOOK.sun, LIGHT.sun)
  sun.position.set(...LIGHT.sunFrom).normalize().multiplyScalar(6)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.5, far: 14 })
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02
  scene.add(sun, sun.target)
  const ground = new Mesh(new CircleGeometry(1.4, 48).rotateX(-Math.PI / 2), mat(LOOK.ground))
  ground.receiveShadow = true
  scene.add(ground)
  const meshes = sheepMeshes(1)
  Object.values(meshes).forEach((m) => scene.add(m))
  const draw = sheepDrawer(meshes)
  const pose = newPose()
  const cam = new PerspectiveCamera(CAMERA.fov, 1, 0.1, 50)
  const target = new Vector3(0.04, 0.34, 0),
    high = new Vector3(0.04, 1.2, 0),
    chuteAt = new Matrix4()

  const cols = KINDS.length
  // `plain`: the builds the flock is drawn with far off (models.ts `plain`), close up to judge them and as small as seen
  const rows: { kinds: Kind[]; view: keyof typeof VIEWS; plain?: boolean }[] = [
    { kinds: KINDS, view: 'front' },
    { kinds: KINDS, view: 'back' },
    { kinds: KINDS, view: 'far' },
    { kinds: KINDS, view: 'front', plain: true },
    { kinds: KINDS, view: 'far', plain: true },
  ]
  const sheet = document.createElement('canvas')
  sheet.width = cols * CELL
  sheet.height = rows.length * (CELL + LABEL)
  const g = sheet.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, sheet.width, sheet.height)
  const cell = document.createElement('canvas')
  const before = gl.getRenderTarget()
  const shadowsBefore = gl.shadowMap.enabled
  gl.shadowMap.enabled = true
  rows.forEach((row, r) => {
    const size = row.view === 'far' ? FAR : CELL
    const rt = new WebGLRenderTarget(size, size, { samples: 4 })
    rt.texture.colorSpace = SRGBColorSpace
    const px = new Uint8Array(size * size * 4)
    cell.width = cell.height = size
    const v = VIEWS[row.view]
    const p = (v.pitch * Math.PI) / 180
    row.kinds.forEach((kind, c) => {
      // a sheep under its parachute is twice as tall: seen from twice as far, aimed higher
      const drop = kind[1].drop,
        aim = drop === undefined ? target : high
      cam.position.copy(aim).add(new Vector3(Math.cos(v.yaw) * Math.cos(p), Math.sin(p), Math.sin(v.yaw) * Math.cos(p)).multiplyScalar((row.view === 'far' ? 5.2 : 3.9) * (drop === undefined ? 1 : 2)))
      cam.lookAt(aim)
      draw.begin(row.plain)
      const body = new Matrix4()
      const chute = drop !== undefined && dropPose(drop, 0, 0, 0, 0, 0, body, chuteAt)
      draw.add(lookOf(kind), body, { nod: 0.2, breath: 0, blink: !!kind[1].blink, chute: chute ? chuteAt : null }, pose)
      draw.end()
      gl.setRenderTarget(rt)
      gl.setClearColor(LOOK.sky, 1)
      gl.clear()
      gl.render(scene, cam)
      gl.readRenderTargetPixels(rt, 0, 0, size, size, px)
      // the target's rows run bottom up
      const img = new ImageData(size, size)
      for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4)
      cell.getContext('2d')!.putImageData(img, 0, 0)
      const x = c * CELL,
        y = r * (CELL + LABEL)
      // the far row is drawn small and blown up pixel for pixel: what the player actually sees of a sheep
      g.imageSmoothingEnabled = false
      g.drawImage(cell, x, y, CELL, CELL)
      g.fillStyle = '#3a3550'
      g.font = '600 17px system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillText(kind[0] + (row.view === 'back' ? ' · сзади' : row.view === 'far' ? ' · издали' : '') + (row.plain ? ' · проще' : ''), x + CELL / 2, y + CELL + 23)
    })
    rt.dispose()
  })
  gl.setRenderTarget(before)
  gl.setClearColor(LOOK.sky)
  gl.shadowMap.enabled = shadowsBefore
  ground.geometry.dispose()
  Object.values(meshes).forEach((m) => m.dispose())
  if (!given) gl.dispose()
  await fetch('/__shot?name=sheep-sheet', { method: 'POST', body: sheet.toDataURL('image/png') })
  return 'docs/concept/shots/sheep-sheet.png'
}
