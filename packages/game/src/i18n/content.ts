import type { BuildingId, CardId, ClientId, ItemId, ResId } from '@/game/balance'
import type { WhyNot } from '@/game/grid'
import type { Text } from '.'

/**
 * Names and one-line descriptions of everything in the game. Numbers never appear here: they live in balance.ts.
 * Each client's name stands over its bar in the HUD and the market's window (the author, 15.10.2026: «пиши нормально,
 * что нужно»); on the market hall its sign shows its good.
 */

export const ITEM_NAMES: Readonly<Record<ItemId | 'sheep', Text>> = {
  wool: { ru: 'Шерсть', en: 'Wool' },
  cwool: { ru: 'Цветная шерсть', en: 'Coloured wool' },
  thread: { ru: 'Нитки', en: 'Thread' },
  cthread: { ru: 'Цветные нитки', en: 'Coloured thread' },
  yarn: { ru: 'Пряжа', en: 'Yarn' },
  cyarn: { ru: 'Цветная пряжа', en: 'Coloured yarn' },
  sweater: { ru: 'Свитер', en: 'Sweater' },
  csweater: { ru: 'Цветной свитер', en: 'Coloured sweater' },
  felt: { ru: 'Войлок', en: 'Felt' },
  cfelt: { ru: 'Цветной войлок', en: 'Coloured felt' },
  dye: { ru: 'Краска', en: 'Dye' },
  hay: { ru: 'Сено', en: 'Hay' },
  sheep: { ru: 'Овца', en: 'Sheep' },
}

/** One line on each good for the book: what it is, what it is for. */
export const ITEM_DESC: Readonly<Record<ItemId, Text>> = {
  wool: { ru: 'С овцы без станций', en: 'From a sheep with no stations' },
  cwool: { ru: 'С цветной овцы без станций', en: 'From a coloured sheep, no stations' },
  thread: { ru: 'С овцы после одной станции', en: 'From a sheep after one station' },
  cthread: { ru: 'Цветная овца, одна станция', en: 'Coloured sheep, one station' },
  yarn: { ru: 'С овцы после двух станций', en: 'From a sheep after two stations' },
  cyarn: { ru: 'Цветная овца, две станции', en: 'Coloured sheep, two stations' },
  sweater: { ru: 'С овцы после трёх станций', en: 'From a sheep after three stations' },
  csweater: { ru: 'Цветная овца, три станции', en: 'Coloured sheep, three stations' },
  felt: { ru: 'С овцы из бани', en: 'From a sheep out of the bath' },
  cfelt: { ru: 'С цветной овцы из бани', en: 'From a coloured sheep out of the bath' },
  dye: { ru: 'Краска из ягод', en: 'Dye from berries' },
  hay: { ru: 'Корм для овец', en: 'Food for the sheep' },
}

export const BUILDING_TEXT: Readonly<Record<BuildingId, { name: Text; desc: Text }>> = {
  belt: { name: { ru: 'Лента', en: 'Belt' }, desc: { ru: 'везёт груз и овец', en: 'carries goods and sheep' } },
  pen: { name: { ru: 'Загон', en: 'Pen' }, desc: { ru: 'дом для четырёх овец', en: 'a home for four sheep' } },
  sheep: { name: { ru: 'Овца', en: 'Sheep' }, desc: { ru: 'спустится на парашюте, куда кликнешь', en: 'parachutes down where you click' } },
  shearer: { name: { ru: 'Стрижка', en: 'Shearing' }, desc: { ru: 'снимает с овцы, что выросло', en: 'takes off what grew on a sheep' } },
  feeder: { name: { ru: 'Кормушка', en: 'Feeder' }, desc: { ru: 'кормит голодную овцу, сено справа', en: 'feeds a hungry sheep, hay from the right' } },
  dyer: { name: { ru: 'Покраска', en: 'Dyeing' }, desc: { ru: 'красит овцу, краска справа', en: 'colours a sheep, dye from the right' } },
  comb: { name: { ru: 'Расчёска', en: 'Combing' }, desc: { ru: 'расчёсывает овцу: +1 к товару', en: 'combs a sheep: one step up' } },
  curl: { name: { ru: 'Завивка', en: 'Curling' }, desc: { ru: 'завивает овцу: +1 к товару', en: 'curls a sheep: one step up' } },
  knit: { name: { ru: 'Вязка', en: 'Knitting' }, desc: { ru: 'вяжет свитер на овце: +1', en: 'knits a sweater on a sheep: one step up' } },
  bath: { name: { ru: 'Баня', en: 'Bath' }, desc: { ru: 'у воды: овца даёт войлок', en: 'by water: the sheep gives felt' } },
  mower: { name: { ru: 'Сенокос', en: 'Mower' }, desc: { ru: 'косит ближний покос вокруг', en: 'mows the nearest meadow' } },
  berry: { name: { ru: 'Ягодник', en: 'Berry picker' }, desc: { ru: 'собирает ближние кусты вокруг', en: 'picks the nearest bushes' } },
  seeder: { name: { ru: 'Сеялка', en: 'Seeder' }, desc: { ru: 'сеет вокруг то, что привезли', en: 'sows round it what comes in' } },
  splitter: { name: { ru: 'Делитель', en: 'Splitter' }, desc: { ru: 'каждому выходу — свой груз', en: 'each side gets its goods' } },
  merger: { name: { ru: 'Объединитель', en: 'Merger' }, desc: { ru: 'сводит до трёх лент в одну', en: 'joins up to three belts' } },
  sow: { name: { ru: 'Посев', en: 'Sowing' }, desc: { ru: 'клик — семя со склада', en: 'click: a seed from stock' } },
}

