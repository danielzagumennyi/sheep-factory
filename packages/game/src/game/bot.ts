import { BUILDINGS, GRID, HAND, RECIPES, RECIPE_ORDER, type BuildingId, type Dir, type ItemId, type RecipeId, type ResId, dimsOf } from './balance'
import { anchorForInput, capOf, footprint, freeCell, get, jobOf, outCells, owned, plotAdjacent, plotPrice, plotRes, reachStock, terr, whyNot } from './grid'
import { buildPath, routeCells, type Cell } from './actions/path'
import { buyPlot, buySheep, place, remove, setRecipe } from './actions/build'
import { dropSheep, feed, handClick, pickSheep } from './actions/hand'
import { dockX, loadDock, openOrders, sell } from './systems/orders'
import { storeOf } from './systems/sheep'
import { FIXED_DT, stepSimulation } from './systems'
import { Field, Flock, GameState, Market, Mission, Plant, Stock, Unlocks, key, res, stockOf, stockTake, unkey, type Building, type World, blankBuilding } from './world'

/**
 * The balance bot (TDD 5): plays like a player with quick hands — clicks, buildings, belt lines — so a mission's par
 * time and economy can be checked without a person. Missions 1–2 run on belts; 3–7 build each chain's machines and
 * carry goods between their piles through the stock (a weak player at logistics, a strong one at clicking). It is a
 * measure, not a model of the best play: par times are set from its runs × ~1.3.
 */
