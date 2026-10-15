import { useEffect } from 'react'
import { MISSIONS, type MissionId } from '@/game/balance'
import { DEV_PARAMS, useAppStore } from './store'
import { RunScreen } from './RunScreen'
import { TitleScreen } from './TitleScreen'

/** The screen switch: the main menu over a big farm, or a mission. `?m=m5` (dev) goes straight into a mission. */
export function App() {
  const { mission, runId, screen } = useAppStore()
  useEffect(() => {
    const m = DEV_PARAMS.get('m')
    if (m && MISSIONS.some((q) => q.id === m)) useAppStore.getState().start(m as MissionId)
  }, [])
  return screen === 'title' ? <TitleScreen key={runId} /> : <RunScreen key={runId} mission={mission} />
}
