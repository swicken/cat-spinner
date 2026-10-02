import type { EngineInterface, Register } from 'claude-code'

import { blend, COATS, COLORS, drawCat, drawSitCat, H, standPose, useCoat, walkPose, W, type Coat, type Text, type Thought } from './rig'
import { drawNap, NAP_ROWS } from './nap'
import {
  ACT_FRAMES, activityOf, digPose, drawDirt, drawLaptop, drawMagnifier, isSeated, STARTLE_FRAMES, startlePose,
  startleText, STRETCH_FRAMES, stretchPose, type Act, type Activity,
} from './react'
import {
  drawBats, drawFrontHat, drawLanterns, drawPumpkin, drawSideHat, drawSitHat, HALLOWEEN_THOUGHTS, isHalloweenOn, PLAIN, SEASONS,
  type Decor, type Season,
} from './season'
import { drawBall, playPose, rollBall, startPlay, stepPlay, type Play, type Rng } from './yarn'

const FRAME_MS = 90
const KEY = 'cat'
const NAP_KEY = 'nap'
// The nap needs only a few frames a second: a slow breath and drifting "z"s.
const NAP_MS = 250
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
export const WIDTHS = ['full', 'compact'] as const
export type Width = (typeof WIDTHS)[number]
export const ALIGNS = ['left', 'center', 'right'] as const
export type Align = (typeof ALIGNS)[number]
export const BETWEENS = ['nap', 'hide'] as const
export type Between = (typeof BETWEENS)[number]

// The most a Raster takes, and the compact track's cap.
const MAX_TRACK = 512
const COMPACT_TRACK = 90

// How wide the cat's track is in a terminal `columns` wide: the whole width
// (less a small margin, so nothing wraps), or capped for compact.
export const trackWidth = (columns: number, width: Width) => {
  const room = width === 'full' ? columns - 2 : Math.min(COMPACT_TRACK, columns - 6)
  return Math.min(MAX_TRACK, Math.max(W + 4, room))
}

// How far in from the left a track `track` wide sits in a terminal `columns`
// wide; only a compact track is narrower than the terminal.
export const trackOffset = (columns: number, track: number, align: Align) => {
  const spare = Math.max(0, columns - 2 - track)
  return align === 'left' ? 0 : align === 'center' ? Math.floor(spare / 2) : spare
}
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
// `act` is what the cat is doing about Claude's tools, if anything.
export type Cat = { run: number; think: number; sit: number; play?: Play; act?: Act }

// What Claude's tools are up to this frame: the activity of the tool running,
// and whether a tool just failed or was denied.
export type Work = { doing?: Activity; isStartled?: boolean }

// The cat's next activity: a startle interrupts anything; a new tool's activity
// replaces the last one; an activity outlives its tool by up to ACT_FRAMES.
const nextAct = (act: Act | undefined, work: Work): Act | undefined => {
  if (work.isStartled) return { kind: 'startle', frame: 0 }
  if (act?.kind === 'startle') return act.frame < STARTLE_FRAMES ? { ...act, frame: act.frame + 1 } : undefined
  if (act?.kind === 'stretch' && !work.doing) return act.frame < STRETCH_FRAMES ? { ...act, frame: act.frame + 1 } : undefined
  if (work.doing && work.doing !== act?.kind) return { kind: work.doing, frame: 0 }
  if (!act) return undefined
  return work.doing || act.frame < ACT_FRAMES ? { ...act, frame: act.frame + 1 } : undefined
}

