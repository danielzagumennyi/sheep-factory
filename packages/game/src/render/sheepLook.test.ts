import { expect, it } from 'vitest'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { SHEEP_AT } from './models'
import { newPose, sheepDrawer, sheepMeshes, standAt } from './sheepLook'

/**
 * A sheep is posed by hand-written matrix steps (sheepLook.ts: `standAt`, the fleece's and the head's), not by three's
 * `compose`: they must give the same matrices, for any turn, waddle, fleece, nod and breath.
 */
it('a sheep is posed exactly as compose would pose it', () => {
  const meshes = sheepMeshes(4)
  const draw = sheepDrawer(meshes)
  for (const [yaw, roll, wool, nod, breath] of [
    [0.3, 0.05, 1, 0.25, 0.4],
    [2.1, 0, 0.5, 0.1, -0.7],
    [-1, -0.08, 0, 0.3, 0],
  ]) {
    const pose = newPose()
    standAt(pose.base, 3, 0.1, 5, yaw!, roll!)
    const ref = new Matrix4().compose(new Vector3(3, 0.1, 5), new Quaternion().setFromEuler(new Euler(roll, yaw, 0, 'YXZ')), new Vector3(1, 1, 1))
    expect(pose.base.elements.map((v) => +v.toFixed(6))).toEqual(ref.elements.map((v) => +v.toFixed(6)))
    draw.begin()
    draw.add({ id: 1, wool: wool!, needs: [] }, pose.base, { nod: nod!, breath: breath!, blink: false }, pose)
    const woolly = wool! > 0.12,
      k = woolly ? 0.62 + 0.38 * wool! : 0.62,
      b = breath! * 0.012
    const [fx, fy] = SHEEP_AT.fleece,
      [hx, hy] = SHEEP_AT.head
    const fl = woolly
      ? new Matrix4().compose(new Vector3(fx, 0.07 + (fy - 0.07) * k, 0), new Quaternion(), new Vector3(k * (1 + b * 0.5), k * (1 + b), k * (1 + b * 0.5)))
      : new Matrix4().makeTranslation(fx, 0.22, 0)
    const hd = new Matrix4().compose(new Vector3(hx - (1 - k) * 0.15, hy - (1 - k) * 0.2, 0), new Quaternion().setFromEuler(new Euler(0, 0, nod)), new Vector3(1, 1, 1))
    expect(pose.fleece.elements.map((v) => +v.toFixed(6))).toEqual(
      ref
        .clone()
        .multiply(fl)
        .elements.map((v) => +v.toFixed(6)),
    )
    expect(pose.head.elements.map((v) => +v.toFixed(6))).toEqual(
      ref
        .clone()
        .multiply(hd)
        .elements.map((v) => +v.toFixed(6)),
    )
  }
})
