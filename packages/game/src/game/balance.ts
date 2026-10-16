/**
 * Single source of truth for every tunable number (CLAUDE.md: «все числа живут в balance.ts»). Texts live in
 * i18n/content.ts; this file names things only by id. Section numbers refer to docs/01-GDD.md.
 */
import { LAND, RECT, type Spot } from './land'

// ---------------------------------------------------------------- world (GDD 2)

/** The field: 32×20 cells, cut into 8×5 plots; row ROAD_Y holds the docks, the two road lanes run below it. */
export const GRID = { cols: 32, rows: 20, plotW: 8, plotH: 5, roadY: 15 } as const

/** Directions in grid order: east, south, west, north. A building's `dir` indexes this table. */
export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]
export type Dir = 0 | 1 | 2 | 3

// ---------------------------------------------------------------- hands, belts, machines (GDD 3–4)

export const HAND = {
  /** A fluffy sheep is shorn by hand in this many clicks; every other gathering is one click, one item (into the stock). */
  shearClicks: 3,
} as const

export const BELT = {
  /** Cells per second an item travels along a belt. */
  speed: 1.7,
  /** A machine holds this many of each input; more waits on the belt. */
  bufMax: 4,
  /** A machine with no belt at its output drops up to this many items beside itself. */
  pileMax: 3,
  /** A merger buffers this many items. */
  mergerBuf: 2,
  /** An item stuck in front of the sheep's lane for this long jumps into the hand, so the loop never stops (GDD 4.4). */
  strayAfter: 1.2,
} as const

/** Upgrades: each level makes a machine this much faster, up to LVL_MAX. */
export const UPGRADE = { speedPerLevel: 0.5, maxLevel: 3, priceAdd: 20 } as const
/** The n-th copy of a machine costs base × (1 + escalate × n), rounded to 5. */
export const ESCALATE = 0.25

// ---------------------------------------------------------------- sheep (GDD 5)

export const SHEEP = {
  price: 30,
  /** Seconds a shorn sheep takes to grow a fleece once the pasture has paid for it (one hay, one water). */
  grow: 40,
  /** A pasture's walk speed, cells per second. */
  walk: 0.32,
  /** Seconds between two sheep leaving through the pasture exit. */
  exitGap: 1.4,
  /** A click within this many cells of a sheep picks it (a fluffy one is bigger). */
  pickR: 0.55,
  pickRFluffy: 0.68,
  /** Extra space for a pasture: +3 places for 60 + 40 per earlier expansion. */
  roomAdd: 3,
  roomBase: 60,
  roomStep: 40,
} as const

export const SHEEP_NAMES = ['Облачко', 'Зефирка', 'Ватрушка', 'Снежок', 'Пломбир', 'Пушок', 'Бяша', 'Кудряш', 'Мята', 'Лапка', 'Тучка', 'Пуговка', 'Хрум', 'Ириска', 'Сметанка', 'Бублик'] as const

// ---------------------------------------------------------------- resources and land (GDD 6)

export type ResId = 'meadow' | 'water' | 'bush'
export type TerrainId = ResId | 'tree' | 'rock' | 'bridge'

/**
 * Resources as in Tower Factory (the author, 14.10.2026): a cell holds a stock, a producer takes from the nearest
 * owned cell within REACH, and an empty cell disappears for good — nothing regrows except the pasture's own grass.
 */
export const RES: Readonly<Record<ResId, { max: number; gives: ItemId; plotValue: number }>> = {
  meadow: { max: 10, gives: 'hay', plotValue: 4 },
  water: { max: 20, gives: 'water', plotValue: 2 },
  bush: { max: 4, gives: 'dye', plotValue: 5 },
}
/**
 * A producer reaches the resource cells whose middle lies within this many cells of its own middle: a plain circle, as
 * drawn (the author: «сделай радиус не по клеткам, а просто круглый»).
 */
export const REACH = 3
/** Terrain that no building may stand on. */
export const BLOCKING: readonly TerrainId[] = ['rock', 'tree', 'water', 'bush', 'meadow']

/** A plot costs base + Σ cells × value, × (1 + step × plots bought so far), rounded to 5; an empty plot is not for sale. */
export const PLOTS = { base: 10, step: 0.25 } as const
/** The hint about buying land comes when an owned resource the mission needs falls to this many units. */
export const LOW_LAND = 3

// ---------------------------------------------------------------- goods and buildings (GDD 4)

