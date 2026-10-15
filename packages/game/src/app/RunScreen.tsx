import { useEffect, useMemo } from 'react'
import type { MissionId } from '@/game/balance'
import { GameContext } from '@/game/GameContext'
import { startWorld } from '@/game/start'
import { Scene } from '@/render/Scene'
import { Hud } from '@/ui/Hud'
import { useAppStore } from './store'

/** One mission: its world, the 3D field and the HUD over it. A restart remounts this with a fresh world. */
export function RunScreen({ mission }: { mission: MissionId }) {
  const world = useMemo(() => startWorld(mission, { seed: (Date.now() & 0xffff) + 1, seenEver: useAppStore.getState().seenEver }), [mission])
  useEffect(() => () => world.destroy(), [world])
  const ctx = useMemo(() => ({ world }), [world])
  return (
    <GameContext.Provider value={ctx}>
      <div className="play">
        <Scene />
        <Hud />
      </div>
    </GameContext.Provider>
  )
}
