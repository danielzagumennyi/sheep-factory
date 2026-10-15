import { TOOL_ORDER } from './balance'
import { get } from './grid'
import { place, setRecipe } from './actions/build'
import { buildPath } from './actions/path'
import { stepSimulation } from './systems'
import { Field, GameState, Unlocks, res, type World } from './world'

/**
 * A ready-made factory on mission 7's map for screenshots and concept art (dev console: `__game.showcase()`): the
 * sheep loop with its shearer, wool → carder → spinner → workshop (coloured yarn, the dye from a berry picker joining
 * through a merger) → over the bridge to the school's dock, a mower and a pump filling two barns; a felter and a second
 * workshop (sweaters) stand idle south of the river. Then it runs a while so goods are on the belts.
 */
export function buildShowcase(w: World, warmup = 90) {
  const un = res(w, Unlocks),
    gs = res(w, GameState)
  for (const t of TOOL_ORDER) un.unlocked.add(t)
  gs.coins += 5000
  un.cardQ.length = 0
  // the sheep loop: the shearer takes them in from the pasture's exit, sends them out east, up round the tree and back in
  place(w, 'shearer', 14, 7, 0)
  for (const [x, y, d] of [
    [16, 8, 0],
    [17, 8, 3],
    [17, 7, 3],
    [17, 6, 3],
    [17, 5, 2],
    [16, 5, 2],
    [15, 5, 2],
    [14, 5, 2],
    [13, 5, 2],
    [12, 5, 2],
    [11, 5, 1],
    [11, 6, 1],
  ] as const)
    place(w, 'belt', x, y, d)
  // every machine takes goods in from behind and gives them out in front: wool down and into the carder, roving straight
  // on into the spinner, yarn through a merger (dye joins it there) into the workshop
  place(w, 'belt', 14, 9, 1)
  place(w, 'belt', 14, 10, 0)
  place(w, 'carder', 15, 9, 0)
  place(w, 'spinner', 17, 9, 0)
  place(w, 'merger', 19, 10, 0)
  place(w, 'workshop', 20, 9, 0)
  const ws = get(w, 20, 9)
  if (ws) setRecipe(w, ws, 'cyarn')
  // dye from the bushes, down into the merger (the two bushes kept full, so the line never stops for a frame)
  for (const k of ['21,7', '22,7']) {
    const r = res(w, Field).res.get(k)
    if (r) r.left = 999
  }
  place(w, 'berry', 20, 6, 1)
  place(w, 'belt', 20, 8, 2)
  place(w, 'belt', 19, 8, 1)
  place(w, 'belt', 19, 9, 1)
  // coloured yarn over the bridge to the school's dock
  buildPath(w, { x: 22, y: 10 }, { x: 18, y: 15 })
  // hay and water into two barns, so the sheep's stock fills: the mower pours down into one, the pump by the river
  // into the other
  place(w, 'barn', 8, 10, 1)
  place(w, 'mower', 8, 8, 1)
  place(w, 'barn', 10, 10, 2)
  place(w, 'pump', 12, 10, 2)
  // the rest of the machines, standing idle south of the river, so one frame shows them all
  place(w, 'felter', 12, 13, 2)
  place(w, 'workshop', 16, 13, 3)
  const ws2 = get(w, 16, 13)
  if (ws2) setRecipe(w, ws2, 'sweater')
  for (let t = 0; t < warmup; t += 1 / 60) {
    stepSimulation(w)
    un.cardQ.length = 0
  }
}
