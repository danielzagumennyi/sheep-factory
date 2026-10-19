import { BATH_YIELD, BELT, BUILDINGS, COLORED, LOOK, PRODUCERS, SEED, SHEAR_YIELD, SHEEP, SOW, STEPS, type BuildingId, type Dir, type ItemId, type ResId, type StationId } from '../balance'
import { freeCell, get, inGrid, isMachine, outCells, pastureAt, reachOf, sowable } from '../grid'
import { Field, GameState, Plant, key, newItem, noMarks, puff, res, unkey, type Building, type SheepT, type World } from '../world'
import { tryPush } from './belts'
import { toRoam } from './sheep'

/**
 * Machines (GDD 4.3). A producer takes one unit from the nearest owned resource cell in reach every `time` seconds; a
 * station works on the sheep that comes in — the salon's stations mark a fluffy one (combed, curled, knitted, felted,
 * coloured), the shearer takes off what grew on it, the feeder feeds a hungry one — and lets any other pass, so the
 * loop never stands; a seeder sows. A finished output waits until it can leave: onto a belt, into a pen or a dock, or
 * onto a small pile beside the machine.
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

/**
 * What shearing a fluffy sheep gives (GDD 5): by how many of the salon's three steps it went through, in any order —
 * wool, thread, yarn, a sweater; felt from the bath whatever else it went through; the coloured good from the dye.
 */
export function shearYield(s: SheepT): [ItemId, number] {
  const m = s.marks
  const [k, n] = m.bath ? BATH_YIELD : SHEAR_YIELD[STEPS.filter((st) => m[st as keyof typeof m]).length]!
  return [m.dye ? (COLORED[k] ?? k) : k, n]
}
/** A sheep's fleece shorn: what it went through is gone with it. */
export function shorn(s: SheepT) {
  s.wool = 0
  s.clicks = 0
  s.marks = noMarks()
}

/** Does a station work on this sheep: one with a fleece it has not marked yet (the dye also needs its dye in). */
function works(m: Building, st: StationId, s: SheepT) {
  if (st === 'shear') return s.wool >= 0.95
  if (st === 'feed') return s.wool < 1 && !s.fed && (m.inv.hay ?? 0) >= 1
  if (s.wool < 0.95) return false
  if (st === 'dye') return !s.marks.dye && (m.inv.dye ?? 0) >= 1
  return !s.marks[st]
}

/** A sheep comes into a station: work on it or let it pass. True when the station took it. */
export function stationTake(m: Building, s: SheepT) {
  if (m.slot) return false
  const def = BUILDINGS[m.type as BuildingId]
  const work = works(m, def.station!, s)
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
      const st = def.station
      if (st === 'shear') {
        const [kind, n] = shearYield(s)
        puff(w, m.x + 1, m.y + 1, fleeceColor(s), 8)
        shorn(s)
        for (let i = 0; i < n; i++) m.outs.push({ item: newItem(kind), dir: ((m.dir + 1) % 4) as Dir })
      } else if (st === 'feed') s.fed = true
      else {
        s.marks[st] = true
        puff(w, m.x + 1, m.y + 1, fleeceColor(s), 8)
      }
    }
  }
  m.slot = null
}

/**
 * One finished output tries to leave. It goes to whatever takes it on an output cell (a belt, a pen, a dock, a
 * machine); a full receiver makes it wait. With nothing there it drops onto a small pile on a free output cell. A sheep
 * with nowhere to go roams off over the own land (the author, 19.10.2026: «просто дальше бегают по всей территории»).
 */
function pushOut(w: World, m: Building, o: Building['outs'][number]) {
  const cells = outCells(m).filter((c) => c.d === o.dir)
  if (o.item.sheep) {
    const c = cells[0]!
    const s = o.item.sheep
    if (!(inGrid(c.x, c.y) && get(w, c.x, c.y)) && !pastureAt(w, c.x, c.y)) {
      toRoam(w, s, c.x + 0.5, c.y + 0.5)
      m.status = ''
      return true
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
    }
  }
}

/** The colour of a sheep's fleece puff: white, or the colour it took at the dye station. */
export const fleeceColor = (s: SheepT) => (s.marks.dye ? LOOK.fleeceColors[s.id % LOOK.fleeceColors.length]! : s.marks.bath ? LOOK.feltFleece : LOOK.wool)

/** Seconds one job (a sheep worked on, a unit gathered, a cell sown) takes. */
export function cycleTime(b: Building) {
  return BUILDINGS[b.type as BuildingId]?.time ?? 0
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
  return { tone: 'ok', text: '' }
}
