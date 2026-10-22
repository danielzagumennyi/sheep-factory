/**
 * The icons drawn from the game's own 3D models (render/iconRender.ts) and kept as pictures in public/icons — every
 * building, each kind of sheep, a shorn one, what a sheep needs, the portal, the coin and the shears (the author: «сделай нормальные иконки для всех
 * объектов, сделав красивые рендеры для иконок»). The rest (the clearing cross, the lock, the lawn switch) stay drawn.
 * Run `__game.icons()` in the dev build after a model changes.
 */
export const RENDERED_ICONS = [
  'belt',
  'shearer',
  'carrot',
  'scare',
  'wash',
  'comb',
  'pick',
  'splitter',
  'merger',
  'sheep',
  'dirty',
  'tangled',
  'burrs',
  'shorn',
  'water',
  'combing',
  'tweezers',
  'portal',
  'coin',
  'shear',
] as const
export type RenderedIcon = (typeof RENDERED_ICONS)[number]

const set = new Set<string>(RENDERED_ICONS)
export const isRendered = (kind: string): kind is RenderedIcon => set.has(kind)
export const iconUrl = (kind: RenderedIcon) => import.meta.env.BASE_URL + 'icons/' + kind + '.png'
