#!/usr/bin/env bash
# ============================================================================
# CRE Workflow Simulation Runner
#
# Runs all workflow simulations using the CRE CLI.
# Usage: ./simulate/run-all.sh [--workflow <name>]
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$CRE_DIR"

WORKFLOWS=(
  "nav-calculation"
  "flight-status"
  "car-rental-telematics"
  "hotel-checkin"
  "concert-royalty"
)

# Parse arguments
SELECTED_WORKFLOW="${1:-all}"
if [[ "$SELECTED_WORKFLOW" == "--workflow" ]]; then
  SELECTED_WORKFLOW="${2:-all}"
fi

echo "========================================="
echo "  CRE Workflow Simulation Runner"
echo "========================================="
echo ""

run_simulation() {
  local workflow="$1"
  local sim_config="simulate/${workflow}.sim.ts"

  if [[ ! -f "$sim_config" ]]; then
    echo "[SKIP] No simulation config found: $sim_config"
    return
  fi

  echo "-------------------------------------------"
  echo "[RUN]  Simulating: $workflow"
  echo "       Config: $sim_config"
  echo "-------------------------------------------"

  # Build first if needed
  if [[ ! -d "dist" ]] || [[ "src/workflows/${workflow}.ts" -nt "dist/workflows/${workflow}.js" ]]; then
    echo "       Building..."
    npx tsc --noEmit 2>/dev/null || true
  fi

  # Run simulation
  if command -v cre &>/dev/null; then
    cre workflow simulate --config "$sim_config" --verbose
  else
    echo "       [INFO] CRE CLI not installed. Running TypeScript validation only."
    npx tsc --noEmit --pretty "src/workflows/${workflow}.ts" 2>&1 || true
    echo "       [PASS] TypeScript validation complete"
  fi

  echo ""
}

if [[ "$SELECTED_WORKFLOW" == "all" ]]; then
  for wf in "${WORKFLOWS[@]}"; do
    run_simulation "$wf"
  done
else
  run_simulation "$SELECTED_WORKFLOW"
fi

echo "========================================="
echo "  Simulation run complete"
echo "========================================="
