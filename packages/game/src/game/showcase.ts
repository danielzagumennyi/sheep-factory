import { GRID, LEVELS, PEN, TOOL_ORDER } from './balance'
import { createBot } from './bot'
import { PLAN, applyJob } from './plan'
import { stepSimulation } from './systems'
import { roomFor } from './grid'
import { penIn } from './systems/sheep'
import { Field, Flock, GameState, Market, Unlocks, addMarket, key, makeSheep, res, type World } from './world'

/**
 * The farm of chapter 1 built whole (game/plan.ts), for the main menu's background and for screenshots (dev console:
 * `__game.showcase()`): the six loops round the market, every line; the pens full of sheep, the deposits kept full;
 * the clients of the chapter's last level at the market, every one content (behind the menu their bars stay so).
 * Then it runs a while so goods are on the belts, with the bot's hand tending it as a player would — dead ends
 * emptied — and returns that hand, for whoever shows the farm to keep tending it (`act` about every 0.7 s).
 */
export function buildShowcase(w: World, warmup = 90) {
  const un = res(w, Unlocks),
    gs = res(w, GameState),
    f = res(w, Field)
  for (const t of TOOL_ORDER) un.unlocked.add(t)
  gs.coins += 50_000
  gs.food = true
  Object.assign(f, { left: 0, top: 0, right: GRID.cols, bottom: GRID.rows })
  for (let py = 0; py * GRID.plotH < GRID.rows; py++) for (let px = 0; px * GRID.plotW < GRID.cols; px++) f.plots.add(key(px, py))
  gs.fieldVersion++
  gs.trade = true
  addMarket(w)
  gs.level = LEVELS.length - 1
  gs.chapterDone = true
  res(w, Market).needs = LEVELS.at(-1)!.needs.map(([client, kind, rate]) => ({ client, kind, rate, due: 0, fill: 1 }))
  for (const j of PLAN) applyJob(w, j, true)
  const flock = res(w, Flock)
  // the sheep that roamed at the start live in pens on a finished farm
  for (const s of flock.sheep) {
    const p = s.state === 'roam' ? flock.pastures.find((q) => roomFor(w, q, s)) : null
    if (p) penIn(w, s, p)
  }
  for (const p of flock.pastures) while (flock.sheep.filter((s) => s.home === p.id).length < PEN.cap) flock.sheep.push(makeSheep(w, p.id, true))
  keepFull(w)
  un.cardQ.length = 0
  const hand = createBot(w)
  let a = 0
  for (let t = 0; t < warmup; t += 1 / 60) {
    stepSimulation(w)
    un.cardQ.length = 0
    if ((a += 1 / 60) >= 0.7) {
      a = 0
      hand.act()
    }
  }
  return hand
}

/** Every meadow and bush cell kept full, so the menu's farm never runs dry. */
export function keepFull(w: World) {
  for (const r of res(w, Field).res.values()) r.left = Math.max(r.left, 999)
}
