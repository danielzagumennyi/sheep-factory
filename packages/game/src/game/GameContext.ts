import { createContext, useContext } from 'react'
import type { World } from './world'

/** The running world, shared by the 3D views, the pointer and the HUD of one mission. */
export const GameContext = createContext<{ world: World } | null>(null)

export function useGame() {
  const g = useContext(GameContext)
  if (!g) throw new Error('useGame outside a running mission')
  return g
}
