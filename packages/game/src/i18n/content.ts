import type { BuildingId, CardId, ItemId, MissionId, ResId } from '@/game/balance'
import type { WhyNot } from '@/game/grid'
import type { Text } from '.'

/**
 * Names and one-line descriptions of everything in the game. Numbers never appear here: they live in balance.ts.
 * Docks have no client names (the author, 15.10.2026: «пиши нормально, что нужно»): a dock shows the good it wants.
 */

export const ITEM_NAMES: Readonly<Record<ItemId | 'sheep', Text>> = {
  wool: { ru: 'Шерсть', en: 'Wool' },
  roving: { ru: 'Ровница', en: 'Roving' },
  yarn: { ru: 'Пряжа', en: 'Yarn' },
  felt: { ru: 'Войлок', en: 'Felt' },
  dye: { ru: 'Краска', en: 'Dye' },
  cyarn: { ru: 'Цветная пряжа', en: 'Coloured yarn' },
  sweater: { ru: 'Свитер', en: 'Sweater' },
  valenki: { ru: 'Валенки', en: 'Felt boots' },
  hay: { ru: 'Сено', en: 'Hay' },
  water: { ru: 'Вода', en: 'Water' },
  sheep: { ru: 'Овца', en: 'Sheep' },
}

/** One line on each good for the book: what it is, what it is for. */
export const ITEM_DESC: Readonly<Record<ItemId, Text>> = {
  wool: { ru: 'С овцы: стригальня или три клика', en: 'From a sheep: shearer or three clicks' },
  roving: { ru: 'Расчёсанная шерсть, из неё прядут', en: 'Combed wool, ready to spin' },
  yarn: { ru: 'Нить с прялки', en: 'Thread from the spinner' },
  felt: { ru: 'Сбитая шерсть для валенок', en: 'Pressed wool for boots' },
  dye: { ru: 'Краска из ягод', en: 'Dye from berries' },
  cyarn: { ru: 'Пряжа в краске', en: 'Yarn in dye' },
  sweater: { ru: 'Тёплый свитер из пряжи', en: 'A warm yarn sweater' },
  valenki: { ru: 'Валенки из войлока', en: 'Boots of felt' },
  hay: { ru: 'Корм для пастбища', en: 'Food for the pasture' },
  water: { ru: 'Ведро воды для пастбища', en: 'A bucket for the pasture' },
}

export const BUILDING_TEXT: Readonly<Record<BuildingId, { name: Text; desc: Text }>> = {
  belt: { name: { ru: 'Лента', en: 'Belt' }, desc: { ru: 'везёт груз', en: 'carries goods' } },
  shearer: { name: { ru: 'Стригальня', en: 'Shearer' }, desc: { ru: 'стрижёт овец', en: 'shears sheep' } },
  mower: { name: { ru: 'Сенокос', en: 'Mower' }, desc: { ru: 'косит ближний покос вокруг', en: 'mows the nearest meadow' } },
  pump: { name: { ru: 'Насос', en: 'Pump' }, desc: { ru: 'стоит в пруду, качает воду', en: 'stands in a pond, pumps water' } },
  barn: { name: { ru: 'Амбар', en: 'Barn' }, desc: { ru: 'всё привезённое — на склад', en: 'whatever comes in is stocked' } },
  carder: { name: { ru: 'Чесалка', en: 'Carder' }, desc: { ru: 'расчёсывает шерсть в ровницу', en: 'combs wool into roving' } },
  spinner: { name: { ru: 'Прялка', en: 'Spinner' }, desc: { ru: 'прядёт из ровницы нить', en: 'spins roving into yarn' } },
  splitter: { name: { ru: 'Делитель', en: 'Splitter' }, desc: { ru: 'каждому выходу — свой груз', en: 'each side gets its goods' } },
  merger: { name: { ru: 'Объединитель', en: 'Merger' }, desc: { ru: 'сводит до трёх лент в одну', en: 'joins up to three belts' } },
  felter: { name: { ru: 'Валяльня', en: 'Felter' }, desc: { ru: 'сбивает шерсть в войлок', en: 'presses wool into felt' } },
  berry: { name: { ru: 'Ягодник', en: 'Berry picker' }, desc: { ru: 'собирает ближние кусты вокруг', en: 'picks the nearest bushes' } },
  workshop: { name: { ru: 'Мастерская', en: 'Workshop' }, desc: { ru: 'делает по выбранному рецепту', en: 'makes the recipe you pick' } },
  feeder: { name: { ru: 'Кормушка', en: 'Feeder' }, desc: { ru: 'сено для овец пастбища', en: 'hay for the pasture\'s sheep' } },
  trough: { name: { ru: 'Поилка', en: 'Trough' }, desc: { ru: 'вода для овец пастбища', en: 'water for the pasture\'s sheep' } },
}

