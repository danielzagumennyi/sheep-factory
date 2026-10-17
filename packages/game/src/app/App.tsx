import { DEV_PARAMS, useAppStore } from './store'
import { RunScreen } from './RunScreen'
import { TitleScreen } from './TitleScreen'

// `?play` (dev) starts the game before the first frame, so the main menu's farm never comes up behind it
if (DEV_PARAMS.has('play')) useAppStore.getState().start()

/** The screen switch: the main menu over a big farm, or the long game. */
export function App() {
  const { runId, screen } = useAppStore()
  return screen === 'title' ? <TitleScreen key={runId} /> : <RunScreen key={runId} />
}
