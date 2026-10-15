import type { CardId, MissionId } from './balance'
import { res, Mission, createGameWorld, type World, type WorldOptions } from './world'
import { queueCard } from './systems/unlocks'

/** A world ready to play: `createGameWorld` plus the mission's opening cards. */
export function startWorld(id: MissionId, opts: WorldOptions = {}): World {
  const world = createGameWorld(id, opts)
  for (const c of res(world, Mission).def.cards) queueCard(world, c as CardId)
  return world
}
