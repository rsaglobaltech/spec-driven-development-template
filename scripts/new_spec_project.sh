#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMPLATES_DIR="${ROOT_DIR}/templates"

CONFIG_FILE=""
OUT_DIR=""
FORCE="false"
DRY_RUN="false"
NO_GIT="false"

log_info() { printf 'ℹ️ [INFO] %s\n' "$*"; }
log_warn() { printf '⚠️ [WARN] %s\n' "$*"; }
log_error() { printf '❌ [ERROR] %s\n' "$*" >&2; }

trap 'log_error "Error at line ${LINENO}. Aborting."; exit 1' ERR

usage() {
  cat << 'USAGE'
🚀 Usage:
  new_spec_project.sh --config <path> --out <directory> [--force] [--dry-run] [--no-git]

🔧 Options:
  --config <path>  Configuration file (key="value").
  --out <dir>      Parent directory where the project will be created.
  --force          Overwrite target directory if it already exists.
  --dry-run        Print actions without writing files.
  --no-git         Skip git initialization.
  --help           Show this help.

📦 Exit codes:
  0 success
  2 usage/config error
  3 missing prerequisite
  4 destination conflict
  1 unhandled runtime error
USAGE
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    log_error "Required dependency not found: $1"
    exit 3
  }
}

trim() {
  local s="$1"
  s="${s#${s%%[![:space:]]*}}"
  s="${s%${s##*[![:space:]]}}"
  printf '%s' "$s"
}

strip_quotes() {
  local v="$1"
  if [[ "$v" =~ ^\".*\"$ ]]; then
    v="${v:1:${#v}-2}"
  elif [[ "$v" =~ ^\'.*\'$ ]]; then
    v="${v:1:${#v}-2}"
  fi
  printf '%s' "$v"
}

strip_inline_comment() {
  local v="$1"
  v="${v%%#*}"
  printf '%s' "$v"
}

load_config() {
  local file="$1"
  [[ -f "$file" ]] || { log_error "Config file not found: $file"; exit 2; }

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="$(trim "$line")"
    [[ -z "$line" ]] && continue
    [[ "$line" == \#* ]] && continue

    if [[ "$line" != *=* ]]; then
      log_error "Invalid config line: $line"
      exit 2
    fi

    local key="${line%%=*}"
    local value="${line#*=}"
    key="$(trim "$key")"
    value="$(strip_quotes "$(trim "$(strip_inline_comment "$value")")")"

    case "$key" in
      PROJECT_NAME) PROJECT_NAME="$value" ;;
      PROJECT_SLUG) PROJECT_SLUG="$value" ;;
      PROJECT_TYPE) PROJECT_TYPE="$value" ;;
      DOMAIN) DOMAIN="$value" ;;
      LANG) LANG="$value" ;;
      MODULES) MODULES="$value" ;;
      *) log_warn "Unknown config key (ignored): $key" ;;
    esac
  done < "$file"
}

render_file() {
  local src="$1"
  local dst="$2"

  local esc_project_name="${PROJECT_NAME//\//\\/}"
  local esc_project_slug="${PROJECT_SLUG//\//\\/}"
  local esc_project_type="${PROJECT_TYPE//\//\\/}"
  local esc_domain="${DOMAIN//\//\\/}"
  local esc_lang="${LANG//\//\\/}"

  if [[ "$DRY_RUN" == "true" ]]; then
    log_info "[dry-run] render $src -> $dst"
    return
  fi

  mkdir -p "$(dirname "$dst")"
  sed \
    -e "s/{{PROJECT_NAME}}/${esc_project_name}/g" \
    -e "s/{{PROJECT_SLUG}}/${esc_project_slug}/g" \
    -e "s/{{PROJECT_TYPE}}/${esc_project_type}/g" \
    -e "s/{{DOMAIN}}/${esc_domain}/g" \
    -e "s/{{LANG}}/${esc_lang}/g" \
    "$src" > "$dst"
}

render_tree() {
  local src_root="$1"
  local dst_root="$2"

  while IFS= read -r tpl; do
    local rel="${tpl#${src_root}/}"
    local dst_rel="${rel%.tpl}"
    render_file "$tpl" "${dst_root}/${dst_rel}"
  done < <(find "$src_root" -type f -name '*.tpl' | sort)
}

feature_title_from_path() {
  local rel="$1"
  local base="${rel##*/}"
  base="${base%.feature}"
  base="${base//_/ }"
  printf '%s' "$base"
}

