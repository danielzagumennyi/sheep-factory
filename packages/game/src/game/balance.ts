/**
 * Single source of truth for every tunable number (CLAUDE.md: «все числа живут в balance.ts»). Texts live in
 * i18n/content.ts; this file names things only by id. Section numbers refer to docs/01-GDD.md. The numbers were
 * checked by the economy model (docs/econ/model.mjs, docs/05-REWORK.md sections 6–7) before the code.
 */
import { RECT, type Spot } from './land'

// ---------------------------------------------------------------- world (GDD 2)

/**
 * The field: 40×40 cells, square (the author, 21.10.2026: «карту сделай квадратной»), cut into 5×5 plots of 8×8, with
 * the market on the middle plot (MARKET). Only part of it is the island at the start (ISLAND_START): the rest is under
 * the sky until the island grows (ISLAND_GROW).
 */
export const GRID = { cols: 40, rows: 40, plotW: 8, plotH: 8 } as const
/** The island's edges, cells: from `left` to before `right`, from `top` to before `bottom`. */
export interface IslandEdges {
  left: number
  top: number
  right: number
  bottom: number
}
/** The island at the start: the middle 3×3 plots, the market's and the ring round it. */
export const ISLAND_START: IslandEdges = { left: GRID.plotW, top: GRID.plotH, right: 4 * GRID.plotW, bottom: 4 * GRID.plotH }
/** One growth of the island: its new edges. */
export interface GrowDef extends Partial<IslandEdges> {
  level: number
}
/**
 * The island grows three times (the author, 17.10.2026: «остров растёт несколько раз»), ring by ring round the market,
 * at these levels: the column of plots in the east, then the row in the south, then the rest — the west and the north.
 * The new plots hold fresh deposits, for sale.
 */
export const ISLAND_GROW: readonly GrowDef[] = [
  { level: 7, right: GRID.cols },
  { level: 12, bottom: GRID.rows },
  { level: 14, left: 0, top: 0 },
]
/**
 * Hills (the author, 21.10.2026: «добавь ещё ландшафт, 2–3 уровень высоты, на нём строить нельзя»): the ground is the
 * first level, a hill rises to the second or the third — `tier` cells a step. Nothing stands on a hill: no building,
 * pen, sheep or deposit. Each lies inside one plot, off its edge rows and columns (MAP_HILLS).
 */
export const HILL = { tier: 0.55 } as const

/** The long game is kept as it goes (app/saves.ts): every this many seconds, besides when the page is hidden or left. */
export const SAVE = { everySec: 5 } as const

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
  /** A fluffy sheep is shorn by hand in this many clicks; what it gives falls beside it. Gathering is one click, one item into the hand. */
  shearClicks: 3,
  /** Heights goods fall from: a shorn sheep's back, the hand (as its stack is held, render/frame.ts CARRY_Y). */
  fallFrom: 0.6,
  carryAt: 1.2,
} as const
/**
 * Goods on the ground (GDD 3; the author, 21.10.2026: «смысл конвейером, двигать без конвейера игрок может двигать
 * сам»): nothing counts or moves by itself — what the hand shears or gathers, what a machine with no belt gives out,
 * what was in a building taken off lies in a pile on its cell (or the nearest of own land) until the hand carries it. A pile
 * holds up to `max`, and the hand carries one pile's worth.
 */
export const PILE = { max: 6 } as const
/**
 * The balance bot's hand (game/bot.ts): one hand, as the player's — a pick, a drop or a click takes `act` seconds, and
 * it moves `speed` cells a second between them, as a pointer drags across the field.
 */
export const BOT = { hand: { act: 0.5, speed: 14 } } as const

export const BELT = {
  /**
   * Cells per second an item travels along a belt, one item a cell: 80 items a minute on one line, as in Tower Factory
   * (the author, 17.10.2026). Machines make 20 or 40 a minute, so a line carries the output of two to four.
   */
  speed: 80 / 60,
  /** A machine holds this many of each input; more waits on the belt. */
  bufMax: 4,
  /** A merger buffers this many items. */
  mergerBuf: 2,
  /** A good stuck in front of the sheep's lane for this long falls off the belt beside it, so the loop never stops (GDD 4.4). */
  strayAfter: 1.2,
} as const

// ---------------------------------------------------------------- sheep and pens (GDD 5)

