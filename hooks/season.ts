// Seasonal extras. For Halloween the cat wears a little witch hat, the ball of
// yarn becomes a jack-o'-lantern, bats flap across the empty track, and the
// cat thinks "boo". Drawing takes a Decor explicitly, so a plain Decor draws
// exactly the plain cat.

import { clear, set, SIT_X, type Canvas, type Vec } from './rig'
import { BALL_R, BALL_Y, type Play } from './yarn'

export const SEASONS = ['auto', 'halloween', 'plain'] as const
export type Season = (typeof SEASONS)[number]

// `time` counts frames, for things that move on their own, like the bats.
// `seed` picks the scenery's layout, such as where the jack-o'-lanterns stand;
// it's chosen once per load, so the layout holds steady through a session.
export type Decor = { isHalloween: boolean; time: number; seed?: number }
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

const LANTERN: Record<string, number> = {
  O: 0x3a1a06, D: 0x9a4a10, R: 0xc96d1d, L: 0xe88a2c, S: 0x5a7a2a, s: 0x3e5a1c, V: 0x7aa63a,
}
// The carved face's glow, bright (Y) and toward the edges of each cut (y), in
// two shades each that alternate like a candle's flicker.
const GLOW: Record<string, [number, number]> = { Y: [0xffe08a, 0xffd166], y: [0xffb347, 0xf59a32] }

// Two carved jack-o'-lanterns, a big one and a small one, drawn by hand: ribbed
// shells shaded darker at the grooves, curved stems with a leaf, and faces
// with triangle eyes, a nose, and a toothy grin.
export const LANTERN_ARTS = [
  [
    '........sS.....',
    '.......sS..VV..',
    '.......S..VV...',
    '...OOODsDOOO...',
    '..ODRRDLDRRDO..',
    '.ODRRRDLDRRRDO.',
    'ODRRYRDRDRYRRDO',
    'ODRyYyDRDyYyRDO',
    'ODRRRDRYRDRRRDO',
    'ODRyRYyYyYRyRDO',
    'ODRyYYYYYYYyRDO',
    '.ODRyYRYRYyRDO.',
    '..OODRDRDRDOO..',
    '....OOOOOOO....',
  ],
  [
    '.....sS....',
    '....sS.V...',
    '..OODsDOO..',
    '.ODRDLDRDO.',
    'ODRYRDRYRDO',
    'ODyYyDyYyDO',
    'ODRRDYDRRDO',
    'ODyYYYYYyDO',
    '.ODyRYRyDO.',
    '..OOOOOOO..',
  ],
]
const LANTERN_SPACING = 45
// How far a lantern may wander from the middle of its stretch of track, as a
// share of the stretch: enough to look scattered, not enough to overlap.
const LANTERN_WANDER = 0.55

// A repeatable number in 0..1 for a seed and an index.
const hash = (seed: number, i: number) => ((Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i + 1, 0xc2b2ae35)) >>> 0) % 10007 / 10007

// Where each jack-o'-lantern stands along a track, and which one it is: about
// one per 45 columns, each at a random spot in its own stretch of the track,
// so they look scattered but never overlap. The same seed and track give the
// same layout every time.
export const lanternSpots = (track: number, seed = 0) => {
  const count = Math.max(1, Math.floor(track / LANTERN_SPACING))
  const stretch = track / count
  return Array.from({ length: count }, (_, i) => {
    const art = hash(seed, i * 2 + 1) < 0.5 ? 0 : 1
    const half = Math.ceil((LANTERN_ARTS[art]?.[0] ?? '').length / 2)
    const wander = (hash(seed, i * 2) - 0.5) * stretch * LANTERN_WANDER
    const middle = Math.round(Math.min(track - half, Math.max(half, (i + 0.5) * stretch + wander)))
    return { middle, art }
  })
}

// Jack-o'-lanterns behind everything, standing on the ground, their faces
// flickering like candles.
export const drawLanterns = (
  paint: (x: number, y: number, color: number) => void,
  isFree: (x: number, y: number) => boolean,
  track: number,
  time: number,
  ground: number,
  seed: number,
) => {
  lanternSpots(track, seed).forEach(({ middle, art: which }, i) => {
    const art = LANTERN_ARTS[which]!
    const left = middle - Math.floor((art[0] ?? '').length / 2)
    const flicker = Math.floor(time / 3 + i * 2) % 3 === 0 ? 1 : 0
    art.forEach((line, row) => {
      ;[...line].forEach((ch, col) => {
        const x = left + col
        const y = ground - art.length + 1 + row
        const color = GLOW[ch]?.[flicker] ?? LANTERN[ch]
        if (color !== undefined && isFree(x, y)) paint(x, y, color)
      })
    })
  })
}
