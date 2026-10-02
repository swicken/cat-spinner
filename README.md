# cat-spinner

A pixel-art cat for the Claude Code spinner. It lives above the spinner line while Claude works, and what it does depends on what Claude is doing: it walks or plays while Claude works, sits down to think when Claude thinks, and reacts to Claude's tools by typing, reading, digging, or jumping in surprise.

There are eight cats and four animations, and you can mix them freely.

## What the cat does, and when

| When Claude is | The cat |
| --- | --- |
| Working (no tool running) | Does your chosen animation: walks, or plays with a ball of yarn (see [Animations](#animations)). |
| Thinking | Stops, looks at you, and sits down facing you with a thought bubble that cycles `hmm`, `...`, `?`, and `!`. It blinks slowly and flicks its tail tip, then gets up and carries on when the thinking ends. |
| Editing or writing a file (Edit, Write, NotebookEdit) | Sits facing you and types on a little laptop, paws tapping over the lid. |
| Reading or searching (Read, Grep, Glob, WebFetch, WebSearch) | Sits and sweeps a magnifying glass slowly from eye to eye; the eye under the lens looks big. |
| Running a command (Bash) | Crouches and digs, front paws scrabbling, dirt flying back past its hind legs and a little mound growing in front. |
| Hitting a tool that fails or is denied | Jumps in surprise, back arched, tail puffed straight up, with a `!` over its head. |
| Using any other tool | Keeps doing its animation. |
| Done | Goes away with the spinner, and picks up where it left off next time. |

A failure interrupts anything, even sitting. Thinking comes before tool reactions. Each reaction lasts at least a second or so, so a quick read still shows.

![Each reaction, labeled with what Claude is doing: working, thinking, editing a file, reading a file, running a command, and a tool failing](assets/preview-reactions.gif?v=1.8.1)

## Cats

![All eight cats, each named, walking and sitting](assets/coats.png?v=1.8.1)

**Siamese** is the default. **White** has odd eyes, one blue and one amber, which you see when it sits facing you. **Calico** and **Tortoiseshell** have patched coats: the patches are fixed to the cat's body, so they move with it as it walks.

Here's the Siamese walking, sitting down while Claude thinks, and walking on:

![The Siamese walking, sitting down to think, and walking on](assets/preview-siamese.gif?v=1.8.1)

## Animations

These set what the cat does while Claude works without a tool running.

**Walk** (the default): the cat walks back and forth.

**Yarn:** the cat plays with a ball of yarn. It walks up to the ball, drops into a play-bow, and swats it with a front paw. The ball rolls away spinning, trailing a loose strand, and the cat chases it. Now and then it scoops the ball back under itself and has to turn around to follow it. When Claude thinks, the cat sits down facing you and the ball stays where it stopped.

![The orange tabby playing with a ball of yarn](assets/preview-yarn.gif?v=1.8.1)

**Pounce:** the yarn game, but unpredictable. Each swat hits with a random strength and sometimes scoops the ball backward. Now and then the cat stops low to watch the ball roll, or stalks a ball that has nearly stopped: it crouches, wiggles its rear, and leaps onto it.

![The Siamese stalking and pouncing on a ball of yarn](assets/preview-pounce.gif?v=1.8.1)

**Random:** a different one of walk, yarn, and pounce each time Claude starts working. The cat carries on from wherever it is.

## Seasons

For Halloween, the cat dresses up: a little purple witch hat, a jack-o'-lantern in place of the ball of yarn, bats flapping across the track, and a cat that thinks `boo`. The **Season** setting decides when: **Auto** (the default) dresses it up through October and leaves it plain the rest of the year, **Halloween** keeps it on, and **Plain** keeps it off.

![The black cat in a witch hat, batting a jack-o'-lantern under the bats, then sitting to think "boo"](assets/preview-halloween.gif?v=1.9.0)

> **Still in progress.** This is an early version and changes are still coming, so expect the cat to keep evolving.

## Requirements

- Claude Code with mods (function-hook plugins). It was built and tested on Claude Code 2.1.287.
- The terminal. In the desktop app and other surfaces you keep the normal spinner, because the pixel grid the cat is drawn with exists only in the terminal.
- A terminal with 24-bit color for accurate colors: Ghostty, iTerm2, kitty, WezTerm, and most modern terminals have it. The macOS Terminal app may show the colors less accurately.

## Install

In Claude Code, run these two commands:

```
/plugin marketplace add swicken/cat-spinner
/plugin install cat-spinner@cat-spinner
```

Or from a shell:

```sh
claude plugin marketplace add swicken/cat-spinner
claude plugin install cat-spinner@cat-spinner
```

Then start a new Claude Code session. The cat appears the next time Claude is working on something.

The install may say userConfig options are not yet set. Those are the settings below, and it's fine to leave them: you get the walking Siamese at full width, and you can change any of them at any time.

## Choosing your cat and animation

Run `/cat-spinner` to open its settings: a live preview of your cat above a list of settings, each showing its current choice: **Cat**, **Animation**, **Width**, **Alignment** (for a compact track), and **Season**. Move with the arrow keys and press Enter on a setting to see its options, then Enter again to pick one. Changes save as you pick them, and the preview updates to match. In a setting's options Esc goes back to the list; in the list, Esc or **Done** closes.

There are shortcuts too, if you know what you want:

```
/cat-spinner calico      # or siamese, orange, tuxedo, black, russian-blue, white, tortoiseshell
/cat-spinner pounce      # or walk, yarn, random
/cat-spinner compact     # or full
/cat-spinner center      # or left, right
/cat-spinner plain       # or auto, halloween
```

**Width** sets how much of the terminal the cat walks across. **Full width**, the default, spans the whole window and follows it as you resize. **Compact** caps the track at 90 columns, for shorter walks. A compact track sits at the left by default, and **Alignment** moves it to the center or the right.

The same choices are the **Cat**, **Animation**, **Width**, **Alignment**, and **Season** rows for cat-spinner in `/config`.

## Update and uninstall

To get the latest version:

```sh
claude plugin marketplace update cat-spinner
claude plugin update cat-spinner@cat-spinner
```

To remove it:

```sh
claude plugin uninstall cat-spinner@cat-spinner
claude plugin marketplace remove cat-spinner
```

## How it works

The mod hooks the spinner's drawing and puts a 9-row pixel grid, as wide as the Width setting allows, above the normal spinner line, so the word, elapsed time, and token count are still there. Each terminal cell shows two stacked pixels using a half-block character with separate foreground and background colors. While a turn runs, a timer repaints the grid about 11 times a second, and the timer stops when the turn ends.

- **The walk** comes from a small skeleton rig (`hooks/rig.ts`). The legs move in a cat's walking order, so two or three paws are always on the ground. A planted paw stays on one spot of the ground while the body passes over it. The spine rocks slightly with each step, and the tail moves in a slow wave.
- **The yarn play** (`hooks/yarn.ts`) is a small set of rules run each frame: the ball rolls with friction and bounces off the ends of the track; the cat faces the ball, walks up to it or backs away from it, waits for it to slow, then swats it in a seven-frame play-bow. The cat's gait advances one frame per pixel it moves, forward or back, so its paws stay planted while it walks. Yarn plays out the same way every time; pounce adds random swat strength and scoops, pauses to watch, and a stalk that ends in a six-frame leap.
- **The reactions** (`hooks/react.ts`) come from a `tool.call` hook that notes which tool is running and whether it failed; each frame the cat starts, keeps, or drops an activity accordingly.
- **The seasonal extras** (`hooks/season.ts`) are drawn over the finished scene: the hat at the head's position in whichever pose, the pumpkin in the ball's place, and the bats wherever the cat isn't.
- **The sit** is hand-drawn pixel art, because at this size a front-facing cat reads better drawn pixel by pixel. While seated, the cat blinks slowly, flicks its tail tip, and thinks `hmm`, `...`, `?`, and `!`.
- **The colors** are a palette per coat (`COATS` in `hooks/rig.ts`): every shape uses a color role, such as coat, mask, muzzle, point, leg, or paw, so a new cat is a new palette. Patched coats also set two patch colors and a size, and their coat breaks into patches from smooth noise sampled in body coordinates. The Siamese is a seal-point colorpoint based on a real cat.

## Development

The plugin is the repository root: `.claude-plugin/plugin.json`, the hooks module in `hooks/`, and tests in `tests/`.

```sh
claude plugin validate .        # check the manifest and hooks the way Claude Code loads them
claude plugin test .            # run the tests, including the golden scenes
claude --plugin-dir .           # try your local copy in a session
npx tsx scripts/preview.ts      # regenerate the GIFs in assets/ (needs ffmpeg)
npx tsx scripts/fingerprints.ts > tests/golden.ts   # after an intended visual change
```

## License

MIT
