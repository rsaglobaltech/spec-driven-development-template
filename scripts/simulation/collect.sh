#!/usr/bin/env bash
#
# Lift the evidence out of a sandbox.
#
# `.harness/runs/` git-ignores itself on purpose — those are local measurements,
# not shared history — so publishing them means copying them out rather than
# committing them where they landed.
set -euo pipefail

COMPANY="${1:?usage: collect.sh <company>}"
ROOT="${SIM_ROOT:-$HOME/sandbox/specgate-sim}"
SANDBOX="$ROOT/$COMPANY"
OUT="${2:-$SANDBOX/evidence}"

[ -d "$SANDBOX" ] || { echo "No sandbox at $SANDBOX" >&2; exit 1; }

mkdir -p "$OUT"
cp "$SANDBOX/BRIEF.md" "$SANDBOX/PINNED_COMMIT" "$OUT/" 2>/dev/null || true
[ -f "$SANDBOX/FINDINGS.md" ] && cp "$SANDBOX/FINDINGS.md" "$OUT/"

RUNS="$SANDBOX/work/.harness/runs"
if [ -d "$RUNS" ]; then
  mkdir -p "$OUT/runs"
  find "$RUNS" -name '*.json' -exec cp {} "$OUT/runs/" \;
  echo "→ $(find "$OUT/runs" -name '*.json' | wc -l | tr -d ' ') run record(s)"
fi

FALSE="$SANDBOX/work/.harness/false-failures.jsonl"
[ -f "$FALSE" ] && cp "$FALSE" "$OUT/"

# The aggregate, if the tool can still produce it. Not fatal: the point of the
# run may have been that it could not.
( cd "$SANDBOX/work" && npx --yes @rsaglobaltech/specgate@latest harness report --json \
    > "$OUT/harness-report.json" 2>"$OUT/harness-report.err" ) || \
  echo "→ harness report failed; see harness-report.err (that is itself a finding)"

echo "Evidence in $OUT"
echo
echo "Next: write mejoras/sim-$COMPANY-assessment.md from it, and reproduce every"
echo "defect from this repository — with a failing test — before filing it."
