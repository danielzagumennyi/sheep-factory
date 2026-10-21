import { HILL } from '@/game/balance'
import { levelOf } from './island'

/** How far in from a step's edge its lawn and its trees keep, cells: off the grass lip and off the step above. */
const KEEP = 0.18

/** The height of the ground at a point (cells): a hill's cell stands a tier for each level over the first (HILL). */
export function hillHeight(px: number, pz: number) {
  const l = levelOf(Math.floor(px), Math.floor(pz))
  return l > 1 ? (l - 1) * HILL.tier : 0
}

/** Is the point on a hill's flat top, clear of its edge and of the step above: where its lawn grows and its trees stand. */
export function onHillTop(px: number, pz: number) {
  const x = Math.floor(px),
    y = Math.floor(pz),
    l = levelOf(x, y)
  if (l < 2) return false
  const fx = px - x,
    fz = pz - y
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || levelOf(x + dx, y + dy) === l) continue
      const nearX = !dx || (dx < 0 ? fx : 1 - fx) < KEEP,
        nearZ = !dy || (dy < 0 ? fz : 1 - fz) < KEEP
      if (nearX && nearZ) return false
    }
  return true
}
