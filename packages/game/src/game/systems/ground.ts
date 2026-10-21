import { GRID, PILE } from '../balance'
import { pileAt, pileOk } from '../grid'
import { Field, GameState, emit, key, res, type Item, type World } from '../world'

/** Where goods fall from (a point on the field and its height), for their fall to be seen (FxEvent 'fall'). */
export interface FallFrom {
  x: number
  y: number
  h: number
}

/**
 * Goods on the ground (PILE; the author, 21.10.2026: «весь смысл в том чтобы конвейер перемещал за игрока»): what falls
 * — shorn, given out by a machine with no belt, left from a building taken off, off a belt, bought — lies in a pile on
 * its cell, or the nearest one of own land with room, until the hand carries it. Nothing goes to the stock by itself.
 */

/**
 * Put goods down at (x, y), or as near as there is room on own land, ring by ring out over the whole field. Returns what
 * found no room anywhere (only when all the own land is full).
 */
export function dropNear(w: World, x: number, y: number, items: readonly Item[], from?: FallFrom): Item[] {
  const left = items.filter((it) => it.kind !== 'sheep')
  const n0 = left.length
  x = Math.max(0, Math.min(GRID.cols - 1, x))
  y = Math.max(0, Math.min(GRID.rows - 1, y))
  for (let r = 0; r <= GRID.cols && left.length; r++)
    for (let dy = -r; dy <= r && left.length; dy++)
      for (let dx = -r; dx <= r && left.length; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        left.splice(0, putPile(w, x + dx, y + dy, left, from, n0 - left.length).length)
      }
  return left
}

/**
 * Put goods on one cell's pile, as many as it has room for; returns those put down. With `from`, each is seen falling
 * there from that point (`before` of the same fall already went before them).
 */
export function putPile(w: World, x: number, y: number, items: readonly Item[], from?: FallFrom, before = 0): Item[] {
  if (!pileOk(w, x, y)) return []
  const f = res(w, Field),
    k = key(x, y)
  const pile = f.piles.get(k) ?? []
  const n = Math.max(0, Math.min(items.length, PILE.max - pile.length))
  if (!n) return []
  const put = items.slice(0, n).map((it) => ({ ...it, p: 0, strayT: 0 }))
  f.piles.set(k, [...pile, ...put])
  res(w, GameState).pileVersion++
  if (from) put.forEach((it, i) => it.kind !== 'sheep' && emit(w, { kind: 'fall', x, y, slot: pile.length + i, good: it.kind, fx: from.x, fy: from.y, fh: from.h, n: before + i }))
  return put
}

/** Take up to n goods off a cell's pile (the last put down first). */
export function takePile(w: World, x: number, y: number, n: number = PILE.max): Item[] {
  const pile = pileAt(w, x, y)
  if (!pile?.length || n <= 0) return []
  const got = pile.splice(Math.max(0, pile.length - n))
  if (!pile.length) res(w, Field).piles.delete(key(x, y))
  res(w, GameState).pileVersion++
  return got
}

/** A pile under something new (a building put down on it): it hops to the nearest cell with room. */
export function shiftPile(w: World, x: number, y: number) {
  const pile = pileAt(w, x, y)
  if (!pile) return
  res(w, Field).piles.delete(key(x, y))
  dropNear(w, x, y, pile, { x: x + 0.5, y: y + 0.5, h: 0.1 })
}
