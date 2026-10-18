import { BUILDINGS, GRID, PEN, PLOTS, dimsOf, type BuildingId, type Dir, type RecipeId } from './balance'
import { get, plotOnIsland, plotPrice } from './grid'
import { buyPlot, place, remove, setRecipe } from './actions/build'
import { Field, Flock, GameState, key, res, type SplitRule, type World } from './world'

/**
 * The farm of chapter 1, laid out cell by cell (docs/05-REWORK.md): what the balance bot builds, step by step as levels
 * open, the island grows and coins allow, and what the main menu shows built whole. Nine pens on five loops of stations:
 *
 * - A, the first pen in the middle: white wool to the post, a carder for the shop, a spinner for the atelier; a
 *   second pen on the same loop, at its corner past the shearer;
 * - E, north-east: a dyer before its shearer, so it shears pink as far as the dye goes; white yarn and pink yarn meet
 *   in a workshop making sweaters (the fair), pink yarn goes on to the school;
 * - W, north-west: the same with a felter, the workshop making felt boots (the cobbler), and a second pen like A's;
 *   once the far row rises, a third pen there, and a second one for E: the loop comes back by the far row;
 * - X and Y, on the land the island grows in the east: a pen at the top, its loop running down and back, its goods to
 *   the docks that came with the land — X wool to the post and roving to the shop, Y felt to the cobbler and yarn to
 *   the atelier.
 *
 * Every loop turns left round its pen, so the good a station takes comes in from its right — from outside the loop —
 * and the shearer's wool leaves the same way (grid.ts). A pen turns a loop left too, so a second pen stands at a
 * corner: each sheep crosses the other pen on its way round and stays only in its own (systems/sheep.ts). Where a line
 * has nowhere more to go it ends at a dock, which takes anything; a dead end is emptied by the hand. A job buys the
 * plots it stands on first (`jobPlots`), and waits while any of them is still under the sky.
 */

export type Step =
  | { b: BuildingId; x: number; y: number; d: Dir; recipe?: RecipeId; rules?: readonly [SplitRule, SplitRule, SplitRule] }
  | { pen: readonly [number, number]; d: Dir }
  | { remove: readonly [number, number] }

export interface Job {
  id: string
  /** What must be open for it (buildings, recipes). */
  needs: readonly (BuildingId | 'valenki')[]
  steps: readonly Step[]
  /** Built in one go: half of it would cut a working loop (a second pen at its corner). */
  whole?: boolean
}

const belt = (d: Dir, ...cells: (readonly [number, number])[]): Step[] => cells.map(([x, y]) => ({ b: 'belt' as const, x, y, d }))
const col = (x: number, y0: number, y1: number): [number, number][] => Array.from({ length: Math.abs(y1 - y0) + 1 }, (_, i) => [x, y0 + i * Math.sign(y1 - y0 || 1)])
const row = (y: number, x0: number, x1: number): [number, number][] => Array.from({ length: Math.abs(x1 - x0) + 1 }, (_, i) => [x0 + i * Math.sign(x1 - x0 || 1), y])

/** A splitter's rules as [left, forward, right] of the way it faces. */
const R = (l: SplitRule, f: SplitRule, r: SplitRule) => [l, f, r] as const

/** A pen's loop facing east: the stations' cells, the turn north beside the last, back west along the row above. */
function loop(px: number, py: number): Step[] {
  // the pen (px..px+2, py..py+2) gives its sheep out at (px+3, py+1) and takes them in at (px+1, py-1)
  const end = px + 9
  return [...belt(3, [end, py + 1], [end, py]), ...belt(2, ...row(py - 1, end, px + 2)), ...belt(1, [px + 1, py - 1])]
}

/**
 * A pen facing south with its loop running down and back up its east side (X and Y): the stations stand below the pen,
 * their goods' side to the west, and the shearer's wool goes west and down to the dock row.
 */