export type ItemId = 'wool' | 'roving' | 'yarn' | 'felt' | 'dye' | 'cyarn' | 'sweater' | 'valenki' | 'hay' | 'water'

/** Base prices: the market pays a quarter, a dock outside its order pays one coin. */
export const ITEMS: Readonly<Record<ItemId, { price: number }>> = {
  wool: { price: 2 },
  roving: { price: 8 },
  yarn: { price: 20 },
  felt: { price: 12 },
  dye: { price: 3 },
  cyarn: { price: 24 },
  sweater: { price: 50 },
  valenki: { price: 55 },
  hay: { price: 1 },
  water: { price: 0 },
}
export const MARKET_SHARE = 0.25
/** The market sells anything at this many times a good's price, so buying never pays for an order (the author: «как продавать так и покупать»). */
export const BUY_SHARE = 2
/** A finished order keeps buying the same good for this share of a batch's pay (the author, 14.10.2026). */
export const EXTRA_SHARE = 0.5

export type BuildingId = 'belt' | 'shearer' | 'mower' | 'pump' | 'barn' | 'carder' | 'spinner' | 'splitter' | 'merger' | 'felter' | 'berry' | 'workshop' | 'feeder' | 'trough'

export interface BuildingDef {
  cost: number
  /** Seconds of one job at level 1. */
  time?: number
  /** A workshop's recipe: what one job takes. */
  inp?: Partial<Record<ItemId, number>>
  out?: ItemId
  /** A producer: the resource it takes and the item it gives. */
  near?: ResId
  gives?: ItemId
  /** Its back cell stands in the water (the pump): no reach, the pond never runs dry (the author). */
  onWater?: boolean
  /** A store that only takes one good in — the pasture's feeder and trough — up to `cap` of it. */
  takes?: ItemId
  cap?: number
  /** It may stand only with its resource in reach (bushes are few); a mower or a pump goes anywhere (the author). */
  needsNear?: boolean
  /** Each further copy costs more (ESCALATE). */
  escalate?: boolean
  upgradable?: boolean
  /** Placed onto a belt, replacing that belt cell. */
  onBelt?: boolean
  /**
   * Footprint as [length along its output, width across it]. Workshops are 2×2 like Tower Factory's, producers 2×1
   * with their one output on the narrow end (the author, 15.10.2026); the rest 1×1.
   */
  size?: readonly [number, number]
  /** Makes whichever of RECIPES the player picks, one at a time (the workshop). */
  recipes?: boolean
}

/** Every building does exactly one thing (GDD 4.1). */
export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  belt: { cost: 2 },
  shearer: { cost: 30, time: 2.5, escalate: true, upgradable: true, size: [2, 2] },
  mower: { cost: 40, time: 6, near: 'meadow', gives: 'hay', escalate: true, upgradable: true, size: [2, 1] },
  /** Its tower stands on a water cell, the barrel on the land beside it; water never runs out (the author, 16.10.2026). */
  pump: { cost: 40, time: 5, gives: 'water', onWater: true, escalate: true, upgradable: true, size: [2, 1] },
  /** Takes any good in from behind into the stock, so goods can be loaded on trucks by hand. */
  barn: { cost: 25, size: [2, 2] },
  carder: { cost: 60, time: 3, inp: { wool: 2 }, out: 'roving', escalate: true, upgradable: true, size: [2, 2] },
  spinner: { cost: 90, time: 5, inp: { roving: 1 }, out: 'yarn', escalate: true, upgradable: true, size: [2, 2] },
  splitter: { cost: 15, onBelt: true },
  merger: { cost: 10, onBelt: true },
  felter: { cost: 70, time: 4, inp: { wool: 3 }, out: 'felt', escalate: true, upgradable: true, size: [2, 2] },
  berry: { cost: 40, time: 6, near: 'bush', gives: 'dye', needsNear: true, escalate: true, upgradable: true, size: [2, 1] },
  workshop: { cost: 100, escalate: true, upgradable: true, size: [2, 2], recipes: true },
  /**
   * The pasture's feeder and trough (the author, 16.10.2026: «игрок подвозил сено и воду к пастбищу»): fixed 2×1 stores
   * along the pasture's two free sides, each taking one good in from its outer side; the sheep eat and drink from them.
   */
  feeder: { cost: 0, size: [1, 2], takes: 'hay', cap: 8 },
  trough: { cost: 0, size: [1, 2], takes: 'water', cap: 8 },
}

