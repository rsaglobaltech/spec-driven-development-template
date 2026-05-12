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
  --config <path>  Configuration file (key="value"; requires stack fields).
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

escape_sed_replacement() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//&/\\&}"
  s="${s//\//\\/}"
  printf '%s' "$s"
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
      STACK) STACK="$value" ;;
      API_STYLE) API_STYLE="$value" ;;
      TESTING) TESTING="$value" ;;
      ENVIRONMENTS) ENVIRONMENTS="$value" ;;
      DEFAULT_ENV) DEFAULT_ENV="$value" ;;
      DOCKER_SUPPORT) DOCKER_SUPPORT="$value" ;;
      DEVCONTAINER_SUPPORT) DEVCONTAINER_SUPPORT="$value" ;;
      DATABASE_ENGINE) DATABASE_ENGINE="$value" ;;
      DATABASE_VERSION) DATABASE_VERSION="$value" ;;
      DATABASE_IMAGE) DATABASE_IMAGE="$value" ;;
      DATABASE_HOST) DATABASE_HOST="$value" ;;
      DATABASE_PORT) DATABASE_PORT="$value" ;;
      DATABASE_PORT_DEV) DATABASE_PORT_DEV="$value" ;;
      DATABASE_PORT_FEATURE) DATABASE_PORT_FEATURE="$value" ;;
      DATABASE_PORT_PROD) DATABASE_PORT_PROD="$value" ;;
      DATABASE_CONTAINER_PORT) DATABASE_CONTAINER_PORT="$value" ;;
      DATABASE_NAME) DATABASE_NAME="$value" ;;
      DATABASE_USER) DATABASE_USER="$value" ;;
      DATABASE_PASSWORD) DATABASE_PASSWORD="$value" ;;
      MODULES) MODULES="$value" ;;
      *) log_warn "Unknown config key (ignored): $key" ;;
    esac
  done < "$file"
}

