import type { Text } from '.'

/**
 * Interface strings. The author's rule (14.10.2026): very little text — icons and numbers do the talking; a line is
 * six words at most.
 */
export const UI = {
  // ---- menu ----
  title1: { ru: 'Все овечки', en: 'All Sheep' },
  title2: { ru: 'должны быть пострижены', en: 'Must Be Shorn' },
  back: { ru: 'Назад', en: 'Back' },
  again: { ru: 'Заново', en: 'Restart' },
  resume: { ru: 'Продолжить', en: 'Resume' },
  menuTip: { ru: 'Меню · Esc', en: 'Menu · Esc' },
  menu: { ru: 'Меню', en: 'Menu' },
  gotIt: { ru: 'Понятно', en: 'Got it' },
  newTag: { ru: 'Новое', en: 'New' },
  // ---- hud ----
  paused: { ru: '❚❚ пауза · пробел', en: '❚❚ paused · space' },
  shornTip: { ru: 'Пострижено из цели', en: 'Shorn of the goal' },
  nextTip: { ru: 'Новые овцы через', en: 'New sheep in' },
  erase: { ru: 'снос', en: 'clear' },
  eraseTip: { ru: 'тяни по постройкам — монеты вернутся', en: 'drag over buildings — coins come back' },
  rotateTip: { ru: '· R — повернуть', en: '· R — rotate' },
  noCoins: { ru: 'мало монет', en: 'not enough coins' },
  pause: { ru: 'Пауза · пробел', en: 'Pause · space' },
  sound: { ru: 'Звук', en: 'Sound' },
  lawn: { ru: 'Трава', en: 'Grass' },
  // ---- the line at the top ----
  wrongGoal: { ru: 'Убери не ту овцу', en: 'Take the wrong sheep off' },
  shearGoal: { ru: 'Стриги белых овец', en: 'Shear the white sheep' },
  portalGoal: { ru: 'Неси стриженую в портал', en: 'Carry the shorn to the portal' },
  recipeGoal: { ru: 'Купи рецепт в справочнике', en: 'Buy a recipe in the book' },
  // ---- popups ----
  portal: { ru: 'Портал', en: 'Portal' },
  perSheep: { ru: '+{n} за овцу', en: '+{n} a sheep' },
  move: { ru: 'Переставить · ПКМ', en: 'Move · right click' },
  cycle: { ru: 'одна овца — {a} с', en: 'one sheep — {a} s' },
  removeTitle: { ru: 'Убрать · X', en: 'Remove · X' },
  error: { ru: 'Ошибка: {m} — игра продолжается', en: 'Error: {m} — the game goes on' },
  lang: { ru: 'English', en: 'Русский' },
  // ---- the win ----
  wonIn: { ru: 'за {t}', en: 'in {t}' },
  playOn: { ru: 'Играть дальше', en: 'Play on' },
  // ---- title ----
  play: { ru: 'Играть', en: 'Play' },
  newGame: { ru: 'Новая игра', en: 'New game' },
  /** The second press of «Новая игра» while a game is kept: it replaces that game. */
  sure: { ru: 'Точно заново?', en: 'Start over?' },
  settings: { ru: 'Настройки', en: 'Settings' },
  toTitle: { ru: 'Главное меню', en: 'Main menu' },
  soundOn: { ru: 'Звук', en: 'Sound' },
  // ---- book ----
  book: { ru: 'Справочник', en: 'Book' },
  bookTip: { ru: 'Справочник · B', en: 'Book · B' },
  buildings: { ru: 'Постройки', en: 'Buildings' },
  sheep: { ru: 'Овцы', en: 'Sheep' },
  groupBelts: { ru: 'Ленты', en: 'Belts' },
  groupFlock: { ru: 'Стадо', en: 'The flock' },
  groupStations: { ru: 'Станции', en: 'Stations' },
  bookHint: { ru: 'Клик — строить · 1–0 — на панель', en: 'Click to build · 1–0 to bar' },
  bookHintView: { ru: '1–0 в игре — на панель', en: 'In a game: 1–0 to bar' },
  buyRecipe: { ru: 'Купить рецепт', en: 'Buy the recipe' },
  ins: { ru: 'входы {n}', en: 'in {n}' },
  outs: { ru: 'выходы {n}', en: 'out {n}' },
  onBar: { ru: 'на панели: {k}', en: 'on bar: {k}' },
  kindAt: { ru: 'после {n} стриженых', en: 'after {n} shorn' },
} as const satisfies Record<string, Text>