/** A building's footprint in cells along x and y when it faces `dir`: its length runs along dir, its width across. */
export function dimsOf(type: BuildingId, dir: Dir): [number, number] {
  const [l, w] = BUILDINGS[type].size ?? [1, 1]
  return dir % 2 === 0 ? [l, w] : [w, l]
}
/** Docks with a truck are 2×1 on the dock row; the market is a 2×2 stall reaching up into the row above (the author). */
export const DOCK = { w: 2, h: 1 } as const
export const MARKET = { w: 2, h: 2 } as const

export type RecipeId = 'cyarn' | 'sweater' | 'valenki'
/**
 * The workshop's recipes: goods made of two different things (the author, 15.10.2026: «мы же не будем под каждую вещь
 * новое здание делать»). One workshop makes one recipe at a time, the one picked in its popup; a new good is a new
 * recipe, not a new building. Each opens with its own «Новое» card.
 */
export const RECIPES: Readonly<Record<RecipeId, { inp: Partial<Record<ItemId, number>>; out: ItemId; time: number }>> = {
  cyarn: { inp: { yarn: 1, dye: 1 }, out: 'cyarn', time: 4 },
  sweater: { inp: { yarn: 1, cyarn: 1 }, out: 'sweater', time: 6 },
  valenki: { inp: { felt: 2, cyarn: 1 }, out: 'valenki', time: 6 },
}
export const RECIPE_ORDER: readonly RecipeId[] = ['cyarn', 'sweater', 'valenki']
/** Hotbar order; only unlocked tools are shown. */
export const TOOL_ORDER: readonly BuildingId[] = ['belt', 'shearer', 'mower', 'pump', 'barn', 'carder', 'spinner', 'splitter', 'merger', 'felter', 'berry', 'workshop']
export const PRODUCERS: readonly BuildingId[] = ['mower', 'pump', 'berry']
/** What a splitter's rule chip cycles through on click. */
export const SPLIT_RULES = ['any', 'wool', 'roving', 'yarn', 'felt', 'dye', 'cyarn', 'hay', 'water', 'sheep', 'off'] as const

// ---------------------------------------------------------------- road and orders (GDD 7)

export const ROAD = {
  /** Lane centres (grid rows): trucks park on A beside the docks and drive on B. */
  laneA: GRID.roadY + 1.5,
  laneB: GRID.roadY + 2.5,
  gap: 1.6,
  arriveSpeed: 4,
  leaveSpeed: 5,
  laneSpeed: 2,
} as const

/** Stars by time: ≤ par → ★★★, ≤ par × twoStar → ★★, else ★. */
export const STARS = { twoStar: 1.5 } as const

// ---------------------------------------------------------------- camera and look (render only)

export const CAMERA = {
  /**
   * Pitch from the ground, degrees, and the default distance in cells. A narrow lens from further away, like the
   * reference dioramas: tall things (trees, lanterns) stand upright instead of leaning out at the screen's edges.
   */
  pitch: 36,
  fov: 20,
  distance: 49,
  minDistance: 17,
  maxDistance: 86,
  panSpeed: 14,
  /** Turning round (Option- or right-drag, Q/E, a sideways two-finger swipe): the speeds. */
  turnPerPixel: 0.006,
  turnKeys: 1.6,
} as const

/** The board is an island (refs: the author's «Cute Magic» dioramas, 15.10.2026): a grass top over soil sides, in a calm sea. */
export const ISLAND = {
  /** Grass around the grid, cells. */
  margin: 1.5,
  corner: 1.8,
  /** Soil depth under the grass: the island floats on the sky like the reference dioramas, no sea round it. */
  soil: 1.5,
} as const

/**
 * The ponds and the canal (Water.tsx): the field's samples a cell, the blur (cells), the iso-line of the shore; the
 * surface's level and the kerb's top; a pumped-out cell's weight; where the colour steps (cells from the shore: foam,
 * shallows, deep); the drifting dashes.
 */
export const WATER = { R: 8, blur: 0.5, iso: 0.56, level: 0.035, kerbTop: 0.075, drained: 0.35, foam: 0.05, shallow: 0.16, deep: 1.2, dashLife: 2.5, dashDrift: 0.08 } as const

/** Light of the scene: a warm sun and a sky fill (toon bands come from the sun). */
/**
 * Sun and sky light; `sunFrom` is where the sun stands from the middle of the field (x, height, z): up and to the left
 * behind the field, so shadows fall to the lower right as in Tower Factory, about 0.4 cell per cell of height (the
 * author, after a critic). The fronts facing the camera stay half lit.
 */
