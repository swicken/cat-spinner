import type { Register } from 'claude-code'

import { blend, COATS, drawCat, drawSitCat, H, standPose, useCoat, walkPose, W, type Coat, type Text, type Thought } from './rig'

const FRAME_MS = 90
const KEY = 'cat'
const ROWS = H / 2
const DEFAULT_COLOR = 0x01000000
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
// Sitting down: settle onto four paws and look out, then sit facing out.
const SETTLE_FRAMES = 3
export const SIT_FRAMES = 5
const THOUGHTS = ['hmm', '...', ' ? ', 'hmm', ' ! ']

const smooth = (t: number) => t * t * (3 - 2 * t)

// Where the cat stands on a track, and which way it faces, after `run` steps.
export const position = (run: number, track: number) => {
  const span = Math.max(1, track - W)
  const step = run % (2 * span)
  const isFacingRight = step < span

  return { x: isFacingRight ? step : 2 * span - step, isFacingRight }
}

// `sit` counts frames of sitting down, 0 (walking) to SIT_FRAMES (seated).
export type Cat = { run: number; think: number; sit: number }

// What the cat does next frame: walk, or sit down and think while Claude thinks.
export const advance = (cat: Cat, isThinking: boolean): Cat => {
  if (isThinking) {
    return cat.sit < SIT_FRAMES ? { ...cat, sit: cat.sit + 1 } : { ...cat, think: cat.think + 1 }
  }
  if (cat.sit > 0) return { ...cat, sit: cat.sit - 1, think: 0 }

  return { ...cat, run: cat.run + 1 }
}

const thoughtOf = ({ sit, think }: Cat): Thought => {
  if (sit < SIT_FRAMES) return undefined
  const puffs = Math.min(3, Math.floor(think / 4))

  return { puffs, text: THOUGHTS[Math.floor(think / 20) % THOUGHTS.length] ?? 'hmm' }
}

// The whole track as Raster cells: [codePoint, foreground, background] per cell,
// two pixels stacked in each cell as a half block.
export const sceneCells = (cat: Cat, track: number) => {
  const { x, isFacingRight } = position(cat.run, track)
  const isBlinking = cat.run % 50 >= 48
  const { canvas, texts } =
    cat.sit <= SETTLE_FRAMES
      ? drawCat(
          blend(walkPose(cat.run, isBlinking), standPose(), smooth(cat.sit / SETTLE_FRAMES)),
          cat.sit === SETTLE_FRAMES,
        )
      : drawSitCat(cat.think, thoughtOf(cat))
  const pixel = (px: number, py: number) => {
    const i = py * W + (isFacingRight ? px : W - 1 - px)
    return (canvas.owner[i] ?? -1) === -1 ? undefined : canvas.color[i]
  }
  const words = new Uint32Array(track * ROWS * 3)
  for (let i = 0; i < words.length; i += 3) words.set([0x20, DEFAULT_COLOR, DEFAULT_COLOR], i)

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < W; col++) {
      const top = pixel(col, row * 2)
      const bottom = pixel(col, row * 2 + 1)
      if (top === undefined && bottom === undefined) continue
      const at = (row * track + x + col) * 3
      if (top === undefined) words.set([LOWER_HALF, bottom ?? DEFAULT_COLOR, DEFAULT_COLOR], at)
      else words.set([UPPER_HALF, top, bottom ?? DEFAULT_COLOR], at)
    }
  }
  for (const [col, row, text, fg, bg] of texts as Text[]) {
    const start = isFacingRight ? col : W - col - text.length
    ;[...text].forEach((ch, i) => {
      words.set([ch.codePointAt(0) ?? 0x20, fg, bg], (row * track + x + start + i) * 3)
    })
  }

  const bytes = new Uint8Array(words.buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary)
}

export const register: Register = (on, options) => {
  const coat = String(options.coat ?? 'siamese')
  useCoat(coat in COATS ? (coat as Coat) : 'siamese')
  let timer: { cancel: () => void } | undefined
  let isThinking = false
  let cat: Cat = { run: 0, think: 0, sit: 0 }
  let requestId = ''
  let track = 0

  on('prompt.submit', ($, e, next) => {
    timer ??= $.clock.every(FRAME_MS, () => {
      cat = advance(cat, isThinking)
      if (!requestId || !track) return
      void $.ui.blit({ requestId, key: KEY, columns: track, rows: ROWS, cells: sceneCells(cat, track) })
    })

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    timer?.cancel()
    timer = undefined

    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // Raster cells exist on the terminal only; other surfaces keep their own spinner.
    if (e.surface !== 'terminal') return next(e)
    isThinking = e.props.mode === 'thinking'
    requestId = e.requestId
    track = Math.min(90, Math.max(W + 4, (e.viewport?.columns ?? 80) - 6))
    const { Box, Raster } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Raster key={KEY} columns={track} rows={ROWS} cells={sceneCells(cat, track)} />
        {await next(e)}
      </Box>
    )
  })
}
