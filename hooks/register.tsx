import type { EngineInterface, Register } from 'claude-code'

import { blend, COATS, COLORS, drawCat, drawSitCat, H, standPose, useCoat, walkPose, W, type Coat, type Text, type Thought } from './rig'
import { drawBall, playPose, rollBall, startPlay, stepPlay, type Play, type Rng } from './yarn'

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

export const ANIMATIONS = ['walk', 'yarn', 'pounce', 'random'] as const
export type Animation = (typeof ANIMATIONS)[number]
// What the cat can actually be doing; `random` picks one of these each turn.
export const PLAYABLE = ['walk', 'yarn', 'pounce'] as const
export type Playable = (typeof PLAYABLE)[number]

// Where the cat stands on a track, and which way it faces, after `run` steps.
export const position = (run: number, track: number) => {
  const span = Math.max(1, track - W)
  const step = run % (2 * span)
  const isFacingRight = step < span

  return { x: isFacingRight ? step : 2 * span - step, isFacingRight }
}

// `sit` counts frames of sitting down, 0 (walking) to SIT_FRAMES (seated).
// `play` is there in the yarn and pounce animations: where the cat and the ball are.
export type Cat = { run: number; think: number; sit: number; play?: Play }

// What the cat does next frame: walk or play, or sit down and think while
// Claude thinks. A rolling ball keeps rolling while the cat sits.
export const advance = (cat: Cat, isThinking: boolean, track = W, rng: Rng = Math.random): Cat => {
  if (isThinking || cat.sit > 0) {
    const play = cat.play && { ...rollBall(cat.play, track), swat: 0, watch: 0, stalk: 0, leap: 0 }
    if (isThinking) {
      return cat.sit < SIT_FRAMES ? { ...cat, play, sit: cat.sit + 1 } : { ...cat, play, think: cat.think + 1 }
    }
    return { ...cat, play, sit: cat.sit - 1, think: 0 }
  }
  if (cat.play) {
    const { play, run } = stepPlay(cat.play, cat.run, track, rng)
    return { ...cat, play, run }
  }

  return { ...cat, run: cat.run + 1 }
}

// The cat, carried into another animation from wherever it is: walking picks
// up at the cat's spot and heading, and play starts with the ball ahead of it.
export const inAnimation = (cat: Cat, playing: Playable, track: number): Cat => {
  if (playing === 'walk') {
    if (!cat.play) return cat
    const span = Math.max(1, track - W)
    const x = Math.max(0, Math.min(span, cat.play.x))
    const { play: _, ...walking } = cat
    return { ...walking, run: cat.play.isFacingRight ? x : 2 * span - x }
  }
  const isWild = playing === 'pounce'
  if (!cat.play) {
    const { x, isFacingRight } = position(cat.run, track)
    return { ...cat, play: startPlay(track, x, isFacingRight, isWild) }
  }
  if (cat.play.isWild === isWild) return cat
  return { ...cat, play: { ...cat.play, isWild, watch: 0, stalk: 0, leap: 0 } }
}

