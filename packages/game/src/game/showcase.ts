import { TOOL_ORDER } from './balance'
import { buildLine, portalPorts } from './lines'
import { stepSimulation } from './systems'
import { Unlocks, res, type World } from './world'

/**
 * A factory built whole, for the main menu's background and for screenshots (dev console: `__game.showcase()`): every
 * recipe bought and a line from each of the portal's eight ways in (game/lines.ts), the flock roaming round. Then it
 * runs a while, so sheep are on the belts.
 */
export function buildShowcase(w: World, warmup = 60) {
  const un = res(w, Unlocks)
  for (const t of TOOL_ORDER) un.unlocked.add(t)
  for (const p of portalPorts(w)) buildLine(w, p, 2, true)
  un.cardQ.length = 0
  for (let t = 0; t < warmup; t += 1 / 60) stepSimulation(w)
}
