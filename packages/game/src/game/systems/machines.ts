import { BELT, BUILDINGS, GRID, LOOK, PRODUCERS, SEED, SHEEP, SOW, type BuildingId, type ResId } from '../balance'
import { freeCell, get, inGrid, isMachine, jobsOf, outCells, pastureAt, reachOf, sowable } from '../grid'
import { Field, GameState, Plant, key, newItem, puff, res, unkey, type Building, type SheepT, type World } from '../world'
import { tryPush } from './belts'

/**
 * Machines (GDD 4.3). A machine starts a job when its inputs hold one of its jobs whole; a producer takes one unit from
 * the nearest owned resource cell in reach every `time` seconds; a station works on the sheep that comes in — the
 * shearer cuts a fluffy one, the feeder feeds a hungry one, the dyer colours a fluffy one — and lets any other pass,
 * so the loop never stands; a seeder sows. A finished output waits until it can leave: onto a belt, into a pen or a
 * dock, or onto a small pile beside the machine.
 */

/** Take one unit from a resource cell. An empty cell disappears and becomes plain ground (GDD 6.1). */
export function takeRes(w: World, k: string) {
  const f = res(w, Field)
  const r = f.res.get(k)
  if (!r || r.left <= 0) return false
  if (--r.left <= 0) {
    const [x, y] = unkey(k)
    f.res.delete(k)
    f.terrain.delete(k)
    res(w, GameState).fieldVersion++
    puff(w, x + 0.5, y + 0.5, r.t === 'bush' ? LOOK.bush : LOOK.meadow, 6)
  }
  return true
}

/** Put a seed on an empty own cell: it sprouts, and in SOW.grow s it is a meadow cell or a bush (GDD 6.1). */
export function sowAt(w: World, x: number, y: number, t: ResId) {
  if (!freeCell(w, x, y)) return false
  const f = res(w, Field),
    k = key(x, y)
  f.sprouts.set(k, { t, left: SOW.grow })
  f.terrain.set(k, 'sprout')
  res(w, GameState).fieldVersion++
  puff(w, x + 0.5, y + 0.5, LOOK.sprout, 4)
  return true
}

/** Sprouts grow into resource cells. */
export function sproutSystem(w: World, dt: number) {
  const f = res(w, Field)
  for (const [k, s] of f.sprouts) {
    s.left -= dt
    if (s.left > 0) continue
    f.sprouts.delete(k)
    f.terrain.set(k, s.t)
    const n = s.t === 'meadow' ? SOW.meadow : SOW.bush
    f.res.set(k, { t: s.t, left: n, max: n })
    res(w, GameState).fieldVersion++
  }
}

/** A sheep comes into a station: work on it or let it pass. True when the station took it. */
export function stationTake(m: Building, s: SheepT) {
  if (m.slot) return false
  const def = BUILDINGS[m.type as BuildingId]
  let work = false
  if (def.station === 'shear') work = s.wool >= 0.95
  else if (def.station === 'feed') work = s.wool < 1 && !s.fed && (m.inv.hay ?? 0) >= 1
  else if (def.station === 'dye') work = s.wool >= 0.95 && !s.pink && (m.inv.dye ?? 0) >= 1
  if (work && def.uses) m.inv[def.uses] = (m.inv[def.uses] ?? 0) - 1
  s.state = 'machine'
  m.slot = { sheep: s, pass: !work }
  m.timer = m.total = work ? def.time! : SHEEP.pass
  return true
}

