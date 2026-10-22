import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { BUILDINGS, SHEEP, SPLIT_RULES, type BuildingId, type CardId, type KindId, type NeedId } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { cycleRule, liftUp, remove } from '@/game/actions/build'
import { cycleTime, jobProgress, machineState } from '@/game/systems/machines'
import { GameState, Plant, Ui, Unlocks, res, type Building, type SplitRule, type SplitRules } from '@/game/world'
import { useAppStore } from '@/app/store'
import { NewGame } from './Title'
import { setSoundOn } from '@/audio'
import { setLang, useT } from '@/i18n'
import { UI } from '@/i18n/ui'
import { BUILDING_TEXT, CARD_TEXT, KIND_TEXT, NEED_TEXT, RULE_TEXT, STATE_TEXT } from '@/i18n/content'
import { setTool } from './actions'
import { useHudStore } from './hudStore'
import { Icon } from './Icon'
import { Book } from './Book'
import { ShearCursor } from './ShearCursor'

/** m:ss of game time (h:mm:ss past an hour). */
export const fmtT = (t: number) => {
  const s = Math.max(0, Math.ceil(t)),
    h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    ss = String(s % 60).padStart(2, '0')
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss
}

/** The icon of a kind of sheep, as the book and the cards show it. */
export const KIND_ICON: Readonly<Record<KindId, string>> = { plain: 'sheep', dirty: 'dirty', tangled: 'tangled', burrs: 'burrs' }
/** The icon of what a sheep needs next: water, a comb, tweezers, the shears, the portal (each one thing, readable small). */
export const NEED_ICON: Readonly<Record<NeedId | 'shear' | 'portal', string>> = { wash: 'water', comb: 'combing', pick: 'tweezers', shear: 'shear', portal: 'portal' }
/** The icon of a splitter's rule: the sheep it lets by. */
const RULE_ICON: Readonly<Record<SplitRule, string | null>> = { any: null, wash: 'dirty', comb: 'tangled', pick: 'burrs', ready: 'sheep', shorn: 'shorn', off: null }

/** "dirty → sheep": what a building does to a sheep, as icons; null for what does nothing to one. */
export function recipeOf(id: BuildingId | CardId): readonly [string, string] | null {
  if (id === 'shearer') return ['sheep', 'shorn']
  if (id === 'wash' || id === 'dirty') return ['dirty', 'sheep']
  if (id === 'comb' || id === 'tangled') return ['tangled', 'sheep']
  if (id === 'pick' || id === 'burrs') return ['burrs', 'sheep']
  if (id === 'shear') return ['sheep', 'shorn']
  return null
}
export function Recipe({ r, size = 22 }: { r: readonly [string, string] | null; size?: number }) {
  if (!r) return null
  return (
    <span className="recipe">
      <Icon kind={r[0]} size={size} />
      <span className="recipe__arr">→</span>
      <Icon kind={r[1]} size={size} />
    </span>
  )
}

export function Hud() {
  return (
    <>
      <TopLeft />
      <TopCenter />
      <TopRight />
      <Bottom />
      <BottomRight />
      <Popup />
      <Book />
      <NewCard />
      <MenuOverlay />
      <ErrorToast />
      <ShearCursor />
    </>
  )
}

/** The coins; the score towards the goal with its bar (GDD 7); the next kind of sheep and how many shorn it waits for. */
function TopLeft() {
  const { t } = useT()
  const coins = useHudStore((s) => s.coins)
  const noMoney = useHudStore((s) => s.noMoney)
  const shorn = useHudStore((s) => s.shorn)
  const goal = useHudStore((s) => s.goal)
  const next = useHudStore((s) => s.nextKind)
  const [shake, setShake] = useState(0)
  const last = useRef(noMoney)
  useEffect(() => {
    if (noMoney !== last.current) {
      last.current = noMoney
      setShake((n) => n + 1)
    }
  }, [noMoney])
  return (
    <div className="ov ov-tl">
      <div key={shake} className={'panel coins' + (shake ? ' coins--short' : '')}>
        <Icon kind="coin" size={22} />
        <span>{coins}</span>
      </div>
      <div className="panel score" title={t(UI.shornTip)}>
        <Icon kind="shorn" size={24} />
        <span>
          <b>{shorn}</b> / {goal}
        </span>
        <span className="score__bar">
          <i style={{ width: Math.min(100, (shorn / Math.max(1, goal)) * 100).toFixed(1) + '%' }} />
        </span>
      </div>
      {next && (
        <div className="panel next" title={t(UI.nextTip)}>
          <Icon kind={KIND_ICON[next.kind]} size={22} />
          <small>{next.left}</small>
        </div>
      )}
    </div>
  )
}

