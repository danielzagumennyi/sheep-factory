import { GameState, Time, Unlocks, isOn, res, type SystemId, type World } from '../world'
import { arriveSystem } from './arrive'
import { beltSystem } from './belts'
import { machineSystem } from './machines'
import { goalSystem } from './portal'
import { sheepSystem } from './sheep'

/** One fixed step of the simulation, seconds (TDD 3.2). The view interpolates between steps. */
export const FIXED_DT = 1 / 60

/** True while a «Новое» card is up or the player paused: the world stands still. */
export function isFrozen(world: World) {
  return res(world, GameState).speed === 0 || res(world, Unlocks).cardQ.length > 0
}

/**
 * The steps of one fixed step, each under its system's name (world.ts, `SYSTEMS`): arrivals, the sheep's walks, sheep on
 * belts (the portal takes the shorn), stations and carrots (they push onto belts that just moved on), the goal.
 */
const STEPS: readonly (readonly [SystemId, (w: World, dt: number) => void])[] = [
  ['arrive', arriveSystem],
  ['sheep', sheepSystem],
  ['belts', beltSystem],
  ['machines', machineSystem],
  ['goal', goalSystem],
]

/** Advance the world by one fixed step: every step whose system is on. */
export function stepSimulation(world: World, dt = FIXED_DT) {
  const time = res(world, Time)
  time.t += dt
  time.frame++
  res(world, GameState).clock += dt
  for (const [id, step] of STEPS) if (isOn(world, id)) step(world, dt)
}
