import { describe, expect, test } from 'claude-code/testing'

import { advance, inAnimation, pickAnimation, position, sceneCells, SIT_FRAMES, type Cat } from '../hooks/register'
import { COATS, CYCLE, pawAt, W } from '../hooks/rig'
import { BALL_R, startPlay } from '../hooks/yarn'

const TRACK = W + 10 // a 10-cell span to walk across
const WALKING: Cat = { run: 0, think: 0, sit: 0 }

// The text of one cell row, with every pixel cell shown as '#'.
const rowText = (cells: string, row: number) => {
  const words = new Uint32Array(Uint8Array.from(atob(cells), ch => ch.charCodeAt(0)).buffer)
  let text = ''
  for (let col = 0; col < TRACK; col++) {
    const point = words[(row * TRACK + col) * 3] ?? 0x20
    text += point === 0x2580 || point === 0x2584 ? '#' : String.fromCodePoint(point)
  }

  return text
}

describe('the walk', () => {
  // The body moves one pixel per frame, so a planted paw has to slide back one
  // pixel per frame relative to it to stay on one spot of the ground.
  test('a planted paw stays on one spot of the ground', () => {
    for (const offset of [0, 3, 6, 9]) {
      // One whole step of this paw: it touches down at frame `offset`.
      const step = Array.from({ length: CYCLE }, (_, i) => ({ frame: offset + i, paw: pawAt(offset + i, offset, 10) }))
      const planted = step.filter(({ paw }) => paw.lift === 0)
      expect(planted.map(({ frame }) => frame - offset)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
      expect(new Set(planted.map(({ frame, paw }) => frame + paw.at.x)).size).toBe(1)
    }
  })

  test('a swinging paw lifts and travels forward', () => {
    const swing = [8, 9, 10, 11].map(frame => pawAt(frame, 0, 10))
    expect(swing.every(paw => paw.lift > 0)).toBe(true)
    expect(swing.map(paw => paw.at.x)).toEqual([...swing.map(paw => paw.at.x)].sort((a, b) => a - b))
  })

  test('two or three paws are always on the ground', () => {
    for (let frame = 0; frame < CYCLE; frame++) {
      const down = [0, 3, 6, 9].filter(offset => pawAt(frame, offset, 10).lift === 0).length
      expect(down).toBeGreaterThanOrEqual(2)
      expect(down).toBeLessThanOrEqual(3)
    }
  })
})

describe('the track', () => {
  test('walks right to the end, turns, and comes back', () => {
    expect(position(0, TRACK)).toEqual({ x: 0, isFacingRight: true })
    expect(position(10, TRACK)).toEqual({ x: 10, isFacingRight: false })
    expect(position(15, TRACK)).toEqual({ x: 5, isFacingRight: false })
    expect(position(20, TRACK)).toEqual({ x: 0, isFacingRight: true })
  })

  test('draws the cat where it stands and nothing elsewhere', () => {
    const body = rowText(sceneCells({ ...WALKING, run: 10 }, TRACK), 5)
    expect(body.slice(0, 10).trim()).toBe('')
    expect(body.slice(10)).toContain('#')
  })
})

describe('thinking', () => {
  test('sits down without walking, then stands back up before walking on', () => {
    let cat = WALKING
    for (let i = 0; i < SIT_FRAMES; i++) cat = advance(cat, true)
    expect(cat).toEqual({ run: 0, think: 0, sit: SIT_FRAMES })
    for (let i = 0; i < SIT_FRAMES; i++) cat = advance(cat, false)
    expect(cat.sit).toBe(0)
    expect(advance(cat, false).run).toBe(1)
  })

  test('grows a thought bubble once seated', () => {
    const seated: Cat = { run: 0, think: 0, sit: SIT_FRAMES }
    expect(rowText(sceneCells(seated, TRACK), 1)).not.toMatch(/hmm/)
    expect(rowText(sceneCells({ ...seated, think: 12 }, TRACK), 1)).toMatch(/hmm/)
  })
})

const SPINNER = {
  plugin: 'cat-spinner',
  surface: 'terminal',
  component: 'Spinner',
  props: { word: 'Sauteing', message: null, suffix: '…', mode: 'responding' },
} as const

const engineSpinner: Parameters<typeof test>[1] = ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>Sauteing…</Text>
  })
}

// Every color the drawn Raster uses, foreground and background.
const colorsOf = (cells: unknown) => {
  const words = new Uint32Array(Uint8Array.from(atob(String(cells)), ch => ch.charCodeAt(0)).buffer)
  return new Set(words.filter((_, i) => i % 3 !== 0))
}

