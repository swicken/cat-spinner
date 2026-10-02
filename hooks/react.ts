// The cat reacting to Claude's tools: typing on a laptop while files are
// edited, digging while a command runs, peering through a magnifying glass
// while Claude reads or searches, and jumping in surprise when a tool fails
// or is denied.

import { blend, GROUND, SIT_X, set, standPose, type Canvas, type Pose, type Text } from './rig'

export type Activity = 'type' | 'dig' | 'search'
export type Act = { kind: Activity | 'startle' | 'stretch'; frame: number }

// An activity lasts at least this long, so a quick read is still seen.
export const ACT_FRAMES = 14
export const STARTLE_FRAMES = 12
// Waking from a nap: a long play-bow stretch, then on with the turn.
export const STRETCH_FRAMES = 18

// Which activity a tool shows, if any; other tools leave the cat be.
export const activityOf = (tool: string): Activity | undefined => {
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) return 'type'
  if (['Bash', 'BashOutput'].includes(tool)) return 'dig'
  if (['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch'].includes(tool)) return 'search'
  return undefined
}

// Typing and searching happen sitting down, facing out.
export const isSeated = (act: Act | undefined) => act?.kind === 'type' || act?.kind === 'search'

// Sandy, so it shows on a dark terminal as well as a light one.
const DIRT = [0xc49a62, 0x9c7646]

// Crouched with the head down, front paws scrabbling in turn.
export const digPose = (frame: number): Pose => {
  const stand = standPose()
  const home = stand.nearFront.at
  const strokes: [number, number, number][] = [
    // dx, height, lift
    [2.6, 2.4, 0.8],
    [1.0, 0, 0],
    [-2.0, 0.6, 0],
    [0, 2.0, 0.8],
  ]
  const paw = (offset: number) => {
    const [dx, up, lift] = strokes[(frame + offset) % strokes.length] ?? [0, 0, 0]
    return { at: { x: home.x + dx, y: GROUND - up }, lift }
  }

  return {
    ...stand,
    hip: { x: stand.hip.x, y: stand.hip.y - 0.9 },
    shoulder: { x: stand.shoulder.x + 0.4, y: stand.shoulder.y + 1.9 },
    head: { x: stand.head.x + 1.2, y: stand.head.y + 2.8 },
    nearFront: paw(0),
    farFront: { ...paw(2), at: { ...paw(2).at, x: paw(2).at.x + 1 } },
  }
}

// Dirt flung back under the belly and out past the hind legs in arcs, and a
// little mound growing in front of the paws.
export const drawDirt = (canvas: Canvas, frame: number) => {
  const home = standPose().nearFront.at.x
  for (let i = 0; i < 4; i++) {
    const p = ((frame + i * 2) % 8) / 8
    const x = home - 2 - p * 20
    const y = GROUND - 0.5 - 3.5 * Math.sin(Math.PI * p)
    const color = DIRT[i % 2] ?? DIRT[0]!
    set(canvas, x, y, color)
    set(canvas, x + 1, y, color)
  }
  const size = Math.min(5, 2 + Math.floor(frame / 5))
  for (let k = 0; k < size; k++) {
    set(canvas, home + 3 + k, GROUND + 0.6, DIRT[1]!)
    if (k > 0 && k < size - 1) set(canvas, home + 3 + k, GROUND - 0.4, DIRT[0]!)
  }
}

// A jump straight up with the back arched, the tail puffed and pointing up.
export const startlePose = (frame: number): Pose => {
  const stand = standPose()
  const jump = frame < 6 ? -3 * Math.sin((Math.PI * frame) / 6) : 0
  const settle = frame > STARTLE_FRAMES - 4 ? (STARTLE_FRAMES - frame) / 4 : 1
  const lift = (p: { x: number; y: number }) => ({ x: p.x, y: p.y + jump })
  const base = stand.tail[0]

  return {
    ...stand,
    hip: lift(stand.hip),
    shoulder: lift(stand.shoulder),
    head: lift({ x: stand.head.x - 0.4, y: stand.head.y - 0.4 }),
    tail: [base, { x: base.x + 0.2, y: base.y - 2.2 }, { x: base.x - 0.2, y: base.y - 4.4 }, { x: base.x + 0.3, y: base.y - 6.4 }].map(lift) as Pose['tail'],
    nearHind: { at: lift(stand.nearHind.at), lift: 0 },
    farHind: { at: lift(stand.farHind.at), lift: 0 },
    nearFront: { at: lift(stand.nearFront.at), lift: 0 },
    farFront: { at: lift(stand.farFront.at), lift: 0 },
    arch: 2.2 * settle,
    puff: 1.6 * settle,
  }
}

// The "!" over a startled cat's head, in sprite cells (row, column).
export const startleText = (pose: Pose): Text => [Math.round(pose.head.x) + 2, 0, '!', 0xffd166, 0x01000000]

