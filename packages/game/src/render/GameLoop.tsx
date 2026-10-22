import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { KeyInput } from '@kit/input'
import { CAMERA, GOAL, TOOL_ORDER } from '@/game/balance'
import { useGame } from '@/game/GameContext'
import { buildPrice } from '@/game/grid'
import { buyRecipe, remove, rotate } from '@/game/actions/build'
import { dropSheep } from '@/game/actions/hand'
import { createBot, runBot } from '@/game/bot'
import { buildShowcase } from '@/game/showcase'
import { buildStress } from '@/game/stress'
import { FIXED_DT, isFrozen, stepSimulation } from '@/game/systems'
import { nextKind } from '@/game/systems/arrive'
import { wrongNow } from '@/game/systems/machines'
import { startWorld } from '@/game/start'
import { Field, Flock, GameState, Plant, Time, Ui, Unlocks, isOn, res, type World } from '@/game/world'
import { BINDINGS, type Action } from '@/input/bindings'
import { SLOTS, barOf, useAppStore } from '@/app/store'
import { renderIcons } from './iconRender'
import { renderSheepSheet } from './sheepSheet'
import { useHudStore, type GoalHud } from '@/ui/hudStore'
import { setTool } from '@/ui/actions'
import { cam, clampCam, frameStart, turnCam } from './camera'
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
    frameStart()
  }, [world])

  useEffect(() => {
    const k = new KeyInput<Action>(BINDINGS)
    k.attach(window)
    keys.current = k
    const ui = () => res(world, Ui)
    const gs = () => res(world, GameState)
    // the keys that act on the field work only while the world's keys are on (not behind the main menu); Esc and
    // Enter, which close a card, the book or the menu, always do
    const field =
      <E,>(f: (e: E) => void) =>
      (e: E) => {
        if (isOn(world, 'keys')) f(e)
      }
    const offs = [
      k.on(
        'pause',
        field((e) => {
          e.preventDefault()
          // a «Новое» card is closed by the same keys that pause
          if (res(world, Unlocks).cardQ.length) res(world, Unlocks).cardQ.shift()
          else gs().speed = gs().speed === 0 ? 1 : 0
        }),
      ),
      // Esc steps back one thing at a time: a card, the book, the menu, the sheep in the hand (put down under it), the
      // tool or selection — and then opens the menu
      k.on('cancel', () => {
        const app = useAppStore.getState()
        if (res(world, Unlocks).cardQ.length) return void res(world, Unlocks).cardQ.shift()
        if (app.book) return app.setBook(false)
        if (app.screen !== 'run') return
        if (app.menuOver) return app.closeMenu()
        const h = ui().hover
        const held = ui().drag
        if (held && h) {
          dropSheep(world, held, h.wx, h.wy)
          ui().drag = null
          return
        }
        if (ui().tool !== 'hand' || ui().sel || ui().pending) {
          setTool(world, 'hand')
          ui().sel = null
          return
        }
        app.openMenu()
      }),
      k.on(
        'book',
        field(() => {
          const app = useAppStore.getState()
          if (app.screen === 'run') app.setBook(!app.book)
        }),
      ),
      k.on(
        'rotate',
        field(() => {
          const h = ui().hover
          const b = h?.b && ui().tool === 'hand' ? res(world, Plant).b.get(h.b) : null
          if (b) rotate(world, b)
          else ui().rot = ((ui().rot + 1) % 4) as 0 | 1 | 2 | 3
        }),
      ),
      k.on(
        'erase',
        field(() => {
          const h = ui().hover
          const hb = h?.b ? res(world, Plant).b.get(h.b) : null
          if (h) remove(world, hb?.x ?? h.x, hb?.y ?? h.y)
        }),
      ),
      // keys 1–9 and 0 pick a quick-bar slot; with the book open they put the building under the pointer into it
      ...Array.from({ length: SLOTS }, (_, i) =>
        k.on(
          ('tool' + (i + 1)) as Action,
          field(() => {
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
      traits: { GameState, Plant, Flock, Unlocks, Ui, Field },
      coins: (n: number) => (res(world, GameState).coins += n),
      speed: (n: number) => (res(world, GameState).speed = n),
      start: () => useAppStore.getState().start(),
      unlockAll: () => TOOL_ORDER.forEach((t) => res(world, Unlocks).unlocked.add(t)),
      /** Buy a recipe as the player would (coins permitting). */
      recipe: (t: (typeof TOOL_ORDER)[number]) => buyRecipe(world, t),
      /** Screen point (CSS px) of a field point, for scripted clicks. */
      project: (x: number, z: number) => {
        const v = new Vector3(x, 0, z).project(camera)
        return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height }
      },
      /** Let the bot play this game live (like a player), at the given speed; `autoplay(false)` stops it. */
      autoplay: (on = true, speed = 2) => {
        clearInterval(autoTimer)
        if (!on) return
        const bot = createBot(world)
        res(world, GameState).speed = speed
        // its hand counts game seconds: a tick of 0.1 s of real time is 0.1 × speed of the game's
        autoTimer = setInterval(() => bot.act(0.1 * speed), 100) as unknown as number
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
      /** Draw every kind of sheep on one sheet, docs/concept/shots/sheep-sheet.png (render/sheepSheet.ts). */
      sheep: () => renderSheepSheet(gl),
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
      /** A factory bigger than a real one, for measuring (game/stress.ts). */
      stress: (sheep?: number) => buildStress(world, { sheep }),
      /** A factory built whole (game/showcase.ts), for screenshots. */
      showcase: (warmup = 60) => buildShowcase(world, warmup),
      /** Play the game headless with the bot and print when the score reached each 50. */
      simulate: (seconds = 1800) => {
        const w = startWorld({ seed: 7 })
        const r = runBot(w, seconds)
        w.destroy()
        console.table(r.marks)
        return r
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
    if (k && isOn(world, 'keys')) {
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
    if (isOn(world, 'hud') && ++hudN.current >= HUD_EVERY) {
      hudN.current = 0
      pushHud(world, camera, size)
    }
  }, -100)
  return null
}

const _v = new Vector3()
let autoTimer = 0

/**
 * The line at the top (GDD 8): a wrong sheep stopping a line first; then the first steps — shear a sheep by hand, carry
 * it into the portal, buy a recipe — and later what the score waits for.
 */
function hintOf(world: World): GoalHud {
  const gs = res(world, GameState),
    un = res(world, Unlocks)
  for (const b of res(world, Plant).b.values()) if (wrongNow(world, b)) return { tone: 'warn', icon: b.type === 'dock' ? 'portal' : b.type, text: 'wrongGoal' }
  const flock = res(world, Flock).sheep
  if (!gs.shorn && !flock.some((s) => s.wool < 1)) return { tone: 'plain', icon: 'shear', text: 'shearGoal' }
  if (!gs.shorn && !un.unlocked.size) return { tone: 'plain', icon: 'portal', text: 'portalGoal' }
  if (!un.unlocked.size) return { tone: 'plain', icon: 'book', text: 'recipeGoal' }
  // a shorn sheep left roaming: carry it in
  if (flock.some((s) => s.wool < 1 && s.state === 'roam')) return { tone: 'plain', icon: 'portal', text: 'portalGoal' }
  return null
}

/** Rebuild the HUD's plain snapshot from the world. */
function pushHud(world: World, camera: Parameters<typeof _v.project>[0], size: { width: number; height: number }) {
  const gs = res(world, GameState),
    ui = res(world, Ui),
    un = res(world, Unlocks)
  // where the selection's popup hangs: just right of the selected thing, projected to the screen
  let popAt: { x: number; y: number } | null = null
  const sel = ui.sel
  if (sel) {
    const b = res(world, Plant).b.get(sel.key)
    if (b) {
      _v.set(b.x + b.w, 0.6, b.y + 0.2)
      _v.project(camera)
      popAt = { x: ((_v.x + 1) / 2) * size.width, y: ((1 - _v.y) / 2) * size.height }
    } else ui.sel = null
  }
  const hud = useHudStore.getState()
  hud.set({
    coins: gs.coins,
    noMoney: gs.noMoney,
    pauseNudge: gs.pauseNudge,
    clock: gs.clock,
    speed: gs.speed,
    shorn: gs.shorn,
    goal: GOAL.sheep,
    won: gs.won,
    nextKind: nextKind(world),
    hint: hintOf(world),
    tools: barOf(useAppStore.getState().bar, un.unlocked).map((t) => (t ? { id: t, price: buildPrice(world, t), short: gs.coins < buildPrice(world, t), fresh: un.fresh.has(t) } : null)),
    tool: ui.tool,
    sel: ui.sel,
    popAt,
    card: un.cardQ[0] ?? null,
    tick: hud.tick + 1,
  })
}
