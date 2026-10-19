import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BELT, BUILDINGS, MARKET, RECIPES, RECIPE_ORDER, SEED, type BuildingId, type CardId, type ItemId, type RecipeId, type ResId } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { jobOf, jobsOf, plotAdjacent, plotPrice, plotStock, residents } from '@/game/grid'
import { buyPlot, cycleRule, liftUp, remove, setRecipe, setSeed } from '@/game/actions/build'
import { cycleTime, jobProgress, machineState } from '@/game/systems/machines'
import { hungry } from '@/game/systems/sheep'
import { askAt, buy, buyPrice, sell, sellPrice } from '@/game/systems/village'
import { Flock, GameState, Plant, Ui, Unlocks, penOf, res, stockOf, type Building, type SplitRules, type World } from '@/game/world'
import { useAppStore } from '@/app/store'
import { NewGame } from './Title'
import { setSoundOn } from '@/audio'
import { setLang, useT } from '@/i18n'
import { UI } from '@/i18n/ui'
import { BUILDING_TEXT, CARD_TEXT, CLIENT_NAMES, ITEM_NAMES, RES_NAMES, STATE_TEXT } from '@/i18n/content'
import { setTool } from './actions'
import { useHudStore } from './hudStore'
import { Icon } from './Icon'
import { Book } from './Book'

/** m:ss of game time. */
export const fmtT = (t: number) => {
  const s = Math.max(0, Math.ceil(t))
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

type Part = readonly (readonly [string, number])[]
/** "2× wool + dye → yarn" as icons. */
function Recipe({ r }: { r: readonly [Part, Part] | null }) {
  if (!r) return null
  const part = (l: Part) =>
    l.map(([k, n], i) => (
      <span key={k + i} className="recipe__part">
        {i > 0 && <span className="recipe__arr">+</span>}
        {n > 1 && n + '×'}
        <Icon kind={k} size={20} />
      </span>
    ))
  return (
    <span className="recipe">
      {part(r[0])}
      <span className="recipe__arr">→</span>
      {part(r[1])}
    </span>
  )
}
const recipeLine = (r: RecipeId): readonly [Part, Part] => [Object.entries(RECIPES[r].inp) as [string, number][], [[RECIPES[r].out, 1]]]
/** A building's or card's recipe line; a workshop shows the recipe it is set to (or would start with). */
export function recipeOf(id: BuildingId | CardId, recipe?: RecipeId | null): readonly [Part, Part] | null {
  if (id === 'shearer') return [[['sheep', 1]], [['wool', 2]]]
  if (id === 'feeder') return [[['sheep', 1], ['hay', 1]], [['sheep', 1]]]
  if (id === 'dyer') return [[['sheep', 1], ['dye', 1]], [['pwool', 2]]]
  if (id === 'sow' || id === 'seeder') return [[['hay', 1]], [['meadow', 1]]]
  if (id === 'workshop') return recipeLine(recipe ?? 'sweater')
  if (id === 'valenki') return recipeLine('valenki')
  const b = (BUILDINGS as Record<string, (typeof BUILDINGS)[BuildingId]>)[id]
  if (!b) return null
  const j = b.jobs?.[0]
  if (j) return [Object.entries(j.inp) as [string, number][], [[j.out, 1]]]
  if (b.near) return [[[b.near, 1]], [[b.gives!, 1]]]
  return null
}

export function Hud() {
  return (
    <>
      <TopLeft />
      <TopCenter />
      <TopRight />
      <Asks />
      <Bottom />
      <BottomRight />
      <StockPanel />
      <Popup />
      <Book />
      <NewCard />
      <MenuOverlay />
      <ErrorToast />
    </>
  )
}

function TopLeft() {
  const { t } = useT()
  const coins = useHudStore((s) => s.coins)
  const noMoney = useHudStore((s) => s.noMoney)
  const level = useHudStore((s) => s.level)
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
      <div className="panel day" title={t(UI.level, { n: level })}>
        <span>{t(UI.levelShort, { n: level })}</span>
      </div>
    </div>
  )
}