export const SHEEP = {
  price: 20,
  /**
   * Seconds a shorn sheep takes to grow a fleece once it has eaten (at a feeder, or fed by hand). With the ride round
   * its loop and the shearing a sheep comes round about every 24 s: a pen of four gives some 20 wool a minute.
   */
  grow: 14,
  /** A pen's walk speed, cells per second. */
  walk: 0.32,
  /** Seconds between two sheep leaving through a pen's exit. */
  exitGap: 1,
  /** A click within this many cells of a sheep picks it (a fluffy one is bigger). */
  pickR: 0.55,
  pickRFluffy: 0.68,
  /** Seconds a sheep with nothing to do here takes to pass through a station. */
  pass: 0.3,
  /** How fast a sheep crosses a pen that is not its own, cells per second, and how many may cross one at once. */
  transit: 1.4,
  transitMax: 2,
  /** A sheep picks its spot in a pen out of this many, the one furthest from the others; one this far from all of them, cells, will do. */
  spotTries: 6,
  apart: 0.8,
} as const

/**
 * A bought sheep comes down from the sky on a parachute (the author, 20.10.2026: «красивую/интересную/забавную анимацию
 * для её появления»): `fall` seconds swaying down from `height` cells, then `land` seconds bouncing on the grass while the
 * parachute folds. Till it has landed it neither walks nor can be picked up. A soft dark `mark` on the grass shows where
 * it will land from the moment it is bought, growing as it comes down (radius in cells, how dark).
 */
export const DROP = { fall: 1.9, land: 0.6, height: 6, mark: { from: 0.12, to: 0.35, opacity: 0.28 } } as const

/**
 * A good falling onto a pile (render/falls.ts; the author, 21.10.2026: шерсть должна «падать», а не просто мгновенно
 * появляться рядом): `base` seconds and `perCell` more for each cell it flies, an arc `arc` high, each of one fall
 * `stagger` seconds after the one before; on the ground it hops `hop` high for `bounce` seconds, a little dust going up.
 */
export const FALL = { base: 0.32, perCell: 0.12, arc: 0.45, stagger: 0.09, bounce: 0.22, hop: 0.13 } as const

/**
 * A sheep with no pen roams the own land (the author, 19.10.2026: «овцы вообще просто бегают по всей территории»): to a
 * spot up to `reach` cells away that it can walk to in a straight line (`tries` spots looked at), with free ground
 * `room` cells round it so it stands clear of fences and buildings; there it grazes `rest` seconds and up to `restMore` more. It walks round buildings, pens and the `blocking` ground and steps over
 * belts without stopping on them; built over, it runs to the nearest free ground. Grazing, its fleece grows by itself.
 */
export const ROAM = { reach: 3, tries: 8, room: 0.3, rest: 2, restMore: 3, blocking: ['rock', 'tree', 'water', 'bush'] as readonly TerrainId[] } as const

/**
 * A pen is a building of its own (GDD 5): 3×3, any number of them, each for four sheep (the author, 17.10.2026: «в одном
 * загоне до 4 животных»). Sheep are bought apart from pens and put into one by the player.
 */
export const PEN = { cost: 40, size: 3, cap: 4 } as const

export const SHEEP_NAMES = ['Облачко', 'Зефирка', 'Ватрушка', 'Снежок', 'Пломбир', 'Пушок', 'Бяша', 'Кудряш', 'Мята', 'Лапка', 'Тучка', 'Пуговка', 'Хрум', 'Ириска', 'Сметанка', 'Бублик'] as const

// ---------------------------------------------------------------- resources and land (GDD 6)

export type ResId = 'meadow' | 'bush'
export type TerrainId = ResId | 'tree' | 'rock' | 'water' | 'sprout'

/**
 * Resources as in Tower Factory (the author, 14.10.2026): a cell holds a stock, a producer takes from the nearest
 * owned cell within REACH, and an empty cell disappears for good. Wild cells are the deposits of the map; sown ones
 * (SOW) are smaller.
 */
export const RES: Readonly<Record<ResId, { max: number; gives: ItemId; plotValue: number }>> = {
  meadow: { max: 60, gives: 'hay', plotValue: 4 },
  bush: { max: 24, gives: 'dye', plotValue: 5 },
}
/**
 * Sowing (the author's idea, 16.10.2026): one seed — 1 hay or 1 dye — on an empty own cell sprouts and in `grow` s
 * becomes a meadow cell of `meadow` hay or a bush of `bush` dye. Mown or picked bare it disappears like a wild one.
 */
