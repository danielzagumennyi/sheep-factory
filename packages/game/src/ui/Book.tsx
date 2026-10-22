import { useState, type ReactNode } from 'react'
import { BUILDINGS, KINDS, KIND_ORDER, dimsOf, type BuildingId, type KindId } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { buildPrice, inCells, outCells } from '@/game/grid'
import { buyRecipe } from '@/game/actions/build'
import { GameState, Unlocks, blankBuilding, res } from '@/game/world'
import { barOf, useAppStore } from '@/app/store'
import { useT } from '@/i18n'
import { UI } from '@/i18n/ui'
import { BUILDING_TEXT, KIND_TEXT } from '@/i18n/content'
import { setTool } from './actions'
import { useHudStore } from './hudStore'
import { Icon } from './Icon'
import { KIND_ICON, NEED_ICON, Recipe, recipeOf } from './Hud'

/** The book's shelves: buildings by what they do (the author's «словарь»), then the kinds of sheep. */
const GROUPS: readonly { title: keyof typeof UI; ids: readonly BuildingId[] }[] = [
  { title: 'groupBelts', ids: ['belt', 'splitter', 'merger'] },
  { title: 'groupFlock', ids: ['carrot', 'scare'] },
  { title: 'groupStations', ids: ['shearer', 'wash', 'comb', 'pick'] },
]

/**
 * The book of every building and every kind of sheep, as Tower Factory's build menu (the author): a shelf of tiles on
 * the left, the one under the pointer described on the right — what it does to a sheep, its ways in and out, its size
 * and price, and its recipe (GDD 8): bought here once for coins, any of them at any time, before it can be built. A
 * kind of sheep shows what it needs on its way to the portal and when it starts to come. In a game a click on a bought
 * building builds it, and a number key puts the building under the pointer into that quick-bar slot. The game waits
 * while it is open; B or Esc closes it.
 */