export const LIGHT = { sun: 1.9, hemi: 1.0, sunFrom: [-9, 26, -5] } as const

/**
 * The lawn (Grass.tsx): leaves per tuft, a leaf's size, tufts per cell side (a jittered grid, so no bald patches: the
 * author, «не должно быть проплешин»), how low it bows while building, how far it shortens by what stands there.
 */
export const GRASS = { leaves: 8, height: 0.14, width: 0.12, grid: 6, cap: 34000, inset: 0.5 } as const

/** The sun's shadow map, texels a side: 2048 over the 48-cell frustum is ~0.02 of a cell, soft and cheap. */
export const SHADOW = { map: 2048 } as const
/** The soft dark halo painted into the ground round whatever stands on it, in place of screen-space AO. */
export const CONTACT = { building: 0.32, belt: 0.16, blur: 6 } as const

/** Each building's own colour: its roof in the field and its stripe on the build tile. */
export const ROOF: Readonly<Record<BuildingId, string>> = {
  belt: '#5b6577',
  shearer: '#f2668b',
  mower: '#f3bd3c',
  pump: '#3d9be9',
  barn: '#c8463c',
  carder: '#de8a4e',
  spinner: '#a368dd',
  splitter: '#4a5568',
  merger: '#4a5568',
  felter: '#3fb6a0',
  berry: '#c2477f',
  workshop: '#e5503f',
  feeder: '#c9935a',
  trough: '#6aa8d8',
}

