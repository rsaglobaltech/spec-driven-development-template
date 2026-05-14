# VHS tape — full step-by-step demo that follows docs/tutorial.md.
#
# Render it with:  bash scripts/demo/build-video.sh
# (build-video.sh builds the CLI, exposes `csda` on PATH, and creates a local
#  versioned pack repo, exporting the CSDA_* variables this tape reads.)
#
# VHS: https://github.com/charmbracelet/vhs

Output scripts/demo/out/demo.mp4
Output scripts/demo/out/demo.gif

Require csda

# ── Look & feel: 1080p, large readable font, relaxed pace ────────────────────
Set Shell bash
Set FontSize 22
Set Width 1920
Set Height 1080
Set Padding 32
Set Margin 0
Set Theme "Catppuccin Mocha"
Set TypingSpeed 80ms
Set PlaybackSpeed 1.0

# ── Setup (hidden): isolated work dir ────────────────────────────────────────
Hide
Type "cd $(mktemp -d) && clear" Enter
Show
Sleep 1s

# ════════════════════════════════════════════════════════════════════════════
#  Intro
# ════════════════════════════════════════════════════════════════════════════
Type "# create-spec-driven-app — specs as executable contracts." Enter
Sleep 2s
Type "csda --help" Enter
Sleep 5s
Type "clear" Enter
Sleep 800ms

# ════════════════════════════════════════════════════════════════════════════
#  Step 1 — Scaffold the project (init)
# ════════════════════════════════════════════════════════════════════════════
Type "# Step 1 — Scaffold a spec-driven project from a YAML config." Enter
Sleep 2.5s
Type "cat > smart-parking.yaml <<'EOF'" Enter
Type "PROJECT_NAME: Smart Parking" Enter
Type "PROJECT_SLUG: smart-parking" Enter
Type "PROJECT_TYPE: backend" Enter
Type "DOMAIN: parking operations" Enter
Type "STACK: Quarkus 3.x, Java 21, PostgreSQL" Enter
Type "API_STYLE: REST with DTO boundaries" Enter
Type "TESTING: JUnit 5, Testcontainers, Cucumber" Enter
Type "EOF" Enter
Sleep 1.5s
Type "csda init --config ./smart-parking.yaml --out . --no-git" Enter
Sleep 3s
Type "cd smart-parking && ls" Enter
Sleep 3s
Type "clear" Enter
Sleep 800ms

# ════════════════════════════════════════════════════════════════════════════
#  Step 2 — Apply the domain pack (specops add)
# ════════════════════════════════════════════════════════════════════════════
Type "# Step 2 — Pull in a versioned domain pack (the npm-install of SDD)." Enter
Sleep 2.5s
Type "csda specops add --pack-repo $CSDA_PACK_REPO --pack-version $CSDA_PACK_V1 \" Enter
Type "  --pack $CSDA_PACK_ID --cache-dir $CSDA_CACHE_DIR \" Enter
Type "  --var PROJECT_NAME='Smart Parking' --var PROJECT_SLUG=smart-parking --var DOMAIN='parking operations'" Enter
Sleep 4s
Type "# It rendered specs into the project and wrote .specops.lock." Enter
Sleep 2s
Type "ls features && cat .specops.lock" Enter
Sleep 5s
Type "clear" Enter
Sleep 800ms

# ════════════════════════════════════════════════════════════════════════════
#  Step 3 — Validate (validate + --strict-tdd)
# ════════════════════════════════════════════════════════════════════════════
Type "# Step 3 — Validate: structure, traceability, Gherkin." Enter
Sleep 2.5s
Type "csda validate ." Enter
Sleep 3.5s
Type "# --strict-tdd: the matrix may not run ahead of the tests." Enter
Sleep 2s
Type "csda validate . --strict-tdd" Enter
Sleep 4s
Type "clear" Enter
Sleep 800ms

# ════════════════════════════════════════════════════════════════════════════
#  Step 7 (preview here, while the project is pristine) — keep the pack in sync
# ════════════════════════════════════════════════════════════════════════════
Type "# Keep the pack in sync — re-render everything from the lockfile." Enter
Sleep 2.5s
Type "csda specops sync --cache-dir $CSDA_CACHE_DIR" Enter
Sleep 4s
Type "# A new pack version shipped? Preview the upgrade first (writes nothing)." Enter
Sleep 2s
Type "csda specops diff --pack-version $CSDA_PACK_V2 --cache-dir $CSDA_CACHE_DIR" Enter
Sleep 5s
Type "# To adopt it: csda specops sync --pack-version $CSDA_PACK_V2  (three-way merge)." Enter
Sleep 2.5s
Type "clear" Enter
Sleep 800ms