export function Book() {
  const { world } = useGame()
  const { t } = useT()
  const open = useAppStore((s) => s.book)
  const screen = useAppStore((s) => s.screen)
  const saved = useAppStore((s) => s.bar)
  useHudStore((s) => s.tick)
  const [tab, setTab] = useState<'b' | 's'>('b')
  const [pick, setPick] = useState<BuildingId | KindId>('belt')
  const [, bump] = useState(0)
  if (!open) return null
  const un = res(world, Unlocks)
  const inRun = screen === 'run'
  const isOpen = (id: BuildingId) => !inRun || un.unlocked.has(id)
  const bar = barOf(saved, un.unlocked)
  const close = () => useAppStore.getState().setBook(false)
  const hoverB = (id: BuildingId) => {
    setPick(id)
    useAppStore.getState().setBookHover(isOpen(id) ? id : null)
  }
  // a click on a bought building builds it; on one not bought yet, buys its recipe (GDD 8)
  const build = (id: BuildingId) => {
    if (!inRun) return
    if (!un.unlocked.has(id)) {
      buyRecipe(world, id)
      bump((n) => n + 1)
      return
    }
    setTool(world, id)
    close()
  }

  let detail: ReactNode
  if (pick in BUILDINGS) {
    const id = pick as BuildingId,
      def = BUILDINGS[id]
    const probe = blankBuilding(id, 0, 0, 0)
    const [w, h] = dimsOf(id, 0)
    const slot = bar.indexOf(id)
    const coins = res(world, GameState).coins
    detail = (
      <>
        <div className="book__hero">
          <Icon kind={id} size={112} />
        </div>
        <h2>{t(BUILDING_TEXT[id].name)}</h2>
        <p className="book__desc">{t(BUILDING_TEXT[id].desc)}</p>
        <div className="book__recipes">
          <Recipe r={recipeOf(id)} />
        </div>
        <div className="book__facts">
          {id !== 'belt' && <span className="chip chip--in">{t(UI.ins, { n: inCells(world, probe).length })}</span>}
          {id !== 'belt' && <span className="chip chip--out">{t(UI.outs, { n: outCells(probe).length })}</span>}
          <span className="chip">
            {w}×{h}
          </span>
          <span className="chip">
            <Icon kind="coin" size={14} />
            {inRun ? buildPrice(world, id) : def.cost}
          </span>
        </div>
        {!isOpen(id) ? (
          <div className="book__buy">
            <button
              type="button"
              className="btn"
              disabled={coins < def.recipe}
              onClick={() => {
                buyRecipe(world, id)
                bump((n) => n + 1)
              }}
            >
              {t(UI.buyRecipe)} <Icon kind="coin" size={16} />
              {def.recipe}
            </button>
          </div>
        ) : (
          <p className="book__hint">
            {slot >= 0 && <b>{t(UI.onBar, { k: (slot + 1) % 10 })} · </b>}
            {t(inRun ? UI.bookHint : UI.bookHintView)}
          </p>
        )}
      </>
    )
  } else {
    const k = pick as KindId
    // its way to the portal: each station it needs, the shears, the portal
    const steps = [...KINDS[k].needs.map((n) => NEED_ICON[n]), NEED_ICON.shear, NEED_ICON.portal]
    detail = (
      <>
        <div className="book__hero">
          <Icon kind={KIND_ICON[k]} size={112} />
        </div>
        <h2>{t(KIND_TEXT[k])}</h2>
        <div className="book__recipes">
          <span className="recipe">
            {steps.map((s, i) => (
              <span key={s} className="recipe__part">
                {i > 0 && <span className="recipe__arr">→</span>}
                <Icon kind={s} size={26} />
              </span>
            ))}
          </span>
        </div>
        {KINDS[k].at > 0 && (
          <div className="book__facts">
            <span className="chip">
              <Icon kind="shorn" size={14} />
              {t(UI.kindAt, { n: KINDS[k].at })}
            </span>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="book" onClick={close}>
      <div className="panel book__card" onClick={(e) => e.stopPropagation()}>
        <div className="book__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'b'}
            onClick={() => {
              setTab('b')
              setPick('belt')
            }}
          >
            {t(UI.buildings)}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 's'}
            onClick={() => {
              setTab('s')
              setPick('plain')
            }}
          >
            {t(UI.sheep)}
          </button>
          <span className="book__coins">
            <Icon kind="coin" size={16} />
            {res(world, GameState).coins}
          </span>
          <button type="button" className="book__close" aria-label="×" onClick={close}>
            <Icon kind="erase" size={18} />
          </button>
        </div>
        <div className="book__body">
          <div className="book__shelves" onMouseLeave={() => useAppStore.getState().setBookHover(null)}>
            {tab === 'b' ? (
              GROUPS.map((g) => (
                <section key={g.title}>
                  <h4>{t(UI[g.title])}</h4>
                  <div className="book__grid">
                    {g.ids.map((id) => {
                      const slot = bar.indexOf(id)
                      return (
                        <button key={id} type="button" className={'book__tile' + (isOpen(id) ? '' : ' book__tile--locked')} aria-pressed={pick === id} onMouseEnter={() => hoverB(id)} onClick={() => build(id)}>
                          <Icon kind={id} size={52} />
                          {slot >= 0 && <span className="book__key">{(slot + 1) % 10}</span>}
                          {!isOpen(id) && (
                            <span className="book__lock">
                              <Icon kind="coin" size={14} />
                              {BUILDINGS[id].recipe}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))
            ) : (
              <section>
                <div className="book__grid">
                  {KIND_ORDER.map((k) => (
                    <button key={k} type="button" className="book__tile" aria-pressed={pick === k} onMouseEnter={() => setPick(k)}>
                      <Icon kind={KIND_ICON[k]} size={48} />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
          <aside className="book__detail">{detail}</aside>
        </div>
      </div>
    </div>
  )
}
