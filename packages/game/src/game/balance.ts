/**
 * Single source of truth for every tunable number (CLAUDE.md: «все числа живут в balance.ts»). Texts live in
 * i18n/content.ts; this file names things only by id. Section numbers refer to docs/01-GDD.md. Numbers marked «draft»
 * there are the balance bot's to tune (GDD 8).
 */
// ---------------------------------------------------------------- world (GDD 2)

/**
 * The map: 112×112 cells, square (the author, 22.10.2026: «вдвое шире» the 56×56 one, four times the land), all of it
 * the player's from the start — no plots, no fence of own land, no island growing. The portal stands in the middle
 * (PORTAL).
 */
export const GRID = { cols: 112, rows: 112 } as const
/** The island's edges, cells: from `left` to before `right`, from `top` to before `bottom`. */
export interface IslandEdges {
  left: number
  top: number
  right: number
  bottom: number
}
/** The island: the whole map, from the start. */
export const ISLAND_START: IslandEdges = { left: 0, top: 0, right: GRID.cols, bottom: GRID.rows }
/**
 * Hills (the author, 21.10.2026: «добавь ещё ландшафт, 2–3 уровень высоты, на нём строить нельзя»): the ground is the
 * first level, a hill rises to the second or the third — `tier` cells a step. Nothing stands on a hill: no building or
 * sheep. Where they lie is the map's (MAP).
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
  /** A ready fluffy sheep is shorn by hand in this many clicks (GDD 3). */
  shearClicks: 3,
} as const
/**
 * The balance bot's hand (game/bot.ts): one hand, as the player's — a pick, a drop or a click takes `act` seconds, and
 * it moves `speed` cells a second between them, as a pointer drags across the field.
 */
export const BOT = { hand: { act: 0.5, speed: 14 }, away: 6 } as const

export const BELT = {
  /**
   * Cells per second a sheep rides a belt, one a cell: 80 a minute on one line, as in Tower Factory (the author,
   * 17.10.2026). Stations and carrots do 20 a minute (draft), so a line carries the output of two to four.
   */
  speed: 80 / 60,
  /** A merger buffers this many sheep. */
  mergerBuf: 2,
} as const

// ---------------------------------------------------------------- sheep (GDD 5)

export const SHEEP = {
  /** Walk speed, cells per second. */
  walk: 0.32,
  /** A click within this many cells of a sheep picks it (a fluffy one is bigger). */
  pickR: 0.55,
  pickRFluffy: 0.68,
  /** Coins a shorn sheep brings when it goes into the portal, whatever its kind (GDD 7; draft). */
  coins: 5,
  /**
   * Most sheep on the map at once (arrivals wait past it): the flock is drawn for this many. Measured on the old 56×56
   * map (`__game.stress`, a retina screen, Apple M5, 22.10.2026): 5000 sheep take 10–11 ms of the 16.7 a frame at 60 fps
   * has; on the 112×112 one 3000 sheep take 2–4 ms at 1024×768 (docs/02-TDD.md 4.2.1).
   */
  most: 5000,
} as const

/**
 * Sheep kinds (GDD 5; the author, 22.10.2026): what a sheep needs before it may be shorn — one trouble each for now
 * (mixed kinds likely later: then every station of theirs, in any order). A kind starts arriving once `at` sheep have
 * gone into the portal (draft); `plain` from the start.
 */
export type KindId = 'plain' | 'dirty' | 'tangled' | 'burrs'
/** A preparing station's job: what a sheep may still need. */
export type NeedId = 'wash' | 'comb' | 'pick'
export const KINDS: Readonly<Record<KindId, { needs: readonly NeedId[]; at: number }>> = {
  plain: { needs: [], at: 0 },
  dirty: { needs: ['wash'], at: 60 },
  tangled: { needs: ['comb'], at: 200 },
  burrs: { needs: ['pick'], at: 400 },
}
export const KIND_ORDER: readonly KindId[] = ['plain', 'dirty', 'tangled', 'burrs']

