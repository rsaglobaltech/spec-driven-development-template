# End-to-end walkthrough

The shortest complete pass through the tool, on the public
`parking-management-specops` pack. For the long-form version with the
reasoning at each step, read the [tutorial](tutorial.md).

---

**Goal:** end-to-end exercise using the real demo pack repo at `https://github.com/rsaglobaltech/parking-management-specops`.

```bash
# 0. Pick a working directory
mkdir -p ~/sandbox && cd ~/sandbox

# 1. Generate the consumer project
cat > smart-parking.config <<'EOF'
PROJECT_NAME="Smart Parking"
PROJECT_SLUG="smart-parking"
PROJECT_TYPE="backend"
DOMAIN="parking operations"
STACK="Quarkus 3.x, Java 21, PostgreSQL"
API_STYLE="REST with DTO boundaries"
TESTING="JUnit 5, Testcontainers, Cucumber"
LANG="en"
MODULES=""
EOF

csda init --config ./smart-parking.config --out . --no-git
cd smart-parking

# 2. Apply the parking-management pack (pinned to v0.1.0)
csda specops add \
  --pack-repo https://github.com/rsaglobaltech/parking-management-specops.git \
  --pack-version v0.1.0 \
  --pack backend \
  --var PROJECT_NAME="Smart Parking" \
  --var PROJECT_SLUG=smart-parking \
  --var DOMAIN="parking operations"

# 3. See what work the pack created
csda plan

# 4. (Optional) Same, machine-readable for an AI agent
csda plan --format json | tail -40

# 5. Implement one REQ (this is the "human + AI" loop)
#    Read features/.../*.feature, write the test, write the production code.
#    Then close the loop:
csda done REQ-001 --check        # runs validate first, aborts on red

# 6. When pack v0.2.0 lands upstream, preview the diff before applying
csda specops diff --pack-version v0.2.0
csda specops diff --pack-version v0.2.0 --format json

# 7. Apply the bump
csda specops sync --pack-version v0.2.0
csda plan                         # see what's newly NEEDS_*

# 8. Drop the pack entirely if needed
csda specops remove parking-management/backend
```

Every command above also works **without** flags from inside the project tree (project root auto-detected). For CI, see §4 for the workflow YAML and §14 for the local pre-commit gate.

---

---

## Next

- [The full tutorial](tutorial.md)
- [Domain packs](domain-packs.md)