export const SOW = { grow: 60, meadow: 30, bush: 12 } as const
/** The seed each sown resource takes. */
export const SEED: Readonly<Record<ResId, ItemId>> = { meadow: 'hay', bush: 'dye' }
/**
 * A producer reaches the resource cells whose middle lies within this many cells of its own middle: a plain circle, as
 * drawn (the author: «сделай радиус не по клеткам, а просто круглый»). The seeder sows within it too.
 */
export const REACH = 3
/** Terrain that no building may stand on. */
export const BLOCKING: readonly TerrainId[] = ['rock', 'tree', 'water', 'bush', 'meadow', 'sprout']

/** A plot costs base + Σ cells × value, × (1 + step × plots bought so far), rounded to 5; an empty plot is not for sale. */
export const PLOTS = { base: 10, step: 0.25 } as const
/** The hint about land comes when an owned resource the farm needs falls to this many units. */
export const LOW_LAND = 20

// ---------------------------------------------------------------- goods and buildings (GDD 4)

/**
 * The goods: what shearing gives at each step of the salon, plain or coloured, and the hay and dye the stations use
 * (the author, 19.10.2026: everything is made on the sheep; «не привязываться к розовому, просто цветная»; «Нитки»
 * for the unfamiliar «ровница»).
 */
export type ItemId = 'wool' | 'cwool' | 'thread' | 'cthread' | 'yarn' | 'cyarn' | 'sweater' | 'csweater' | 'felt' | 'cfelt' | 'dye' | 'hay'

/**
 * Base prices. One sheep shorn gives 6 coins of wool, 10 of thread, 16 of yarn, 24 of a sweater: each station it
 * passed is worth more than the time it takes, so a longer loop pays. Colour adds more than the dye it takes; felt
 * pays a little more than thread for the water it needs. A client pays the full price for each one it takes; the
 * market pays a quarter for one nobody wants.
 */
export const ITEMS: Readonly<Record<ItemId, { price: number }>> = {
  hay: { price: 1 },
  dye: { price: 2 },
  wool: { price: 3 },
  cwool: { price: 5 },
  thread: { price: 5 },
  cthread: { price: 8 },
  yarn: { price: 8 },
  cyarn: { price: 13 },
  sweater: { price: 24 },
  csweater: { price: 38 },
  felt: { price: 6 },
  cfelt: { price: 9 },
}
/** Each plain good shorn and the coloured one a sheep from the dye station gives instead. */
export const COLORED: Readonly<Partial<Record<ItemId, ItemId>>> = { wool: 'cwool', thread: 'cthread', yarn: 'cyarn', sweater: 'csweater', felt: 'cfelt' }
/** What the market pays for a good nobody wants (sold from the stock, or past MARKET.keep), as a share of its price. */
export const MARKET_SHARE = 0.25
/** The market's trade sells anything at this many times a good's price, so feeding a client bought goods never pays (the author: «как продавать так и покупать»). */
export const BUY_SHARE = 2

export type BuildingId = 'belt' | 'pen' | 'sheep' | 'shearer' | 'feeder' | 'dyer' | 'comb' | 'curl' | 'knit' | 'bath' | 'mower' | 'berry' | 'seeder' | 'splitter' | 'merger' | 'sow'

/**
 * A station on the sheep's loop: what it does to a sheep passing through (GDD 5). The shearer takes off what grew; the
 * feeder feeds; the rest change the fleece the shearer will take — combed, curled, knitted into a sweater, felted in the
 * bath, coloured.
 */
export type StationId = 'shear' | 'feed' | 'dye' | 'comb' | 'curl' | 'knit' | 'bath'
/** The three steps of the salon: shearing counts how many of them a sheep went through, in any order (SHEAR_YIELD). */
export const STEPS: readonly StationId[] = ['comb', 'curl', 'knit']
/**
 * What shearing a fluffy sheep gives, by how many of the STEPS it went through (the author, 19.10.2026: «главное их
 * сумма»): none — wool, one — thread, two — yarn, all three — a sweater. A sheep from the bath gives felt whatever else
 * it went through; one from the dye station gives the coloured good (COLORED).
 */
