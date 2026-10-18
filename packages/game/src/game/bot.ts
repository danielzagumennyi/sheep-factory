import { BUILDINGS, ITEMS, LEVELS, SEED, SHEEP, type BuildingId, type Dir, type ItemId } from './balance'
import { get, isBeltLike, owned, plotAdjacent, residents, reachCells, sowable, targetOk } from './grid'
import { buyPlot, buySheep, place, rotate } from './actions/build'
import { dropSheep, feedSheep, gather, pickSheep, shearClick, takePile } from './actions/hand'
import { PLAN, applyStep, finishJob, landReady, pieceCost, pieces, plotsToBuy } from './plan'
import { FIXED_DT, stepSimulation } from './systems'
import { hungry, loopHasFeeder } from './systems/sheep'
import { buy, openAsks, sell } from './systems/village'
import { Field, Flock, GameState, Plant, Stats, Ui, Unlocks, res, stockOf, toStock, unkey, type World } from './world'

/**
 * The balance bot (TDD 5): plays the long game like a player with quick hands. It builds the farm of game/plan.ts job
 * by job, as levels open the buildings and coins allow, buys sheep for every pen with room, and does with the hand
 * what the hand may do — shear and feed sheep with no station for it, gather, pick up piles and dead ends, load the
 * docks, sell what nothing asks for, sow when the meadows run low. Machines get their goods only by belt. It is a
 * measure, not a model of the best play: `pnpm simulate` prints the time of every level.
 */
