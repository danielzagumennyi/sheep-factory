import type { BuildingId, CardId, ClientId, ItemId, ResId } from '@/game/balance'
import type { WhyNot } from '@/game/grid'
import type { Text } from '.'

/**
 * Names and one-line descriptions of everything in the game. Numbers never appear here: they live in balance.ts.
 * A sign over each client's bay at the market shows its name and the good it asks for (the author, 15.10.2026: «пиши
 * нормально, что нужно»).
 */

export const ITEM_NAMES: Readonly<Record<ItemId | 'sheep', Text>> = {
  wool: { ru: 'Шерсть', en: 'Wool' },
  pwool: { ru: 'Розовая шерсть', en: 'Pink wool' },
  roving: { ru: 'Ровница', en: 'Roving' },
  proving: { ru: 'Розовая ровница', en: 'Pink roving' },
  yarn: { ru: 'Пряжа', en: 'Yarn' },
  pyarn: { ru: 'Розовая пряжа', en: 'Pink yarn' },
  felt: { ru: 'Войлок', en: 'Felt' },
  dye: { ru: 'Краска', en: 'Dye' },
  sweater: { ru: 'Свитер', en: 'Sweater' },
  valenki: { ru: 'Валенки', en: 'Felt boots' },
  hay: { ru: 'Сено', en: 'Hay' },
  sheep: { ru: 'Овца', en: 'Sheep' },
}

/** One line on each good for the book: what it is, what it is for. */
export const ITEM_DESC: Readonly<Record<ItemId, Text>> = {
  wool: { ru: 'С овцы: стригальня или три клика', en: 'From a sheep: shearer or three clicks' },
  pwool: { ru: 'С овцы после красильни', en: 'From a sheep after the dyer' },
  roving: { ru: 'Расчёсанная шерсть, из неё прядут', en: 'Combed wool, ready to spin' },
  proving: { ru: 'Расчёсанная розовая шерсть', en: 'Combed pink wool' },
  yarn: { ru: 'Нить с прялки', en: 'Thread from the spinner' },
  pyarn: { ru: 'Розовая нить с прялки', en: 'Pink thread from the spinner' },
  felt: { ru: 'Сбитая шерсть для валенок', en: 'Pressed wool for boots' },
  dye: { ru: 'Краска из ягод', en: 'Dye from berries' },
  sweater: { ru: 'Тёплый свитер из пряжи', en: 'A warm yarn sweater' },
  valenki: { ru: 'Валенки из войлока', en: 'Boots of felt' },
  hay: { ru: 'Корм для овец', en: 'Food for the sheep' },
}

export const BUILDING_TEXT: Readonly<Record<BuildingId, { name: Text; desc: Text }>> = {
  belt: { name: { ru: 'Лента', en: 'Belt' }, desc: { ru: 'везёт груз и овец', en: 'carries goods and sheep' } },
  pen: { name: { ru: 'Загон', en: 'Pen' }, desc: { ru: 'дом для четырёх овец', en: 'a home for four sheep' } },
  sheep: { name: { ru: 'Овца', en: 'Sheep' }, desc: { ru: 'клик по загону — овца в нём', en: 'click a pen to put it there' } },
  shearer: { name: { ru: 'Стригальня', en: 'Shearer' }, desc: { ru: 'стрижёт овцу, шерсть — вправо', en: 'shears a sheep, wool to the right' } },
  feeder: { name: { ru: 'Кормушка', en: 'Feeder' }, desc: { ru: 'кормит голодную овцу, сено справа', en: 'feeds a hungry sheep, hay from the right' } },
  dyer: { name: { ru: 'Красильня', en: 'Dyer' }, desc: { ru: 'красит пушистую овцу, краска справа', en: 'dyes a fluffy sheep, dye from the right' } },
  mower: { name: { ru: 'Сенокос', en: 'Mower' }, desc: { ru: 'косит ближний покос вокруг', en: 'mows the nearest meadow' } },
  berry: { name: { ru: 'Ягодник', en: 'Berry picker' }, desc: { ru: 'собирает ближние кусты вокруг', en: 'picks the nearest bushes' } },
  seeder: { name: { ru: 'Сеялка', en: 'Seeder' }, desc: { ru: 'сеет вокруг то, что привезли', en: 'sows round it what comes in' } },
  carder: { name: { ru: 'Чесалка', en: 'Carder' }, desc: { ru: 'расчёсывает шерсть в ровницу', en: 'combs wool into roving' } },
  spinner: { name: { ru: 'Прялка', en: 'Spinner' }, desc: { ru: 'прядёт из ровницы нить', en: 'spins roving into yarn' } },
  felter: { name: { ru: 'Валяльня', en: 'Felter' }, desc: { ru: 'сбивает шерсть в войлок', en: 'presses wool into felt' } },
  workshop: { name: { ru: 'Мастерская', en: 'Workshop' }, desc: { ru: 'делает по выбранному рецепту', en: 'makes the recipe you pick' } },
  splitter: { name: { ru: 'Делитель', en: 'Splitter' }, desc: { ru: 'каждому выходу — свой груз', en: 'each side gets its goods' } },
  merger: { name: { ru: 'Объединитель', en: 'Merger' }, desc: { ru: 'сводит до трёх лент в одну', en: 'joins up to three belts' } },
  sow: { name: { ru: 'Посев', en: 'Sowing' }, desc: { ru: 'клик — семя со склада', en: 'click: a seed from stock' } },
}

