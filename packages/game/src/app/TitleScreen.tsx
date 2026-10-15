import { useEffect, useMemo } from 'react'
import { GameContext } from '@/game/GameContext'
import { buildShowcase } from '@/game/showcase'
import { startWorld } from '@/game/start'
import { Stock, Unlocks, res } from '@/game/world'
import { Scene } from '@/render/Scene'
import { Book } from '@/ui/Book'
import { Title } from '@/ui/Title'

/**
 * The main menu over a big working farm (the author: «главное меню с фоном в виде большой фермы»): mission 7's map
 * with the showcase factory built and running, the stock kept full so the sheep never wait, the camera circling.
 */
export function TitleScreen() {
  const world = useMemo(() => {
    const w = startWorld('m7', { seed: 5 })
    buildShowcase(w, 40)
    Object.assign(res(w, Stock).n, { hay: 99999, water: 99999 })
    res(w, Unlocks).cardQ.length = 0
    return w
  }, [])
  useEffect(() => () => world.destroy(), [world])
  const ctx = useMemo(() => ({ world }), [world])
  return (
    <GameContext.Provider value={ctx}>
      <div className="play title">
        <Scene title />
        <Title />
        <Book />
      </div>
    </GameContext.Provider>
  )
}