function TopCenter() {
  const { t } = useT()
  const hint = useHudStore((s) => s.hint)
  const speed = useHudStore((s) => s.speed)
  const card = useHudStore((s) => s.card)
  const menuOver = useAppStore((s) => s.menuOver)
  const nudge = useHudStore((s) => s.pauseNudge)
  return (
    <div className="ov ov-top">
      {hint && (
        <div className={'panel goal' + (hint.tone === 'warn' ? ' goal--warn' : '')}>
          <Icon kind={hint.icon} size={20} />
          <span>{t(UI[hint.text as keyof typeof UI])}</span>
        </div>
      )}
      {speed === 0 && !card && !menuOver && (
        <div key={nudge} className={'paused' + (nudge ? ' paused--nudge' : '')}>
          {t(UI.paused)}
        </div>
      )}
    </div>
  )
}

function TopRight() {
  const { world } = useGame()
  const { t } = useT()
  const speed = useHudStore((s) => s.speed)
  const set = (v: number) => {
    res(world, GameState).speed = v
    useHudStore.getState().set({ speed: v })
  }
  return (
    <div className="ov ov-tr">
      <div className="panel speed" role="group">
        {[
          [0, '❚❚'],
          [1, '▶'],
          [2, '▶▶'],
          [4, '▶▶▶'],
        ].map(([v, l]) => (
          <button key={v} type="button" aria-pressed={speed === v} title={v === 0 ? t(UI.pause) : '×' + v} onClick={() => set(v as number)}>
            {l}
          </button>
        ))}
      </div>
      <button type="button" className="ibtn" title={t(UI.menuTip)} onClick={() => useAppStore.getState().openMenu()}>
        ☰
      </button>
    </div>
  )
}

/**
 * The quick bar, as in Tower Factory: ten slots on keys 1–9 and 0, filled with the recipes bought (the book, B — hover a
 * building there and press a key to move it); the clearing tool stands apart, always on X (the author). The book's
 * button stands beside it from the start: the first recipes are bought there.
 */
function Bottom() {
  const { world } = useGame()
  const { t } = useT()
  const tools = useHudStore((s) => s.tools)
  const tool = useHudStore((s) => s.tool)
  const [hover, setHover] = useState<string | null>(null)
  const pick = (id: string) => {
    setTool(world, (tool === id ? 'hand' : id) as never)
    useHudStore.getState().set({ tool: res(world, Ui).tool })
  }
  const tip = hover ?? (tool !== 'hand' ? tool : null)
  const any = tools.some(Boolean)
  return (
    <div className="ov ov-bottom">
      {tip && (
        <div className="panel tip">
          {tip === 'erase' ? (
            <>
              <b>{t(UI.erase)}</b>
              <span className="tip__desc">{t(UI.eraseTip)}</span>
            </>
          ) : (
            <>
              <b>{t(BUILDING_TEXT[tip as BuildingId].name)}</b>
              <Recipe r={recipeOf(tip as BuildingId)} />
              <span className="tip__desc">{t(BUILDING_TEXT[tip as BuildingId].desc)}</span>
              {tip !== 'belt' && <span className="tip__desc">{t(UI.rotateTip)}</span>}
            </>
          )}
        </div>
      )}
      <div className="bar" onMouseLeave={() => setHover(null)}>
        {any && (
          <nav className="panel hotbar">
            {tools.map((s, i) =>
              s ? (
                <button key={i} type="button" className={'slot' + (s.fresh ? ' slot--fresh' : '')} aria-pressed={tool === s.id} onMouseEnter={() => setHover(s.id)} onClick={() => pick(s.id)}>
                  <span className="slot__k">{(i + 1) % 10}</span>
                  <Icon kind={s.id} size={42} />
                  <span className={'slot__p' + (s.short ? ' slot__p--short' : '')}>{s.price}</span>
                </button>
              ) : (
                <span key={i} className="slot slot--empty" onMouseEnter={() => setHover(null)}>
                  <span className="slot__k">{(i + 1) % 10}</span>
                </span>
              ),
            )}
          </nav>
        )}
        {any && (
          <nav className="panel hotbar hotbar--erase">
            <button type="button" className="slot slot--erase" aria-pressed={tool === 'erase'} onMouseEnter={() => setHover('erase')} onClick={() => pick('erase')}>
              <span className="slot__k">X</span>
              <Icon kind="erase" size={30} />
              <span className="slot__p">{t(UI.erase)}</span>
            </button>
          </nav>
        )}
        <button type="button" className="ibtn ibtn--book" title={t(UI.bookTip)} onClick={() => useAppStore.getState().setBook(true)}>
          <Icon kind="book" size={22} />
        </button>
      </div>
    </div>
  )
}

