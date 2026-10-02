# cat-spinner

A Claude Code mod (a plugin of function hooks) that draws a pixel-art cat above the spinner line while Claude works. The plugin is the repository root and also its own single-plugin marketplace (`.claude-plugin/marketplace.json`, `source: "./"`), so it installs with `/plugin marketplace add swicken/cat-spinner`.

## Layout

- `hooks/register.tsx` is the hooks module. It holds the animation state machine (`advance`, `inAnimation`, `pickAnimation`), composes each frame into Raster cells (`sceneCells`), and registers the hooks: the spinner drawing, the frame timer, `/cat-spinner`, and the settings dialog.
- `hooks/rig.ts` is the cat itself: the coat palettes (`COATS`), the walking skeleton (`walkPose`, `standPose`, two-bone IK), the rasterizer with automatic outlines, and the hand-drawn seated cat (`SIT_ART`).
- `hooks/yarn.ts` is the yarn and pounce play: ball physics, the chase rules, the swat, stalk, and leap poses, and drawing the ball.
- `hooks/react.ts` is the reactions to Claude's tools: which tool means which activity (`activityOf`), the dig and startle poses, and the laptop, magnifying glass, and dirt drawn over the cat. The `tool.call` hook in `register.tsx` feeds it.
- `tests/cat.test.tsx` holds the tests. `tests/scenes.ts` and `tests/golden.ts` are the golden scenes (below). `scripts/preview.ts` renders the README images in `assets/`.

## Checking a change

```sh
claude plugin validate .        # what the engine would load or refuse
claude plugin test .            # all tests
claude --plugin-dir .           # try it live; edits hot-reload when a turn ends
npx tsx scripts/preview.ts      # regenerate assets/ (needs ffmpeg on the PATH)
```

For a type check, load the plugin once with `--plugin-dir`. The engine then writes `.claude-plugin/types/` and a root `tsconfig.json` (both gitignored), after which `npx -p typescript@5.6 tsc -p .` works.

Tests can't show how anything looks in a terminal. For any visual change, render frames to an image and look at them before calling it done: decode `sceneCells` output (two pixels per cell, `▀`/`▄` with foreground and background colors) into a PNG, as `scripts/preview.ts` does. Reviewing enlarged frames caught most of the real problems in this project.

## Golden scenes

`tests/scenes.ts` scripts a set of scenes (every coat walking and sitting, a yarn session, a seeded pounce session, and the tool reactions) and the tests fingerprint every frame's pixels against `tests/golden.ts`. Any pixel change in any scene fails the test. That's the guard on the walk and the other tuned visuals.

When a change is meant to alter the look, regenerate the file with `npx tsx scripts/fingerprints.ts > tests/golden.ts`, then check the diff: only the scenes you meant to change should have new fingerprints. Look at the new frames before accepting them. Never regenerate just to make a failing test pass. A changed fingerprint you didn't expect is a regression to investigate. (This caught a reaction getting stuck on its last frame.)

When adding something visual, add a scene for it, so it's guarded from then on.

## Engine rules that bite

- `$` may only be passed to functions declared at the top level of the file. The validator refuses anything else, so helpers that need `$` (like `startPreview`) live at the top level and take what they need as arguments.
- Module-level variables reset whenever the module reloads, and changing a setting reloads it. Anything that must survive a setting change, like an open dialog, is rediscovered in `session.start` (for example through `$.ui.panes()`).
- `Raster` exists only on the terminal surface. Every render hook checks `e.surface === 'terminal'` and otherwise leaves the engine's own drawing in place or draws plain text.
- Test stand-ins for engine calls answer `{ value }` or `{ deny }`, not a bare value.
- Animate by repainting with `$.ui.blit` from a `$.clock.every` timer, never by redrawing the tree each frame. The timer starts on `prompt.submit` and stops on `turn.complete`.

## Animation invariants

- The cat moves exactly one pixel per frame, and the gait counter (`run`) advances one frame per pixel moved, backward when backing up. That's what keeps planted paws still on the ground. Never move the cat without moving `run` with it, except mid-leap, when its paws are in the air.
- The walk was tuned until the user was happy with it. Don't change `walkPose` or the gait without being asked.
- `yarn` is deterministic and must stay that way: it never calls the random function. The golden scenes enforce the look, and the preview GIFs should also come out byte-identical after any change that isn't meant to affect them.
- `pounce` and `random` take randomness through an injected `rng`, defaulting to `Math.random`. Tests pass a seeded generator.
- Every branch of `advance` must return the cat with the `act` it just computed, never a copy of the old cat's. Returning a stale `act` once left the cat stuck on the last frame of a reaction.

## Adding a coat

1. Add a palette in `rig.ts` typed `typeof SIAMESE`, so the compiler demands every color role, and add it to `COATS`.
2. Add its label to `COAT_LABELS` in `register.tsx` (the compiler enforces this too) and its name to `userConfig.coat.options` in `.claude-plugin/plugin.json` (nothing enforces this one).
3. Respect what the tests check. Each coat's `coat` color must be unique across coats. No coat color may equal the ground `shadow` color, because the yarn ball draws over shadow pixels. Only the white coat has `eyeOther` different from `eye`.
4. Look at it walking and sitting on both a dark and a light background. Dark coats need a lighter grey outline and a little sheen, or they turn into flat silhouettes.

Patched coats (calico, tortoiseshell) set `patchScale`, `patchLow`, `patchHigh`, `patchA`, and `patchB`. Patches come from smooth noise in body coordinates (relative to the hip), so they ride on the body. A test checks this by comparing frames two step cycles apart.

## The seated cat's art

`SIT_ART` is hand-drawn, one character per pixel: O outline, C coat, c light coat, d coat shade, Q cream, q cream shade, p light point, P point, F far point, E eye, e other eye, K pupil, N nose, I inner ear, m mask, M dark mask, U muzzle, Y paw, y far paw, l light leg, L leg. Keep it symmetric around its center column (column 9), except the tail and the right eye's `e`. At this size a front-facing cat reads better drawn by hand than built from shapes. A shape-built version was tried and dropped.

## Releasing

1. Bump `version` in `.claude-plugin/plugin.json`.
2. Run `npx tsx scripts/preview.ts`, then check `git status` to see which assets changed and confirm only the expected ones did.
3. If `assets/coats.png` changed, bump the `?v=` on its link in `README.md`. GitHub's raw cache and browsers otherwise keep showing the old image.
4. Validate and test, commit, then push only when the user asks.
5. Verify the published version by installing it as a coworker would, then remove it so it doesn't run alongside a local dev copy:

   ```sh
   claude plugin marketplace add swicken/cat-spinner && claude plugin install cat-spinner@cat-spinner
   claude plugin list | grep -A1 cat-spinner@cat-spinner
   claude plugin uninstall cat-spinner@cat-spinner && claude plugin marketplace remove cat-spinner
   ```