# ════════════════════════════════════════════════════════════════════════════
#  Step 4 — Plan (what is left to build)
# ════════════════════════════════════════════════════════════════════════════
Type "# Step 4 — plan: what does each requirement still need?" Enter
Sleep 2.5s
Type "csda plan" Enter
Sleep 6s
Type "# Same thing, machine-readable for AI agents and CI:" Enter
Sleep 2s
Type "csda plan --format json | head -20" Enter
Sleep 5s
Type "clear" Enter
Sleep 800ms

# ════════════════════════════════════════════════════════════════════════════
#  Step 5 — Implement a requirement and close the loop (done)
# ════════════════════════════════════════════════════════════════════════════
Type "# Step 5 — After writing the test + code, close the loop with done." Enter
Sleep 2.5s
Type "csda done REQ-001 --check" Enter
Sleep 4s
Type "csda plan | head -6" Enter
Sleep 4s
Type "clear" Enter
Sleep 800ms

# ════════════════════════════════════════════════════════════════════════════
#  Step 6 — Add a NEW requirement (as a project consumer)
# ════════════════════════════════════════════════════════════════════════════
Type "# Step 6 — Add a project-local requirement: spec -> scenario -> matrix row." Enter
Sleep 2.5s
Type "# demo-add-req appends a spec.md section, writes a .feature, adds a matrix row." Enter
Sleep 1.5s
Type "demo-add-req" Enter
Sleep 2.5s
Type "cat features/reservations/reserve_spot.feature" Enter
Sleep 4.5s
Type "# Validate the new requirement is wired in, then see it in the plan." Enter
Sleep 2s
Type "csda validate . --strict-tdd && csda plan | tail -8" Enter
Sleep 6s
Type "clear" Enter
Sleep 800ms

# ════════════════════════════════════════════════════════════════════════════
#  Step 8 — Remove a pack (specops remove)
# ════════════════════════════════════════════════════════════════════════════
Type "# Step 8 — Dropping a pack (dry-run here, so the demo project stays intact)." Enter
Sleep 2.5s
Type "csda specops remove $CSDA_PACK_ID --dry-run" Enter
Sleep 4s
Type "clear" Enter
Sleep 800ms

# ════════════════════════════════════════════════════════════════════════════
#  Step 9 — Authoring packs (pack lint --graph, pack infer)
# ════════════════════════════════════════════════════════════════════════════
Type "# Step 9 — Authoring side: see a pack's REQ -> UC -> CMD/AGG/EVT graph." Enter
Sleep 2.5s
Type "csda pack lint --pack-root $CSDA_DEMO_PACK_ROOT --pack parking-management/backend --graph | head -14" Enter
Sleep 5s
Type "# pack infer — write the .feature first, get a pack.yaml skeleton back." Enter
Sleep 2s
Type "csda pack infer --from features/reservations/reserve_spot.feature | head -22" Enter
Sleep 6s
Type "clear" Enter
Sleep 800ms

# ════════════════════════════════════════════════════════════════════════════
#  Step 11 — Automate delivery with the harness
# ════════════════════════════════════════════════════════════════════════════
Type "# Step 11 — The harness runs plan -> agent -> verify -> done per requirement." Enter
Sleep 2.5s
Type "git init -q && git add -A && git commit -qm 'wip'" Enter
Sleep 1.5s
Type "# --dry-run shows the prompt the agent (e.g. opencode) would receive." Enter
Sleep 2s
Type "csda harness run --dry-run | head -28" Enter
Sleep 6s
Type "clear" Enter
Sleep 800ms

# ════════════════════════════════════════════════════════════════════════════
#  Outro
# ════════════════════════════════════════════════════════════════════════════
Type "# Specs as executable contracts — for humans and AI agents alike." Enter
Sleep 2s
Type "# Full guide: docs/tutorial.md" Enter
Sleep 3.5s
