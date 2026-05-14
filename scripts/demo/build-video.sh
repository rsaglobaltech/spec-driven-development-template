#!/usr/bin/env bash
#
# build-video.sh — render a full, 1080p, step-by-step demo video that follows
# docs/tutorial.md, and (optionally) add an AI voice-over.
#
# What it does:
#   1. Builds the CLI from THIS checkout and puts a `csda` wrapper on PATH.
#   2. Builds a LOCAL, versioned git pack repo from the bundled fixture pack —
#      tagged v0.1.0 and v0.2.0 — so `specops add` / `specops diff` /
#      `specops sync` run for real, offline and deterministically (no network,
#      no flaky GitHub clone mid-recording).
#   3. Runs VHS against scripts/demo/demo.tape  ->  out/demo.mp4 + out/demo.gif
#      at 1920x1080 with a relaxed pace.
#   4. If OPENAI_API_KEY is set and ffmpeg is available, synthesises a
#      voice-over from narration.json and muxes it -> out/demo-narrated.mp4
#
# Required:  vhs, node, git
# Optional:  ffmpeg, jq, curl + OPENAI_API_KEY   (for the voice-over)
#
# Usage:
#   bash scripts/demo/build-video.sh
#   OPENAI_API_KEY=sk-... bash scripts/demo/build-video.sh
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DEMO_DIR/../.." && pwd)"
OUT_DIR="$DEMO_DIR/out"
mkdir -p "$OUT_DIR"

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$1"; }
die()  { printf '\033[1;31m✖ %s\033[0m\n' "$1" >&2; exit 1; }

command -v vhs  >/dev/null 2>&1 || die "vhs not found — install from https://github.com/charmbracelet/vhs"
command -v node >/dev/null 2>&1 || die "node not found"
command -v git  >/dev/null 2>&1 || die "git not found"

# ── 1. Build the CLI, expose a `csda` wrapper pointing at this checkout ───────
step "Building the CLI from $REPO_ROOT"
( cd "$REPO_ROOT" && npm run build >/dev/null )

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

WRAPPER_DIR="$SCRATCH/bin"
mkdir -p "$WRAPPER_DIR"
cat > "$WRAPPER_DIR/csda" <<EOF
#!/usr/bin/env bash
exec node "$REPO_ROOT/bin/create-spec-driven-app.js" "\$@"
EOF
chmod +x "$WRAPPER_DIR/csda"
export PATH="$WRAPPER_DIR:$PATH"

# ── 2. Build a local, versioned pack repo (v0.1.0 + v0.2.0) ──────────────────
# Mirrors what the CLI's own tests do: a real git repo behind file://, so the
# demo's specops add/diff/sync are genuine — just offline and reproducible.
step "Building a local versioned pack repo (v0.1.0, v0.2.0)"
PACK_REPO_DIR="$SCRATCH/parking-management-specops"
mkdir -p "$PACK_REPO_DIR"
cp -R "$REPO_ROOT/tests/fixtures/domain-packs/parking-management" "$PACK_REPO_DIR/parking-management"

git -C "$PACK_REPO_DIR" init -q --initial-branch=main
git -C "$PACK_REPO_DIR" config user.email "demo@example.com"
git -C "$PACK_REPO_DIR" config user.name  "Demo"
git -C "$PACK_REPO_DIR" config commit.gpgsign false
git -C "$PACK_REPO_DIR" config tag.gpgsign false
git -C "$PACK_REPO_DIR" add -A
git -C "$PACK_REPO_DIR" commit -q -m "pack v0.1.0"
git -C "$PACK_REPO_DIR" tag v0.1.0

# A small, guaranteed-visible delta for v0.2.0 so `specops diff` shows a change.
CAP_TPL="$PACK_REPO_DIR/parking-management/backend/templates/features/capacity/capacity_threshold.feature.tpl"
printf '\n  # v0.2.0: operators may also receive an SMS alert.\n' >> "$CAP_TPL"
git -C "$PACK_REPO_DIR" commit -q -am "pack v0.2.0 — capacity alert note"
git -C "$PACK_REPO_DIR" tag v0.2.0