test('draws the cat above the engine spinner line', async ($, on) => {
  await engineSpinner($, on)
  const ui = await $.ui.mount(SPINNER)
  expect(await ui.find({ type: 'Raster', key: 'cat' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Sauteing/ })).toBeDefined()
  await ui.unmount()
})

describe('coats', () => {
  test('is a Siamese by default', async ($, on) => {
    await engineSpinner($, on)
    const ui = await $.ui.mount(SPINNER)
    const colors = colorsOf((await ui.find({ type: 'Raster', key: 'cat' }))?.props.cells)
    expect(colors.has(0x9c8e82)).toBe(true) // taupe coat
    expect(colors.has(0xf2a54a)).toBe(false)
    await ui.unmount()
  })

  for (const [name, palette] of Object.entries(COATS)) {
    test(`draws the ${name} in its own coat color`, { options: { coat: name } }, async ($, on) => {
      await engineSpinner($, on)
      const ui = await $.ui.mount(SPINNER)
      const colors = colorsOf((await ui.find({ type: 'Raster', key: 'cat' }))?.props.cells)
      expect(colors.has(palette.coat)).toBe(true)
      for (const [other, otherPalette] of Object.entries(COATS)) {
        if (other !== name) expect(colors.has(otherPalette.coat)).toBe(false)
      }
      await ui.unmount()
    })
  }

  // The yarn ball may draw over the ground shadow, so a coat color equal to
  // the shadow's would let the ball draw over the cat.
  test('uses no coat color equal to the ground shadow', () => {
    for (const palette of Object.values(COATS)) {
      const { shadow, ...cat } = palette
      expect(Object.values(cat)).not.toContain(shadow)
    }
  })

  test('gives the white cat odd eyes when it faces out', () => {
    expect(COATS.white.eye).not.toBe(COATS.white.eyeOther)
    for (const [name, palette] of Object.entries(COATS)) {
      if (name !== 'white') expect(palette.eyeOther).toBe(palette.eye)
    }
  })

  test('is an orange tabby with coat set to orange', { options: { coat: 'orange' } }, async ($, on) => {
    await engineSpinner($, on)
    const ui = await $.ui.mount(SPINNER)
    const colors = colorsOf((await ui.find({ type: 'Raster', key: 'cat' }))?.props.cells)
    expect(colors.has(0xf2a54a)).toBe(true) // orange coat
    expect(colors.has(0x9c8e82)).toBe(false)
    await ui.unmount()
  })
})

describe('the /cat-spinner command', () => {
  const RUN = { command: 'cat-spinner', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

  test('opens the settings dialog', async ($, on) => {
    const opened: string[] = []
    on('ui.open', (_$, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true as const } }
    })
    const { text } = await $.command.run({ ...RUN, args: '' })
    expect(opened).toEqual(['cat-spinner-settings'])
    expect(text).toContain('settings are open')
  })

  test('says which cat you have, with the shortcuts, where no dialog can open', async $ => {
    const { text } = await $.command.run({ ...RUN, args: '' })
    expect(text).toContain('siamese')
    expect(text).toContain('/cat-spinner orange')
  })

  test('switches by writing the Cat setting', async ($, on) => {
    const writes: unknown[] = []
    on('config.set', (_$, e) => {
      writes.push({ key: e.key, value: e.value })
      return { value: e.value }
    })
    const { text } = await $.command.run({ ...RUN, args: 'Orange' })
    expect(writes).toEqual([{ key: 'cat-spinner.coat', value: 'orange' }])
    expect(text).toBe('Switched to the orange.')
  })

  test('refuses a cat it does not have, and changes nothing', async ($, on) => {
    const writes: unknown[] = []
    on('config.set', (_$, e) => {
      writes.push(e.key)
      return { value: e.value }
    })
    const { text } = await $.command.run({ ...RUN, args: 'dragon' })
    expect(writes).toEqual([])
    expect(text).toContain('/cat-spinner siamese or /cat-spinner orange')
    expect(text).toContain('/cat-spinner walk or /cat-spinner yarn')
  })
})