/**
 * Arrivals (GDD 6; the author, 22.10.2026: «одновременно на карте должно быть много овец»): a big flock roams the map
 * from the start, `start` of them, `nearPortal` of those round the portal; then sheep come down on parachutes to keep
 * the flock at a bar that rises with the score — `bar` + `perShorn` for each sheep gone into the portal, up to `most` —
 * one at a time, the whole gap made good in about `refill` seconds (so the higher the bar, the quicker they come). With
 * the map at the bar, arrivals wait. The ones round the portal stand in a ring `ring` cells past its edge (from, more).
 * All draft.
 */
export const ARRIVE = { start: 1000, nearPortal: 40, ring: [1.5, 6], bar: 1000, perShorn: 2, most: 3000, refill: 300 } as const

/** The goal (GDD 7): this many sheep into the portal — then the win screen, and the game may go on (draft). */
export const GOAL = { sheep: 1000 } as const

/**
 * A sheep arriving comes down from the sky on a parachute (GDD 6; the author, 20.10.2026: «красивую/интересную/забавную
 * анимацию для её появления»): `fall` seconds swaying down from `height` cells, then `land` seconds bouncing on the grass
 * while the parachute folds. Till it has landed it neither walks nor can be picked up. A soft dark `mark` on the grass
 * shows where it will land, growing as it comes down (radius in cells, how dark).
 */
export const DROP = { fall: 1.9, land: 0.6, height: 6, mark: { from: 0.12, to: 0.35, opacity: 0.28 } } as const

/** The bubble over a sheep being shorn by hand, counting the clicks (render/SheepView.tsx): `up` cells over its feet. */
export const BUBBLE = { up: 0.9 } as const

/**
 * A sheep roams the map (GDD 5; the author, 19.10.2026: «овцы вообще просто бегают по всей территории»): to a spot up
 * to `reach` cells away that it can walk to in a straight line (`tries` spots looked at), with free ground `room` cells
 * round it so it stands clear of buildings; there it grazes `rest` seconds and up to `restMore` more. It walks round
 * buildings and the `blocking` ground and steps over belts without stopping on them; built over, it runs to the
 * nearest free ground (it looks every `look` steps, and as it steps onto the next cell). Driven out of a scarecrow's
 * circle it heads straight out, within `scareSpread` radians of straight (wider each try), to a spot `scarePast` cells
 * past the edge (and up to a cell more); called by a carrot it rests `lureRest` seconds in the crowd.
 */
export const ROAM = {
  reach: 3,
  tries: 8,
  room: 0.3,
  rest: 2,
  restMore: 3,
  look: 8,
  scareSpread: 0.6,
  scarePast: 0.6,
  lureRest: 0.8,
  blocking: ['rock', 'tree', 'water', 'bush'] as readonly TerrainId[],
} as const

export const SHEEP_NAMES = ['Облачко', 'Зефирка', 'Ватрушка', 'Снежок', 'Пломбир', 'Пушок', 'Бяша', 'Кудряш', 'Мята', 'Лапка', 'Тучка', 'Пуговка', 'Хрум', 'Ириска', 'Сметанка', 'Бублик'] as const

// ---------------------------------------------------------------- landscape (GDD 2)

/**
 * The landscape (GDD 2): meadow patches, bushes, trees, rocks and ponds. Nothing is a resource any more (the author,
 * 22.10.2026: сено и вода — декор, ландшафт). A meadow may be built over — the building clears it; the rest may not.
 */
export type TerrainId = 'meadow' | 'bush' | 'tree' | 'rock' | 'water'
/** Terrain that no building may stand on. */
export const BLOCKING: readonly TerrainId[] = ['rock', 'tree', 'water', 'bush']

