import { useState } from 'react'
import { useAppStore } from '@/app/store'
import { setLang, useT } from '@/i18n'
import { UI } from '@/i18n/ui'
import { MissionList } from './Hud'
import { Icon } from './Icon'

/**
 * The main menu, as Tower Factory's (the author): a tall panel on the left with the name and three lines — play (the
 * campaign: every mission, the next one marked; one way in, not two), the book, settings — over a big farm that works
 * behind it, the camera circling slowly (TitleScreen).
 */
export function Title() {
  const { t, lang } = useT()
  const sound = useAppStore((s) => s.sound)
  const grass = useAppStore((s) => s.grass)
  // the column works as tabs: play (the campaign, shown first) or settings stays open beside it; the book opens over all
  const [panel, setPanel] = useState<'missions' | 'settings'>('missions')
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
          <button type="button" className="title-btn title-btn--main" aria-pressed={panel === 'missions'} onClick={() => setPanel('missions')}>
            {t(UI.play)}
          </button>
          <button type="button" className="title-btn" onClick={() => app.setBook(true)}>
            {t(UI.book)}
          </button>
          <button type="button" className="title-btn" aria-pressed={panel === 'settings'} onClick={() => setPanel('settings')}>
            {t(UI.settings)}
          </button>
        </nav>
      </aside>
      {panel === 'missions' && (
        <div className="panel title-panel">
          <h3>{t(UI.missions)}</h3>
          <MissionList />
        </div>
      )}
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