export const SHEAR_YIELD: readonly (readonly [ItemId, number])[] = [
  ['wool', 2],
  ['thread', 2],
  ['yarn', 2],
  ['sweater', 1],
]
export const BATH_YIELD: readonly [ItemId, number] = ['felt', 2]

export interface BuildingDef {
  cost: number
  /** A station on the loop: what it does to a passing sheep, how long, and the good it uses (by its second way in). */
  station?: StationId
  time?: number
  uses?: ItemId
  /** A producer: the resource it takes and the item it gives. */
  near?: ResId
  gives?: ItemId
  /** It may stand only with its resource in reach (bushes are few); a mower goes anywhere (the author). */
  needsNear?: boolean
  /** It may stand only with water in REACH (the bath). */
  needsWater?: boolean
  /** The seeder: sows what a belt brings it, around itself. */
  sows?: boolean
  /** Placed onto a belt, replacing that belt cell. */
  onBelt?: boolean
  /**
   * Footprint as [length along its output, width across it]. Stations are 2×2 like Tower Factory's production,
   * producers 2×1 with their one output on the narrow end (the author, 15.10.2026), a pen 3×3; the rest 1×1.
   */
  size?: readonly [number, number]
  /** Stays in hand after it is placed, for the next one (a sheep: four go into a new pen). */
  repeat?: boolean
}

/**
 * Every building does exactly one thing (GDD 4.1). No copy costs more, and no machine is upgraded: it grows by copies.
 * The prices climb with the step of making (the author, 17.10.2026: «постройки дороже»): what comes later costs as much as
 * a level then brings in, so the coins always have somewhere to go and there is always something to save up for.
 */
export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  belt: { cost: 2 },
  pen: { cost: PEN.cost, size: [PEN.size, PEN.size] },
  /** A sheep bought into the pen the player clicks, while it has room (GDD 5). */
  sheep: { cost: SHEEP.price, repeat: true },
  shearer: { cost: 60, station: 'shear', time: 3, size: [2, 2] },
  feeder: { cost: 80, station: 'feed', time: 1, uses: 'hay', size: [2, 2] },
  dyer: { cost: 450, station: 'dye', time: 2, uses: 'dye', size: [2, 2] },
  comb: { cost: 120, station: 'comb', time: 2, size: [2, 2] },
  curl: { cost: 400, station: 'curl', time: 3, size: [2, 2] },
  knit: { cost: 800, station: 'knit', time: 4, size: [2, 2] },
  bath: { cost: 400, station: 'bath', time: 3, needsWater: true, size: [2, 2] },
  mower: { cost: 60, time: 3, near: 'meadow', gives: 'hay', size: [2, 1] },
  berry: { cost: 250, time: 3, near: 'bush', gives: 'dye', needsNear: true, size: [2, 1] },
  /** One sowing every `time` s, onto the nearest empty own cell in REACH, from the seeds a belt brings in. */
  seeder: { cost: 200, time: 3, sows: true, size: [2, 1] },
  splitter: { cost: 30, onBelt: true },
  merger: { cost: 20, onBelt: true },
  /** Sowing by hand: a click on an empty own cell puts a seed there from the hand (no coins). */
  sow: { cost: 0 },
}

/** A building's footprint in cells along x and y when it faces `dir`: its length runs along dir, its width across. */
export function dimsOf(type: BuildingId, dir: Dir): [number, number] {
  const [l, w] = BUILDINGS[type].size ?? [1, 1]
  return dir % 2 === 0 ? [l, w] : [w, l]
}
/**
 * The market (the author, 21.10.2026: «большой рынок куда будут идти все товары», «в центре»): one building of
 * `size`×`size` cells with its top-left cell at (x, y), in the middle of the land the game starts on, like the tower of
 * Tower Factory. Its ways in are fixed, like the tower's (the author, 21.10.2026: «понятные точки подключения как это
 * сделано в tower factory»): two on each side, `ports` cells along it from its corner. A belt brought to one, or a
 * machine's way out facing it, hands it its goods; they go into the stock, where the clients take them (CLIENT); so does what the hand brings. The stock keeps up to `keep` of each good — past
 * that the market sells it at once for a quarter, so no line ever jams, and no farm can pile up one good and turn its
 * line to another: the clients must be fed all the time.
 */
