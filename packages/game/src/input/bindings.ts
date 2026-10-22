import type { KeyBindings } from '@kit/input'

/** Keyboard actions (codes, so they work on any layout: R is R on a Russian keyboard too). */
export type Action = 'pause' | 'cancel' | 'confirm' | 'rotate' | 'erase' | 'book' | 'panLeft' | 'panRight' | 'panUp' | 'panDown' | 'turnLeft' | 'turnRight' | `tool${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`

export const BINDINGS: KeyBindings<Action> = {
  pause: ['Space'],
  cancel: ['Escape'],
  confirm: ['Enter', 'NumpadEnter'],
  rotate: ['KeyR'],
  erase: ['KeyX', 'Delete'],
  /** The book of buildings and sheep (B for «build», as the quick bar is filled from it). */
  book: ['KeyB'],
  panLeft: ['KeyA', 'ArrowLeft'],
  panRight: ['KeyD', 'ArrowRight'],
  panUp: ['KeyW', 'ArrowUp'],
  panDown: ['KeyS', 'ArrowDown'],
  turnLeft: ['KeyQ'],
  turnRight: ['KeyE'],
  tool1: ['Digit1'],
  tool2: ['Digit2'],
  tool3: ['Digit3'],
  tool4: ['Digit4'],
  tool5: ['Digit5'],
  tool6: ['Digit6'],
  tool7: ['Digit7'],
  tool8: ['Digit8'],
  tool9: ['Digit9'],
  tool10: ['Digit0'],
}