/**
 * The map, made from its seed (game/land.ts): `hills` hills of `hillSize` cells a side, a third level on `hillTop` of
 * those big enough; `ponds` ponds of `pondSize` cells, the first `firstPond` cells past the bare ground round the portal
 * (from, more); and patches of each landscape — `patches` of them, `patchSize` cells each — with `clear` cells round the
 * portal left bare.
 */
export const MAP = {
  hills: 26,
  hillSize: [3, 7],
  hillTop: 0.6,
  firstPond: [4, 6],
  ponds: 22,
  pondSize: [6, 22],
  patches: { meadow: 70, bush: 34, tree: 60, rock: 40 },
  patchSize: { meadow: [6, 20], bush: [2, 6], tree: [1, 4], rock: [1, 3] },
  clear: 9,
} as const satisfies { patches: Record<Exclude<TerrainId, 'water'>, number>; patchSize: Record<Exclude<TerrainId, 'water'>, readonly [number, number]> } & Record<string, unknown>

// ---------------------------------------------------------------- buildings (GDD 4)

export type BuildingId = 'belt' | 'splitter' | 'merger' | 'carrot' | 'scare' | 'wash' | 'comb' | 'pick' | 'shearer'

/** A station's job (GDD 4.3): one of a sheep's needs, or shearing a ready one. */
export type StationId = NeedId | 'shear'

export interface BuildingDef {
  /** Coins for its recipe — the right to build it, bought once (GDD 8; draft). */
  recipe: number
  /** Coins for each one built (draft). */
  cost: number
  /** A station: the job it does to a sheep, and how long it takes. */
  station?: StationId
  time?: number
  /** It may stand only with water within WATER_REACH (the wash). */
  needsWater?: boolean
  /** The carrot: calls fluffy sheep within CARROT.radius and puts one onto its way out every `time` s. */
  lure?: boolean
  /** The scarecrow: sheep leave its circle (SCARE). */
  scare?: boolean
  /** Placed onto a belt, replacing that belt cell. */
  onBelt?: boolean
  /** Footprint as [length along its output, width across it]: stations, the carrot and the scarecrow 2×2; the rest 1×1. */
  size?: readonly [number, number]
}

/**
 * Every building does exactly one thing (GDD 4.1). First its recipe, then each one for coins; no copy costs more, and
 * none is upgraded: the factory grows by copies. All draft.
 */
export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  belt: { recipe: 10, cost: 1 },
  shearer: { recipe: 30, cost: 20, station: 'shear', time: 3, size: [2, 2] },
  carrot: { recipe: 60, cost: 40, lure: true, time: 3, size: [2, 2] },
  scare: { recipe: 40, cost: 25, scare: true, size: [2, 2] },
  splitter: { recipe: 80, cost: 15, onBelt: true },
  merger: { recipe: 60, cost: 10, onBelt: true },
  wash: { recipe: 150, cost: 60, station: 'wash', time: 3, needsWater: true, size: [2, 2] },
  comb: { recipe: 300, cost: 80, station: 'comb', time: 3, size: [2, 2] },
  pick: { recipe: 500, cost: 100, station: 'pick', time: 3, size: [2, 2] },
}

/** A building's footprint in cells along x and y when it faces `dir`: its length runs along dir, its width across. */
export function dimsOf(type: BuildingId, dir: Dir): [number, number] {
  const [l, w] = BUILDINGS[type].size ?? [1, 1]
  return dir % 2 === 0 ? [l, w] : [w, l]
}

/**
 * The carrot (GDD 4.5): fluffy sheep within `radius` cells of its middle walk to it, crowd round within `crowd`, and it
 * puts the nearest of them onto its way out every BUILDINGS.carrot.time seconds, if one stands within `take` cells (the
 * crowd and a little more); in the crowd a sheep stands at least `near` cells from the middle (draft).
 */
