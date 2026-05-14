#!/usr/bin/env bash
#
# build-video.sh — render the automated terminal demo, and (optionally) add an
# AI voice-over generated from scripts/demo/narration.json.
#
# Pipeline:
#   1. Build the CLI and put a `csda` wrapper on PATH (uses THIS checkout).
#   2. Run VHS against scripts/demo/demo.tape  ->  out/demo.mp4 + out/demo.gif
#   3. If OPENAI_API_KEY is set and ffmpeg is available, synthesise a voice-over
#      from narration.json and mux it  ->  out/demo-narrated.mp4
#
# Required:  vhs            (https://github.com/charmbracelet/vhs)
# Optional:  ffmpeg, jq, curl + OPENAI_API_KEY   (for the voice-over step)
#
# Usage:
#   bash scripts/demo/build-video.sh
#   OPENAI_API_KEY=sk-... bash scripts/demo/build-video.sh   # with voice-over
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DEMO_DIR/../.." && pwd)"
OUT_DIR="$DEMO_DIR/out"
mkdir -p "$OUT_DIR"

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$1"; }
die()  { printf '\033[1;31m✖ %s\033[0m\n' "$1" >&2; exit 1; }

command -v vhs >/dev/null 2>&1 || die "vhs not found — install from https://github.com/charmbracelet/vhs"
command -v node >/dev/null 2>&1 || die "node not found"

# ── 1. Build the CLI, expose a `csda` wrapper pointing at this checkout ───────
step "Building the CLI from $REPO_ROOT"
( cd "$REPO_ROOT" && npm run build >/dev/null )

WRAPPER_DIR="$(mktemp -d)"
trap 'rm -rf "$WRAPPER_DIR"' EXIT
cat > "$WRAPPER_DIR/csda" <<EOF
#!/usr/bin/env bash
exec node "$REPO_ROOT/bin/create-spec-driven-app.js" "\$@"
EOF
chmod +x "$WRAPPER_DIR/csda"
export PATH="$WRAPPER_DIR:$PATH"
export CSDA_DEMO_PACK_ROOT="$REPO_ROOT/tests/fixtures/domain-packs"

# ── 2. Render the terminal demo with VHS ─────────────────────────────────────
step "Recording the terminal demo with VHS"
( cd "$REPO_ROOT" && vhs "$DEMO_DIR/demo.tape" )
[ -f "$OUT_DIR/demo.mp4" ] || die "VHS did not produce out/demo.mp4"
printf '  silent demo : %s\n' "$OUT_DIR/demo.mp4"
printf '  shareable   : %s\n' "$OUT_DIR/demo.gif"

# ── 3. Optional AI voice-over ────────────────────────────────────────────────
if [ -z "${OPENAI_API_KEY:-}" ]; then
  warn "OPENAI_API_KEY not set — skipping voice-over."
  warn "Silent demo is ready. Set OPENAI_API_KEY and re-run to add narration,"
  warn "or hand out/demo.mp4 + scripts/demo/narration.json to any TTS tool."
  exit 0
fi
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  warn "ffmpeg / jq / curl missing — skipping voice-over. Silent demo is ready."
  exit 0
fi

step "Synthesising voice-over from narration.json (OpenAI TTS)"
VOICE="$(jq -r '.voice // "alloy"' "$DEMO_DIR/narration.json")"
AUDIO_DIR="$(mktemp -d)"
SEGMENTS=$(jq -r '.segments | length' "$DEMO_DIR/narration.json")

CONCAT_LIST="$AUDIO_DIR/concat.txt"
: > "$CONCAT_LIST"
# 1.2s of silence between segments so the voice tracks the on-screen steps.
ffmpeg -y -f lavfi -i anullsrc=r=24000:cl=mono -t 1.2 "$AUDIO_DIR/gap.mp3" >/dev/null 2>&1

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
  # Guard against an API error returning JSON instead of audio.
  if head -c 4 "$AUDIO_DIR/$i.mp3" | grep -q '{' ; then
    die "OpenAI TTS error for segment '$ID': $(cat "$AUDIO_DIR/$i.mp3")"
  fi
  echo "file '$AUDIO_DIR/$i.mp3'" >> "$CONCAT_LIST"
  echo "file '$AUDIO_DIR/gap.mp3'" >> "$CONCAT_LIST"
done

step "Muxing voice-over onto the demo video"
ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -c copy "$AUDIO_DIR/voice.mp3" >/dev/null 2>&1
# Keep the full video; let the audio finish naturally (-shortest dropped on
# purpose so a slightly longer narration is not truncated).
ffmpeg -y -i "$OUT_DIR/demo.mp4" -i "$AUDIO_DIR/voice.mp3" \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k \
  "$OUT_DIR/demo-narrated.mp4" >/dev/null 2>&1
rm -rf "$AUDIO_DIR"

printf '  narrated    : %s\n' "$OUT_DIR/demo-narrated.mp4"
step "Done."
