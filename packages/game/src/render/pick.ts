import { useEffect, type RefObject } from 'react'
import { Box3, Group, Matrix4, Mesh, Plane, Raycaster, Sphere, Vector2, Vector3, type Camera, type Object3D } from 'three'
import type { BuildingId } from '@/game/balance'
import { sheepAt } from '@/game/actions/hand'
import { get, isBeltLike } from '@/game/grid'
import { Flock, Plant, key, res, type Building, type SheepT, type World } from '@/game/world'
import { machineYaw, vmat } from './kit'
import { machineBody } from './machineModels'
import { fleece, sheepHead, sheepLegs, sheepTuft, shorn } from './models'

/** The scene objects the pointer can be over, so the hover line can find them: docks by their cell, pastures by id. */
export const views = { buildings: new Map<string, Object3D>(), pastures: new Map<number, Object3D>() }

/** How a sheep is posed this frame (SheepView.tsx): the whole of it, and each of its meshes. */
export interface SheepPose {
  base: Matrix4
  legs: Matrix4
  fleece: Matrix4
  head: Matrix4
  /** Fleece on (or the shorn body, posed by `fleece`). */
  woolly: boolean
}
/** Every drawn sheep's pose, by id. The flock is instanced, so this is what the pointer and the hover line read. */
export const sheepPoses = new Map<number, SheepPose>()

/** A sheep of plain meshes, posed like any one sheep: the ray is tested against it and the hover line drawn round it. */
export function sheepProxy() {
  const group = new Group()
  const part = (g: ReturnType<typeof fleece>) => {
    const m = new Mesh(g, vmat())
    m.matrixAutoUpdate = false
    group.add(m)
    return m
  }
  const proxy = { group, legs: part(sheepLegs()), body: part(fleece()), skin: part(shorn()), head: part(sheepHead()), tuft: part(sheepTuft()) }
  return proxy
}
export type SheepProxy = ReturnType<typeof sheepProxy>
/** Put the proxy in a sheep's pose. */
export function poseProxy(p: SheepProxy, pose: SheepPose) {
  p.legs.matrix.copy(pose.legs)
  p.body.matrix.copy(pose.fleece)
  p.skin.matrix.copy(pose.fleece)
  p.body.visible = pose.woolly
  p.skin.visible = !pose.woolly
  p.head.matrix.copy(pose.head)
  p.tuft.matrix.copy(pose.head)
  p.group.updateMatrixWorld(true)
}
const picker = sheepProxy()

/** Keep `ref`'s object in `map` under `k` while it is mounted. */
export function useView<K>(map: Map<K, Object3D>, k: K, ref: RefObject<Object3D | null>) {
  useEffect(() => {
    const o = ref.current
    if (!o) return
    map.set(k, o)
    return () => {
      if (map.get(k) === o) map.delete(k)
    }
  }, [map, k, ref])
}

/** Where the pointer last was over the field, in normalised device coordinates, and whether it is still over it. */
export const pointer = { ndc: new Vector2(), inside: false }

/** The height of a sheep's back: a near miss is looked for here rather than on the ground behind it. */
const backs = new Plane(new Vector3(0, 1, 0), -0.32)
const ground = new Plane(new Vector3(0, 1, 0), 0)
const ray = new Raycaster(),
  hit = new Vector3(),
  ball = new Sphere(new Vector3(), 0.55),
  box = new Box3(),
  at = new Vector3(),
  turn = new Matrix4()
/** A machine's whole model, put where one stands, for the ray to be tested against. */
const body = new Mesh(undefined, vmat())
// one still coming down on its parachute is out of reach (DROP)
const pickable = (s: SheepT) => (s.state === 'pasture' || s.state === 'transit' || s.state === 'roam' || s.state === 'belt') && s.drop === undefined

/** What the pointer is over: a sheep or a building, and whether the ray met its model or only the ground under it. */
export interface Picked {
  sheep: SheepT | null
  b: Building | null
  exact: boolean
}

/**
 * What lies under a screen point, by the models as drawn. It went by the ground cell under the pointer, so a machine's
 * roof, standing over the cell behind it, picked what was there (the author: «на какие-то части работает, на какие-то
 * нет»). Now the nearest model the ray meets wins — a sheep, a machine's whole model, a dock, a belt — and nothing beyond the
 * ground it reaches. A near miss falls back to the sheep closest to where the ray crosses the height of their backs (it
 * picked the sheep behind one: «будто выделяю одну сквозь другую»), then to the building on the cell under the pointer.
 */
export function pickAt(w: World, camera: Camera, ndc: Vector2, sheep = true): Picked {
  ray.setFromCamera(ndc, camera)
  const o = ray.ray.origin
  const floor = ray.ray.intersectPlane(ground, hit) ? { x: hit.x, z: hit.z } : null
  let best = floor ? o.distanceTo(hit) + 0.01 : Infinity
  const out: Picked = { sheep: null, b: null, exact: true }
  if (sheep)
    for (const s of res(w, Flock).sheep) {
      if (!pickable(s)) continue
      const pose = sheepPoses.get(s.id)
      if (!pose) continue
      // a sheep fits in a ball of 0.55 round its middle: only those the ray passes through are tested face by face
      const e = pose.base.elements
      ball.center.set(e[12]!, e[13]! + 0.3, e[14]!)
      if (!ray.ray.intersectsSphere(ball)) continue
      poseProxy(picker, pose)
      const h = ray.intersectObject(picker.group, true).find((q) => q.object.visible)
      if (h && h.distance < best) {
        best = h.distance
        out.sheep = s
      }
    }
  for (const b of res(w, Plant).b.values()) {
    let d = Infinity
    if (isBeltLike(b)) {
      // a belt, a splitter or a merger: a slab the height of its walls (or hub) over its cell
      box.min.set(b.x, 0, b.y)
      box.max.set(b.x + 1, b.type === 'belt' ? 0.26 : 0.3, b.y + 1)
      d = ray.ray.intersectBox(box, hit) ? o.distanceTo(hit) : Infinity
    } else if (b.type === 'dock') {
      const v = views.buildings.get(key(b.x, b.y))
      d = v ? (ray.intersectObject(v, true)[0]?.distance ?? Infinity) : Infinity
    } else {
      // the box round its model, turned as it stands, first, then the model itself
      const g = machineBody(b.type as BuildingId)
      if (!g.boundingBox) g.computeBoundingBox()
      at.set(b.x + b.w / 2, 0, b.y + b.h / 2)
      const yaw = machineYaw(b.type, b.dir)
      box.copy(g.boundingBox!).applyMatrix4(turn.makeRotationY(yaw)).translate(at)
      if (!ray.ray.intersectBox(box, hit) || o.distanceTo(hit) >= best) continue
      body.geometry = g
      body.position.copy(at)
      body.rotation.y = yaw
      body.updateMatrixWorld()
      d = ray.intersectObject(body, false)[0]?.distance ?? Infinity
    }
    if (d < best) {
      best = d
      out.b = b
      out.sheep = null
    }
  }
  if (out.sheep || out.b) return out
  out.exact = false
  if (sheep && ray.ray.intersectPlane(backs, hit)) out.sheep = sheepAt(w, hit.x, hit.z)
  if (!out.sheep && floor) out.b = get(w, Math.floor(floor.x), Math.floor(floor.z))
  return out
}