// What the cat does next frame: walk or play, or sit down and think while
// Claude thinks. A rolling ball keeps rolling while the cat sits.
export const advance = (cat: Cat, isThinking: boolean, track = W, rng: Rng = Math.random, work: Work = {}): Cat => {
  // Thinking sets aside any activity, except a wake-up stretch, which finishes.
  const act = isThinking && cat.act?.kind !== 'stretch' ? undefined : nextAct(cat.act, work)
  // A startled or stretching cat is on its feet at once; one busy with a tool stays put.
  const still = cat.play && { ...rollBall(cat.play, track), swat: 0, watch: 0, stalk: 0, leap: 0 }
  if (act?.kind === 'startle' || act?.kind === 'stretch') return { ...cat, act, play: still, sit: 0, think: 0 }
  if (isThinking || isSeated(act)) {
    return cat.sit < SIT_FRAMES ? { ...cat, act, play: still, sit: cat.sit + 1 } : { ...cat, act, play: still, think: cat.think + 1 }
  }
  if (cat.sit > 0) return { ...cat, act, play: still, sit: cat.sit - 1, think: 0 }
  if (act) return { ...cat, act, play: still }
  if (cat.play) {
    const { play, run } = stepPlay(cat.play, cat.run, track, rng)
    return { ...cat, act, play, run }
  }

  return { ...cat, act, run: cat.run + 1 }
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

const thoughtOf = ({ sit, think }: Cat, decor: Decor): Thought => {
  if (sit < SIT_FRAMES) return undefined
  const puffs = Math.min(3, Math.floor(think / 4))
  const thoughts = decor.isHalloween ? HALLOWEEN_THOUGHTS : THOUGHTS

  return { puffs, text: thoughts[Math.floor(think / 20) % thoughts.length] ?? 'hmm' }
}

// The whole track as Raster cells: [codePoint, foreground, background] per cell,
// two pixels stacked in each cell as a half block. `decor` adds the season's
// extras; left out, the plain cat.
export const sceneCells = (cat: Cat, track: number, decor: Decor = PLAIN) => {
  const { x, isFacingRight } = cat.play ?? position(cat.run, track)
  const isBlinking = cat.run % 50 >= 48
  const moving = walkPose(cat.run, isBlinking)
  const act = cat.act
  const pose =
    act?.kind === 'startle' ? startlePose(act.frame)
      : act?.kind === 'stretch' ? stretchPose(act.frame)
      : act?.kind === 'dig' && cat.sit === 0 ? digPose(act.frame)
        : cat.play ? playPose(cat.play, moving) : moving
  const standing = blend(pose, standPose(), smooth(cat.sit / SETTLE_FRAMES))
  const isLookingOut = cat.sit === SETTLE_FRAMES
  const drawn =
    cat.sit <= SETTLE_FRAMES
      ? drawCat(standing, isLookingOut)
      : drawSitCat(cat.think, isSeated(act) ? undefined : thoughtOf(cat, decor), isSeated(act))
  const { canvas } = drawn
  const texts: Text[] = act?.kind === 'startle' ? [...drawn.texts, startleText(pose)] : drawn.texts
  // The witch hat, on whichever way the head faces; the tools' props go over
  // it, since the cat holds them up in front.
  if (decor.isHalloween) {
    if (cat.sit > SETTLE_FRAMES) drawSitHat(canvas)
    else if (isLookingOut) drawFrontHat(canvas, standing.head)
    else drawSideHat(canvas, standing.head)
  }
  // The tools' props, over the cat.
  if (act?.kind === 'dig' && cat.sit === 0) drawDirt(canvas, act.frame)
  if (cat.sit === SIT_FRAMES && act?.kind === 'type') drawLaptop(canvas, act.frame, COLORS.paw)
  if (cat.sit === SIT_FRAMES && act?.kind === 'search') drawMagnifier(canvas, act.frame, COLORS.paw, COLORS.eye, COLORS.pupil)

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
  // The ball (or the season's pumpkin), the bats, and the jack-o'-lanterns go
  // wherever nothing nearer is, so the cat passes in front of them.
  const inside = (px: number, py: number) => px >= 0 && px < track && py >= 0 && py < H
  const paint = (px: number, py: number, color: number) => {
    if (!inside(px, py)) return
    pixels[py * track + px] = color
    filled[py * track + px] = 1
  }
  const isFree = (px: number, py: number) => inside(px, py) && (!filled[py * track + px] || pixels[py * track + px] === COLORS.shadow)
  if (cat.play) (decor.isHalloween ? drawPumpkin : drawBall)(paint, isFree, cat.play)
  if (decor.isHalloween) {
    drawBats(paint, isFree, track, decor.time)
    drawLanterns(paint, isFree, track, decor.time, H - 2, decor.seed ?? 0)
  }

  return encodeCells(pixels, filled, track, ROWS, texts, x, isFacingRight)
}

// A track's pixels as Raster cells, `rows` cells tall, with the sprite's text
// (thought bubbles, a "!", "z"s) at the sprite's spot, mirrored with it.
const encodeCells = (
  pixels: Int32Array,
  filled: Uint8Array,
  track: number,
  rows: number,
  texts: Text[],
  x: number,
  isFacingRight: boolean,
) => {
  const words = new Uint32Array(track * rows * 3)
  for (let i = 0; i < words.length; i += 3) words.set([0x20, DEFAULT_COLOR, DEFAULT_COLOR], i)
  const pixel = (px: number, py: number) => (filled[py * track + px] ? pixels[py * track + px] : undefined)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < track; col++) {
      const top = pixel(col, row * 2)
      const bottom = pixel(col, row * 2 + 1)
      if (top === undefined && bottom === undefined) continue
      const at = (row * track + col) * 3
      if (top === undefined) words.set([LOWER_HALF, bottom ?? DEFAULT_COLOR, DEFAULT_COLOR], at)
      else words.set([UPPER_HALF, top, bottom ?? DEFAULT_COLOR], at)
    }
  }
  for (const [col, row, text, fg, bg] of texts) {
    const start = isFacingRight ? col : W - col - text.length
    ;[...text].forEach((ch, i) => {
      const at = (row * track + x + start + i) * 3
      if (x + start + i >= 0 && x + start + i < track) words.set([ch.codePointAt(0) ?? 0x20, fg, bg], at)
    })
  }

  const bytes = new Uint8Array(words.buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary)
}