const LAPTOP = { lid: 0x9aa0aa, edge: 0xc4c9d1, glow: 0xe8f1ff, outline: 0x2a2c33 }
const GLASS = { rim: 0xb08a3e, handle: 0x6b4a2a, lens: 0xd8f1ff }

// A laptop on the seated cat's lap, seen from behind the lid, paws tapping
// over the top. In the seated art's coordinates.
export const drawLaptop = (canvas: Canvas, frame: number, paw: number) => {
  for (let row = 12; row <= 16; row++) {
    for (let col = 4; col <= 14; col++) {
      const isEdge = row === 12 || row === 16 || col === 4 || col === 14
      const color = isEdge ? LAPTOP.outline : row === 13 ? LAPTOP.edge : LAPTOP.lid
      set(canvas, SIT_X + col, row, color)
    }
  }
  set(canvas, SIT_X + 9, 14, LAPTOP.glow)
  // Each paw is outlined, so a cream paw still shows against a cream chest;
  // they take turns lifting off the lid's top edge.
  const left = frame % 2 === 0
  for (const [col, isUp] of [[6, left], [11, !left]] as const) {
    const row = isUp ? 10 : 11
    set(canvas, SIT_X + col - 1, row, LAPTOP.outline)
    set(canvas, SIT_X + col, row, paw)
    set(canvas, SIT_X + col + 1, row, paw)
    set(canvas, SIT_X + col + 2, row, LAPTOP.outline)
    set(canvas, SIT_X + col, row - 1, LAPTOP.outline)
    set(canvas, SIT_X + col + 1, row - 1, LAPTOP.outline)
    if (isUp) for (let c = col; c <= col + 1; c++) set(canvas, SIT_X + c, 11, LAPTOP.outline)
  }
}

// A magnifying glass held up and swept slowly from eye to eye; the eye under
// the lens looks big.
export const drawMagnifier = (canvas: Canvas, frame: number, paw: number, eye: number, pupil: number) => {
  const cx = 9.5 + 4.5 * Math.sin(frame / 7)
  const cy = 5
  for (let row = 1; row <= 9; row++) {
    for (let col = 4; col <= 16; col++) {
      const d = Math.hypot(col + 0.5 - cx, row + 0.5 - cy)
      if (d > 2.9) continue
      set(canvas, SIT_X + col, row, d > 2.1 ? GLASS.rim : GLASS.lens)
    }
  }
  // The eye nearest the lens, magnified: three cells of eye around a pupil.
  const eyes = [5, 14]
  const near = eyes.find(x => Math.abs(x - cx + 0.5) < 1.6)
  if (near !== undefined) {
    for (const [dc, dr] of [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const) set(canvas, SIT_X + near + dc, 4 + dr, eye)
    set(canvas, SIT_X + near, 5, pupil)
  }
  // The handle runs down and outward, away from the face, to an outlined paw.
  const step = cx < 9.5 ? -1 : 1
  for (let k = 0; k < 3; k++) set(canvas, SIT_X + cx + step * (1.8 + k), cy + 2.6 + k, GLASS.handle)
  const px = Math.round(cx + step * 4.8 - 0.5)
  const py = Math.round(cy + 5.4)
  for (const [dc, dr, color] of [[0, -1, LAPTOP.outline], [1, -1, LAPTOP.outline], [-1, 0, LAPTOP.outline], [0, 0, paw], [1, 0, paw], [2, 0, LAPTOP.outline]] as const) {
    set(canvas, SIT_X + px + dc, py + dr, color)
  }
}


// Waking up: the front end reaches down and far forward, paws stretched out in
// front, rear high and tail up; held a moment at full stretch, then back to
// standing.
export const stretchPose = (frame: number): Pose => {
  const stand = standPose()
  const base = stand.tail[0]
  const front = stand.nearFront.at
  const stretched: Pose = {
    ...stand,
    hip: { x: stand.hip.x, y: stand.hip.y - 1.2 },
    shoulder: { x: stand.shoulder.x + 1.4, y: stand.shoulder.y + 3.6 },
    head: { x: stand.head.x + 2.6, y: stand.head.y + 4.4 },
    tail: [base, { x: base.x - 1.6, y: base.y - 2.4 }, { x: base.x - 2.2, y: base.y - 5.0 }, { x: base.x - 0.8, y: base.y - 6.6 }],
    nearFront: { at: { x: front.x + 7.2, y: GROUND }, lift: 0 },
    farFront: { at: { x: front.x + 8.4, y: GROUND }, lift: 0 },
  }
  // Into the stretch over the first third, held, then out over the last third.
  const t = Math.min(frame, STRETCH_FRAMES) / STRETCH_FRAMES
  const ease = (u: number) => u * u * (3 - 2 * u)
  const amount = t < 1 / 3 ? ease(t * 3) : t > 2 / 3 ? ease((1 - t) * 3) : 1
  return blend(stand, stretched, amount)
}