export function createBot(w: World) {
  const gs = () => res(w, GameState)
  const un = () => res(w, Unlocks)
  const has = (id: BuildingId | 'valenki') => (id === 'valenki' ? un().recipes.has('valenki') : un().unlocked.has(id))
  const done = new Set<string>()

  // ---------------------------------------------------------------- building the plan
  /** The next job of the plan open to build: its buildings open, its land risen. Null when there is none. */
  function next() {
    for (const j of PLAN) if (!done.has(j.id) && j.needs.every(has) && landReady(w, j)) return j
    return null
  }
  const progress = new Map<string, number>()
  /**
   * Build the next job the way a player does, a piece at a time as the coins come: its plots first, each next to land
   * already owned, then its pieces in order (plan.ts). A few pieces a turn, like quick hands. Returns how many
   * purchases it made.
   */
  function build() {
    let n = 0
    for (let turn = 0; turn < 6; turn++) {
      const j = next()
      if (!j) break
      const plot = plotsToBuy(w, j).find(([px, py]) => plotAdjacent(w, px, py))
      if (plot) {
        if (!buyPlot(w, ...plot)) break
        n++
        continue
      }
      const ps = pieces(j)
      const i = progress.get(j.id) ?? 0
      const p = ps[i]!
      const c = pieceCost(w, p)
      if (gs().coins < c) break
      if (!p.every((s) => applyStep(w, s))) break
      if (c >= 10) n++
      if (i + 1 < ps.length) progress.set(j.id, i + 1)
      else {
        finishJob(w, j)
        done.add(j.id)
      }
    }
    return n
  }

  // ---------------------------------------------------------------- the hand
  const asked = () => new Set(openAsks(w).map((a) => a.kind))
  function gatherOwn(t: 'meadow' | 'bush', n: number) {
    let left = n
    for (const [k, r] of res(w, Field).res) {
      if (left <= 0) break
      if (r.t !== t) continue
      const [x, y] = unkey(k)
      if (!owned(w, x, y)) continue
      while (left > 0 && res(w, Field).res.has(k) && gather(w, x, y)) left--
    }
    return n - left
  }
  function hand() {
    const flock = res(w, Flock)
    // shear by hand only a pen with nothing on its way out yet (no loop); feed where no feeder is on its loop
    for (const s of flock.sheep) {
      const p = flock.pastures.find((q) => q.id === s.home)!
      // a sheep waiting beside a shearer with no belt yet: taken home by hand
      if (s.state === 'waiting') {
        pickSheep(w, s)
        dropSheep(w, s, p.x + 1.5, p.y + 1.5)
      }
      if (s.state !== 'pasture') continue
      const ex = get(w, p.exit.x, p.exit.y)
      if (s.wool >= 1 && !ex) for (let i = s.clicks; i < 3; i++) shearClick(w, s)
      if (hungry(s) && !loopHasFeeder(w, p)) {
        if (!stockOf(w, 'hay') && !gatherOwn('meadow', 4) && gs().coins > 20) buy(w, 'hay', 6)
        feedSheep(w, s)
      }
    }
    // piles, and goods at the end of a belt that goes nowhere
    for (const b of res(w, Plant).b.values()) {
      if (b.pile.length) takePile(w, b)
      if (isBeltLike(b) && b.item && !b.item.sheep && b.item.p >= 1 && b.type === 'belt' && !targetOk(w, b.x, b.y, b.dir)) {
        toStock(w, b.item)
        b.item = null
      }
    }
    // dye for a dye ask from the bushes; a good an ask wants and no line brings, picked off a belt by hand
    if (asked().has('dye') && stockOf(w, 'dye') < 4) gatherOwn('bush', 4)
    for (const a of openAsks(w)) {
      let n = 0
      for (const b of res(w, Plant).b.values()) {
        if (n >= 4) break
        if (b.type === 'belt' && b.item && b.item.kind === a.kind) {
          toStock(w, b.item)
          b.item = null
          n++
        }
      }
    }
    // what nothing asks for goes to the market (hay and dye are kept for feeding and sowing)
    const want = asked()
    for (const k of Object.keys(ITEMS) as ItemId[]) {
      const keep = k === 'hay' ? 30 : k === 'dye' ? 20 : 0
      if (!want.has(k) && stockOf(w, k) > keep + 4) sell(w, k, stockOf(w, k) - keep)
    }
  }

  // ---------------------------------------------------------------- the land: sow round each producer whose ground runs low
  function sowing() {
    if (!has('sow')) return
    for (const b of res(w, Plant).b.values()) {
      if (b.type !== 'mower' && b.type !== 'berry') continue
      const t = BUILDINGS[b.type].near!
      const left = reachCells(w, b.x, b.y, t, true, b.w, b.h).reduce((s, c) => s + c.r.left, 0)
      const sprouts = [...res(w, Field).sprouts.values()].filter((q) => q.t === t).length
      if (left + sprouts * 8 > 40) continue
      const seed = SEED[t]
      for (const c of sowable(w, b).slice(0, 3)) {
        if (!stockOf(w, seed) && seed === 'hay' && gs().coins > 10) buy(w, 'hay', 6)
        if (!stockOf(w, seed) && seed === 'dye') gatherOwn('bush', 2)
        if (!stockOf(w, seed)) break
        res(w, Ui).seed = t
        if (!place(w, 'sow', c.x, c.y, 0)) break
      }
    }
  }

  /**
   * Lines set to what the village asks now, as a player would: A's wool goes to the carder only while the shop wants
   * roving or the atelier yarn, the roving on to the spinner only while yarn is wanted. A dyer gets its dye only while
   * pink is short: with the workshop holding pink yarn but no white yarn or felt, the dye goes to the dead end, so the
   * next sheep shear white.
   */
  function adapt() {
    const want = asked()
    const set = (x: number, y: number, side: 'l' | 'f' | 'r', rule: 'any' | 'off') => {
      const b = get(w, x, y)
      if (b?.type === 'splitter' && b.rules) b.rules[side] = rule
    }
    set(14, 14, 'l', want.has('roving') || want.has('yarn') ? 'any' : 'off')
    set(15, 17, 'l', want.has('yarn') ? 'any' : 'off')
    set(15, 17, 'f', want.has('roving') || !want.has('yarn') ? 'any' : 'off')
    // X's carder only while roving is wanted
    set(34, 13, 'r', want.has('roving') ? 'any' : 'off')
    // the dye splitters before the dyers (E at (24,8), W at (3,8)) and the workshops whose white input they starve
    for (const [dye, shop, white] of [
      [[24, 8], [26, 15], 'yarn'],
      [[3, 8], [5, 15], 'felt'],
    ] as const) {
      const ws = get(w, shop[0], shop[1])
      const whiteShort = !!ws && ws.type === 'workshop' && (ws.inv.pyarn ?? 0) >= 2 && (ws.inv[white] ?? 0) < 2
      set(dye[0], dye[1], 'f', whiteShort ? 'off' : 'any')
    }
  }

  /** A carder before there is a splitter: the wool line turns into it while the shop asks for roving. */
  function carderToggle() {
    if (done.has('A.split') || !done.has('A.carder')) return
    const b = get(w, 14, 14)
    if (!b || b.type !== 'belt') return
    const want: Dir = asked().has('roving') ? 0 : 1
    while (b.dir !== want) rotate(w, b)
  }

  /** Sheep for every pen with room, once sheep are for sale, keeping a little for the next building. Returns how many. */
  function sheep() {
    if (!has('sheep')) return 0
    let n = 0
    for (const p of res(w, Flock).pastures) while (residents(w, p) < p.cap && gs().coins >= SHEEP.price * 2) if (buySheep(w, p)) n++
    else break
    return n
  }
  const penRoom = () => has('sheep') && res(w, Flock).pastures.some((p) => residents(w, p) < p.cap)

  /**
   * One "turn" of the bot, about every 0.7 s of game time. Says what it was: buying (a job or sheep), saving up (there
   * is something to buy, not the coins), or idle — nothing on the farm left to buy until the next level.
   */
  function act(): { buys: number; state: 'buy' | 'save' | 'idle' } {
    un().cardQ.length = 0
    hand()
    const built = build()
    carderToggle()
    adapt()
    sowing()
    const buys = built + sheep()
    return { buys, state: buys ? 'buy' : next() || penRoom() ? 'save' : 'idle' }
  }
  return { act, done }
}