// The napping cat as Raster cells, NAP_ROWS tall, curled up where it stopped
// and facing the way it was going.
export const napCells = (cat: Cat, track: number, frame: number, decor: Decor = PLAIN) => {
  const { x, isFacingRight } = cat.play ?? position(cat.run, track)
  const { canvas, texts } = drawNap(frame, decor.isHalloween)
  const height = NAP_ROWS * 2
  const pixels = new Int32Array(track * height)
  const filled = new Uint8Array(track * height)
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + (isFacingRight ? px : W - 1 - px)
      if ((canvas.owner[i] ?? -1) === -1 || x + px >= track) continue
      pixels[py * track + x + px] = canvas.color[i] ?? 0
      filled[py * track + x + px] = 1
    }
  }
  return encodeCells(pixels, filled, track, NAP_ROWS, texts, x, isFacingRight)
}

// The settings dialog /cat-spinner opens, and what its pickers show.
const SETTINGS = 'cat-spinner-settings'
const PREVIEW_KEY = 'preview'
const PREVIEW_WIDTH = 60
export const COAT_LABELS: Record<Coat, string> = {
  siamese: 'Siamese',
  orange: 'Orange tabby',
  tuxedo: 'Tuxedo',
  black: 'Black',
  'russian-blue': 'Russian Blue',
  white: 'White, with odd eyes',
  calico: 'Calico',
  tortoiseshell: 'Tortoiseshell',
}
const ANIMATION_LABELS: Record<Animation, string> = {
  walk: 'Walk: back and forth',
  yarn: 'Yarn: swats a ball of yarn',
  pounce: 'Pounce: yarn, with random swats, stalking, and leaps',
  random: 'Random: a different one each time Claude works',
}
const WIDTH_LABELS: Record<Width, string> = {
  full: 'Full width',
  compact: 'Compact: up to 90 columns',
}
const ALIGN_LABELS: Record<Align, string> = { left: 'Left', center: 'Center', right: 'Right' }
const BETWEEN_LABELS: Record<Between, string> = {
  nap: 'Nap: curls up asleep above the prompt',
  hide: 'Hide: nothing between turns',
}
const SEASON_LABELS: Record<Season, string> = {
  auto: 'Auto: Halloween through October',
  halloween: 'Halloween',
  plain: 'Plain: no seasonal extras',
}

// The dialog's live preview: its own cat, playing while the dialog is open.
// A setting change reloads the module (and this state with it), so
// session.start starts it again when the dialog is still open.
let preview: { timer: { cancel: () => void }; cat: Cat; playing: Playable; frame: number; track: number } | undefined
// Whether the Halloween extras are on, as this load of the module resolved it,
// and the layout of its scenery, picked once per load.
let isHalloween = false
const sceneSeed = Math.floor(Math.random() * 2 ** 31)

function startPreview($: EngineInterface, animation: Animation, playing: Playable) {
  if (preview) return
  const state = { cat: { run: 0, think: 0, sit: 0 } as Cat, playing, frame: 0, track: 0 }
  const timer = $.clock.every(FRAME_MS, () => {
    if (!state.track) return
    state.frame += 1
    if (animation === 'random' && state.frame % 70 === 0) state.playing = pickAnimation(state.playing)
    state.cat = advance(inAnimation(state.cat, state.playing, state.track), false, state.track)
    void $.ui.blit({ requestId: SETTINGS, key: PREVIEW_KEY, columns: state.track, rows: ROWS, cells: sceneCells(state.cat, state.track, { isHalloween, time: state.frame, seed: sceneSeed }) })
  })
  preview = Object.assign(state, { timer })
}

// Which setting the dialog is showing the options of, or none for the list of
// settings. A pick reloads the module, which puts the dialog back on the list.
let editing: 'coat' | 'animation' | 'width' | 'align' | 'season' | 'between' | undefined

function stopPreview() {
  preview?.timer.cancel()
  preview = undefined
}

