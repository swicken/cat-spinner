// The yarn animation: a ball of yarn rolls along the track, and the cat walks
// up to it, crouches, swats it away with a front paw, then chases it again.

import { blend, GROUND, H, smooth, standPose, W, type Pose } from './rig'

// The ball: radius in pixels, its center height, and how it rolls.
export const BALL_R = 2.4
const BALL_Y = GROUND - 0.9
const FRICTION = 0.92
const STOP = 0.12
const BOUNCE = 0.6

// Where the cat's swatting paw lands, in sprite columns, facing right; facing
// left the sprite is mirrored, so it is W - 1 - FRONT.
const FRONT = 27
// The ball is in reach when its center is this far past the paw, at most.
const REACH: [number, number] = [-1, 2.5]
// The body's center column facing right; mirrored it is W - 1 - CENTER.
const CENTER = 16.5

// The swat, one entry per frame after it starts: the crouch, the paw going up
// and forward, the hit, the follow-through, and standing back up.
export const SWAT_FRAMES = 7
const CONTACT = 4

export type Play = {
  x: number
  isFacingRight: boolean
  ballX: number
  ballV: number
  ballSpin: number
  swat: number
}

export const startPlay = (track: number): Play => ({
  x: 0,
  isFacingRight: true,
  ballX: Math.min(track - BALL_R - 1, W + 6),
  ballV: 0,
  ballSpin: 0,
  swat: 0,
})

const frontOf = (play: Play) => play.x + (play.isFacingRight ? FRONT : W - 1 - FRONT)

// The ball's range: it stays where the cat's paw can reach it at either end.
const ballRange = (track: number): [number, number] => [W - 1 - FRONT - REACH[0], track - W + FRONT + REACH[0]]

export const rollBall = (play: Play, track: number): Play => {
  const [lo, hi] = ballRange(track)
  let x = play.ballX + play.ballV
  let v = play.ballV * FRICTION
  if (x < lo) (x = lo), (v = -v * BOUNCE)
  if (x > hi) (x = hi), (v = -v * BOUNCE)
  if (Math.abs(v) < STOP) v = 0

  return { ...play, ballX: x, ballV: v, ballSpin: play.ballSpin + (x - play.ballX) / BALL_R }
}

// One frame of play. `run` is the walk's gait counter: it advances only while
// the cat walks, one pixel per frame, so its planted paws stay put.
export const stepPlay = (play: Play, run: number, track: number): { play: Play; run: number } => {
  const rolled = rollBall(play, track)
  const dir = rolled.isFacingRight ? 1 : -1

  if (rolled.swat > 0) {
    const swat = rolled.swat + 1
    if (rolled.swat === CONTACT) {
      const ahead = (rolled.ballX - frontOf(rolled)) * dir
      // Most swats send the ball ahead; about one in four scoops it back under
      // the cat, which then turns to chase it.
      const isScoop = run % 4 === 0
      const isHit = ahead >= REACH[0] - 1 && ahead <= REACH[1] + 1
      const kick = isHit ? dir * (isScoop ? -2.6 : 2.2 + (run % 3) * 0.5) : 0
      return { play: { ...rolled, swat, ballV: rolled.ballV + kick }, run }
    }
    return { play: { ...rolled, swat: swat > SWAT_FRAMES ? 0 : swat }, run }
  }

  // Face the ball by where it is from the body, not the paw: a ball under the
  // chest is behind the paw but still in front of the cat.
  const center = rolled.x + (rolled.isFacingRight ? CENTER : W - 1 - CENTER)
  if ((rolled.ballX - center) * dir < 0) {
    const shift = rolled.isFacingRight ? 2 * CENTER - (W - 1) : (W - 1) - 2 * CENTER
    const x = Math.max(0, Math.min(track - W, rolled.x + shift))
    return { play: { ...rolled, isFacingRight: !rolled.isFacingRight, x }, run }
  }

  // Back up from a ball under the chest, walk up to one out of reach, wait for
  // one in reach that is still rolling, and swat one that has nearly stopped.
  // Backing up runs the gait backward, so the paws stay planted either way.
  const ahead = (rolled.ballX - frontOf(rolled)) * dir
  const step = (by: number) => {
    const x = Math.max(0, Math.min(track - W, rolled.x + by * dir))
    return { play: { ...rolled, x }, run: x === rolled.x ? run : run + by }
  }
  if (ahead < REACH[0]) return step(-1)
  if (ahead > REACH[1]) return step(1)
  if (Math.abs(rolled.ballV) > 0.6) return { play: rolled, run }

  return { play: { ...rolled, swat: 1 }, run }
}

