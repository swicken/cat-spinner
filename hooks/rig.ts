// A small 2D rig for the cat: poses are joint positions, drawn as soft shapes,
// rasterized to pixels, outlined, and shaded. Coordinates are pixels, y down,
// the cat facing right.

export const W = 40
export const H = 18

type Vec = { x: number; y: number }
const v = (x: number, y: number): Vec => ({ x, y })
const add = (a: Vec, b: Vec) => v(a.x + b.x, a.y + b.y)
const sub = (a: Vec, b: Vec) => v(a.x - b.x, a.y - b.y)
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const mixV = (a: Vec, b: Vec, t: number) => v(mix(a.x, b.x, t), mix(a.y, b.y, t))
const len = (a: Vec) => Math.hypot(a.x, a.y)

// A seal-point colorpoint: taupe-grey body with soft mottling, cream chin and
// chest, and dark seal-brown points on the ears, face mask, legs, and tail.
export const COLORS = {
  outline: 0x1c1512,
  inner: 0x4a3d35,
  coat: 0x9c8e82,
  coatLight: 0xb9ab9d,
  coatShade: 0x7e7066,
  cream: 0xd9cdbb,
  creamShade: 0xc2b6a5,
  pointLight: 0x6a564a,
  point: 0x4b3a31,
  farCoat: 0x6c5f56,
  farPoint: 0x382b24,
  eye: 0x86c1ee,
  pupil: 0x101418,
  nose: 0x1a1310,
  earInner: 0x5e4a40,
  shadow: 0x33333d,
  cloud: 0xffffff,
  cloudEdge: 0x9a9aa8,
  text: 0x3a3a46,
}

// A fixed per-pixel hash, for fur mottling that stays put on the body.
const speckle = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0

export type Paw = { at: Vec; lift: number }
export type Pose = {
  hip: Vec
  shoulder: Vec
  head: Vec
  tail: [Vec, Vec, Vec, Vec]
  nearHind: Paw
  nearFront: Paw
  farHind: Paw
  farFront: Paw
  eyesClosed: boolean
}

export const blend = (a: Pose, b: Pose, t: number): Pose => {
  const paw = (p: Paw, q: Paw) => ({ at: mixV(p.at, q.at, t), lift: mix(p.lift, q.lift, t) })

  return {
    hip: mixV(a.hip, b.hip, t),
    shoulder: mixV(a.shoulder, b.shoulder, t),
    head: mixV(a.head, b.head, t),
    tail: a.tail.map((p, i) => mixV(p, b.tail[i] ?? p, t)) as Pose['tail'],
    nearHind: paw(a.nearHind, b.nearHind),
    nearFront: paw(a.nearFront, b.nearFront),
    farHind: paw(a.farHind, b.farHind),
    farFront: paw(a.farFront, b.farFront),
    eyesClosed: t < 0.5 ? a.eyesClosed : b.eyesClosed,
  }
}

// --- The walk -------------------------------------------------------------

// A lateral-sequence walk: near hind, near front, far hind, far front, a quarter
// cycle apart. Each paw is planted for 8 of 12 frames and slides back one pixel
// per frame as the body moves forward one pixel per frame, so it stays put on
// the ground; then it lifts and swings forward for 4 frames.
export const CYCLE = 12
const PLANTED = 8
const STRIDE = PLANTED - 1
const GROUND = 15.9
const STEP_HEIGHT = 2.4

const smooth = (t: number) => t * t * (3 - 2 * t)

export const pawAt = (frame: number, offset: number, homeX: number): Paw => {
  const f = (((frame - offset) % CYCLE) + CYCLE) % CYCLE
  if (f < PLANTED) return { at: v(homeX + STRIDE / 2 - f, GROUND), lift: 0 }
  const q = (f - STRIDE) / (CYCLE - STRIDE)
  const lift = Math.sin(Math.PI * q)

  return { at: v(homeX - STRIDE / 2 + STRIDE * smooth(q), GROUND - STEP_HEIGHT * lift), lift }
}

const WALK_HIP = v(11.5, 8.0)
const WALK_SHOULDER = v(21.5, 7.8)
const hindJoint = (hip: Vec) => add(hip, v(0.4, 1.4))
const frontJoint = (shoulder: Vec) => add(shoulder, v(0.3, 1.6))

// Each girdle rises as one of its legs passes under it mid-stance, twice per
// cycle; the shoulders run half a step behind the hips, so the spine rocks.
const FLEX = 0.45
const rise = (frame: number, midStance: number) => -FLEX * Math.cos((4 * Math.PI * (frame - midStance)) / CYCLE)

