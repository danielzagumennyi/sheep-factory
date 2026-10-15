import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { KeyInput } from '@kit/input'
import { CAMERA, GRID, MISSIONS, TOOL_ORDER, type MissionId } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { buildPrice } from '@/game/grid'
import { remove, rotate } from '@/game/actions/build'
import { createBot, runBot } from '@/game/bot'
import { buildShowcase } from '@/game/showcase'
import { buildStress, feedStress } from '@/game/stress'
import { FIXED_DT, isFrozen, stepSimulation } from '@/game/systems'
import { extraPay, openOrders } from '@/game/systems/orders'
import { startWorld } from '@/game/start'
import { Field, Flock, GameState, Market, Mission, Plant, Stock, Time, Ui, Unlocks, res, stockOf, type World } from '@/game/world'
import { BINDINGS, type Action } from '@/input/bindings'
import { SLOTS, barOf, useAppStore } from '@/app/store'
import { renderIcons } from './iconRender'
import { useHudStore, type GoalHud } from '@/ui/hudStore'
import { setTool } from '@/ui/actions'
import { cam, clampCam, fitOwned, turnCam } from './camera'
import { collectFrame, frame } from './frame'

/** At most this many fixed steps per frame (×4 speed at 60 fps needs four). */
const MAX_STEPS = 8
/** The HUD refreshes every this many frames. */
const HUD_EVERY = 6

/**
 * The one frame loop (TDD 3.2): a fixed-step accumulator runs the simulation at 1/60 s × speed, then gathers what the
 * views draw, refreshes the HUD a few times a second, and handles the keyboard. It runs before every view (priority).
 */
