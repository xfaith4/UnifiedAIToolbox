#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log_file="${repo_root}/orchestration.log"

timestamp() {
  date -Iseconds
}

log() {
  local stage="$1"; shift
  local status="$1"; shift
  local message="$*"
  printf "[%s] stage=%s status=%s %s\n" "$(timestamp)" "$stage" "$status" "$message" | tee -a "$log_file"
}

log "start" "ok" "orchestrator=UnifiedAIToolbox scripts/orchestrator.sh"
tests_failed=0

# Tool checks
if command -v node >/dev/null 2>&1; then
  log "toolcheck" "ok" "node=$(node --version)"
else
  log "toolcheck" "skip" "node not found"
fi

if command -v python >/dev/null 2>&1; then
  log "toolcheck" "ok" "python=$(python --version 2>&1)"
else
  log "toolcheck" "skip" "python not found"
fi

# Tests (best-effort)
if [ -f "${repo_root}/package.json" ] && command -v npm >/dev/null 2>&1; then
  if [ -d "${repo_root}/node_modules" ]; then
    log "tests" "running" "npm test --if-present"
    if (cd "$repo_root" && npm test --if-present); then
      log "tests" "ok" "npm test completed"
    else
      log "tests" "fail" "npm test failed"
      tests_failed=1
    fi
  else
    log "tests" "skip" "node_modules missing; run npm install to enable tests"
  fi
else
  log "tests" "skip" "npm or package.json not available"
fi

# Formatting (best-effort)
if [ -f "${repo_root}/package.json" ] && command -v npm >/dev/null 2>&1; then
  log "format" "running" "npm run format --if-present"
  if (cd "$repo_root" && npm run format --if-present); then
    log "format" "ok" "format step completed"
  else
    log "format" "skip" "format step failed or not defined"
  fi
else
  log "format" "skip" "format step unavailable"
fi

if (( tests_failed )); then
  log "complete" "warn" "orchestrator finished with test failures"
else
  log "complete" "ok" "orchestrator finished"
fi

exit $tests_failed
