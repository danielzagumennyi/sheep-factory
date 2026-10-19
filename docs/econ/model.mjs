// Economy model of the rework (docs/05-REWORK.md): В3 sheep loop with stations + one long game on one map.
// A village level is a set of asks, one per client; when all are done the next level opens one new thing and new asks.
// Not the game's simulation: goods on belts are pools, machines are counts, the map is plots with stocks and room.
// The bot looks at the slowest open ask and buys what limits its chain, as a player who reads the factory would.
// Usage: node docs/econ/model.mjs [minutes] [--slow] [--asks] [--buys]
/* global console, process */
import { pathToFileURL } from 'node:url'

export const N = {
  start: { coins: 40, sheep: 4 },
  hand: { cps: 1, shear: 3 },
  beltCap: 1.47,
  sheep: { cost: 15, grow: 30, loop: 8, exitGap: 1.4 },
  // cost: coins; extra: the belts and splitters it needs, coins; cells: room it takes with its belts
  pen: { cost: 40, cap: 6, cells: 12, extra: 12 },
  shearer: { cost: 40, t: 2, cells: 6, extra: 24 }, // each shearer is its own loop
  feeder: { cost: 30, t: 1, cells: 6, extra: 4, buf: 4 },
  dyer: { cost: 50, t: 1.5, cells: 6, extra: 4, buf: 4 },
  mower: { cost: 30, t: 4, cells: 4, extra: 8 },
  berry: { cost: 40, t: 5, cells: 4, extra: 8 },
  proc: {
    carder: { cost: 80, t: 3, inp: { wool: 2 }, out: 'roving' },
    pcarder: { cost: 80, t: 3, inp: { pwool: 2 }, out: 'proving' },
    spinner: { cost: 100, t: 4, inp: { roving: 1 }, out: 'yarn' },
    pspinner: { cost: 100, t: 4, inp: { proving: 1 }, out: 'pyarn' },
    felter: { cost: 90, t: 4, inp: { wool: 3 }, out: 'felt' },
    wsSweater: { cost: 120, t: 6, inp: { yarn: 1, pyarn: 1 }, out: 'sweater' },
    wsValenki: { cost: 120, t: 6, inp: { felt: 2, pyarn: 1 }, out: 'valenki' },
  },
  procCells: 10,
  procExtra: 31,
  bufPer: 4,
  // sowing (the author's idea): a seed — 1 hay or 1 dye — on an empty own cell sprouts and in `grow` s becomes a meadow
  // cell with `hay` or a bush with `dye`; mown or picked bare it disappears like a wild one
  sow: { grow: 60, hay: 10, dye: 4 },
  // the seeder sows the nearest empty own cell in its reach, one every `t` s, from the seeds a belt brings it
  seeder: { cost: 40, t: 4, cells: 4, extra: 12 },
  meadowCell: 20,
  bushCell: 8,
  plot: { base: 10, meadow: 4, bush: 5, step: 0.25, cells: 40 },
  price: { hay: 1, dye: 2, wool: 3, pwool: 5, roving: 8, proving: 13, yarn: 10, pyarn: 17, felt: 12, sweater: 35, valenki: 53 },
  marketSell: 0.25,
  /** After the table: every client asks its last good again, × grow. */
  grow: 1.3,
}

const BUILDING = { carder: 'carder', pcarder: 'carder', spinner: 'spinner', pspinner: 'spinner', felter: 'felter', wsSweater: 'workshop', wsValenki: 'valenki' }

/** The village, level by level: what opens at its start (one thing) and what the clients ask. */
export const LEVELS = [
  { open: [], asks: [['Почта', 'wool', 10]] },
  { open: ['shearer'], asks: [['Почта', 'wool', 16]] },
  { open: ['belt'], asks: [['Почта', 'wool', 24]] },
  { open: ['pen'], asks: [['Почта', 'wool', 36]] },
  { open: ['mower'], asks: [['Почта', 'wool', 50]] },
  { open: ['feeder'], asks: [['Почта', 'wool', 70]] },
  { open: ['carder'], asks: [['Почта', 'wool', 60], ['Лавка', 'roving', 12]] },
  { open: ['splitter'], asks: [['Почта', 'wool', 80], ['Лавка', 'roving', 20]] },
  { open: ['spinner'], asks: [['Лавка', 'roving', 24], ['Ателье', 'yarn', 10]] },
  { open: ['merger'], asks: [['Почта', 'wool', 130], ['Ателье', 'yarn', 20]] },
  { open: ['felter'], asks: [['Лавка', 'roving', 36], ['Сапожник', 'felt', 12]] },
  { open: ['sow'], asks: [['Почта', 'wool', 140], ['Ателье', 'yarn', 24], ['Сапожник', 'felt', 16]] },
  { open: ['berry'], asks: [['Школа', 'dye', 16], ['Лавка', 'roving', 50]] },
  { open: ['dyer'], asks: [['Школа', 'pwool', 24], ['Ателье', 'yarn', 36]] },
  { open: ['seeder'], asks: [['Школа', 'pyarn', 10], ['Сапожник', 'felt', 24], ['Почта', 'wool', 180]] },
  { open: ['workshop'], asks: [['Ателье', 'sweater', 6], ['Школа', 'pyarn', 14]] },
  { open: ['valenki'], asks: [['Сапожник', 'valenki', 4], ['Лавка', 'roving', 60]] },
  { open: [], asks: [['Ярмарка', 'sweater', 10], ['Сапожник', 'valenki', 8], ['Почта', 'wool', 240]] },
]