export const MARKET = { x: 16, y: 16, size: 8, ports: [2, 5], keep: 10 } as const

/** Hotbar order; only unlocked tools are shown. */
export const TOOL_ORDER: readonly BuildingId[] = [
  'shearer',
  'belt',
  'pen',
  'sheep',
  'comb',
  'mower',
  'feeder',
  'splitter',
  'curl',
  'merger',
  'bath',
  'sow',
  'berry',
  'dyer',
  'seeder',
  'knit',
]
export const PRODUCERS: readonly BuildingId[] = ['mower', 'berry']
/** What a splitter's rule chip cycles through on click; the popup shows only goods the farm has met. */
export const SPLIT_RULES = ['any', 'wool', 'cwool', 'thread', 'cthread', 'yarn', 'cyarn', 'sweater', 'csweater', 'felt', 'cfelt', 'dye', 'hay', 'sheep', 'off'] as const

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
  /**
   * Grass around the grid, cells: one cell, where the rim's trees stand (the author, 20.10.2026: «размер карты + 1
   * клетка на которой декоративные деревья»); the rim's fence runs along the grid's own edge, a cell in.
   */
  margin: 1,
  corner: 1.8,
  /** Soil depth under the grass: the island floats on the sky like the reference dioramas, no sea round it. */
  soil: 1.5,
} as const

/**
 * The ponds and the canal (Water.tsx): the field's samples a cell, the blur (cells), the iso-line of the shore; the
 * surface's level and the kerb's top; where the colour steps (cells from the shore: foam, shallows, deep); the drifting
 * dashes.
 */
export const WATER = { R: 8, blur: 0.5, iso: 0.56, level: 0.035, kerbTop: 0.075, foam: 0.05, shallow: 0.16, deep: 1.2, dashLife: 2.5, dashDrift: 0.08 } as const

/** Light of the scene: a warm sun and a sky fill (toon bands come from the sun). */
/**
 * Sun and sky light; `sunFrom` is where the sun stands from the middle of the field (x, height, z): up and to the left
 * behind the field, so shadows fall to the lower right as in Tower Factory, about 0.4 cell per cell of height (the
 * author, after a critic). The fronts facing the camera stay half lit.
 */
export const LIGHT = { sun: 1.9, hemi: 1.0, sunFrom: [-9, 26, -5] } as const

/** The rim's trees (render/island.ts `rimTree`): the share of its cells that have one, and their sizes — no bigger than their cell, so none leans over the fence or the island's edge. */
export const RIM = { trees: 0.6, size: [0.75, 0.85] } as const

/**
 * The lawn (Grass.tsx): leaves per tuft, a leaf's size, tufts per cell side (a jittered grid, so no bald patches: the
 * author, «не должно быть проплешин»), how low it bows while building, how far it shortens by what stands there.
 */
export const GRASS = { leaves: 8, height: 0.14, width: 0.12, grid: 6, cap: 48000, inset: 0.5 } as const

/** The sun's shadow map, texels a side: 2048 over the 60-cell frustum round the square island is ~0.03 of a cell, soft and cheap. */
export const SHADOW = { map: 2048 } as const
/** The soft dark halo painted into the ground round whatever stands on it, in place of screen-space AO. */
export const CONTACT = { building: 0.32, belt: 0.16, blur: 6 } as const

