import type { ReactNode } from 'react'
import { iconUrl, isRendered } from './iconKinds'
import { LOOK } from '@/game/balance'

// outlines follow the text colour, so icons read on light and dark panels alike
const INK = 'currentColor'
const S = { stroke: INK, strokeWidth: 1.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

/** The few icons still drawn — the clearing cross, the book, the move arrows, the lock, the lawn switch — in a 24×24 box. */
const ICONS: Readonly<Record<string, ReactNode>> = {
  erase: <path d="M6 6l12 12M18 6L6 18" fill="none" stroke={LOOK.bad} strokeWidth={2.6} strokeLinecap="round" />,
  book: (
    <g {...S} strokeWidth={1.6}>
      <path d="M12 6.5c-2.2-1.6-5-2-8-1.6v12.6c3-.4 5.8 0 8 1.6 2.2-1.6 5-2 8-1.6V4.9c-3-.4-5.8 0-8 1.6z" fill="#f2d9a8" />
      <path d="M12 6.5v12.6" fill="none" />
    </g>
  ),
  move: (
    <g {...S} fill="none" strokeWidth={2}>
      <path d="M12 3v18M3 12h18" />
      <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </g>
  ),
  lock: (
    <g {...S} fill="none" stroke="#5a6a81">
      <path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11" />
      <rect x="6.5" y="11" width="11" height="8" rx="2" fill="#5a6a81" />
    </g>
  ),
  grass: (
    <g {...S}>
      <path d="M4 19c2-4 2.5-8 2-11 2 3 2.5 7 2 11M9.5 19c1-5 2.5-9 5-12-1 4-1.5 8-1.5 12M14 19c1.5-3.5 3.5-6 6-7-2 2-3 4.5-3.5 7" fill="#9fd36a" />
      <path d="M3 19.5h18" fill="none" />
    </g>
  ),
}

export function Icon({ kind, size = 20 }: { kind: string; size?: number }) {
  // buildings, goods, resources, the sheep and the coin are pictures drawn from their 3D models (iconKinds.ts)
  if (isRendered(kind)) return <img className="ico ico--3d" src={iconUrl(kind)} width={size} height={size} alt="" draggable={false} />
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[kind] ?? <circle cx="12" cy="12" r="6" fill="#ccc" />}
    </svg>
  )
}
