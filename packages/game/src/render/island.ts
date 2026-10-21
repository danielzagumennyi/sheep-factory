import { GRID, RIM } from '@/game/balance'

/**
 * The island's edges as its parts are built (Field.top and Field.right): until it grows (ISLAND_GROW) the far row and
 * the east are under the sky. Scene remounts the island's parts when it grows, and each reads them as it builds.
 */
export const island = { top: 0, right: 32 }

const hash = (x: number, y: number, k: number) => {
  const j = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453
  return j - Math.floor(j)
}

/**
 * A tree of the rim on cell (x, y), or null. The island is the field and one cell more all round (ISLAND.margin; the
 * author, 20.10.2026: «размер карты + 1 клетка на которой декоративные деревья»): the trees stand on that ring, one to a
 * cell and in its middle like everything else on the map — along the far row and down both sides beside the field, never
 * on a corner (the island is rounded there) nor along the near edge, in front of the camera. Decor keeps off their cells.
 */
export function rimTree(x: number, y: number): { fir: boolean; yaw: number; size: number } | null {
  const far = y === island.top - 1 && x >= 0 && x < island.right
  const side = (x === -1 || x === island.right) && y >= island.top && y < GRID.rows
  if (!(far || side) || hash(x, y, 1) > RIM.trees) return null
  return { fir: hash(x, y, 2) < 0.5, yaw: hash(x, y, 3) * Math.PI * 2, size: RIM.size[0] + hash(x, y, 4) * (RIM.size[1] - RIM.size[0]) }
}
