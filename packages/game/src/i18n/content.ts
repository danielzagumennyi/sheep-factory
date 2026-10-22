import type { BuildingId, CardId, KindId, NeedId } from '@/game/balance'
import type { WhyNot } from '@/game/grid'
import type { SplitRule } from '@/game/world'
import type { Text } from '.'

/** Names and one-line descriptions of everything in the game. Numbers never appear here: they live in balance.ts. */

export const BUILDING_TEXT: Readonly<Record<BuildingId, { name: Text; desc: Text }>> = {
  belt: { name: { ru: 'Лента', en: 'Belt' }, desc: { ru: 'везёт овец', en: 'carries sheep' } },
  shearer: { name: { ru: 'Стрижка', en: 'Shearing' }, desc: { ru: 'стрижёт готовую овцу', en: 'shears a ready sheep' } },
  carrot: { name: { ru: 'Морковка', en: 'Carrot' }, desc: { ru: 'зовёт пушистых овец на ленту', en: 'calls fluffy sheep onto its belt' } },
  scare: { name: { ru: 'Пугало', en: 'Scarecrow' }, desc: { ru: 'прогоняет овец из круга', en: 'drives sheep out of its circle' } },
  splitter: { name: { ru: 'Делитель', en: 'Splitter' }, desc: { ru: 'каждому выходу — свои овцы', en: 'each side gets its sheep' } },
  merger: { name: { ru: 'Объединитель', en: 'Merger' }, desc: { ru: 'сводит до трёх лент в одну', en: 'joins up to three belts' } },
  wash: { name: { ru: 'Мойка', en: 'Wash' }, desc: { ru: 'моет грязную овцу, у воды', en: 'washes a dirty sheep, by water' } },
  comb: { name: { ru: 'Расчёска', en: 'Comb' }, desc: { ru: 'расчёсывает нечёсаную овцу', en: 'combs a tangled sheep' } },
  pick: { name: { ru: 'Щипалка', en: 'Picker' }, desc: { ru: 'снимает с овцы репьи', en: 'picks the burrs off a sheep' } },
}

/** The kinds of sheep (GDD 5). */
export const KIND_TEXT: Readonly<Record<KindId, Text>> = {
  plain: { ru: 'Овца', en: 'Sheep' },
  dirty: { ru: 'Грязная', en: 'Dirty' },
  tangled: { ru: 'Нечёсаная', en: 'Tangled' },
  burrs: { ru: 'С репьями', en: 'With burrs' },
}

/** What a sheep needs next (systems/machines.ts `nextFor`): its station, the shears, the portal. */
export const NEED_TEXT: Readonly<Record<NeedId | 'shear' | 'portal', Text>> = {
  wash: { ru: 'помыть', en: 'wash' },
  comb: { ru: 'расчесать', en: 'comb' },
  pick: { ru: 'снять репьи', en: 'pick burrs' },
  shear: { ru: 'постричь', en: 'shear' },
  portal: { ru: 'в портал', en: 'to the portal' },
}

/** A splitter's rules (GDD 4.4): which sheep a side takes. */
export const RULE_TEXT: Readonly<Record<SplitRule, Text>> = {
  any: { ru: 'все', en: 'any' },
  wash: { ru: 'грязные', en: 'dirty' },
  comb: { ru: 'нечёсаные', en: 'tangled' },
  pick: { ru: 'с репьями', en: 'with burrs' },
  ready: { ru: 'готовые', en: 'ready' },
  shorn: { ru: 'стриженые', en: 'shorn' },
  off: { ru: 'закрыт', en: 'closed' },
}

/** «Новое» cards: a title and one sentence; the icon comes from the card's id. */
export const CARD_TEXT: Readonly<Record<CardId, { title: Text; text: Text }>> = {
  shear: { title: { ru: 'Стрижка', en: 'Shearing' }, text: { ru: 'Три клика, потом неси в портал', en: 'Three snips, then to the portal' } },
  belt: { title: { ru: 'Лента', en: 'Belt' }, text: { ru: 'Лента везёт овец к порталу', en: 'Belts carry sheep to the portal' } },
  shearer: { title: { ru: 'Стрижка', en: 'Shearing' }, text: { ru: 'Ставь на ленту к порталу', en: 'Belt it to the portal' } },
  carrot: { title: { ru: 'Морковка', en: 'Carrot' }, text: { ru: 'Зовёт овец на свою ленту', en: 'Calls sheep onto its belt' } },
  scare: { title: { ru: 'Пугало', en: 'Scarecrow' }, text: { ru: 'Расчищает место для стройки', en: 'Clears room for building' } },
  splitter: { title: { ru: 'Делитель', en: 'Splitter' }, text: { ru: 'Разводит овец по нуждам', en: 'Sorts sheep by their needs' } },
  merger: { title: { ru: 'Объединитель', en: 'Merger' }, text: { ru: 'Сводит до трёх лент', en: 'Joins up to three belts' } },
  wash: { title: { ru: 'Мойка', en: 'Wash' }, text: { ru: 'Ставь у воды', en: 'Put it by water' } },
  comb: { title: { ru: 'Расчёска', en: 'Comb' }, text: { ru: 'Для нечёсаных овец', en: 'For tangled sheep' } },
  pick: { title: { ru: 'Щипалка', en: 'Picker' }, text: { ru: 'Для овец с репьями', en: 'For sheep with burrs' } },
  dirty: { title: { ru: 'Грязные овцы', en: 'Dirty sheep' }, text: { ru: 'Сначала Мойка, потом стрижка', en: 'Wash first, then shear' } },
  tangled: { title: { ru: 'Нечёсаные овцы', en: 'Tangled sheep' }, text: { ru: 'Сначала Расчёска, потом стрижка', en: 'Comb first, then shear' } },
  burrs: { title: { ru: 'Овцы с репьями', en: 'Sheep with burrs' }, text: { ru: 'Сначала Щипалка, потом стрижка', en: 'Pick the burrs, then shear' } },
  win: { title: { ru: 'Все пострижены!', en: 'All shorn!' }, text: { ru: 'Цель достигнута', en: 'The goal is reached' } },
}

/** Why a building may not stand here: the short label under the ghost. */
export const WHY_TEXT: Readonly<Record<Exclude<WhyNot, ''>, Text>> = {
  edge: { ru: 'край', en: 'edge' },
  hill: { ru: 'на холме нельзя', en: 'not on a hill' },
  onWater: { ru: 'на воде нельзя', en: 'not on water' },
  rock: { ru: 'мешает камень', en: 'a rock is here' },
  tree: { ru: 'мешает дерево', en: 'a tree is here' },
  bush: { ru: 'мешает куст', en: 'a bush is here' },
  taken: { ru: 'занято', en: 'taken' },
  needWater: { ru: 'нужна вода рядом', en: 'needs water near' },
  sheepHere: { ru: 'тут овцы', en: 'sheep here' },
}

/** A building's state line in its popup (machineState's text keys). */
export const STATE_TEXT: Readonly<Record<string, Text>> = {
  wrongSheep: { ru: 'не та овца: {need}', en: 'wrong sheep: {need}' },
  outBlocked: { ru: 'выход занят', en: 'output blocked' },
  waitsSheep: { ru: 'ждёт овцу', en: 'waiting for a sheep' },
  working: { ru: 'работает', en: 'working' },
  nearSheep: { ru: 'овец рядом: {n}', en: 'sheep near: {n}' },
}

/** Words that float up from the field (the simulation emits these keys; numbers float as they are). */
export const FX_TEXT: Readonly<Record<string, Text>> = {
  taken: { ru: 'занято', en: 'taken' },
}
