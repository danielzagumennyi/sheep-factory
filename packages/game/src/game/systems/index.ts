import { GameState, Time, Unlocks, isOn, res, type SystemId, type World } from '../world'
import { beltSystem } from './belts'
import { machineSystem, sproutSystem } from './machines'
import { clientSystem } from './village'
import { sheepSystem } from './sheep'
import { landHintSystem } from './unlocks'

/** One fixed step of the simulation, seconds (TDD 3.2). The view interpolates between steps. */
export const FIXED_DT = 1 / 60

/** True while a «Новое» card is up or the player paused: the world stands still. */
export function isFrozen(world: World) {
  return res(world, GameState).speed === 0 || res(world, Unlocks).cardQ.length > 0
}

/**
 * The steps of one fixed step, each under its system's name (world.ts, `SYSTEMS`). The order matters and mirrors the
 * prototype: the market's clients, sheep (they may step onto the exit belt), sprouts, the land hint, items on belts,
 * then machines (they push onto belts that just moved on).
 */
const STEPS: readonly (readonly [SystemId, (w: World, dt: number) => void])[] = [
  ['clients', clientSystem],
  ['sheep', sheepSystem],
  ['sprouts', sproutSystem],
  ['hints', landHintSystem],
  ['belts', beltSystem],
  ['machines', machineSystem],
]

/** Advance the world by one fixed step: every step whose system is on. */
export function stepSimulation(world: World, dt = FIXED_DT) {
  const time = res(world, Time)
  time.t += dt
  time.frame++
  res(world, GameState).clock += dt
  for (const [id, step] of STEPS) if (isOn(world, id)) step(world, dt)
}
