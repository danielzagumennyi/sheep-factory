import { useMemo, useState } from 'react'
import { savedInfo, type Mode } from '@/app/saves'
import { useAppStore } from '@/app/store'
import { setLang, useT } from '@/i18n'
import { UI } from '@/i18n/ui'
import { Icon } from './Icon'

/**
 * The main menu, as Tower Factory's (the author): a tall panel on the left with the name and its lines — play, the
 * book, settings — over a big farm that works behind it, the camera circling slowly (TitleScreen). With a game kept
 * (app/saves.ts) play is «Продолжить» with its level, and «Новая игра» asks once more before it takes that game's place.
 * The endless mode has its own line and its own kept game, shown with its level.
 */
export function Title() {
  const { t, lang } = useT()
  const sound = useAppStore((s) => s.sound)
  const grass = useAppStore((s) => s.grass)
  // settings open beside the column as a tab; the book opens over all; play starts the game
  const [panel, setPanel] = useState<'none' | 'settings'>('none')
  const saved = useMemo(() => savedInfo('story'), [])
  const endless = useMemo(() => savedInfo('endless'), [])
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
              <button type="button" className="title-btn title-btn--main" onClick={() => app.cont('story')}>
                {t(UI.resume)}
                <small>{t(UI.levelShort, { n: saved.level + 1 })}</small>
              </button>
              <NewGame className="title-btn" mode="story" />
            </>
          ) : (
            <button type="button" className="title-btn title-btn--main" onClick={() => app.start('story')}>
              {t(UI.play)}
            </button>
          )}
          {/* the endless mode goes on with its own kept game, if there is one; it starts anew from its pause menu */}
          <button type="button" className="title-btn" onClick={() => (endless ? app.cont('endless') : app.start('endless'))}>
            {t(UI.endless)}
            {endless && <small>{t(UI.levelShort, { n: endless.level + 1 })}</small>}
          </button>
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
 * the button takes the question back) — in its mode: the long game on the title, the one being played in the pause menu.
 */
export function NewGame({ className, mode }: { className: string; mode?: Mode }) {
  const { t } = useT()
  const [sure, setSure] = useState(false)
  return (
    <button type="button" className={className + (sure ? ' btn--sure' : '')} onClick={() => (sure ? useAppStore.getState().start(mode) : setSure(true))} onPointerLeave={() => setSure(false)}>
      {t(sure ? UI.sure : UI.newGame)}
    </button>
  )
}
