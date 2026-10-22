import { createGameWorld, type World, type WorldOptions } from './world'
import { queueCard } from './systems/unlocks'

/** A world ready to play: `createGameWorld` plus the first steps' card — shearing by hand (GDD 8). */
export function startWorld(opts: WorldOptions = {}): World {
  const world = createGameWorld(opts)
  queueCard(world, 'shear')
  return world
}