function BottomRight() {
  const { t, lang } = useT()
  const sound = useAppStore((s) => s.sound)
  const grass = useAppStore((s) => s.grass)
  useEffect(() => setSoundOn(sound), [sound])
  return (
    <div className="ov ov-br">
      <button type="button" className="ibtn" aria-pressed={grass} title={t(UI.lawn)} onClick={() => useAppStore.getState().setGrass(!grass)}>
        <Icon kind="grass" size={18} />
      </button>
      <button type="button" className="ibtn ibtn--text" onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}>
        {t(UI.lang)}
      </button>
      <button type="button" className="ibtn" aria-pressed={sound} title={t(UI.sound)} onClick={() => useAppStore.getState().setSound(!sound)}>
        ♪
      </button>
    </div>
  )
}

/** Seconds, short: 6, 2.5, 1.7. */
const secs = (n: number) => String(Math.round(n * 10) / 10)

/** How far the sheep in hand has got (a station's job, a carrot's next sheep), with one sheep's seconds. */
function JobBar({ b }: { b: Building }) {
  const { t } = useT()
  if (!cycleTime(b)) return null
  return (
    <div className="load">
      <div className="load__job" title={t(UI.cycle, { a: secs(cycleTime(b)) })}>
        <span className="load__bar">
          <i style={{ width: Math.round(jobProgress(b) * 100) + '%' }} />
        </span>
        <span className="load__time">⏱ {secs(cycleTime(b))}</span>
      </div>
    </div>
  )
}

/** The popup for the selected building or the portal. */
function Popup() {
  const { world } = useGame()
  const { t } = useT()
  const sel = useHudStore((s) => s.sel)
  const at = useHudStore((s) => s.popAt)
  const shorn = useHudStore((s) => s.shorn)
  const goal = useHudStore((s) => s.goal)
  useHudStore((s) => s.tick)
  const el = useRef<HTMLDivElement>(null)
  // beside what it is for, kept on the screen by its size as drawn, before the frame shows
  useLayoutEffect(() => {
    const e = el.current
    if (!e || !at) return
    e.style.left = Math.max(8, Math.min(window.innerWidth - e.offsetWidth - 16, at.x + 8)) + 'px'
    e.style.top = Math.max(58, Math.min(window.innerHeight - e.offsetHeight - 90, at.y)) + 'px'
  })
  if (!sel || !at) return null
  const b = res(world, Plant).b.get(sel.key)
  if (!b) return null
  const refresh = () => useHudStore.getState().set({ tick: useHudStore.getState().tick + 1, sel: res(world, Ui).sel })
  const st = machineState(world, b)
  const state = st.text && (
    <div className={'pop__st pop__st--' + st.tone}>
      {st.need && <Icon kind={NEED_ICON[st.need]} size={16} />}
      {t(STATE_TEXT[st.text]!, { n: st.n ?? 0, need: st.need ? t(NEED_TEXT[st.need]) : '' })}
    </div>
  )
  let body: ReactNode
  if (b.type === 'dock') {
    // the portal: the score, what a sheep brings, and a sheep stopping it
    body = (
      <>
        <h3>
          <Icon kind="portal" size={22} />
          {t(UI.portal)}
        </h3>
        <div className="pop__rows">
          <div>
            <Icon kind="shorn" size={18} /> {shorn} / {goal}
          </div>
          <div>
            <Icon kind="coin" size={16} /> {t(UI.perSheep, { n: SHEEP.coins })}
          </div>
        </div>
        {state}
      </>
    )
  } else {
    const type = b.type
    body = (
      <>
        <h3>
          <Icon kind={type} size={22} />
          {t(BUILDING_TEXT[type].name)}
        </h3>
        <Recipe r={recipeOf(type)} />
        <div className="pop__st pop__st--plain">{t(BUILDING_TEXT[type].desc)}</div>
        {type === 'splitter' && b.rules && (
          <div className="split">
            {(['l', 'f', 'r'] as (keyof SplitRules)[]).map((k) => {
              const rule = b.rules![k],
                icon = RULE_ICON[rule]
              return (
                <button
                  key={k}
                  type="button"
                  className="rule"
                  title={t(RULE_TEXT[rule])}
                  onClick={() => {
                    cycleRule(world, b, k, SPLIT_RULES)
                    refresh()
                  }}
                >
                  {icon ? <Icon kind={icon} size={18} /> : rule === 'off' ? '✕' : t(RULE_TEXT.any)}
                </button>
              )
            })}
            {['←', '↑', '→'].map((a) => (
              <small key={a}>{a}</small>
            ))}
          </div>
        )}
        {type !== 'belt' && type !== 'merger' && type !== 'splitter' && state}
        {BUILDINGS[type].time !== undefined && <JobBar b={b} />}
        <div className="pop__acts">
          <button
            type="button"
            title={t(UI.move)}
            onClick={() => {
              liftUp(world, b)
              refresh()
            }}
          >
            <Icon kind="move" size={18} />
          </button>
          <button
            type="button"
            title={t(UI.removeTitle)}
            onClick={() => {
              remove(world, b.x, b.y)
              res(world, Ui).sel = null
              refresh()
            }}
          >
            <Icon kind="erase" size={16} />+{b.paid}
          </button>
        </div>
      </>
    )
  }
  return (
    <div ref={el} className="panel pop">
      {body}
    </div>
  )
}

