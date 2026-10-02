// Renders the README animations from the mod's real cell output: the walk in
// each coat (assets/preview-<coat>.gif) and the yarn animation
// (assets/preview-yarn.gif), each with a sit to think and a stand. Needs ffmpeg
// on the PATH.
//   npx tsx scripts/preview.ts
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

import { advance, sceneCells, type Cat } from '../hooks/register.tsx'
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

const gif = (name: string, frames: Uint8Array[]) => {
  const control = Buffer.alloc(8)
  control.writeUInt32BE(frames.length, 0)
  const parts = [...header(width, height), chunk('acTL', control)]
  let sequence = 0
  frames.forEach((img, n) => {
    const fc = Buffer.alloc(26)
    fc.writeUInt32BE(sequence++, 0)
    fc.writeUInt32BE(width, 4)
    fc.writeUInt32BE(height, 8)
    fc.writeUInt16BE(90, 20)
    fc.writeUInt16BE(1000, 22)
    parts.push(chunk('fcTL', fc))
    const data = scanlines(img, width, height)
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
const scene = (start: Cat, working: number, thinking: number, after: number) => {
  const script = [...Array(working).fill(false), ...Array(thinking).fill(true), ...Array(after).fill(false)] as boolean[]
  let cat = start
  return script.map(isThinking => toImage(sceneCells((cat = advance(cat, isThinking, TRACK)), TRACK)))
}

mkdirSync('assets', { recursive: true })
for (const coat of Object.keys(COATS) as Coat[]) {
  useCoat(coat)
  gif(`preview-${coat}`, scene({ run: 0, think: 0, sit: 0 }, 70, 55, 30))
}
useCoat('orange')
gif('preview-yarn', scene({ run: 0, think: 0, sit: 0, play: startPlay(TRACK) }, 170, 50, 20))
