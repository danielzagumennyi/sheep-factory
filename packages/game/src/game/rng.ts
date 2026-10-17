/** A seeded generator that keeps its state where a save can read and set it. */
export interface RngFn {
  (): number
  /** The generator's whole state: the same state gives the same numbers after it (a saved game goes on as it would). */
  state: number
}

/** A small seeded generator (mulberry32): runs, tests and the bot repeat exactly for the same seed. */
export function makeRng(seed: number): RngFn {
  const next = (() => {
    next.state = (next.state + 0x6d2b79f5) >>> 0
    let t = next.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }) as RngFn
  next.state = seed >>> 0 || 1
  return next
}