export const RES_NAMES: Readonly<Record<ResId | 'sprout', Text>> = {
  meadow: { ru: 'покос', en: 'meadow' },
  bush: { ru: 'кусты', en: 'bushes' },
  sprout: { ru: 'всходы', en: 'sprouts' },
}

/** The market's clients: their rows in the HUD and the market's window, and the book. */
export const CLIENT_NAMES: Readonly<Record<ClientId, Text>> = {
  post: { ru: 'Почта', en: 'Post office' },
  shop: { ru: 'Магазин', en: 'Shop' },
  atelier: { ru: 'Ателье', en: 'Atelier' },
  cobbler: { ru: 'Сапожник', en: 'Cobbler' },
  school: { ru: 'Школа', en: 'School' },
  fair: { ru: 'Ярмарка', en: 'Fair' },
}

/** «Новое» cards: a title and one sentence; the icon and recipe come from the card's id. */
export const CARD_TEXT: Readonly<Record<CardId, { title: Text; text: Text }>> = {
  shearer: { title: { ru: 'Стрижка', en: 'Shearing' }, text: { ru: 'Ставь на выход загона', en: 'Put it on the pen’s way out' } },
  belt: { title: { ru: 'Лента', en: 'Belt' }, text: { ru: 'Петля от стрижки обратно во вход', en: 'A loop from the shearing back in' } },
  pen: { title: { ru: 'Загон', en: 'Pen' }, text: { ru: 'Поставь и перетащи туда овец', en: 'Place it, drag the sheep in' } },
  shear: { title: { ru: 'Стрижка', en: 'Shearing' }, text: { ru: 'Три клика по пушистой овце', en: 'Three clicks on a fluffy sheep' } },
  sheep: { title: { ru: 'Овцы', en: 'Sheep' }, text: { ru: 'Купи овцу — прилетит на парашюте', en: 'Buy a sheep: it parachutes in' } },
  mower: { title: { ru: 'Сенокос', en: 'Mower' }, text: { ru: 'Косит покос вокруг. Скошенное исчезает', en: 'Mows around itself. Mown cells go' } },
  feeder: { title: { ru: 'Овцы едят', en: 'Sheep eat' }, text: { ru: 'Кормушка на петлю, сено справа', en: 'A feeder on the loop, hay from the right' } },
  comb: { title: { ru: 'Расчёска', en: 'Combing' }, text: { ru: 'Расчёсанная овца даёт нитки', en: 'A combed sheep gives thread' } },
  splitter: { title: { ru: 'Делитель', en: 'Splitter' }, text: { ru: 'Каждому выходу — свой груз', en: 'Each output gets its own goods' } },
  curl: { title: { ru: 'Завивка', en: 'Curling' }, text: { ru: 'Две станции на петле — пряжа', en: 'Two stations on a loop: yarn' } },
  merger: { title: { ru: 'Объединитель', en: 'Merger' }, text: { ru: 'Сводит до трёх лент в одну', en: 'Joins up to three belts' } },
  bath: { title: { ru: 'Баня', en: 'Bath' }, text: { ru: 'Ставь у воды: овца даёт войлок', en: 'By water: the sheep gives felt' } },
  sow: { title: { ru: 'Посев', en: 'Sowing' }, text: { ru: 'Семя на клетку — через минуту покос', en: 'A seed: a meadow in a minute' } },
  berry: { title: { ru: 'Ягодник', en: 'Berry picker' }, text: { ru: 'Собирает кусты вокруг. Пустой куст исчезает', en: 'Picks bushes around it. An empty bush is gone' } },
  dyer: { title: { ru: 'Покраска', en: 'Dyeing' }, text: { ru: 'Цветная овца — цветной товар', en: 'A coloured sheep, coloured goods' } },
  seeder: { title: { ru: 'Сеялка', en: 'Seeder' }, text: { ru: 'Сеет вокруг себя то, что привезла лента', en: 'Sows round itself what the belt brings' } },
  knit: { title: { ru: 'Вязка', en: 'Knitting' }, text: { ru: 'Три станции на петле — свитер', en: 'Three stations on a loop: a sweater' } },
  market: { title: { ru: 'Торговля', en: 'Trade' }, text: { ru: 'Покупай и продавай в окне рынка', en: 'Buy and sell at the market' } },
  land: { title: { ru: 'Участки', en: 'Land' }, text: { ru: 'Покос кончается? Купи соседний участок', en: 'Running out? Buy the next plot' } },
  island: { title: { ru: 'Остров растёт', en: 'The island grows' }, text: { ru: 'Новые участки на краю острова', en: 'New plots at the island’s edge' } },
  chapter: { title: { ru: 'Глава 1', en: 'Chapter 1' }, text: { ru: 'Все довольны. Спрос растёт дальше', en: 'Everyone’s content. Demand grows on' } },
}

