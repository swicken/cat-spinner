// Renders the README images from the mod's real cell output: the walk for the
// Siamese (assets/preview-siamese.gif), every coat walking and sitting
// (assets/coats.png), and the yarn and pounce animations
// (assets/preview-yarn.gif, assets/preview-pounce.gif), each with a sit to
// think and a stand, and the reactions to Claude's tools, each labeled with
// what Claude is doing (assets/preview-reactions.gif), and the Halloween
// extras (assets/preview-halloween.gif). Pounce uses a fixed seed, so its GIF
// is repeatable. Needs ffmpeg
// on the PATH.
//   npx tsx scripts/preview.ts
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

import { advance, COAT_LABELS, sceneCells, type Cat, type Work } from '../hooks/register.tsx'
import { COATS, H, useCoat, type Coat } from '../hooks/rig.ts'
import { startPlay } from '../hooks/yarn.ts'

const TRACK = 70
const ROWS = H / 2
const SCALE = 6
const BG = 0x1e1e24
const DEFAULT_COLOR = 0x01000000
const width = TRACK * SCALE
const height = ROWS * 2 * SCALE

// One RGB image from a frame's Raster cells: each cell is two stacked pixels.
const toImage = (cells: string) => {
  const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
  const img = new Uint8Array(width * height * 3)
  const paint = (col: number, py: number, color: number) => {
    const c = color === DEFAULT_COLOR ? BG : color
    for (let y = 0; y < SCALE; y++) {
      for (let x = 0; x < SCALE; x++) {
        const i = ((py * SCALE + y) * width + col * SCALE + x) * 3
        img.set([(c >> 16) & 255, (c >> 8) & 255, c & 255], i)
      }
    }
  }
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < TRACK; col++) {
      const at = (row * TRACK + col) * 3
      const [point, fg, bg] = [words[at] ?? 0x20, words[at + 1] ?? BG, words[at + 2] ?? BG]
      if (point === 0x2580) paint(col, row * 2, fg), paint(col, row * 2 + 1, bg)
      else if (point === 0x2584) paint(col, row * 2, bg), paint(col, row * 2 + 1, fg)
      else if (point === 0x20) paint(col, row * 2, bg), paint(col, row * 2 + 1, bg)
      else paint(col, row * 2, 0x3a3a46), paint(col, row * 2 + 1, 0x3a3a46) // a glyph: the bubble's text
    }
  }
  return img
}

const chunk = (type: string, data: Buffer) => {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4)
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])) >>> 0, 8 + data.length)
  return out
}
const header = (w: number, h: number) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)]
}
const scanlines = (img: Uint8Array, w: number, h: number) => {
  const raw = Buffer.alloc(h * (w * 3 + 1))
  for (let y = 0; y < h; y++) Buffer.from(img.subarray(y * w * 3, (y + 1) * w * 3)).copy(raw, y * (w * 3 + 1) + 1)
  return deflateSync(raw)
}

const gif = (name: string, frames: Uint8Array[], frameHeight = height) => {
  const control = Buffer.alloc(8)
  control.writeUInt32BE(frames.length, 0)
  const parts = [...header(width, frameHeight), chunk('acTL', control)]
  let sequence = 0
  frames.forEach((img, n) => {
    const fc = Buffer.alloc(26)
    fc.writeUInt32BE(sequence++, 0)
    fc.writeUInt32BE(width, 4)
    fc.writeUInt32BE(frameHeight, 8)
    fc.writeUInt16BE(90, 20)
    fc.writeUInt16BE(1000, 22)
    parts.push(chunk('fcTL', fc))
    const data = scanlines(img, width, frameHeight)
    if (n === 0) parts.push(chunk('IDAT', data))
    else {
      const seq = Buffer.alloc(4)
      seq.writeUInt32BE(sequence++, 0)
      parts.push(chunk('fdAT', Buffer.concat([seq, data])))
    }
  })
  parts.push(chunk('IEND', Buffer.alloc(0)))

  // An animated PNG first, then ffmpeg turns it into a GIF with an exact
  // palette and no dithering, so the pixel art stays crisp.
  const apng = join(mkdtempSync(join(tmpdir(), 'cat-spinner-')), 'preview.png')
  writeFileSync(apng, Buffer.concat(parts))
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-i', apng,
    '-vf', 'split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=none',
    '-loop', '0', `assets/${name}.gif`,
  ])
  console.log(`wrote assets/${name}.gif (${frames.length} frames)`)
}

// One scene: Claude working, then thinking, then working again.
const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const scene = (start: Cat, working: number, thinking: number, after: number, rng = seeded(23)) => {
  const script = [...Array(working).fill(false), ...Array(thinking).fill(true), ...Array(after).fill(false)] as boolean[]
  let cat = start
  return script.map(isThinking => toImage(sceneCells((cat = advance(cat, isThinking, TRACK, rng)), TRACK)))
}

mkdirSync('assets', { recursive: true })
for (const coat of ['siamese'] as const) {
  useCoat(coat)
  gif(`preview-${coat}`, scene({ run: 0, think: 0, sit: 0 }, 70, 55, 30))
}

