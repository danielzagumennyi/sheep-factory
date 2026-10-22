import { BUILDINGS, CARROT, LOOK, STOP, type BuildingId, type NeedId, type StationId } from '../balance'
import { get, inGrid, outCells } from '../grid'
import { Flock, Plant, Time, newItem, puff, ready, res, type Building, type SheepT, type World } from '../world'
import { tryPush } from './belts'
import { toRoam } from './sheep'

/**
 * Stations and carrots (GDD 4.3, 4.5). A station takes only the sheep its job is for — the wash a dirty one, the comb an
 * uncombed one, the picker one with burrs, the shearer a ready one — works on it for its time, and lets it out: onto
 * the belt or into the building at its way out, or, with nothing there, off to roam. Any other sheep stands at its way
 * in (systems/belts.ts), and the sign over the station says what that sheep needs. A carrot puts the nearest fluffy
 * sheep crowding round it onto its way out every BUILDINGS.carrot.time seconds.
 */

/** What a sheep needs next, for a sign and the hand's scissors: its first station, shearing, or — shorn — the portal. */
export function nextFor(s: SheepT): NeedId | 'shear' | 'portal' {
  if (s.wool < 1) return 'portal'
  return s.needs[0] ?? 'shear'
}

/** Is this sheep one for a station's job now? */
export const takesSheep = (st: StationId, s: SheepT) => (st === 'shear' ? ready(s) : s.wool >= 1 && s.needs.includes(st))

/** A sheep comes to a station's way in: it takes it if its job is for it; otherwise the sheep stands there. True when taken. */
export function stationTake(w: World, m: Building, s: SheepT) {
  if (m.slot) return false
  const def = BUILDINGS[m.type as BuildingId]
  if (!takesSheep(def.station!, s)) {
    m.wrong = { sheep: s, t: res(w, Time).t }
    return false
  }
  s.state = 'machine'
  m.slot = { sheep: s }
  m.timer = m.total = def.time!
  return true
}

/** A sheep shorn, by a station or by hand: its fleece bursts into a puff of fluff (GDD 3). */
export function shear(w: World, s: SheepT) {
  s.wool = 0
  s.clicks = 0
  puff(w, s.px, s.py, LOOK.wool, 16)
}

function finish(w: World, m: Building) {
  const st = BUILDINGS[m.type as BuildingId].station!,
    s = m.slot!.sheep
  m.count++
  if (st === 'shear') {
    s.px = m.x + m.w / 2
    s.py = m.y + m.h / 2
    shear(w, s)
  } else {
    s.needs = s.needs.filter((n) => n !== st)
    puff(w, m.x + m.w / 2, m.y + m.h / 2, LOOK.wool, 8)
  }
  m.outs.push({ item: newItem(s), dir: m.dir })
  m.slot = null
}

/**
 * A sheep done tries to leave: into whatever stands at the way out (a belt, a station, the portal) — a full one makes
 * it wait; with nothing there it roams off (the author, 19.10.2026: «просто дальше бегают по всей территории»).
 */
function pushOut(w: World, m: Building, o: Building['outs'][number]) {
  const c = outCells(m).find((q) => q.d === o.dir)!
  if (!(inGrid(c.x, c.y) && get(w, c.x, c.y))) {
    toRoam(w, o.item.sheep, c.x + 0.5, c.y + 0.5)
    return true
  }
  return tryPush(w, o.item, c.sx, c.sy, o.dir)
}

/** A carrot puts out the nearest fluffy sheep crowding round it, if its way out takes one. */
function lureOut(w: World, m: Building) {
  const mx = m.x + m.w / 2,
    my = m.y + m.h / 2,
    r = CARROT.take
  let best: SheepT | null = null,
    bd = r * r
  for (const s of res(w, Flock).sheep) {
    if (s.state !== 'roam' || s.wool < 1 || s.drop !== undefined) continue
    const d = (s.px - mx) ** 2 + (s.py - my) ** 2
    if (d < bd) {
      bd = d
      best = s
    }
  }
  if (!best) return false
  const c = outCells(m)[0]!
  return inGrid(c.x, c.y) && !!get(w, c.x, c.y) && tryPush(w, newItem(best), c.sx, c.sy, c.d)
}

export function machineSystem(w: World, dt: number) {
  for (const m of res(w, Plant).b.values()) {
    if (m.type === 'dock') continue
    const def = BUILDINGS[m.type as BuildingId]
    if (def.station) {
      if (m.outs.length) {
        m.outs = m.outs.filter((o) => !pushOut(w, m, o))
        if (m.outs.length) continue
      }
      if (m.slot) {
        m.timer -= dt
        if (m.timer <= 0) finish(w, m)
      }
    } else if (def.lure) {
      m.prog = Math.min(def.time!, m.prog + dt)
      if (m.prog >= def.time! && lureOut(w, m)) {
        m.prog = 0
        m.count++
      }
    }
  }
}

/** Seconds one job (a sheep worked on, put out) takes. */
export function cycleTime(b: Building) {
  return b.type === 'dock' ? 0 : (BUILDINGS[b.type as BuildingId]?.time ?? 0)
}
/** How far the job in hand has got, 0..1 (0 when idle). */
export function jobProgress(b: Building) {
  if (b.type === 'dock') return 0
  const def = BUILDINGS[b.type as BuildingId]
  if (def.lure) return def.time ? b.prog / def.time : 0
  return b.slot && b.total > 0 ? 1 - Math.max(0, b.timer) / b.total : 0
}

/** A wrong sheep stood at the building's way in just now: the sign over it (GDD 4.3). */
export function wrongNow(w: World, b: Building) {
  return !!b.wrong && res(w, Time).t - b.wrong.t < STOP.hold ? b.wrong.sheep : null
}

/** What a building is doing, for its popup and its sign: [tone, text key, and what the wrong sheep needs]. */
export type MachineTone = 'ok' | 'warn' | 'bad'
export function machineState(w: World, b: Building): { tone: MachineTone; text: string; need?: NeedId | 'shear' | 'portal'; n?: number } {
  const wrong = wrongNow(w, b)
  if (wrong) return { tone: 'bad', text: 'wrongSheep', need: nextFor(wrong) }
  if (b.type === 'dock') return { tone: 'ok', text: '' }
  const def = BUILDINGS[b.type as BuildingId]
  if (def.station) {
    if (b.outs.length) return { tone: 'bad', text: 'outBlocked' }
    return b.slot ? { tone: 'ok', text: 'working' } : { tone: 'warn', text: 'waitsSheep' }
  }
  if (def.lure) {
    const mx = b.x + b.w / 2,
      my = b.y + b.h / 2
    let n = 0
    for (const s of res(w, Flock).sheep) if (s.state === 'roam' && s.wool >= 1 && s.drop === undefined && (s.px - mx) ** 2 + (s.py - my) ** 2 <= CARROT.radius * CARROT.radius) n++
    return { tone: n ? 'ok' : 'warn', text: 'nearSheep', n }
  }
  return { tone: 'ok', text: '' }
}
