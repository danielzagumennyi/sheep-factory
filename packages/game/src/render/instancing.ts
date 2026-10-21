import { useEffect, useMemo } from 'react'
import { Color, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry, type Material } from 'three'

/**
 * Instanced meshes for the many small things of the field — tufts, berries, belt pieces, goods (TDD 4.2). A view
 * creates one with `useInstanced`, then every frame calls `begin`, `put` per instance and `end`.
 */
/** `shadows`: cast and receive (true), neither (false), or only receive (flat things whose own shadow nobody sees). */
export function useInstanced(geometry: BufferGeometry, material: Material, cap: number, name: string, shadows: boolean | 'receive' = true) {
  const mesh = useMemo(() => {
    const m = new InstancedMesh(geometry, material, cap)
    m.name = name
    m.instanceMatrix.setUsage(DynamicDrawUsage)
    m.frustumCulled = false
    m.count = 0
    m.castShadow = shadows === true
    m.receiveShadow = shadows !== false
    return m
  }, [geometry, material, cap, name, shadows])
  useEffect(() => () => mesh.dispose(), [mesh])
  return mesh
}

const _m = new Matrix4(),
  _p = new Vector3(),
  _q = new Quaternion(),
  _s = new Vector3(),
  _e = new Euler(),
  _c = new Color()

/**
 * The first `n` instances' matrices (and colours) sent to the GPU this frame: only those, not the mesh's whole room —
 * a flock's meshes have room for the most sheep there can be, and sent whole they cost more than drawing them.
 */
export function upload(m: InstancedMesh, n: number) {
  if (n === 0) return
  m.instanceMatrix.clearUpdateRanges()
  m.instanceMatrix.addUpdateRange(0, n * 16)
  m.instanceMatrix.needsUpdate = true
  if (!m.instanceColor) return
  m.instanceColor.clearUpdateRanges()
  m.instanceColor.addUpdateRange(0, n * 3)
  m.instanceColor.needsUpdate = true
}

export class Batch {
  n = 0
  constructor(readonly mesh: InstancedMesh) {}
  begin() {
    this.n = 0
  }
  /** Add one instance at (x, y, z) with a yaw and a scale (uniform or per axis); an optional colour. */
  put(x: number, y: number, z: number, yaw = 0, sx = 1, sy = sx, sz = sx, color?: string | Color) {
    if (this.n >= this.mesh.instanceMatrix.count) return
    _p.set(x, y, z)
    _q.setFromEuler(_e.set(0, yaw, 0))
    _s.set(sx, sy, sz)
    _m.compose(_p, _q, _s)
    this.mesh.setMatrixAt(this.n, _m)
    if (color !== undefined) this.mesh.setColorAt(this.n, typeof color === 'string' ? _c.set(color) : color)
    this.n++
  }
  end() {
    this.mesh.count = this.n
    upload(this.mesh, this.n)
  }
}
