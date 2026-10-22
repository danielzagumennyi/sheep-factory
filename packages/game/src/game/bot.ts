import { BOT, BUILDINGS, PORTAL, type BuildingId } from './balance'
import { buyRecipe } from './actions/build'
import { dropSheep, pickSheep, shearClick } from './actions/hand'
import { buildLine, portalPorts } from './lines'
import { stepSimulation, FIXED_DT } from './systems'
import { wrongNow } from './systems/machines'
import { toRoam } from './systems/sheep'
import { Flock, GameState, Plant, Unlocks, ready, res, type SheepT, type World } from './world'

/**
 * The balance bot (GDD 8): plays the game as a player would, with one hand that takes BOT.hand.act seconds a click and
 * moves BOT.hand.speed cells a second. By turns: it carries off a sheep standing wrong at a station or the portal; buys
 * the recipes of a simple line — belt, Shearer, carrot — as the coins come; builds lines from the portal's ways in
 * (game/lines.ts); and meanwhile shears by hand the ready sheep nearest the portal and carries them in. For now it
 * builds no preparing stations: once dirty sheep come its lines jam, and it only carries the wrong ones away.
 */
export interface BotAct {
  buys: number
  state: 'buy' | 'hand' | 'save' | 'idle'
}
const LINE: readonly BuildingId[] = ['belt', 'shearer', 'carrot']
const lineCost = BUILDINGS.belt.cost * 3 + BUILDINGS.shearer.cost + BUILDINGS.carrot.cost

export function createBot(w: World) {
  const mid = { x: PORTAL.x + PORTAL.size / 2, y: PORTAL.y + PORTAL.size / 2 }
  let job: SheepT | null = null,
    busy = 0,
    port = 0
  const flock = () => res(w, Flock).sheep
  const act = (dt: number): BotAct => {
    const gs = res(w, GameState),
      un = res(w, Unlocks)
    un.cardQ.length = 0
    if ((busy -= dt) > 0) return { buys: 0, state: 'hand' }
    busy = BOT.hand.act
    // a sheep standing wrong somewhere: off the belt and away from the line
    for (const b of res(w, Plant).b.values()) {
      const s = wrongNow(w, b)
      if (!s || s.state !== 'belt') continue
      pickSheep(w, s)
      toRoam(w, s, s.px + BOT.away, s.py + BOT.away)
      return { buys: 0, state: 'hand' }
    }
    // the line's recipes, in turn; then lines, while ways in are left
    const want = LINE.find((t) => !un.unlocked.has(t))
    if (want) {
      if (buyRecipe(w, want)) return { buys: 1, state: 'buy' }
    } else if (port < 8 && gs.coins >= lineCost) {
      const p = portalPorts(w)[port++]
      if (p && buildLine(w, p)) return { buys: 1, state: 'buy' }
    }
    // the hand: the job in hand, or the ready sheep nearest the portal
    if (job && (!flock().includes(job) || job.state !== 'roam')) job = null
    if (!job) {
      let bd = Infinity
      for (const s of flock()) {
        if (s.state !== 'roam' || !ready(s) || s.drop !== undefined) continue
        const d = Math.hypot(s.px - mid.x, s.py - mid.y)
        if (d < bd) {
          bd = d
          job = s
        }
      }
      if (!job) return { buys: 0, state: want ? 'save' : 'idle' }
      busy += bd / BOT.hand.speed
    }
    shearClick(w, job)
    if (job.wool < 1) {
      // shorn: picked up and carried into the portal
      const d = Math.hypot(job.px - mid.x, job.py - mid.y)
      pickSheep(w, job)
      dropSheep(w, job, mid.x, mid.y)
      busy += d / BOT.hand.speed
      job = null
    }
    return { buys: 0, state: 'hand' }
  }
  return { act }
}

/** One mark of a bot run: when the score reached a step, the coins and the flock then. */
export interface BotMark {
  shorn: number
  at: number
  coins: number
  sheep: number
}
export interface BotResult {
  shorn: number
  t: number
  coins: number
  sheep: number
  /** When the score reached each 50 (and the recipes bought, by when). */
  marks: BotMark[]
  recipes: { id: BuildingId; at: number }[]
  idle: number
}

/** Play `seconds` of the game headless with the bot (`pnpm simulate`), or until `until` sheep are in the portal. */
export function runBot(w: World, seconds = 1800, until = Infinity): BotResult {
  const bot = createBot(w)
  const gs = res(w, GameState),
    un = res(w, Unlocks)
  const marks: BotMark[] = [],
    recipes: BotResult['recipes'] = []
  let t = 0,
    idle = 0,
    next = 50
  while (t < seconds && gs.shorn < until) {
    stepSimulation(w, FIXED_DT)
    t += FIXED_DT
    if (bot.act(FIXED_DT).state === 'idle') idle += FIXED_DT
    for (const id of un.unlocked) if (!recipes.some((r) => r.id === id)) recipes.push({ id, at: Math.round(gs.clock) })
    while (gs.shorn >= next) {
      marks.push({ shorn: next, at: Math.round(gs.clock), coins: Math.round(gs.coins), sheep: res(w, Flock).sheep.length })
      next += 50
    }
  }
  return { shorn: gs.shorn, t: Math.round(gs.clock), coins: Math.round(gs.coins), sheep: res(w, Flock).sheep.length, marks, recipes, idle: Math.round(idle) }
}
