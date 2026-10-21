import { BOT, BUILDINGS, LEVELS, MARKET, SEED, SHEEP, type BuildingId, type ItemId } from './balance'
import { get, owned, plotAdjacent, reachCells, residents, roomFor, sowable, targetOk } from './grid'
import { buyPlot, buySheep, place } from './actions/build'
import { dropCarry, dropSheep, feedSheep, gather, pickFromBelt, pickSheep, pickUp, putDownCarry, shearClick } from './actions/hand'
import { PLAN, applyStep, landReady, pieceCost, pieces, plotsToBuy } from './plan'
import { FIXED_DT, stepSimulation } from './systems'
import { hungry, loopHasFeeder } from './systems/sheep'
import { buy } from './systems/village'
import { Field, Flock, GameState, Plant, Stats, Ui, Unlocks, res, unkey, type SheepT, type World } from './world'

/**
 * The balance bot (TDD 5): plays the long game like a player with quick hands. It builds the farm of game/plan.ts job
 * by job, as levels open the buildings and coins allow, buys sheep for every pen with room, and does with its one hand
 * what a player's would, a trip at a time (BOT.hand) — carry roaming sheep into pens, piles and dead ends' goods to the
 * market, hay to hungry sheep with no feeder, shear sheep with no station for it, sow when the meadows run low. It
 * loads no machine by hand. It is a measure, not a model of the best play: `pnpm simulate` prints the time of every
 * level.
 */