/** One level as the bot played it: how long, how often it bought, how long it saved up or had nothing to buy, the coins. */
export interface LevelRun {
  level: number
  at: number
  took: number
  buys: number
  /** The longest stretch without a purchase, seconds. */
  gap: number
  save: number
  idle: number
  earned: number
  spent: number
  coins: number
  sheep: number
}
export interface BotResult {
  level: number
  t: number
  coins: number
  sheep: number
  plots: number
  levels: LevelRun[]
  /** The jobs of the plan as they were built, with the level each was built in. */
  jobs: { id: string; level: number }[]
}

/** Play the long game headless for up to `seconds` of game time, or until the level after `until` opens. */
export function runBot(w: World, seconds = 3600, until = LEVELS.length): BotResult {
  const bot = createBot(w)
  const gs = res(w, GameState),
    st = res(w, Stats)
  let t = 0,
    a = 0
  const levels: LevelRun[] = []
  const jobs: BotResult['jobs'] = []
  let last = gs.level
  const fresh = () => ({ at0: gs.clock, buys: 0, gap: 0, lastBuy: gs.clock, save: 0, idle: 0, earned: st.earned, spent: st.spent })
  let cur = fresh()
  while (t < seconds && gs.level < until) {
    stepSimulation(w, FIXED_DT)
    t += FIXED_DT
    a -= FIXED_DT
    if (a <= 0) {
      const n = bot.done.size
      const r = bot.act()
      a = 0.7
      if (bot.done.size > n) for (const id of [...bot.done].slice(n)) jobs.push({ id, level: gs.level + 1 })
      if (r.buys) {
        cur.buys += r.buys
        cur.lastBuy = gs.clock
      } else if (r.state === 'save') cur.save += 0.7
      else cur.idle += 0.7
      cur.gap = Math.max(cur.gap, gs.clock - cur.lastBuy)
    }
    if (gs.level !== last) {
      last = gs.level
      const r = Math.round
      levels.push({ level: gs.level, at: r(gs.clock), took: r(gs.clock - cur.at0), buys: cur.buys, gap: r(cur.gap), save: r(cur.save), idle: r(cur.idle), earned: r(st.earned - cur.earned), spent: r(st.spent - cur.spent), coins: r(gs.coins), sheep: res(w, Flock).sheep.length })
      cur = fresh()
    }
  }
  return { level: gs.level + 1, t: Math.round(gs.clock), coins: Math.round(gs.coins), sheep: res(w, Flock).sheep.length, plots: gs.plotsBought, levels, jobs }
}