const COAT_NAMES = Object.keys(COATS) as Coat[]
const isCoat = (name: string): name is Coat => (COAT_NAMES as string[]).includes(name)
const isAnimation = (name: string): name is Animation => (ANIMATIONS as readonly string[]).includes(name)
const isWidth = (name: string): name is Width => (WIDTHS as readonly string[]).includes(name)
const isAlign = (name: string): name is Align => (ALIGNS as readonly string[]).includes(name)
const isSeason = (name: string): name is Season => (SEASONS as readonly string[]).includes(name)
const isBetween = (name: string): name is Between => (BETWEENS as readonly string[]).includes(name)

export const register: Register = (on, options) => {
  const coatOption = String(options.coat ?? 'siamese')
  const coat: Coat = isCoat(coatOption) ? coatOption : 'siamese'
  const animationOption = String(options.animation ?? 'walk')
  const animation: Animation = isAnimation(animationOption) ? animationOption : 'walk'
  const widthOption = String(options.width ?? 'full')
  const width: Width = isWidth(widthOption) ? widthOption : 'full'
  const alignOption = String(options.align ?? 'left')
  const align: Align = isAlign(alignOption) ? alignOption : 'left'
  const seasonOption = String(options.season ?? 'auto')
  const season: Season = isSeason(seasonOption) ? seasonOption : 'auto'
  isHalloween = isHalloweenOn(season, new Date())
  const betweenOption = String(options.between ?? 'nap')
  const between: Between = isBetween(betweenOption) ? betweenOption : 'nap'
  useCoat(coat)
  let playing: Playable = animation === 'random' ? pickAnimation(undefined) : animation

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cat-spinner',
      description: 'Pick your cat and its animation (or /cat-spinner orange, /cat-spinner pounce, ...)',
    })
    if ((await $.ui.panes()).some(pane => pane.id === SETTINGS)) startPreview($, animation, playing)
    // The nap's own slow timer runs all session and draws only between turns.
    if (between === 'nap') {
      $.clock.every(NAP_MS, () => {
        napFrame += 1
        if (isWorking || !napRequest || !napTrack) return
        void $.ui.blit({ requestId: napRequest, key: NAP_KEY, columns: napTrack, rows: NAP_ROWS, cells: napCells(cat, napTrack, napFrame, decor()) })
      })
    }

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
    const every = [
      { key: 'coat', label: 'Cat', current: coat as string, names: COAT_NAMES as readonly string[], labels: COAT_LABELS as Record<string, string> },
      { key: 'animation', label: 'Animation', current: animation as string, names: ANIMATIONS as readonly string[], labels: ANIMATION_LABELS as Record<string, string> },
      { key: 'width', label: 'Width', current: width as string, names: WIDTHS as readonly string[], labels: WIDTH_LABELS as Record<string, string> },
      { key: 'align', label: 'Alignment', current: align as string, names: ALIGNS as readonly string[], labels: ALIGN_LABELS as Record<string, string> },
      { key: 'season', label: 'Season', current: season as string, names: SEASONS as readonly string[], labels: SEASON_LABELS as Record<string, string> },
      { key: 'between', label: 'Between turns', current: between as string, names: BETWEENS as readonly string[], labels: BETWEEN_LABELS as Record<string, string> },
    ] as const
    // Alignment only matters for a compact track, which is narrower than the terminal.
    const settings = every.filter(setting => setting.key !== 'align' || width === 'compact')
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

  // Switching writes the plugin's own "Cat", "Animation", "Width",
  // "Alignment", "Season", or "Between turns" setting, the same ones /config
  // shows, so the module reloads with the new choice.
  on('command.run', { command: 'cat-spinner' }, async ($, e) => {
    const choice = e.args.trim().toLowerCase()
    const list = (names: readonly string[]) => names.map(name => `/cat-spinner ${name}`).join(' or ')
    const usage = `Switch cats with ${list(COAT_NAMES)}, animations with ${list(ANIMATIONS)}, the width with ${list(WIDTHS)}, a compact track's alignment with ${list(ALIGNS)}, the season with ${list(SEASONS)}, and what it does between turns with ${list(BETWEENS)}.`
    const where = width === 'compact' ? `compact width, ${align}-aligned` : 'full width'
    const festive = season === 'auto' ? (isHalloween ? ', dressed for Halloween (auto)' : '') : season === 'halloween' ? ', dressed for Halloween' : ''
    const now = `${animation === 'random' ? `random (${playing} right now)` : animation}, at ${where}${festive}`
    if (!choice) {
      // Where no dialog can open (a headless run, say), answer in text instead.
      const opened = await $.ui
        .open({ id: SETTINGS, title: 'cat-spinner', focus: true, closeOnEscape: true, holdToasts: true, rows: ROWS + 10 })
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

    if (isWidth(choice)) {
      if (choice === width) return { text: `The width is already ${width}.` }
      const { deny } = await $.config.set({ key: 'cat-spinner.width', value: choice })
      return { text: deny ? `Couldn't switch the width: ${deny}` : `Switched to ${choice} width.` }
    }

    if (isAlign(choice)) {
      if (choice === align) return { text: `The alignment is already ${align}.` }
      const { deny } = await $.config.set({ key: 'cat-spinner.align', value: choice })
      if (deny) return { text: `Couldn't switch the alignment: ${deny}` }
      return { text: width === 'compact' ? `Aligned ${choice}.` : `Aligned ${choice}; it shows once the width is compact (/cat-spinner compact).` }
    }

    if (isBetween(choice)) {
      if (choice === between) return { text: `Between turns, the cat already does: ${between}.` }
      const { deny } = await $.config.set({ key: 'cat-spinner.between', value: choice })
      return { text: deny ? `Couldn't switch that: ${deny}` : choice === 'nap' ? 'Between turns, the cat naps.' : 'Between turns, the cat stays out of sight.' }
    }
    if (isSeason(choice)) {
      if (choice === season) return { text: `The season is already ${season}.` }
      const { deny } = await $.config.set({ key: 'cat-spinner.season', value: choice })
      return { text: deny ? `Couldn't switch the season: ${deny}` : `Switched the season to ${choice}.` }
    }

    return { text: `There's no "${choice}". ${usage}` }
  })

  let timer: { cancel: () => void } | undefined
  let isThinking = false
  let doing: Activity | undefined
  let frame = 0
  let isStartled = false

  // Which tool is running sets the cat's activity; a failed or denied tool
  // startles it.
  on('tool.call', async ($, e, next) => {
    const activity = activityOf(e.tool)
    if (activity) doing = activity
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) isStartled = true
    if (activity && doing === activity) doing = undefined
    return ran
  })
  let cat: Cat = { run: 0, think: 0, sit: 0 }
  let requestId = ''
  let track = 0
  // Between turns the cat naps in the band above the prompt.
  let isWorking = false
  let napRequest = ''
  let napTrack = 0
  let napFrame = 0
  const decor = () => ({ isHalloween, time: frame, seed: sceneSeed })

  on('prompt.submit', ($, e, next) => {
    if (animation === 'random') playing = pickAnimation(playing)
    // Waking from a nap: the turn starts with a stretch, and the band clears.
    if (between === 'nap') cat = { ...cat, act: { kind: 'stretch', frame: 0 } }
    isWorking = true
    $.ui.invalidate('ui.render')
    timer ??= $.clock.every(FRAME_MS, () => {
      if (!requestId || !track) return
      cat = advance(inAnimation(cat, playing, track), isThinking, track, Math.random, { doing, isStartled })
      isStartled = false
      frame += 1
      void $.ui.blit({ requestId, key: KEY, columns: track, rows: ROWS, cells: sceneCells(cat, track, decor()) })
    })

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    timer?.cancel()
    timer = undefined
    isWorking = false
    $.ui.invalidate('ui.render')

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // The band is the cat's only between turns, when there's room, and it yields
    // to a survey.
    const isIdle = !e.props.isWorking && !isWorking
    if (between !== 'nap' || !isIdle || e.surface !== 'terminal' || e.props.hasSurvey || e.props.maxRows < NAP_ROWS) return next(e)
    napRequest = e.requestId
    const columns = e.props.bodyColumns
    napTrack = trackWidth(columns, width)
    const { Box, Raster } = $.ui.resolve(e)

    return (
      <Box key="nap-track" marginLeft={trackOffset(columns, napTrack, align)}>
        <Raster key={NAP_KEY} columns={napTrack} rows={NAP_ROWS} cells={napCells(cat, napTrack, napFrame, decor())} />
      </Box>
    )
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // Raster cells exist on the terminal only; other surfaces keep their own spinner.
    if (e.surface !== 'terminal') return next(e)
    isThinking = e.props.mode === 'thinking'
    requestId = e.requestId
    track = trackWidth(e.viewport?.columns ?? 80, width)
    cat = inAnimation(cat, playing, track)
    const { Box, Raster } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Box key="track" marginLeft={trackOffset(e.viewport?.columns ?? 80, track, align)}>
          <Raster key={KEY} columns={track} rows={ROWS} cells={sceneCells(cat, track, decor())} />
        </Box>
        {await next(e)}
      </Box>
    )
  })
}