/** Each building's own colour: its roof in the field and its stripe on the build tile. */
export const ROOF: Readonly<Record<BuildingId, string>> = {
  belt: '#5b6577',
  pen: '#a98a55',
  sheep: '#f6c4d3',
  shearer: '#f2668b',
  feeder: '#e9a23b',
  dyer: '#d4458a',
  comb: '#de8a4e',
  curl: '#a368dd',
  knit: '#3fb6a0',
  bath: '#5aa9e6',
  mower: '#f3bd3c',
  berry: '#c2477f',
  seeder: '#6fb64a',
  splitter: '#4a5568',
  merger: '#4a5568',
  sow: '#6fb64a',
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
  /** The ring round a way in's and a way out's icon (render/iconSprite.ts): their arrows' colours, deeper so they show on grass. */
  arrowInRing: '#e7738f',
  arrowOutRing: '#6f97e6',
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
  /** The hills (render/Hills.tsx): the grass of their tops (the third level's a touch lighter) and the soil of their steps. */
  hill: { top: '#8cc131', high: '#9bcf45', side: '#b07a4e' },
  /** The cell grid, shown only while building. */
  grid: 'rgba(10, 40, 0, 0.7)',
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
  /** The mower's reel. */
  reel: '#e5503f',
  /** Wing colours of the butterflies. */
  butterflies: ['#ffd54a', '#f37ab6', '#7fb8f5', '#ffffff', '#b884f0'],
  rockDark: '#7f8a96',
  /** Water, as the references draw it: opaque candy blue, a pale edge of foam and shallows, darker where it is deep. */
  water: '#5bbffa',
  waterShallow: '#8fdcfb',
  waterFoam: '#e8f8ff',
  waterDeep: '#55b8f4',
  /** The bank round the water: a lighter green kerb, an earthy hairline at the water. */
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
  /** The sheep (the author's reference, 20.10.2026: round and fluffy): the cream of the deeper puffs, the shorn skin, the face and legs, a blush, horns, a collar and its tag. */
  woolShade: '#fcf9f4',
  skin: '#f6c4d3',
  sheepFace: '#3d3658',
  sheepBlush: '#ff9cb5',
  sheepHorn: '#f0bd7e',
  sheepCollar: '#e0475b',
  sheepTag: '#f6bf3c',
  /** A bought sheep's parachute (DROP): its red gores between white ones, and its cords. */
  chute: '#e8596f',
  chuteCord: '#f4ede4',
  /**
   * The market's hall (render/models.ts `marketHall`): its plinth and the pastel tiles round the hall, walls, the inside
   * seen through a door, the striped awning all round (its coral also its ways in's rails and its windows' shutters,
   * its cream their chevrons), the top roof and its eaves' band, the coin on top.
   */
  marketStone: '#d9cfbf',
  marketTiles: ['#ecdfc5', '#e2d2b2', '#f1e8d4'] as const,
  marketWall: '#fff8ec',
  marketInside: '#8a6450',
  marketAwning: ['#f2877a', '#fff5e6'] as const,
  marketRoof: '#7ccfc0',
  marketRoofEave: '#58b3a4',
  marketCoin: '#f5c542',
  /** Each client's colour: its name in the HUD, its dot in the market's window. */
  client: { post: '#5b8fd6', shop: '#e0607e', atelier: '#9b6fd6', cobbler: '#b0794a', school: '#f2b84b', fair: '#e2553f' } as Record<ClientId, string>,
  /** The spot on the grass where a bought sheep will land. */
  dropMark: '#2f5214',
  hay: '#e2c15e',
  waterItem: '#4aa3df',
  /** Plain goods are white or near it, so they show on the wooden belts; the coloured ones are the bright ones. */
  thread: '#fffaf2',
  yarn: '#fff6e8',
  felt: '#b8aa98',
  dye: '#7b4bb3',
  sweater: '#d95454',
  /**
   * Coloured goods are not one colour (the author: «просто цветная»): each is striped in these, and a sheep from the
   * dye station takes one of `fleeceColors` (by its id) as a tint over the white fleece.
   */
  colors: ['#f2669f', '#f6c445', '#4cc3a6', '#6f8ff2'],
  fleeceColors: ['#ffb0d2', '#ffe08a', '#a8e6cf', '#a9c6ff', '#d4b5ff'],
  /** A sheep's marks from the salon: the sheen of a combed fleece and its lines, curls, the bath's matted felt and its patches. */
  combed: '#f4f1ff',
  combedLine: '#bfb2ea',
  curls: '#eccb93',
  feltFleece: '#e6dcc8',
  feltPatch: '#f2ece2',
  /** A sown cell while it grows: little shoots on dark soil. */
  sprout: '#8fd65a',
  sproutSoil: '#b48857',
} as const

// ---------------------------------------------------------------- the village (GDD 7–8)

export type ClientId = 'post' | 'shop' | 'atelier' | 'cobbler' | 'school' | 'fair'
/** The market's clients (GDD 7), in the order the game meets them; each has its sign on the market hall. */
export const CLIENT_ORDER: readonly ClientId[] = ['post', 'shop', 'atelier', 'cobbler', 'school', 'fair']

