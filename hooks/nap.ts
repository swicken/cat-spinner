// Between turns the cat naps in the band above the prompt: curled up where it
// stopped, breathing slowly, with "z"s drifting up from its head.

import { artColors, H, patched, set, W, type Canvas, type Text } from './rig'
import { drawSideHat } from './season'

// The band is six rows tall: twelve pixels, the height of the curled-up cat.
export const NAP_ROWS = 6

// Curled up asleep, facing right: a round loaf with a high back, the head
// tucked low at the front with both ears up, chin on its paws, eyes shut, and
// the tail curled round along the ground. Same letters as the seated cat's art.
const NAP = [
  '..................O...O...',
  '........OOOOO....OPO.OPO..',
  '......OOcccccOO..OPIOOIPO.',
  '.....OCCCCCCCCCOOCCCCCCCO.',
  '....OCCCCCCCCCCCOCCCCCCCCO',
  '...OCCCCCCCCCCCCOCmOOCmOOO',
  '..OCCdCCCCCCCCCCOCCmmUNmO.',
  '..OCdCCCCCCCCCCCdOCCQUUQO.',
  '.OCdCCCCCCCCCCdddOQYYYYO..',
  '.OddCCCCCCCdddPPPPPYYYYO..',
  '..OPPPPPdddPPPPPPPPPOOO...',
  '...OOOOOOOOOOOOOOOOO......',
]
// Breathing in: the back rises a pixel.
const NAP_IN = [NAP[0]!, '........OOOOO....OPO.OPO..', '......OcccccccO..OPIOOIPO.', ...NAP.slice(3)]

// Where the curled cat sits in the walking cat's 40-column sprite, roughly
// under where it stood; and its head, for the hat.
const NAP_X = 7
const HEAD = { x: NAP_X + 21, y: 5.4 }
// Where in the patch pattern its coat comes from.
const NAP_PATCHES = 80
const BREATH_FRAMES = 16
const Z_COLOR = 0xb8b8c8
const DEFAULT_COLOR = 0x01000000

// `frame` counts the nap's frames, a few a second: it paces the breathing and
// the drifting "z"s.
export const drawNap = (frame: number, isHalloween: boolean) => {
  const canvas: Canvas = { color: new Int32Array(W * H), owner: new Int8Array(W * H).fill(-1) }
  const colors = artColors()
  const art = frame % BREATH_FRAMES < BREATH_FRAMES / 2 ? NAP : NAP_IN
  art.forEach((line, row) => {
    ;[...line].forEach((ch, col) => {
      const color = colors[ch]
      if (color === undefined) return
      set(canvas, NAP_X + col, row, 'Ccd'.includes(ch) ? patched(color, col + NAP_PATCHES, row) : color)
    })
  })
  if (isHalloween) drawSideHat(canvas, HEAD)

  // A "z", then two, then a bigger "Z", drifting up and away from the head.
  const zs: Text[] = [
    [NAP_X + 26, 2, 'z', Z_COLOR, DEFAULT_COLOR],
    [NAP_X + 27, 1, 'z', Z_COLOR, DEFAULT_COLOR],
    [NAP_X + 28, 0, 'Z', Z_COLOR, DEFAULT_COLOR],
  ]
  const texts = zs.slice(0, Math.floor(frame / 4) % (zs.length + 1))

  return { canvas, texts }
}
