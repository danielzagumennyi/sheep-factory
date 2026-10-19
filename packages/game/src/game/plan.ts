import { BUILDINGS, GRID, PEN, PLOTS, START, dimsOf, type BuildingId, type Dir } from './balance'
import { get, plotOnIsland, plotPrice } from './grid'
import { buyPlot, place, remove } from './actions/build'
import { Field, Flock, GameState, key, res, type SplitRule, type World } from './world'

/**
 * The farm of chapter 1, laid out cell by cell: what the balance bot builds, step by step as levels open, the island
 * grows and coins allow, and what the main menu shows built whole. Five loops, each giving one good — everything is
 * made on the sheep (the author's salon, 19.10.2026), so a loop's stations say what its shearer gives:
 *
 * - A, the first pen in the middle: wool for the post, two pens; later a dye station, coloured wool while the school
 *   asks for it;
 * - E, north-east: a comb before its shearer — thread for the shop;
 * - W, north-west: comb and curl — yarn for the atelier, two pens; later a dye station for coloured yarn;
 * - X, on the land the island grows in the east, by its pond: the bath — felt for the cobbler; later coloured felt;
 * - Y, past it, from the far row down: comb, curl and knitting — sweaters, and coloured ones for the fair.
 *
 * A, E and W lie east from their pens and turn left round them; X and Y run down from a pen facing south and come back
 * up beside. Either way the good a station takes comes in from its right — from outside the loop — and so does what the
 * shearer gives leave (grid.ts). A second pen stands at a loop's corner: each sheep crosses the other pen on its way
 * round and stays only in its own (systems/sheep.ts). A dye station's dye comes through a splitter the bot closes while
 * no client asks for the coloured good, so the sheep pass it white. Every shearer's line runs down to the market's row.
 * A job buys the plots it stands on first (`jobPlots`), and waits while any of them is still under the sky.
 */

export type Step = { b: BuildingId; x: number; y: number; d: Dir; rules?: readonly [SplitRule, SplitRule, SplitRule] } | { pen: readonly [number, number]; d: Dir } | { remove: readonly [number, number] }

export interface Job {
  id: string
  /** The buildings that must be open for it. */
  needs: readonly BuildingId[]
  /** The jobs that must stand before it: a loop before what goes on it. */
  after?: readonly string[]
  steps: readonly Step[]
  /** Built in one go: half of it would cut a working loop (a second pen at its corner). */
  whole?: boolean
}

const belt = (d: Dir, ...cells: (readonly [number, number])[]): Step[] => cells.map(([x, y]) => ({ b: 'belt' as const, x, y, d }))
const col = (x: number, y0: number, y1: number): [number, number][] => Array.from({ length: Math.abs(y1 - y0) + 1 }, (_, i) => [x, y0 + i * Math.sign(y1 - y0 || 1)])
const row = (y: number, x0: number, x1: number): [number, number][] => Array.from({ length: Math.abs(x1 - x0) + 1 }, (_, i) => [x0 + i * Math.sign(x1 - x0 || 1), y])
const off = (...cells: (readonly [number, number])[]): Step[] => cells.map((c) => ({ remove: c }))

/** A splitter's rules as [left, forward, right] of the way it faces. */
const R = (l: SplitRule, f: SplitRule, r: SplitRule) => [l, f, r] as const
/** The splitter a dye station's dye comes through: straight on into it, closed to the sides. */
const DYE_GATE = R('off', 'any', 'off')

/** Where each dye station's dye splitter stands, by the good its loop gives coloured (the bot opens it while that is asked). */
export const DYE_GATES: readonly { at: readonly [number, number]; good: 'cwool' | 'cyarn' | 'cfelt' | 'csweater' }[] = [
  { at: [14, 13], good: 'cwool' },
  { at: [7, 8], good: 'cyarn' },
  { at: [35, 10], good: 'cfelt' },
  { at: [43, 12], good: 'csweater' },
]

