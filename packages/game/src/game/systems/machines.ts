import { BELT, BUILDINGS, LOOK, PRODUCERS, UPGRADE, type BuildingId } from '../balance'
import { freeCell, get, inGrid, isMachine, jobOf, outCells, pastureAt, speedOf, reachOf } from '../grid'
import { Field, GameState, Plant, key, newItem, puff, res, unkey, type Building, type World } from '../world'
import { tryPush } from './belts'

/**
 * Machines (GDD 4.3). A workshop starts a job when its inputs hold a whole recipe; a producer takes one unit from the
 * nearest owned resource cell in reach every `time` seconds; the shearer cuts the sheep that walks in. A finished
 * output waits until it can leave: onto a belt, into the pasture or a dock, or onto a small pile beside the machine.
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
    puff(w, x + 0.5, y + 0.5, r.t === 'water' ? LOOK.water : r.t === 'bush' ? LOOK.bush : LOOK.meadow, 6)
  }
  return true
}

function finishMachine(w: World, m: Building) {
  if (m.type === 'shearer') {
    const s = m.slot!.sheep!
    m.outs.push({ item: newItem('sheep', s), dir: m.dir })
    if (!m.slot!.pass) {
      s.wool = 0
      m.count++
      puff(w, m.x + 0.5, m.y + 0.5, LOOK.wool, 8)
      for (let i = 0; i < 2; i++) m.outs.push({ item: newItem('wool'), dir: ((m.dir + 1) % 4) as 0 | 1 | 2 | 3 })
    }
  } else {
    m.outs.push({ item: newItem(jobOf(m)!.out), dir: m.dir })
    m.count++
  }
  m.slot = null
}

/**
 * One finished output tries to leave. It goes to whatever takes it on an output cell (a belt, the pasture, a dock, a
 * machine); a full receiver makes it wait. With nothing there it drops onto a small pile on a free output cell. A sheep
 * with nowhere to go waits beside the shearer for the player.
 */
function pushOut(w: World, m: Building, o: Building['outs'][number]) {
  const cells = outCells(m).filter((c) => c.d === o.dir)
  if (o.item.sheep) {
    const c = cells[0]!
    const s = o.item.sheep
    if (!(inGrid(c.x, c.y) && get(w, c.x, c.y)) && !pastureAt(w, c.x, c.y)) {
      s.state = 'waiting'
      s.px = Math.min(31.7, Math.max(0.3, c.x + 0.5))
      s.py = Math.min(19.7, Math.max(0.3, c.y + 0.5))
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
    if (m.type === 'shearer') {
      if (m.slot) {
        m.timer -= dt
        if (m.timer <= 0) finishMachine(w, m)
      }
      continue
    }
    if (PRODUCERS.includes(m.type as BuildingId)) {
      m.prog = Math.min(def.time!, m.prog + dt * speedOf(m))
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
    const job = jobOf(m)
    if (!job) continue
    if (!m.slot) {
      const entries = Object.entries(job.inp) as [keyof typeof job.inp, number][]
      if (entries.every(([k, n]) => (m.inv[k] ?? 0) >= n)) {
        for (const [k, n] of entries) m.inv[k] = (m.inv[k] ?? 0) - n
        m.slot = {}
        m.timer = m.total = job.time / speedOf(m)
      }
    } else {
      m.timer -= dt
      if (m.timer <= 0) finishMachine(w, m)
    }
  }
}

/** Seconds one job (a fleece shorn, a unit gathered, a recipe made) takes at level `lvl` (its own by default). */
export function cycleTime(b: Building, lvl = b.lvl) {
  const def = BUILDINGS[b.type as BuildingId]
  const base = def?.time ?? jobOf(b)?.time ?? 0
  return base / (1 + UPGRADE.speedPerLevel * (lvl - 1))
}
/** How far the job in hand has got, 0..1 (0 when idle). */
export function jobProgress(b: Building) {
  const def = BUILDINGS[b.type as BuildingId]
  if (PRODUCERS.includes(b.type as BuildingId)) return def?.time ? b.prog / def.time : 0
  return b.slot && b.total > 0 ? 1 - Math.max(0, b.timer) / b.total : 0
}

/** What a machine is doing, for its popup and its corner dot: [tone, text key, number]. */
export type MachineTone = 'ok' | 'warn' | 'bad'
export function machineState(w: World, b: Building): { tone: MachineTone; text: string; n?: number; item?: string } {
  if (b.type === 'shearer') {
    if (b.status === 'wait') return { tone: 'bad', text: 'sheepWaits' }
    if (b.status === 'jam' || b.status === 'full') return { tone: 'bad', text: 'outBlocked' }
    return b.slot ? { tone: 'ok', text: 'shearing' } : { tone: 'warn', text: 'waitsSheep' }
  }
  const def = BUILDINGS[b.type as BuildingId]
  if (!def) return { tone: 'ok', text: '' }
  if (PRODUCERS.includes(b.type as BuildingId)) {
    if (b.status === 'full' || b.status === 'jam') return { tone: 'bad', text: 'outBlocked' }
    if (b.status === 'empty') return { tone: 'warn', text: 'emptyAround' }
    return { tone: 'ok', text: 'producing', n: reachOf(w, b, def.near!, true).reduce((s, c) => s + c.r.left, 0) }
  }
  const job = jobOf(b)
  if (job) {
    if (b.status === 'full' || b.status === 'jam') return { tone: 'bad', text: 'outBlocked' }
    if (b.slot) return { tone: 'ok', text: 'working' }
    const miss = (Object.entries(job.inp) as [string, number][]).find(([k, n]) => (b.inv[k as keyof typeof b.inv] ?? 0) < n)
    if (!miss) return { tone: 'ok', text: 'working' }
    return { tone: 'warn', text: 'waitsFor', item: miss[0] }
  }
  return { tone: 'ok', text: '' }
}