function TopCenter() {
  const { t } = useT()
  const goal = useHudStore((s) => s.goal)
  const speed = useHudStore((s) => s.speed)
  const card = useHudStore((s) => s.card)
  const menuOver = useAppStore((s) => s.menuOver)
  const nudge = useHudStore((s) => s.pauseNudge)
  let text: ReactNode = null
  if (goal) {
    if (goal.text === 'order') {
      const p = goal.params!
      text = (
        <>
          {t(ITEM_NAMES[p.kind as ItemId])}{' '}
          <b>
            {p.have}/{p.total}
          </b>
        </>
      )
    } else text = t(UI[goal.text as keyof typeof UI])
  }
  return (
    <div className="ov ov-top">
      {goal && (
        <div className={'panel goal' + (goal.tone === 'warn' ? ' goal--warn' : '')}>
          <Icon kind={goal.icon} size={20} />
          <span>{text}</span>
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

/** The village's asks for this level: the good, how many of how many, what one pays. All done — the next level opens. */
function Asks() {
  const { t } = useT()
  const asks = useHudStore((s) => s.asks)
  return (
    <div className="ov ov-orders" title={t(UI.asks)}>
      {asks.map((a) => {
        const done = a.have >= a.total
        return (
          <div key={a.id} className={'panel order' + (done ? ' order--done' : '')}>
            <span className="order__who">
              {t(CLIENT_NAMES[a.client])}
              {done ? ' ✓' : ''}
            </span>
            <span className="order__rw">
              +<Icon kind="coin" size={14} />
              {a.price}
            </span>
            <span className="order__need">
              <Icon kind={a.kind} size={22} />
              {a.have} / {a.total}
            </span>
            <span className="order__bar">
              <i style={{ width: (Math.min(1, a.have / a.total) * 100).toFixed(1) + '%' }} />
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** A building's recipes for its tip: a workshop every recipe it knows, a carder or spinner white and pink, others their one line. */
function Recipes({ id }: { id: BuildingId }) {
  const known = useHudStore((s) => s.recipes)
  const recipe = useHudStore((s) => s.recipe)
  const met = useHudStore((s) => s.met)
  if (id === 'workshop' && known.length)
    return (
      <span className="recipes-tip">
        {known.map((r) => (
          <Recipe key={r} r={recipeLine(r)} />
        ))}
      </span>
    )
  // a pink job shows once pink wool is met
  const jobs = (BUILDINGS[id].jobs ?? []).filter((j, i) => i === 0 || Object.keys(j.inp).every((k) => met.includes(k as ItemId)))
  if (jobs.length > 1)
    return (
      <span className="recipes-tip">
        {jobs.map((j) => (
          <Recipe key={j.out} r={[Object.entries(j.inp) as [string, number][], [[j.out, 1]]]} />
        ))}
      </span>
    )
  return <Recipe r={recipeOf(id, recipe)} />
}

/** What is sown (by hand, or by a seeder): hay → a meadow, dye → a bush once bushes are known. */
function SeedPick({ value, set }: { value: ResId; set: (t: ResId) => void }) {
  const met = useHudStore((s) => s.met)
  return (
    <span className="recipes" role="group">
      {(['meadow', 'bush'] as const)
        .filter((t) => t === 'meadow' || met.includes('dye'))
        .map((t) => (
          <button key={t} type="button" className="rule" aria-pressed={value === t} onClick={() => set(t)}>
            <Icon kind={SEED[t]} size={18} />→<Icon kind={t} size={18} />
          </button>
        ))}
    </span>
  )
}

/**
 * The quick bar, as in Tower Factory: ten slots on keys 1–9 and 0, filled from the book (B) — hover a building there
 * and press a key; the clearing tool stands apart, always on X (the author).
 */
function Bottom() {
  const { world } = useGame()
  const { t } = useT()
  const tools = useHudStore((s) => s.tools)
  const tool = useHudStore((s) => s.tool)
  const seed = useHudStore((s) => s.seed)
  const [hover, setHover] = useState<string | null>(null)
  const pick = (id: string) => {
    setTool(world, (tool === id ? 'hand' : id) as never)
    useHudStore.getState().set({ tool: res(world, Ui).tool })
  }
  const tip = hover ?? (tool !== 'hand' ? tool : null)
  if (!tools.some(Boolean)) return null
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
              {tip === 'sow' ? (
                <SeedPick
                  value={seed}
                  set={(v) => {
                    res(world, Ui).seed = v
                    useHudStore.getState().set({ seed: v })
                  }}
                />
              ) : (
                <Recipes id={tip as BuildingId} />
              )}
              <span className="tip__desc">{t(BUILDING_TEXT[tip as BuildingId].desc)}</span>
              {tip !== 'belt' && tip !== 'sow' && tip !== 'sheep' && <span className="tip__desc">{t(UI.rotateTip)}</span>}
            </>
          )}
        </div>
      )}
      <div className="bar" onMouseLeave={() => setHover(null)}>
        <nav className="panel hotbar">
          {tools.map((s, i) =>
            s ? (
              <button key={i} type="button" className={'slot' + (s.fresh ? ' slot--fresh' : '')} aria-pressed={tool === s.id} onMouseEnter={() => setHover(s.id)} onClick={() => pick(s.id)}>
                <span className="slot__k">{(i + 1) % 10}</span>
                <Icon kind={s.id} size={42} />
                {s.id === 'sow' ? (
                  <span className="slot__p">
                    <Icon kind={SEED[seed]} size={14} />
                  </span>
                ) : (
                  <span className={'slot__p' + (s.short ? ' slot__p--short' : '')}>{s.price}</span>
                )}
              </button>
            ) : (
              <span key={i} className="slot slot--empty" onMouseEnter={() => setHover(null)}>
                <span className="slot__k">{(i + 1) % 10}</span>
              </span>
            ),
          )}
        </nav>
        <nav className="panel hotbar hotbar--erase">
          <button type="button" className="slot slot--erase" aria-pressed={tool === 'erase'} onMouseEnter={() => setHover('erase')} onClick={() => pick('erase')}>
            <span className="slot__k">X</span>
            <Icon kind="erase" size={30} />
            <span className="slot__p">{t(UI.erase)}</span>
          </button>
        </nav>
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

/**
 * The stock, which is the hand, bottom left as in Tower Factory (the author): a column of goods with their counts, only
 * those there are.
 */
const STOCK_ORDER: readonly ItemId[] = ['hay', 'dye', 'wool', 'pwool', 'roving', 'proving', 'yarn', 'pyarn', 'felt', 'sweater', 'valenki']
function StockPanel() {
  const { t } = useT()
  const stock = useHudStore((s) => s.stock)
  const list = STOCK_ORDER.filter((k) => (stock[k] ?? 0) > 0)
  return (
    <div className="ov ov-stock">
      <div className="panel stock" title={t(UI.stock)}>
        <Icon kind="stock" size={26} />
        {list.map((k) => (
          <div key={k} className="stock__slot" title={t(ITEM_NAMES[k])}>
            <Icon kind={k} size={30} />
            <b>{stock[k]}</b>
          </div>
        ))}
      </div>
    </div>
  )
}


/** How many to move: a slider from 1 to max, the number beside it. */
function Amount({ n, max, set }: { n: number; max: number; set: (n: number) => void }) {
  return (
    <div className="amount">
      <input type="range" min={1} max={Math.max(1, max)} value={Math.min(n, Math.max(1, max))} onChange={(e) => set(Number(e.target.value))} />
      <b>{Math.min(n, Math.max(1, max))}</b>
    </div>
  )
}

/** The goods the market deals in: those the farm has met, and whatever is in stock. */
function marketGoods(w: World, met: readonly ItemId[]): ItemId[] {
  return STOCK_ORDER.filter((k) => met.includes(k) || stockOf(w, k) > 0)
}

/** The trading post (the author: «как продавать так и покупать»): pick a good, how many, then sell or buy. */
function MarketBody({ refresh }: { refresh: () => void }) {
  const { world } = useGame()
  const { t } = useT()
  const met = useHudStore((s) => s.met)
  const goods = marketGoods(world, met)
  const [pick, setPick] = useState<ItemId>(goods.find((k) => stockOf(world, k) > 0) ?? goods[0] ?? 'wool')
  const [n, setN] = useState(10)
  const coins = res(world, GameState).coins
  const have = stockOf(world, pick),
    sp = sellPrice(pick),
    bp = buyPrice(pick)
  const max = Math.max(have, Math.min(99, Math.floor(coins / bp)), 1)
  const k = Math.min(n, max)
  return (
    <>
      <div className="trade">
        {goods.map((g) => (
          <button key={g} type="button" className="trade__row" aria-pressed={g === pick} title={t(ITEM_NAMES[g])} onClick={() => setPick(g)}>
            <Icon kind={g} size={20} />
            <b>{stockOf(world, g)}</b>
            {/* what one brings when sold, what one costs to buy */}
            <span className="trade__in">+{sellPrice(g) || '—'}</span>
            <span>−{buyPrice(g)}</span>
          </button>
        ))}
      </div>
      <Amount n={k} max={max} set={setN} />
      <div className="pop__acts">
        <button
          type="button"
          disabled={!sp || have < k}
          onClick={() => {
            sell(world, pick, k)
            refresh()
          }}
        >
          {t(UI.sell)} <Icon kind="coin" size={14} />
          {k * sp}
        </button>
        <button
          type="button"
          disabled={coins < k * bp}
          onClick={() => {
            buy(world, pick, k)
            refresh()
          }}
        >
          {t(UI.buy)} <Icon kind="coin" size={14} />
          {k * bp}
        </button>
      </div>
    </>
  )
}

/** Seconds, short: 6, 2.5, 1.7. */
const secs = (n: number) => String(Math.round(n * 10) / 10)

/**
 * How loaded a machine is (the author: «видеть его загруженность»): the job in hand as a bar with one job's seconds;
 * each good it takes with its four places, filled as far as it holds; what is done and waiting to leave. Machines take
 * goods only from belts (docs/05-REWORK.md), so nothing is loaded by hand.
 */
function MachineLoad({ b }: { b: Building }) {
  const { t } = useT()
  const type = b.type as BuildingId
  const def = BUILDINGS[type]
  if (!def.time && !jobOf(b)) return null
  const kinds: ItemId[] = def.station ? (def.uses ? [def.uses] : []) : def.sows ? [SEED[b.seed ?? 'meadow']] : [...new Set(jobsOf(b).flatMap((j) => Object.keys(j.inp) as ItemId[]))]
  const out = b.slot?.job?.out ?? jobOf(b)?.out ?? def.gives ?? (type === 'shearer' ? 'wool' : null)
  const ready = b.outs.filter((o) => !o.item.sheep).length + b.pile.length
  return (
    <div className="load">
      <div className="load__job" title={t(UI.cycle, { a: secs(cycleTime(b)) })}>
        <span className="load__bar">
          <i style={{ width: Math.round(jobProgress(b) * 100) + '%' }} />
        </span>
        <span className="load__time">⏱ {secs(cycleTime(b))}</span>
      </div>
      {kinds.map((k) => {
        const have = b.inv[k] ?? 0
        return (
          <div key={k} className="load__row">
            <Icon kind={k} size={20} />
            <span className="load__cells">
              {Array.from({ length: BELT.bufMax }, (_, i) => (
                <i key={i} className={i < have ? 'on' : ''} />
              ))}
            </span>
          </div>
        )
      })}
      {out && ready > 0 && (
        <div className="load__row" title={t(UI.readyOut)}>
          <Icon kind={out} size={20} />
          <small>
            {t(UI.readyOut)} {ready}
          </small>
        </div>
      )}
    </div>
  )
}

/** The popup for the selected building, dock, plot or pen. */
function Popup() {
  const { world } = useGame()
  const { t } = useT()
  const sel = useHudStore((s) => s.sel)
  const at = useHudStore((s) => s.popAt)
  const met = useHudStore((s) => s.met)
  const asksHud = useHudStore((s) => s.asks)
  useHudStore((s) => s.tick)
  const el = useRef<HTMLDivElement>(null)
  if (!sel || !at) return null
  const gs = res(world, GameState)
  const refresh = () => useHudStore.getState().set({ tick: useHudStore.getState().tick + 1, sel: res(world, Ui).sel })
  let body: ReactNode = null
  if (sel.kind === 'b') {
    const b = res(world, Plant).b.get(sel.key)
    if (!b) return null
    if (b.part === 'buy') {
      // the trading post: buying into the stock and selling from it
      body = (
        <>
          <h3>
            <Icon kind="coin" size={20} />
            {t(UI.tradePost)}
          </h3>
          <MarketBody refresh={refresh} />
        </>
      )
    } else if (b.type === 'dock') {
      // a stall: the ask whose truck is loaded there, with how many of its good wait in the stock
      const a = askAt(world, MARKET.stalls.indexOf(b.x as (typeof MARKET.stalls)[number]))
      body = a ? (
        <>
          <h3>
            <Icon kind={a.kind} size={20} />
            {t(CLIENT_NAMES[a.client])}
          </h3>
          <div className="pop__rows">
            <div>
              <Icon kind={a.kind} size={20} /> {a.have} / {a.total}
            </div>
            <div>
              <Icon kind="coin" size={16} />
              {t(UI.each, { n: asksHud.find((q) => q.id === a.id)?.price ?? 0 })}
            </div>
            {stockOf(world, a.kind) > 0 && (
              <div title={t(UI.stock)}>
                <Icon kind="stock" size={16} /> {stockOf(world, a.kind)}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <h3>
            <Icon kind="coin" size={20} />
            {t(UI.stall)}
          </h3>
          <div className="pop__st pop__st--plain">{t(UI.noTruck)}</div>
        </>
      )
    } else {
      const type = b.type as BuildingId
      const st = machineState(world, b)
      const rules = ['any', ...met, 'sheep', 'off']
      body = (
        <>
          <h3>
            <Icon kind={type} size={22} />
            {t(BUILDING_TEXT[type].name)}
          </h3>
          <Recipe r={recipeOf(type, b.recipe)} />
          <div className="pop__st pop__st--plain">{t(BUILDING_TEXT[type].desc)}</div>
          {BUILDINGS[type].recipes && (
            <div className="recipes" role="group" aria-label={t(UI.recipe)}>
              {RECIPE_ORDER.filter((r) => res(world, Unlocks).recipes.has(r)).map((r) => (
                <button
                  key={r}
                  type="button"
                  className="rule"
                  aria-pressed={b.recipe === r}
                  title={t(ITEM_NAMES[RECIPES[r].out])}
                  onClick={() => {
                    setRecipe(world, b, r)
                    refresh()
                  }}
                >
                  <Icon kind={RECIPES[r].out} size={22} />
                </button>
              ))}
            </div>
          )}
          {BUILDINGS[type].sows && (
            <SeedPick
              value={b.seed ?? 'meadow'}
              set={(v) => {
                setSeed(world, b, v)
                refresh()
              }}
            />
          )}
          {type === 'splitter' && b.rules && (
            <div className="split">
              {(['l', 'f', 'r'] as (keyof SplitRules)[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="rule"
                  onClick={() => {
                    cycleRule(world, b, k, rules)
                    refresh()
                  }}
                >
                  {b.rules![k] === 'any' ? t(UI.any) : b.rules![k] === 'off' ? '✕' : <Icon kind={b.rules![k]} size={18} />}
                </button>
              ))}
              {['←', '↑', '→'].map((a) => (
                <small key={a}>{a}</small>
              ))}
            </div>
          )}
          {type !== 'belt' && type !== 'merger' && type !== 'splitter' && st.text && (
            <div className={'pop__st pop__st--' + st.tone}>{t(STATE_TEXT[st.text]!, { n: st.n ?? 0, item: st.item ? t(ITEM_NAMES[st.item as ItemId]).toLowerCase() : '' })}</div>
          )}
          <MachineLoad b={b} />
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
  } else if (sel.kind === 'plot') {
    const price = plotPrice(world, sel.px, sel.py),
      adj = plotAdjacent(world, sel.px, sel.py)
    const what = Object.entries(plotStock(world, sel.px, sel.py)) as [ResId, number][]
    body = (
      <>
        <h3>{t(UI.plot)}</h3>
        <div className="pop__rows">
          {what.map(([k, n]) => (
            <div key={k}>
              <Icon kind={k} size={18} /> {t(RES_NAMES[k])} · <Icon kind={SEED[k]} size={16} />
              {n}
            </div>
          ))}
        </div>
        {adj ? (
          <div className="pop__acts">
            <button
              type="button"
              disabled={gs.coins < price}
              onClick={() => {
                if (buyPlot(world, sel.px, sel.py)) res(world, Ui).sel = null
                refresh()
              }}
            >
              {t(UI.buy)} <Icon kind="coin" size={14} />
              {price}
            </button>
          </div>
        ) : (
          <div className="pop__st pop__st--warn">{t(UI.neighbourFirst)}</div>
        )}
      </>
    )
  } else {
    const p = penOf(world, sel.id)
    if (!p) return null
    const n = residents(world, p),
      hungryN = res(world, Flock).sheep.filter((s) => s.home === p.id && hungry(s)).length
    body = (
      <>
        <h3>
          {t(UI.pasture)} · {n}/{p.cap}
        </h3>
        {hungryN > 0 && (
          <div className="pop__st pop__st--warn">
            <Icon kind="hay" size={16} /> {t(UI.hungryHere, { n: hungryN })}
          </div>
        )}
        <div className="pop__acts">
          <button
            type="button"
            title={t(UI.removeTitle)}
            disabled={n > 0}
            onClick={() => {
              remove(world, p.x, p.y)
              res(world, Ui).sel = null
              refresh()
            }}
          >
            <Icon kind="erase" size={16} />+{p.paid}
          </button>
        </div>
      </>
    )
  }

  const pw = el.current?.offsetWidth ?? 200,
    ph = el.current?.offsetHeight ?? 140
  const left = Math.max(8, Math.min(window.innerWidth - pw - 16, at.x + 8)),
    top = Math.max(58, Math.min(window.innerHeight - ph - 90, at.y))
  return (
    <div ref={el} className="panel pop" style={{ left, top }}>
      {body}
    </div>
  )
}

/** «Новое»: one new thing, its icon and recipe and one sentence. The game waits until it is closed. */
function NewCard() {
  const { world } = useGame()
  const { t } = useT()
  const card = useHudStore((s) => s.card)
  const menuOver = useAppStore((s) => s.menuOver)
  if (!card || menuOver) return null
  const c = CARD_TEXT[card]
  const icon = card === 'market' ? 'coin' : card === 'land' || card === 'island' ? 'meadow' : card === 'chapter' || card === 'shear' ? 'sheep' : card
  const close = () => {
    res(world, Unlocks).cardQ.shift()
    useHudStore.getState().set({ card: res(world, Unlocks).cardQ[0] ?? null })
  }
  return (
    <div className="new" onClick={close}>
      <div className="panel new__card" onClick={(e) => e.stopPropagation()}>
        <span className="new__tag">{t(UI.newTag)}</span>
        <Icon kind={icon} size={52} />
        <h2>{t(c.title)}</h2>
        <Recipe r={recipeOf(card)} />
        <p>{t(c.text)}</p>
        <button type="button" className="btn" onClick={close}>
          {t(UI.gotIt)}
        </button>
      </div>
    </div>
  )
}

/** The pause menu: the village's level and the game time, then go on, start anew, or leave for the main menu. */
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
          <h2>{t(UI.level, { n: gs.level + 1 })}</h2>
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
