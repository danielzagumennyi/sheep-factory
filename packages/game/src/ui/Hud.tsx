import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BELT, BUILDINGS, MISSIONS, RECIPES, RECIPE_ORDER, RES, SHEEP, STARS, UPGRADE, type BuildingId, type CardId, type ItemId, type RecipeId } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { jobOf, plotAdjacent, plotPrice, plotRes, residents, roomPrice, upgradePrice } from '@/game/grid'
import { buyPlot, buySheep, cycleRule, growPasture, liftUp, remove, setRecipe, upgrade } from '@/game/actions/build'
import { feed } from '@/game/actions/hand'
import { cycleTime, jobProgress, machineState } from '@/game/systems/machines'
import { buy, buyPrice, doneFor, extraPay, loadDock, orderFor, sell, sellPrice } from '@/game/systems/orders'
import { Flock, GameState, Mission, Plant, Ui, Unlocks, res, stockOf, type Building, type SplitRules, type World } from '@/game/world'
import { missionOpen, useAppStore } from '@/app/store'
import { setSoundOn } from '@/audio'
import { setLang, useT } from '@/i18n'
import { UI } from '@/i18n/ui'
import { BUILDING_TEXT, CARD_TEXT, ITEM_NAMES, MISSION_NAMES, RES_NAMES, STATE_TEXT } from '@/i18n/content'
import { setTool } from './actions'
import { useHudStore } from './hudStore'
import { Icon } from './Icon'
import { Book } from './Book'

/** m:ss of mission time. */
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
  if (id === 'shear' || id === 'shearer') return [[['sheep', 1]], [['wool', 2]]]
  if (id === 'needs') return [[['hay', 1], ['water', 1]], [['wool', 2]]]
  if (id === 'hay') return [[['meadow', 1]], [['hay', 1]]]
  if (id === 'water') return [[['pond', 1]], [['water', 1]]]
  if (id === 'dye') return [[['bush', 1]], [['dye', 1]]]
  if (id === 'workshop') return recipeLine(recipe ?? 'cyarn')
  if (id in RECIPES) return recipeLine(id as RecipeId)
  const b = (BUILDINGS as Record<string, (typeof BUILDINGS)[BuildingId]>)[id]
  if (!b) return null
  if (b.inp) return [Object.entries(b.inp) as [string, number][], [[b.out!, 1]]]
  if (b.near) return [[[b.near === 'water' ? 'pond' : b.near, 1]], [[b.gives!, 1]]]
  return null
}