ensure_traceability_coverage() {
  local project_dir="$1"
  local traceability_file="${project_dir}/docs/specs/traceability.md"
  [[ -f "$traceability_file" ]] || return

  local mode="legacy"
  if grep -q '| Requirement | Scenario ID | Feature file | Use Case | Command/Query | Aggregate | Event | Technical artifact | Test artifact | Status |' "$traceability_file"; then
    mode="rich"
  fi

  local counter=1
  while IFS= read -r feature_file; do
    local rel="${feature_file#${project_dir}/}"
    if grep -Fq "$rel" "$traceability_file"; then
      continue
    fi

    local title
    title="$(feature_title_from_path "$rel")"
    local scenario_id
    scenario_id="$(printf 'SCN-TBD-%03d' "$counter")"
    local use_case_id
    use_case_id="$(printf 'UC-TBD-%03d %s' "$counter" "$title")"

    if [[ "$mode" == "rich" ]]; then
      printf '| REQ-TBD | %s | `%s` | %s | TBD | TBD | TBD | TBD | TBD | Draft |\n' \
        "$scenario_id" "$rel" "$use_case_id" >> "$traceability_file"
    else
      printf '| `%s` | %s | TBD | Draft |\n' "$rel" "$title" >> "$traceability_file"
    fi

    counter=$((counter + 1))
  done < <(find "${project_dir}/features" -type f -name '*.feature' | sort)
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --config)
        [[ $# -ge 2 ]] || { log_error "Missing value for --config"; exit 2; }
        CONFIG_FILE="$2"
        shift 2
        ;;
      --out)
        [[ $# -ge 2 ]] || { log_error "Missing value for --out"; exit 2; }
        OUT_DIR="$2"
        shift 2
        ;;
      --force)
        FORCE="true"
        shift
        ;;
      --dry-run)
        DRY_RUN="true"
        shift
        ;;
      --no-git)
        NO_GIT="true"
        shift
        ;;
      --help)
        usage
        exit 0
        ;;
      *)
        log_error "Unknown argument: $1"
        usage
        exit 2
        ;;
    esac
  done

  [[ -n "$CONFIG_FILE" ]] || { log_error "--config is required"; usage; exit 2; }
  [[ -n "$OUT_DIR" ]] || { log_error "--out is required"; usage; exit 2; }
}

validate_config() {
  [[ -n "${PROJECT_NAME:-}" ]] || { log_error "Missing PROJECT_NAME in config"; exit 2; }
  [[ -n "${PROJECT_SLUG:-}" ]] || { log_error "Missing PROJECT_SLUG in config"; exit 2; }
  [[ -n "${PROJECT_TYPE:-}" ]] || { log_error "Missing PROJECT_TYPE in config"; exit 2; }
  [[ -n "${DOMAIN:-}" ]] || { log_error "Missing DOMAIN in config"; exit 2; }
  LANG="${LANG:-en}"
  MODULES="${MODULES:-}"

  if [[ "$PROJECT_TYPE" != "backend" && "$PROJECT_TYPE" != "frontend" ]]; then
    log_error "PROJECT_TYPE must be backend or frontend"
    exit 2
  fi

  if [[ ! "$PROJECT_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    log_error "PROJECT_SLUG must use lowercase letters, numbers, and dashes (example: my-project)"
    exit 2
  fi
}

main() {
  parse_args "$@"

  require_cmd mkdir
  require_cmd cat
  require_cmd sed
  require_cmd find

  if [[ "$NO_GIT" != "true" ]]; then
    require_cmd git
  fi

  load_config "$CONFIG_FILE"
  validate_config

  local project_dir="${OUT_DIR%/}/${PROJECT_SLUG}"

  if [[ -e "$project_dir" && "$FORCE" != "true" ]]; then
    log_error "Destination already exists: $project_dir (use --force to overwrite)"
    exit 4
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    log_info "[dry-run] project would be generated at: $project_dir"
  else
    if [[ -e "$project_dir" ]]; then
      rm -rf "$project_dir"
    fi
    mkdir -p "$project_dir"
  fi

  log_info "🧩 Rendering base template"
  render_tree "${TEMPLATES_DIR}/base" "$project_dir"

  log_info "🛠️ Applying project type template: ${PROJECT_TYPE}"
  render_file "${TEMPLATES_DIR}/${PROJECT_TYPE}/AI_RULES.md.tpl" "${project_dir}/AI_RULES.md"
  render_tree "${TEMPLATES_DIR}/${PROJECT_TYPE}/features" "${project_dir}/features"

  if [[ -n "$MODULES" ]]; then
    IFS=',' read -r -a modules <<< "$MODULES"
    for module in "${modules[@]}"; do
      module="$(trim "$module")"
      [[ -z "$module" ]] && continue
      local module_tpl="${TEMPLATES_DIR}/modules/${module}/${PROJECT_TYPE}"
      if [[ -d "$module_tpl" ]]; then
        log_info "➕ Adding module: $module"
        render_tree "$module_tpl" "${project_dir}/features/${module}"
      else
        log_warn "Template missing for module '$module' and type '$PROJECT_TYPE'"
      fi
    done
  else
    log_info "🧩 No optional modules selected. Generating base + project-type features only."
  fi

  if [[ "$DRY_RUN" != "true" ]]; then
    ensure_traceability_coverage "$project_dir"
  fi

  if [[ "$NO_GIT" != "true" ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      log_info "[dry-run] git init at $project_dir"
    else
      (cd "$project_dir" && git init >/dev/null 2>&1)
    fi
  fi

  log_info "📋 Summary"
  log_info "- Project: $PROJECT_NAME"
  log_info "- Slug: $PROJECT_SLUG"
  log_info "- Type: $PROJECT_TYPE"
  log_info "- Domain: $DOMAIN"
  log_info "- Output: $project_dir"
  log_info "- Dry-run: $DRY_RUN"
  log_info "- Git: $([[ "$NO_GIT" == "true" ]] && echo 'skipped' || echo 'initialized')"
  log_info "✅ Generation completed"
}

main "$@"
