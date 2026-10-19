import { useEffect, useMemo } from 'react'
import { GameContext } from '@/game/GameContext'
import { buildShowcase } from '@/game/showcase'
import { startWorld } from '@/game/start'
import { DEMO, Unlocks, res } from '@/game/world'
import { Scene } from '@/render/Scene'
import { Book } from '@/ui/Book'
import { Title } from '@/ui/Title'

/**
 * The main menu over a big working farm (the author: «главное меню с фоном в виде большой фермы»): the farm of chapter
 * 1 built whole (game/plan.ts), its land kept full and the bot's hand tending it so it never stops, the camera circling.
 * Only to look at (the author: «в демо на главном меню должно быть только визуально»): the world runs with the DEMO
 * systems — no keys or pointer on the field, no grid, no numbers, no sound, no levels.
 */
export function TitleScreen() {
  const { world, hand } = useMemo(() => {
    const w = startWorld({ seed: 5, systems: DEMO })
    const hand = buildShowcase(w, 40)
    res(w, Unlocks).cardQ.length = 0
    return { world: w, hand }
  }, [])
  // the bot's hand keeps tending the farm while the menu is up, so it never jams
  useEffect(() => {
    const t = setInterval(() => hand.act(), 700)
    return () => clearInterval(t)
  }, [hand])
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