function downLoop(px: number, py: number): Step[] {
  // the pen (px..px+2, py..py+2) gives its sheep out at (px+1, py+3) and takes them in at (px+3, py+1)
  return [
    { pen: [px, py], d: 1 },
    ...belt(1, [px + 1, py + 3], [px + 1, py + 4]),
    { b: 'shearer', x: px + 1, y: py + 5, d: 1 },
    ...belt(1, [px + 1, py + 7], [px + 1, py + 8]),
    ...belt(0, [px + 1, py + 9], [px + 2, py + 9]),
    ...belt(3, ...col(px + 3, py + 9, py + 2)),
    ...belt(2, [px + 3, py + 1]),
    ...belt(2, [px, py + 5]),
    ...belt(1, ...col(px - 1, py + 5, 19)),
  ]
}
/** A down loop's mower beside its feeder's way in, and the feeder in place of two belts. */
const downMower = (px: number, py: number): Step[] => [{ b: 'mower', x: px, y: py + 8, d: 3 }]
const downFeeder = (px: number, py: number): Step[] => [{ remove: [px + 1, py + 7] }, { remove: [px + 1, py + 8] }, { b: 'feeder', x: px + 1, y: py + 7, d: 1 }, ...belt(0, [px, py + 7])]
/** Off a down loop's wool line, to the west: a splitter, two belts, a machine facing south and its line to the dock row. */
const downBranch = (px: number, py: number, m: BuildingId): Step[] => [
  { b: 'splitter', x: px - 1, y: py + 8, d: 1, rules: R('off', 'any', 'any') },
  ...belt(2, [px - 2, py + 8]),
  ...belt(1, [px - 3, py + 8]),
  { b: m, x: px - 3, y: py + 9, d: 1 },
  ...belt(1, ...col(px - 3, py + 11, 19)),
]

