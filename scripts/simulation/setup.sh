#!/usr/bin/env bash
#
# Build a sandbox in which an agent meets this tool for the first time.
#
# The isolation is the experiment: an agent with this repository checked out
# reads the answer instead of discovering it. So the sandbox is built outside
# the repo, gets the tool from the public registry, and is handed exactly one
# document — BRIEF.md — which is committed here so a reader can check what the
# agent was told.
#
# Usage: setup.sh <company> <repo-url> <commit>
set -euo pipefail

COMPANY="${1:?usage: setup.sh <company> <repo-url> <commit>}"
REPO_URL="${2:?usage: setup.sh <company> <repo-url> <commit>}"
COMMIT="${3:?usage: setup.sh <company> <repo-url> <commit>}"

ROOT="${SIM_ROOT:-$HOME/sandbox/specgate-sim}"
SANDBOX="$ROOT/$COMPANY"

if [ -e "$SANDBOX" ]; then
  echo "Refusing to overwrite $SANDBOX — a re-run must be a fresh cold read." >&2
  echo "Remove it first if that is what you mean." >&2
  exit 1
fi

mkdir -p "$SANDBOX"
cd "$SANDBOX"

echo "→ cloning $REPO_URL at $COMMIT"
git clone --quiet "$REPO_URL" work
git -C work checkout --quiet "$COMMIT"
# Pinned, because an assessment that cannot name the commit it measured is a
# story rather than a measurement.
git -C work rev-parse HEAD > PINNED_COMMIT

cat > BRIEF.md <<'BRIEF'
# Your task

You are a senior engineer. Your team has inherited the repository in `./work/`
and nobody left documentation of what it is supposed to do. Your lead has asked
you to evaluate a tool called Specgate, which claims to make specifications
something CI can enforce, and to report back by the end of the day.

You have a deadline and no patience for ceremony.

## What you have

- The tool, from the public npm registry: `npx @rsaglobaltech/specgate@latest`
- Its documentation, on the web: https://rsaglobaltech.github.io/specgate/
- The repository in `./work/`, and whatever its own README says about testing

You have nothing else. You have not seen this tool's source and you should not
go looking for it — you are evaluating what a user gets, not what a maintainer
knows.

## What to try

Take the repository to the point where its specifications are checked by CI, as
far as the documentation lets you get. Roughly:

1. Find out what the tool thinks the codebase is.
2. Adopt it, without changing any source code.
3. Write three to five requirements describing behaviour the code **already**
   has, and link each one to the code and the test that prove it. If something
   cannot be linked, that is worth writing down — either the requirement or the
   code is lying.
4. Get its gate to pass, and work out how you would put it in CI.
5. If you get that far, try its agent harness on one new requirement.

## What to record — this is the actual deliverable

Keep `FINDINGS.md` as you go. It matters more than finishing.

- Every command you ran and what it printed. Paste the output verbatim,
  **especially when it was wrong, confusing, or made you stop**.
- Every point where you had to guess because the documentation did not say.
- Every time two parts of the tool disagreed with each other.
- How long each stage took.

## The honest ending

**You are allowed to conclude that this tool is not worth adopting.** If you
reach that view, say so plainly and say what specifically caused it. A negative
report that names the moment you gave up is more useful than a positive one, and
nobody here benefits from you being polite about it.
BRIEF

cat > FINDINGS.md <<'FINDINGS'
# Findings

> Fill this in as you go. Paste output verbatim. Do not tidy it up afterwards.

## What I ran

## Where I got stuck

## Where the tool disagreed with itself

## Verdict
FINDINGS

echo
echo "Sandbox ready: $SANDBOX"
echo "  work/           the unfamiliar repository, pinned at $(cat PINNED_COMMIT | cut -c1-7)"
echo "  BRIEF.md        everything the agent is told"
echo "  FINDINGS.md     what it fills in"
echo
echo "Run an agent from inside $SANDBOX with no other context, then:"
echo "  scripts/simulation/collect.sh $COMPANY"