export const walkPose = (frame: number, isBlinking: boolean): Pose => {
  const hindHome = hindJoint(WALK_HIP).x + 0.6
  const frontHome = frontJoint(WALK_SHOULDER).x + 0.4
  const hip = add(WALK_HIP, v(0, rise(frame, 3.5)))
  const shoulder = add(WALK_SHOULDER, v(0, rise(frame, 6.5)))
  const wave = (lag: number) => Math.sin((2 * Math.PI * (frame - lag)) / (CYCLE * 2))
  const base = add(hip, v(-3.4, -1.3))

  return {
    hip,
    shoulder,
    head: v(26.4, 5.2 + 0.5 * rise(frame, 6.5)),
    tail: [
      base,
      add(base, v(-3.2 + 0.3 * wave(0), -0.6)),
      add(base, v(-5.2 + 0.9 * wave(2), -3.6)),
      add(base, v(-3.6 + 1.6 * wave(4), -5.4 + 0.4 * wave(4))),
    ],
    nearHind: pawAt(frame, 0, hindHome),
    nearFront: pawAt(frame, 3, frontHome),
    farHind: pawAt(frame, 6, hindHome),
    farFront: pawAt(frame, 9, frontHome),
    eyesClosed: isBlinking,
  }
}

// Standing still, all four paws planted, before turning to sit.
export const standPose = (): Pose => {
  const hindHome = hindJoint(WALK_HIP).x + 0.6
  const frontHome = frontJoint(WALK_SHOULDER).x + 0.4
  const base = add(WALK_HIP, v(-3.4, -1.3))

  return {
    hip: WALK_HIP,
    shoulder: WALK_SHOULDER,
    head: v(26.4, 5.2),
    tail: [base, add(base, v(-3.2, -0.6)), add(base, v(-5.2, -3.6)), add(base, v(-3.6, -5.4))],
    nearHind: { at: v(hindHome - 0.6, GROUND), lift: 0 },
    nearFront: { at: v(frontHome, GROUND), lift: 0 },
    farHind: { at: v(hindHome + 1.0, GROUND), lift: 0 },
    farFront: { at: v(frontHome + 1.4, GROUND), lift: 0 },
    eyesClosed: false,
  }
}

// --- Shapes ---------------------------------------------------------------

type Kind =
  | 'body' | 'neck' | 'head' | 'muzzle' | 'cheek' | 'earNear' | 'earFar' | 'earInner'
  | 'leg' | 'paw' | 'tail' | 'front'
type Own = (down: number, x: number, y: number) => number
type Blob = { x: number; y: number; rx: number; ry: number; t: number; kind: Kind; z?: number; own?: Own }
type Tri = { a: Vec; b: Vec; c: Vec; kind: Kind; z?: number; own?: Own }
type Shape = Blob | Tri

const circle = (p: Vec, r: number, t: number, kind: Kind): Blob => ({ x: p.x, y: p.y, rx: r, ry: r, t, kind })

const capsule = (a: Vec, b: Vec, ra: number, rb: number, kind: Kind, t0 = 0, t1 = 1): Blob[] => {
  const n = Math.max(2, Math.ceil(len(sub(b, a)) / 0.25) + 1)

  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    return circle(mixV(a, b, t), mix(ra, rb, t), mix(t0, t1, t), kind)
  })
}

const bezier = ([p0, p1, p2, p3]: Pose['tail'], t: number) => {
  const u = 1 - t
  return v(
    u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  )
}

// Two-bone inverse kinematics: where the middle joint sits so bones of lengths
// a and b reach from `from` to `to`, bending toward +x or -x.
export const ik = (from: Vec, to: Vec, a: number, b: number, bendForward: boolean) => {
  const span = sub(to, from)
  const d = Math.min(a + b - 0.01, Math.max(Math.abs(a - b) + 0.01, len(span)))
  const dir = v(span.x / (len(span) || 1), span.y / (len(span) || 1))
  const along = (a * a - b * b + d * d) / (2 * d)
  const out = Math.sqrt(Math.max(0, a * a - along * along))
  const perp = v(-dir.y, dir.x)
  const side = (perp.x >= 0) === bendForward ? 1 : -1
  const joint = add(add(from, v(dir.x * along, dir.y * along)), v(perp.x * out * side, perp.y * out * side))

  return { joint, end: add(from, v(dir.x * d, dir.y * d)) }
}

