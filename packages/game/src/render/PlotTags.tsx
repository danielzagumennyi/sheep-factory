import { useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { GRID } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { plotAdjacent, plotPrice } from '@/game/grid'
import { Field, GameState, key, res } from '@/game/world'
import { Icon } from '@/ui/Icon'

interface Tag {
  px: number
  py: number
  price: number
  adj: boolean
}

/** A price tag on every plot for sale, on its near (south) edge; a lock on the ones that need a neighbour first. */
export function PlotTags() {
  const { world } = useGame()
  const [tags, setTags] = useState<Tag[]>([])
  const [sig, setSig] = useState('')
  useFrame(() => {
    const f = res(world, Field),
      gs = res(world, GameState)
    const out: Tag[] = []
    for (let py = 0; py * GRID.plotH < GRID.roadY; py++)
      for (let px = 0; px * GRID.plotW < GRID.cols; px++) {
        if (f.plots.has(key(px, py))) continue
        const price = plotPrice(world, px, py)
        if (price) out.push({ px, py, price, adj: plotAdjacent(world, px, py) })
      }
    const s = out.map((t) => t.px + ',' + t.py + ':' + t.price + (t.adj ? 'a' : '')).join(';') + ':' + (gs.coins > 0)
    if (s !== sig) {
      setSig(s)
      setTags(out)
    }
  })
  const coins = res(world, GameState).coins
  return (
    <group>
      {tags.map((t) => (
        <Html key={t.px + ',' + t.py} position={[(t.px + 0.5) * GRID.plotW, 0.3, (t.py + 1) * GRID.plotH - 0.5]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
          <span className={'tag tag--plot' + (t.adj ? '' : ' tag--locked') + (t.adj && coins < t.price ? ' tag--short' : '')}>
            <Icon kind={t.adj ? 'coin' : 'lock'} size={14} />
            {t.price}
          </span>
        </Html>
      ))}
    </group>
  )
}
