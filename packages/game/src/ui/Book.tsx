import { useState, type ReactNode } from 'react'
import { BUILDINGS, RECIPES, RECIPE_ORDER, dimsOf, type BuildingId, type ItemId, type RecipeId } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { buildPrice, inCells, outCells } from '@/game/grid'
import { buyPrice, sellPrice } from '@/game/systems/orders'
import { Unlocks, blankBuilding, res } from '@/game/world'
import { barOf, useAppStore } from '@/app/store'
import { useT } from '@/i18n'
import { UI } from '@/i18n/ui'
import { BUILDING_TEXT, ITEM_DESC, ITEM_NAMES } from '@/i18n/content'
import { setTool } from './actions'
import { useHudStore } from './hudStore'
import { Icon } from './Icon'
import { recipeOf } from './Hud'

/** The book's shelves: buildings by what they do, then the goods (the author's «словарь»). */
const GROUPS: readonly { title: keyof typeof UI; ids: readonly BuildingId[] }[] = [
  { title: 'groupBelts', ids: ['belt', 'splitter', 'merger'] },
  { title: 'groupLand', ids: ['mower', 'pump', 'berry', 'barn'] },
  { title: 'groupWool', ids: ['shearer', 'carder', 'spinner', 'felter', 'workshop'] },
]
const GOODS: readonly ItemId[] = ['hay', 'water', 'dye', 'wool', 'roving', 'yarn', 'felt', 'cyarn', 'sweater', 'valenki']

/** A line of goods: n× icon + … → icon. */
function Line({ inp, out }: { inp: readonly (readonly [string, number])[]; out: readonly (readonly [string, number])[] }) {
  const part = (l: readonly (readonly [string, number])[]) =>
    l.map(([k, n], i) => (
      <span key={k + i} className="recipe__part">
        {i > 0 && <span className="recipe__arr">+</span>}
        {n > 1 && n + '×'}
        <Icon kind={k} size={22} />
      </span>
    ))
  return (
    <span className="recipe">
      {part(inp)}
      <span className="recipe__arr">→</span>
      {part(out)}
    </span>
  )
}
const recipeLine = (r: RecipeId) => <Line key={r} inp={Object.entries(RECIPES[r].inp) as [string, number][]} out={[[RECIPES[r].out, 1]]} />

/**
 * The book of every building and good, as Tower Factory's build menu (the author): a shelf of tiles on the left, the one
 * under the pointer described on the right — what it makes, its ways in and out, its size and price; a good's maker and
 * market prices. In a mission a click on an open building builds it, and a number key puts the building under the
 * pointer into that quick-bar slot. The game waits while it is open; B or Esc closes it.
 */
export function Book() {
  const { world } = useGame()
  const { t } = useT()
  const open = useAppStore((s) => s.book)
  const screen = useAppStore((s) => s.screen)
  const saved = useAppStore((s) => s.bar)
  useHudStore((s) => s.tick)
  const [tab, setTab] = useState<'b' | 'g'>('b')
  const [pick, setPick] = useState<BuildingId | ItemId>('belt')
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
  const build = (id: BuildingId) => {
    if (!inRun || !un.unlocked.has(id)) return
    setTool(world, id)
    close()
  }
  const recipes = inRun ? RECIPE_ORDER.filter((r) => un.recipes.has(r)) : RECIPE_ORDER

  let detail: ReactNode
  if (pick in BUILDINGS) {
    const id = pick as BuildingId,
      def = BUILDINGS[id]
    const probe = blankBuilding(id, 0, 0, 0)
    const [w, h] = dimsOf(id, 0)
    const slot = bar.indexOf(id)
    const r = recipeOf(id)
    detail = (
      <>
        <div className="book__hero">
          <Icon kind={id} size={112} />
        </div>
        <h2>{t(BUILDING_TEXT[id].name)}</h2>
        <p className="book__desc">{t(BUILDING_TEXT[id].desc)}</p>
        <div className="book__recipes">{id === 'workshop' ? recipes.map(recipeLine) : r && <Line inp={r[0]} out={r[1]} />}</div>
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
          <p className="book__hint">
            <Icon kind="lock" size={16} /> {t(UI.notOpen)}
          </p>
        ) : (
          <p className="book__hint">
            {slot >= 0 && <b>{t(UI.onBar, { k: (slot + 1) % 10 })} · </b>}
            {t(inRun ? UI.bookHint : UI.bookHintView)}
          </p>
        )}
      </>
    )
  } else {
    const k = pick as ItemId
    const maker = (Object.keys(BUILDINGS) as BuildingId[]).find((b) => BUILDINGS[b].out === k || BUILDINGS[b].gives === k) ?? (RECIPE_ORDER.some((q) => RECIPES[q].out === k) ? 'workshop' : null)
    const how = RECIPE_ORDER.find((q) => RECIPES[q].out === k)
    const made = k === 'wool' ? recipeOf('shearer') : how ? null : maker ? recipeOf(maker) : null
    detail = (
      <>
        <div className="book__hero">
          <Icon kind={k} size={112} />
        </div>
        <h2>{t(ITEM_NAMES[k])}</h2>
        <p className="book__desc">{t(ITEM_DESC[k])}</p>
        <div className="book__recipes">
          {maker && (
            <span className="book__maker">
              <Icon kind={k === 'wool' ? 'shearer' : maker} size={26} />
              {how ? recipeLine(how) : made && <Line inp={made[0]} out={made[1]} />}
            </span>
          )}
        </div>
        <div className="book__facts">
          <span className="chip">{t(UI.marketPrice)}</span>
          {sellPrice(k) > 0 && (
            <span className="chip chip--good">
              +{sellPrice(k)} <Icon kind="coin" size={14} />
            </span>
          )}
          <span className="chip">
            −{buyPrice(k)} <Icon kind="coin" size={14} />
          </span>
        </div>
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
            aria-selected={tab === 'g'}
            onClick={() => {
              setTab('g')
              setPick('hay')
            }}
          >
            {t(UI.goods)}
          </button>
          <button type="button" className="book__close" aria-label="×" onClick={close}>
            <Icon kind="erase" size={18} />
          </button>
        </div>
        <div className="book__body">
          <div className="book__shelves" onMouseLeave={() => useAppStore.getState().setBookHover(null)}>
            {tab === 'b'
              ? GROUPS.map((g) => (
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
                                <Icon kind="lock" size={16} />
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))
              : (
                  <section>
                    <div className="book__grid">
                      {GOODS.map((k) => (
                        <button key={k} type="button" className="book__tile" aria-pressed={pick === k} onMouseEnter={() => setPick(k)}>
                          <Icon kind={k} size={48} />
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
