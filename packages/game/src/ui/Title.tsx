import { useMemo, useState } from 'react'
import { savedInfo } from '@/app/saves'
import { useAppStore } from '@/app/store'
import { setLang, useT } from '@/i18n'
import { UI } from '@/i18n/ui'
import { Icon } from './Icon'

/**
 * The main menu, as Tower Factory's (the author): a tall panel on the left with the name and its lines — play, the
 * book, settings — over a big farm that works behind it, the camera circling slowly (TitleScreen). With a game kept
 * (app/saves.ts) play is «Продолжить» with its level, and «Новая игра» asks once more before it takes that game's place.
 */
export function Title() {
  const { t, lang } = useT()
  const sound = useAppStore((s) => s.sound)
  const grass = useAppStore((s) => s.grass)
  // settings open beside the column as a tab; the book opens over all; play starts the game
  const [panel, setPanel] = useState<'none' | 'settings'>('none')
  const saved = useMemo(() => savedInfo(), [])
  const app = useAppStore.getState()
  return (
    <div className="title-ui">
      <aside className="title-side">
        <div className="title-logo">
          <Icon kind="sheep" size={86} />
          <h1>
            {t(UI.title1)}
            <span>{t(UI.title2)}</span>
          </h1>
        </div>
        <nav className="title-nav">
          {saved ? (
            <>
              <button type="button" className="title-btn title-btn--main" onClick={() => app.cont()}>
                {t(UI.resume)}
                <small>{t(UI.levelShort, { n: saved.level + 1 })}</small>
              </button>
              <NewGame className="title-btn" />
            </>
          ) : (
            <button type="button" className="title-btn title-btn--main" onClick={() => app.start()}>
              {t(UI.play)}
            </button>
          )}
          <button type="button" className="title-btn" onClick={() => app.setBook(true)}>
            {t(UI.book)}
          </button>
          <button type="button" className="title-btn" aria-pressed={panel === 'settings'} onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')}>
            {t(UI.settings)}
          </button>
        </nav>
      </aside>
      {panel === 'settings' && (
        <div className="panel title-panel title-settings">
          <h3>{t(UI.settings)}</h3>
          <button type="button" className="mode" aria-pressed={sound} onClick={() => app.setSound(!sound)}>
            <span>♪</span>
            <b>{t(UI.soundOn)}</b>
            <span className="mode__stars">{sound ? '✓' : '—'}</span>
          </button>
          <button type="button" className="mode" aria-pressed={grass} onClick={() => app.setGrass(!grass)}>
            <Icon kind="grass" size={18} />
            <b>{t(UI.lawn)}</b>
            <span className="mode__stars">{grass ? '✓' : '—'}</span>
          </button>
          <button type="button" className="mode" onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}>
            <span>Aa</span>
            <b>{t(UI.lang)}</b>
            <span />
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * «Новая игра» where a game is kept: the first press asks «Точно заново?», the second starts anew (the pointer leaving
 * the button takes the question back).
 */
export function NewGame({ className }: { className: string }) {
  const { t } = useT()
  const [sure, setSure] = useState(false)
  return (
    <button type="button" className={className + (sure ? ' btn--sure' : '')} onClick={() => (sure ? useAppStore.getState().start() : setSure(true))} onPointerLeave={() => setSure(false)}>
      {t(sure ? UI.sure : UI.newGame)}
    </button>
  )
}