export const RES_NAMES: Readonly<Record<ResId, Text>> = {
  meadow: { ru: 'покос', en: 'meadow' },
  water: { ru: 'пруд', en: 'pond' },
  bush: { ru: 'кусты', en: 'bushes' },
}

export const MISSION_NAMES: Readonly<Record<MissionId, Text>> = {
  m1: { ru: 'Первая стрижка', en: 'First shearing' },
  m2: { ru: 'Корм и вода', en: 'Food and water' },
  m3: { ru: 'Цех шерсти', en: 'Wool workshop' },
  m4: { ru: 'Войлок', en: 'Felt' },
  m5: { ru: 'Краски', en: 'Dyes' },
  m6: { ru: 'Свитера', en: 'Sweaters' },
  m7: { ru: 'Ярмарка', en: 'The fair' },
}

/** «Новое» cards: a title and one sentence; the icon and recipe come from the card's id. */
export const CARD_TEXT: Readonly<Record<CardId, { title: Text; text: Text }>> = {
  shear: { title: { ru: 'Стрижка', en: 'Shearing' }, text: { ru: '3 клика по пушистой овце', en: '3 clicks on a fluffy sheep' } },
  shearer: { title: { ru: 'Стригальня', en: 'Shearer' }, text: { ru: 'Ставь на выход пастбища', en: 'Put it on the pasture exit' } },
  belt: { title: { ru: 'Лента', en: 'Belt' }, text: { ru: 'Клик у выхода машины, клик у цели', en: 'Click by an output, then by the target' } },
  needs: { title: { ru: 'Корм и вода', en: 'Food and water' }, text: { ru: 'Сено в кормушку, вода в поилку — овца обрастает', en: 'Hay in the feeder, water in the trough: wool grows' } },
  hay: { title: { ru: 'Корм', en: 'Food' }, text: { ru: 'Кликай по покосу, сено — в кормушку', en: 'Click the meadow, hay into the feeder' } },
  mower: { title: { ru: 'Сенокос', en: 'Mower' }, text: { ru: 'Косит покос вокруг. Скошенная клетка исчезает', en: 'Mows around itself. A mown cell is gone' } },
  water: { title: { ru: 'Вода', en: 'Water' }, text: { ru: 'Кликай по пруду, ведро — в поилку', en: 'Click the pond, a bucket into the trough' } },
  pump: { title: { ru: 'Насос', en: 'Pump' }, text: { ru: 'Ставь его в пруд. Вода не кончается', en: 'Stand it in a pond. Water never runs out' } },
  barn: { title: { ru: 'Амбар', en: 'Barn' }, text: { ru: 'Лента в амбар — груз на склад', en: 'A belt into the barn stocks goods' } },
  carder: { title: { ru: 'Чесалка', en: 'Carder' }, text: { ru: 'Расчёсывает шерсть в ровницу', en: 'Combs wool into roving' } },
  spinner: { title: { ru: 'Прялка', en: 'Spinner' }, text: { ru: 'Прядёт из ровницы нить', en: 'Spins roving into yarn' } },
  splitter: { title: { ru: 'Делитель', en: 'Splitter' }, text: { ru: 'Каждому выходу — свой груз', en: 'Each output gets its own goods' } },
  merger: { title: { ru: 'Объединитель', en: 'Merger' }, text: { ru: 'Лента берёт груз с одной стороны. Сводит ленты объединитель', en: 'A belt takes from one side. Join belts with a merger' } },
  felter: { title: { ru: 'Валяльня', en: 'Felter' }, text: { ru: 'Сбивает шерсть в плотный войлок', en: 'Presses wool into thick felt' } },
  dye: { title: { ru: 'Краска', en: 'Dye' }, text: { ru: 'Кликай по ягодному кусту', en: 'Click a berry bush' } },
  berry: { title: { ru: 'Ягодник', en: 'Berry picker' }, text: { ru: 'Собирает кусты вокруг. Пустой куст исчезает', en: 'Picks bushes around it. An empty bush is gone' } },
  extra: { title: { ru: 'Сверх заказа', en: 'Beyond the order' }, text: { ru: 'Заказ выполнен. Лишнее берут за полцены', en: 'Order done. Extra goods sell at half' } },
  land: { title: { ru: 'Участки', en: 'Land' }, text: { ru: 'Ресурс кончается? Купи соседний участок', en: 'Running out? Buy the next plot' } },
  market: { title: { ru: 'Рынок', en: 'Market' }, text: { ru: 'Берёт любой товар за ¼ цены', en: 'Takes any goods for ¼ price' } },
  workshop: { title: { ru: 'Мастерская', en: 'Workshop' }, text: { ru: 'Рецепт выбирается в её окне', en: 'Pick the recipe in its popup' } },
  sweater: { title: { ru: 'Рецепт: свитер', en: 'Recipe: sweater' }, text: { ru: 'Выбери его в окне мастерской', en: 'Pick it in a workshop popup' } },
  valenki: { title: { ru: 'Рецепт: валенки', en: 'Recipe: felt boots' }, text: { ru: 'Выбери его в окне мастерской', en: 'Pick it in a workshop popup' } },
}