// The swat's pose for frame `swat` (1 to SWAT_FRAMES): a play-bow crouch with
// the near front paw raised, swung forward onto the ball, and set back down.
export const swatPose = (swat: number, from: Pose): Pose => {
  const stand = standPose()
  const home = stand.nearFront.at
  const keys: [number, number, number, number][] = [
    // crouch, paw dx, paw height, lift
    [0.7, 0, 0, 0],
    [1, 1.2, 4.6, 1],
    [1, 3.0, 5.4, 1],
    [1, 4.8, 1.2, 0.6],
    [0.9, 4.2, 0, 0],
    [0.5, 2.0, 0, 0],
    [0.15, 0.4, 0, 0],
  ]
  const [crouch, dx, up, lift] = keys[Math.min(keys.length, Math.max(1, swat)) - 1] ?? [0, 0, 0, 0]
  // A play-bow: the front end drops and leans in, the rear and tail stay up.
  const pose: Pose = {
    ...stand,
    hip: { x: stand.hip.x, y: stand.hip.y - 0.4 * crouch },
    shoulder: { x: stand.shoulder.x + 0.6 * crouch, y: stand.shoulder.y + 2.0 * crouch },
    head: { x: stand.head.x + 1.0 * crouch, y: stand.head.y + 2.4 * crouch },
    tail: stand.tail.map((p, i) => ({ x: p.x + (i === 3 ? 0.8 * crouch : 0), y: p.y - (i >= 2 ? 1.0 * i * crouch * 0.5 : 0) })) as Pose['tail'],
    nearFront: { at: { x: home.x + dx, y: home.y - up }, lift },
    farFront: { at: { x: stand.farFront.at.x + 0.6 * crouch, y: stand.farFront.at.y }, lift: 0 },
  }

  // Ease out of the walk over the first two frames.
  return swat <= 2 ? blend(from, pose, smooth(swat / 2)) : pose
}

const YARN = { base: 0xd94a5a, strand: 0xf08a96, edge: 0x5a1e28, shine: 0xffc6cf }

// Draws the ball (and the loose strand it trails) into a track-wide pixel
// buffer; `isFree` says which pixels the cat has not already covered.
export const drawBall = (
  set: (x: number, y: number, color: number) => void,
  isFree: (x: number, y: number) => boolean,
  play: Play,
) => {
  const { ballX: bx, ballSpin: a } = play
  const trail = play.ballV === 0 ? (play.isFacingRight ? -1 : 1) : -Math.sign(play.ballV)
  for (let i = 0; i < 6; i++) {
    const x = Math.round(bx + trail * (BALL_R + 0.6 + i))
    const y = Math.round(GROUND + 0.6 + 0.5 * Math.sin(i * 1.3 + a))
    if (y < H && isFree(x, y)) set(x, y, YARN.strand)
  }
  for (let py = Math.floor(BALL_Y - BALL_R); py <= Math.ceil(BALL_Y + BALL_R); py++) {
    for (let px = Math.floor(bx - BALL_R - 1); px <= Math.ceil(bx + BALL_R + 1); px++) {
      const dx = px + 0.5 - bx
      const dy = py + 0.5 - BALL_Y
      const d = Math.hypot(dx, dy)
      if (d > BALL_R + 0.5 || py >= H || !isFree(px, py)) continue
      const u = dx * Math.cos(a) + dy * Math.sin(a)
      const color =
        d > BALL_R - 0.3 ? YARN.edge
          : dx < -0.6 && dy < -0.6 && d < 1.6 ? YARN.shine
            : ((u % 1.6) + 1.6) % 1.6 < 0.7 ? YARN.strand : YARN.base
      set(px, py, color)
    }
  }
}
