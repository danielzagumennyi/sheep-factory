import { create } from 'zustand'

/**
 * Two languages, one table. Every string the player reads is a `Text` — both languages side by side — so a string
 * that exists in one language and not the other is a compile error rather than a blank on screen. Russian is the
 * game's own language; English follows the browser.
 */
export type Lang = 'ru' | 'en'
export const LANGS: readonly Lang[] = ['ru', 'en']
export type Text = Readonly<Record<Lang, string>>
export type Params = Readonly<Record<string, string | number>>

function detectLang(): Lang {
  try {
    const saved = globalThis.localStorage?.getItem('ovf.lang')
    if (saved === 'ru' || saved === 'en') return saved
    return /^ru\b/i.test(globalThis.navigator?.language ?? 'ru') ? 'ru' : 'en'
  } catch {
    return 'ru'
  }
}

export const useLang = create<{ lang: Lang }>(() => ({ lang: detectLang() }))
export const getLang = () => useLang.getState().lang
export function setLang(lang: Lang) {
  useLang.setState({ lang })
  try {
    globalThis.localStorage?.setItem('ovf.lang', lang)
  } catch {
    // private mode: the choice lasts until reload
  }
}

const fill = (s: string, params?: Params) => (params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s)
/** A string in the current language, with `{name}` placeholders filled. */
export const tx = (text: Text, params?: Params) => fill(text[getLang()], params)
/** The same inside React: re-renders when the language changes. */
export function useT() {
  const lang = useLang((s) => s.lang)
  return { lang, t: (text: Text, params?: Params) => fill(text[lang], params) }
}