const hindLeg = (hip: Vec, paw: Paw) => {
  const top = hindJoint(hip)
  const hock = add(paw.at, v(-1.5 + 0.9 * paw.lift, -2.3 + 0.3 * paw.lift))
  const { joint: knee, end } = ik(top, hock, 3.6, 3.4, true)

  return {
    attach: top.y + 1.5,
    blobs: [
      ...capsule(top, knee, 1.6, 1.0, 'leg', 0, 0.35),
      ...capsule(knee, end, 0.9, 0.75, 'leg', 0.35, 0.7),
      ...capsule(end, paw.at, 0.75, 0.75, 'leg', 0.7, 1),
      { x: paw.at.x + 0.5, y: paw.at.y, rx: 1.3, ry: 0.85, t: 1, kind: 'paw' as const, z: 1 },
    ],
  }
}

const frontLeg = (shoulder: Vec, paw: Paw) => {
  const top = frontJoint(shoulder)
  const wrist = add(paw.at, v(0.8 * paw.lift, -1.2))
  const { joint: elbow, end } = ik(top, wrist, 3.4, 3.6, false)

  return {
    attach: top.y + 1.5,
    blobs: [
      ...capsule(top, elbow, 1.5, 1.0, 'leg', 0, 0.35),
      ...capsule(elbow, end, 0.85, 0.8, 'leg', 0.35, 0.8),
      ...capsule(end, paw.at, 0.75, 0.75, 'leg', 0.8, 1),
      { x: paw.at.x + 0.6, y: paw.at.y, rx: 1.3, ry: 0.85, t: 1, kind: 'paw' as const, z: 1 },
    ],
  }
}

const RADII: [number, number][] = [[0, 2.6], [0.2, 2.7], [0.5, 2.2], [0.8, 2.75], [1, 2.5]]
const radiusAt = (t: number) => {
  for (let i = 1; i < RADII.length; i++) {
    const [t0, r0] = RADII[i - 1] ?? [0, 0]
    const [t1, r1] = RADII[i] ?? [1, 0]
    if (t <= t1) return mix(r0, r1, (t - t0) / (t1 - t0))
  }
  return 2.5
}

const bodyShapes = (pose: Pose): Shape[] => {
  const { hip, shoulder, head } = pose
  const spine = Array.from({ length: 26 }, (_, i) => {
    const t = i / 25
    const drop = 0.5 * Math.exp(-(((t - 0.8) / 0.15) ** 2))
    const at = add(mixV(hip, shoulder, t), v(0, -0.35 * Math.sin(Math.PI * t) + drop))
    return circle(at, radiusAt(t), t, 'body')
  })
  const h = head

  return [
    circle(add(hip, v(-1.3, 0.2)), 2.7, 0, 'body'),
    ...spine,
    ...capsule(add(shoulder, v(0.8, -0.6)), add(h, v(-1.2, 1.2)), 1.8, 1.6, 'neck'),
    { a: add(h, v(-3.0, -1.2)), b: add(h, v(-0.8, -2.6)), c: add(h, v(-2.5, -5.0)), kind: 'earFar', z: 2 },
    { x: h.x, y: h.y, rx: 3.3, ry: 3.0, t: 0, kind: 'head', z: 3 },
    { x: h.x + 1.5, y: h.y + 1.4, rx: 1.6, ry: 1.2, t: 0, kind: 'cheek', z: 4 },
    { x: h.x + 2.4, y: h.y + 0.9, rx: 1.3, ry: 1.1, t: 0, kind: 'muzzle', z: 4 },
    { a: add(h, v(-0.9, -2.2)), b: add(h, v(2.2, -1.9)), c: add(h, v(0.6, -5.3)), kind: 'earNear', z: 5 },
    { a: add(h, v(-0.2, -2.4)), b: add(h, v(1.4, -2.2)), c: add(h, v(0.6, -4.3)), kind: 'earInner', z: 6 },
  ]
}

const tailShapes = (pose: Pose): Blob[] =>
  Array.from({ length: 40 }, (_, i) => {
    const t = i / 39
    return circle(bezier(pose.tail, t), mix(1.2, 0.95, t), t, 'tail')
  })

