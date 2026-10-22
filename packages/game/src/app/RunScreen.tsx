import { useEffect, useMemo } from 'react'
import { SAVE } from '@/game/balance'
import { GameContext } from '@/game/GameContext'
import { startWorld } from '@/game/start'
import { Scene } from '@/render/Scene'
import { Hud } from '@/ui/Hud'
import { loadSaved, writeSave } from './saves'
import { useAppStore } from './store'

/**
 * The game: its world, the 3D field and the HUD over it. «Again» remounts this with a fresh world, «Продолжить» with
 * the kept one. The game is kept as it goes: at once (a new game takes the old one's place), every few seconds, when the
 * page is hidden or closed, and when it is left for the main menu.
 */
export function RunScreen() {
  const world = useMemo(() => {
    const app = useAppStore.getState()
    return (app.from === 'save' && loadSaved({})) || startWorld({ seed: (Date.now() & 0xffff) + 1 })
  }, [])
  useEffect(() => {
    const keep = () => writeSave(world)
    const hidden = () => {
      if (document.visibilityState === 'hidden') keep()
    }
    keep()
    const t = setInterval(keep, SAVE.everySec * 1000)
    document.addEventListener('visibilitychange', hidden)
    globalThis.addEventListener('pagehide', keep)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', hidden)
      globalThis.removeEventListener('pagehide', keep)
      keep()
      world.destroy()
    }
  }, [world])
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