export const CARROT = { radius: 3, crowd: 1.8, near: 1.1, take: 2.2 } as const
/** The scarecrow (GDD 4.6): sheep within `radius` cells of its middle leave the circle and don't come in (draft). */
export const SCARE = { radius: 3 } as const
/** A wrong sheep's sign stays up while it pushed at the way in within the last `hold` seconds (GDD 4.3). */
export const STOP = { hold: 0.25 } as const
/** The wash stands only with water whose cell's middle is within this many cells of its own middle (GDD 4.3). */
export const WATER_REACH = 3

/**
 * The portal (GDD 7): one building of `size`×`size` cells with its top-left cell at (x, y), in the middle of the map.
 * Its ways in are fixed, like the tower's in Tower Factory: two on each side, `ports` cells along it from its corner. It
 * takes only shorn sheep.
 */
export const PORTAL = { x: 52, y: 52, size: 8, ports: [2, 5] } as const

/** Hotbar order; only bought recipes are shown. */
export const TOOL_ORDER: readonly BuildingId[] = ['belt', 'shearer', 'carrot', 'scare', 'splitter', 'merger', 'wash', 'comb', 'pick']
/**
 * A splitter's rules (GDD 4.4), by what a sheep needs now: any, one needing the wash, the comb or the picker, a ready
 * one (fluffy, nothing to do but shearing), a shorn one, or none.
 */
export const SPLIT_RULES = ['any', 'wash', 'comb', 'pick', 'ready', 'shorn', 'off'] as const

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
  /** Out as far as the whole map fits on the screen. */
  maxDistance: 236,
  /**
   * Further out than this, cells, the flock is drawn plain (render/models.ts `plain`): a sheep is some forty pixels tall
   * there, and a full island's flock in view drawn fine cost more than the whole frame. Back in it turns fine again a
   * little nearer (the default distance is nearer still), so it never flickers on the line.
   */
  plainFlock: [56, 50],
  /** A sheep and its short shadow fit in a ball this big round its middle, cells: one wholly out of the view is not drawn. */
  flockReach: 1.2,
  /** The haze, cells from the camera: it starts past the island's far edge seen from furthest out, and hides all by the far plane. */
  fog: [300, 560],
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
 * author, «не должно быть проплешин»), and how far it shortens by what stands there. The whole map's lawn is some
 * 450 000 tufts, so it is laid in square pieces of `chunk` cells, and a piece out of the view is not drawn; from further
 * than `far` cells a tuft is a pixel and the ground under it the same green, so the lawn is not drawn at all.
 */
export const GRASS = { leaves: 8, height: 0.14, width: 0.12, grid: 6, inset: 0.5, chunk: 16, far: 90 } as const

/**
 * The sun's shadow: its frustum reaches `half` cells each way from the middle of the field, enough for the whole island
 * as the sun sees it; its map, texels a side — 3072 over 124 cells is ~0.04 of a cell, soft and cheap.
 */
export const SHADOW = { map: 3072, half: 62 } as const
/** The soft dark halo painted into the ground round whatever stands on it, in place of screen-space AO. */
export const CONTACT = { building: 0.32, belt: 0.16, blur: 6 } as const

/** Each building's own colour: its roof in the field and its stripe on the build tile. */
export const ROOF: Readonly<Record<BuildingId, string>> = {
  belt: '#5b6577',
  shearer: '#f2668b',
  carrot: '#f08a2c',
  scare: '#b98a4e',
  wash: '#5aa9e6',
  comb: '#de8a4e',
  pick: '#6fb64a',
  splitter: '#4a5568',
  merger: '#4a5568',
}