/** Colours of the 3D scene; the HUD has its own CSS variables. */
export const LOOK = {
  /** The plain sky blue the island floats on (no sea: the author), and the haze. */
  sky: '#bfe6f3',
  skyLight: '#eaf6ff',
  groundBounce: '#a7c98a',
  sun: '#fff3dc',
  /** All the land one fresh spring green, owned or for sale (fences tell them apart), with faint lighter and deeper patches. */
  // the ground under the lawn is the leaves' own foot colour, so the gaps between tufts don't show
  ground: '#8cc131',
  groundLight: '#97cb3b',
  groundDark: '#82b52b',
  /** Trodden earth round buildings and the pen. */
  trodden: '#d9c49a',
  /** The dust a building raises as it comes down onto its place. */
  dust: '#efe2c4',
  /**
   * Placing, after Tower Factory (the author's screenshot of a belt piece in hand): what is held stands on a see-through
   * sky-blue block, its side towards the light paler, outlined in cream; a pink arrow shows the way in, a periwinkle one
   * the way out. Where it can't stand the block goes red and the model reddens a little. Lemon for a producer's reach
   * edge and the dashes to its resources; the reach tints what is inside it a cool blue.
   */
  blockLight: '#bfefff',
  blockDark: '#3d7be0',
  blockFloor: '#8cc8f0',
  blockBadLight: '#ff5a5a',
  blockBadDark: '#d63a3a',
  blockBadFloor: '#f07070',
  arrowIn: '#f5a3a8',
  arrowOut: '#a9c6ff',
  reachDash: '#eeffbb',
  reachEdge: '#fff89a',
  reachTint: '#5f7fd0',
  blockedTint: '#ffd2cc',
  /** The gold of a coin, and the ink line round every icon drawn from a model (render/iconRender.ts). */
  coin: '#f2c14e',
  iconInk: '#4a3428',
  /** The contact shadow round the foot of what stands on the ground. */
  contact: '#2f4a12',
  soil: '#a8724a',
  lip: '#8abe30',
  /** The cell grid, shown only while building. */
  grid: 'rgba(10, 40, 0, 0.7)',
  road: '#9a97aa',
  roadLine: '#fff6e0',
  curb: '#ece6da',
  dockRow: '#eee6d4',
  dockTile: '#b9a585',
  meadow: '#b6dc6a',
  meadowBase: '#7db349',
  meadowEar: '#f4c84a',
  /** The ground under a meadow: tilled soil with furrows. */
  meadowGround: '#c99d66',
  meadowFurrow: '#b0844f',
  pine: '#4fbf4a',
  pineDark: '#23843f',
  leaf: '#7ed04f',
  leafDark: '#3b9a3e',
  apple: '#ef4a3c',
  stem: '#3f9a3a',
  flowerHeart: '#ffd54a',
  /** Flower colours of the decor, as in the references. */
  flowers: ['#b98ae8', '#f08cbe', '#ec7a6a', '#ffd65a', '#7fb0ee'],
  /**
   * The lawn's leaves: the foot and the tip. Barely lighter than the ground, so the lawn reads as one soft green and
   * the leaves show mostly at its edges (the author's second sample: «трава берёт на себя слишком много внимания»).
   */
  grassFoot: '#8abf30',
  grassTip: '#98cf36',
  stone: '#7e8792',
  /** The workshop booth's awning: muted mustard and cream stripes, so the product under it is the bright thing. */
  workshopRoof: '#c99a3f',
  awningLight: '#f6ead0',
  /** The mower's reel. */
  reel: '#e5503f',
  /** Wing colours of the butterflies. */
  butterflies: ['#ffd54a', '#f37ab6', '#7fb8f5', '#ffffff', '#b884f0'],
  /** Pastel paving of the dock row. */
  paving: ['#ecdfc5', '#e2d2b2', '#f1e8d4'],
  rockDark: '#7f8a96',
  /** Water, as the references draw it: opaque candy blue, a pale edge of foam and shallows, darker where it is deep. */
  water: '#5bbffa',
  waterShallow: '#8fdcfb',
  waterFoam: '#e8f8ff',
  waterDeep: '#55b8f4',
  /** The bank round the water: a lighter green kerb, an earthy hairline at the water; mud where a pond was pumped. */
  kerb: '#8cc63b',
  kerbShade: '#6ba028',
  kerbEdge: '#8b6b4f',
  mud: '#c09a72',
  lily: '#77d55a',
  lilyFlower: '#ffb9ef',
  bush: '#58b44a',
  berry: '#8e4fd0',
  tree: '#6aa357',
  trunk: '#a77a52',
  rock: '#b8c0c9',
  plank: '#d2a86b',
  pasture: '#7fd25c',
  penRim: '#a98a55',
  fence: '#b9773f',
  fenceRail: '#d39a5c',
  trough: '#9aa7b8',
  /** Wooden conveyors, as in Tower Factory: a dark bed, light planks, side walls. */
  beltBed: '#7a4a2c',
  beltSlat: '#c48a50',
  beltWall: '#93603a',
  beltWallTop: '#b07a46',
  chevron: '#8a5530',
  machine: '#f7f9fc',
  machineEdge: '#2b3547',
  accent: '#dd4379',
  good: '#2e8c59',
  warn: '#d79a1c',
  bad: '#d24545',
  wool: '#ffffff',
  skin: '#f6c4d3',
  sheepFace: '#2b3240',
  hay: '#e2c15e',
  waterItem: '#4aa3df',
  roving: '#fffaf2',
  /** Undyed yarn is white, so it shows on the wooden belts; dyed yarn is the bright one. */
  yarn: '#fff6e8',
  felt: '#b8aa98',
  dye: '#7b4bb3',
  cyarn: '#d4458a',
  sweater: '#d95454',
  valenki: '#6f7a88',
  truck: '#f1f4f8',
  truckCab: '#dd4379',
} as const

// ---------------------------------------------------------------- missions (GDD 8)

export type ClientId = 'post' | 'school' | 'fair' | 'market' | 'bakery' | 'atelier' | 'smithy' | 'shop'
export type CardId =
  | 'shear'
  | 'shearer'
  | 'belt'
  | 'needs'
  | 'hay'
  | 'mower'
  | 'water'
  | 'pump'
  | 'barn'
  | 'carder'
  | 'spinner'
  | 'splitter'
  | 'merger'
  | 'felter'
  | 'dye'
  | 'berry'
  | 'extra'
  | 'land'
  | 'market'
  | 'workshop'
  | 'sweater'
  | 'valenki'
/** Cards shown once per game, not once per mission. */
export const ONCE_CARDS: readonly CardId[] = ['land', 'extra']

