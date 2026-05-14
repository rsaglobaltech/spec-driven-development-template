# 🎬 Automated demo video

Generate a **1080p, step-by-step** terminal demo of `create-spec-driven-app`
that follows [`docs/tutorial.md`](../../docs/tutorial.md) — optionally with
an AI voice-over. Everything is scripted, so the demo regenerates whenever
the CLI changes.

## What's here

| File             | Role                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `demo.tape`      | [VHS](https://github.com/charmbracelet/vhs) script — every keystroke, the pacing, and the commands on screen.            |
| `narration.json` | One voice-over segment per section of the tape, in order.                                                                |
| `build-video.sh` | Orchestrator: build CLI → make a local versioned pack repo → record with VHS → (optional) synthesise + mux a voice-over. |
| `out/`           | Rendered artifacts (git-ignored): `demo.mp4`, `demo.gif`, `demo-narrated.mp4`.                                           |

## What the video covers

It walks the tutorial end to end with **real commands and real output**:

`init` → `specops add` → `validate` / `--strict-tdd` → `plan` → `done` →
add a new requirement → `specops diff` → `specops sync` → `specops remove` →
`pack lint --graph` → `pack infer` → `harness run --dry-run`.

## How it stays real _and_ deterministic

`build-video.sh` builds a **local, versioned git pack repo** from the
bundled fixture pack — tagged `v0.1.0` and `v0.2.0` — and points the demo at
it via `file://`. So `specops add`, `specops diff` and `specops sync` run
for real, with a real version bump to diff against — but offline, with no
flaky network clone mid-recording. The CLI itself is built from **this
checkout**, so the demo always reflects your code.

## Quality & pacing

- **1080p** — `Set Width 1920` / `Set Height 1080`, font size 22.
- **Relaxed pace** — `TypingSpeed 80ms` and generous `Sleep`s after each
  command so a viewer can actually read the output. Tune these in
  `demo.tape` if you want it faster or slower.

## Requirements

- **Required:** [`vhs`](https://github.com/charmbracelet/vhs), `node` ≥ 20, `git`.
- **Optional (voice-over):** `ffmpeg`, `jq`, `curl`, and an `OPENAI_API_KEY`.

```bash
# macOS
brew install vhs ffmpeg jq
```

## Usage

```bash
# 1080p silent demo  ->  out/demo.mp4 + out/demo.gif
npm run demo:video
#   …or directly:
bash scripts/demo/build-video.sh

# Same, plus an AI voice-over  ->  out/demo-narrated.mp4
OPENAI_API_KEY=sk-... bash scripts/demo/build-video.sh
```

No `OPENAI_API_KEY`? You still get the silent 1080p demo — hand
`out/demo.mp4` plus `narration.json` to any TTS tool to add a voice-over by
hand.

## Editing the demo

- **Change what's shown / the pacing:** edit `demo.tape`. Keep each `Type`
  line a real, runnable command — VHS executes them.
- **Change the narration:** edit `narration.json`. Keep one `segments[]`
  entry per section of the tape so the voice tracks the screen.
- **Keep it in sync with the tutorial:** `docs/tutorial.md` is the source of
  truth for the workflow. When the tutorial changes, update `demo.tape` and
  `narration.json` to match (a human-reviewed step — no LLM is wired into
  the build script).

## CI

The render is deterministic and offline, so `build-video.sh` can run in CI
on every release to keep the demo current. Only the voice-over step needs a
network call and a key — gate it behind a secret.
