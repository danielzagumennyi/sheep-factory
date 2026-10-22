import { useEffect, useRef, useState } from 'react'
import { HAND, KINDS, LOOK } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { Flock, GameState, Ui, ready, res } from '@/game/world'
import { NEED_ICON } from './Hud'
import { Icon } from './Icon'

/** How long a snip shows, ms: the scissors stay up that long after the last click, though the sheep is shorn by then. */
const SNIP_MS = 200

/**
 * The hand over a fluffy sheep turns into scissors (the author, 21.10.2026: «менял бы курсор на ножницы и анимировать
 * курсор по клику»): the pointer's own arrow hides over the field, the blades follow it, snip shut and open again on
 * every click, and three dots under them fill as the clicks add up (HAND.shearClicks). Over a sheep that isn't ready
 * the scissors are crossed out and beside them stands its to-do list, an icon for each thing its kind needs, the ones
 * done ticked (GDD 3); over a shorn one, the portal it goes to.
 */
export function ShearCursor() {
  const { world } = useGame()
  const el = useRef<HTMLDivElement>(null)
  // what the sheep under the pointer still needs, as icons ('' for a ready one)
  const [needs, setNeeds] = useState('')
  useEffect(() => {
    let shownNeeds = ''
    let x = 0,
      y = 0,
      raf = 0,
      shown = false,
      snipUntil = 0
    const move = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
    }
    const down = (e: PointerEvent) => {
      const n = el.current
      if (!shown || e.button !== 0 || !n || n.classList.contains('shear--no')) return
      // restart the snip, even mid-way through the last one
      n.classList.remove('shear--snip')
      void n.offsetWidth
      n.classList.add('shear--snip')
      snipUntil = performance.now() + SNIP_MS
    }
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const n = el.current
      if (!n) return
      const ui = res(world, Ui),
        h = ui.hover
      const s = h && h.sheep !== null ? res(world, Flock).sheep.find((q) => q.id === h.sheep) : undefined
      const live = !!s && s.state !== 'machine' && ui.tool === 'hand' && !ui.drag && res(world, GameState).speed > 0
      const fluffy = live && s!.wool >= 1
      // what to show beside the pointer: a fluffy sheep's to-do list, its kind's stations, those done ticked (`+`); the
      // portal for a shorn one
      const want = !live ? '' : !fluffy ? 'portal' : KINDS[s!.kind].needs.map((q) => NEED_ICON[q] + (s!.needs.includes(q) ? '' : '+')).join(' ')
      if (want !== shownNeeds) {
        shownNeeds = want
        setNeeds(want)
      }
      n.classList.toggle('shear--no', fluffy && !ready(s!))
      // over a shorn sheep only the portal's icon shows, by the pointer's own arrow
      n.classList.toggle('shear--shorn', live && !fluffy)
      const on = fluffy || (shown && performance.now() < snipUntil)
      if (on !== shown) {
        shown = on
        document.body.classList.toggle('is-shearing', on)
      }
      n.style.display = on || live ? '' : 'none'
      if (!on && !live) return
      n.style.transform = `translate(${x}px, ${y}px)`
      const clicks = fluffy ? s!.clicks : HAND.shearClicks
      n.querySelectorAll('.shear__dots i').forEach((d, i) => d.classList.toggle('on', i < clicks))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerdown', down, true)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down, true)
      document.body.classList.remove('is-shearing')
    }
  }, [world])
  return (
    <div ref={el} className="shear" style={{ display: 'none' }}>
      <svg className="shear__svg" viewBox="0 0 48 64" width="48" height="64">
        {/* each half one lever through the pivot: a blade up one side, its ring down the other, so they open together */}
        <g className="shear__a">
          <path d="M25 31 L32.5 43" stroke={RING} strokeWidth="5" strokeLinecap="round" />
          <circle cx="35" cy="50" r="7" fill="none" stroke={RING} strokeWidth="5" />
          <path d="M24 31 L20.4 6.2 Q22.4 1.6 24.9 5.6 L26.8 30 Z" fill="#eef3f8" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        </g>
        <g className="shear__b">
          <path d="M23 31 L15.5 43" stroke={RING} strokeWidth="5" strokeLinecap="round" />
          <circle cx="13" cy="50" r="7" fill="none" stroke={RING} strokeWidth="5" />
          <path d="M24 31 L27.6 6.2 Q25.6 1.6 23.1 5.6 L21.2 30 Z" fill="#dfe7ef" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        </g>
        <circle cx="24" cy="31" r="2.6" fill={LOOK.coin} stroke={INK} strokeWidth="1.5" />
        {/* crossed out over a sheep that isn't ready */}
        <path className="shear__x" d="M8 10 L40 52" stroke={LOOK.bad} strokeWidth="5" strokeLinecap="round" />
      </svg>
      <span className="shear__dots">
        {Array.from({ length: HAND.shearClicks }, (_, i) => (
          <i key={i} />
        ))}
      </span>
      {needs && (
        <span className="shear__needs">
          {needs.split(' ').map((k, i) => (
            <span key={k + i} className={'shear__need' + (k.endsWith('+') ? ' shear__need--done' : '')}>
              <Icon kind={k.replace('+', '')} size={26} />
            </span>
          ))}
        </span>
      )}
    </div>
  )
}
/** The scissors' outline and the colour of their rings. */
const INK = '#3a3550',
  RING = '#e0607e'
