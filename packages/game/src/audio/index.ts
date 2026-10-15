import type { SoundId } from '@/game/world'

/**
 * The game's sounds: the author's recordings (public/sfx), and only these for now — a building set down, one removed,
 * a click on any button. The simulation queues the first two as events (FxView plays them); the click is the page's
 * own: any button pressed anywhere in the UI. Each file is fetched and decoded once, on first use, and the same sound
 * is not started again within `GAP` ms, so a line of belts laid at once is one sound, not twenty.
 */
type Sample = SoundId | 'click'
const FILES: Readonly<Record<Sample, string>> = { place: 'place.m4a', remove: 'remove.m4a', click: 'click.m4a' }
const GAP = 70
const VOLUME = 0.8

let ctx: AudioContext | null = null
let gain: GainNode | null = null
let on = true
const buffers = new Map<Sample, Promise<AudioBuffer | null>>()
const last = new Map<Sample, number>()

function context() {
  if (!ctx) {
    ctx = new AudioContext()
    gain = ctx.createGain()
    gain.gain.value = VOLUME
    gain.connect(ctx.destination)
  }
  return ctx
}
function load(s: Sample) {
  let p = buffers.get(s)
  if (!p) {
    p = fetch(import.meta.env.BASE_URL + 'sfx/' + FILES[s])
      .then((r) => r.arrayBuffer())
      .then((b) => context().decodeAudioData(b))
      .catch(() => null)
    buffers.set(s, p)
  }
  return p
}

function play(s: Sample) {
  if (!on) return
  const now = performance.now()
  if (now - (last.get(s) ?? -1e9) < GAP) return
  last.set(s, now)
  const c = context()
  if (c.state === 'suspended') void c.resume()
  void load(s).then((buf) => {
    if (!buf || !gain) return
    const src = c.createBufferSource()
    src.buffer = buf
    src.connect(gain)
    src.start()
  })
}

export function playSound(id: SoundId) {
  play(id)
}
export function setSoundOn(enabled: boolean) {
  on = enabled
}

// a click on any button of the interface — the HUD, the menus, the book
if (typeof document !== 'undefined')
  document.addEventListener(
    'click',
    (e) => {
      if ((e.target as Element | null)?.closest?.('button')) play('click')
    },
    true,
  )
