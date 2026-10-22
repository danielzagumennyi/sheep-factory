import { Vector3, type Material, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three'
import { CARROT, LOOK } from '@/game/balance'

const srgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/**
 * The circle of a carrot or a scarecrow being placed (or hovered), or a wash's reach for water, tints everything inside
 * it a cool blue — the ground, the plants — as Tower Factory's circle does. One set of uniforms shared by every lit
 * material; Ghost.tsx sets the circle and its radius, the rule's own (CARROT, SCARE, WATER_REACH).
 */
export const reach = {
  /** The middle of the circle, in cells (x, z). */
  uReach: { value: new Vector3() },
  uReachR: { value: CARROT.radius as number },
  uReachOn: { value: 0 },
  uReachTint: { value: srgb(LOOK.reachTint) },
  uReachMix: { value: 0.35 },
}

const HEAD_V = '#include <common>\nvarying vec2 vReachXZ;'
const BODY_V = `#include <project_vertex>
{
  vec4 rp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
  rp = instanceMatrix * rp;
  #endif
  vReachXZ = ( modelMatrix * rp ).xz;
}`
const HEAD_F = '#include <common>\nvarying vec2 vReachXZ;\nuniform vec3 uReach;\nuniform float uReachR;\nuniform float uReachOn;\nuniform vec3 uReachTint;\nuniform float uReachMix;'
// mixed in after the colour is in screen space (and fogged), so the tint is the sRGB colour it says
const BODY_F = `if ( uReachOn > 0.5 ) {
  float d = length( vReachXZ - uReach.xy ) - uReachR;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, uReachTint, ( 1.0 - smoothstep( -0.04, 0.04, d ) ) * uReachMix );
}
#include <dithering_fragment>`

/** Make a material take the reach tint; `key` keeps its program apart from others with other patches. */
export function withReach<M extends Material>(m: M, key = 'plain'): M {
  const prev = m.onBeforeCompile.bind(m)
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
    prev(shader, renderer)
    Object.assign(shader.uniforms, reach)
    shader.vertexShader = shader.vertexShader.replace('#include <common>', HEAD_V).replace('#include <project_vertex>', BODY_V)
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', HEAD_F).replace('#include <dithering_fragment>', BODY_F)
  }
  m.customProgramCacheKey = () => 'reach:' + key
  return m
}