function finishMachine(w: World, m: Building) {
  const def = BUILDINGS[m.type as BuildingId]
  const slot = m.slot!
  if (def.station) {
    const s = slot.sheep!
    m.outs.push({ item: newItem('sheep', s), dir: m.dir })
    if (!slot.pass) {
      m.count++
      if (def.station === 'shear') {
        const kind = s.pink ? 'pwool' : 'wool'
        puff(w, m.x + 1, m.y + 1, s.pink ? LOOK.pinkFleece : LOOK.wool, 8)
        s.wool = 0
        s.pink = false
        for (let i = 0; i < 2; i++) m.outs.push({ item: newItem(kind), dir: ((m.dir + 1) % 4) as 0 | 1 | 2 | 3 })
      } else if (def.station === 'feed') s.fed = true
      else {
        s.pink = true
        puff(w, m.x + 1, m.y + 1, LOOK.pinkFleece, 8)
      }
    }
  } else if (slot.job) {
    m.outs.push({ item: newItem(slot.job.out), dir: m.dir })
    m.count++
  }
  m.slot = null
}

/**
 * One finished output tries to leave. It goes to whatever takes it on an output cell (a belt, a pen, a dock, a
 * machine); a full receiver makes it wait. With nothing there it drops onto a small pile on a free output cell. A sheep
 * with nowhere to go waits beside the station for the player.
 */
function pushOut(w: World, m: Building, o: Building['outs'][number]) {
  const cells = outCells(m).filter((c) => c.d === o.dir)
  if (o.item.sheep) {
    const c = cells[0]!
    const s = o.item.sheep
    if (!(inGrid(c.x, c.y) && get(w, c.x, c.y)) && !pastureAt(w, c.x, c.y)) {
      s.state = 'waiting'
      s.px = Math.min(GRID.cols - 0.3, Math.max(0.3, c.x + 0.5))
      s.py = Math.min(GRID.rows - 0.3, Math.max(0.3, c.y + 0.5))
      s.waitAt = key(m.x, m.y)
      m.status = 'wait'
      return false
    }
    const ok = tryPush(w, o.item, c.sx, c.sy, o.dir)
    m.status = ok ? '' : 'jam'
    return ok
  }
  let receiver = false
  for (const c of cells) {
    if (!pastureAt(w, c.x, c.y) && !(inGrid(c.x, c.y) && get(w, c.x, c.y))) continue
    receiver = true
    if (tryPush(w, o.item, c.sx, c.sy, o.dir)) {
      m.status = ''
      return true
    }
  }
  if (receiver) {
    m.status = 'jam'
    return false
  }
  // no belt: a pile on one output cell (the same cell while the pile lasts)
  const spot = m.pile.length ? cells.find((c) => c.x === m.pileX && c.y === m.pileY) : cells.find((c) => freeCell(w, c.x, c.y))
  if (spot && m.pile.length < BELT.pileMax && freeCell(w, spot.x, spot.y)) {
    m.pile.push(o.item)
    m.pileX = spot.x
    m.pileY = spot.y
    m.status = ''
    return true
  }
  m.status = 'full'
  return false
}

export function machineSystem(w: World, dt: number) {
  for (const m of res(w, Plant).b.values()) {
    if (!isMachine(m) || m.type === 'dock') continue
    if (m.outs.length) {
      m.outs = m.outs.filter((o) => !pushOut(w, m, o))
      if (m.outs.length) continue
    }
    const def = BUILDINGS[m.type as BuildingId]
    if (def.station) {
      if (m.slot) {
        m.timer -= dt
        if (m.timer <= 0) finishMachine(w, m)
      }
      continue
    }
    if (PRODUCERS.includes(m.type as BuildingId)) {
      m.prog = Math.min(def.time!, m.prog + dt)
      if (m.prog >= def.time!) {
        // the nearest owned cell in reach; nothing left around — it stands still until moved
        const c = reachOf(w, m, def.near!, true)[0]
        if (c && takeRes(w, c.k)) {
          m.prog = 0
          m.outs.push({ item: newItem(def.gives!), dir: m.dir })
          m.count++
          m.status = ''
        } else m.status = 'empty'
      }
      continue
    }
    if (def.sows) {
      const seed = SEED[m.seed ?? 'meadow']
      m.prog = Math.min(def.time!, m.prog + dt)
      if (m.prog < def.time!) continue
      if ((m.inv[seed] ?? 0) < 1) continue
      const c = sowable(w, m)[0]
      if (!c) {
        m.status = 'empty'
        continue
      }
      if (sowAt(w, c.x, c.y, m.seed ?? 'meadow')) {
        m.inv[seed] = (m.inv[seed] ?? 0) - 1
        m.prog = 0
        m.count++
        m.status = ''
      }
      continue
    }
    if (!m.slot) {
      const job = jobsOf(m).find((j) => (Object.entries(j.inp) as [keyof typeof j.inp, number][]).every(([k, n]) => (m.inv[k] ?? 0) >= n))
      if (job) {
        for (const [k, n] of Object.entries(job.inp) as [keyof typeof job.inp, number][]) m.inv[k] = (m.inv[k] ?? 0) - n
        m.slot = { job }
        m.timer = m.total = job.time
      }
    } else {
      m.timer -= dt
      if (m.timer <= 0) finishMachine(w, m)
    }
  }
}

