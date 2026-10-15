/**
 * Named keyboard actions. Bindings use `KeyboardEvent.code`, so they work the same on any layout (R is R on a Russian
 * keyboard too). `held` answers "is it down now" for continuous actions like panning; `on` calls back once per press
 * for one-shot actions. Typing into an input or a textarea never triggers anything.
 */
export type KeyBindings<A extends string> = Readonly<Record<A, readonly string[]>>

export class KeyInput<A extends string> {
  private down = new Set<string>()
  private handlers = new Map<A, ((e: KeyboardEvent) => void)[]>()
  private target: Window | null = null
  private readonly byCode = new Map<string, A[]>()

  constructor(private readonly bindings: KeyBindings<A>) {
    for (const [a, codes] of Object.entries(bindings) as [A, readonly string[]][])
      for (const c of codes) {
        if (!this.byCode.has(c)) this.byCode.set(c, [])
        this.byCode.get(c)!.push(a)
      }
  }

  held(a: A) {
    return this.bindings[a].some((c) => this.down.has(c))
  }

  /** Call `fn` on every press of `a`; returns the unsubscribe. */
  on(a: A, fn: (e: KeyboardEvent) => void) {
    if (!this.handlers.has(a)) this.handlers.set(a, [])
    this.handlers.get(a)!.push(fn)
    return () => {
      const l = this.handlers.get(a)
      if (l) l.splice(l.indexOf(fn), 1)
    }
  }

  attach(target: Window) {
    this.target = target
    target.addEventListener('keydown', this.onDown)
    target.addEventListener('keyup', this.onUp)
    target.addEventListener('blur', this.onBlur)
  }

  detach() {
    const t = this.target
    if (!t) return
    t.removeEventListener('keydown', this.onDown)
    t.removeEventListener('keyup', this.onUp)
    t.removeEventListener('blur', this.onBlur)
    this.target = null
    this.down.clear()
  }

  private onDown = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null
    if (el && el.closest?.('input,textarea,select')) return
    const first = !this.down.has(e.code)
    this.down.add(e.code)
    if (!first) return
    for (const a of this.byCode.get(e.code) ?? []) for (const fn of this.handlers.get(a) ?? []) fn(e)
  }
  private onUp = (e: KeyboardEvent) => {
    this.down.delete(e.code)
  }
  private onBlur = () => this.down.clear()
}