render_file() {
  local src="$1"
  local dst="$2"

  local esc_project_name
  local esc_project_slug
  local esc_project_type
  local esc_domain
  local esc_lang
  local esc_stack
  local esc_api_style
  local esc_testing
  local esc_environments
  local esc_default_env
  local esc_docker_support
  local esc_devcontainer_support
  local esc_database_engine
  local esc_database_version
  local esc_database_image
  local esc_database_host
  local esc_database_port
  local esc_database_port_dev
  local esc_database_port_feature
  local esc_database_port_prod
  local esc_database_container_port
  local esc_database_name
  local esc_database_name_dev
  local esc_database_name_feature
  local esc_database_name_prod
  local esc_database_user
  local esc_database_password
  local esc_database_url_dev
  local esc_database_url_feature
  local esc_database_url_prod
  esc_project_name="$(escape_sed_replacement "$PROJECT_NAME")"
  esc_project_slug="$(escape_sed_replacement "$PROJECT_SLUG")"
  esc_project_type="$(escape_sed_replacement "$PROJECT_TYPE")"
  esc_domain="$(escape_sed_replacement "$DOMAIN")"
  esc_lang="$(escape_sed_replacement "$LANG")"
  esc_stack="$(escape_sed_replacement "$STACK")"
  esc_api_style="$(escape_sed_replacement "$API_STYLE")"
  esc_testing="$(escape_sed_replacement "$TESTING")"
  esc_environments="$(escape_sed_replacement "$ENVIRONMENTS")"
  esc_default_env="$(escape_sed_replacement "$DEFAULT_ENV")"
  esc_docker_support="$(escape_sed_replacement "$DOCKER_SUPPORT")"
  esc_devcontainer_support="$(escape_sed_replacement "$DEVCONTAINER_SUPPORT")"
  esc_database_engine="$(escape_sed_replacement "$DATABASE_ENGINE")"
  esc_database_version="$(escape_sed_replacement "$DATABASE_VERSION")"
  esc_database_image="$(escape_sed_replacement "$DATABASE_IMAGE")"
  esc_database_host="$(escape_sed_replacement "$DATABASE_HOST")"
  esc_database_port="$(escape_sed_replacement "$DATABASE_PORT")"
  esc_database_port_dev="$(escape_sed_replacement "$DATABASE_PORT_DEV")"
  esc_database_port_feature="$(escape_sed_replacement "$DATABASE_PORT_FEATURE")"
  esc_database_port_prod="$(escape_sed_replacement "$DATABASE_PORT_PROD")"
  esc_database_container_port="$(escape_sed_replacement "$DATABASE_CONTAINER_PORT")"
  esc_database_name="$(escape_sed_replacement "$DATABASE_NAME")"
  esc_database_name_dev="$(escape_sed_replacement "$DATABASE_NAME_DEV")"
  esc_database_name_feature="$(escape_sed_replacement "$DATABASE_NAME_FEATURE")"
  esc_database_name_prod="$(escape_sed_replacement "$DATABASE_NAME_PROD")"
  esc_database_user="$(escape_sed_replacement "$DATABASE_USER")"
  esc_database_password="$(escape_sed_replacement "$DATABASE_PASSWORD")"
  esc_database_url_dev="$(escape_sed_replacement "$DATABASE_URL_DEV")"
  esc_database_url_feature="$(escape_sed_replacement "$DATABASE_URL_FEATURE")"
  esc_database_url_prod="$(escape_sed_replacement "$DATABASE_URL_PROD")"

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
    -e "s/{{STACK}}/${esc_stack}/g" \
    -e "s/{{API_STYLE}}/${esc_api_style}/g" \
    -e "s/{{TESTING}}/${esc_testing}/g" \
    -e "s/{{ENVIRONMENTS}}/${esc_environments}/g" \
    -e "s/{{DEFAULT_ENV}}/${esc_default_env}/g" \
    -e "s/{{DOCKER_SUPPORT}}/${esc_docker_support}/g" \
    -e "s/{{DEVCONTAINER_SUPPORT}}/${esc_devcontainer_support}/g" \
    -e "s/{{DATABASE_ENGINE}}/${esc_database_engine}/g" \
    -e "s/{{DATABASE_VERSION}}/${esc_database_version}/g" \
    -e "s/{{DATABASE_IMAGE}}/${esc_database_image}/g" \
    -e "s/{{DATABASE_HOST}}/${esc_database_host}/g" \
    -e "s/{{DATABASE_PORT}}/${esc_database_port}/g" \
    -e "s/{{DATABASE_PORT_DEV}}/${esc_database_port_dev}/g" \
    -e "s/{{DATABASE_PORT_FEATURE}}/${esc_database_port_feature}/g" \
    -e "s/{{DATABASE_PORT_PROD}}/${esc_database_port_prod}/g" \
    -e "s/{{DATABASE_CONTAINER_PORT}}/${esc_database_container_port}/g" \
    -e "s/{{DATABASE_NAME}}/${esc_database_name}/g" \
    -e "s/{{DATABASE_NAME_DEV}}/${esc_database_name_dev}/g" \
    -e "s/{{DATABASE_NAME_FEATURE}}/${esc_database_name_feature}/g" \
    -e "s/{{DATABASE_NAME_PROD}}/${esc_database_name_prod}/g" \
    -e "s/{{DATABASE_USER}}/${esc_database_user}/g" \
    -e "s/{{DATABASE_PASSWORD}}/${esc_database_password}/g" \
    -e "s/{{DATABASE_URL_DEV}}/${esc_database_url_dev}/g" \
    -e "s/{{DATABASE_URL_FEATURE}}/${esc_database_url_feature}/g" \
    -e "s/{{DATABASE_URL_PROD}}/${esc_database_url_prod}/g" \
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

apply_runtime_support_flags() {
  local project_dir="$1"

  if [[ "$DOCKER_SUPPORT" != "true" ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      log_info "[dry-run] skip Docker artifacts"
    else
      rm -f "${project_dir}/docker-compose.yml" "${project_dir}/.dockerignore"
    fi
  fi

  if [[ "$DEVCONTAINER_SUPPORT" != "true" ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      log_info "[dry-run] skip devcontainer artifacts"
    else
      rm -rf "${project_dir}/.devcontainer"
    fi
  fi
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
  [[ -n "${STACK:-}" ]] || { log_error "Missing STACK in config"; exit 2; }
  [[ -n "${API_STYLE:-}" ]] || { log_error "Missing API_STYLE in config"; exit 2; }
  [[ -n "${TESTING:-}" ]] || { log_error "Missing TESTING in config"; exit 2; }
  LANG="${LANG:-en}"
  MODULES="${MODULES:-}"
  ENVIRONMENTS="${ENVIRONMENTS:-dev,feature,prod}"
  DEFAULT_ENV="${DEFAULT_ENV:-dev}"
  DOCKER_SUPPORT="${DOCKER_SUPPORT:-true}"
  DEVCONTAINER_SUPPORT="${DEVCONTAINER_SUPPORT:-true}"
  DATABASE_ENGINE="${DATABASE_ENGINE:-postgres}"
  DATABASE_VERSION="${DATABASE_VERSION:-16}"
  DATABASE_HOST="${DATABASE_HOST:-db}"
  DATABASE_PORT="${DATABASE_PORT:-5432}"
  DATABASE_PORT_DEV="${DATABASE_PORT_DEV:-$DATABASE_PORT}"
  DATABASE_PORT_FEATURE="${DATABASE_PORT_FEATURE:-5433}"
  DATABASE_PORT_PROD="${DATABASE_PORT_PROD:-5434}"
  DATABASE_CONTAINER_PORT="${DATABASE_CONTAINER_PORT:-5432}"
  DATABASE_NAME="${DATABASE_NAME:-${PROJECT_SLUG//-/_}}"
  DATABASE_NAME_DEV="${DATABASE_NAME}_dev"
  DATABASE_NAME_FEATURE="${DATABASE_NAME}_feature"
  DATABASE_NAME_PROD="${DATABASE_NAME}_prod"
  DATABASE_USER="${DATABASE_USER:-${DATABASE_NAME}_app}"
  DATABASE_PASSWORD="${DATABASE_PASSWORD:-change-me}"

  local supported_engines="postgres"
  local engine_valid=false
  for e in $supported_engines; do
    [[ "$DATABASE_ENGINE" == "$e" ]] && engine_valid=true && break
  done
  if [[ "$engine_valid" != "true" ]]; then
    log_error "DATABASE_ENGINE '${DATABASE_ENGINE}' is not supported. Supported engines: ${supported_engines}"
    exit 2
  fi

  if [[ "$DOCKER_SUPPORT" != "true" && "$DEVCONTAINER_SUPPORT" == "true" ]]; then
    log_error "DEVCONTAINER_SUPPORT requires DOCKER_SUPPORT=true"
    exit 2
  fi

  DATABASE_IMAGE="${DATABASE_IMAGE:-postgres:${DATABASE_VERSION}}"
  DATABASE_URL_DEV="postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_CONTAINER_PORT}/${DATABASE_NAME_DEV}"
  DATABASE_URL_FEATURE="postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_CONTAINER_PORT}/${DATABASE_NAME_FEATURE}"
  DATABASE_URL_PROD="postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_CONTAINER_PORT}/${DATABASE_NAME_PROD}"

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
  apply_runtime_support_flags "$project_dir"

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