export const PLAN: readonly Job[] = [
  // ---------------------------------------------------------------- A, the first pen (11,11), where the sheep roam at the start: wool
  { id: 'A.pen', needs: ['pen'], steps: [{ pen: [START.pen.x, START.pen.y], d: START.pen.dir }] },
  { id: 'A.shearer', needs: ['shearer'], after: ['A.pen'], steps: [{ b: 'shearer', x: 16, y: 11, d: 0 }] },
  {
    id: 'A.loop',
    needs: ['belt'],
    after: ['A.shearer'],
    // the dye station's place and the feeder's on the way, round north and back west over the pen, the wool down to the market
    steps: [...belt(0, [14, 12], [15, 12], [18, 12], [19, 12]), ...belt(3, [20, 12], [20, 11]), ...belt(2, ...row(10, 20, 13)), ...belt(1, [12, 10]), ...belt(1, ...col(16, 13, 19))],
  },
  // A's second pen on the same loop, its corner: the line goes on east into it, out north and back west
  { id: 'A.pen2', needs: ['pen', 'sheep'], after: ['A.loop'], whole: true, steps: [...off([20, 11]), ...belt(0, [20, 12]), { pen: [21, 11], d: 3 }, ...belt(2, [22, 10], [21, 10])] },
  // hay: a mower beside the feeder's way in, then the feeder
  { id: 'A.mower', needs: ['mower'], after: ['A.loop'], steps: [{ b: 'mower', x: 19, y: 13, d: 2 }] },
  { id: 'A.feeder', needs: ['feeder'], after: ['A.mower'], steps: [...off([18, 12], [19, 12]), { b: 'feeder', x: 18, y: 11, d: 0 }, ...belt(3, [18, 13])] },
  // ---------------------------------------------------------------- E, north-east (21,6): wool, then thread; its line to the market later
  {
    id: 'E.module',
    needs: ['pen', 'belt', 'shearer'],
    steps: [{ pen: [21, 6], d: 0 }, ...belt(0, [24, 7], [25, 7]), { b: 'shearer', x: 26, y: 6, d: 0 }, ...belt(0, [28, 7], [29, 7]), ...belt(3, [30, 7], [30, 6]), ...belt(2, ...row(5, 30, 23)), ...belt(1, [22, 5])],
  },
  { id: 'E.comb', needs: ['comb'], after: ['E.module'], steps: [...off([24, 7], [25, 7]), { b: 'comb', x: 24, y: 6, d: 0 }] },
  // ---------------------------------------------------------------- hay for E
  { id: 'E.mower', needs: ['mower'], after: ['E.module'], steps: [{ b: 'mower', x: 29, y: 8, d: 2 }] },
  { id: 'E.feeder', needs: ['feeder'], after: ['E.mower'], steps: [...off([28, 7], [29, 7]), { b: 'feeder', x: 28, y: 6, d: 0 }, ...belt(3, [28, 8])] },
  // ---------------------------------------------------------------- W, north-west (0,6): wool, then yarn
  {
    id: 'W.module',
    needs: ['pen', 'belt', 'shearer'],
    // three places for stations before the shearer: comb, curl, dye
    steps: [
      { pen: [0, 6], d: 0 },
      ...belt(0, ...row(7, 3, 8)),
      { b: 'shearer', x: 9, y: 6, d: 0 },
      ...belt(0, [11, 7], [12, 7]),
      ...belt(3, [13, 7], [13, 6]),
      ...belt(2, ...row(5, 13, 2)),
      ...belt(1, [1, 5]),
      ...belt(1, ...col(9, 8, 19)),
    ],
  },
  { id: 'E.line', needs: ['belt'], after: ['E.module'], steps: belt(1, ...col(26, 8, 19)) },
  { id: 'W.mower', needs: ['mower'], after: ['W.module'], steps: [{ b: 'mower', x: 12, y: 8, d: 2 }] },
  { id: 'W.feeder', needs: ['feeder'], after: ['W.mower'], steps: [...off([11, 7], [12, 7]), { b: 'feeder', x: 11, y: 6, d: 0 }, ...belt(3, [11, 8])] },
  { id: 'W.pen2', needs: ['pen', 'sheep'], after: ['W.module'], whole: true, steps: [...off([13, 6]), ...belt(0, [13, 7]), { pen: [14, 6], d: 3 }, ...belt(2, [15, 5], [14, 5])] },
  { id: 'W.yarn', needs: ['comb', 'curl'], after: ['W.module'], steps: [...off([3, 7], [4, 7], [5, 7], [6, 7]), { b: 'comb', x: 3, y: 6, d: 0 }, { b: 'curl', x: 5, y: 6, d: 0 }] },
  // ---------------------------------------------------------------- X, the first land in the east (35,5), by its pond: felt
  {
    id: 'X.module',
    needs: ['pen', 'belt', 'shearer', 'bath'],
    // down from the pen: the bath, the dye station's place, the shearer; round east and back up; the felt west and down
    steps: [
      { pen: [35, 5], d: 1 },
      { b: 'bath', x: 36, y: 8, d: 1 },
      ...belt(1, [36, 10], [36, 11]),
      { b: 'shearer', x: 36, y: 12, d: 1 },
      ...belt(1, [36, 14], [36, 15]),
      ...belt(0, [36, 16], [37, 16]),
      ...belt(3, ...col(38, 16, 7)),
      ...belt(2, [38, 6]),
      ...belt(1, ...col(35, 12, 19)),
    ],
  },
  { id: 'X.mower', needs: ['mower'], after: ['X.module'], steps: [{ b: 'mower', x: 39, y: 16, d: 3 }] },
  { id: 'X.feeder', needs: ['feeder'], after: ['X.mower'], steps: [...off([38, 14], [38, 15]), { b: 'feeder', x: 37, y: 14, d: 3 }, ...belt(2, [39, 15])] },
  // ---------------------------------------------------------------- the dye stations: their berry pickers' dye through a gate the bot opens
  { id: 'A.dyer', needs: ['dyer', 'berry', 'splitter'], after: ['A.loop'], steps: [...off([14, 12], [15, 12]), { b: 'dyer', x: 14, y: 11, d: 0 }, { b: 'berry', x: 14, y: 14, d: 3 }, { b: 'splitter', x: 14, y: 13, d: 3, rules: DYE_GATE }] },
  { id: 'W.dyer', needs: ['dyer', 'berry', 'splitter'], after: ['W.yarn'], steps: [...off([7, 7], [8, 7]), { b: 'dyer', x: 7, y: 6, d: 0 }, { b: 'berry', x: 7, y: 9, d: 3 }, { b: 'splitter', x: 7, y: 8, d: 3, rules: DYE_GATE }] },
  { id: 'X.dyer', needs: ['dyer', 'berry', 'splitter'], after: ['X.module'], steps: [...off([36, 10], [36, 11]), { b: 'dyer', x: 36, y: 10, d: 1 }, { b: 'berry', x: 33, y: 10, d: 0 }, { b: 'splitter', x: 35, y: 10, d: 0, rules: DYE_GATE }] },
  // ---------------------------------------------------------------- the far row, once it rises: a second pen for E, its loop back by the far row
  {
    id: 'E.pen2',
    needs: ['pen', 'sheep'],
    after: ['E.module'],
    steps: [...belt(2, ...row(3, 28, 23)), ...belt(1, [22, 3], [22, 4]), { pen: [29, 2], d: 2 }, ...belt(3, [30, 5]), ...off(...row(5, 29, 23))],
  },
  // a third pen for W, the far row's, past its second: the second's way out turns up into it, and the loop comes back
  // west by the far row instead of row 5
  {
    id: 'W.pen3',
    needs: ['pen', 'sheep'],
    after: ['W.pen2'],
    whole: true,
    steps: [...belt(2, ...row(3, 13, 2)), ...belt(1, [1, 3], [1, 4]), ...off([15, 5]), ...belt(3, [15, 5]), { pen: [14, 2], d: 2 }, ...off(...row(5, 14, 2))],
  },
  // ---------------------------------------------------------------- Y, the second land in the east (43,3), from the far row down: sweaters
  {
    id: 'Y.module',
    needs: ['pen', 'belt', 'shearer', 'comb', 'curl', 'knit'],
    steps: [
      { pen: [43, 3], d: 1 },
      { b: 'comb', x: 44, y: 6, d: 1 },
      { b: 'curl', x: 44, y: 8, d: 1 },
      { b: 'knit', x: 44, y: 10, d: 1 },
      ...belt(1, [44, 12], [44, 13]),
      { b: 'shearer', x: 44, y: 14, d: 1 },
      ...belt(1, [44, 16], [44, 17]),
      ...belt(0, [44, 18], [45, 18]),
      ...belt(3, ...col(46, 18, 5)),
      ...belt(2, [46, 4]),
      ...belt(1, ...col(43, 14, 19)),
    ],
  },
  { id: 'Y.mower', needs: ['mower'], after: ['Y.module'], steps: [{ b: 'mower', x: 47, y: 18, d: 3 }] },
  { id: 'Y.feeder', needs: ['feeder'], after: ['Y.mower'], steps: [...off([46, 16], [46, 17]), { b: 'feeder', x: 45, y: 16, d: 3 }, ...belt(2, [47, 17])] },
  { id: 'Y.dyer', needs: ['dyer', 'berry', 'splitter'], after: ['Y.module'], steps: [...off([44, 12], [44, 13]), { b: 'dyer', x: 44, y: 12, d: 1 }, { b: 'berry', x: 41, y: 12, d: 0 }, { b: 'splitter', x: 43, y: 12, d: 0, rules: DYE_GATE }] },
]

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
  if (s.rules) b.rules = { l: s.rules[0], f: s.rules[1], r: s.rules[2] }
  return true
}
/** Do a whole job. */
export function applyJob(w: World, j: Job, free = false) {
  return j.steps.every((s) => applyStep(w, s, free))
}