export interface OrderDef {
  id: string
  dock: ClientId
  kind: ItemId
  total: number
  batch: number
  pay: number
  /** Opened by the n-th paid batch. */
  unlocks?: readonly { at: number; id: BuildingId }[]
}
export interface PastureDef {
  x: number
  y: number
  w: number
  h: number
  dir: Dir
}
export type EventWhen = 'lowhay' | 'lowwater' | 'lowland' | `placed:${BuildingId}`
export interface MissionDef {
  id: MissionId
  /** ★★★ time, seconds. */
  par: number
  coins: number
  plots: readonly Spot[]
  needs: { food: boolean; water: boolean }
  pastures: readonly PastureDef[]
  sheep: number
  /** What the barn's stock holds at the start. */
  stock?: Partial<Record<ItemId, number>>
  /** Dock row positions. The market stands apart on the left with no truck; truck docks stand together on the right. */
  docks: readonly (readonly [ClientId, number])[]
  terrain: Partial<Record<TerrainId, readonly Spot[]>>
  start: readonly BuildingId[]
  /** Recipes the workshop knows in this mission (in the order they were learnt). */
  recipes: readonly RecipeId[]
  cards: readonly CardId[]
  orders: readonly OrderDef[]
  events: readonly { when: EventWhen; unlock?: BuildingId; card?: CardId }[]
}
export type MissionId = 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7'

/** The four central plots every mission starts with. */
const CENTRAL: readonly Spot[] = [
  [1, 1],
  [2, 1],
  [1, 2],
  [2, 2],
]
const HOME_MEADOW: readonly Spot[] = [
  [8, 5],
  [9, 5],
  [10, 5],
  [8, 6],
  [9, 6],
  [10, 6],
]
const pasture = (w: number, extra: Partial<PastureDef> = {}): PastureDef => ({ x: 10, y: 7, w, h: 3, dir: 0, ...extra })

/**
 * The campaign. Every mission opens new things one at a time (the author: «каждый продукт открывается отдельно»); all
 * orders are open from the start and the mission ends when every one is done. Outer plots each hold a deposit
 * (`LAND`), so buying land is a choice between near and small, far and rich.
 */