describe('the yarn animation', () => {
  const YARN_TRACK = 90
  const session = (frames: number) => {
    let cat: Cat = { run: 0, think: 0, sit: 0, play: startPlay(YARN_TRACK) }
    const all = [cat]
    for (let i = 0; i < frames; i++) all.push((cat = advance(cat, false, YARN_TRACK)))
    return all
  }

  test('swats the ball, chases it, and turns around to follow it', () => {
    const all = session(600)
    const swats = all.filter((cat, i) => i > 0 && cat.play!.swat === 1 && all[i - 1]!.play!.swat === 0).length
    const turns = all.filter((cat, i) => i > 0 && cat.play!.isFacingRight !== all[i - 1]!.play!.isFacingRight).length
    expect(swats).toBeGreaterThanOrEqual(5)
    expect(turns).toBeGreaterThanOrEqual(1)
  })

  test('keeps the cat and the ball on the track', () => {
    for (const { play } of session(600)) {
      expect(play!.x).toBeGreaterThanOrEqual(0)
      expect(play!.x).toBeLessThanOrEqual(YARN_TRACK - W)
      expect(play!.ballX - BALL_R).toBeGreaterThanOrEqual(0)
      expect(play!.ballX + BALL_R).toBeLessThanOrEqual(YARN_TRACK)
    }
  })

  // Walking forward or backing up, the gait advances one frame per pixel the
  // same way, so planted paws stay put on the ground.
  test('moves the gait in step with the cat', () => {
    const all = session(600)
    all.slice(1).forEach((cat, i) => {
      const before = all[i]!
      if (cat.play!.isFacingRight !== before.play!.isFacingRight) return
      const moved = (cat.play!.x - before.play!.x) * (cat.play!.isFacingRight ? 1 : -1)
      expect(cat.run - before.run).toBe(moved + 0) // + 0 turns -0 into 0
    })
  })

  test('draws the ball from the first frame', { options: { animation: 'yarn' } }, async ($, on) => {
    await engineSpinner($, on)
    const ui = await $.ui.mount(SPINNER)
    const colors = colorsOf((await ui.find({ type: 'Raster', key: 'cat' }))?.props.cells)
    expect(colors.has(0xd94a5a)).toBe(true) // the yarn
    await ui.unmount()
  })

  test('has no ball in the walk animation', async ($, on) => {
    await engineSpinner($, on)
    const ui = await $.ui.mount(SPINNER)
    const colors = colorsOf((await ui.find({ type: 'Raster', key: 'cat' }))?.props.cells)
    expect(colors.has(0xd94a5a)).toBe(false)
    await ui.unmount()
  })
})