/** Why a building may not stand here: the short label under the ghost. */
export const WHY_TEXT: Readonly<Record<Exclude<WhyNot, ''>, Text>> = {
  edge: { ru: 'край', en: 'edge' },
  buyPlot: { ru: 'купи участок', en: 'buy the plot' },
  road: { ru: 'дорога', en: 'road' },
  pasture: { ru: 'пастбище', en: 'pasture' },
  onWater: { ru: 'на воде нельзя', en: 'not on water' },
  rock: { ru: 'мешает камень', en: 'a rock is here' },
  tree: { ru: 'мешает дерево', en: 'a tree is here' },
  bush: { ru: 'мешает куст', en: 'a bush is here' },
  meadow: { ru: 'на покосе нельзя', en: 'not on the meadow' },
  taken: { ru: 'занято', en: 'taken' },
  bridge: { ru: 'мост — только лента', en: 'bridge: belts only' },
  needMeadow: { ru: 'нужен покос рядом', en: 'needs a meadow near' },
  needWater: { ru: 'нужен пруд рядом', en: 'needs a pond near' },
  needBush: { ru: 'нужны кусты рядом', en: 'needs bushes near' },
  foreignRes: { ru: 'ресурс на чужом участке', en: 'resource on unowned land' },
  inWater: { ru: 'насос ставится в пруд', en: 'the pump stands in a pond' },
}

/** A machine's state line in its popup (machineState's text keys). */
export const STATE_TEXT: Readonly<Record<string, Text>> = {
  sheepWaits: { ru: 'овца ждёт у выхода', en: 'a sheep waits at the exit' },
  outBlocked: { ru: 'выход занят', en: 'output blocked' },
  shearing: { ru: 'стрижёт', en: 'shearing' },
  waitsSheep: { ru: 'ждёт овцу', en: 'waiting for a sheep' },
  emptyAround: { ru: 'вокруг пусто — перенеси', en: 'nothing around — move it' },
  producing: { ru: 'работает, запас {n}', en: 'working, {n} left' },
  working: { ru: 'работает', en: 'working' },
  waitsFor: { ru: 'ждёт: {item}', en: 'waiting for {item}' },
}

/** Words that float up from the field (the simulation emits these keys; numbers float as they are). */
export const FX_TEXT: Readonly<Record<string, Text>> = {
  toHand: { ru: '→ на склад', en: '→ to stock' },
}
