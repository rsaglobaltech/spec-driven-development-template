#!/usr/bin/env bats
# Verifies that init generates split .infra / .app env files when DOCKER_SUPPORT=true

setup() {
  SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)/scripts/new_spec_project.sh"
  TMP_CFG="$(mktemp)"
  TMP_OUT="$(mktemp -d)"
  cat > "$TMP_CFG" <<'EOF'
PROJECT_NAME="Env Split Test"
PROJECT_SLUG="env-split-test"
PROJECT_TYPE="backend"
DOMAIN="test"
STACK="Node.js 20"
API_STYLE="REST"
TESTING="Jest"
DOCKER_SUPPORT="true"
DEVCONTAINER_SUPPORT="false"
DATABASE_ENGINE="postgres"
DATABASE_NAME="env_split_test"
DATABASE_USER="app"
DATABASE_PASSWORD="secret"
EOF
}

teardown() {
  rm -f "$TMP_CFG"
  rm -rf "$TMP_OUT"
}

@test "generates .env.dev.app when DOCKER_SUPPORT=true" {
  bash "$SCRIPT" --config "$TMP_CFG" --out "$TMP_OUT" --force --no-git
  [ -f "$TMP_OUT/env-split-test/.env.dev.app" ]
}

@test "generates .env.dev.infra when DOCKER_SUPPORT=true" {
  bash "$SCRIPT" --config "$TMP_CFG" --out "$TMP_OUT" --force --no-git
  [ -f "$TMP_OUT/env-split-test/.env.dev.infra" ]
}

@test ".env.dev.infra contains only POSTGRES_* vars" {
  bash "$SCRIPT" --config "$TMP_CFG" --out "$TMP_OUT" --force --no-git
  local infra="$TMP_OUT/env-split-test/.env.dev.infra"
  grep -q "POSTGRES_DB" "$infra"
  grep -q "POSTGRES_USER" "$infra"
  grep -q "POSTGRES_PASSWORD" "$infra"
  # Must NOT contain app-level vars
  ! grep -q "DATABASE_URL" "$infra"
  ! grep -q "APP_ENV" "$infra"
}

@test ".env.dev.app contains DATABASE_URL and APP_ENV" {
  bash "$SCRIPT" --config "$TMP_CFG" --out "$TMP_OUT" --force --no-git
  local app="$TMP_OUT/env-split-test/.env.dev.app"
  grep -q "APP_ENV=dev" "$app"
  grep -q "DATABASE_URL" "$app"
  # Must NOT contain POSTGRES_* vars
  ! grep -q "POSTGRES_DB" "$app"
}

@test "generates split files for feature and prod environments" {
  bash "$SCRIPT" --config "$TMP_CFG" --out "$TMP_OUT" --force --no-git
  local base="$TMP_OUT/env-split-test"
  [ -f "$base/.env.feature.infra" ]
  [ -f "$base/.env.feature.app" ]
  [ -f "$base/.env.prod.infra" ]
  [ -f "$base/.env.prod.app" ]
}