export function Hud() {
  return (
    <>
      <TopLeft />
      <TopCenter />
      <TopRight />
      <Orders />
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
  const clock = useHudStore((s) => s.clock)
  const par = useHudStore((s) => s.par)
  const finished = useHudStore((s) => s.finished)
  const stars = useHudStore((s) => s.stars)
  const finishT = useHudStore((s) => s.finishT)
  const [shake, setShake] = useState(0)
  const last = useRef(noMoney)
  useEffect(() => {
    if (noMoney !== last.current) {
      last.current = noMoney
      setShake((n) => n + 1)
    }
  }, [noMoney])
  const time = finished ? finishT : clock
  const n = finished ? stars : clock <= par ? 3 : clock <= par * STARS.twoStar ? 2 : 1
  const left = (n === 3 ? par : par * STARS.twoStar) - clock
  const lim = n === 3 ? par : par * STARS.twoStar
  const f = n === 1 ? 1 : Math.min(1, time / lim)
  const r = 9,
    c = 2 * Math.PI * r
  return (
    <div className="ov ov-tl">
      <div key={shake} className={'panel coins' + (shake ? ' coins--short' : '')}>
        <Icon kind="coin" size={22} />
        <span>{coins}</span>
      </div>
      <div className="panel day" title={t(UI.thresholds, { a: fmtT(par), b: fmtT(par * STARS.twoStar) })}>
        <svg width="24" height="24" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r={r} fill="none" stroke="var(--grid)" strokeWidth="4" />
          <circle cx="12" cy="12" r={r} fill="none" stroke={n === 3 ? 'var(--warn)' : n === 2 ? 'var(--accent)' : 'var(--line)'} strokeWidth="4" strokeDasharray={(c * f).toFixed(1) + ' 99'} transform="rotate(-90 12 12)" />
        </svg>
        <span>{fmtT(time)}</span>
        <span className="stars3">{'★'.repeat(n)}</span>
        {!finished && n > 1 && <small>{t(UI.left, { t: fmtT(left) })}</small>}
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

function Orders() {
  const { t } = useT()
  const orders = useHudStore((s) => s.orders)
  return (
    <div className="ov ov-orders">
      {orders.map((o) => {
        const tick = (o.batch / o.total) * 100
        return o.done ? (
          <div key={o.id} className="panel order order--done">
            <span className="order__who">{t(ITEM_NAMES[o.kind])} ✓</span>
            <span className="order__rw">
              +<Icon kind="coin" size={14} />
              {o.extraPay} {t(UI.perBatch, { n: o.batch })}
            </span>
            <span className="order__need">
              <Icon kind={o.kind} size={22} />
              {t(UI.extra, { a: o.extra % o.batch, b: o.batch })}
            </span>
            <span className="order__bar">
              <i style={{ width: ((o.extra % o.batch) / o.batch) * 100 + '%' }} />
            </span>
          </div>
        ) : (
          <div key={o.id} className="panel order">
            <span className="order__who">{t(ITEM_NAMES[o.kind])}</span>
            <span className="order__rw">
              +<Icon kind="coin" size={14} />
              {o.pay} {t(UI.perBatch, { n: o.batch })}
            </span>
            <span className="order__need">
              <Icon kind={o.kind} size={22} />
              {o.have} / {o.total}
            </span>
            <span className="order__bar" style={{ background: `repeating-linear-gradient(90deg, var(--belt) 0 calc(${tick}% - 2px), var(--panel) calc(${tick}% - 2px) ${tick}%)` }}>
              <i style={{ width: (o.have / o.total) * 100 + '%' }} />
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** A building's recipes for its tip: a workshop shows every recipe it knows here, others their one line. */
function Recipes({ id }: { id: BuildingId }) {
  const known = useHudStore((s) => s.recipes)
  const recipe = useHudStore((s) => s.recipe)
  if (id === 'workshop' && known.length)
    return (
      <span className="recipes-tip">
        {known.map((r) => (
          <Recipe key={r} r={recipeLine(r)} />
        ))}
      </span>
    )
  return <Recipe r={recipeOf(id, recipe)} />
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
              <Recipes id={tip as BuildingId} />
              <span className="tip__desc">{t(BUILDING_TEXT[tip as BuildingId].desc)}</span>
              {tip !== 'belt' && <span className="tip__desc">{t(UI.rotateTip)}</span>}
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
                <span className={'slot__p' + (s.short ? ' slot__p--short' : '')}>{s.price}</span>
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
 * The barn's stock, which is the hand, bottom left as in Tower Factory (the author): a column of goods with their
 * counts, only those there are.
 */
const STOCK_ORDER: readonly ItemId[] = ['hay', 'water', 'wool', 'roving', 'yarn', 'felt', 'dye', 'cyarn', 'sweater', 'valenki']
function StockPanel() {
  const { t } = useT()
  const stock = useHudStore((s) => s.stock)
  const list = STOCK_ORDER.filter((k) => (stock[k] ?? 0) > 0)
  return (
    <div className="ov ov-stock">
      <div className="panel stock" title={t(UI.stock)}>
        <Icon kind="barn" size={26} />
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

/** A truck dock's loading: how many of its good to load from the stock (the author: «он выбирает … сколько»). */
function LoadRow({ b, kind, refresh }: { b: Building; kind: ItemId; refresh: () => void }) {
  const { world } = useGame()
  const { t } = useT()
  const have = stockOf(world, kind)
  const [n, setN] = useState(99)
  if (!have) return <div className="pop__st pop__st--plain">{t(UI.nothingHere)}</div>
  const k = Math.min(n, have)
  return (
    <>
      <Amount n={k} max={have} set={setN} />
      <div className="pop__acts">
        <button
          type="button"
          onClick={() => {
            loadDock(world, b, k)
            refresh()
          }}
        >
          {t(UI.load)} <Icon kind={kind} size={16} />
          {k}
        </button>
      </div>
    </>
  )
}

/** The goods the market deals in this mission: what is in stock, what the land and the machines here can give. */
function marketGoods(w: World): ItemId[] {
  const un = res(w, Unlocks),
    def = res(w, Mission).def
  const can = new Set<ItemId>(['wool'])
  if (def.needs.food) can.add('hay')
  if (def.needs.water) can.add('water')
  if (def.terrain.bush) can.add('dye')
  for (const id of un.unlocked) {
    const d = BUILDINGS[id]
    if (d.out) can.add(d.out)
    if (d.gives) can.add(d.gives)
  }
  for (const r of un.recipes) can.add(RECIPES[r].out)
  return STOCK_ORDER.filter((k) => can.has(k) || stockOf(w, k) > 0)
}

/** The market (the author: «как продавать так и покупать»): pick a good, how many, then sell or buy. */
function MarketBody({ refresh }: { refresh: () => void }) {
  const { world } = useGame()
  const { t } = useT()
  const goods = marketGoods(world)
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
 * How loaded a machine is and a way to load it (the author: «видеть его загруженность и … добавить необходимые
 * ресурсы, как с заказами»): the job in hand as a bar with one job's seconds and level dots; each input as its four
 * places, filled as far as it holds, with a button that fills them from the stock; what is done and waiting to leave.
 */
function MachineLoad({ b, refresh }: { b: Building; refresh: () => void }) {
  const { world } = useGame()
  const { t } = useT()
  const type = b.type as BuildingId
  const job = jobOf(b),
    def = BUILDINGS[type]
  if (!job && !def.time) return null
  const out = job?.out ?? def.gives ?? (type === 'shearer' ? 'wool' : null)
  const ready = b.outs.filter((o) => !o.item.sheep).length + b.pile.length
  return (
    <div className="load">
      <div className="load__job" title={t(UI.cycle, { a: secs(cycleTime(b)) })}>
        <span className="load__bar">
          <i style={{ width: Math.round(jobProgress(b) * 100) + '%' }} />
        </span>
        <span className="load__time">⏱ {secs(cycleTime(b))}</span>
        {def.upgradable && (
          <span className="load__lvl">
            {Array.from({ length: UPGRADE.maxLevel }, (_, i) => (
              <i key={i} className={i < b.lvl ? 'on' : ''} />
            ))}
          </span>
        )}
      </div>
      {job &&
        (Object.entries(job.inp) as [ItemId, number][]).map(([k, need]) => {
          const have = b.inv[k] ?? 0,
            n = Math.min(BELT.bufMax - have, stockOf(world, k))
          return (
            <div key={k} className="load__row">
              <Icon kind={k} size={20} />
              {need > 1 && <small>{need}×</small>}
              <span className="load__cells">
                {Array.from({ length: BELT.bufMax }, (_, i) => (
                  <i key={i} className={i < have ? 'on' : ''} />
                ))}
              </span>
              <button
                type="button"
                title={t(UI.inStock) + ': ' + stockOf(world, k)}
                disabled={!n}
                onClick={() => {
                  feed(world, b, k, n)
                  refresh()
                }}
              >
                +{n}
              </button>
              <small className="load__stock">
                <Icon kind="barn" size={14} />
                {stockOf(world, k)}
              </small>
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

/** The popup for the selected building, dock, plot or pasture. */
function Popup() {
  const { world } = useGame()
  const { t } = useT()
  const sel = useHudStore((s) => s.sel)
  const at = useHudStore((s) => s.popAt)
  useHudStore((s) => s.tick)
  const el = useRef<HTMLDivElement>(null)
  if (!sel || !at) return null
  const gs = res(world, GameState)
  const refresh = () => useHudStore.getState().set({ tick: useHudStore.getState().tick + 1, sel: res(world, Ui).sel })
  let body: ReactNode = null
  if (sel.kind === 'b') {
    const b = res(world, Plant).b.get(sel.key)
    if (!b) return null
    if (b.type === 'dock') {
      const o = orderFor(world, b.client!),
        od = doneFor(world, b.client!)
      body = (
        <>
          <h3>
            {b.client === 'market' ? (
              <>
                <Icon kind="coin" size={20} />
                {t(UI.market)}
              </>
            ) : (o ?? od) ? (
              <>
                <Icon kind={(o ?? od)!.kind} size={20} />
                {t(ITEM_NAMES[(o ?? od)!.kind])}
              </>
            ) : null}
          </h3>
          {b.client === 'market' ? (
            <MarketBody refresh={refresh} />
          ) : o ? (
            <div className="pop__rows">
              <div>
                <Icon kind={o.kind} size={20} /> {o.have} / {o.total}
              </div>
              <div>
                <Icon kind="coin" size={16} />
                {t(UI.forEach, { n: o.pay, b: o.batch })}
              </div>
            </div>
          ) : od ? (
            <div className="pop__rows">
              <div>{t(UI.orderDone)}</div>
              <div>
                <Icon kind={od.kind} size={20} /> {t(UI.extraPay)} <Icon kind="coin" size={16} />
                {t(UI.forEach, { n: extraPay(od), b: od.batch })}
              </div>
            </div>
          ) : null}
          {b.client !== 'market' && (o ?? od) && <LoadRow b={b} kind={(o ?? od)!.kind} refresh={refresh} />}
        </>
      )
    } else {
      const type = b.type as BuildingId
      const st = machineState(world, b)
      const up = BUILDINGS[type].upgradable && b.lvl < UPGRADE.maxLevel
      body = (
        <>
          <h3>
            <Icon kind={type} size={22} />
            {t(BUILDING_TEXT[type].name)}
            {b.lvl > 1 ? ' · ' + b.lvl : ''}
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
          {type === 'splitter' && b.rules && (
            <div className="split">
              {(['l', 'f', 'r'] as (keyof SplitRules)[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="rule"
                  onClick={() => {
                    cycleRule(world, b, k)
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
          <MachineLoad b={b} refresh={refresh} />
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
            {up && (
              // what the upgrade gives, on the button itself: one job's seconds now → after (the author: «не понятно что это даёт»)
              <button
                type="button"
                className="up"
                title={t(UI.faster, { a: secs(cycleTime(b)), b: secs(cycleTime(b, b.lvl + 1)) })}
                disabled={gs.coins < upgradePrice(b)}
                onClick={() => {
                  upgrade(world, b)
                  refresh()
                }}
              >
                ⬆ ⏱ {secs(cycleTime(b))}→{secs(cycleTime(b, b.lvl + 1))} <Icon kind="coin" size={14} />
                {upgradePrice(b)}
              </button>
            )}
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
    const what = Object.entries(plotRes(world, sel.px, sel.py)) as [keyof typeof RES_NAMES, number][]
    body = (
      <>
        <h3>{t(UI.plot)}</h3>
        <div className="pop__rows">
          {what.map(([k, n]) => (
            <div key={k}>
              <Icon kind={k === 'water' ? 'pond' : k} size={18} /> {t(RES_NAMES[k])} · <Icon kind={k === 'meadow' ? 'hay' : k === 'bush' ? 'dye' : 'water'} size={16} />
              {n * RES[k].max}
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
    const p = res(world, Flock).pastures[sel.id]!
    const needs = res(world, Mission).def.needs
    body = (
      <>
        <h3>
          {t(UI.pasture)} · {residents(world, p)}/{p.cap}
        </h3>
        {/* a building with its recipe: one hay and one water from the stock for each fleece */}
        {(needs.food || needs.water) && <Recipe r={recipeOf('needs')} />}
        {p.want.length > 0 && <div className="pop__st pop__st--warn">{t(STATE_TEXT.waitsFor!, { item: p.want.map((k) => t(ITEM_NAMES[k]).toLowerCase()).join(', ') })}</div>}
        <div className="pop__rows">
          {needs.food && (
            <div>
              <Icon kind="hay" size={18} /> {stockOf(world, 'hay')}
            </div>
          )}
          {needs.water && (
            <div>
              <Icon kind="water" size={18} /> {stockOf(world, 'water')}
            </div>
          )}
        </div>
        <div className="pop__acts">
          <button
            type="button"
            disabled={gs.coins < SHEEP.price || residents(world, p) >= p.cap}
            onClick={() => {
              buySheep(world, p)
              refresh()
            }}
          >
            + <Icon kind="sheep" size={18} /> <Icon kind="coin" size={14} />
            {SHEEP.price}
          </button>
          <button
            type="button"
            disabled={gs.coins < roomPrice(p)}
            onClick={() => {
              growPasture(world, p)
              refresh()
            }}
          >
            {t(UI.places)} <Icon kind="coin" size={14} />
            {roomPrice(p)}
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
  const icon = card === 'shear' ? 'shear' : card === 'needs' ? 'sheep' : card === 'extra' || card === 'market' ? 'coin' : card === 'land' ? 'meadow' : card
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

/** The mission list, and the result card when a mission ends. */
/**
 * The campaign: every mission with its stars, a click starts it. A mission opens once the one before it has a star;
 * the first open one without a star is marked as the next.
 */
export function MissionList() {
  const { t } = useT()
  const stars = useAppStore((s) => s.stars)
  const next = MISSIONS.findIndex((m, i) => missionOpen(stars, i) && !stars[m.id])
  return (
    <div className="mlist">
      {MISSIONS.map((m, i) => {
        const open = missionOpen(stars, i)
        return (
          <button key={m.id} type="button" className={'mode' + (i === next ? ' mode--next' : '')} disabled={!open} onClick={() => useAppStore.getState().start(m.id)}>
            <span>{i + 1}</span>
            <b>{t(MISSION_NAMES[m.id])}</b>
            {i === next && <span className="mode__next">{t(UI.nextMission)} ▶</span>}
            <span className="mode__stars">{open ? '★'.repeat(stars[m.id] ?? 0) + '☆'.repeat(3 - (stars[m.id] ?? 0)) : <Icon kind="lock" size={16} />}</span>
          </button>
        )
      })}
    </div>
  )
}

function MenuOverlay() {
  const { world } = useGame()
  const { t } = useT()
  const menuOver = useAppStore((s) => s.menuOver)
  const showResult = useHudStore((s) => s.showResult)
  const finishT = useHudStore((s) => s.finishT)
  const won = useHudStore((s) => s.stars)
  const mission = res(world, GameState).mission
  const saved = useRef(false)
  useEffect(() => {
    if (showResult && !saved.current) {
      saved.current = true
      useAppStore.getState().saveStars(mission, won)
    }
  }, [showResult, mission, won])
  const app = useAppStore.getState()
  if (showResult && !menuOver) {
    const idx = MISSIONS.findIndex((m) => m.id === mission),
      next = MISSIONS[idx + 1],
      par = res(world, Mission).def.par
    return (
      <div className="menu">
        <div className="panel menu__card">
          <div className="result">
            <h2>{t(MISSION_NAMES[mission])}</h2>
            <div className="result__big">{'★'.repeat(won) + '☆'.repeat(3 - won)}</div>
            <div className="result__rows">
              {t(UI.time, { t: fmtT(finishT) })}
              <br />
              {t(UI.thresholds, { a: fmtT(par), b: fmtT(par * STARS.twoStar) })}
            </div>
          </div>
          <div className="menu__acts">
            {next && (
              <button type="button" className="btn" onClick={() => app.start(next.id)}>
                {t(UI.next)}
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => app.start(mission)}>
              {t(UI.again)}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => app.toTitle()}>
              {t(UI.toTitle)}
            </button>
          </div>
        </div>
      </div>
    )
  }
  if (!menuOver) return null
  // the pause menu: which mission this is and how it goes, then go on, start it over, or leave for the main menu
  const idx = MISSIONS.findIndex((m) => m.id === mission),
    par = res(world, Mission).def.par,
    clock = res(world, GameState).clock,
    now = clock <= par ? 3 : clock <= par * STARS.twoStar ? 2 : 1
  return (
    <div className="menu" onClick={() => app.closeMenu()}>
      <div className="panel menu__card menu__card--pause" onClick={(e) => e.stopPropagation()}>
        <div className="result">
          <small className="menu__kicker">❚❚</small>
          <h2>
            {idx + 1}. {t(MISSION_NAMES[mission])}
          </h2>
          <div className="result__rows">
            {fmtT(clock)} · {'★'.repeat(now) + '☆'.repeat(3 - now)}
          </div>
        </div>
        <div className="menu__acts menu__acts--col">
          <button type="button" className="btn" onClick={() => app.closeMenu()}>
            {t(UI.resume)}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => app.start(mission)}>
            {t(UI.again)}
          </button>
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