export const PLAN: readonly Job[] = [
  // ---------------------------------------------------------------- A, the first pen (11,11)
  { id: 'A.shearer', needs: ['shearer'], steps: [{ b: 'shearer', x: 14, y: 11, d: 0 }] },
  {
    id: 'A.loop',
    needs: ['belt'],
    steps: [...belt(0, [16, 12], [17, 12]), ...belt(3, [18, 12], [18, 11]), ...belt(2, ...row(10, 18, 13)), ...belt(1, [12, 10]), ...belt(1, ...col(14, 13, 19))],
  },
  // A's second pen on the same loop, its bottom-right corner: the line goes on east into it, out north and back west
  {
    id: 'A.pen2',
    needs: ['pen', 'sheep'],
    whole: true,
    steps: [{ remove: [18, 11] }, ...belt(0, [18, 12]), { pen: [19, 11], d: 3 }, ...belt(2, [20, 10], [19, 10])],
  },
  { id: 'A.carder', needs: ['carder'], steps: [...belt(1, [15, 14]), { b: 'carder', x: 15, y: 15, d: 1 }, ...belt(1, ...col(15, 17, 19))] },
  { id: 'A.mower', needs: ['mower'], steps: [{ b: 'mower', x: 17, y: 13, d: 2 }] },
  { id: 'A.feeder', needs: ['feeder'], steps: [{ remove: [16, 12] }, { remove: [17, 12] }, { b: 'feeder', x: 16, y: 11, d: 0 }, ...belt(3, [16, 13])] },
  // ---------------------------------------------------------------- E, north-east (21,6): white first, the dyer later
  {
    id: 'E.module',
    needs: ['pen', 'belt', 'shearer'],
    steps: [{ pen: [21, 6], d: 0 }, ...belt(0, [24, 7], [25, 7]), { b: 'shearer', x: 26, y: 6, d: 0 }, ...belt(0, [28, 7], [29, 7]), ...belt(3, [30, 7], [30, 6]), ...belt(2, ...row(5, 30, 23)), ...belt(1, [22, 5])],
  },
  { id: 'E.mower', needs: ['mower'], steps: [{ b: 'mower', x: 29, y: 8, d: 2 }] },
  { id: 'E.feeder', needs: ['feeder'], steps: [{ remove: [28, 7] }, { remove: [29, 7] }, { b: 'feeder', x: 28, y: 6, d: 0 }, ...belt(3, [28, 8])] },
  // ---------------------------------------------------------------- A: roving, then yarn
  { id: 'A.split', needs: ['splitter'], steps: [{ b: 'splitter', x: 14, y: 14, d: 1, rules: R('any', 'any', 'off') }] },
  // ---------------------------------------------------------------- W, north-west (0,6)
  {
    id: 'W.module',
    needs: ['pen', 'belt', 'shearer'],
    steps: [{ pen: [0, 6], d: 0 }, ...belt(0, [3, 7], [4, 7]), { b: 'shearer', x: 5, y: 6, d: 0 }, ...belt(0, [7, 7], [8, 7]), ...loop(0, 6)],
  },
  {
    id: 'W.pen2',
    needs: ['pen', 'sheep'],
    whole: true,
    steps: [{ remove: [9, 6] }, ...belt(0, [9, 7]), { pen: [10, 6], d: 3 }, ...belt(2, [11, 5], [10, 5])],
  },
  { id: 'W.mower', needs: ['mower'], steps: [{ b: 'mower', x: 8, y: 8, d: 2 }] },
  { id: 'W.feeder', needs: ['feeder'], steps: [{ remove: [7, 7] }, { remove: [8, 7] }, { b: 'feeder', x: 7, y: 6, d: 0 }, ...belt(3, [7, 8])] },
  // ---------------------------------------------------------------- X, the first land in the east (35,5)
  { id: 'X.module', needs: ['pen', 'belt', 'shearer'], steps: downLoop(35, 5) },
  { id: 'X.mower', needs: ['mower'], steps: downMower(35, 5) },
  { id: 'X.feeder', needs: ['feeder'], steps: downFeeder(35, 5) },
  { id: 'X.carder', needs: ['carder', 'splitter'], steps: downBranch(35, 5, 'carder') },
  {
    id: 'A.spinner',
    needs: ['spinner', 'splitter'],
    steps: [{ b: 'splitter', x: 15, y: 17, d: 1, rules: R('any', 'any', 'off') }, ...belt(1, [16, 17]), ...belt(0, [16, 18]), { b: 'spinner', x: 17, y: 17, d: 0 }, ...belt(1, [19, 18], [19, 19])],
  },
  // ---------------------------------------------------------------- E: white yarn (by hand to the atelier, until the workshop)
  {
    id: 'E.white',
    needs: ['carder', 'spinner', 'splitter'],
    steps: [
      ...belt(1, [26, 8]),
      { b: 'splitter', x: 26, y: 9, d: 1, rules: R('pwool', 'off', 'wool') },
      ...belt(1, [25, 9]),
      { b: 'carder', x: 25, y: 10, d: 1 },
      { b: 'spinner', x: 25, y: 12, d: 1 },
      { b: 'splitter', x: 25, y: 14, d: 1, rules: R('any', 'any', 'off') },
      ...belt(1, [26, 14]),
      ...belt(1, ...col(25, 15, 19)),
    ],
  },
  // ---------------------------------------------------------------- W: felt for the cobbler
  {
    id: 'W.felter',
    needs: ['felter', 'splitter'],
    steps: [...belt(1, [5, 8]), { b: 'splitter', x: 5, y: 9, d: 1, rules: R('any', 'off', 'wool') }, ...belt(1, [4, 9]), { b: 'felter', x: 4, y: 10, d: 1 }, ...belt(1, ...col(4, 12, 19))],
  },
  // ---------------------------------------------------------------- Y, the second land in the east (43,5)
  { id: 'Y.module', needs: ['pen', 'belt', 'shearer'], steps: downLoop(43, 5) },
  { id: 'Y.mower', needs: ['mower'], steps: downMower(43, 5) },
  { id: 'Y.feeder', needs: ['feeder'], steps: downFeeder(43, 5) },
  { id: 'Y.felter', needs: ['felter', 'splitter'], steps: downBranch(43, 5, 'felter') },
  {
    id: 'Y.yarn',
    needs: ['carder', 'spinner'],
    steps: [...([15, 16, 17, 18] as const).map((y) => ({ remove: [42, y] as const })), { b: 'carder', x: 42, y: 15, d: 1 }, { b: 'spinner', x: 42, y: 17, d: 1 }],
  },
  // ---------------------------------------------------------------- the dyers: half the dye to the dyer, half to a dead end for the hand
  {
    id: 'E.dyer',
    needs: ['dyer', 'berry', 'splitter'],
    steps: [{ remove: [24, 7] }, { remove: [25, 7] }, { b: 'dyer', x: 24, y: 6, d: 0 }, { b: 'berry', x: 24, y: 9, d: 3 }, { b: 'splitter', x: 24, y: 8, d: 3, rules: R('off', 'any', 'any') }, ...belt(3, [25, 8])],
  },
  {
    id: 'E.pink',
    needs: ['carder', 'spinner', 'splitter'],
    steps: [...belt(1, [27, 9]), { b: 'carder', x: 27, y: 10, d: 1 }, { b: 'spinner', x: 27, y: 12, d: 1 }, { b: 'splitter', x: 27, y: 14, d: 1, rules: R('any', 'any', 'off') }, ...belt(1, ...col(28, 14, 19))],
  },
  {
    id: 'W.dyer',
    needs: ['dyer', 'berry', 'splitter'],
    steps: [{ remove: [3, 7] }, { remove: [4, 7] }, { b: 'dyer', x: 3, y: 6, d: 0 }, { b: 'berry', x: 3, y: 9, d: 3 }, { b: 'splitter', x: 3, y: 8, d: 3, rules: R('off', 'any', 'any') }, ...belt(3, [4, 8])],
  },
  {
    id: 'W.pink',
    needs: ['carder', 'spinner', 'splitter'],
    steps: [
      ...belt(1, [6, 9]),
      { b: 'carder', x: 6, y: 10, d: 1 },
      { b: 'spinner', x: 6, y: 12, d: 1 },
      { b: 'splitter', x: 6, y: 14, d: 1, rules: R('any', 'any', 'off') },
      ...belt(1, ...col(7, 14, 19)),
    ],
  },
  // ---------------------------------------------------------------- the workshops
  { id: 'E.sweater', needs: ['workshop'], steps: [{ b: 'workshop', x: 26, y: 15, d: 1, recipe: 'sweater' }, ...belt(1, ...col(26, 17, 19))] },
  {
    id: 'W.valenki',
    needs: ['workshop', 'valenki'],
    steps: [{ b: 'splitter', x: 4, y: 14, d: 1, rules: R('any', 'any', 'off') }, ...belt(1, [5, 14]), { b: 'workshop', x: 5, y: 15, d: 1, recipe: 'valenki' }, ...belt(1, ...col(5, 17, 19))],
  },
  // ---------------------------------------------------------------- the far row, once it rises: a pen more on W's loop and on E's
  // the loop comes back by the far row instead of row 5: up through the new pen at the corner, west, and down into the first
  {
    id: 'W.pen3',
    needs: ['pen', 'sheep'],
    steps: [...belt(2, ...row(3, 9, 2)), ...belt(1, [1, 3], [1, 4]), { pen: [10, 2], d: 2 }, ...belt(3, [11, 5]), ...row(5, 10, 2).map(([x, y]) => ({ remove: [x, y] as const }))],
  },
  {
    id: 'E.pen2',
    needs: ['pen', 'sheep'],
    steps: [...belt(2, ...row(3, 28, 23)), ...belt(1, [22, 3], [22, 4]), { pen: [29, 2], d: 2 }, ...belt(3, [30, 5]), ...row(5, 29, 23).map(([x, y]) => ({ remove: [x, y] as const }))],
  },
]

