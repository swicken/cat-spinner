# cat-spinner

A pixel-art cat for the Claude Code spinner. While Claude works, the cat walks back and forth above the spinner line. When Claude starts thinking, it stops, looks at you, and sits down facing you with a thought bubble until the thinking is done, then gets up and walks on.

There are two cats, with the same animation and different coats.

**Siamese** (the default):

![The Siamese walking, sitting down to think, and walking on](assets/preview-siamese.gif)

**Orange tabby:**

![The orange tabby walking, sitting down to think, and walking on](assets/preview-orange.gif)

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

The install may say a userConfig option is not yet set. That's the choice of cat, and it's fine to leave: you get the Siamese, and you can switch any time (below). To start with the orange tabby instead, install with `claude plugin install cat-spinner@cat-spinner --config coat=orange`.

## Choosing your cat

Switch cats with a command:

```
/cat-spinner orange
/cat-spinner siamese
```

Run `/cat-spinner` on its own to see which cat you have. The change takes effect right away. The same choice is the **Cat** row for cat-spinner in `/config`, if you prefer the menu.

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

The mod hooks the spinner's drawing and puts a 9-row pixel grid above the normal spinner line, so the word, elapsed time, and token count are still there. Each terminal cell shows two stacked pixels using a half-block character with separate foreground and background colors. While a turn runs, a timer repaints the grid about 11 times a second, and the timer stops when the turn ends.

- **The walk** comes from a small skeleton rig (`hooks/rig.ts`). The legs move in a cat's walking order, so two or three paws are always on the ground. A planted paw stays on one spot of the ground while the body passes over it. The spine rocks slightly with each step, and the tail moves in a slow wave.
- **The sit** is hand-drawn pixel art, because at this size a front-facing cat reads better drawn pixel by pixel. While seated, the cat blinks slowly, flicks its tail tip, and thinks `hmm`, `...`, `?`, and `!`.
- **The colors** are a palette per coat (`COATS` in `hooks/rig.ts`): every shape uses a color role, such as coat, mask, muzzle, point, or paw, so a new cat is a new palette. The Siamese is a seal-point colorpoint based on a real cat.

## Development

The plugin is the repository root: `.claude-plugin/plugin.json`, the hooks module in `hooks/`, and tests in `tests/`.

```sh
claude plugin validate .        # check the manifest and hooks the way Claude Code loads them
claude plugin test .            # run the tests
claude --plugin-dir .           # try your local copy in a session
npx tsx scripts/preview.ts      # regenerate the GIFs in assets/ (needs ffmpeg)
```

## License

MIT