export function createBot(w: World) {
  const gs = () => res(w, GameState)
  const un = () => res(w, Unlocks)
  const has = (id: BuildingId) => un().unlocked.has(id)
  const done = new Set<string>()

  // ---------------------------------------------------------------- building the plan
  /** The next job of the plan open to build: its buildings open, its land risen. Null when there is none. */
  function next() {
    for (const j of PLAN) if (!done.has(j.id) && j.needs.every(has) && (j.after ?? []).every((id) => done.has(id)) && landReady(w, j)) return j
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
      else done.add(j.id)
    }
    return n
  }

  // ---------------------------------------------------------------- the hand
  // One hand, as the player's: it is somewhere on the field, and every trip to a pile, a sheep or the market takes time
  // (BOT.hand) before it can do the next thing. Nothing reaches the market but in it or on a belt (PILE).
  const ui = () => res(w, Ui)
  let at = { x: MARKET.x + MARKET.size / 2, y: MARKET.y + MARKET.size / 2 }
  let busy = 0
  /** Where the goods in the hand are going: the market, or a hungry sheep. */
  let to: { x: number; y: number; sheep?: SheepT } | null = null
  /** A sheep in the hand and the pen it is carried to. */
  let held: { s: SheepT; x: number; y: number } | null = null
  /** Go to (x, y) and do something there (`acts` picks, drops or clicks): the hand is busy until that is done. */
  const go = (x: number, y: number, acts = 1) => {
    busy = gs().clock + BOT.hand.act * acts + Math.hypot(x + 0.5 - at.x, y + 0.5 - at.y) / BOT.hand.speed
    at = { x: x + 0.5, y: y + 0.5 }
  }
  /** Is the hand at (x, y) already. */
  const here = (x: number, y: number) => Math.hypot(x + 0.5 - at.x, y + 0.5 - at.y) < 0.01
  const market = { x: MARKET.x + MARKET.size / 2, y: MARKET.y + MARKET.size / 2 }
  /** A hungry sheep no feeder on its loop will feed, in a pen or roaming. */
  const starving = () => res(w, Flock).sheep.find((s) => hungry(s) && (s.state === 'roam' || (s.state === 'pasture' && !loopHasFeeder(w, res(w, Flock).pastures.find((q) => q.id === s.home)!))))
  /** The nearest pile on the ground holding goods of this kind, or any goods but hay and dye (kept for feeding and sowing). */
  function pileOf(kind?: ItemId) {
    let best: { x: number; y: number } | null = null,
      bd = Infinity
    for (const [k, items] of res(w, Field).piles) {
      if (!items.some((it) => (kind ? it.kind === kind : it.kind !== 'hay' && it.kind !== 'dye'))) continue
      const [x, y] = unkey(k)
      const d = Math.hypot(x + 0.5 - at.x, y + 0.5 - at.y)
      if (d < bd) {
        bd = d
        best = { x, y }
      }
    }
    return best
  }
  function hand() {
    if (gs().clock < busy) return
    // a sheep in the hand: carried to its pen first, then put down in it
    if (held) {
      if (!here(held.x, held.y)) return go(held.x, held.y)
      dropSheep(w, held.s, held.x + 0.5, held.y + 0.5)
      held = null
      return
    }
    // the goods in the hand: carried where they are going first, then put down there
    if (ui().carry.length) {
      if (to && !(to.sheep ? here(Math.floor(to.sheep.px), Math.floor(to.sheep.py)) : here(to.x, to.y))) return to.sheep ? go(Math.floor(to.sheep.px), Math.floor(to.sheep.py)) : go(to.x, to.y)
      if (to?.sheep) {
        if (hungry(to.sheep)) feedSheep(w, to.sheep)
        // more hay: on to the next hungry sheep; anything else in the hand to the market
        const next = ui().carry.some((q) => q.kind === 'hay') ? starving() : undefined
        if (next) {
          to = { x: Math.floor(next.px), y: Math.floor(next.py), sheep: next }
          return go(to.x, to.y)
        }
      } else if (to) dropCarry(w, to.x + 0.5, to.y + 0.5)
      if (ui().carry.some((q) => q.kind !== 'hay' && q.kind !== 'dye')) {
        to = { x: Math.floor(market.x), y: Math.floor(market.y) }
        return go(to.x, to.y)
      }
      // hay and dye left over go down where the hand is
      putDownCarry(w, at.x, at.y)
      to = null
      return
    }
    to = null
    const flock = res(w, Flock)
    // a roaming sheep into a pen with room: to it, picked up — then carried there (above)
    for (const s of flock.sheep) {
      if (s.state !== 'roam' || s.drop !== undefined) continue
      const p = flock.pastures.find((q) => roomFor(w, q, s))
      if (!p) break
      go(Math.floor(s.px), Math.floor(s.py))
      pickSheep(w, s)
      held = { s, x: p.x + 1, y: p.y + 1 }
      return
    }
    // goods lying on the ground to the market, before more are made
    const pile = pileOf()
    if (pile && pickUp(w, pile.x, pile.y)) {
      to = { x: Math.floor(market.x), y: Math.floor(market.y) }
      go(pile.x, pile.y)
      return
    }
    // a hungry sheep with no feeder for it: hay in the hand to it — a pile of hay, else a meadow of own land gathered
    // onto a pile, else hay bought at the market
    const hungrySheep = starving()
    if (hungrySheep) {
      let hay = pileOf('hay')
      if (!hay) {
        // gathered straight into the hand; else bought, put out by the market
        const m = gatherOne('meadow')
        if (m) {
          to = { x: Math.floor(hungrySheep.px), y: Math.floor(hungrySheep.py), sheep: hungrySheep }
          return go(m.x, m.y)
        }
        if (gs().trade && gs().coins > 20 && buy(w, 'hay', 6)) hay = pileOf('hay')
      }
      if (ui().carry.some((q) => q.kind === 'hay') || (hay && pickUp(w, hay.x, hay.y))) {
        to = { x: Math.floor(hungrySheep.px), y: Math.floor(hungrySheep.py), sheep: hungrySheep }
        if (hay) go(hay.x, hay.y)
        return
      }
    }
    // a fluffy sheep with nothing to take it to a shearer: shorn by hand, its wool falls beside it
    for (const s of flock.sheep) {
      if (s.wool < 1 || (s.state !== 'roam' && s.state !== 'pasture') || s.drop !== undefined) continue
      if (s.state === 'pasture') {
        const p = flock.pastures.find((q) => q.id === s.home)!
        if (get(w, p.exit.x, p.exit.y)) continue
      }
      go(Math.floor(s.px), Math.floor(s.py), 3 - s.clicks)
      for (let i = s.clicks; i < 3; i++) shearClick(w, s)
      return
    }
    // a good at the end of a belt that goes nowhere
    for (const b of res(w, Plant).b.values()) {
      if (b.type === 'belt' && b.item && !b.item.sheep && b.item.p >= 1 && !targetOk(w, b.x, b.y, b.dir) && pickFromBelt(w, b)) {
        to = { x: Math.floor(market.x), y: Math.floor(market.y) }
        go(b.x, b.y)
        return
      }
    }
  }
  /** One item gathered into the hand from a resource of own land: where it was, or null. */
  function gatherOne(t: 'meadow' | 'bush') {
    for (const [k, r] of res(w, Field).res) {
      if (r.t !== t) continue
      const [x, y] = unkey(k)
      if (owned(w, x, y) && gather(w, x, y)) return { x, y }
    }
    return null
  }

  // ---------------------------------------------------------------- the land: sow round each producer whose ground runs low
  function sowing() {
    if (!has('sow') || gs().clock < busy || ui().carry.length) return
    for (const b of res(w, Plant).b.values()) {
      if (b.type !== 'mower' && b.type !== 'berry') continue
      const t = BUILDINGS[b.type].near!
      const left = reachCells(w, b.x, b.y, t, true, b.w, b.h).reduce((s, c) => s + c.r.left, 0)
      const sprouts = [...res(w, Field).sprouts.values()].filter((q) => q.t === t).length
      if (left + sprouts * 8 > 40) continue
      const seed = SEED[t]
      // seeds in the hand: a pile of them, else gathered, else bought; the hand walks there and on to the producer
      let pile = pileOf(seed)
      if (pile) pickUp(w, pile.x, pile.y)
      else {
        pile = gatherOne(t === 'meadow' ? 'meadow' : 'bush')
        if (!pile && seed === 'hay' && gs().trade && gs().coins > 10 && buy(w, 'hay', 6)) {
          pile = pileOf('hay')
          if (pile) pickUp(w, pile.x, pile.y)
        }
      }
      if (!pile || !ui().carry.some((q) => q.kind === seed)) continue
      res(w, Ui).seed = t
      const cells = sowable(w, b).slice(0, 3)
      for (const c of cells) if (!place(w, 'sow', c.x, c.y, 0)) break
      go(pile.x, pile.y)
      busy += Math.hypot(b.x - pile.x, b.y - pile.y) / BOT.hand.speed + BOT.hand.act * cells.length
      at = { x: b.x + 0.5, y: b.y + 0.5 }
      return
    }
  }

  /** Sheep for every pen with room, once sheep are for sale, keeping a little for the next building — none while one roams, to be put in first. Returns how many. */
  function sheep() {
    if (!has('sheep') || res(w, Flock).sheep.some((s) => s.state === 'roam')) return 0
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

