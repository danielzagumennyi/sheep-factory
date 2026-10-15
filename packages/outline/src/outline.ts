import { DoubleSide, ShaderMaterial, type InstancedMesh, type Mesh, type Object3D } from 'three'

/**
 * Blender Workbench "Object Outline" in the game (TDD 4.5). Workbench renders an object-id buffer and darkens a
 * pixel by 25% for each of its four neighbours (one pixel away) that belongs to another object. Blender-factory
 * models are built from many small objects, so the lines run between the parts; in the game those parts are
 * joined into one mesh and carry their index in the `_part_id` vertex attribute (tools/blender/common.tag_part),
 * so the id here is (object or instance, part). OutlinePass renders the registered meshes into the id buffer with
 * the materials created below and composites the lines over the frame.
 */
export const OUTLINE_LAYER = 2

/**
 * How the lines look: `color` is Blender's render setting in linear RGB, `thickness` the neighbour offset in CSS
 * pixels (Workbench uses one), `fogFade` fades the lines with the scene fog (Blender has none). Rendering style
 * rather than gameplay tuning, so it lives with the pass; the game re-exports it from its balance file.
 *
 * The `ink*` fields are the cel-shaded variant (`<OutlinePass ink />`): a solid line of `inkThickness` CSS pixels
 * along the inside of whatever stands in front of something else — the id changes and the neighbour is farther by
 * more than `inkDepth` of the distance. The depth test is what keeps it off the seams of coplanar road tiles and off
 * low kerbs, which the faint Workbench line still draws. `ink` is its strength, 0..1.
 *
 * `color`, `thickness` and `inkThickness` are the defaults: a host that lets the player pick them passes its own to
 * `<OutlinePass>` (the game's settings), and then these are not read.
 */
export const OUTLINE = {
  color: [0.025, 0.03, 0.035] as [number, number, number],
  thickness: 1,
  opacity: 1,
  fogFade: true,
  ink: 1,
  inkThickness: 2,
  inkDepth: 0.04,
}

/**
 * Loot wears a coloured outline instead of the dark one, so what is worth walking to is read off the silhouette
 * rather than off a glow that has to be re-armed (TDD 4.5). `none` is the ordinary dark line; the rest are the
 * three things the hero can pick up. The indices are written into the id buffer, so they are part of its format:
 * add a tint at the end, never in the middle.
 */
export const HIGHLIGHT = ['none', 'loot', 'chest', 'quest', 'hover', 'blocked', 'place'] as const
export type HighlightTint = (typeof HIGHLIGHT)[number]

/**
 * Colours of those tints in linear RGB, in the same order. Index 0 is never read (it is the dark line). They are
 * picked to sit away from what they outline: the crate is brown, so its gold is pushed to a pure yellow rather
 * than the amber it started as, which disappeared into the wood.
 */
export const HIGHLIGHT_COLORS: Record<HighlightTint, [number, number, number]> = {
  none: [0, 0, 0],
  loot: [0.191, 0.93, 0.283],
  chest: [1, 0.687, 0.047],
  quest: [0.117, 0.503, 0.68],
  // Овечья фабрика: what the pointer is over, a warm white line round its silhouette
  hover: [1, 0.86, 0.55],
  // and a building that can't be placed where it is held
  blocked: [1, 0.102, 0.102],
  // and one that can: cream, as in Tower Factory
  place: [1, 0.95, 0.72],
}

/**
 * The loot line is this much wider than the dark one, and never thinner than this many CSS pixels (dark lines
 * switched off): a marker has to be seen, not just be correct.
 */
export const HIGHLIGHT_THICKNESS = 3

/**
 * Object ids from here up mean "highlighted": the composite pass then draws this object's silhouette in the tint
 * carried by the low byte of the part channel, and ignores the part id, so the line runs round the outside of the
 * thing and not between its own pieces. Ordinary ids are kept below it.
 */
export const HIGHLIGHT_ID_BASE = 0xf000

/** The part id's top bit, set on the ground's pixels in the id buffer (markOutlinedGround). */
export const GROUND_FLAG = 0x8000
const GROUND_FLAG_GLSL = GROUND_FLAG.toFixed(1)

/** Meshes that take part in the outline (registered through markOutlined). */
export const outlined = new Set<Mesh>()

let nextId = 1
let nextHighlightId = HIGHLIGHT_ID_BASE

const idVertex = /* glsl */ `
attribute float _part_id;
uniform float uObjectBase;
uniform float uPerInstance;
flat varying float vObj;
flat varying float vPart;
#include <common>
#include <skinning_pars_vertex>
void main() {
  #ifdef USE_INSTANCING
  vObj = uObjectBase + uPerInstance * float(gl_InstanceID);
  #else
  vObj = uObjectBase;
  #endif
  vPart = floor(_part_id + 0.5);
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
}`

