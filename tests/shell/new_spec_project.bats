#!/usr/bin/env bats
# Tests for scripts/new_spec_project.sh

setup() {
  SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)/scripts/new_spec_project.sh"
  TMP_CFG="$(mktemp)"
  TMP_OUT="$(mktemp -d)"
  cat > "$TMP_CFG" <<'EOF'
PROJECT_NAME="Test Project"
PROJECT_SLUG="test-project"
PROJECT_TYPE="backend"
DOMAIN="test domain"
STACK="Node.js 20"
API_STYLE="REST"
TESTING="Jest"
DOCKER_SUPPORT="false"
DEVCONTAINER_SUPPORT="false"
EOF
}

teardown() {
  rm -f "$TMP_CFG"
  rm -rf "$TMP_OUT"
}

# --- Required field validation ---

@test "fails when PROJECT_NAME is missing" {
  local cfg; cfg="$(mktemp)"
  grep -v PROJECT_NAME "$TMP_CFG" > "$cfg"
  run bash "$SCRIPT" --config "$cfg" --out "$TMP_OUT" --force --no-git
  rm -f "$cfg"
  [ "$status" -ne 0 ]
}

@test "fails when DOMAIN is missing" {
  local cfg; cfg="$(mktemp)"
  grep -v "^DOMAIN=" "$TMP_CFG" > "$cfg"
  run bash "$SCRIPT" --config "$cfg" --out "$TMP_OUT" --force --no-git
  rm -f "$cfg"
  [ "$status" -ne 0 ]
}

@test "fails when STACK is missing" {
  local cfg; cfg="$(mktemp)"
  grep -v "^STACK=" "$TMP_CFG" > "$cfg"
  run bash "$SCRIPT" --config "$cfg" --out "$TMP_OUT" --force --no-git
  rm -f "$cfg"
  [ "$status" -ne 0 ]
}

# --- Successful scaffold ---

@test "succeeds with minimal valid config" {
  run bash "$SCRIPT" --config "$TMP_CFG" --out "$TMP_OUT" --force --no-git
  [ "$status" -eq 0 ]
}

@test "creates spec.md in output directory" {
  bash "$SCRIPT" --config "$TMP_CFG" --out "$TMP_OUT" --force --no-git
  [ -f "$TMP_OUT/test-project/spec.md" ]
}

@test "creates AI_RULES.md in output directory" {
  bash "$SCRIPT" --config "$TMP_CFG" --out "$TMP_OUT" --force --no-git
  [ -f "$TMP_OUT/test-project/AI_RULES.md" ]
}

@test "creates docs/specs/traceability.md" {
  bash "$SCRIPT" --config "$TMP_CFG" --out "$TMP_OUT" --force --no-git
  [ -f "$TMP_OUT/test-project/docs/specs/traceability.md" ]
}

# --- Docker/devcontainer flags ---

@test "does not create docker-compose.yml when DOCKER_SUPPORT=false" {
  bash "$SCRIPT" --config "$TMP_CFG" --out "$TMP_OUT" --force --no-git
  [ ! -f "$TMP_OUT/test-project/docker-compose.yml" ]
}

@test "does not create devcontainer.json when DEVCONTAINER_SUPPORT=false" {
  bash "$SCRIPT" --config "$TMP_CFG" --out "$TMP_OUT" --force --no-git
  [ ! -f "$TMP_OUT/test-project/.devcontainer/devcontainer.json" ]
}

@test "creates docker-compose.yml when DOCKER_SUPPORT=true" {
  local cfg; cfg="$(mktemp)"
  sed 's/DOCKER_SUPPORT="false"/DOCKER_SUPPORT="true"/' "$TMP_CFG" > "$cfg"
  bash "$SCRIPT" --config "$cfg" --out "$TMP_OUT" --force --no-git
  rm -f "$cfg"
  [ -f "$TMP_OUT/test-project/docker-compose.yml" ]
}

# --- Dry run ---

@test "dry-run exits 0 and does not write files" {
  run bash "$SCRIPT" --config "$TMP_CFG" --out "$TMP_OUT" --dry-run --no-git
  [ "$status" -eq 0 ]
  [ ! -f "$TMP_OUT/test-project/spec.md" ]
}

# --- DB engine validation ---

@test "fails when DATABASE_ENGINE is unsupported" {
  local cfg; cfg="$(mktemp)"
  cat "$TMP_CFG" > "$cfg"
  echo 'DATABASE_ENGINE="mysql"' >> "$cfg"
  run bash "$SCRIPT" --config "$cfg" --out "$TMP_OUT" --force --no-git
  rm -f "$cfg"
  [ "$status" -ne 0 ]
  [[ "$output" == *"mysql"* ]] || [[ "$output" == *"not supported"* ]] || [[ "$output" == *"Supported engines"* ]]
}