/** «Новое» cards: one per thing a level opens (its id), and a few hints; `shear` is the first level's, shearing by hand. */
export type CardId = BuildingId | 'market' | 'shear' | 'land' | 'island' | 'chapter'
/** What a level may open: a building, trade, or the first level's card on shearing by hand. */
export type OpenId = BuildingId | 'market' | 'shear'
/** Cards shown once per game, not once per run. */
export const ONCE_CARDS: readonly CardId[] = ['land']

/**
 * The levels (GDD 8): what opens at the start of each — one thing, with its card — and what the clients take from then
 * on, in goods a minute (the author, 21.10.2026: постоянные клиенты). A client once come never leaves: each level lists
 * every client's need, the old ones at their new rate. A level is done when every client is content at once (CLIENT).
 *
 * Every part of the game comes in its turn (the author, 17.10.2026): the first level teaches shearing by hand only —
 * the sheep roam, nothing to build (the author, 19.10.2026); then the pen they are carried into; then the shearer on
 * its way out, and once it stands the belt that brings the sheep back (`after`). Buying sheep comes apart, trade
 * later, and food only with the feeder: until then a shorn sheep grows its fleece by itself. The salon's stations
 * come one by one, each with the client for what it makes (the author's salon, 19.10.2026).
 */
export interface LevelDef {
  open: readonly OpenId[]
  /** One more thing within the level, once the player has placed the first (the belt, after the shearer). */
  after?: { placed: BuildingId; open: BuildingId }
  /** Each client's good and how many it takes a minute. */
  needs: readonly (readonly [ClientId, ItemId, number])[]
}
const POST = (n: number) => ['post', 'wool', n] as const,
  SHOP = (n: number) => ['shop', 'thread', n] as const,
  ATELIER = (n: number) => ['atelier', 'yarn', n] as const,
  COBBLER = (n: number) => ['cobbler', 'felt', n] as const,
  SCHOOL = (n: number) => ['school', 'cwool', n] as const,
  FAIR = (n: number) => ['fair', 'sweater', n] as const
export const LEVELS: readonly LevelDef[] = [
  { open: ['shear'], needs: [POST(6)] },
  { open: ['pen'], needs: [POST(8)] },
  { open: ['shearer'], after: { placed: 'shearer', open: 'belt' }, needs: [POST(12)] },
  { open: ['sheep'], needs: [POST(14)] },
  { open: ['comb'], needs: [POST(16), SHOP(6)] },
  { open: ['market'], needs: [POST(20), SHOP(9)] },
  { open: ['mower'], needs: [POST(22), SHOP(10)] },
  { open: ['feeder'], needs: [POST(23), SHOP(11)] },
  { open: ['splitter'], needs: [POST(25), SHOP(12)] },
  { open: ['curl'], needs: [POST(25), SHOP(13), ATELIER(6)] },
  { open: ['merger'], needs: [POST(26), SHOP(13), ATELIER(9)] },
  { open: ['bath'], needs: [POST(26), SHOP(14), ATELIER(10), COBBLER(6)] },
  { open: ['sow'], needs: [POST(27), SHOP(14), ATELIER(11), COBBLER(10)] },
  { open: ['berry'], needs: [POST(27), SHOP(15), ATELIER(12), COBBLER(12)] },
  { open: ['dyer'], needs: [POST(27), SHOP(15), ATELIER(12), COBBLER(12), SCHOOL(6)] },
  { open: ['seeder'], needs: [POST(28), SHOP(15), ATELIER(12), COBBLER(13), SCHOOL(10)] },
  { open: ['knit'], needs: [POST(28), SHOP(15), ATELIER(12), COBBLER(13), SCHOOL(11), FAIR(3)] },
  { open: [], needs: [POST(28), SHOP(15), ATELIER(13), COBBLER(14), SCHOOL(13), FAIR(5)] },
]
/**
 * How content a client is (GDD 7): the share of its goods it has lately got, each one due either taken from the stock
 * or missed — a running average over about `fillSec` seconds, whatever it takes a minute. It is content at `content`:
 * fed all the time it gets there in about three times `fillSec`, fed less it never does, its bar stops at the share it
 * gets. A level is done when every client is content at once.
 */
export const CLIENT = { fillSec: 30, content: 0.95 } as const
/** Chapter 1 ends with the last level of the table; after it every client takes `grow` times more each level. */
export const AFTER = { grow: 1.1 } as const