/**
 * Object/instance id in RG, part id in BA (8 bits each, exact in an RGBA8 target). A highlighted mesh writes its
 * tint index in place of the part id: its object id is already above HIGHLIGHT_ID_BASE, which is what tells the
 * composite pass to read BA as a tint and to compare only the object id, i.e. to draw the silhouette alone. The
 * ground (markOutlinedGround) sets the part id's top bit, GROUND_FLAG; no model has that many parts.
 */
const idFragment = /* glsl */ `
flat varying float vObj;
flat varying float vPart;
uniform float uTint;
uniform float uGround;
void main() {
  float o = mod(vObj, 65536.0);
  float p = uTint > 0.0 ? uTint : mod(vPart, ${GROUND_FLAG_GLSL}) + uGround * ${GROUND_FLAG_GLSL};
  float oHi = floor(o / 256.0);
  float pHi = floor(p / 256.0);
  gl_FragColor = vec4(oHi, o - oHi * 256.0, pHi, p - pHi * 256.0) / 255.0;
}`

function idMaterial(base: number, tint = 0, perInstance = 1): ShaderMaterial {
  const mat = new ShaderMaterial({
    vertexShader: idVertex,
    fragmentShader: idFragment,
    uniforms: {
      uTint: { value: tint },
      uGround: { value: 0 },
      uObjectBase: { value: base },
      uPerInstance: { value: perInstance },
    },
    side: DoubleSide,
    fog: false,
    lights: false,
  })
  mat.name = 'outline_id'
  return mat
}

/**
 * Register every mesh under `root` for the outline: it gets its own id material (instances count up from the
 * object's base id) and the outline layer. Safe to call repeatedly.
 *
 * With a `tint` the mesh is outlined in that colour along its silhouette only — loot, so the hero can tell a
 * health kit from a coin at a glance. Its ids come from a block of their own above HIGHLIGHT_ID_BASE; a mesh in
 * that block that is also instanced (every loot mesh is) still needs one id per instance, so two cans lying
 * against each other keep a line between them.
 */
export function markOutlined(root: Object3D, tint: HighlightTint = 'none', shareIds = false) {
  const index = HIGHLIGHT.indexOf(tint)
  let shared = -1
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || outlined.has(mesh)) return
    const instanced = mesh as InstancedMesh
    const ids = instanced.isInstancedMesh ? instanced.instanceMatrix.count : 1
    // `shareIds`: every mesh of this root gets the same id block, so instance k of each is one object — a chest's
    // body and its lid, which are drawn from two instanced meshes but are one box on the ground
    // (and with a tint, every instance too: the whole of it is one silhouette — a line of belt being drawn)
    const per = shareIds && index > 0 ? 0 : 1
    if (shareIds && shared >= 0) {
      mesh.userData.outlineMaterial = idMaterial(shared, index, per)
    } else if (index > 0) {
      shared = nextHighlightId
      mesh.userData.outlineMaterial = idMaterial(nextHighlightId, index, per)
      nextHighlightId += ids
      if (nextHighlightId > 0xffff) nextHighlightId = HIGHLIGHT_ID_BASE
    } else {
      shared = nextId
      mesh.userData.outlineMaterial = idMaterial(nextId)
      // ordinary ids stay below the highlighted block, or a wall would be taken for a chest
      nextId = (nextId + ids) % HIGHLIGHT_ID_BASE || 1
    }
    mesh.layers.enable(OUTLINE_LAYER)
    outlined.add(mesh)
  })
}

/**
 * Register the ground like markOutlined, with GROUND_FLAG in its ids: the composite pass does not search for ink on
 * it. Whatever stands on the ground is nearer to the camera than the ground round it, and the ink goes on the nearer
 * side of an edge, so on the ground the search — the costly part of the pass, over most of the screen — has nothing
 * to find. Its own lines (a kerb, the edge of a road) are the Workbench ones and stay.
 */
export function markOutlinedGround(root: Object3D) {
  markOutlined(root)
  root.traverse((o) => {
    const material = o.userData.outlineMaterial as ShaderMaterial | undefined
    if (material) material.uniforms.uGround!.value = 1
  })
}

/** Forget a mesh (its id material is disposed). */
export function unmarkOutlined(root: Object3D) {
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || !outlined.has(mesh)) return
    ;(mesh.userData.outlineMaterial as ShaderMaterial | undefined)?.dispose()
    delete mesh.userData.outlineMaterial
    mesh.layers.disable(OUTLINE_LAYER)
    outlined.delete(mesh)
  })
}
