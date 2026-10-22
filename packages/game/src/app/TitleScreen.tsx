import { useEffect, useMemo } from 'react'
import { GameContext } from '@/game/GameContext'
import { buildShowcase } from '@/game/showcase'
import { startWorld } from '@/game/start'
import { DEMO, Unlocks, res } from '@/game/world'
import { Scene } from '@/render/Scene'
import { Book } from '@/ui/Book'
import { Title } from '@/ui/Title'

/**
 * The main menu over a big working factory (the author: «главное меню с фоном в виде большой фермы»): a line from each
 * of the portal's ways in (game/showcase.ts), the flock round it, the camera circling. Only to look at (the author: «в
 * демо на главном меню должно быть только визуально»): the world runs with the DEMO systems — no keys or pointer on the
 * field, no grid, no numbers, no sound, no goal. Without the goal no new kinds come, so its lines never stop.
 */
export function TitleScreen() {
  const world = useMemo(() => {
    const w = startWorld({ seed: 5, systems: DEMO })
    buildShowcase(w, 40)
    res(w, Unlocks).cardQ.length = 0
    return w
  }, [])
  useEffect(() => () => world.destroy(), [world])
  const ctx = useMemo(() => ({ world }), [world])
  return (
    <GameContext.Provider value={ctx}>
      <div className="play title">
        <Scene />
        <Title />
        <Book />
      </div>
    </GameContext.Provider>
  )
}