/** The long game's map: 4×3 plots, the four central ones owned; [meadow cells, bush cells] per plot. */
export const MAP = {
  '1,1': [6, 3],
  '2,1': [0, 0],
  '1,2': [0, 0],
  '2,2': [0, 0],
  '1,0': [10, 0],
  '2,0': [8, 0],
  '0,1': [12, 0],
  '3,1': [4, 6],
  '0,2': [6, 4],
  '3,2': [10, 0],
  '0,0': [16, 0],
  '3,0': [6, 10],
}
const OWNED0 = ['1,1', '2,1', '1,2', '2,2']
/**
 * The island grows (the author, 16.10.2026: «на 16-м уровне появляются новые участки»): a new row of four plots rises
 * on the far side, away from the road, each with fresh wild deposits. They are for sale like any plot.
 */
export const GROW = {
  16: {
    '0,-1': [12, 0],
    '1,-1': [8, 4],
    '2,-1': [10, 0],
    '3,-1': [6, 8],
  },
}

export function fmt(s) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export function run(minutes = 60, opts = {}) {
  const P = { ...N, ...(opts.N ?? {}) }
  const prof = { every: 1, cps: P.hand.cps, reserve: 1, ...(opts.player ?? {}) }
  const levels = opts.levels ?? LEVELS
  const dt = 0.25
  let t = 0
  const S = {
    coins: P.start.coins,
    stock: { hay: 0, wool: 0, dye: 0 },
    pool: {},
    level: 0,
    un: new Set(['hand']),
    n: { pen: 1, shearer: 0, feeder: 0, dyer: 0, mower: 0, berry: 0, seeder: 0, dseeder: 0, carder: 0, pcarder: 0, spinner: 0, pspinner: 0, felter: 0, wsSweater: 0, wsValenki: 0 },
    buf: {},
    feedBuf: 0,
    dyeBuf: 0,
    sprouts: [],
    sownHay: 0,
    sownDye: 0,
    sowed: 0,
    handSow: 0,
    piles: { hay: 0, wool: 0, dye: 0 },
    plots: {},
    bought: 0,
    used: P.pen.cells,
    asks: [],
    earned: 0,
    spent: 0,
    market: 0,
  }
  for (const k of Object.keys(P.proc)) S.buf[k] = {}
  const MAPX = { ...MAP }
  for (const [k, [m, b]] of Object.entries(MAP)) S.plots[k] = { owned: OWNED0.includes(k), hay: m * P.meadowCell, dye: b * P.bushCell, cells: m + b }
  const owned = () => Object.values(S.plots).filter((p) => p.owned)
  const wildHay = () => owned().reduce((a, p) => a + p.hay, 0)
  const hayLeft = () => wildHay() + S.sownHay
  const wildDye = () => owned().reduce((a, p) => a + p.dye, 0)
  const dyeLeft = () => wildDye() + S.sownDye
  const sownCells = () => S.sprouts.length + Math.ceil(S.sownHay / P.sow.hay) + Math.ceil(S.sownDye / P.sow.dye)
  const room = () => owned().length * P.plot.cells - owned().reduce((a, p) => a + Math.ceil(p.hay / P.meadowCell) + Math.ceil(p.dye / P.bushCell), 0) - sownCells() - S.used
  function take(kind, n) {
    let left = n
    const sown = kind === 'hay' ? 'sownHay' : 'sownDye'
    if (S[sown] > 0) {
      const q = Math.min(left, S[sown])
      S[sown] -= q
      left -= q
    }
    for (const p of owned().sort((a, b) => b[kind] - a[kind])) {
      if (left <= 1e-9) break
      const q = Math.min(left, p[kind])
      p[kind] -= q
      left -= q
    }
    return n - left
  }
  /** Sow one cell with one seed (hay or dye) if there is room; true when sown. */
  function sowOne(kind) {
    if (room() < 1) return false
    S.sprouts.push({ kind, timer: P.sow.grow })
    S.sowed++
    return true
  }
  /** Sown cells wanted ahead: what the sheep (or the dyers) eat while a sprout grows and is harvested, in cells. */
  function sowWant(kind) {
    const fleece = sheep.length / (P.sheep.grow + P.sheep.loop)
    const use = kind === 'hay' ? fleece : pinkShare * fleece
    const wild = kind === 'hay' ? wildHay() : wildDye()
    // start sowing when the wild stock lasts less than three minutes
    if (wild > use * 180) return 0
    return (use * (P.sow.grow + 60)) / P.sow[kind]
  }
  const sownPipe = (kind) => S.sprouts.filter((q) => q.kind === kind).length + (kind === 'hay' ? S.sownHay / P.sow.hay : S.sownDye / P.sow.dye)
  // sheep: grow → fluffy → ride → (dyer) → shearer → feeder → home
  const sheep = []
  const mk = (fluffy) => ({ st: fluffy ? 'fluffy' : 'hungry', timer: 0, pink: false, shorn: false })
  for (let i = 0; i < P.start.sheep; i++) sheep.push(mk(true))
  const Q = { dye: [], shear: [], feed: [], ride: [] }
  const srv = { shear: 0, feed: 0, dye: 0 }
  let exitT = 0,
    handBudget = 0,
    pinkShare = 0,
    pinkAcc = 0
  const win = []
  const lv = []
  const done = []
  const buys = []
  let waitCoins = 0,
    idle = 0,
    waitStart = null,
    longestWait = 0
  const waits = []

  // ------------------------------------------------------------------ the village
  function openLevel() {
    const L = levels[S.level] ?? genLevel(S.level)
    for (const [k, [m, b]] of Object.entries((opts.grow ?? GROW)[S.level + 1] ?? {})) {
      S.plots[k] = { owned: false, hay: m * P.meadowCell, dye: b * P.bushCell, cells: m + b, grown: true }
      MAPX[k] = [m, b]
    }
    for (const u of L.open) S.un.add(u)
    if (L.open.includes('belt')) S.un.add('sheep')
    for (const [client, good, total] of L.asks) S.asks.push({ client, good, total, have: 0, opened: t, got: [] })
    lv.push({ level: S.level + 1, t, open: L.open.join(' '), asks: L.asks.map(([c, g, n]) => `${c} ${n} ${g}`).join(', '), coins: Math.round(S.coins) })
  }
  /** Past the table: each client of the last level asks for its good again, × grow. */
  function genLevel(i) {
    const last = levels[levels.length - 1]
    const k = i - levels.length + 1
    return { open: [], asks: last.asks.map(([c, g, n]) => [c, g, Math.round(n * Math.pow(P.grow, k))]) }
  }
  openLevel()
  const open = () => S.asks.filter((a) => a.have < a.total - 1e-9)
  function deliver(a, n) {
    const q = Math.min(n, a.total - a.have)
    a.have += q
    a.got.push([t, q])
    S.coins += q * P.price[a.good]
    S.earned += q * P.price[a.good]
    if (a.have >= a.total - 1e-9) done.push({ t, ask: `${a.client} ${a.total} ${a.good}`, took: t - a.opened })
    if (!open().length) {
      lv[lv.length - 1].took = t - lv[lv.length - 1].t
      S.asks = []
      S.level++
      openLevel()
    }
    return q
  }
  /** Delivery rate of an ask over the last 30 s. */
  const rateOf = (a) => a.got.filter(([w]) => w > t - 30).reduce((s, [, q]) => s + q, 0) / Math.min(30, Math.max(1, t - a.opened))

  /** Goods the open asks need, up the chains. */
  function needed() {
    const need = new Set(open().map((a) => a.good))
    let grew = true
    while (grew) {
      grew = false
      for (const d of Object.values(P.proc))
        if (need.has(d.out))
          for (const g of Object.keys(d.inp))
            if (!need.has(g)) {
              need.add(g)
              grew = true
            }
    }
    if (need.has('pwool')) {
      need.add('dye')
      need.add('wool')
    }
    return need
  }

  // ------------------------------------------------------------------ buying
  const has = (u) => S.un.has(u)
  const procOk = (k) => has(BUILDING[k]) && (k !== 'wsValenki' || has('workshop'))
  function plotPrice(k) {
    const [m, b] = MAPX[k]
    return Math.round(((P.plot.base + P.plot.meadow * m + P.plot.bush * b) * (1 + P.plot.step * S.bought)) / 5) * 5
  }
  function adjacent(k) {
    const [x, y] = k.split(',').map(Number)
    return [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => S.plots[`${x + dx},${y + dy}`]?.owned)
  }
  function plotFor(kind) {
    let best = null
    for (const [k, p] of Object.entries(S.plots)) {
      if (p.owned || !adjacent(k)) continue
      const v = kind === 'room' ? P.plot.cells - p.cells : p[kind]
      if (!v) continue
      const sc = v / plotPrice(k)
      if (!best || sc > best.sc) best = { k, sc, price: plotPrice(k) }
    }
    return best
  }
  function costOf(w) {
    if (w === 'sheep') return P.sheep.cost
    if (w.startsWith('plot:')) return plotPrice(w.slice(5))
    if (w === 'dseeder') return P.seeder.cost + P.seeder.extra
    if (P.proc[w]) return P.proc[w].cost + P.procExtra
    return P[w].cost + (P[w].extra ?? 0)
  }
  function cellsOf(w) {
    if (w === 'sheep' || w.startsWith('plot:')) return 0
    if (w === 'dseeder') return P.seeder.cells
    if (P.proc[w]) return P.procCells
    return P[w].cells
  }
  /** Room a new pen must leave free: the sown cells its sheep will eat from once the wild meadows are gone. */
  function reserveFor(w) {
    if (w !== 'pen' && w !== 'sheep') return 0
    const pens = S.n.pen + (w === 'pen' ? 1 : 0)
    const hayUse = (pens * P.pen.cap) / (P.sheep.grow + P.sheep.loop)
    const wildMinutes = wildHay() / Math.max(0.01, hayUse) / 60
    // the sown cells those sheep will eat from, beyond what is sown already
    const cells = (hayUse * (P.sow.grow + 60)) / P.sow.hay - sownPipe('hay')
    return wildMinutes < 15 && has('sow') ? Math.max(0, Math.ceil(cells)) + 2 : 0
  }
  function buy(w, why) {
    if (cellsOf(w) + reserveFor(w) > room()) {
      const p = plotFor('room')
      if (!p) return 'noroom'
      w = 'plot:' + p.k
      why = 'room'
    }
    const c = costOf(w)
    if (S.coins < c * prof.reserve) return false
    S.coins -= c
    S.spent += c
    if (w === 'sheep') sheep.push(mk(true))
    else if (w.startsWith('plot:')) {
      S.plots[w.slice(5)].owned = true
      S.bought++
    } else {
      S.n[w]++
      S.used += cellsOf(w)
    }
    buys.push({ t, what: w, why, price: c, level: S.level + 1 })
    return true
  }

  function reading() {
    const w = win.slice(-120)
    const avg = (f) => w.reduce((a, s) => a + f(s), 0) / Math.max(1, w.length)
    return {
      dyeUtil: avg((s) => s.dyeUtil),
      dyeStarve: avg((s) => s.dyeStarve),
      feedStarve: avg((s) => s.feedStarve),
      proc: Object.fromEntries(Object.keys(P.proc).map((k) => [k, avg((s) => s.pu[k] ?? 0)])),
    }
  }
  /** Wool per second the farm can give, and which part limits it. */
  function rawSupply() {
    const cycle = P.sheep.grow + P.sheep.loop
    const lim = [['herd', (2 * sheep.length) / cycle]]
    if (S.n.shearer && has('belt')) lim.push(['shearer', (2 * S.n.shearer) / P.shearer.t], ['loop', 2 * S.n.shearer * P.beltCap])
    else lim.push(['hand', (2 * P.hand.cps) / (P.hand.shear + 2)])
    if (S.n.feeder) {
      lim.push(['feeder', (2 * S.n.feeder) / P.feeder.t])
      lim.push(['hay', hayLeft() > 1 ? (2 * S.n.mower) / P.mower.t : 0])
    } else lim.push(['handFeed', P.hand.cps])
    lim.sort((a, b) => a[1] - b[1])
    return { rate: lim[0][1], by: lim[0][0] }
  }
  const meadowCells = () => owned().reduce((a, p) => a + Math.ceil(p.hay / P.meadowCell), 0) + Math.ceil(S.sownHay / P.sow.hay) + S.sprouts.filter((q) => q.kind === 'hay').length
  function moreHay() {
    if (S.n.mower < Math.floor(meadowCells() / 2) && hayLeft() > 20) return 'mower'
    // sowing by hand is free; the seeder takes it over
    if (has('seeder') && sowWant('hay') > 0 && !S.n.seeder) return 'seeder'
    const p = plotFor('hay')
    if (p) return 'plot:' + p.k
    return null
  }
  /** What limits the farm's wool: the cheapest fix. */
  function farmFix() {
    const sup = rawSupply()
    if (sup.by === 'herd' && has('sheep')) return sheep.length < S.n.pen * P.pen.cap ? 'sheep' : has('pen') ? 'pen' : null
    if (sup.by === 'shearer' || sup.by === 'loop') return 'shearer'
    if (sup.by === 'feeder') return 'feeder'
    if (sup.by === 'hay') return moreHay()
    return null
  }
  /** What limits making good g for the asks: walk up its chain from the ask. */
  function fixFor(g, r, depth = 0) {
    if (depth > 6) return null
    if (g === 'wool') return farmFix()
    if (g === 'dye') {
      if (!has('berry')) return null
      const bushCells = owned().reduce((a, q) => a + Math.ceil(q.dye / P.bushCell), 0) + Math.ceil(S.sownDye / P.sow.dye) + S.sprouts.filter((q) => q.kind === 'dye').length
      if (dyeLeft() > 8 && S.n.berry < Math.ceil(bushCells / 3)) return 'berry'
      if (has('seeder') && sowWant('dye') > 0 && !S.n.dseeder) return 'dseeder'
      const p = plotFor('dye')
      return p ? 'plot:' + p.k : null
    }
    if (g === 'pwool') {
      if (!has('dyer')) return null
      if (!S.n.dyer) return 'dyer'
      // dye for the dyers: pickers as the bushes allow, then bush land
      const dyeRate = S.n.berry / P.berry.t,
        dyeWant = (pinkShare || 0.3) * (sheep.length / (P.sheep.grow + P.sheep.loop))
      if (r.dyeStarve > 0.1 || dyeRate < dyeWant * 0.9) return fixFor('dye', r, depth + 1)
      if (r.dyeUtil > 0.8) return 'dyer'
      return farmFix()
    }
    const k = Object.keys(P.proc).find((q) => P.proc[q].out === g)
    if (!k || !procOk(k)) return null
    if (!S.n[k]) return k
    if (r.proc[k] > 0.8) return k
    // starved: the input with least on the belt
    const ins = Object.keys(P.proc[k].inp).sort((a, b) => (S.pool[a] ?? 0) - (S.pool[b] ?? 0))
    return fixFor(ins[0], r, depth + 1)
  }

  function decide() {
    const r = reading()
    // basics first: shearer, belt loop, a mower and a feeder as soon as they open
    for (const b of ['shearer', 'mower', 'feeder']) if (has(b) && !S.n[b] && (b !== 'feeder' || S.n.mower)) return { what: b, why: 'opened' }
    if (has('seeder') && !S.n.seeder && sowWant('hay') > 0) return { what: 'seeder', why: 'sowing' }
    if (has('seeder') && !S.n.dseeder && S.n.dyer && sowWant('dye') > 0) return { what: 'dseeder', why: 'sowing' }
    // hay for the next minute and a half
    if (S.n.feeder) {
      const use = (sheep.length / (P.sheep.grow + P.sheep.loop)) * 90
      if (hayLeft() + sownPipe('hay') * P.sow.hay < use) {
        const w = moreHay()
        if (w) return { what: w, why: 'hay low' }
      }
      if (r.feedStarve > 0.15) {
        const w = moreHay()
        if (w) return { what: w, why: 'hungry' }
      }
    }
    // the slowest open ask: fix its chain
    const asks = open().map((a) => ({ a, eta: (a.total - a.have) / Math.max(0.01, rateOf(a)) }))
    asks.sort((x, y) => y.eta - x.eta)
    for (const { a } of asks) {
      const w = fixFor(a.good, r)
      if (w) return { what: w, why: `${a.client} ${a.good}` }
    }
    return { what: null }
  }

  // ------------------------------------------------------------------ the hand
  function hand() {
    handBudget = Math.min(handBudget + prof.cps * dt, 3)
    while (handBudget >= 1) {
      const hungry = !S.n.feeder && sheep.find((s) => s.st === 'hungry')
      if (hungry) {
        if (S.stock.hay >= 1) {
          S.stock.hay--
          hungry.st = 'grow'
          hungry.timer = P.sheep.grow
          handBudget--
          continue
        }
        if (S.piles.hay >= 1) {
          S.stock.hay += S.piles.hay
          S.piles.hay = 0
          handBudget--
          continue
        }
        if (!S.n.mower && take('hay', 1)) {
          S.stock.hay++
          handBudget--
          continue
        }
      }
      if (!S.n.shearer) {
        const f = sheep.find((s) => s.st === 'fluffy')
        if (f) {
          handBudget -= P.hand.shear
          f.st = 'hungry'
          S.stock.wool += 2
          continue
        }
      }
      if (S.n.shearer && !has('belt')) {
        // shorn beside the shearer: the hand takes the sheep back and the wool pile up
        const f = sheep.find((s) => s.st === 'fluffy')
        if (f) {
          handBudget--
          f.st = 'hungry'
          S.piles.wool += 2
          continue
        }
      }
      if (S.piles.wool >= 1) {
        S.stock.wool += S.piles.wool
        S.piles.wool = 0
        handBudget--
        continue
      }
      if (S.piles.dye >= 1) {
        S.stock.dye += S.piles.dye
        S.piles.dye = 0
        handBudget--
        continue
      }
      const a = open().find((q) => S.stock[q.good] >= 1)
      if (a) {
        S.stock[a.good] -= deliver(a, S.stock[a.good])
        handBudget--
        continue
      }
      const da = open().find((q) => q.good === 'dye')
      if (da && !S.n.berry && take('dye', 1)) {
        S.stock.dye++
        handBudget--
        continue
      }
      // sowing by hand: gather a seed, then sow it
      let sowed = false
      for (const [kind, seeder] of [
        ['hay', 'seeder'],
        ['dye', 'dseeder'],
      ]) {
        if (!has('sow') || S.n[seeder] || sownPipe(kind) >= sowWant(kind) || room() < 1) continue
        if (S.stock[kind] >= 1) {
          if (sowOne(kind)) {
            S.stock[kind]--
            handBudget--
            S.handSow++
            sowed = true
            break
          }
        } else if (take(kind, 1)) {
          S.stock[kind]++
          handBudget--
          S.handSow++
          sowed = true
          break
        }
      }
      if (sowed) continue
      break
    }
  }

  // ------------------------------------------------------------------ one step of the factory
  function step() {
    const need = needed()
    const smp = { pu: {}, dyeUtil: 0, dyeStarve: 0, feedStarve: 0 }
    for (const s of sheep)
      if (s.st === 'grow') {
        s.timer -= dt
        if (s.timer <= 0) s.st = 'fluffy'
      }
    // sprouts ripen into meadow and bush cells
    for (const q of [...S.sprouts]) {
      q.timer -= dt
      if (q.timer <= 0) {
        S.sprouts.splice(S.sprouts.indexOf(q), 1)
        if (q.kind === 'hay') S.sownHay += P.sow.hay
        else S.sownDye += P.sow.dye
      }
    }
    // seeders: a seed from the belt onto an empty cell, while more is wanted
    for (const [k, kind] of [
      ['seeder', 'hay'],
      ['dseeder', 'dye'],
    ]) {
      if (!S.n[k]) continue
      S['seedT_' + k] = (S['seedT_' + k] ?? 0) + (S.n[k] * dt) / P.seeder.t
      while (S['seedT_' + k] >= 1) {
        S['seedT_' + k]--
        if (sownPipe(kind) >= sowWant(kind) || !take(kind, 1)) break
        if (!sowOne(kind)) {
          if (kind === 'hay') S.sownHay += 1
          else S.sownDye += 1
          break
        }
      }
      S['seedT_' + k] = Math.min(S['seedT_' + k], 1)
    }
    // out of the pens onto the loop: fluffy sheep, and hungry ones once a feeder waits on the loop
    exitT -= dt
    if (S.n.shearer && has('belt')) {
      while (exitT <= 0) {
        const f = sheep.find((s) => s.st === 'fluffy') ?? (S.n.feeder ? sheep.find((s) => s.st === 'hungry') : null)
        if (!f) break
        if (Q.ride.length + Q.dye.length + Q.shear.length + Q.feed.length >= S.n.shearer * 12) break
        f.shorn = f.st === 'hungry'
        f.st = 'ride'
        f.timer = P.sheep.loop
        pinkAcc += f.shorn ? 0 : pinkShare
        f.pink = pinkAcc >= 1
        if (f.pink) pinkAcc -= 1
        Q.ride.push(f)
        exitT += P.sheep.exitGap / S.n.pen
      }
      if (exitT < 0) exitT = 0
    }
    for (const s of [...Q.ride]) {
      s.timer -= dt
      if (s.timer <= 0) {
        Q.ride.splice(Q.ride.indexOf(s), 1)
        ;(s.pink ? Q.dye : Q.shear).push(s)
      }
    }
    // dyer: no dye — the sheep goes on white
    srv.dye += (S.n.dyer * dt) / P.dyer.t
    smp.dyeUtil = S.n.dyer ? Math.min(1, Q.dye.length / S.n.dyer) : 0
    while (srv.dye >= 1 && Q.dye.length) {
      srv.dye--
      const s = Q.dye.shift()
      if (S.dyeBuf >= 1) S.dyeBuf--
      else {
        s.pink = false
        smp.dyeStarve = 1
      }
      Q.shear.push(s)
    }
    if (!Q.dye.length) srv.dye = Math.min(srv.dye, 1)
    // shearer: a shorn sheep passes
    srv.shear += (S.n.shearer * dt) / P.shearer.t
    while (srv.shear >= 1 && Q.shear.length) {
      srv.shear--
      const s = Q.shear.shift()
      if (!s.shorn) {
        const g = s.pink ? 'pwool' : 'wool'
        S.pool[g] = (S.pool[g] ?? 0) + 2
      }
      s.pink = false
      s.shorn = false
      if (S.n.feeder) Q.feed.push(s)
      else s.st = 'hungry'
    }
    if (!Q.shear.length) srv.shear = Math.min(srv.shear, 1)
    // feeder: no hay — the sheep goes home hungry and comes out again
    srv.feed += (S.n.feeder * dt) / P.feeder.t
    while (srv.feed >= 1 && Q.feed.length) {
      srv.feed--
      const s = Q.feed.shift()
      if (S.feedBuf >= 1) {
        S.feedBuf--
        s.st = 'grow'
        s.timer = P.sheep.grow
      } else {
        s.st = 'hungry'
        smp.feedStarve = 1
      }
    }
    if (!Q.feed.length) srv.feed = Math.min(srv.feed, 1)
    // mowers → feeders, or a pile for the hand
    if (S.n.mower) {
      const want = (S.n.mower * dt) / P.mower.t
      const space = S.n.feeder ? S.n.feeder * P.feeder.buf - S.feedBuf : 3 * S.n.mower - S.piles.hay
      const got = take('hay', Math.max(0, Math.min(want, space)))
      if (S.n.feeder) S.feedBuf += got
      else S.piles.hay += got
    }
    // berry pickers → dyers (a dye ask gets its share by a splitter), or a pile
    if (S.n.berry) {
      const want = (S.n.berry * dt) / P.berry.t
      const dyeAsk = open().find((a) => a.good === 'dye')
      let got = take('dye', want)
      if (dyeAsk && has('belt')) got -= deliver(dyeAsk, S.n.dyer ? got / 2 : got)
      if (S.n.dyer) {
        const toD = Math.min(got, S.n.dyer * P.dyer.buf - S.dyeBuf)
        S.dyeBuf += toD
        got -= toD
      }
      // the rest waits on the belt (put back)
      if (got > 0) {
        const p = owned().find((q) => MAPX[Object.keys(S.plots).find((k) => S.plots[k] === q)][1] > 0) ?? owned()[0]
        p.dye += got
      }
    }
    // belts: each good goes round-robin to the open asks for it and the machines making needed goods
    if (has('belt')) {
      for (const g of Object.keys(S.pool)) {
        if (!(S.pool[g] > 1e-9)) continue
        const takers = []
        for (const a of open()) if (a.good === g) takers.push({ dock: a, max: P.beltCap * dt * 4 })
        for (const [k, d] of Object.entries(P.proc)) if (S.n[k] && d.inp[g] && need.has(d.out)) takers.push({ k, max: S.n[k] * P.bufPer * d.inp[g] - (S.buf[k][g] ?? 0) })
        let list = takers.filter((q) => q.max > 1e-9)
        if (!has('splitter') && list.length > 1) list = [list.sort((a, b) => (b.k ? 1 : 0) - (a.k ? 1 : 0))[0]]
        let left = S.pool[g],
          active = list
        while (left > 1e-9 && active.length) {
          const share = left / active.length
          const next = []
          for (const q of active) {
            const give = Math.min(share, q.max)
            q.max -= give
            left -= give
            if (q.dock) deliver(q.dock, give)
            else S.buf[q.k][g] = (S.buf[q.k][g] ?? 0) + give
            if (q.max > 1e-9) next.push(q)
          }
          if (next.length === active.length) break
          active = next
        }
        S.pool[g] = left
        // nothing here wants it: to the market at a quarter (a done ask's dock pays the same)
        if (!takers.length && S.pool[g] > 8) {
          const sold = S.pool[g] - 8
          S.coins += sold * P.price[g] * P.marketSell
          S.market += sold * P.price[g] * P.marketSell
          S.pool[g] = 8
        }
      }
    } else if ((S.pool.wool ?? 0) > 0) {
      S.piles.wool += S.pool.wool
      S.pool.wool = 0
    }
    for (const [k, d] of Object.entries(P.proc)) {
      if (!S.n[k]) continue
      const outOk = need.has(d.out) || (S.pool[d.out] ?? 0) < 4
      const jobs = (S.n[k] * dt) / d.t
      const can = Math.min(jobs, ...Object.entries(d.inp).map(([g, q]) => (S.buf[k][g] ?? 0) / q))
      const did = outOk ? can : 0
      for (const [g, q] of Object.entries(d.inp)) S.buf[k][g] = (S.buf[k][g] ?? 0) - did * q
      S.pool[d.out] = (S.pool[d.out] ?? 0) + did
      smp.pu[k] = did / jobs
    }
    win.push(smp)
    if (win.length > 400) win.shift()
    const pinkWant = open().some((a) => ['pwool', 'proving', 'pyarn', 'sweater', 'valenki'].includes(a.good))
    const pinkGoods = open().filter((a) => ['pwool', 'proving', 'pyarn', 'sweater', 'valenki'].includes(a.good)).length
    pinkShare = S.n.dyer && pinkWant ? Math.min(0.6, pinkGoods / Math.max(1, open().length)) : 0
    hand()
  }

  // ------------------------------------------------------------------ run
  let nextDecide = 0
  while (t < minutes * 60) {
    step()
    if (t >= nextDecide) {
      nextDecide = t + prof.every
      const c = decide()
      const res = c.what ? buy(c.what, c.why) : 'none'
      if (res === true) {
        if (waitStart !== null) {
          waits.push(t - waitStart)
          longestWait = Math.max(longestWait, t - waitStart)
          waitStart = null
        }
      } else if (res === false) {
        waitCoins += prof.every
        if (waitStart === null) waitStart = t
      } else idle += prof.every
      if (opts.peek?.includes(Math.round(t))) console.log('@' + fmt(t), c, rawSupply(), 'sheep', sheep.length, 'coins', Math.round(S.coins), 'asks', open().map((a) => `${a.client} ${Math.floor(a.have)}/${a.total} ${a.good}`).join('; '))
    }
    t += dt
  }
  return { lv, done, buys, S, sheep, waitCoins, idle, longestWait, waits, hayLeft: hayLeft(), wildHay: wildHay(), dyeLeft: dyeLeft(), room: room(), minutes }
}

