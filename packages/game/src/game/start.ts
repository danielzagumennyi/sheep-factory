import { createGameWorld, type World, type WorldOptions } from './world'
import { openEverything, startVillage } from './systems/village'

/**
 * A world ready to play: `createGameWorld` plus the village's first level, which opens the shearer with its card; in
 * the endless mode (`endless`) everything is open first and no card comes.
 */
export function startWorld(opts: WorldOptions & { endless?: boolean } = {}): World {
  const world = createGameWorld(opts)
  if (opts.endless) openEverything(world)
  startVillage(world)
  return world
}
