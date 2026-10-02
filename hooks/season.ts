// Seasonal extras. For Halloween the cat wears a little witch hat, the ball of
// yarn becomes a jack-o'-lantern, bats flap across the empty track, and the
// cat thinks "boo". Drawing takes a Decor explicitly, so a plain Decor draws
// exactly the plain cat.

import { clear, set, SIT_X, type Canvas, type Vec } from './rig'
import { BALL_R, BALL_Y, type Play } from './yarn'

export const SEASONS = ['auto', 'halloween', 'plain'] as const
export type Season = (typeof SEASONS)[number]

// `time` counts frames, for things that move on their own, like the bats.
export type Decor = { isHalloween: boolean; time: number }
export const PLAIN: Decor = { isHalloween: false, time: 0 }

// Auto turns Halloween on through October.
export const isHalloweenOn = (season: Season, date: Date) => season === 'halloween' || (season === 'auto' && date.getMonth() === 9)

export const HALLOWEEN_THOUGHTS = ['boo', '...', ' ? ', 'boo', ' ! ']

// Purple, not black, so the hat shows on the black and tuxedo cats too, and
// shaded in purples rather than outlined: an outline vanishes against a dark
// terminal and leaves only a flat cap.
const HAT: Record<string, number> = { D: 0x46286a, H: 0x5b3480, L: 0x7d50aa, B: 0xf08a24 }

// The hat: a tip that bends over, the cone with an orange buckle, and a wide brim
// across the top of the head. There are only a few rows above the head, so
// the brim sits low and the ears poke out beside the cone.
// [row offset from the brim, first column offset, pixels].
const SIDE_HAT: [number, number, string][] = [
  [-3, -4, 'HD'], // the tip bends back, away from the face
  [-2, -2, 'DHL'],
  [-1, -3, 'DHBHL'], // a buckle on the band
  [0, -6, 'DHHHHHHHHHL'],
]
const FRONT_HAT: [number, number, string][] = [
  [-3, 1, 'HL'], // the tip bends over to one side
  [-2, -1, 'DHL'],
  [-1, -2, 'DHBHL'],
  [0, -5, 'DHHHHHHHHHL'],
]

const stamp = (canvas: Canvas, hat: [number, number, string][], x: number, brim: number) => {
  for (const [dy, dx, pixels] of hat) {
    ;[...pixels].forEach((ch, i) => {
      const color = HAT[ch]
      if (color !== undefined) set(canvas, x + dx + i, brim + dy, color)
    })
  }
}

// On a head in profile, with the ears tucked under it: whatever of the head
// rises above the brim is cleared first, so no ear pokes through the hat.
export const drawSideHat = (canvas: Canvas, head: Vec) => {
  const x = Math.round(head.x)
  const brim = Math.floor(head.y - 2.2)
  for (let y = 0; y < brim; y++) for (let dx = -7; dx <= 5; dx++) clear(canvas, x + dx, y)
  stamp(canvas, SIDE_HAT, x, brim)
}
// On a head facing out, when the cat looks round to sit; its ears stand either
// side of the cone, as they do on the seated cat.
export const drawFrontHat = (canvas: Canvas, head: Vec) => stamp(canvas, FRONT_HAT, Math.round(head.x - 0.5), Math.floor(head.y - 2.2))
// On the seated cat, between its ears, in the seated art's coordinates.
export const drawSitHat = (canvas: Canvas) => stamp(canvas, FRONT_HAT, SIT_X + 9, 3)

const PUMPKIN = { rind: 0xe8862c, ridge: 0xb85f1a, edge: 0x5a2a0a, face: 0xffd166, stem: 0x4a7a2a }

// The yarn ball as a jack-o'-lantern: ridges and a glowing face that turn as
// it rolls, and a stem on top.
export const drawPumpkin = (
  paint: (x: number, y: number, color: number) => void,
  isFree: (x: number, y: number) => boolean,
  play: Play,
) => {
  const { ballX: bx, ballSpin: a } = play
  const turn = (dx: number, dy: number): [number, number] => [
    Math.round(bx - 0.5 + dx * Math.cos(a) - dy * Math.sin(a)),
    Math.round(BALL_Y - 0.5 + dx * Math.sin(a) + dy * Math.cos(a)),
  ]
  for (let py = Math.floor(BALL_Y - BALL_R); py <= Math.ceil(BALL_Y + BALL_R); py++) {
    for (let px = Math.floor(bx - BALL_R - 1); px <= Math.ceil(bx + BALL_R + 1); px++) {
      const dx = px + 0.5 - bx
      const dy = py + 0.5 - BALL_Y
      const d = Math.hypot(dx, dy)
      if (d > BALL_R + 0.5 || !isFree(px, py)) continue
      const u = dx * Math.cos(a) + dy * Math.sin(a)
      paint(px, py, d > BALL_R - 0.3 ? PUMPKIN.edge : ((u % 1.8) + 1.8) % 1.8 < 0.5 ? PUMPKIN.ridge : PUMPKIN.rind)
    }
  }
  for (const [dx, dy] of [[-1, -0.6], [1, -0.6], [-1, 0.9], [0, 0.9], [1, 0.9]] as const) {
    const [x, y] = turn(dx, dy)
    if (isFree(x, y)) paint(x, y, PUMPKIN.face)
  }
  const [sx, sy] = turn(0, -BALL_R - 0.4)
  if (isFree(sx, sy)) paint(sx, sy, PUMPKIN.stem)
}

const BAT = { body: 0x7a5a9a, eye: 0xffd166 }
const WINGS_UP = ['OO...OO', '.OOXOO.', '...O...']
const WINGS_DOWN = ['...O...', '.OOXOO.', 'OO...OO']

// Two bats flapping across the sky part of the track, behind the cat.
export const drawBats = (
  paint: (x: number, y: number, color: number) => void,
  isFree: (x: number, y: number) => boolean,
  track: number,
  time: number,
) => {
  for (const [speed, offset, height, phase] of [[0.55, 0, 2, 0], [0.4, 0.55, 4, 2.1]] as const) {
    const span = track + 10
    const x = Math.floor((((time * speed + offset * span) % span) + span) % span) - 5
    const y = Math.round(height + 1.4 * Math.sin(time / 6 + phase))
    const wings = Math.floor(time / 2 + phase) % 2 === 0 ? WINGS_UP : WINGS_DOWN
    wings.forEach((line, row) => {
      ;[...line].forEach((ch, col) => {
        const px = x + col
        const py = y + row
        if (ch === '.' || !isFree(px, py)) return
        paint(px, py, ch === 'X' ? BAT.eye : BAT.body)
      })
    })
  }
}
