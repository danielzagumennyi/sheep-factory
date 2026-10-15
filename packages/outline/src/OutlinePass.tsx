import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DepthTexture,
  Matrix4,
  Mesh,
  NearestFilter,
  NoColorSpace,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
  type Fog,
  type Material,
} from 'three'
import { MAX_INK_TAPS, inkTaps } from './inkTaps'
import { HIGHLIGHT, HIGHLIGHT_COLORS, HIGHLIGHT_ID_BASE, HIGHLIGHT_THICKNESS, OUTLINE, OUTLINE_LAYER, outlined } from './outline'

const compositeVertex = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`

/**
 * Workbench's outline: 25% per neighbour (one texel away, times the thickness) whose id differs. The lines fade
 * with the scene fog (Blender has none) so distant buildings keep the fogged look; the nearest depth of the five
 * samples is used so silhouettes against the sky stay crisp.
 *
 * `clip` fades the world's lines out past a rectangle round the origin (by the nearest surface of the five samples, like
 * the fog): whatever the host draws past its playable area over the ground there — a fog bank, a mist — is not in
 * the id buffer, so without it the edges of the ground under the fog would draw through.
 *
 * Loot is the exception (outline.ts HIGHLIGHT): an object whose id is in the highlighted block gets a solid coloured
 * line round the outside of its silhouette (the pixels next to it take its colour; the object itself is left as it is),
 * compared on the object id alone, so no line runs between a chest's lid and its body. It is drawn at full strength and without the fog fade — the point of it is to be seen
 * across the yard, which is exactly where the dark lines are meant to disappear. It is also the half the player
 * cannot switch off: `world` only drops the dark lines and the ink (uWorld = 0 discards every pixel that is not a
 * marker), because a marker is how the hero finds what is worth walking to, not a look.
 *
 * Ink (uInk > 0): on top of that, a solid line along the inside of every silhouette. A pixel is
 * inked when a neighbour within the ink's width (eight directions, two rings so thin things like a rifle barrel
 * are not stepped over, one more for every further 3 pixels of a thick line, up to four; the texels they land on
 * come in as uInkTaps, inkTaps.ts) has another id and lies behind it by more than uInkDepth of the pixel's
 * distance — sky included (no id, depth at the far plane). The line goes on the near object and not on what is
 * behind it: the dusk asphalt is nearly as dark as the ink, a red jacket or a rusty container is not. So the ground
 * (outline.ts markOutlinedGround) is not searched at all: what stands next to it is nearer. It has a colour of its
 * own (uInkColor): an inked pixel takes it whichever of the two lines is the stronger there.
 */
const compositeFragment = /* glsl */ `
uniform sampler2D uId;
uniform sampler2D uDepth;
uniform vec2 uTexel;
uniform float uOffset;
uniform float uLines;
uniform vec3 uColor;
uniform vec3 uInkColor;
uniform float uOpacity;
uniform float uNear;
uniform float uFar;
uniform vec2 uFog;
uniform vec3 uTints[TINT_COUNT];
uniform float uHighlightBase;
uniform float uHighlightOffset;
uniform float uInk;
uniform vec2 uInkTaps[MAX_INK_TAPS];
uniform int uInkTapCount;
uniform float uInkDepth;
uniform float uWorld;
uniform vec2 uClip;
uniform vec2 uClipHalf;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
#include <packing>
// every read at level 0 or by texel: the targets have no mips anyway, and on Windows (ANGLE → Direct3D) an implicit
// level inside a loop that breaks early makes the compiler unroll it and pull the samples out of its branches
float viewDist(vec2 uv) {
  return -perspectiveDepthToViewZ(textureLod(uDepth, uv, 0.0).r, uNear, uFar);
}
/** How far out of the clip rectangle the surface under a sample lies (negative inside): from its world position. */
float clipDist(vec2 uv) {
  vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, textureLod(uDepth, uv, 0.0).r * 2.0 - 1.0, 1.0);
  vec3 w = (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;
  return max(abs(w.x) - uClipHalf.x, abs(w.z) - uClipHalf.y);
}
float same(vec4 a, vec4 b) {
  return float(all(lessThan(abs(a - b), vec4(0.5 / 255.0))));
}
/** Object id of a sample, 0..65535. */
float objOf(vec4 c) {
  return floor(c.r * 255.0 + 0.5) * 256.0 + floor(c.g * 255.0 + 0.5);
}
float sameObj(vec4 a, vec4 b) {
  return float(abs(objOf(a) - objOf(b)) < 0.5);
}
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec2 dx = vec2(uTexel.x * uOffset, 0.0);
  vec2 dy = vec2(0.0, uTexel.y * uOffset);
  vec4 c = textureLod(uId, uv, 0.0);
  // a marked object itself shows as it is: its line goes round the outside (Овечья фабрика, the author: «обводка
  // снаружи, а не внутри объекта»)
  if (objOf(c) >= uHighlightBase) discard;
  // a pixel just outside a marked object takes its colour: eight directions at the full width and at half of it, so
  // corners and thin parts close up. The parts of one object share its id, so no line runs between them
  for (int i = 0; i < 16; i++) {
    float a = float(i - (i / 8) * 8) * 0.7853982 + (i < 8 ? 0.0 : 0.3926991);
    vec2 o = vec2(cos(a), sin(a)) * uTexel * uHighlightOffset * (i < 8 ? 1.0 : 0.55);
    vec4 n = textureLod(uId, uv + o, 0.0);
    if (objOf(n) >= uHighlightBase) {
      int tint = int(floor(n.a * 255.0 + 0.5));
      gl_FragColor = vec4(uTints[tint], uOpacity);
      #include <colorspace_fragment>
      return;
    }
  }
  // the world's own lines are the switchable half; loot has already returned above
  if (uWorld <= 0.0) discard;
  vec4 up = textureLod(uId, uv + dy, 0.0);
  vec4 down = textureLod(uId, uv - dy, 0.0);
  vec4 right = textureLod(uId, uv + dx, 0.0);
  vec4 left = textureLod(uId, uv - dx, 0.0);
  float alike = same(c, up) + same(c, down) + same(c, right) + same(c, left);
  // uLines 0: the player has set the world's lines to no width, the ink may still be drawn
  float outline = uLines * (1.0 - 0.25 * alike) * uOpacity;
  vec3 rgb = uColor;
  // ink: an inked pixel is on the near object, so its own distance is the line's distance for the fog fade
  float inkNear = 1e9;
  // the ground (the part id's top bit): nothing next to it is farther, so the ink never falls on it
  bool ground = c.b > 0.5;
  if (uInk > 0.0 && (c.r > 0.0 || c.g > 0.0) && !ground) {
    ivec2 px = ivec2(gl_FragCoord.xy);
    ivec2 edge = textureSize(uId, 0) - 1;
    // read only once a neighbour turns out to be something else, which most pixels never meet
    float here = -1.0;
    for (int i = 0; i < MAX_INK_TAPS; i++) {
      if (i >= uInkTapCount) break;
      ivec2 q = clamp(px + ivec2(uInkTaps[i]), ivec2(0), edge);
      if (same(c, texelFetch(uId, q, 0)) > 0.5) continue;
      if (here < 0.0) here = viewDist(uv);
      if (-perspectiveDepthToViewZ(texelFetch(uDepth, q, 0).r, uNear, uFar) - here > uInkDepth * here) {
        inkNear = here;
        break;
      }
    }
    if (inkNear < 1e9) {
      outline = max(outline, uInk * uOpacity);
      rgb = uInkColor;
    }
  }
  if (outline <= 0.001) discard;
  if (uClip.y > uClip.x) {
    float w = min(min(clipDist(uv), clipDist(uv + dy)), min(min(clipDist(uv - dy), clipDist(uv + dx)), clipDist(uv - dx)));
    outline *= 1.0 - smoothstep(uClip.x, uClip.y, w);
    if (outline <= 0.001) discard;
  }
  if (uFog.y > uFog.x) {
    float d = min(min(viewDist(uv), viewDist(uv + dy)), min(min(viewDist(uv - dy), viewDist(uv + dx)), viewDist(uv - dx)));
    outline *= 1.0 - smoothstep(uFog.x, uFog.y, min(d, inkNear));
  }
  gl_FragColor = vec4(rgb, outline);
  #include <colorspace_fragment>
}`

const _clear = new Color()

/**
 * Draws the outline over the frame from a fullscreen triangle rendered last (no depth). The id buffer is rendered
 * from the triangle's onBeforeRender, i.e. inside the main pass after every useFrame of the frame has run (models
 * that suspend on loading subscribe after this component, so a useFrame here would see the previous frame's
 * transforms and the lines would trail the hero by a frame). Nested renders are supported by three the way
 * Reflector uses them.
 *
 * `world` off drops the world's dark lines and the ink but keeps the loot markers, so the pass (and its id
 * buffer) runs either way: the markers are read off the same buffer, and the world's own meshes have to be in it
 * or a crate behind a wall would show its outline through it.
 *
 * The colours and widths left out (null) are read off OUTLINE every frame, so its live tuning keeps working; a host
 * that lets the player choose them passes them in.
 */
export function OutlinePass({
  world = true,
  ink = false,
  clip = null,
  color = null,
  inkColor = null,
  thickness = null,
  inkThickness = null,
}: {
  world?: boolean
  ink?: boolean
  /** Colour of the world's lines as a CSS colour (sRGB); null draws them in OUTLINE.color. Loot keeps its tints. */
  color?: string | null
  /** Colour of the ink, CSS (sRGB); null draws it in the lines' colour. */
  inkColor?: string | null
  /** Width of the world's lines, CSS pixels, 0 for none (the ink and the loot markers stay); null is OUTLINE.thickness. */
  thickness?: number | null
  /** Width of the ink, CSS pixels; null is OUTLINE.inkThickness. Switch the ink off with `ink`, not with 0. */
  inkThickness?: number | null
  /**
   * The rectangle the world's lines are kept in: its half-sizes (m, world X and Z round the origin) and the band, in
   * metres out from its edge (negative is inside), over which they fade out; null keeps them all.
   */
  clip?: { half: readonly [number, number]; fade: readonly [number, number] } | null
}) {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const target = useMemo(() => {
    const w = Math.max(1, Math.floor(size.width * dpr))
    const h = Math.max(1, Math.floor(size.height * dpr))
    const depthTexture = new DepthTexture(w, h, UnsignedIntType)
    const rt = new WebGLRenderTarget(w, h, {
      depthTexture,
      depthBuffer: true,
      stencilBuffer: false,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      generateMipmaps: false,
      format: RGBAFormat,
      type: UnsignedByteType,
      colorSpace: NoColorSpace,
    })
    return rt
  }, [size, dpr])
  useEffect(
    () => () => {
      target.depthTexture?.dispose()
      target.dispose()
    },
    [target],
  )

  const quad = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    const material = new ShaderMaterial({
      vertexShader: compositeVertex,
      fragmentShader: compositeFragment,
      uniforms: {
        uId: { value: null },
        uDepth: { value: null },
        uTexel: { value: new Vector2(1, 1) },
        uOffset: { value: 1 },
        uLines: { value: 1 },
        uColor: { value: new Color().setRGB(OUTLINE.color[0], OUTLINE.color[1], OUTLINE.color[2]) },
        uInkColor: { value: new Color().setRGB(OUTLINE.color[0], OUTLINE.color[1], OUTLINE.color[2]) },
        uOpacity: { value: OUTLINE.opacity },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uFog: { value: new Vector2(0, 0) },
        uTints: { value: HIGHLIGHT.map((t) => new Color().setRGB(...HIGHLIGHT_COLORS[t])) },
        uHighlightBase: { value: HIGHLIGHT_ID_BASE },
        uHighlightOffset: { value: HIGHLIGHT_THICKNESS },
        uInk: { value: 0 },
        uInkTaps: { value: new Float32Array(MAX_INK_TAPS * 2) },
        uInkTapCount: { value: 0 },
        uInkDepth: { value: OUTLINE.inkDepth },
        uWorld: { value: 1 },
        uClip: { value: new Vector2(0, 0) },
        uClipHalf: { value: new Vector2(0, 0) },
        uProjInv: { value: new Matrix4() },
        uCamWorld: { value: new Matrix4() },
      },
      defines: { TINT_COUNT: HIGHLIGHT.length, MAX_INK_TAPS },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
      lights: false,
    })
    material.name = 'outline_composite'
    const mesh = new Mesh(geometry, material)
    mesh.name = 'outline_composite'
    mesh.frustumCulled = false
    mesh.renderOrder = 10000
    return mesh
  }, [])
  useEffect(
    () => () => {
      quad.geometry.dispose()
      ;(quad.material as Material).dispose()
    },
    [quad],
  )

  useEffect(() => {
    // the ink's width the taps were worked out for
    let tapsFor = -1
    quad.onBeforeRender = (gl, scene, camera) => {
      // id pass: registered meshes only, with their id materials, into the id target
      const saved: Material[] = []
      const meshes: Mesh[] = []
      for (const mesh of outlined) {
        if (!mesh.parent) {
          outlined.delete(mesh)
          continue
        }
        meshes.push(mesh)
        saved.push(mesh.material as Material)
        mesh.material = mesh.userData.outlineMaterial as Material
      }
      const mask = camera.layers.mask
      const shadows = gl.shadowMap.autoUpdate
      const xr = gl.xr.enabled
      const prevTarget = gl.getRenderTarget()
      gl.getClearColor(_clear)
      const clearAlpha = gl.getClearAlpha()
      // a scene background (a sky box) goes into the render list past the camera layers: keep it out of the id buffer
      const background = scene.background
      scene.background = null
      camera.layers.set(OUTLINE_LAYER)
      gl.xr.enabled = false
      gl.shadowMap.autoUpdate = false
      gl.setClearColor(0x000000, 0)
      gl.setRenderTarget(target)
      gl.state.buffers.depth.setMask(true)
      if (!gl.autoClear) gl.clear()
      gl.render(scene, camera)
      scene.background = background
      gl.setRenderTarget(prevTarget)
      gl.setClearColor(_clear, clearAlpha)
      gl.shadowMap.autoUpdate = shadows
      gl.xr.enabled = xr
      camera.layers.mask = mask
      for (let i = 0; i < meshes.length; i++) meshes[i]!.material = saved[i]!

      // composite uniforms for this draw
      const u = (quad.material as ShaderMaterial).uniforms
      u.uId!.value = target.texture
      u.uDepth!.value = target.depthTexture
      u.uTexel!.value.set(1 / target.width, 1 / target.height)
      const dpr = gl.getPixelRatio()
      const lines = thickness ?? OUTLINE.thickness
      u.uOffset!.value = Math.max(1, lines * dpr)
      u.uLines!.value = lines > 0 ? 1 : 0
      u.uHighlightOffset!.value = Math.max(1, Math.max(1, lines) * HIGHLIGHT_THICKNESS * dpr)
      u.uOpacity!.value = OUTLINE.opacity
      const lineColor = u.uColor!.value as Color
      if (color) lineColor.set(color)
      else lineColor.setRGB(OUTLINE.color[0], OUTLINE.color[1], OUTLINE.color[2])
      if (inkColor) (u.uInkColor!.value as Color).set(inkColor)
      else (u.uInkColor!.value as Color).copy(lineColor)
      u.uInk!.value = ink && world ? OUTLINE.ink : 0
      u.uWorld!.value = world ? 1 : 0
      const inkOffset = Math.max(1, (inkThickness ?? OUTLINE.inkThickness) * dpr)
      if (inkOffset !== tapsFor) {
        tapsFor = inkOffset
        u.uInkTapCount!.value = inkTaps(inkOffset, u.uInkTaps!.value as Float32Array)
      }
      u.uInkDepth!.value = OUTLINE.inkDepth
      const cam = camera as { near?: number; far?: number }
      u.uNear!.value = cam.near ?? 0.1
      u.uFar!.value = cam.far ?? 100
      if (clip) {
        u.uClip!.value.set(clip.fade[0], clip.fade[1])
        u.uClipHalf!.value.set(clip.half[0], clip.half[1])
      } else u.uClip!.value.set(0, 0)
      u.uProjInv!.value.copy(camera.projectionMatrixInverse)
      u.uCamWorld!.value.copy(camera.matrixWorld)
      const f = scene.fog as Fog | null
      if (OUTLINE.fogFade && f && f.isFog) u.uFog!.value.set(f.near, f.far)
      else u.uFog!.value.set(0, 0)
    }
    return () => {
      quad.onBeforeRender = () => {}
    }
  }, [quad, target, ink, world, clip, color, inkColor, thickness, inkThickness])

  return <primitive object={quad} />
}
