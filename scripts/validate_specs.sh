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
- feature coverage in traceability.md
- allowed status values in traceability.md
- expected DDD Lite document headers when present
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

TRACEABILITY_FILE="$TARGET_DIR/docs/specs/traceability.md"
TRACE_MODE="legacy"
if grep -q '| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |' "$TRACEABILITY_FILE"; then
  TRACE_MODE="rich"
elif ! grep -q '| Feature | Scenario | Technical artifact | Status |' "$TRACEABILITY_FILE"; then
  log_error "traceability.md is missing the expected legacy or rich matrix header"
  exit 1
fi

status_allowed() {
  case "$1" in
    "Draft"|"Needs Clarification"|"Domain Reviewed"|"Architecture Reviewed"|"Ready for Dev"|"In Dev"|"In Review"|"Verified"|"Released"|"Deprecated")
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

trim_cell() {
  local s="$1"
  s="${s#${s%%[![:space:]]*}}"
  s="${s%${s##*[![:space:]]}}"
  printf '%s' "$s"
}

seen_scenario_ids=""
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" == \|* ]] || continue
  [[ "$line" == *'---'* ]] && continue
  [[ "$line" == *'| Requirement | Scenario ID |'* ]] && continue
  [[ "$line" == *'| Feature | Scenario |'* ]] && continue

  IFS='|' read -r _ c1 c2 c3 c4 c5 c6 c7 c8 c9 c10 _rest <<< "$line"

  if [[ "$TRACE_MODE" == "rich" ]]; then
    scenario_id="$(trim_cell "${c2:-}")"
    status="$(trim_cell "${c10:-}")"

    if [[ -n "$scenario_id" && "$scenario_id" != "-" ]]; then
      if printf '%s\n' "$seen_scenario_ids" | grep -Fxq "$scenario_id"; then
        log_error "Duplicate Scenario ID in traceability.md: $scenario_id"
        exit 1
      fi
      seen_scenario_ids="${seen_scenario_ids}${scenario_id}"$'\n'
    fi
  else
    status="$(trim_cell "${c4:-}")"
  fi

  if [[ -n "$status" ]] && ! status_allowed "$status"; then
    log_error "Invalid status in traceability.md: $status"
    exit 1
  fi
done < "$TRACEABILITY_FILE"

while IFS= read -r feature_file || [[ -n "$feature_file" ]]; do
  rel="${feature_file#${TARGET_DIR}/}"
  if ! grep -Fq "$rel" "$TRACEABILITY_FILE"; then
    log_error "Feature file missing from traceability.md: $rel"
    exit 1
  fi
done < <(find "$TARGET_DIR/features" -type f -name '*.feature' | sort)

if [[ -f "$TARGET_DIR/docs/specs/use-cases.md" ]] && ! grep -q '| ID | Use Case | Actor | Requirement | Command/Query | Aggregate | Emits' "$TARGET_DIR/docs/specs/use-cases.md"; then
  log_error "use-cases.md is missing the expected table header"
  exit 1
fi

if [[ -f "$TARGET_DIR/docs/specs/events.md" ]] && ! grep -q '| ID | Event | Producer | Consumers | Payload |' "$TARGET_DIR/docs/specs/events.md"; then
  log_error "events.md is missing the expected table header"
  exit 1
fi

log_info "✅ Validation passed"
log_info "- Features detected: $feature_count"
log_info "- Base SDD structure: complete"
log_info "- Traceability mode: $TRACE_MODE"