export function GameLoop() {
  const { world } = useGame()
  const { camera, size, gl, scene } = useThree()
  const advance = useThree((s) => s.advance)
  const r3f = useThree((s) => s.get)
  const shot = useRef<string | null>(null)
  const fps = useRef(0)
  const cpu = useRef({ t0: 0, ms: 0 })
  const acc = useRef(0)
  const hudN = useRef(0)
  const keys = useRef<KeyInput<Action> | null>(null)
  const uiPause = useRef({ on: false, speed: 1 })

  useEffect(() => {
    fitOwned(world, size.width / Math.max(1, size.height))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- frame the land once per mission
  }, [world])

  useEffect(() => {
    const k = new KeyInput<Action>(BINDINGS)
    k.attach(window)
    keys.current = k
    const ui = () => res(world, Ui)
    const gs = () => res(world, GameState)
    const offs = [
      k.on('pause', (e) => {
        e.preventDefault()
        // a «Новое» card is closed by the same keys that pause
        if (res(world, Unlocks).cardQ.length) res(world, Unlocks).cardQ.shift()
        else gs().speed = gs().speed === 0 ? 1 : 0
      }),
      // Esc steps back one thing at a time: a card, the book, the menu, the tool or selection — and then opens the menu
      k.on('cancel', () => {
        const app = useAppStore.getState()
        if (res(world, Unlocks).cardQ.length) return void res(world, Unlocks).cardQ.shift()
        if (app.book) return app.setBook(false)
        if (app.screen !== 'run') return
        if (app.menuOver) return app.closeMenu()
        if (ui().tool !== 'hand' || ui().sel || ui().pending) {
          setTool(world, 'hand')
          ui().sel = null
          return
        }
        if (!res(world, GameState).showResult) app.openMenu()
      }),
      k.on('book', () => {
        const app = useAppStore.getState()
        if (app.screen === 'run') app.setBook(!app.book)
      }),
      k.on('rotate', () => {
        const h = ui().hover
        const b = h?.b && ui().tool === 'hand' ? res(world, Plant).b.get(h.b) : null
        if (b) rotate(world, b)
        else ui().rot = ((ui().rot + 1) % 4) as 0 | 1 | 2 | 3
      }),
      k.on('erase', () => {
        const h = ui().hover
        const hb = h?.b ? res(world, Plant).b.get(h.b) : null
        if (h) remove(world, hb?.x ?? h.x, hb?.y ?? h.y)
      }),
      // keys 1–9 and 0 pick a quick-bar slot; with the book open they put the building under the pointer into it
      ...Array.from({ length: SLOTS }, (_, i) =>
        k.on(('tool' + (i + 1)) as Action, () => {
          const app = useAppStore.getState()
          const bar = barOf(app.bar, res(world, Unlocks).unlocked)
          if (app.book) {
            if (app.bookHover) app.assignSlot(i, app.bookHover, bar)
            return
          }
          const t = bar[i]
          if (t) setTool(world, ui().tool === t ? 'hand' : t)
        }),
      ),
      k.on('confirm', () => {
        const un = res(world, Unlocks)
        if (un.cardQ.length) un.cardQ.shift()
      }),
    ]
    return () => {
      offs.forEach((f) => f())
      k.detach()
      keys.current = null
    }
  }, [world])

  // the dev console: `__game` (TDD 6)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const g = globalThis as unknown as { __game?: unknown }
    g.__game = {
      world,
      gl,
      scene,
      camera,
      res: <T,>(t: T) => res(world, t as never),
      traits: { GameState, Plant, Flock, Market, Stock, Unlocks, Ui, Mission, Field },
      coins: (n: number) => (res(world, GameState).coins += n),
      speed: (n: number) => (res(world, GameState).speed = n),
      start: (id: MissionId) => useAppStore.getState().start(id),
      unlockAll: () => TOOL_ORDER.forEach((t) => res(world, Unlocks).unlocked.add(t)),
      /** Screen point (CSS px) of a field point, for scripted clicks. */
      project: (x: number, z: number) => {
        const v = new Vector3(x, 0, z).project(camera)
        return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height }
      },
      /** Let the bot play this mission live (like a player), at the given speed; `autoplay(false)` stops it. */
      autoplay: (on = true, speed = 2) => {
        clearInterval(autoTimer)
        if (!on) return
        const bot = createBot(world)
        res(world, GameState).speed = speed
        autoTimer = setInterval(() => bot.act(), 700 / speed) as unknown as number
      },
      /** Save the 3D canvas at full resolution to docs/concept/shots/<name>.png (no HUD). */
      shot: (name = 'shot') => {
        shot.current = name
      },
      /** The frame rate and the CPU time of a frame (simulation, views and draw submission), for keeping the look cheap. */
      info: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, fps: fps.current, cpuMs: cpu.current.ms }),
      /** Put the camera over a field point at a distance, turned by `yaw` degrees (for close-up shots). */
      look: (x: number, z: number, dist?: number, yaw?: number) => {
        cam.x = x
        cam.z = z
        if (dist) cam.dist = dist
        if (yaw !== undefined) cam.yaw = (yaw * Math.PI) / 180
      },
      /** The app's switches (grass…) without saving them: `app.setState({ grass: true })`. */
      app: useAppStore,
      /** Draw every rendered icon from its model into public/icons (render/iconRender.ts). */
      icons: () => renderIcons(gl),
      /** R3F's own state (its frame subscribers, for timing them). */
      r3f,
      /** The cost of whole frames — simulation, views, shadows, the draw — waited for on the GPU: ms per frame. */
      bench: (n = 30) => {
        const ctx = gl.getContext()
        const px = new Uint8Array(4)
        const sync = () => ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
        advance(performance.now())
        sync()
        const t0 = performance.now()
        for (let i = 0; i < n; i++) advance(t0 + i * 16.7)
        sync()
        return +((performance.now() - t0) / n).toFixed(2)
      },
      /** A factory far bigger than any mission's, kept working, for measuring (game/stress.ts; start('m7') first). */
      stress: (sheep?: number) => {
        buildStress(world, { sheep })
        clearInterval(stressTimer)
        stressTimer = setInterval(() => feedStress(world), 3000) as unknown as number
      },
      /** A ready-made factory on mission 7's map, for screenshots (start('m7') first). */
      showcase: (warmup = 90) => buildShowcase(world, warmup),
      /** Play every mission headless with the bot and print the table. */
      simulate: (seconds = 1500) => {
        const rows = MISSIONS.map((m) => {
          const w = startWorld(m.id, { seed: 7 })
          const r = runBot(w, seconds)
          w.destroy()
          return { ...r, par: m.par }
        })
        console.table(rows)
        return rows
      },
    }
    return () => {
      delete g.__game
    }
  }, [world, camera, size, gl, scene, advance, r3f])
  // the frame is drawn here, after every view has moved its things; a requested shot is read right after it
  useFrame(() => {
    gl.render(scene, camera)
    cpu.current.ms = cpu.current.ms * 0.95 + (performance.now() - cpu.current.t0) * 0.05
    if (!shot.current) return
    const name = shot.current
    shot.current = null
    void fetch('/__shot?name=' + name, { method: 'POST', body: gl.domElement.toDataURL('image/png') })
  }, 1)
  // the bot's live play ends with its world
  useEffect(
    () => () => {
      clearInterval(autoTimer)
      clearInterval(stressTimer)
    },
    [world],
  )

  useFrame((_, delta) => {
    fps.current = fps.current * 0.95 + (1 / Math.max(1e-3, delta)) * 0.05
    cpu.current.t0 = performance.now()
    const gs = res(world, GameState)
    // one pause for everything (the author: the pause and the menu didn't agree): the menu and the book pause the game
    // the same way the pause button does, so ❚❚ shows it, and give back the speed it had when they close
    const app = useAppStore.getState(),
      waits = app.menuOver || app.book
    if (waits !== uiPause.current.on) {
      if (waits) {
        uiPause.current.speed = gs.speed
        gs.speed = 0
      } else gs.speed = uiPause.current.speed
      uiPause.current.on = waits
    }
    const frozen = isFrozen(world)
    // the field's animations run on the game's clock: still on pause
    frame.dt = frozen ? 0 : Math.min(delta, 0.1) * gs.speed
    frame.t += frame.dt
    if (!frozen) {
      acc.current += Math.min(delta, 0.1) * gs.speed
      let n = 0
      while (acc.current >= FIXED_DT && n < MAX_STEPS) {
        stepSimulation(world, FIXED_DT)
        acc.current -= FIXED_DT
        n++
      }
      if (n === MAX_STEPS) acc.current = 0
    }
    res(world, Time).alpha = acc.current / FIXED_DT
    // keyboard panning
    const k = keys.current
    if (k) {
      const v = CAMERA.panSpeed * delta * (cam.dist / CAMERA.distance)
      // moves follow the view: up the screen is away from the camera
      const fx = -Math.sin(cam.yaw),
        fz = -Math.cos(cam.yaw)
      // right is the forward direction turned a quarter clockwise
      const along = (k.held('panUp') ? 1 : 0) - (k.held('panDown') ? 1 : 0),
        across = (k.held('panRight') ? 1 : 0) - (k.held('panLeft') ? 1 : 0)
      cam.x += (fx * along - fz * across) * v
      cam.z += (fz * along + fx * across) * v
      if (k.held('turnLeft')) turnCam(-CAMERA.turnKeys * delta)
      if (k.held('turnRight')) turnCam(CAMERA.turnKeys * delta)
      clampCam()
    }
    collectFrame(world)
    if (++hudN.current >= HUD_EVERY) {
      hudN.current = 0
      pushHud(world, camera, size)
    }
  }, -100)
  return null
}