const inTri = ({ a, b, c }: Tri, x: number, y: number) => {
  const s = (p: Vec, q: Vec) => (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x)
  const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

// The shape that colors a pixel: the highest z containing its center, and of
// those the one it sits deepest inside; with how far down that shape it sits
// (-1 top edge, 1 bottom edge).
const hit = (shapes: Shape[], x: number, y: number) => {
  let best: { shape: Shape; down: number; z: number; depth: number } | undefined
  for (const s of shapes) {
    const z = s.z ?? 0
    let depth: number
    let down = 0
    if ('a' in s) {
      if (!inTri(s, x, y)) continue
      depth = 0
    } else {
      const dx = (x - s.x) / s.rx
      const dy = (y - s.y) / s.ry
      depth = dx * dx + dy * dy
      if (depth > 1) continue
      down = dy
    }
    if (!best || z > best.z || (z === best.z && depth < best.depth)) best = { shape: s, down, z, depth }
  }
  return best
}

// --- Drawing --------------------------------------------------------------

export type Canvas = { color: Int32Array; owner: Int8Array }
const EMPTY = -1
const OUTLINE = -2

type Layer = {
  shapes: Shape[]
  paint: (shape: Shape, down: number, x: number, y: number) => number
  innerFrom?: number
}

const drawLayer = (canvas: Canvas, layer: Layer, id: number) => {
  const mask = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const found = hit(layer.shapes, x + 0.5, y + 0.5)
      if (!found) continue
      mask[y * W + x] = 1
      canvas.color[y * W + x] = found.shape.own?.(found.down, x, y) ?? layer.paint(found.shape, found.down, x, y)
      canvas.owner[y * W + x] = id
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (mask[i]) continue
      const touches =
        (x > 0 && mask[i - 1]) || (x < W - 1 && mask[i + 1]) || (y > 0 && mask[i - W]) || (y < H - 1 && mask[i + W])
      if (!touches) continue
      const owner = canvas.owner[i] ?? EMPTY
      if (owner === EMPTY) {
        canvas.color[i] = COLORS.outline
        canvas.owner[i] = OUTLINE
      } else if (owner >= 0 && owner < id && y >= (layer.innerFrom ?? 0)) {
        canvas.color[i] = COLORS.inner
      }
    }
  }
}

const set = (canvas: Canvas, x: number, y: number, color: number) => {
  const px = Math.floor(x), py = Math.floor(y)
  if (px < 0 || px >= W || py < 0 || py >= H) return
  canvas.color[py * W + px] = color
  if ((canvas.owner[py * W + px] ?? EMPTY) === EMPTY) canvas.owner[py * W + px] = OUTLINE
}

// Legs shade from the coat at the hip or shoulder down to dark points at the paw.
const legPaint = (isNear: boolean) => (shape: Shape) => {
  const t = 'a' in shape ? 1 : shape.t
  if (isNear) {
    if (shape.kind === 'paw' || t > 0.6) return COLORS.point
    return t > 0.3 ? COLORS.pointLight : COLORS.coatShade
  }
  return shape.kind === 'paw' || t > 0.4 ? COLORS.farPoint : COLORS.farCoat
}

const bodyPaint = (pose: Pose) => (shape: Shape, down: number, x: number, y: number) => {
  switch (shape.kind) {
    case 'earFar': return COLORS.farPoint
    case 'earNear': return COLORS.point
    case 'earInner': return COLORS.earInner
    case 'muzzle': return COLORS.point
    case 'cheek': return COLORS.pointLight
    case 'head': {
      // The mask darkens toward the face; the back of the head stays coat-colored.
      const toFace = x + 0.5 - pose.head.x
      if (toFace > 1.2) return COLORS.pointLight
      return down < -0.6 ? COLORS.coatLight : COLORS.coat
    }
    case 'neck': return down > -0.2 ? COLORS.cream : COLORS.coat
    default: {
      const t = 'a' in shape ? 0 : shape.t
      if (t > 0.72 && down > 0.1) return down > 0.85 ? COLORS.creamShade : COLORS.cream
      if (down > 0.55) return COLORS.coatShade
      if (down < -0.8) return COLORS.coatLight
      return speckle(x, y) % 9 === 0 ? COLORS.coatLight : COLORS.coat
    }
  }
}

// The tail darkens from the coat at its base to a seal-brown tip.
const tailPaint = (shape: Shape) => {
  const t = 'a' in shape ? 0 : shape.t
  return t > 0.45 ? COLORS.point : t > 0.2 ? COLORS.pointLight : COLORS.coatShade
}


