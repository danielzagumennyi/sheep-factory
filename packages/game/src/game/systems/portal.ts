import { GOAL, SHEEP } from '../balance'
import { Flock, GameState, Stats, Time, emit, isOn, res, type Building, type Item, type SheepT, type World } from '../world'
import { queueCard } from './unlocks'

/**
 * The portal (GDD 7): the only place a sheep leaves the map, and the only one coins come from. A shorn sheep goes in
 * at one of its ways in — by a belt or from the hand — the score goes up and its coins fly up; a fluffy one may not go
 * in and stands at the way in, the line behind it standing, with the sign «сначала постриги» (GDD 4.3).
 */

/** Coins in. */
export function earn(w: World, n: number) {
  res(w, GameState).coins += n
  res(w, Stats).earned += n
}

/** A sheep handed to the portal at its way in (x, y). True when it went in. */
export function dockAccept(w: World, d: Building, it: Item, x: number, y: number): boolean {
  if (it.sheep.wool > 0) {
    d.wrong = { sheep: it.sheep, t: res(w, Time).t }
    return false
  }
  intoPortal(w, it.sheep, x, y)
  return true
}

/**
 * A shorn sheep goes into the portal at (x, y): off the map, the score and the coins up. With the goal off (the main
 * menu's farm) it only leaves.
 */
export function intoPortal(w: World, s: SheepT, x: number, y: number) {
  const flock = res(w, Flock).sheep,
    i = flock.indexOf(s)
  if (i >= 0) flock.splice(i, 1)
  if (!isOn(w, 'goal')) return
  res(w, GameState).shorn++
  earn(w, SHEEP.coins)
  emit(w, { kind: 'portal', x, y, coins: SHEEP.coins })
}

/** The goal reached (GDD 7): the win, with its card; the game goes on. */
export function goalSystem(w: World) {
  const gs = res(w, GameState)
  if (gs.won || gs.shorn < GOAL.sheep) return
  gs.won = true
  gs.wonAt = gs.clock
  queueCard(w, 'win')
}