/** The splitter rules that change as the farm grows: W's first splitter takes pink to its carder once there is one. */
export const RULES_LATER: Readonly<Record<string, { at: readonly [number, number]; rules: readonly [SplitRule, SplitRule, SplitRule] }>> = {
  'W.pink': { at: [5, 9], rules: R('pwool', 'off', 'wool') },
}

/** What a step costs now (a belt it stands on gives its coins back). */
export function stepCost(w: World, s: Step) {
  if ('pen' in s) return res(w, Flock).pastures.some((p) => p.x === s.pen[0] && p.y === s.pen[1]) ? 0 : PEN.cost
  if ('remove' in s) return 0
  const ex = get(w, s.x, s.y)
  if (ex && ex.type === s.b) return 0
  return BUILDINGS[s.b].cost - (ex?.type === 'belt' ? ex.paid : 0)
}
/** The plots a step stands on. */
function stepPlots(s: Step): [number, number][] {
  if ('remove' in s) return []
  const [x, y, w, h] = 'pen' in s ? [s.pen[0], s.pen[1], PEN.size, PEN.size] : [s.x, s.y, ...dimsOf(s.b, s.d)]
  const out: [number, number][] = []
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push([Math.floor((x + dx) / GRID.plotW), Math.floor((y + dy) / GRID.plotH)])
  return out
}
/** Every plot a job stands on, once each. */
export function jobPlots(j: Job): [number, number][] {
  const seen = new Map<string, [number, number]>()
  for (const s of j.steps) for (const p of stepPlots(s)) seen.set(key(...p), p)
  return [...seen.values()]
}
/** The plots of a job the player does not own yet. */
const toBuy = (w: World, j: Job) => jobPlots(j).filter(([px, py]) => !res(w, Field).plots.has(key(px, py)))
/** Can the job be built at all now: every plot it needs is on the island and owned or for sale. */
export function landReady(w: World, j: Job) {
  return toBuy(w, j).every(([px, py]) => plotOnIsland(w, px, py) && plotPrice(w, px, py) > 0)
}
/** What a job costs now: its steps and the plots it needs, each plot dearer than the one before (GDD 6.2). */
export function jobCost(w: World, j: Job) {
  let c = j.steps.reduce((a, s) => a + stepCost(w, s), 0)
  const buy = toBuy(w, j)
  const k = (n: number) => 1 + PLOTS.step * n
  const bought = res(w, GameState).plotsBought
  for (const [px, py] of buy) c += Math.round((plotPrice(w, px, py) * k(bought + buy.length)) / k(bought) / 5) * 5
  return c
}
/** Buy the plots a job needs, each next to land already owned. */
export function buyJobPlots(w: World, j: Job) {
  let left = toBuy(w, j)
  while (left.length) {
    const next = left.filter(([px, py]) => !buyPlot(w, px, py))
    if (next.length === left.length) return false
    left = next
  }
  return true
}
/**
 * A job in the pieces a player would build it by, one purchase each: a belt taken up goes with what is built in its
 * place, so no step leaves a loop cut; a job built whole is one piece.
 */