# Environment the tape reads.
export CSDA_PACK_REPO="file://$PACK_REPO_DIR"
export CSDA_PACK_V1="v0.1.0"
export CSDA_PACK_V2="v0.2.0"
export CSDA_PACK_ID="parking-management/backend"
export CSDA_DEMO_PACK_ROOT="$REPO_ROOT/tests/fixtures/domain-packs"
export CSDA_CACHE_DIR="$SCRATCH/cache"

# ── 3. Render the demo with VHS ──────────────────────────────────────────────
step "Recording the 1080p demo with VHS (this follows docs/tutorial.md)"
( cd "$REPO_ROOT" && vhs "$DEMO_DIR/demo.tape" )
[ -f "$OUT_DIR/demo.mp4" ] || die "VHS did not produce out/demo.mp4"
printf '  silent demo : %s\n' "$OUT_DIR/demo.mp4"
printf '  shareable   : %s\n' "$OUT_DIR/demo.gif"

# ── 4. Optional AI voice-over ────────────────────────────────────────────────
if [ -z "${OPENAI_API_KEY:-}" ]; then
  warn "OPENAI_API_KEY not set — skipping voice-over. The silent 1080p demo is ready."
  warn "Set OPENAI_API_KEY and re-run to add narration, or feed out/demo.mp4 +"
  warn "scripts/demo/narration.json to any TTS tool yourself."
  exit 0
fi
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  warn "ffmpeg / jq / curl missing — skipping voice-over. The silent 1080p demo is ready."
  exit 0
fi

step "Synthesising voice-over from narration.json (OpenAI TTS)"
VOICE="$(jq -r '.voice // "alloy"' "$DEMO_DIR/narration.json")"
AUDIO_DIR="$SCRATCH/audio"
mkdir -p "$AUDIO_DIR"
SEGMENTS=$(jq -r '.segments | length' "$DEMO_DIR/narration.json")

CONCAT_LIST="$AUDIO_DIR/concat.txt"
: > "$CONCAT_LIST"
# Silence between segments, so the narration tracks the on-screen steps.
ffmpeg -y -f lavfi -i anullsrc=r=24000:cl=mono -t 2.5 "$AUDIO_DIR/gap.mp3" >/dev/null 2>&1

for i in $(seq 0 $((SEGMENTS - 1))); do
  TEXT="$(jq -r ".segments[$i].text" "$DEMO_DIR/narration.json")"
  ID="$(jq -r ".segments[$i].id" "$DEMO_DIR/narration.json")"
  printf '  • %s\n' "$ID"
  curl -sS https://api.openai.com/v1/audio/speech \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg t "$TEXT" --arg v "$VOICE" \
           '{model:"gpt-4o-mini-tts", voice:$v, input:$t, response_format:"mp3"}')" \
    -o "$AUDIO_DIR/$i.mp3"
  if head -c 4 "$AUDIO_DIR/$i.mp3" | grep -q '{' ; then
    die "OpenAI TTS error for segment '$ID': $(cat "$AUDIO_DIR/$i.mp3")"
  fi
  echo "file '$AUDIO_DIR/$i.mp3'"   >> "$CONCAT_LIST"
  echo "file '$AUDIO_DIR/gap.mp3'"  >> "$CONCAT_LIST"
done

step "Muxing voice-over onto the demo video"
ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -c copy "$AUDIO_DIR/voice.mp3" >/dev/null 2>&1
ffmpeg -y -i "$OUT_DIR/demo.mp4" -i "$AUDIO_DIR/voice.mp3" \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k \
  "$OUT_DIR/demo-narrated.mp4" >/dev/null 2>&1

printf '  narrated    : %s\n' "$OUT_DIR/demo-narrated.mp4"
step "Done."
