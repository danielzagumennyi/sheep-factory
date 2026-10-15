/**
 * Object outlines the way Blender's Workbench draws them: every registered mesh gets an id, the ids are rendered
 * into an off-screen buffer, and one fullscreen pass darkens a pixel for each neighbour that belongs to something
 * else. Lines therefore run between objects and between the parts of one object, never around silhouettes only,
 * and nothing needs a post-processing stack.
 *
 * Register what should be outlined with `markOutlined` and drop `<OutlinePass />` in last; the pass renders the
 * id buffer itself from `onBeforeRender`, so it sees the frame it is about to draw rather than the last one.
 */
export { OutlinePass } from './OutlinePass'
export { markOutlined, markOutlinedGround, unmarkOutlined, outlined, GROUND_FLAG, OUTLINE, OUTLINE_LAYER, HIGHLIGHT, HIGHLIGHT_COLORS, HIGHLIGHT_ID_BASE, HIGHLIGHT_THICKNESS, type HighlightTint } from './outline'
