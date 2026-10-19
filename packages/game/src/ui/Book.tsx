import { useState, type ReactNode } from 'react'
import { BUILDINGS, RECIPES, RECIPE_ORDER, SEED, dimsOf, type BuildingId, type Job, type ItemId, type RecipeId } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { buildPrice, inCells, outCells } from '@/game/grid'
import { buyPrice, sellPrice } from '@/game/systems/village'
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
  { title: 'groupSheep', ids: ['pen', 'sheep', 'shearer', 'feeder', 'dyer'] },
  { title: 'groupLand', ids: ['mower', 'berry', 'sow', 'seeder'] },
  { title: 'groupWool', ids: ['carder', 'spinner', 'felter', 'workshop'] },
]
const GOODS: readonly ItemId[] = ['hay', 'dye', 'wool', 'pwool', 'roving', 'proving', 'yarn', 'pyarn', 'felt', 'sweater', 'valenki']

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
const jobLine = (j: Job) => <Line key={j.out} inp={Object.entries(j.inp) as [string, number][]} out={[[j.out, 1]]} />
const recipeLine = (r: RecipeId) => jobLine(RECIPES[r])

/** Who makes a good: a station on the loop, a producer, a machine's job, or the workshop's recipe. */
function makerOf(k: ItemId): { by: BuildingId; job?: Job } | null {
  if (k === 'wool') return { by: 'shearer' }
  if (k === 'pwool') return { by: 'dyer' }
  for (const b of Object.keys(BUILDINGS) as BuildingId[]) {
    const d = BUILDINGS[b]
    if (d.gives === k) return { by: b }
    const job = d.jobs?.find((j) => j.out === k)
    if (job) return { by: b, job }
  }
  const r = RECIPE_ORDER.find((q) => RECIPES[q].out === k)
  return r ? { by: 'workshop', job: RECIPES[r] } : null
}

/**
 * The book of every building and good, as Tower Factory's build menu (the author): a shelf of tiles on the left, the one
 * under the pointer described on the right — what it makes, its ways in and out, its size and price; a good's maker and
 * market prices. In a game a click on an open building builds it, and a number key puts the building under the
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
    // a pen and the sowing hand have no belt ways to count
    const plain = id !== 'belt' && id !== 'pen' && id !== 'sow' && id !== 'sheep'
    detail = (
      <>
        <div className="book__hero">
          <Icon kind={id} size={112} />
        </div>
        <h2>{t(BUILDING_TEXT[id].name)}</h2>
        <p className="book__desc">{t(BUILDING_TEXT[id].desc)}</p>
        <div className="book__recipes">
          {id === 'workshop' ? recipes.map(recipeLine) : def.jobs && def.jobs.length > 1 ? def.jobs.map(jobLine) : r && <Line inp={r[0]} out={r[1]} />}
          {(id === 'sow' || id === 'seeder') && <Line inp={[[SEED.bush, 1]]} out={[['bush', 1]]} />}
        </div>
        <div className="book__facts">
          {plain && <span className="chip chip--in">{t(UI.ins, { n: inCells(world, probe).length })}</span>}
          {plain && <span className="chip chip--out">{t(UI.outs, { n: outCells(probe).length })}</span>}
          {id !== 'sow' && id !== 'sheep' && (
            <span className="chip">
              {w}×{h}
            </span>
          )}
          {id !== 'sow' && (
            <span className="chip">
              <Icon kind="coin" size={14} />
              {inRun ? buildPrice(world, id) : def.cost}
            </span>
          )}
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
    const maker = makerOf(k)
    const made = maker && !maker.job ? recipeOf(maker.by) : null
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
              <Icon kind={maker.by} size={26} />
              {maker.job ? jobLine(maker.job) : made && <Line inp={made[0]} out={made[1]} />}
            </span>
          )}
        </div>
        <div className="book__facts">
          <span className="chip">{t(UI.marketPrice)}</span>
          <span className="chip chip--good">
            +{sellPrice(k)} <Icon kind="coin" size={14} />
          </span>
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
