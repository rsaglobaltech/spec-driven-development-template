#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

TARGET_DIR="${1:-}"

log_info() { printf 'ℹ️ [INFO] %s\n' "$*"; }
log_error() { printf '❌ [ERROR] %s\n' "$*" >&2; }

usage() {
  cat << 'USAGE'
🔎 Usage:
  validate_specs.sh <project_dir>

Checks:
- minimum SDD structure
- required files
- at least one .feature file
- unresolved placeholders ({{...}})
USAGE
}

[[ -n "$TARGET_DIR" ]] || { usage; exit 2; }
[[ -d "$TARGET_DIR" ]] || { log_error "Directory not found: $TARGET_DIR"; exit 2; }

required_files=(
  "spec.md"
  "AI_RULES.md"
  "README.md"
  "docs/specs/traceability.md"
  "docs/specs/adr/README.md"
)

required_dirs=(
  "features"
  "docs/specs"
)

for d in "${required_dirs[@]}"; do
  [[ -d "$TARGET_DIR/$d" ]] || { log_error "Missing required directory: $d"; exit 1; }
done

for f in "${required_files[@]}"; do
  [[ -f "$TARGET_DIR/$f" ]] || { log_error "Missing required file: $f"; exit 1; }
done

feature_count="$(find "$TARGET_DIR/features" -type f -name '*.feature' | wc -l | tr -d ' ')"
if [[ "$feature_count" -lt 1 ]]; then
  log_error "No .feature files were found in features/"
  exit 1
fi

if grep -R -n '{{[A-Z_][A-Z0-9_]*}}' "$TARGET_DIR" >/dev/null 2>&1; then
  log_error "Unresolved placeholders detected"
  grep -R -n '{{[A-Z_][A-Z0-9_]*}}' "$TARGET_DIR" || true
  exit 1
fi

if ! grep -q '| Feature | Scenario | Technical artifact | Status |' "$TARGET_DIR/docs/specs/traceability.md"; then
  log_error "traceability.md is missing the expected matrix header"
  exit 1
fi

log_info "✅ Validation passed"
log_info "- Features detected: $feature_count"
log_info "- Base SDD structure: complete"
