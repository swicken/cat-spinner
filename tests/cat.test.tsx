import { describe, expect, test } from 'claude-code/testing'

import { advance, position, sceneCells, SIT_FRAMES, type Cat } from '../hooks/register'
import { CYCLE, pawAt, W } from '../hooks/rig'

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

  test('is an orange tabby with coat set to orange', { options: { coat: 'orange' } }, async ($, on) => {
    await engineSpinner($, on)
    const ui = await $.ui.mount(SPINNER)
    const colors = colorsOf((await ui.find({ type: 'Raster', key: 'cat' }))?.props.cells)
    expect(colors.has(0xf2a54a)).toBe(true) // orange coat
    expect(colors.has(0x9c8e82)).toBe(false)
    await ui.unmount()
  })
})