/** Colours of the 3D scene; the HUD has its own CSS variables. */
export const LOOK = {
  /** The plain sky blue the island floats on (no sea: the author), and the haze. */
  sky: '#bfe6f3',
  skyLight: '#eaf6ff',
  groundBounce: '#a7c98a',
  sun: '#fff3dc',
  /** All the land one fresh spring green, with faint lighter and deeper patches. */
  // the ground under the lawn is the leaves' own foot colour, so the gaps between tufts don't show
  ground: '#8cc131',
  groundLight: '#97cb3b',
  groundDark: '#82b52b',
  /** Trodden earth round buildings. */
  trodden: '#d9c49a',
  /** The dust a building raises as it comes down onto its place. */
  dust: '#efe2c4',
  /**
   * Placing, after Tower Factory (the author's screenshot of a belt piece in hand): what is held stands on a see-through
   * sky-blue block, its side towards the light paler, outlined in cream; a pink arrow shows the way in, a periwinkle one
   * the way out. Where it can't stand the block goes red and the model reddens a little. Lemon for the edge of a
   * carrot's, a scarecrow's or a wash's circle and the dashes to the sheep or the water; the circle tints what is inside
   * it a cool blue.
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
  meadowBase: '#7db349',
  meadowEar: '#f4c84a',
  /** The ground under a meadow: tilled soil with furrows. */
  meadowGround: '#c99d66',
  meadowFurrow: '#b0844f',
  pine: '#4fbf4a',
  pineDark: '#23843f',
  leafDark: '#3b9a3e',
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
  lily: '#77d55a',
  lilyFlower: '#ffb9ef',
  bush: '#58b44a',
  berry: '#8e4fd0',
  rock: '#b8c0c9',
  fence: '#b9773f',
  fenceRail: '#d39a5c',
  /** Wooden conveyors, as in Tower Factory: a dark bed, light planks, side walls. */
  beltBed: '#7a4a2c',
  beltSlat: '#c48a50',
  beltWall: '#93603a',
  beltWallTop: '#b07a46',
  chevron: '#8a5530',
  machine: '#f7f9fc',
  machineEdge: '#2b3547',
  accent: '#dd4379',
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
  /** An arriving sheep's parachute (DROP): its red gores between white ones, and its cords. */
  chute: '#e8596f',
  chuteCord: '#f4ede4',
  /**
   * The portal (render/models.ts `portalModel`): the plaza's plinth and its pastel tiles, the coral rails of its ways in
   * and their cream chevrons, the stone of the dais and the ring, its runes, the swirl's colours inside the ring.
   */
  plazaStone: '#d9cfbf',
  plazaTiles: ['#ecdfc5', '#e2d2b2', '#f1e8d4'] as const,
  plazaTrim: ['#f2877a', '#fff5e6'] as const,
  portalStone: '#d8d0e2',
  portalRune: '#b48cff',
  portalSwirl: ['#b48cff', '#ff9fd2', '#8fe6ff'] as const,
  /** The spot on the grass where an arriving sheep will land. */
  dropMark: '#2f5214',
  /** Straw: the scarecrow's head and hat. */
  hay: '#e2c15e',
  /**
   * What a sheep still needs shows on its fleece (render/sheepLook.ts): a tangled one's matted cream and its clumps, the
   * mud splashed on a dirty one, the brown burrs stuck all over one with burrs.
   */
  feltFleece: '#efe6d2',
  feltPatch: '#f4ecdc',
  dirtFleece: '#b8946a',
  burrs: '#8a6a34',
  /** The carrot statue's carrot and its leaves; the scarecrow's shirt and trousers (render/machineModels.ts). */
  carrot: '#f08a2c',
  carrotLeaf: '#5cb84a',
  scareShirt: '#d9574f',
  scarePants: '#5b7fc4',
} as const

// ---------------------------------------------------------------- recipes and cards (GDD 8)

/**
 * «Новое» cards (GDD 8): one per recipe bought (its building), one per kind of sheep as it starts arriving, the first
 * steps' card on shearing by hand, and the win.
 */
export type CardId = BuildingId | Exclude<KindId, 'plain'> | 'shear' | 'win'

/** How the game starts (GDD 6): no coins and only the hand; the flock already roams (ARRIVE). */
export const START = { coins: 0 } as const