const _v = new Vector3()
let autoTimer = 0
let stressTimer = 0

function goalOf(world: World): GoalHud {
  const gs = res(world, GameState),
    flock = res(world, Flock)
  if (gs.strayT > 0) return { tone: 'warn', icon: 'sheep', text: 'strayGoal' }
  // a pasture waiting for what the stock hasn't got
  if (flock.pastures.some((p) => p.want.includes('water'))) return { tone: 'warn', icon: 'water', text: 'thirstyGoal' }
  if (flock.pastures.some((p) => p.want.includes('hay'))) return { tone: 'warn', icon: 'hay', text: 'hungryGoal' }
  if (flock.sheep.some((s) => s.state === 'waiting')) return { tone: 'plain', icon: 'sheep', text: 'waitingGoal' }
  const o0 = res(world, Market).orders[0]
  if (gs.mission === 'm1' && o0 && o0.have === 0 && !stockOf(world, 'wool') && !res(world, Unlocks).unlocked.has('shearer')) return { tone: 'plain', icon: 'shear', text: 'shearGoal' }
  if (gs.mission === 'm1' && !res(world, Unlocks).unlocked.has('shearer') && stockOf(world, 'wool')) return { tone: 'plain', icon: 'wool', text: 'postGoal' }
  const o = openOrders(world).sort((a, b) => a.have / a.total - b.have / b.total)[0]
  return o ? { tone: 'plain', icon: o.kind, text: 'order', params: { have: o.have, total: o.total, kind: o.kind } } : null
}