/** Why a building may not stand here: the short label under the ghost. */
export const WHY_TEXT: Readonly<Record<Exclude<WhyNot, ''>, Text>> = {
  edge: { ru: 'край', en: 'edge' },
  buyPlot: { ru: 'купи участок', en: 'buy the plot' },
  pasture: { ru: 'загон', en: 'pen' },
  onWater: { ru: 'на воде нельзя', en: 'not on water' },
  rock: { ru: 'мешает камень', en: 'a rock is here' },
  tree: { ru: 'мешает дерево', en: 'a tree is here' },
  bush: { ru: 'мешает куст', en: 'a bush is here' },
  meadow: { ru: 'на покосе нельзя', en: 'not on the meadow' },
  sprout: { ru: 'тут всходы', en: 'sprouts here' },
  taken: { ru: 'занято', en: 'taken' },
  needBush: { ru: 'нужны кусты рядом', en: 'needs bushes near' },
  needWater: { ru: 'нужна вода рядом', en: 'needs water near' },
  foreignRes: { ru: 'ресурс на чужом участке', en: 'resource on unowned land' },
  penFull: { ru: 'загон полон', en: 'the pen is full' },
}

/** A machine's state line in its popup (machineState's text keys). */
export const STATE_TEXT: Readonly<Record<string, Text>> = {
  sheepWaits: { ru: 'овца ждёт у выхода', en: 'a sheep waits at the exit' },
  outBlocked: { ru: 'выход занят', en: 'output blocked' },
  waitsSheep: { ru: 'ждёт овцу', en: 'waiting for a sheep' },
  emptyAround: { ru: 'вокруг пусто — перенеси', en: 'nothing around — move it' },
  noRoom: { ru: 'вокруг негде сеять', en: 'no room round it to sow' },
  producing: { ru: 'работает, запас {n}', en: 'working, {n} left' },
  working: { ru: 'работает', en: 'working' },
  waitsFor: { ru: 'ждёт: {item}', en: 'waiting for {item}' },
}

/** Words that float up from the field (the simulation emits these keys; numbers float as they are). */
export const FX_TEXT: Readonly<Record<string, Text>> = {
  toHand: { ru: '→ на склад', en: '→ to stock' },
  noHay: { ru: 'нет сена', en: 'no hay' },
  noSeed: { ru: 'нет семян', en: 'no seeds' },
  penFull: { ru: 'в загоне овцы', en: 'sheep live here' },
  taken: { ru: 'занято', en: 'taken' },
  noRoom: { ru: 'нет места', en: 'no room' },
}
