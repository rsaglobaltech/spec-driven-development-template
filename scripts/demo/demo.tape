# VHS tape — automated terminal demo of create-spec-driven-app.
# Render with: bash scripts/demo/build-video.sh   (which puts `csda` on PATH
# and exports CSDA_DEMO_PACK_ROOT). Or, with the CLI already installed:
#   CSDA_DEMO_PACK_ROOT=./tests/fixtures/domain-packs vhs scripts/demo/demo.tape
#
# VHS: https://github.com/charmbracelet/vhs

Output scripts/demo/out/demo.gif
Output scripts/demo/out/demo.mp4

Require csda

Set Shell bash
Set FontSize 16
Set Width 1280
Set Height 720
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

# ── Setup (hidden): isolated work dir ────────────────────────────────────────
Hide
Type "cd $(mktemp -d) && clear" Enter
Show

# ── 1. Scaffold a spec-driven project ────────────────────────────────────────
Type "# 1. Scaffold a spec-driven project from a config file" Enter
Sleep 900ms
Type "cat > smart-parking.config <<'EOF'" Enter
Type 'PROJECT_NAME="Smart Parking"' Enter
Type 'PROJECT_SLUG="smart-parking"' Enter
Type 'PROJECT_TYPE="backend"' Enter
Type 'DOMAIN="parking operations"' Enter
Type 'STACK="Quarkus 3.x, Java 21, PostgreSQL"' Enter
Type 'API_STYLE="REST with DTO boundaries"' Enter
Type 'TESTING="JUnit 5, Testcontainers, Cucumber"' Enter
Type "EOF" Enter
Sleep 600ms
Type "csda init --config ./smart-parking.config --out . --no-git" Enter
Sleep 2.5s
Type "cd smart-parking" Enter
Sleep 500ms

# ── 2. Apply a domain pack ───────────────────────────────────────────────────
Type "# 2. Apply a versioned domain pack (npm-install style)" Enter
Sleep 900ms
Type "csda specops add --pack-root $CSDA_DEMO_PACK_ROOT --pack parking-management/backend \" Enter
Type '  --var PROJECT_NAME="Smart Parking" --var PROJECT_SLUG=smart-parking --var DOMAIN="parking operations"' Enter
Sleep 3s

# ── 3. Plan: what still needs building ───────────────────────────────────────
Type "# 3. plan — what work did the pack create?" Enter
Sleep 900ms
Type "csda plan" Enter
Sleep 3.5s

# ── 4. Validate with the TDD gate ────────────────────────────────────────────
Type "# 4. validate — structure, traceability + the strict TDD gate" Enter
Sleep 900ms
Type "csda validate . --strict-tdd" Enter
Sleep 3s

# ── 5. See the pack's reference graph ────────────────────────────────────────
Type "# 5. pack lint --graph — see the REQ -> UC -> CMD/AGG/EVT graph" Enter
Sleep 900ms
Type "csda pack lint --pack-root $CSDA_DEMO_PACK_ROOT --pack parking-management/backend --graph | head -16" Enter
Sleep 3.5s

# ── 6. Dry-run the AI delivery harness ───────────────────────────────────────
Type "# 6. harness run --dry-run — the plan -> agent -> verify -> done loop" Enter
Sleep 900ms
Type "git init -q && git add -A && git commit -qm 'init' && csda harness run --dry-run | head -20" Enter
Sleep 4s

Type "# Specs as executable contracts. https://github.com/rsaglobaltech/spec-driven-development-template" Enter
Sleep 3s
