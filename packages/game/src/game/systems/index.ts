import { GameState, Time, Unlocks, res, type World } from '../world'
import { beltSystem } from './belts'
import { machineSystem } from './machines'
import { resultSystem, truckSystem } from './orders'
import { sheepSystem } from './sheep'
import { landHintSystem } from './unlocks'

/** One fixed step of the simulation, seconds (TDD 3.2). The view interpolates between steps. */
export const FIXED_DT = 1 / 60

/** True while a «Новое» card is up or the player paused: the world stands still. */
export function isFrozen(world: World) {
  return res(world, GameState).speed === 0 || res(world, Unlocks).cardQ.length > 0
}

/**
 * Advance the world by one fixed step. The order matters and mirrors the prototype: trucks, sheep (they may step onto
 * the exit belt), the land hint, items on belts, then machines (they push onto belts that just moved on).
 */
export function stepSimulation(world: World, dt = FIXED_DT) {
  const time = res(world, Time)
  time.t += dt
  time.frame++
  const gs = res(world, GameState)
  if (gs.finished) {
    resultSystem(world, dt)
    return
  }
  gs.clock += dt
  truckSystem(world, dt)
  sheepSystem(world, dt)
  landHintSystem(world, dt)
  beltSystem(world, dt)
  machineSystem(world, dt)
}
