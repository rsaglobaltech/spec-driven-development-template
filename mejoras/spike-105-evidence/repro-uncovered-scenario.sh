#!/usr/bin/env bash
# A scenario declared in a feature file that nothing tests passes every gate.
#
# Found by the #105 spike: an agent handed a five-scenario requirement wrote
# tests for four and skipped the one it could not satisfy. The gate approved and
# the row went to Implemented. This reproduces it with no agent involved.
#
# Usage: repro-uncovered-scenario.sh /path/to/bin/specgate.js
set -euo pipefail
BIN="${1:?usage: $0 <path to bin/specgate.js>}"
ROOT="$(mktemp -d)"
node "$BIN" init --yes --out "$ROOT" --no-git --no-sample-req > /dev/null 2>&1
P="$ROOT/my-spec-driven-app"
cd "$P"
mkdir -p features/billing tests src

cat > features/billing/totals.feature <<'F'
Feature: Invoice totals

  Scenario: SCN-010 subtotal is the sum of line amounts
    Given two lines
    When the invoice is totalled
    Then the subtotal is their sum

  Scenario: SCN-011 tax is applied per line
    Given two lines with different rates
    When the invoice is totalled
    Then each line carries its own rate

  Scenario: SCN-012 a fully discounted invoice carries no tax
    Given a 100% discount
    When the invoice is totalled
    Then the tax is zero
F

echo "export const totalInvoice = () => ({});" > src/totals.js

# Two of the three scenarios are tested. SCN-012 is declared and never proved.
cat > tests/totals.test.js <<'T'
import test from "node:test";
test("SCN-010 subtotal is the sum of line amounts", () => {});
test("SCN-011 tax is applied per line", () => {});
T

python3 - <<'PY'
p = "docs/specs/traceability.md"
s = open(p).read().rstrip("\n")
s += (
    "\n| REQ-010 | SCN-010 | `features/billing/totals.feature` | UC-010 Invoice totals "
    "| - | - | - | src/totals.js | tests/totals.test.js | Implemented |\n"
)
open(p, "w").write(s)
PY

echo "Scenarios declared: 3 (SCN-010, SCN-011, SCN-012)"
echo "Scenarios tested:   2 (SCN-012 has no test)"
echo "Row status:         Implemented"
echo
for flags in "" "--strict-tdd" "--strict-scenarios" "--strict-links" \
             "--strict-tdd --strict-scenarios --strict-links"; do
  # shellcheck disable=SC2086
  node "$BIN" validate . $flags > /dev/null 2>&1 && rc=0 || rc=$?
  printf 'validate . %-45s → exit=%s\n' "$flags" "$rc"
done
echo
echo "Every gate is green over a scenario nothing proves."
echo "Sandbox: $P"
