/**
 * The icons drawn from the game's own 3D models (render/iconRender.ts) and kept as pictures in public/icons — every
 * building, good, resource, the sheep, the coin and the shears (the author: «сделай нормальные иконки для всех
 * объектов, сделав красивые рендеры для иконок»). The rest (the clearing cross, the lock, the lawn switch) stay drawn.
 * Run `__game.icons()` in the dev build after a model changes.
 */
export const RENDERED_ICONS = [
  'belt',
  'shearer',
  'mower',
  'pump',
  'barn',
  'carder',
  'spinner',
  'splitter',
  'merger',
  'felter',
  'berry',
  'workshop',
  'wool',
  'roving',
  'yarn',
  'felt',
  'dye',
  'cyarn',
  'sweater',
  'valenki',
  'hay',
  'water',
  'pond',
  'meadow',
  'bush',
  'sheep',
  'coin',
  'shear',
] as const
export type RenderedIcon = (typeof RENDERED_ICONS)[number]

const set = new Set<string>(RENDERED_ICONS)
export const isRendered = (kind: string): kind is RenderedIcon => set.has(kind)
export const iconUrl = (kind: RenderedIcon) => import.meta.env.BASE_URL + 'icons/' + kind + '.png'