export const drawCat = (pose: Pose, isLookingOut = false) => {
  const canvas: Canvas = { color: new Int32Array(W * H), owner: new Int8Array(W * H).fill(EMPTY) }
  const hindFar = hindLeg(pose.hip, pose.farHind)
  const frontFar = frontLeg(pose.shoulder, pose.farFront)
  const hindNear = hindLeg(pose.hip, pose.nearHind)
  const frontNear = frontLeg(pose.shoulder, pose.nearFront)

  drawLayer(canvas, { shapes: [...hindFar.blobs, ...frontFar.blobs], paint: legPaint(false) }, 0)
  drawLayer(canvas, { shapes: tailShapes(pose), paint: tailPaint }, 1)
  const body = bodyShapes(pose)
  drawLayer(canvas, { shapes: isLookingOut ? [...body.slice(0, -6), ...frontHead(pose.head)] : body, paint: bodyPaint(pose) }, 2)
  drawLayer(canvas, { shapes: hindNear.blobs, paint: legPaint(true), innerFrom: hindNear.attach }, 3)
  drawLayer(canvas, { shapes: frontNear.blobs, paint: legPaint(true), innerFrom: frontNear.attach }, 4)

  if (isLookingOut) frontFace(canvas, pose.head, pose.eyesClosed)
  else sideFace(canvas, pose.head, pose.eyesClosed)

  // A soft shadow on the ground row.
  for (let x = Math.floor(pose.hip.x - 4); x <= Math.ceil(pose.shoulder.x + 3); x++) {
    if (x >= 0 && x < W && canvas.owner[(H - 1) * W + x] === EMPTY) canvas.color[(H - 1) * W + x] = COLORS.shadow, canvas.owner[(H - 1) * W + x] = OUTLINE
  }

  return { canvas, texts: [] as Text[] }
}

const sideFace = (canvas: Canvas, h: Vec, isClosed: boolean) => {
  const eye = v(Math.floor(h.x + 1.0), Math.floor(h.y - 0.7))
  if (isClosed) {
    set(canvas, eye.x, eye.y + 1, COLORS.outline)
    set(canvas, eye.x + 1, eye.y + 1, COLORS.outline)
  } else {
    set(canvas, eye.x, eye.y, COLORS.eye)
    set(canvas, eye.x, eye.y + 1, COLORS.eye)
    set(canvas, eye.x + 1, eye.y, COLORS.pupil)
    set(canvas, eye.x + 1, eye.y + 1, COLORS.pupil)
  }
  set(canvas, h.x + 3.5, h.y + 0.4, COLORS.nose)
}

// --- Facing out: the head, and the seated cat -----------------------------

const own = (color: number): Own => () => color
const shaded = (light: number, base: number, dark: number): Own => down => (down < -0.6 ? light : down > 0.6 ? dark : base)
const ellipse = (x: number, y: number, rx: number, ry: number, z: number, paint: Own): Blob =>
  ({ x, y, rx, ry, t: 0, kind: 'front', z, own: paint })
const tri = (a: Vec, b: Vec, c: Vec, z: number, paint: Own): Tri => ({ a, b, c, kind: 'front', z, own: paint })

export const frontHead = (c: Vec): Shape[] => {
  const ear = (side: number): Shape[] => [
    tri(add(c, v(3.9 * side, -1.4)), add(c, v(1.2 * side, -3.0)), add(c, v(3.5 * side, -5.4)), 2, own(COLORS.point)),
    tri(add(c, v(3.3 * side, -2.0)), add(c, v(1.9 * side, -2.9)), add(c, v(3.2 * side, -4.4)), 2.5, own(COLORS.earInner)),
  ]

  return [
    ...ear(-1),
    ...ear(1),
    ellipse(c.x, c.y, 4.0, 3.3, 3, shaded(COLORS.coatLight, COLORS.coat, COLORS.coat)),
    ellipse(c.x, c.y + 1.1, 4.5, 2.2, 3, own(COLORS.coat)),
    ellipse(c.x, c.y + 1.0, 2.7, 2.2, 4, own(COLORS.pointLight)),
    ellipse(c.x, c.y + 1.9, 1.7, 1.1, 5, own(COLORS.point)),
  ]
}

const frontFace = (canvas: Canvas, c: Vec, isClosed: boolean) => {
  for (const side of [-1, 1]) {
    const x = Math.floor(c.x + 1.9 * side - 0.5)
    const y = Math.floor(c.y - 0.2)
    if (isClosed) {
      set(canvas, x, y + 1, COLORS.outline)
      set(canvas, x + 1, y + 1, COLORS.outline)
    } else {
      set(canvas, x, y, COLORS.eye)
      set(canvas, x + 1, y, COLORS.eye)
      set(canvas, side < 0 ? x + 1 : x, y + 1, COLORS.pupil)
      set(canvas, side < 0 ? x : x + 1, y + 1, COLORS.eye)
    }
  }
  set(canvas, c.x - 0.5, c.y + 1.4, COLORS.nose)
  set(canvas, c.x + 0.5, c.y + 1.4, COLORS.nose)
}

