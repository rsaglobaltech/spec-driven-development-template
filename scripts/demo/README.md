# 🎬 Automated demo video — the day-to-day loop

Generate a **1080p, focused** terminal demo of `create-spec-driven-app`
where the centerpiece is the **harness running an AI agent on a real
requirement**: the agent writes real test + production code, the gate runs
the tests for real, and the harness commits the result on a reviewable
branch. The video is short (~90 s) and the harness gets the screen time.

Optionally with an AI voice-over. Everything is scripted, so the demo
regenerates whenever the CLI changes.

## What's here

| File             | Role                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `demo.tape`      | [VHS](https://github.com/charmbracelet/vhs) script — keystrokes, pacing, the commands on screen.          |
| `narration.json` | One voice-over segment per section of the tape, in order.                                                 |
| `stub-agent.sh`  | The deterministic "AI agent" used by default. Writes real REQ-000 test + production code.                 |
| `build-video.sh` | Orchestrator: build CLI → wire the agent → warm the pack cache → record with VHS → (optional) voice-over. |
| `out/`           | Rendered artifacts (git-ignored): `demo.mp4`, `demo.gif`, `demo-narrated.mp4`.                            |

## What the video shows

A single, day-to-day loop:

1. Scaffold a project (`init`) from a YAML config.
2. Pull in the public `parking-management-specops` domain pack (`specops add`).
3. See the task queue (`plan`).
4. Wire the harness — `agent` + `test_cmd` in a tiny `harness.config.yaml`.
5. **`csda harness run --req REQ-000`** — the harness builds a prompt,
   shells out to the agent, the agent writes real `src/health.js` +
   `test/health.test.js`, the gate (`validate --strict-tdd` + `node --test`)
   runs, green, `done`, commit on a `harness/REQ-000` branch.
6. `cat` the agent's files and run `node --test` so the viewer sees the
   tests pass for real.

## Two agent modes

| Mode               | Flag           | What it is                                                                                                                                     |
| ------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stub (default)** | _(none)_       | A deterministic bash script (`stub-agent.sh`) that, for `REQ-000`, writes a real Node module + `node:test`. Offline, reproducible, runs in CI. |
| **Real opencode**  | `--real-agent` | `opencode run "$(cat {prompt_file})"`. Authentic and non-deterministic; needs `opencode` on PATH and (typically) credentials configured.       |

The harness loop is identical either way — only the agent command changes.

## How it stays real _and_ reliable

- `build-video.sh` builds the CLI **from this checkout**, so the demo
  reflects your code, not a published version.
- It pre-warms the pack cache with an upfront `specops add` against the
  real `parking-management-specops` git repo — so recording does not wait
  on a clone.
- The harness gate (`validate` + `node --test`) runs the stub agent's
  actual code. Nothing is faked: a green light means the test really
  passed.

## Quality & pacing

- **1080p** — `Set Width 1920` / `Set Height 1080`, font size 22.
- **Relaxed pace** — `TypingSpeed 80ms` and generous `Sleep`s between
  commands. Tune them in `demo.tape` to taste.

## Requirements

- **Required:** [`vhs`](https://github.com/charmbracelet/vhs), `node` ≥ 20, `git`.
- **Optional (voice-over):** `ffmpeg`, `jq`, `curl`, and an `OPENAI_API_KEY`.
- **Optional (`--real-agent`):** [`opencode`](https://opencode.ai) on `PATH`, configured.

```bash
# macOS
brew install vhs ffmpeg jq
```

## Usage

```bash
# Deterministic 1080p demo with the stub agent  ->  out/demo.mp4 + demo.gif
npm run demo:video

# Same, but call opencode for real instead of the stub
bash scripts/demo/build-video.sh --real-agent

# Add an AI voice-over   ->  out/demo-narrated.mp4
OPENAI_API_KEY=sk-... bash scripts/demo/build-video.sh
```

Without `OPENAI_API_KEY` you still get the silent 1080p demo; hand
`out/demo.mp4` plus `narration.json` to any TTS tool to add a voice-over
by hand.

## Editing the demo

- **Change pacing / commands:** edit `demo.tape`. VHS executes every
  `Type` line as a real shell command.
- **Change the narration:** edit `narration.json`. Keep one `segments[]`
  entry per section so the voice tracks the screen.
- **Implement a different REQ with the stub:** extend the `case` in
  `stub-agent.sh` (add an `REQ-NNN)` branch that writes whatever real
  files satisfy that scenario).
- **Sync with the tutorial:** [`docs/tutorial.md`](../../docs/tutorial.md)
  is the source of truth for the workflow. When it changes, update
  `demo.tape` and `narration.json` to match (a human-reviewed step — no
  LLM is wired into the build script).

## CI

Stub-mode render is deterministic and (after the first cache warm) offline,
so `build-video.sh` can run in CI on every release to keep the demo current.
The voice-over and `--real-agent` paths need network and secrets — gate
them behind CI secrets if you want them in CI.
