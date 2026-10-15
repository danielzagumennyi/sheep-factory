import { describe, expect, it } from 'vitest'
import { BoxGeometry, Mesh, MeshBasicMaterial, type ShaderMaterial } from 'three'
import { markOutlined, markOutlinedGround, unmarkOutlined } from './outline'

const idMaterial = (mesh: Mesh) => mesh.userData.outlineMaterial as ShaderMaterial

describe('outline ids', () => {
  it('flags the ground and nothing else', () => {
    const ground = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    const crate = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    markOutlinedGround(ground)
    markOutlined(crate)
    expect(idMaterial(ground).uniforms.uGround!.value).toBe(1)
    expect(idMaterial(crate).uniforms.uGround!.value).toBe(0)
    // the flag is the part id's top bit, written after the part id is folded below it
    expect(idMaterial(ground).fragmentShader).toContain('mod(vPart, 32768.0) + uGround * 32768.0')
    unmarkOutlined(ground)
    unmarkOutlined(crate)
  })
})