// A different animation from the last, for `random`.
export const pickAnimation = (last: Playable | undefined, rng: Rng = Math.random): Playable => {
  const choices = PLAYABLE.filter(name => name !== last)
  return choices[Math.floor(rng() * choices.length)] ?? 'walk'
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
  const pose = cat.play ? playPose(cat.play, moving) : moving
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

// The settings dialog /cat-spinner opens, and what its pickers show.
const SETTINGS = 'cat-spinner-settings'
const PREVIEW_KEY = 'preview'
const PREVIEW_WIDTH = 60
const COAT_LABELS: Record<Coat, string> = { siamese: 'Siamese', orange: 'Orange tabby' }
const ANIMATION_LABELS: Record<Animation, string> = {
  walk: 'Walk: back and forth',
  yarn: 'Yarn: swats a ball of yarn',
  pounce: 'Pounce: yarn, with random swats, stalking, and leaps',
  random: 'Random: a different one each time Claude works',
}

// The dialog's live preview: its own cat, playing while the dialog is open.
// A setting change reloads the module (and this state with it), so
// session.start starts it again when the dialog is still open.
let preview: { timer: { cancel: () => void }; cat: Cat; playing: Playable; frame: number; track: number } | undefined

function startPreview($: EngineInterface, animation: Animation, playing: Playable) {
  if (preview) return
  const state = { cat: { run: 0, think: 0, sit: 0 } as Cat, playing, frame: 0, track: 0 }
  const timer = $.clock.every(FRAME_MS, () => {
    if (!state.track) return
    state.frame += 1
    if (animation === 'random' && state.frame % 70 === 0) state.playing = pickAnimation(state.playing)
    state.cat = advance(inAnimation(state.cat, state.playing, state.track), false, state.track)
    void $.ui.blit({ requestId: SETTINGS, key: PREVIEW_KEY, columns: state.track, rows: ROWS, cells: sceneCells(state.cat, state.track) })
  })
  preview = Object.assign(state, { timer })
}

// Which setting the dialog is showing the options of, or none for the list of
// settings. A pick reloads the module, which puts the dialog back on the list.
let editing: 'coat' | 'animation' | undefined

function stopPreview() {
  preview?.timer.cancel()
  preview = undefined
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
  let playing: Playable = animation === 'random' ? pickAnimation(undefined) : animation

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cat-spinner',
      description: 'Pick your cat and its animation (or /cat-spinner orange, /cat-spinner pounce, ...)',
    })
    if ((await $.ui.panes()).some(pane => pane.id === SETTINGS)) startPreview($, animation, playing)

    return next(e)
  })

  // Esc in a setting's options goes back to the list instead of closing.
  on('ui.close', { id: SETTINGS }, ($, e, next) => {
    if (e.origin.kind === 'person' && editing) {
      editing = undefined
      $.ui.invalidate('ui.render')
      return { deny: 'back to the list of settings' }
    }
    editing = undefined
    stopPreview()

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: SETTINGS }, async ($, e) => {
    // The preview and pickers need the terminal's Raster and Select.
    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text>Switch with /cat-spinner siamese, orange, walk, yarn, pounce, or random.</Text>
    }
    const { Box, Button, Raster, Text } = $.ui.resolve(e)
    const track = Math.max(W + 4, Math.min(PREVIEW_WIDTH, e.props.bodyColumns))
    if (preview) preview.track = track
    const show = (next: typeof editing, focus: string) => {
      editing = next
      $.ui.invalidate('ui.render')
      $.clock.after(50, () => void $.ui.focus({ requestId: SETTINGS, key: focus }))
    }
    const settings = [
      { key: 'coat', label: 'Cat', current: coat as string, names: COAT_NAMES as readonly string[], labels: COAT_LABELS as Record<string, string> },
      { key: 'animation', label: 'Animation', current: animation as string, names: ANIMATIONS as readonly string[], labels: ANIMATION_LABELS as Record<string, string> },
    ] as const
    const open = settings.find(setting => setting.key === editing)

    // The list of settings, each showing its current choice; or the options
    // of the one being changed, the current one checked.
    const body = open ? (
      <Box flexDirection="column">
        <Text bold>{open.label}</Text>
        {open.names.map((name, i) => (
          <Button
            key={`${open.key}-${name}`}
            label={`${name === open.current ? '✓' : ' '} ${open.labels[name] ?? name}`}
            autoFocus={name === open.current || (i === 0 && !open.names.includes(open.current)) ? true : undefined}
            onPress={() => {
              if (name === open.current) return show(undefined, `edit-${open.key}`)
              void $.config.set({ key: `cat-spinner.${open.key}`, value: name }).then(({ deny }) => {
                if (deny) show(undefined, `edit-${open.key}`)
              })
            }}
          />
        ))}
        <Text dimColor>Enter picks. Esc goes back.</Text>
      </Box>
    ) : (
      <Box flexDirection="column">
        {settings.map((setting, i) => (
          <Button
            key={`edit-${setting.key}`}
            label={`${setting.label}: ${setting.labels[setting.current] ?? setting.current}`}
            autoFocus={i === 0 ? true : undefined}
            onPress={() => show(setting.key, `${setting.key}-${setting.current}`)}
          />
        ))}
        <Box>
          <Button key="done" label="Done" role="dismiss" onPress={() => void $.ui.close({ id: SETTINGS })} />
          <Text dimColor> Enter changes a setting. Esc closes.</Text>
        </Box>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Raster key={PREVIEW_KEY} columns={track} rows={ROWS} cells={sceneCells(preview?.cat ?? { run: 0, think: 0, sit: 0 }, track)} />
        {body}
      </Box>
    )
  })

  // Switching writes the plugin's own "Cat" or "Animation" setting, the same
  // ones /config shows, so the module reloads with the new choice.
  on('command.run', { command: 'cat-spinner' }, async ($, e) => {
    const choice = e.args.trim().toLowerCase()
    const list = (names: readonly string[]) => names.map(name => `/cat-spinner ${name}`).join(' or ')
    const usage = `Switch cats with ${list(COAT_NAMES)}, and animations with ${list(ANIMATIONS)}.`
    const now = animation === 'random' ? `random (${playing} right now)` : animation
    if (!choice) {
      // Where no dialog can open (a headless run, say), answer in text instead.
      const opened = await $.ui
        .open({ id: SETTINGS, title: 'cat-spinner', focus: true, closeOnEscape: true, holdToasts: true, rows: ROWS + 5 })
        .catch(() => undefined)
      if (opened?.isPlaced) {
        startPreview($, animation, playing)
        return { text: `Your cat is the ${coat}, and the animation is ${now}. The cat-spinner settings are open.` }
      }
      return { text: `Your cat is the ${coat}, and the animation is ${now}. ${usage}` }
    }
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
    if (animation === 'random') playing = pickAnimation(playing)
    timer ??= $.clock.every(FRAME_MS, () => {
      if (!requestId || !track) return
      cat = advance(inAnimation(cat, playing, track), isThinking, track)
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
    cat = inAnimation(cat, playing, track)
    const { Box, Raster } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Raster key={KEY} columns={track} rows={ROWS} cells={sceneCells(cat, track)} />
        {await next(e)}
      </Box>
    )
  })
}
