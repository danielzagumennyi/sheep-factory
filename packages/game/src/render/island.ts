import { ISLAND_START, RIM } from '@/game/balance'
import type { HillRect } from '@/game/land'

/**
 * The island's edges as its parts are built (Field's left, top, right and bottom: the whole map), and its hills
 * (Field.hills, and their steps' rectangles). Scene sets them before the island's parts mount, and each reads them as
 * it builds.
 */
export const island = { ...ISLAND_START, hills: new Map() as ReadonlyMap<string, number>, hillRects: [] as readonly HillRect[] }
/** Is the cell on the island as built? */
export const inIsland = (x: number, y: number) => x >= island.left && y >= island.top && x < island.right && y < island.bottom
/** The level of the ground on a cell as built: 1, or a hill's 2 or 3. */
export const levelOf = (x: number, y: number) => island.hills.get(x + ',' + y) ?? 1

const hash = (x: number, y: number, k: number) => {
  const j = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453
  return j - Math.floor(j)
}

/**
 * A tree of the rim on cell (x, y), or null. The island is the field and one cell more all round (ISLAND.margin; the
 * author, 20.10.2026: «размер карты + 1 клетка на которой декоративные деревья»): the trees stand on that ring, one to a
 * cell and in its middle like everything else on the map — along the far edge and down both sides beside the field,
 * never on a corner (the island is rounded there) nor along the near edge, in front of the camera. Decor keeps off their
 * cells.
 */
export function rimTree(x: number, y: number): { fir: boolean; yaw: number; size: number } | null {
  const far = y === island.top - 1 && x >= island.left && x < island.right
  const side = (x === island.left - 1 || x === island.right) && y >= island.top && y < island.bottom
  if (!(far || side) || hash(x, y, 1) > RIM.trees) return null
  return { fir: hash(x, y, 2) < 0.5, yaw: hash(x, y, 3) * Math.PI * 2, size: RIM.size[0] + hash(x, y, 4) * (RIM.size[1] - RIM.size[0]) }
}