describe('switching animations with /cat-spinner', () => {
  const RUN = { command: 'cat-spinner', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

  test('writes the Animation setting', async ($, on) => {
    const writes: unknown[] = []
    on('config.set', (_$, e) => {
      writes.push({ key: e.key, value: e.value })
      return { value: e.value }
    })
    const { text } = await $.command.run({ ...RUN, args: 'yarn' })
    expect(writes).toEqual([{ key: 'cat-spinner.animation', value: 'yarn' }])
    expect(text).toBe('Switched to the yarn animation.')
  })

  test('reports both the cat and the animation', async $ => {
    const { text } = await $.command.run({ ...RUN, args: '' })
    expect(text).toContain('siamese')
    expect(text).toContain('walk')
    expect(text).toContain('/cat-spinner yarn')
  })
})

// A repeatable stand-in for Math.random.
const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

describe('the pounce animation', () => {
  const TRACK_P = 90
  const session = (frames: number, seed: number, isWild = true) => {
    const rng = seeded(seed)
    let cat: Cat = { run: 0, think: 0, sit: 0, play: startPlay(TRACK_P, 0, true, isWild) }
    const all = [cat]
    for (let i = 0; i < frames; i++) all.push((cat = advance(cat, false, TRACK_P, rng)))
    return all
  }
  const starts = (all: Cat[], key: 'watch' | 'stalk' | 'leap') =>
    all.filter((cat, i) => i > 0 && cat.play![key] > 0 && all[i - 1]!.play![key] === 0).length

  test('watches, stalks, and leaps onto the ball, differently each time', () => {
    const runs = [7, 11, 23].map(seed => session(900, seed))
    for (const all of runs) {
      expect(starts(all, 'watch')).toBeGreaterThanOrEqual(3)
      expect(starts(all, 'leap')).toBeGreaterThanOrEqual(2)
    }
    const timeline = (all: Cat[]) => all.map(cat => cat.play!.x).join()
    expect(timeline(runs[0]!)).not.toBe(timeline(runs[1]!))
  })

  test('lands every leap with its paw on the ball', () => {
    const all = session(900, 11)
    all.forEach((cat, i) => {
      const before = all[i - 1]
      if (!before || before.play!.leap === 0 || cat.play!.leap !== 0) return
      expect(cat.play!.swat).toBe(4) // straight into the swat's contact frame
    })
  })

  test('keeps the cat and the ball on the track', () => {
    for (const { play } of session(900, 23)) {
      expect(play!.x).toBeGreaterThanOrEqual(0)
      expect(play!.x).toBeLessThanOrEqual(TRACK_P - W)
      expect(play!.ballX - BALL_R).toBeGreaterThanOrEqual(0)
      expect(play!.ballX + BALL_R).toBeLessThanOrEqual(TRACK_P)
    }
  })

  test('leaves the yarn animation exactly as it was: no randomness', () => {
    const timeline = (all: Cat[]) => all.map(cat => `${cat.play!.x}:${cat.play!.ballX.toFixed(3)}`).join()
    expect(timeline(session(600, 7, false))).toBe(timeline(session(600, 99, false)))
  })
})

describe('random', () => {
  test('never picks the same animation twice in a row', () => {
    const rng = seeded(3)
    let last = pickAnimation(undefined, rng)
    for (let i = 0; i < 200; i++) {
      const next = pickAnimation(last, rng)
      expect(next).not.toBe(last)
      last = next
    }
  })

  test('carries the cat between animations from where it stands', () => {
    const track = 90
    const walking: Cat = { run: 63, think: 0, sit: 0 } // 13 cells back from the right end, heading left
    const { x, isFacingRight } = position(walking.run, track)
    const playing = inAnimation(walking, 'pounce', track)
    expect(playing.play).toMatchObject({ x, isFacingRight, isWild: true })
    const back = inAnimation(playing, 'walk', track)
    expect(back.play).toBeUndefined()
    expect(position(back.run, track)).toEqual({ x, isFacingRight })
  })

  test('switches with /cat-spinner random and says what it picked', { options: { animation: 'random' } }, async ($, on) => {
    const RUN = { command: 'cat-spinner', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
    const { text } = await $.command.run({ ...RUN, args: '' })
    expect(text).toMatch(/random \((walk|yarn|pounce) right now\)/)
  })
})

describe('the settings dialog', () => {
  const DIALOG = {
    plugin: 'cat-spinner',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'cat-spinner-settings',
    props: { title: 'cat-spinner', isFocused: true, bodyColumns: 70, placement: 'inline', scroll: { offset: 0, bodyRows: 14 }, view: {} },
  } as const

  test('lists each setting with its current choice', { options: { coat: 'orange', animation: 'pounce' } }, async $ => {
    const ui = await $.ui.mount(DIALOG)
    expect(await ui.find({ type: 'Raster', key: 'preview' })).toBeDefined()
    expect((await ui.find({ type: 'Button', key: 'edit-coat' }))?.text).toContain('Cat: Orange tabby')
    expect((await ui.find({ type: 'Button', key: 'edit-animation' }))?.text).toContain('Animation: Pounce')
    expect(await ui.find({ type: 'Button', key: 'coat-siamese' })).toBeUndefined()
    await ui.unmount()
  })

  test('opens a setting to its options, the current one checked', { options: { animation: 'yarn' } }, async $ => {
    const ui = await $.ui.mount(DIALOG)
    await ui.press({ key: 'edit-animation' })
    expect(await ui.find({ type: 'Button', key: 'edit-coat' })).toBeUndefined()
    expect((await ui.find({ type: 'Button', key: 'animation-yarn' }))?.text).toContain('✓')
    expect((await ui.find({ type: 'Button', key: 'animation-pounce' }))?.text).not.toContain('✓')
    await ui.unmount()
  })

  test('saves an option when picked, and goes back on the current one', async ($, on) => {
    const writes: unknown[] = []
    on('config.set', (_$, e) => {
      writes.push({ key: e.key, value: e.value })
      return { value: e.value }
    })
    const ui = await $.ui.mount(DIALOG)
    await ui.press({ key: 'edit-animation' })
    await ui.press({ key: 'animation-walk' }) // already the animation: back to the list
    expect(await ui.find({ type: 'Button', key: 'edit-animation' })).toBeDefined()
    await ui.press({ key: 'edit-animation' })
    await ui.press({ key: 'animation-pounce' })
    expect(writes).toEqual([{ key: 'cat-spinner.animation', value: 'pounce' }])
    await ui.unmount()
  })
})