export function createBot(w: World) {
  const S = () => ({ gs: res(w, GameState), b: res(w, Plant).b, stock: res(w, Stock).n, flock: res(w, Flock), field: res(w, Field), un: res(w, Unlocks), def: res(w, Mission).def })
  const n = (k: ItemId) => stockOf(w, k)
  const click = (x: number, y: number) => handClick(w, x + 0.5, y + 0.5)
  const has = (t: BuildingId) => res(w, Unlocks).unlocked.has(t)
  const all = () => [...res(w, Plant).b.values()]
  const lines: Record<string, { to: string; cells: Cell[] }> = {}

  function line(name: string, a: Cell, b: Cell) {
    if (lines[name] && lines[name].to === key(b.x, b.y)) return true
    if (lines[name]) for (const c of lines[name].cells) if (get(w, c.x, c.y)?.type === 'belt') remove(w, c.x, c.y)
    const cells = routeCells(w, a, b)
    if (!cells) return false
    if (S().gs.coins < cells.length * 2) {
      delete lines[name]
      return false
    }
    buildPath(w, a, b)
    lines[name] = { to: key(b.x, b.y), cells }
    return true
  }
  const placeAt = (t: BuildingId, x: number, y: number, dir: Dir) => {
    const q = get(w, x, y)
    if (q && q.type === t) return true
    if (q && q.type === 'belt' && !BUILDINGS[t].onBelt) remove(w, x, y)
    return place(w, t, x, y, dir)
  }

  /** The machines an order's good needs, deepest last: building ids, or `workshop:<recipe>` for a workshop job. */
  function chainFor(kind: ItemId): string[] {
    const need: string[] = []
    const add = (k: ItemId) => {
      const r = RECIPE_ORDER.find((q) => RECIPES[q].out === k)
      if (r) {
        if (!need.includes('workshop:' + r)) {
          need.push('workshop:' + r)
          for (const q of Object.keys(RECIPES[r].inp) as ItemId[]) add(q)
        }
        return
      }
      for (const [t, b] of Object.entries(BUILDINGS) as [BuildingId, (typeof BUILDINGS)[BuildingId]][])
        if ((b.out === k || b.gives === k) && t !== 'mower' && t !== 'pump' && !need.includes(t)) {
          need.push(t)
          if (b.inp) for (const q of Object.keys(b.inp) as ItemId[]) add(q)
        }
    }
    add(kind)
    return need
  }
  const typeOf = (token: string) => token.split(':')[0] as BuildingId
  /** Is this chain step built: the building, or a workshop set to that recipe? */
  const built = (token: string) => {
    const [t, r] = token.split(':')
    return all().some((b) => b.type === t && (!r || b.recipe === r))
  }
  const inputsOf = (b: Building) => jobOf(b)?.inp

  // ---------------------------------------------------------------- hands
  function shearByHand() {
    const s = S().flock.sheep.find((q) => q.state === 'pasture' && q.wool >= 1)
    if (s) for (let i = 0; i < HAND.shearClicks; i++) handClick(w, s.px, s.py)
  }
  /** Load every open order's good there is in stock; sell what nothing here needs. */
  function deliver() {
    const os = openOrders(w)
    for (const o of os) {
      const d = all().find((b) => b.type === 'dock' && b.client === o.dock)
      if (d && n(o.kind)) loadDock(w, d, n(o.kind))
    }
    if (!S().def.docks.some(([c]) => c === 'market')) return
    const want = new Set<string>(os.flatMap((o) => [...chainFor(o.kind).flatMap((t) => Object.keys((t.includes(':') ? RECIPES[t.split(':')[1] as RecipeId].inp : BUILDINGS[t as BuildingId].inp) ?? {})), o.kind]))
    for (const k of Object.keys(S().stock) as ItemId[]) if (!want.has(k) && k !== 'hay' && k !== 'water' && n(k) >= 6) sell(w, k, n(k))
  }
  function pickDye() {
    if (all().some((b) => b.type === 'berry')) return
    const dyer = all().find((b) => b.recipe === 'cyarn'),
      o = openOrders(w).some((q) => q.kind === 'dye')
    if (n('dye') && !o) return
    if (!o && (!dyer || (dyer.inv.dye ?? 0) >= 2)) return
    let left = 2
    for (const [k, t] of S().field.terrain) {
      const [x, y] = unkey(k)
      if (t === 'bush' && owned(w, x, y) && left > 0) {
        click(x, y)
        left--
      }
    }
  }
  /** Every machine's pile into the stock: there is no limit. */
  function piles() {
    for (const b of all()) if (b.pile.length) click(b.pileX, b.pileY)
  }
  /** Hay and water from the stock into every pasture's feeder and trough, as a player does in their popups. */
  function feedPasture() {
    for (const p of S().flock.pastures)
      for (const k of [p.feeder, p.trough]) {
        const b = k ? S().b.get(k) : null
        if (b) feed(w, b, BUILDINGS[b.type as BuildingId].takes!, capOf(b))
      }
  }
  /** What a pasture's feeder or trough holds of its good, all pastures together. */
  const stored = (k: 'hay' | 'water') => S().flock.pastures.reduce((a, p) => a + (storeOf(w, p, k)?.inv[k] ?? 0), 0)
  /** Keep a little hay and water in the feeder and trough by hand while there is no producer for it. */
  function feedByHand() {
    const needs = S().def.needs
    if (needs.food && stored('hay') + n('hay') < 3) {
      let left = 2
      for (const [k, t] of S().field.terrain) {
        const [x, y] = unkey(k)
        if (t === 'meadow' && owned(w, x, y) && left > 0) {
          click(x, y)
          left--
        }
      }
    }
    if (needs.water && stored('water') + n('water') < 3)
      for (const [k, t] of S().field.terrain) {
        const [x, y] = unkey(k)
        if (t === 'water' && owned(w, x, y)) {
          click(x, y)
          click(x, y)
          break
        }
      }
  }
  function returnWaiting() {
    for (const s of S().flock.sheep)
      if (s.state === 'waiting') {
        pickSheep(w, s)
        dropSheep(w, s, 11.5, 8.5)
      }
  }
  function maybeBuySheep() {
    const p = S().flock.pastures[0]!
    if (S().gs.coins > 120 && S().flock.sheep.length < p.cap) buySheep(w, p)
  }

  // ---------------------------------------------------------------- plans
  /** The sheep loop from the pasture exit: shearer, up and back in through the pasture's way in. */
  function loop() {
    const sh = shearer()
    if (!sh || lines.loop) return
    const p = S().flock.pastures[0]!,
      ix = p.entry.x
    const out = outCells(sh).find((c) => c.d === sh.dir)!
    // up from the sheep output (or one cell further on, round a tree), along a row above the pasture, down into its way in
    for (const step of [0, 1])
      for (const top of [p.y - 1, p.y - 2]) {
        const cx = out.x + step
        const L: [number, number, Dir][] = step ? [[out.x, out.y, 0]] : []
        for (let y = out.y; y > top; y--) L.push([cx, y, 3])
        for (let x = cx; x > ix; x--) L.push([x, top, 2])
        L.push([ix, top, 1])
        for (let y = top + 1; y < p.y; y++) L.push([ix, y, 1])
        if (!L.every(([x, y]) => get(w, x, y)?.type === 'belt' || freeCell(w, x, y))) continue
        for (const [x, y, d] of L) if (!get(w, x, y)) place(w, 'belt', x, y, d)
        lines.loop = { to: 'fixed', cells: L.map(([x, y]) => ({ x, y })) }
        return
      }
  }
  /** The shearer on the pasture's exit, its way in: placed if it isn't there yet. */
  function shearer() {
    const p = S().flock.pastures[0]!,
      ex = p.exit
    const q = get(w, ex.x, ex.y)
    if (q?.type === 'shearer') return q
    const [ax, ay] = anchorForInput('shearer', p.dir, ex.x, ex.y)
    placeAt('shearer', ax, ay, p.dir)
    return get(w, ex.x, ex.y)?.type === 'shearer' ? get(w, ex.x, ex.y) : null
  }
  const wool = (to: Cell) => {
    const sh = shearer()
    const c = sh && outCells(sh).find((o) => o.d !== sh.dir)
    return c ? line('wool', { x: c.x, y: c.y }, to) : false
  }

  function bestSpot(t: BuildingId, rt: ResId) {
    let best: [number, number, Dir, number] | null = null
    for (let y = 0; y < GRID.roadY; y++)
      for (let x = 0; x < GRID.cols; x++) {
        for (const d of [0, 1, 2, 3] as Dir[]) {
          if (whyNot(w, t, x, y, d)) continue
          const o = outCells(blankBuilding(t, x, y, d))[0]!
          if (!freeCell(w, o.x, o.y)) continue
          const sc = reachStock(w, x, y, rt, ...dimsOf(t, d))
          if (!best || sc > best[3]) best = [x, y, d, sc]
        }
      }
    return best
  }
  /** Where a pump may stand: its tower on an owned water cell, its barrel on free land, its output cell free. */
  function pumpSpot(): [number, number, Dir] | null {
    for (const [k, t] of S().field.terrain) {
      if (t !== 'water') continue
      const [wx, wy] = unkey(k)
      if (!owned(w, wx, wy)) continue
      for (const d of [0, 1, 2, 3] as Dir[]) {
        // the barrel cell lies one step along d from the tower; the footprint's top-left is the lesser of the two
        const [bx, by] = [wx + (d === 0 ? 1 : d === 2 ? -1 : 0), wy + (d === 1 ? 1 : d === 3 ? -1 : 0)]
        const x = Math.min(wx, bx),
          y = Math.min(wy, by)
        if (whyNot(w, 'pump', x, y, d)) continue
        const o = outCells(blankBuilding('pump', x, y, d))[0]!
        if (freeCell(w, o.x, o.y) && terr(w, o.x, o.y) === '') return [x, y, d]
      }
    }
    return null
  }
  /** The adjacent plot with the most cells of this resource per coin. */
  function buyResPlot(rt: ResId) {
    let best: [number, number, number] | null = null
    for (let py = 0; py < 3; py++)
      for (let px = 0; px < 4; px++) {
        if (S().field.plots.has(key(px, py))) continue
        const n = plotRes(w, px, py)[rt] ?? 0,
          price = plotPrice(w, px, py)
        if (!plotAdjacent(w, px, py) || !n || S().gs.coins < price) continue
        if (!best || n / price > best[2]) best = [px, py, n / price]
      }
    return best ? buyPlot(w, best[0], best[1]) : false
  }
  const emptyT = new Map<string, number>()
  /** One mower and one pump per 5 sheep; empty producers move; when nothing is in reach, buy land. */
  function resources(thrift: boolean) {
    const sh = S().flock.sheep.length,
      dyeWanted = openOrders(w).some((q) => ['cyarn', 'sweater', 'valenki', 'dye'].includes(q.kind))
    const plan: [BuildingId, ResId, number][] = [
      ['mower', 'meadow', S().def.needs.food ? Math.ceil(sh / 5) : 0],
      ['pump', 'water', S().def.needs.water ? Math.ceil(sh / 5) : 0],
      ['berry', 'bush', dyeWanted ? 2 : 0],
    ]
    for (const [t, rt, want0] of plan) {
      if (!has(t) || !want0) continue
      const want = thrift ? 1 : want0
      for (const m of all().filter((b) => b.type === t)) {
        const k = key(m.x, m.y)
        if (t !== 'pump' && m.status === 'empty' && reachStock(w, m.x, m.y, rt, m.w, m.h) === 0) {
          emptyT.set(k, (emptyT.get(k) ?? 0) + 1)
          if ((emptyT.get(k) ?? 0) > 6) {
            remove(w, m.x, m.y)
            emptyT.delete(k)
          }
        } else emptyT.delete(k)
      }
      if (all().filter((b) => b.type === t).length >= want) continue
      if (t === 'pump') {
        // a pump stands in the water and never runs dry: any owned pond will do, else buy one
        const sp = pumpSpot()
        if (sp) {
          if (S().gs.coins >= BUILDINGS[t].cost + 10) place(w, t, sp[0], sp[1], sp[2])
        } else buyResPlot(rt)
        continue
      }
      const sp = bestSpot(t, rt)
      if (sp && sp[3] >= 6) {
        if (S().gs.coins >= BUILDINGS[t].cost + 10) place(w, t, sp[0], sp[1], sp[2])
      } else buyResPlot(rt)
    }
  }

  /**
   * A free spot for a workshop facing east: its footprint and both front output cells free, and not on any other
   * machine's output cells — so every machine keeps a pile cell and nothing pushes into the wrong neighbour.
   */
  function spotFor(t: BuildingId): [number, number] | null {
    const taken = new Set<string>()
    for (const m of all()) if (m.type !== 'belt' && m.type !== 'dock') for (const c of outCells(m)) taken.add(key(c.x, c.y))
    for (let y = 5; y < GRID.roadY - 1; y++)
      for (let x = 15; x < 23; x++) {
        if (whyNot(w, t, x, y)) continue
        if (footprint(x, y, ...dimsOf(t, 0)).some(([cx, cy]) => taken.has(key(cx, cy)))) continue
        // its output cell, and the cell beside it (where a second line may start), free
        const out = outCells(blankBuilding(t, x, y, 0))
        const outs = out.flatMap((c) => [[c.x, c.y], [c.x, c.y - 1]])
        if (outs.every(([ox, oy]) => freeCell(w, ox!, oy!) && !taken.has(key(ox!, oy!)))) return [x, y]
      }
    return null
  }
  function factory() {
    loop()
    if (!openOrders(w).length) return
    const chain = () => [...new Set(openOrders(w).flatMap((q) => chainFor(q.kind)))]
    const missing = chain().some((t) => t !== 'shearer' && has(typeOf(t)) && !BUILDINGS[typeOf(t)].gives && !built(t))
    const urgent = stored('water') + n('water') < 2 || stored('hay') + n('hay') < 2
    resources(missing && !urgent)
    // one chain at a time: the cheapest order first, deepest machine first
    const cost = (kind: ItemId) => chainFor(kind).reduce((a, t) => a + BUILDINGS[typeOf(t)].cost, 0)
    outer: for (const q of openOrders(w).sort((a, b) => cost(a.kind) - cost(b.kind)))
      for (const t of chainFor(q.kind).reverse()) {
        const type = typeOf(t)
        if (type === 'shearer' || !has(type) || built(t)) continue
        const sp = spotFor(type)
        if (!sp || !place(w, type, sp[0], sp[1], 0)) break outer
        const r = t.split(':')[1] as RecipeId | undefined
        if (r) setRecipe(w, get(w, sp[0], sp[1])!, r)
      }
    // piles → stock → machines → docks
    for (let k = 0; k < 3; k++) {
      piles()
      const tokens = chain()
      const ms = all().filter((b) => inputsOf(b) && (tokens.includes(b.type) || (b.recipe && tokens.includes('workshop:' + b.recipe))))
      // one item at a time round the machines, like a splitter set to "any", so two machines share a good
      let moved = true
      while (moved) {
        moved = false
        for (const b of ms) {
          // a machine whose good already lies in stock waits, so its inputs go where they're short (the stock has no
          // limit, so nothing else stops it)
          if (n(jobOf(b)!.out) >= 6) continue
          const it = (Object.keys(inputsOf(b)!) as ItemId[]).find((q) => (b.inv[q] ?? 0) < 4 && n(q) > 0)
          if (!it || !stockTake(w, it, 1)) continue
          b.inv[it] = (b.inv[it] ?? 0) + 1
          moved = true
        }
      }
      deliver()
    }
  }
  const plans: Record<string, () => void> = {
    m1() {
      if (!has('shearer')) return shearByHand()
      if (!shearer()) return
      if (has('belt')) {
        loop()
        const o = openOrders(w)[0]
        if (o) wool({ x: dockX(w, o.dock), y: GRID.roadY })
      }
    },
    m2() {
      loop()
      const o = openOrders(w)[0]
      if (o) wool({ x: dockX(w, o.dock), y: GRID.roadY })
      resources(false)
    },
  }
  for (const m of ['m3', 'm4', 'm5', 'm6', 'm7']) plans[m] = factory

  /** One "turn" of the bot: about every 0.7 s of game time. */
  function act() {
    const s = S()
    if (s.gs.finished) return
    s.un.cardQ.length = 0
    returnWaiting()
    piles()
    feedByHand()
    feedPasture()
    if (s.def.terrain.bush) {
      const o = openOrders(w)[0]
      if (o && ['dye', 'cyarn', 'sweater', 'valenki'].includes(o.kind)) pickDye()
    }
    deliver()
    plans[s.gs.mission]?.()
    maybeBuySheep()
  }
  return { act }
}

export interface BotResult {
  mission: string
  t: number
  finished: boolean
  stars: number
  coins: number
  plots: number
  orders: string
}

/** Play a mission headless for up to `seconds` of game time. */
export function runBot(w: World, seconds = 1500): BotResult {
  const bot = createBot(w)
  const gs = res(w, GameState)
  let t = 0,
    a = 0
  while (t < seconds && !gs.finished) {
    stepSimulation(w, FIXED_DT)
    t += FIXED_DT
    a -= FIXED_DT
    if (a <= 0) {
      bot.act()
      a = 0.7
    }
  }
  return {
    mission: gs.mission,
    t: Math.round(gs.clock),
    finished: gs.finished,
    stars: gs.stars,
    coins: gs.coins,
    plots: gs.plotsBought,
    orders: res(w, Market).orders.map((o) => o.id + ':' + o.have + '/' + o.total + (o.done ? '✓' : '')).join(' '),
  }
}
