#!/usr/bin/env bash
set -euo pipefail

# Simple, safe orchestrator to demonstrate multi-step behavior.
# Idempotent: no destructive actions, only checks and optional tests/formatting.

LOG_FILE="${LOG_FILE:-$(pwd)/orchestration.log}"
touch "$LOG_FILE"

log() {
  local ts
  ts="$(date -Is)"
  printf '[%s] %s\n' "$ts" "$1" | tee -a "$LOG_FILE"
}

run_if_present() {
  local cmd="$1"
  shift
  if command -v "$cmd" >/dev/null 2>&1; then
    log "Running: $cmd $*"
    "$cmd" "$@" | tee -a "$LOG_FILE"
  else
    log "Skipping: $cmd not found"
  fi
}

log "Orchestrator started in $(pwd)"

# Step 1: tool checks
run_if_present git --version
run_if_present node --version
run_if_present npm --version
run_if_present python --version

# Step 2: optional lint/format/test hooks when package.json exists
if [ -f package.json ]; then
  log "package.json detected; running npm scripts if present"
  npm run lint --if-present | tee -a "$LOG_FILE" || true
  npm run fmt --if-present  | tee -a "$LOG_FILE" || true
  npm run test --if-present | tee -a "$LOG_FILE" || true
else
  log "No package.json found; skipping npm-based checks"
fi

# Step 3: Python tests if a tests/ folder exists
if [ -d tests ]; then
  if command -v pytest >/dev/null 2>&1; then
    log "Running pytest"
    pytest | tee -a "$LOG_FILE" || true
  else
    log "tests/ detected but pytest not installed; skipping"
  fi
fi

log "Orchestrator finished"