export function pieces(j: Job): Step[][] {
  if (j.whole) return [[...j.steps]]
  const out: Step[][] = []
  let cur: Step[] = []
  for (const s of j.steps) {
    cur.push(s)
    if (!('remove' in s)) {
      out.push(cur)
      cur = []
    }
  }
  if (cur.length) out.push(cur)
  return out
}
/** What a piece costs now. */
export const pieceCost = (w: World, p: readonly Step[]) => p.reduce((a, s) => a + stepCost(w, s), 0)
/** The plots of a job the player does not own yet, the cheapest first. */
export const plotsToBuy = (w: World, j: Job) => toBuy(w, j).sort((a, b) => plotPrice(w, ...a) - plotPrice(w, ...b))

/** Do one step of the plan. A belt standing where a machine goes is taken up first. True when it stands. */
export function applyStep(w: World, s: Step, free = false) {
  if ('remove' in s) {
    const b = get(w, s.remove[0], s.remove[1])
    if (b && b.type === 'belt') remove(w, s.remove[0], s.remove[1])
    return true
  }
  if ('pen' in s) {
    const [x, y] = s.pen
    if (res(w, Flock).pastures.some((p) => p.x === x && p.y === y)) return true
    return place(w, 'pen', x, y, s.d, free)
  }
  const ex = get(w, s.x, s.y)
  if (ex && ex.type === s.b && ex.x === s.x && ex.y === s.y) {
    if (ex.dir !== s.d && s.b === 'belt') ex.dir = s.d
  } else {
    if (ex && ex.type === 'belt' && !BUILDINGS[s.b].onBelt && s.b !== 'belt') remove(w, s.x, s.y)
    if (!place(w, s.b, s.x, s.y, s.d, free)) return false
  }
  const b = get(w, s.x, s.y)!
  if (s.recipe) setRecipe(w, b, s.recipe)
  if (s.rules) b.rules = { l: s.rules[0], f: s.rules[1], r: s.rules[2] }
  return true
}
/** The rules that change once a job stands. */
export function finishJob(w: World, j: Job) {
  const later = RULES_LATER[j.id]
  const b = later && get(w, later.at[0], later.at[1])
  if (later && b) b.rules = { l: later.rules[0], f: later.rules[1], r: later.rules[2] }
}
/** Do a whole job, and the rules that change once it stands. */
export function applyJob(w: World, j: Job, free = false) {
  const ok = j.steps.every((s) => applyStep(w, s, free))
  if (ok) finishJob(w, j)
  return ok
}