export const MISSIONS: readonly MissionDef[] = [
  {
    id: 'm1',
    par: 270,
    coins: 50,
    plots: CENTRAL,
    needs: { food: false, water: false },
    pastures: [pasture(3)],
    sheep: 5,
    docks: [
      ['post', 16],
    ],
    terrain: {
      tree: [
        [9, 5],
        [21, 6],
        [14, 12],
      ],
      rock: [[18, 11]],
    },
    start: [],
    recipes: [],
    cards: ['shear'],
    orders: [{ id: 'o1', dock: 'post', kind: 'wool', total: 48, batch: 8, pay: 20, unlocks: [{ at: 1, id: 'shearer' }] }],
    events: [{ when: 'placed:shearer', unlock: 'belt' }],
  },
  {
    id: 'm2',
    par: 450,
    coins: 60,
    plots: CENTRAL,
    needs: { food: true, water: true },
    pastures: [pasture(3)],
    stock: { hay: 10, water: 10 },
    sheep: 6,
    docks: [
      ['market', 9],
      ['fair', 19],
    ],
    terrain: LAND(
      {
        meadow: [
          [17, 6],
          [18, 6],
          [19, 6],
          [17, 7],
          [18, 7],
        ],
        water: [
          [8, 11],
          [9, 11],
          [10, 11],
        ],
        tree: [
          [9, 5],
          [22, 5],
          [15, 12],
        ],
        rock: [[20, 11]],
      },
      {
        '1,0': [['meadow', 8]],
        '2,0': [
          ['water', 5],
          ['meadow', 5],
        ],
        '0,1': [['meadow', 6]],
        '3,1': [['meadow', 10]],
        '0,2': [['water', 8]],
        '3,2': [
          ['meadow', 4],
          ['water', 4],
        ],
        '0,0': [['meadow', 14]],
        '3,0': [['water', 12]],
      },
    ),
    start: ['belt', 'shearer'],
    recipes: [],
    cards: ['needs', 'market'],
    orders: [
      {
        id: 'o1',
        dock: 'fair',
        kind: 'wool',
        total: 90,
        batch: 10,
        pay: 25,
        unlocks: [
          { at: 1, id: 'pump' },
          { at: 2, id: 'mower' },
        ],
      },
    ],
    events: [
      { when: 'lowhay', card: 'hay' },
      { when: 'lowwater', card: 'water' },
      { when: 'lowland', card: 'land' },
    ],
  },
  {
    id: 'm3',
    par: 570,
    coins: 180,
    plots: CENTRAL,
    needs: { food: true, water: true },
    pastures: [pasture(3)],
    stock: { hay: 8, water: 8 },
    sheep: 7,
    docks: [
      ['market', 9],
      ['bakery', 16],
      ['smithy', 18],
      ['atelier', 20],
    ],
    terrain: LAND(
      {
        meadow: HOME_MEADOW,
        water: [...RECT(8, 12, 15, 12), [17, 12], [18, 12], [20, 12], [21, 12], [22, 12], [23, 12]],
        bridge: [
          [16, 12],
          [19, 12],
        ],
        tree: [
          [16, 6],
          [22, 6],
        ],
        rock: [
          [13, 13],
          [21, 13],
        ],
      },
      {
        '1,0': [['meadow', 10]],
        '2,0': [['meadow', 6]],
        '0,1': [['meadow', 8]],
        '3,1': [['meadow', 12]],
        '0,2': [['meadow', 5]],
        '3,2': [['meadow', 7]],
        '0,0': [['meadow', 16]],
        '3,0': [['meadow', 14]],
      },
    ),
    start: ['belt', 'shearer', 'mower', 'pump', 'barn'],
    recipes: [],
    cards: ['carder'],
    orders: [
      { id: 'o1', dock: 'bakery', kind: 'roving', total: 25, batch: 5, pay: 30, unlocks: [{ at: 1, id: 'spinner' }] },
      { id: 'o2', dock: 'atelier', kind: 'yarn', total: 25, batch: 5, pay: 75, unlocks: [{ at: 1, id: 'splitter' }] },
      { id: 'o3', dock: 'smithy', kind: 'wool', total: 30, batch: 10, pay: 20, unlocks: [{ at: 1, id: 'merger' }] },
    ],
    events: [{ when: 'lowland', card: 'land' }],
  },
  {
    id: 'm4',
    par: 540,
    coins: 200,
    plots: CENTRAL,
    needs: { food: true, water: true },
    pastures: [pasture(3)],
    stock: { hay: 8, water: 8 },
    sheep: 8,
    docks: [
      ['market', 9],
      ['post', 16],
      ['atelier', 18],
    ],
    terrain: LAND(
      {
        meadow: HOME_MEADOW,
        water: [
          [20, 11],
          [21, 11],
          [22, 11],
        ],
        tree: [
          [16, 6],
          [23, 6],
          [9, 13],
        ],
        rock: [[17, 12]],
      },
      {
        '1,0': [['meadow', 8]],
        '2,0': [
          ['meadow', 6],
          ['water', 4],
        ],
        '0,1': [['meadow', 10]],
        '3,1': [['water', 8]],
        '0,2': [
          ['water', 5],
          ['meadow', 5],
        ],
        '3,2': [['meadow', 6]],
        '0,0': [['meadow', 15]],
        '3,0': [
          ['meadow', 9],
          ['water', 6],
        ],
      },
    ),
    start: ['belt', 'shearer', 'mower', 'pump', 'barn', 'carder', 'spinner', 'splitter', 'merger'],
    recipes: [],
    cards: ['felter'],
    orders: [
      { id: 'o1', dock: 'post', kind: 'felt', total: 30, batch: 5, pay: 45 },
      { id: 'o2', dock: 'atelier', kind: 'yarn', total: 25, batch: 5, pay: 75 },
    ],
    events: [{ when: 'lowland', card: 'land' }],
  },
  {
    id: 'm5',
    par: 420,
    coins: 460,
    plots: CENTRAL,
    needs: { food: true, water: true },
    pastures: [pasture(3)],
    stock: { hay: 8, water: 8 },
    sheep: 8,
    docks: [
      ['market', 9],
      ['school', 16],
      ['shop', 18],
    ],
    terrain: LAND(
      {
        meadow: HOME_MEADOW,
        water: [...RECT(8, 12, 14, 12), [16, 12], [17, 12], [18, 12], [20, 12], [21, 12], [22, 12], [23, 12]],
        bridge: [
          [15, 12],
          [19, 12],
        ],
        bush: [
          [19, 6],
          [20, 6],
          [19, 7],
          [20, 7],
          [21, 7],
          [21, 6],
        ],
        tree: [
          [23, 6],
          [13, 13],
        ],
      },
      {
        '1,0': [['meadow', 8]],
        '2,0': [['bush', 6]],
        '0,1': [['meadow', 10]],
        '3,1': [['bush', 8]],
        '0,2': [
          ['meadow', 5],
          ['bush', 4],
        ],
        '3,2': [['bush', 5]],
        '0,0': [['meadow', 14]],
        '3,0': [['bush', 12]],
      },
    ),
    start: ['belt', 'shearer', 'mower', 'pump', 'barn', 'carder', 'spinner', 'splitter', 'merger', 'felter'],
    recipes: ['cyarn'],
    cards: ['dye'],
    orders: [
      {
        id: 'o1',
        dock: 'school',
        kind: 'dye',
        total: 20,
        batch: 4,
        pay: 10,
        unlocks: [
          { at: 1, id: 'workshop' },
          { at: 3, id: 'berry' },
        ],
      },
      { id: 'o2', dock: 'shop', kind: 'cyarn', total: 60, batch: 5, pay: 90 },
    ],
    events: [{ when: 'lowland', card: 'land' }],
  },
  {
    id: 'm6',
    par: 620,
    coins: 540,
    plots: CENTRAL,
    needs: { food: true, water: true },
    pastures: [pasture(4)],
    stock: { hay: 8, water: 8 },
    sheep: 9,
    docks: [
      ['market', 9],
      ['atelier', 16],
      ['school', 18],
      ['fair', 20],
    ],
    terrain: LAND(
      {
        meadow: HOME_MEADOW,
        water: [
          [8, 11],
          [9, 11],
          [8, 12],
          [9, 12],
        ],
        bush: [
          [21, 7],
          [22, 7],
          [21, 8],
        ],
        tree: [
          [16, 6],
          [22, 5],
          [14, 13],
        ],
        rock: [[19, 11]],
      },
      {
        '1,0': [['meadow', 9]],
        '2,0': [
          ['bush', 5],
          ['meadow', 5],
        ],
        '0,1': [
          ['meadow', 7],
          ['water', 4],
        ],
        '3,1': [['bush', 9]],
        '0,2': [['water', 8]],
        '3,2': [
          ['bush', 4],
          ['water', 4],
        ],
        '0,0': [['meadow', 15]],
        '3,0': [['bush', 12]],
      },
    ),
    start: ['belt', 'shearer', 'mower', 'pump', 'barn', 'carder', 'spinner', 'splitter', 'merger', 'felter', 'berry', 'workshop'],
    recipes: ['cyarn', 'sweater'],
    cards: ['sweater'],
    orders: [
      { id: 'o1', dock: 'atelier', kind: 'sweater', total: 18, batch: 3, pay: 110 },
      { id: 'o2', dock: 'school', kind: 'cyarn', total: 16, batch: 4, pay: 70 },
      { id: 'o3', dock: 'fair', kind: 'felt', total: 16, batch: 4, pay: 35 },
    ],
    events: [{ when: 'lowland', card: 'land' }],
  },
  {
    id: 'm7',
    par: 560,
    coins: 620,
    plots: CENTRAL,
    needs: { food: true, water: true },
    pastures: [pasture(4)],
    stock: { hay: 8, water: 8 },
    sheep: 12,
    docks: [
      ['market', 9],
      ['post', 16],
      ['school', 18],
      ['atelier', 20],
    ],
    terrain: LAND(
      {
        meadow: HOME_MEADOW,
        water: [...RECT(8, 12, 17, 12), [19, 12], [20, 12], [21, 12], [23, 12]],
        bridge: [
          [18, 12],
          [22, 12],
        ],
        bush: [
          [21, 7],
          [22, 7],
        ],
        tree: [
          [16, 6],
          [23, 5],
        ],
        rock: [
          [14, 13],
          [21, 13],
        ],
      },
      {
        '1,0': [['meadow', 10]],
        '2,0': [['bush', 7]],
        '0,1': [
          ['meadow', 6],
          ['bush', 4],
        ],
        '3,1': [['bush', 9]],
        '0,2': [
          ['water', 6],
          ['meadow', 6],
        ],
        '3,2': [
          ['bush', 5],
          ['water', 5],
        ],
        '0,0': [['meadow', 16]],
        '3,0': [
          ['bush', 8],
          ['meadow', 8],
        ],
      },
    ),
    start: ['belt', 'shearer', 'mower', 'pump', 'barn', 'carder', 'spinner', 'splitter', 'merger', 'felter', 'berry', 'workshop'],
    recipes: ['cyarn', 'sweater', 'valenki'],
    cards: ['valenki'],
    orders: [
      { id: 'o1', dock: 'post', kind: 'valenki', total: 12, batch: 2, pay: 85 },
      { id: 'o2', dock: 'atelier', kind: 'sweater', total: 10, batch: 2, pay: 75 },
      { id: 'o3', dock: 'school', kind: 'cyarn', total: 15, batch: 5, pay: 90 },
    ],
    events: [{ when: 'lowland', card: 'land' }],
  },
]

export function missionDef(id: string): MissionDef {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0]!
}
