// Scripted scenes for the golden test: each is a run of frames drawn exactly
// as the terminal receives them. Their fingerprints live in golden.ts; a scene
// whose pixels change fails the test until golden.ts is regenerated on purpose
// (npx tsx scripts/fingerprints.ts > tests/golden.ts).

import { advance, sceneCells, type Cat, type Work } from '../hooks/register'
import { COATS, useCoat, W, type Coat } from '../hooks/rig'
import { startPlay } from '../hooks/yarn'

// A repeatable stand-in for Math.random.
const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

// Walk two full tail cycles, then sit down to think long enough to blink.
const walkAndSit = (coat: Coat) => {
  useCoat(coat)
  const track = W + 30
  const frames: string[] = []
  let cat: Cat = { run: 0, think: 0, sit: 0 }
  for (let i = 0; i < 24; i++) frames.push(sceneCells((cat = advance(cat, false, track)), track))
  for (let i = 0; i < 45; i++) frames.push(sceneCells((cat = advance(cat, true, track)), track))
  useCoat('siamese')
  return frames
}

const play = (isWild: boolean, frames: number) => {
  const track = 90
  const rng = seeded(23)
  let cat: Cat = { run: 0, think: 0, sit: 0, play: startPlay(track, 0, true, isWild) }
  return Array.from({ length: frames }, () => sceneCells((cat = advance(cat, false, track, rng)), track))
}

// Claude's tools at work: typing, searching, digging, then a failed tool.
const reactions = () => {
  const track = W + 10
  let cat: Cat = { run: 0, think: 0, sit: 0 }
  const frames: string[] = []
  const work = (count: number, first: Work, rest: Work) => {
    for (let i = 0; i < count; i++) frames.push(sceneCells((cat = advance(cat, false, track, Math.random, i === 0 ? first : rest)), track))
  }
  work(6, {}, {})
  work(20, { doing: 'type' }, { doing: 'type' })
  work(20, { doing: 'search' }, { doing: 'search' })
  work(22, { doing: 'dig' }, { doing: 'dig' })
  work(14, { isStartled: true }, {})
  work(10, {}, {})
  return frames
}

export const SCENES: Record<string, () => string[]> = {
  ...Object.fromEntries((Object.keys(COATS) as Coat[]).map(coat => [`walk and sit: ${coat}`, () => walkAndSit(coat)])),
  yarn: () => play(false, 240),
  pounce: () => play(true, 320),
  reactions,
}

// FNV-1a over every frame's cells: a short, stable fingerprint of the pixels.
export const fingerprint = (frames: string[]) => {
  let hash = 0x811c9dc5
  for (const frame of frames) {
    for (let i = 0; i < frame.length; i++) {
      hash ^= frame.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
  }
  return hash.toString(16).padStart(8, '0')
}