export function report(r) {
  console.log('level  start   took   coins  opens        asks')
  for (const l of r.lv) console.log(String(l.level).padStart(5), fmt(l.t).padStart(6), (l.took !== undefined ? fmt(l.took) : '…').padStart(6), String(l.coins).padStart(6), ' ', (l.open || '—').padEnd(12), l.asks)
  const n = r.S.n
  console.log(`\nafter ${r.minutes} min: level ${r.S.level + 1}, coins ${Math.round(r.S.coins)}, earned ${Math.round(r.S.earned)} + market ${Math.round(r.S.market)}, spent ${Math.round(r.S.spent)}`)
  console.log(`sheep ${r.sheep.length}, pens ${n.pen}, shearers ${n.shearer}, feeders ${n.feeder}, dyers ${n.dyer}, mowers ${n.mower}, berries ${n.berry}, seeders ${n.seeder}+${n.dseeder}, sown cells ${r.S.sowed} (hand clicks on sowing ${r.S.handSow}), plots bought ${r.S.bought}`)
  console.log(`carders ${n.carder}+${n.pcarder}p, spinners ${n.spinner}+${n.pspinner}p, felters ${n.felter}, workshops ${n.wsSweater} sweater + ${n.wsValenki} valenki`)
  const ws = r.waits.slice().sort((a, b) => a - b)
  console.log(`waiting for coins ${Math.round((100 * r.waitCoins) / (r.minutes * 60))}% of the time (median wait ${Math.round(ws[ws.length >> 1] ?? 0)} s, longest ${Math.round(r.longestWait)} s), nothing to buy ${Math.round((100 * r.idle) / (r.minutes * 60))}%`)
  console.log(`hay left ${Math.round(r.hayLeft)} (wild ${Math.round(r.wildHay)}), dye left ${Math.round(r.dyeLeft)}, free cells ${r.room}`)
  console.log('open asks:', r.S.asks.map((a) => `${a.client} ${Math.floor(a.have)}/${a.total} ${a.good}`).join('; '))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const slow = process.argv.includes('--slow')
  const r = run(Number(process.argv[2] ?? 60), slow ? { player: { every: 6, cps: 0.6, reserve: 1.3 } } : {})
  report(r)
  if (process.argv.includes('--asks')) for (const d of r.done) console.log(fmt(d.t), d.ask, 'in', fmt(d.took))
  if (process.argv.includes('--buys')) for (const b of r.buys) console.log(fmt(b.t), 'L' + b.level, b.what, b.why, b.price)
}
