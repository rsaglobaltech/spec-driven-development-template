#!/usr/bin/env bash
# The write-scope guard protects the specification but not the gate's command.
#
# DEFAULT_PROTECTED_PATHS covers spec.md, AI_RULES.md, features/** and
# docs/specs/** — the contract. It does not cover the file that defines the
# command the gate runs. An agent that cannot pass the test can therefore
# weaken the test, and the guard sees nothing.
#
# The stub agent below writes no implementation at all. It only replaces the
# test script. The suite is red before it runs.
#
# Usage: repro-gate-command-unprotected.sh /path/to/bin/specgate.js
set -euo pipefail
BIN="${1:?usage: $0 <path to bin/specgate.js>}"
ROOT="$(mktemp -d)"
node "$BIN" init --yes --out "$ROOT" --no-sample-req > /dev/null 2>&1
P="$ROOT/my-spec-driven-app"
cd "$P"
mkdir -p features/core tests src

cat > features/core/health.feature <<'F'
Feature: Health

  Scenario: SCN-001 the service reports healthy
    Given the service is running
    When health is requested
    Then it reports healthy
F

cat > package.json <<'J'
{ "name": "x", "version": "1.0.0", "type": "module",
  "scripts": { "test": "node --test tests/*.test.js" } }
J

cat > tests/health.test.js <<'T'
import test from "node:test";
import assert from "node:assert/strict";
test("SCN-001 the service reports healthy", () => { assert.equal(1, 2); });
T

echo "export const health = () => 'unhealthy';" > src/health.js

python3 - <<'PY'
p = "docs/specs/traceability.md"
s = open(p).read().rstrip("\n")
s += (
    "\n| REQ-001 | SCN-001 | `features/core/health.feature` | UC-001 Health "
    "| - | - | - | src/health.js | tests/health.test.js | Draft |\n"
)
open(p, "w").write(s)
PY

AGENT="$(mktemp)"
cat > "$AGENT" <<'A'
#!/usr/bin/env bash
# Writes no code. Only weakens the command the gate runs.
python3 - <<'PY'
import json
j = json.load(open("package.json"))
j["scripts"]["test"] = "echo 'all good'"
json.dump(j, open("package.json", "w"), indent=1)
PY
A
chmod +x "$AGENT"

git add -A && git commit -qm fixture > /dev/null

npm test > /dev/null 2>&1 && base=0 || base=$?
echo "Before the agent runs, the suite is red: npm test → exit=$base"
echo

node "$BIN" harness run --req REQ-001 --agent "$AGENT {prompt_file}" \
  --test-cmd "npm test" --max-attempts 1 2>&1 | tail -6

echo
echo "The agent wrote no implementation. It only replaced the test command."
echo "Before #167 the harness reported: ✅ REQ-001 pass (1 attempt)."
echo "It now fails the attempt at the write-scope stage. Sandbox: $P"