// A 5x7 pixel font for the labels, capitals only.
const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
}
const LABEL_PIXEL = 2
const LABEL_HEIGHT = 7 * LABEL_PIXEL + 10
const LABEL_COLOR = [0xe6, 0xe6, 0xea]
const BG_RGB = [(BG >> 16) & 255, (BG >> 8) & 255, BG & 255]

// Fills a label band of an image `width` wide at row `top`, and writes `text` in it.
const drawLabel = (img: Uint8Array, top: number, text: string) => {
  for (let y = 0; y < LABEL_HEIGHT; y++) for (let x = 0; x < width; x++) img.set(BG_RGB, ((top + y) * width + x) * 3)
  ;[...text.toUpperCase()].forEach((ch, k) => {
    ;(FONT[ch] ?? FONT[' ']!).forEach((line, gy) => {
      ;[...line].forEach((dot, gx) => {
        if (dot !== '#') return
        for (let py = 0; py < LABEL_PIXEL; py++) {
          for (let px = 0; px < LABEL_PIXEL; px++) {
            const x = 8 + (k * 6 + gx) * LABEL_PIXEL + px
            if (x < width) img.set(LABEL_COLOR, ((top + 6 + gy * LABEL_PIXEL + py) * width + x) * 3)
          }
        }
      })
    })
  })
}

// Every coat in one still, each under its name: a walk frame beside the
// seated cat, eyes open.
{
  const SIT = 38 // frames into thinking: seated, mid slow-blink with eyes open
  const coats = Object.keys(COATS) as Coat[]
  const half = Math.floor(width / 2)
  const band = LABEL_HEIGHT + height
  const still = new Uint8Array(width * band * coats.length * 3)
  coats.forEach((coat, i) => {
    const top = i * band
    // The name, up to any comma ("White, with odd eyes" is labelled "WHITE").
    drawLabel(still, top, COAT_LABELS[coat].split(',')[0] ?? coat)
    useCoat(coat)
    const walking = toImage(sceneCells({ run: 2, think: 0, sit: 0 }, TRACK))
    let seated: Cat = { run: 2, think: 0, sit: 0 }
    for (let f = 0; f < SIT; f++) seated = advance(seated, true, TRACK)
    const sitting = toImage(sceneCells(seated, TRACK))
    for (let y = 0; y < height; y++) {
      const row = (top + LABEL_HEIGHT + y) * width * 3
      still.set(walking.subarray(y * width * 3, (y * width + half) * 3), row)
      still.set(sitting.subarray((y * width + 6) * 3, (y * width + 6 + width - half) * 3), row + half * 3)
    }
  })
  writeFileSync('assets/coats.png', Buffer.concat([...header(width, band * coats.length), chunk('IDAT', scanlines(still, width, band * coats.length)), chunk('IEND', Buffer.alloc(0))]))
  console.log(`wrote assets/coats.png (${coats.join(', ')})`)
}
useCoat('orange')
gif('preview-yarn', scene({ run: 0, think: 0, sit: 0, play: startPlay(TRACK) }, 170, 50, 20))
useCoat('siamese')
gif('preview-pounce', scene({ run: 0, think: 0, sit: 0, play: startPlay(TRACK, 0, true, true) }, 260, 40, 20, seeded(23)))

// What the cat does as Claude works, thinks, and uses its tools, each stretch
// labeled with what Claude is doing.
{
  const stretches: [string, number, Work, boolean][] = [
    ['Working', 24, {}, false],
    ['Thinking', 45, {}, true],
    ['Editing a file', 30, { doing: 'type' }, false],
    ['Reading a file', 34, { doing: 'search' }, false],
    ['Running a command', 30, { doing: 'dig' }, false],
    ['A tool failed', 16, { isStartled: true }, false],
    ['Working', 16, {}, false],
  ]
  useCoat('orange')
  let cat: Cat = { run: 0, think: 0, sit: 0 }
  const frames = stretches.flatMap(([label, count, work, isThinking]) =>
    Array.from({ length: count }, (_, i) => {
      // A failure is one moment; any other activity keeps running.
      const now: Work = i === 0 || !work.isStartled ? work : {}
      cat = advance(cat, isThinking, TRACK, Math.random, now)
      const img = new Uint8Array(width * (LABEL_HEIGHT + height) * 3)
      drawLabel(img, 0, label)
      img.set(toImage(sceneCells(cat, TRACK)), width * LABEL_HEIGHT * 3)
      return img
    }),
  )
  gif('preview-reactions', frames, LABEL_HEIGHT + height)
}

// Halloween: the black cat in its witch hat, batting a jack-o'-lantern, bats
// overhead, then sitting to think "boo".
{
  useCoat('black')
  const rng = seeded(23)
  let cat: Cat = { run: 0, think: 0, sit: 0, play: startPlay(TRACK, 0, true, true) }
  const script = [...Array(150).fill(false), ...Array(60).fill(true), ...Array(20).fill(false)] as boolean[]
  const frames = script.map((isThinking, time) => toImage(sceneCells((cat = advance(cat, isThinking, TRACK, rng)), TRACK, { isHalloween: true, time })))
  gif('preview-halloween', frames)
  useCoat('siamese')
}