/** Seconds one job (a fleece shorn, a unit gathered, a recipe made, a cell sown) takes. */
export function cycleTime(b: Building) {
  const def = BUILDINGS[b.type as BuildingId]
  return def?.time ?? jobsOf(b)[0]?.time ?? 0
}
/** How far the job in hand has got, 0..1 (0 when idle). */
export function jobProgress(b: Building) {
  const def = BUILDINGS[b.type as BuildingId]
  if (PRODUCERS.includes(b.type as BuildingId) || def?.sows) return def?.time ? b.prog / def.time : 0
  return b.slot && b.total > 0 ? 1 - Math.max(0, b.timer) / b.total : 0
}

/** What a machine is doing, for its popup and its corner dot: [tone, text key, number]. */
export type MachineTone = 'ok' | 'warn' | 'bad'
export function machineState(w: World, b: Building): { tone: MachineTone; text: string; n?: number; item?: string } {
  if (b.type === 'dock') return { tone: 'ok', text: '' }
  const def = BUILDINGS[b.type as BuildingId]
  if (!def) return { tone: 'ok', text: '' }
  if (def.station) {
    if (b.status === 'wait') return { tone: 'bad', text: 'sheepWaits' }
    if (b.status === 'jam' || b.status === 'full') return { tone: 'bad', text: 'outBlocked' }
    if (def.uses && !(b.inv[def.uses] ?? 0)) return { tone: 'warn', text: 'waitsFor', item: def.uses }
    return b.slot ? { tone: 'ok', text: 'working' } : { tone: 'warn', text: 'waitsSheep' }
  }
  if (PRODUCERS.includes(b.type as BuildingId)) {
    if (b.status === 'full' || b.status === 'jam') return { tone: 'bad', text: 'outBlocked' }
    if (b.status === 'empty') return { tone: 'warn', text: 'emptyAround' }
    return { tone: 'ok', text: 'producing', n: reachOf(w, b, def.near!, true).reduce((s, c) => s + c.r.left, 0) }
  }
  if (def.sows) {
    const seed = SEED[b.seed ?? 'meadow']
    if (!(b.inv[seed] ?? 0)) return { tone: 'warn', text: 'waitsFor', item: seed }
    if (b.status === 'empty') return { tone: 'warn', text: 'noRoom' }
    return { tone: 'ok', text: 'working' }
  }
  const jobs = jobsOf(b)
  if (jobs.length) {
    if (b.status === 'full' || b.status === 'jam') return { tone: 'bad', text: 'outBlocked' }
    if (b.slot) return { tone: 'ok', text: 'working' }
    // what it waits for: the first input short in its first job
    const j = jobs.find((q) => Object.keys(q.inp).some((k) => (b.inv[k as keyof typeof b.inv] ?? 0) > 0)) ?? jobs[0]!
    const miss = (Object.entries(j.inp) as [string, number][]).find(([k, n]) => (b.inv[k as keyof typeof b.inv] ?? 0) < n)
    if (!miss) return { tone: 'ok', text: 'working' }
    return { tone: 'warn', text: 'waitsFor', item: miss[0] }
  }
  return { tone: 'ok', text: '' }
}
