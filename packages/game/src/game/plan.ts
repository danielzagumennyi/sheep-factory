import { BUILDINGS, GRID, PEN, PLOTS, START, dimsOf, type BuildingId, type Dir } from './balance'
import { get, plotOnIsland, plotPrice } from './grid'
import { buyPlot, place, remove } from './actions/build'
import { Field, Flock, GameState, key, res, type SplitRule, type World } from './world'

/**
 * The farm of chapter 1, laid out cell by cell round the market in the middle of the square map (GDD 2, 7): what the
 * balance bot builds, step by step as levels open, the island grows and coins allow, and what the main menu shows
 * built whole. Six loops, each giving one good for its client — everything is made on the sheep (the author's salon,
 * 19.10.2026), so a loop's stations say what its shearer gives — each with its own way into the market, for no belt
 * crosses a loop:
 *
 * Each comes into one of the market's ways in (MARKET.ports: two on each side):
 *
 * - A, on the start's land west of the market: wool for the post. Its stations face north up the column beside the
 *   market, the shearer's wool a cell south and in; a second pen on the land west of it;
 * - W, north of the market: comb and curl — yarn for the atelier, a few cells west and down into it;
 * - E, south of the market: comb — thread for the shop, west along its goods row and up column 25 into it;
 * - X, east of E, by its pond, once the east has risen: the bath — felt for the cobbler, along E's goods row through
 *   a merger;
 * - S, east of the market once the east has risen: the dye station — coloured wool for the school, west into it;
 * - Y, in the far south once it rises: comb, curl and knitting — sweaters for the fair, west and up column 24 into E's
 *   line through a merger.
 *
 * A loop of the bands (W, E, X, Y) runs east from its pen and turns left round it, back along the row above; the good
 * a station takes comes in from its right — from outside the loop — on the row under its stations, and the shearer's
 * good drops to the row under that and runs off to the market. A second pen stands at a loop's corner: each sheep
 * crosses the other pen on its way round and stays only in its own (systems/sheep.ts). A job buys the plots it stands
 * on first (`jobPlots`), and waits while any of them is still under the sky. No hill is in the way (MAP_HILLS).
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

/**
 * A loop of a band, from its pen at (x, y) facing east: the stations along its middle row, the shearer last, and the
 * belt round them back into the pen over its top; the shearer's good drops two rows down and runs `to` the market
 * (`goods`, the rest of its way). Two belts after the shearer keep a feeder's place.
 */
function band(x: number, y: number, stations: readonly BuildingId[], goods: Step[]): Step[] {
  const out: Step[] = [{ pen: [x, y], d: 0 }]
  let at = x + 3
  for (const b of stations) {
    out.push({ b, x: at, y, d: 0 })
    at += 2
  }
  const sx = at - 2
  const r = at + 2
  out.push(...belt(0, [at, y + 1], [at + 1, y + 1]), ...belt(3, [r, y + 1], [r, y]), ...belt(2, ...row(y - 1, r, x + 2)), ...belt(1, [x + 1, y - 1]))
  out.push(...belt(1, [sx, y + 2]), ...goods)
  return out
}
/** A band's mower for its feeder: two cells east of the feeder's place on the row under it, its hay in from the right. */
const bandMower = (fx: number, y: number): Step[] => [{ b: 'mower', x: fx + 2, y: y + 2, d: 2 }]
/** A band's feeder in the place kept for it, its hay from the mower beside. */
const bandFeeder = (fx: number, y: number): Step[] => [...off([fx, y + 1], [fx + 1, y + 1]), { b: 'feeder', x: fx, y, d: 0 }, ...belt(2, [fx + 1, y + 2]), ...belt(3, [fx, y + 2])]