/** The icon of a card: its building, its kind of sheep, the shears, the portal for the win. */
const cardIcon = (c: CardId) => (c === 'shear' ? 'shear' : c === 'win' ? 'portal' : c in KIND_ICON ? KIND_ICON[c as KindId] : c)

/**
 * «Новое»: one new thing, its icon and what it does to a sheep and one sentence. The game waits until it is closed.
 * The win is one too (GDD 7): the goal reached, in what time; play on, or start anew.
 */
function NewCard() {
  const { world } = useGame()
  const { t } = useT()
  const card = useHudStore((s) => s.card)
  const menuOver = useAppStore((s) => s.menuOver)
  if (!card || menuOver) return null
  const c = CARD_TEXT[card]
  const close = () => {
    res(world, Unlocks).cardQ.shift()
    useHudStore.getState().set({ card: res(world, Unlocks).cardQ[0] ?? null })
  }
  const win = card === 'win'
  const kind = card in KIND_TEXT ? (card as KindId) : null
  return (
    <div className="new" onClick={close}>
      <div className={'panel new__card' + (win ? ' new__card--win' : '')} onClick={(e) => e.stopPropagation()}>
        {!win && <span className="new__tag">{t(UI.newTag)}</span>}
        <Icon kind={cardIcon(card)} size={win ? 72 : 52} />
        <h2>{t(c.title)}</h2>
        {kind && <small>{t(KIND_TEXT[kind])}</small>}
        <Recipe r={recipeOf(card)} />
        <p>{win ? t(c.text) + ' ' + t(UI.wonIn, { t: fmtT(res(world, GameState).wonAt) }) : t(c.text)}</p>
        {win ? (
          <div className="menu__acts">
            <button type="button" className="btn" onClick={close}>
              {t(UI.playOn)}
            </button>
            <NewGame className="btn btn--ghost" />
          </div>
        ) : (
          <button type="button" className="btn" onClick={close}>
            {t(UI.gotIt)}
          </button>
        )}
      </div>
    </div>
  )
}

/** The pause menu: the score and the game time, then go on, start anew, or leave for the main menu. */
function MenuOverlay() {
  const { world } = useGame()
  const { t } = useT()
  const menuOver = useAppStore((s) => s.menuOver)
  if (!menuOver) return null
  const app = useAppStore.getState()
  const gs = res(world, GameState)
  return (
    <div className="menu" onClick={() => app.closeMenu()}>
      <div className="panel menu__card menu__card--pause" onClick={(e) => e.stopPropagation()}>
        <div className="result">
          <small className="menu__kicker">❚❚</small>
          <h2>
            <Icon kind="shorn" size={28} /> {gs.shorn} / {useHudStore.getState().goal}
          </h2>
          <div className="result__rows">{fmtT(gs.clock)}</div>
        </div>
        <div className="menu__acts menu__acts--col">
          <button type="button" className="btn" onClick={() => app.closeMenu()}>
            {t(UI.resume)}
          </button>
          <NewGame className="btn btn--ghost" />
          <button type="button" className="btn btn--ghost" onClick={() => app.toTitle()}>
            {t(UI.toTitle)}
          </button>
        </div>
      </div>
    </div>
  )
}

/** A frame that throws must not stop the game: show the message for a few seconds and go on. */
function ErrorToast() {
  const { t } = useT()
  const [msg, setMsg] = useState('')
  useEffect(() => {
    const on = (e: ErrorEvent) => {
      setMsg(String(e.message))
      setTimeout(() => setMsg(''), 6000)
    }
    window.addEventListener('error', on)
    return () => window.removeEventListener('error', on)
  }, [])
  return msg ? <div className="err">{t(UI.error, { m: msg })}</div> : null
}