export const RES_NAMES: Readonly<Record<ResId | 'sprout', Text>> = {
  meadow: { ru: 'покос', en: 'meadow' },
  bush: { ru: 'кусты', en: 'bushes' },
  sprout: { ru: 'всходы', en: 'sprouts' },
}

/** The village's clients: the stall's popup and sign, and the book. */
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
  shearer: { title: { ru: 'Стригальня', en: 'Shearer' }, text: { ru: 'Ставь на выход загона', en: 'Put it on the pen’s way out' } },
  belt: { title: { ru: 'Лента', en: 'Belt' }, text: { ru: 'Петля от стригальни обратно во вход', en: 'A loop from the shearer back in' } },
  pen: { title: { ru: 'Загон', en: 'Pen' }, text: { ru: 'Поставь и перетащи туда овец', en: 'Place it, drag the sheep in' } },
  shear: { title: { ru: 'Стрижка', en: 'Shearing' }, text: { ru: 'Три клика по пушистой овце', en: 'Three clicks on a fluffy sheep' } },
  sheep: { title: { ru: 'Овцы', en: 'Sheep' }, text: { ru: 'Купи овцу и посели в загон', en: 'Buy a sheep, put it in a pen' } },
  mower: { title: { ru: 'Сенокос', en: 'Mower' }, text: { ru: 'Косит покос вокруг. Скошенное исчезает', en: 'Mows around itself. Mown cells go' } },
  feeder: { title: { ru: 'Овцы едят', en: 'Sheep eat' }, text: { ru: 'Кормушка на петлю, сено справа', en: 'A feeder on the loop, hay from the right' } },
  carder: { title: { ru: 'Чесалка', en: 'Carder' }, text: { ru: 'Расчёсывает шерсть в ровницу', en: 'Combs wool into roving' } },
  splitter: { title: { ru: 'Делитель', en: 'Splitter' }, text: { ru: 'Каждому выходу — свой груз', en: 'Each output gets its own goods' } },
  spinner: { title: { ru: 'Прялка', en: 'Spinner' }, text: { ru: 'Прядёт из ровницы нить', en: 'Spins roving into yarn' } },
  merger: { title: { ru: 'Объединитель', en: 'Merger' }, text: { ru: 'Сводит до трёх лент в одну', en: 'Joins up to three belts' } },
  felter: { title: { ru: 'Валяльня', en: 'Felter' }, text: { ru: 'Сбивает шерсть в плотный войлок', en: 'Presses wool into thick felt' } },
  sow: { title: { ru: 'Посев', en: 'Sowing' }, text: { ru: 'Семя на клетку — через минуту покос', en: 'A seed: a meadow in a minute' } },
  berry: { title: { ru: 'Ягодник', en: 'Berry picker' }, text: { ru: 'Собирает кусты вокруг. Пустой куст исчезает', en: 'Picks bushes around it. An empty bush is gone' } },
  dyer: { title: { ru: 'Красильня', en: 'Dyer' }, text: { ru: 'Перед стригальней: розовая овца — розовая шерсть', en: 'Before the shearer: a pink sheep, pink wool' } },
  seeder: { title: { ru: 'Сеялка', en: 'Seeder' }, text: { ru: 'Сеет вокруг себя то, что привезла лента', en: 'Sows round itself what the belt brings' } },
  workshop: { title: { ru: 'Мастерская', en: 'Workshop' }, text: { ru: 'Свитер: пряжа и розовая, два входа', en: 'Sweater: yarn and pink, two ways in' } },
  valenki: { title: { ru: 'Рецепт: валенки', en: 'Recipe: felt boots' }, text: { ru: 'Выбери его в окне мастерской', en: 'Pick it in a workshop popup' } },
  market: { title: { ru: 'Закупка', en: 'Trading post' }, text: { ru: 'Покупай и продавай товар со склада', en: 'Buy and sell goods from the stock' } },
  land: { title: { ru: 'Участки', en: 'Land' }, text: { ru: 'Покос кончается? Купи соседний участок', en: 'Running out? Buy the next plot' } },
  island: { title: { ru: 'Остров растёт', en: 'The island grows' }, text: { ru: 'Новые участки на краю острова', en: 'New plots at the island’s edge' } },
  chapter: { title: { ru: 'Глава 1', en: 'Chapter 1' }, text: { ru: 'Деревня довольна. Просьбы растут дальше', en: 'The village is happy. Asks grow on' } },
}

/** Why a building may not stand here: the short label under the ghost. */
export const WHY_TEXT: Readonly<Record<Exclude<WhyNot, ''>, Text>> = {
  edge: { ru: 'край', en: 'edge' },
  buyPlot: { ru: 'купи участок', en: 'buy the plot' },
  road: { ru: 'дорога', en: 'road' },
  pasture: { ru: 'загон', en: 'pen' },
  onWater: { ru: 'на воде нельзя', en: 'not on water' },
  rock: { ru: 'мешает камень', en: 'a rock is here' },
  tree: { ru: 'мешает дерево', en: 'a tree is here' },
  bush: { ru: 'мешает куст', en: 'a bush is here' },
  meadow: { ru: 'на покосе нельзя', en: 'not on the meadow' },
  sprout: { ru: 'тут всходы', en: 'sprouts here' },
  taken: { ru: 'занято', en: 'taken' },
  needBush: { ru: 'нужны кусты рядом', en: 'needs bushes near' },
  foreignRes: { ru: 'ресурс на чужом участке', en: 'resource on unowned land' },
  needPen: { ru: 'только в загон', en: 'into a pen only' },
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
