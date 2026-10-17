import { createGameWorld, type World, type WorldOptions } from './world'
import { startVillage } from './systems/village'

/** A world ready to play: `createGameWorld` plus the village's first level, which opens the shearer with its card. */
export function startWorld(opts: WorldOptions = {}): World {
  const world = createGameWorld(opts)
  startVillage(world)
  return world
}
