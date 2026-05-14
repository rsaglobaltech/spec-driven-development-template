# 🎬 Automated demo video

Generate a terminal demo of `create-spec-driven-app` — optionally with an
AI voice-over — straight from this checkout. Everything is scripted, so the
demo regenerates whenever the CLI changes.

## What's here

| File             | Role                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `demo.tape`      | [VHS](https://github.com/charmbracelet/vhs) script — the keystrokes, timing and the six commands shown on screen. |
| `narration.json` | Per-segment voice-over text, mirroring the steps in `demo.tape`.                                                  |
| `build-video.sh` | Orchestrator: build CLI → record with VHS → (optional) synthesise + mux an AI voice-over.                         |
| `out/`           | Rendered artifacts (git-ignored): `demo.mp4`, `demo.gif`, `demo-narrated.mp4`.                                    |

## Pipeline

```text
demo.tape        ──VHS──▶  out/demo.mp4 + out/demo.gif   (real terminal output)
narration.json   ──TTS──▶  voice-over clips
        + demo.mp4 ──ffmpeg──▶  out/demo-narrated.mp4
```

The demo uses **real CLI output** — VHS runs the actual commands. It is not
a synthetic screen recording.

## Requirements

- **Required:** [`vhs`](https://github.com/charmbracelet/vhs), `node` ≥ 20.
- **Optional (voice-over):** `ffmpeg`, `jq`, `curl`, and an `OPENAI_API_KEY`.

```bash
# macOS
brew install vhs ffmpeg jq
```

## Usage

```bash
# Silent terminal demo (out/demo.mp4 + out/demo.gif)
bash scripts/demo/build-video.sh

# Same, plus an AI voice-over (out/demo-narrated.mp4)
OPENAI_API_KEY=sk-... bash scripts/demo/build-video.sh
```

`build-video.sh` builds the CLI from this checkout and puts a `csda` wrapper
on `PATH`, so the demo always reflects **your** code — not a published
version. No `OPENAI_API_KEY`? You still get the silent demo; hand
`out/demo.mp4` plus `narration.json` to any TTS tool to add a voice-over by
hand.

## Editing the demo

- **Change what's shown:** edit `demo.tape`. Keep each `Type` line a real,
  runnable command — VHS executes them.
- **Change the narration:** edit `narration.json`. Keep one `segments[]`
  entry per logical step in the tape so the voice tracks the screen.
- **Regenerate from the tutorial:** `docs/tutorial.md` is the source of
  truth for the workflow. To rebuild this demo from it, hand the tutorial to
  an LLM and ask for an updated `demo.tape` + `narration.json` pair, then
  re-run `build-video.sh`. (An LLM step is not wired into the script — it is
  a deliberate human-reviewed checkpoint.)

## CI

`build-video.sh` is deterministic and offline (it uses the bundled fixture
pack via `--pack-root`), so it can run in CI on every release to keep the
demo current. The voice-over step is the only part that needs a network
call and a key — gate it behind a secret.
