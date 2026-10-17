import { CLIENT_ORDER, GRID, ISLAND_GROW, PEN, RECIPE_ORDER, TOOL_ORDER } from './balance'
import { createBot } from './bot'
import { PLAN, applyJob } from './plan'
import { stepSimulation } from './systems'
import { Field, Flock, GameState, Unlocks, addDock, key, makeSheep, res, type World } from './world'

/**
 * The farm of chapter 1 built whole (game/plan.ts), for the main menu's background and for screenshots (dev console:
 * `__game.showcase()`): five pens on three loops of stations, every line, the workshops making sweaters and felt
 * boots, every dock there; the pens full of sheep, the deposits kept full. Then it runs a while so goods are on the
 * belts, with the bot's hand tending it as a player would — dead ends emptied, the dye held back while white is short
 * — and returns that hand, for whoever shows the farm to keep tending it (`act` about every 0.7 s).
 */
export function buildShowcase(w: World, warmup = 90) {
  const un = res(w, Unlocks),
    gs = res(w, GameState),
    f = res(w, Field)
  for (const t of TOOL_ORDER) un.unlocked.add(t)
  for (const r of RECIPE_ORDER) un.recipes.add(r)
  gs.coins += 50_000
  gs.food = true
  f.top = 0
  f.right = GRID.cols
  for (let py = 0; py * GRID.plotH < GRID.roadY; py++) for (let px = 0; px * GRID.plotW < GRID.cols; px++) f.plots.add(key(px, py))
  gs.fieldVersion++
  for (const c of ['market', ...CLIENT_ORDER] as const) addDock(w, c)
  for (const g of ISLAND_GROW) for (const [c, x] of g.docks ?? []) addDock(w, c, x)
  for (const j of PLAN) applyJob(w, j, true)
  const flock = res(w, Flock)
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