// --- The seated cat, facing out ----------------------------------------------

// Hand-drawn: at this size a front-facing sit reads better pixel by pixel.
// O outline, C coat, c light coat, d coat shade, Q cream, q cream shade,
// p light point, P point, F far point, E eye, K pupil, N nose, I inner ear.
export const SIT_ART = [
  '....O.........O........',
  '...OPO.......OPO.......',
  '...OPIOOOOOOOIPO.......',
  '..OPCCcccpcccCCPO......',
  '..OCEECppPppCEECO......',
  '..OCEKCpPPPpCKECO......',
  '..OCCCpPPNPPpCCCO......',
  '...OCCCpPPPpCCCO.......',
  '....OOCQQQQQCOO........',
  '....OCQQQQQQQCO........',
  '...OCCQQQQQQQCCO...OO..',
  '...OCCCQQQQQCCCO..OPPO.',
  '..OCCCOppqppOCCCO.OPO..',
  '..OCCCOpPqPpOCCCOOPPO..',
  '.OCCCCOPPqPPOCCCOdPO...',
  '.OCCCdOPPOPPOdCOddO....',
  'OddFFOPPPOPPPOFFOOO....',
  '.OOOOOOOOOOOOOOOOO.....',
]

const SIT_COLORS: Record<string, number> = {
  O: COLORS.outline, C: COLORS.coat, c: COLORS.coatLight, d: COLORS.coatShade, Q: COLORS.cream,
  q: COLORS.creamShade, p: COLORS.pointLight, P: COLORS.point, F: COLORS.farPoint, E: COLORS.eye,
  K: COLORS.pupil, N: COLORS.nose, I: COLORS.earInner,
}
const SIT_EYE_ROW = 4
const SIT_TAIL_TIP = [10, 11]
// The sprite column where the seated art starts, so the cat sits where it stood.
const SIT_X = 8

export type Thought = { puffs: number; text: string } | undefined
export type Text = [number, number, string, number, number]

// `think` counts frames seated: it drives the slow blink and the tail flick.
export const drawSitCat = (think: number, thought: Thought) => {
  const canvas: Canvas = { color: new Int32Array(W * H), owner: new Int8Array(W * H).fill(EMPTY) }
  const isClosed = think % 40 < 32
  const isFlicked = Math.floor(think / 6) % 4 === 3

  SIT_ART.forEach((line, row) => {
    const shifted = isFlicked && SIT_TAIL_TIP.includes(row) ? line.slice(0, 18) + '.' + line.slice(18, -1) : line
    ;[...shifted].forEach((ch, col) => {
      let key = ch
      if (isClosed && (ch === 'E' || ch === 'K')) key = row === SIT_EYE_ROW ? 'C' : 'O'
      const color = SIT_COLORS[key]
      if (color !== undefined) set(canvas, SIT_X + col, row, color)
    })
  })
  for (let x = SIT_X - 1; x <= SIT_X + 20; x++) {
    const i = (H - 1) * W + x
    if (x >= 0 && x < W && canvas.owner[i] === EMPTY) canvas.color[i] = COLORS.shadow, canvas.owner[i] = OUTLINE
  }

  const texts: Text[] = []
  if (thought) {
    const puffs: [number, number, number][] = [[SIT_X + 18.0, 3.4, 0.4], [SIT_X + 20.0, 1.9, 0.7]]
    puffs.slice(0, thought.puffs).forEach(([x, y, r]) => {
      for (let py = 0; py < H; py++)
        for (let px = 0; px < W; px++)
          if (Math.hypot(px + 0.5 - x, py + 0.5 - y) <= r + 0.5) set(canvas, px, py, COLORS.cloud)
    })
    if (thought.puffs > 2) {
      const bx = SIT_X + 26
      for (let py = 0; py < 6; py++) {
        for (let px = 0; px < W; px++) {
          const d = ((px + 0.5 - bx) / 4.7) ** 2 + ((py + 0.5 - 2.6) / 2.8) ** 2
          if (d <= 1) set(canvas, px, py, d > 0.6 ? COLORS.cloudEdge : COLORS.cloud)
        }
      }
      texts.push([Math.round(bx - 1.5), 1, thought.text, COLORS.text, COLORS.cloud])
    }
  }

  return { canvas, texts }
}