/** Rebuild the HUD's plain snapshot from the world. */
function pushHud(world: World, camera: Parameters<typeof _v.project>[0], size: { width: number; height: number }) {
  const gs = res(world, GameState),
    ui = res(world, Ui),
    un = res(world, Unlocks),
    def = res(world, Mission).def
  // where the selection's popup hangs: just right of the selected thing, projected to the screen
  let popAt: { x: number; y: number } | null = null
  const sel = ui.sel
  if (sel) {
    if (sel.kind === 'b') {
      const b = res(world, Plant).b.get(sel.key)
      if (b) _v.set(b.x + b.w, 0.6, b.y + 0.2)
      else ui.sel = null
    } else if (sel.kind === 'plot') _v.set((sel.px + 0.5) * GRID.plotW, 0.3, sel.py * GRID.plotH + 1)
    else {
      const p = res(world, Flock).pastures[sel.id]!
      _v.set(p.x + p.w, 0.3, p.y)
    }
    if (ui.sel) {
      _v.project(camera)
      popAt = { x: ((_v.x + 1) / 2) * size.width, y: ((1 - _v.y) / 2) * size.height }
    }
  }
  const hud = useHudStore.getState()
  hud.set({
    coins: gs.coins,
    noMoney: gs.noMoney,
    pauseNudge: gs.pauseNudge,
    stock: { ...res(world, Stock).n },
    clock: gs.clock,
    par: def.par,
    finished: gs.finished,
    stars: gs.stars,
    finishT: gs.finishT,
    showResult: gs.showResult,
    speed: gs.speed,
    goal: goalOf(world),
    orders: res(world, Market).orders.map((o) => ({ id: o.id, dock: o.dock, kind: o.kind, have: o.have, total: o.total, batch: o.batch, pay: o.pay, done: o.done, extra: o.extra, extraPay: extraPay(o) })),
    tools: barOf(useAppStore.getState().bar, un.unlocked).map((t) => (t ? { id: t, price: buildPrice(world, t), short: gs.coins < buildPrice(world, t), fresh: un.fresh.has(t) } : null)),
    recipes: [...un.recipes],
    tool: ui.tool,
    recipe: ui.recipe,
    sel: ui.sel,
    popAt,
    card: un.cardQ[0] ?? null,
    tick: hud.tick + 1,
  })
  // once-per-game cards shown in this run are remembered by the app
  if (un.shownEver.length) {
    useAppStore.getState().sawCards(un.shownEver)
    un.shownEver.length = 0
  }
  if (gs.showResult && !gs.finished) gs.showResult = false
}