export const PLAN: readonly Job[] = [
  // ---------------------------------------------------------------- A, west of the market, the first pen (21,31): wool
  { id: 'A.pen', needs: ['pen'], steps: [{ pen: [START.pen.x, START.pen.y], d: START.pen.dir }] },
  { id: 'A.shearer', needs: ['shearer'], after: ['A.pen'], steps: [{ b: 'shearer', x: 21, y: 27, d: 3 }] },
  {
    id: 'A.loop',
    needs: ['belt'],
    after: ['A.shearer'],
    // up from the pen to the shearer, on up through the feeder's place, round west and down the land's edge back into
    // the pen; the wool a cell south and east into the market's way in
    steps: [...belt(3, [22, 30], [22, 29], [22, 26], [22, 25]), ...belt(2, [22, 24], [21, 24]), ...belt(1, ...col(20, 24, 31)), ...belt(0, [20, 32]), ...belt(1, [23, 28]), ...belt(0, [23, 29])],
  },
  // A's second pen, on the land west of it: the way down turns into it and its way out comes back onto it
  { id: 'A.pen2', needs: ['pen', 'sheep'], after: ['A.loop'], whole: true, steps: [...belt(2, [20, 26], [19, 26]), ...belt(1, [18, 26]), { pen: [17, 27], d: 0 }, ...off([20, 27])] },
  // hay: a mower north of the column, its hay down into the feeder's right
  { id: 'A.mower', needs: ['mower'], after: ['A.loop'], steps: [{ b: 'mower', x: 23, y: 22, d: 1 }] },
  { id: 'A.feeder', needs: ['feeder'], after: ['A.mower'], steps: [...off([22, 26], [22, 25]), { b: 'feeder', x: 21, y: 25, d: 3 }, ...belt(1, [23, 24], [23, 25]), ...belt(2, [23, 26])] },
  // ---------------------------------------------------------------- E, south of the market (26,34): thread up column 25, into its way in at 26
  { id: 'E.module', needs: ['pen', 'belt', 'shearer', 'comb'], steps: band(26, 34, ['comb', 'shearer'], [...belt(2, ...row(37, 31, 26)), ...belt(3, ...col(25, 37, 33)), ...belt(0, [25, 32]), ...belt(3, [26, 32])]) },
  { id: 'E.mower', needs: ['mower'], after: ['E.module'], steps: bandMower(33, 34) },
  { id: 'E.feeder', needs: ['feeder'], after: ['E.mower'], steps: bandFeeder(33, 34) },
  // ---------------------------------------------------------------- W, north of the market (24,20): yarn west along row 23 and down into its way in
  { id: 'W.module', needs: ['pen', 'belt', 'shearer', 'comb', 'curl'], steps: band(24, 20, ['comb', 'curl', 'shearer'], [...belt(2, [31, 23], [30, 23]), ...belt(1, [29, 23])]) },
  { id: 'W.mower', needs: ['mower'], after: ['W.module'], steps: bandMower(33, 20) },
  { id: 'W.feeder', needs: ['feeder'], after: ['W.mower'], steps: bandFeeder(33, 20) },
  // ---------------------------------------------------------------- X, east of E (37,34), by its pond: felt into E's row through a merger
  { id: 'X.module', needs: ['pen', 'belt', 'shearer', 'bath', 'merger'], after: ['E.module'], steps: [...band(37, 34, ['bath', 'shearer'], belt(2, ...row(37, 42, 32))), { b: 'merger', x: 31, y: 37, d: 2 }] },
  { id: 'X.mower', needs: ['mower'], after: ['X.module'], steps: bandMower(44, 34) },
  { id: 'X.feeder', needs: ['feeder'], after: ['X.mower'], steps: bandFeeder(44, 34) },
  // ---------------------------------------------------------------- S, east of the market (33,25): the dye station, coloured wool west into it
  {
    id: 'S.module',
    needs: ['pen', 'belt', 'shearer', 'dyer', 'berry'],
    steps: [
      { pen: [33, 25], d: 0 },
      { b: 'dyer', x: 36, y: 25, d: 0 },
      ...belt(0, [38, 26], [39, 26], [40, 26]),
      { b: 'shearer', x: 41, y: 25, d: 0 },
      ...belt(0, [43, 26], [44, 26]),
      ...belt(3, [45, 26], [45, 25]),
      ...belt(2, ...row(24, 45, 35)),
      ...belt(1, [34, 24]),
      // the dye: a berry picker on the row under, through two belts into the station's right
      { b: 'berry', x: 39, y: 27, d: 2 },
      ...belt(2, [38, 27], [37, 27]),
      ...belt(3, [36, 27]),
      // the coloured wool: down to row 28, west along it, and a cell south into the market's way in
      ...belt(1, [41, 27]),
      ...belt(2, ...row(28, 41, 33)),
      ...belt(1, [32, 28]),
      ...belt(2, [32, 29]),
    ],
  },
  { id: 'S.mower', needs: ['mower'], after: ['S.module'], steps: bandMower(43, 25) },
  { id: 'S.feeder', needs: ['feeder'], after: ['S.mower'], steps: bandFeeder(43, 25) },
  // ---------------------------------------------------------------- Y, the far south once it rises (26,41): sweaters up column 24, into E's line through a merger
  {
    id: 'Y.module',
    needs: ['pen', 'belt', 'shearer', 'comb', 'curl', 'knit', 'merger'],
    after: ['E.module'],
    steps: band(26, 41, ['comb', 'curl', 'knit', 'shearer'], [...belt(2, ...row(44, 35, 25)), ...belt(3, ...col(24, 44, 33)), ...belt(0, [24, 32]), { b: 'merger', x: 25, y: 32, d: 0 }]),
  },
  { id: 'Y.mower', needs: ['mower'], after: ['Y.module'], steps: bandMower(37, 41) },
  { id: 'Y.feeder', needs: ['feeder'], after: ['Y.mower'], steps: bandFeeder(37, 41) },
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
