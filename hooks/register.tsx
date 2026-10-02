import type { Register } from 'claude-code'

import { blend, COATS, COLORS, drawCat, drawSitCat, H, standPose, useCoat, walkPose, W, type Coat, type Text, type Thought } from './rig'
import { drawBall, rollBall, startPlay, stepPlay, swatPose, type Play } from './yarn'

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

export const ANIMATIONS = ['walk', 'yarn'] as const
export type Animation = (typeof ANIMATIONS)[number]

// Where the cat stands on a track, and which way it faces, after `run` steps.
export const position = (run: number, track: number) => {
  const span = Math.max(1, track - W)
  const step = run % (2 * span)
  const isFacingRight = step < span

  return { x: isFacingRight ? step : 2 * span - step, isFacingRight }
}

// `sit` counts frames of sitting down, 0 (walking) to SIT_FRAMES (seated).
// `play` is there in the yarn animation: where the cat and the ball are.
export type Cat = { run: number; think: number; sit: number; play?: Play }

// What the cat does next frame: walk or play, or sit down and think while
// Claude thinks. A rolling ball keeps rolling while the cat sits.
export const advance = (cat: Cat, isThinking: boolean, track = W): Cat => {
  if (isThinking || cat.sit > 0) {
    const play = cat.play && { ...rollBall(cat.play, track), swat: 0 }
    if (isThinking) {
      return cat.sit < SIT_FRAMES ? { ...cat, play, sit: cat.sit + 1 } : { ...cat, play, think: cat.think + 1 }
    }
    return { ...cat, play, sit: cat.sit - 1, think: 0 }
  }
  if (cat.play) {
    const { play, run } = stepPlay(cat.play, cat.run, track)
    return { ...cat, play, run }
  }

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
  const { x, isFacingRight } = cat.play ?? position(cat.run, track)
  const isBlinking = cat.run % 50 >= 48
  const moving = walkPose(cat.run, isBlinking)
  const pose = cat.play && cat.play.swat > 0 ? swatPose(cat.play.swat, moving) : moving
  const { canvas, texts } =
    cat.sit <= SETTLE_FRAMES
      ? drawCat(blend(pose, standPose(), smooth(cat.sit / SETTLE_FRAMES)), cat.sit === SETTLE_FRAMES)
      : drawSitCat(cat.think, thoughtOf(cat))

  // The track's pixels: the cat at x, then the ball wherever the cat is not
  // (its shadow aside), so a swatting paw stays in front of the ball.
  const pixels = new Int32Array(track * H)
  const filled = new Uint8Array(track * H)
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + (isFacingRight ? px : W - 1 - px)
      if ((canvas.owner[i] ?? -1) === -1 || x + px >= track) continue
      pixels[py * track + x + px] = canvas.color[i] ?? 0
      filled[py * track + x + px] = 1
    }
  }
  if (cat.play) {
    const inside = (px: number, py: number) => px >= 0 && px < track && py >= 0 && py < H
    drawBall(
      (px, py, color) => {
        if (!inside(px, py)) return
        pixels[py * track + px] = color
        filled[py * track + px] = 1
      },
      (px, py) => inside(px, py) && (!filled[py * track + px] || pixels[py * track + px] === COLORS.shadow),
      cat.play,
    )
  }

  const words = new Uint32Array(track * ROWS * 3)
  for (let i = 0; i < words.length; i += 3) words.set([0x20, DEFAULT_COLOR, DEFAULT_COLOR], i)
  const pixel = (px: number, py: number) => (filled[py * track + px] ? pixels[py * track + px] : undefined)
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < track; col++) {
      const top = pixel(col, row * 2)
      const bottom = pixel(col, row * 2 + 1)
      if (top === undefined && bottom === undefined) continue
      const at = (row * track + col) * 3
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

const COAT_NAMES = Object.keys(COATS) as Coat[]
const isCoat = (name: string): name is Coat => (COAT_NAMES as string[]).includes(name)
const isAnimation = (name: string): name is Animation => (ANIMATIONS as readonly string[]).includes(name)

export const register: Register = (on, options) => {
  const coatOption = String(options.coat ?? 'siamese')
  const coat: Coat = isCoat(coatOption) ? coatOption : 'siamese'
  const animationOption = String(options.animation ?? 'walk')
  const animation: Animation = isAnimation(animationOption) ? animationOption : 'walk'
  useCoat(coat)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cat-spinner',
      description: `Show or switch your cat or its animation: /cat-spinner ${[...COAT_NAMES, ...ANIMATIONS].join(' | ')}`,
    })

    return next(e)
  })

  // Switching writes the plugin's own "Cat" or "Animation" setting, the same
  // ones /config shows, so the module reloads with the new choice.
  on('command.run', { command: 'cat-spinner' }, async ($, e) => {
    const choice = e.args.trim().toLowerCase()
    const list = (names: readonly string[]) => names.map(name => `/cat-spinner ${name}`).join(' or ')
    const usage = `Switch cats with ${list(COAT_NAMES)}, and animations with ${list(ANIMATIONS)}.`
    if (!choice) return { text: `Your cat is the ${coat}, and the animation is ${animation}. ${usage}` }
    if (isCoat(choice)) {
      if (choice === coat) return { text: `Your cat is already the ${coat}.` }
      const { deny } = await $.config.set({ key: 'cat-spinner.coat', value: choice })
      return { text: deny ? `Couldn't switch cats: ${deny}` : `Switched to the ${choice}.` }
    }
    if (isAnimation(choice)) {
      if (choice === animation) return { text: `The animation is already ${animation}.` }
      const { deny } = await $.config.set({ key: 'cat-spinner.animation', value: choice })
      return { text: deny ? `Couldn't switch animations: ${deny}` : `Switched to the ${choice} animation.` }
    }

    return { text: `There's no "${choice}". ${usage}` }
  })

  let timer: { cancel: () => void } | undefined
  let isThinking = false
  let cat: Cat = { run: 0, think: 0, sit: 0 }
  let requestId = ''
  let track = 0

  on('prompt.submit', ($, e, next) => {
    timer ??= $.clock.every(FRAME_MS, () => {
      if (!requestId || !track) return
      if (animation === 'yarn' && !cat.play) cat = { ...cat, play: startPlay(track) }
      cat = advance(cat, isThinking, track)
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
    if (animation === 'yarn' && !cat.play) cat = { ...cat, play: startPlay(track) }
    const { Box, Raster } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Raster key={KEY} columns={track} rows={ROWS} cells={sceneCells(cat, track)} />
        {await next(e)}
      </Box>
    )
  })
}
