import { Ui, Unlocks, res, type Tool, type World } from '@/game/world'
import type { BuildingId } from '@/game/balance'
import { putBack } from '@/game/actions/build'

/** Pick a tool (the hotbar, a number key, Esc). Picking a building stops its hotbar glow; a move under way is called off. */
export function setTool(world: World, t: Tool) {
  const ui = res(world, Ui)
  // a building being moved goes back where it stood
  putBack(world)
  ui.tool = t
  ui.pending = null
  if (t !== 'hand' && t !== 'erase') res(world, Unlocks).fresh.delete(t as BuildingId)
  if (t !== 'hand') ui.sel = null
}