// ---------------------------------------------------------------- the long game's map (GDD 2, 6.2)

/**
 * How the game starts: coins for the first pen, the shearer and the belt loop that brings its sheep back; four fluffy
 * sheep roaming round where the first pen will stand (`pen`, the bot's, west of the market), the market's plot and the
 * two west and south-west of it.
 */
export const START = {
  coins: 80,
  sheep: 4,
  pen: { x: 13, y: 23, dir: 3 as Dir },
  plots: [
    [2, 2],
    [1, 2],
    [1, 3],
  ] as readonly Spot[],
} as const

/** Cells of several inclusive rectangles. */
const RECTS = (...r: [number, number, number, number][]) => r.flatMap(([x0, y0, x1, y1]) => RECT(x0, y0, x1, y1))

/**
 * The terrain, placed by hand so the farm has room to grow the way the bot builds it round the market (game/plan.ts):
 * a meadow by each loop's mower, bushes by the dye station's berry picker, a pond by the felting loop's bath (and one in
 * the west, for the player's), every plot but those of the start with its own deposit so each one is worth buying (the
 * author, 14.10.2026: «какой смысл от остальных»), a meadow on the start's land for hay by hand, and a few trees and
 * stones. The ring round the start's 3×3 plots is the land that rises as the island grows (ISLAND_GROW).
 */
export const MAP_TERRAIN: Partial<Record<TerrainId, Spot[]>> = {
  meadow: RECTS(
    // by each loop's mower: A's, W's, S's, E's, X's, Y's
    [12, 12, 14, 14],
    [29, 13, 31, 15],
    [37, 21, 39, 22],
    [26, 30, 28, 31],
    [37, 30, 39, 31],
    [33, 34, 35, 36],
    // on the land the game starts with: hay by hand
    [9, 27, 11, 28],
    // a deposit in every other plot
    [18, 8, 20, 9],
    [19, 30, 21, 31],
    [20, 37, 22, 38],
    [26, 37, 28, 38],
    [5, 5, 6, 6],
    [17, 6, 19, 7],
    [26, 2, 28, 3],
    [2, 10, 4, 12],
    [2, 25, 4, 27],
    [5, 33, 6, 34],
    [10, 34, 12, 35],
  ),
  bush: RECTS([31, 21, 33, 22], [10, 2, 12, 3], [33, 6, 35, 7], [6, 22, 7, 23], [36, 10, 37, 12]),
  tree: [
    [6, 14],
    [25, 9],
    [14, 38],
    [36, 23],
    [22, 1],
  ],
  rock: [
    [8, 31],
    [30, 38],
    [3, 7],
  ],
  water: RECTS([32, 23, 34, 24], [2, 30, 3, 31]),
}

/**
 * The hills (HILL), as inclusive rectangles of the second level and of the third on top of them: some on the start's
 * land, the rest in the ring that rises, where the bot's farm does not go.
 */
export const MAP_HILLS: readonly (readonly [level: 2 | 3, x0: number, y0: number, x1: number, y1: number])[] = [
  // on the start's island: a knoll south of the first pen, a mound north-east of the market, one north-west of it
  [2, 12, 28, 14, 30],
  [3, 13, 29, 13, 29],
  [2, 29, 9, 30, 10],
  [2, 9, 9, 11, 10],
  // the ring
  [2, 1, 1, 4, 3],
  [3, 2, 2, 3, 2],
  [2, 33, 1, 37, 4],
  [3, 34, 2, 36, 3],
  [2, 2, 34, 4, 38],
  [3, 3, 35, 3, 37],
  [2, 17, 2, 21, 4],
  [3, 18, 3, 20, 3],
  [2, 2, 17, 5, 20],
  [3, 3, 18, 4, 19],
  [2, 36, 36, 38, 38],
  [3, 37, 37, 37, 37],
]
/** The level of each hill's cell, 2 or 3 (the ground's is 1, and not here). */
export const HILLS: ReadonlyMap<string, number> = new Map(MAP_HILLS.flatMap(([l, x0, y0, x1, y1]) => RECT(x0, y0, x1, y1).map(([x, y]) => [x + ',' + y, l] as const)).sort((a, b) => a[1] - b[1]))
