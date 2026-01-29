#!/bin/bash
# =============================================================================
# AHOY Tokenisation SDK - Local Deployment Script
# =============================================================================
# Usage:
#   ./scripts/deploy/local-deploy.sh         # Full deployment
#   ./scripts/deploy/local-deploy.sh --chain # Only start chain
#   ./scripts/deploy/local-deploy.sh --api   # Only start API
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Configuration
# =============================================================================
export CHAIN_ID=${CHAIN_ID:-31337}
export RPC_URL=${RPC_URL:-"http://localhost:8545"}
export DEPLOYER_PRIVATE_KEY=${DEPLOYER_PRIVATE_KEY:-"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"}
export API_URL=${API_URL:-"http://localhost:3001"}

# =============================================================================
# Functions
# =============================================================================

check_dependencies() {
    log_info "Checking dependencies..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker is required but not installed"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is required but not installed"
        exit 1
    fi

    log_success "All dependencies found"
}

start_chain() {
    log_info "Starting local Ethereum chain (Anvil)..."

    cd "$ROOT_DIR"

    # Check if already running
    if curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' "$RPC_URL" > /dev/null 2>&1; then
        log_warn "Chain already running at $RPC_URL"
        return 0
    fi

    # Start chain container
    docker compose up -d chain

    # Wait for chain to be ready
    log_info "Waiting for chain to be ready..."
    for i in {1..30}; do
        if curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' "$RPC_URL" > /dev/null 2>&1; then
            log_success "Chain is ready!"
            return 0
        fi
        sleep 1
    done

    log_error "Chain failed to start"
    exit 1
}

deploy_contracts() {
    log_info "Deploying contracts..."

    cd "$ROOT_DIR/contracts"

    # Check if forge is available
    if command -v forge &> /dev/null; then
        # Deploy using local forge
        forge script script/Deploy.s.sol \
            --rpc-url "$RPC_URL" \
            --private-key "$DEPLOYER_PRIVATE_KEY" \
            --broadcast \
            -vvv
    else
        # Deploy using docker
        docker compose run --rm deployer
    fi

    log_success "Contracts deployed!"
}

start_database() {
    log_info "Starting PostgreSQL database..."

    cd "$ROOT_DIR"
    docker compose up -d postgres

    # Wait for database
    log_info "Waiting for database to be ready..."
    for i in {1..30}; do
        if docker compose exec -T postgres pg_isready -U ahoy -d ahoy_tokenisation > /dev/null 2>&1; then
            log_success "Database is ready!"
            return 0
        fi
        sleep 1
    done

    log_error "Database failed to start"
    exit 1
}

start_redis() {
    log_info "Starting Redis..."

    cd "$ROOT_DIR"
    docker compose up -d redis

    # Wait for Redis
    for i in {1..10}; do
        if docker compose exec -T redis redis-cli ping > /dev/null 2>&1; then
            log_success "Redis is ready!"
            return 0
        fi
        sleep 1
    done

    log_error "Redis failed to start"
    exit 1
}

start_api() {
    log_info "Starting API server..."

    cd "$ROOT_DIR"
    docker compose up -d api

    # Wait for API
    log_info "Waiting for API to be ready..."
    for i in {1..60}; do
        if curl -s "$API_URL/health" > /dev/null 2>&1; then
            log_success "API is ready!"
            return 0
        fi
        sleep 1
    done

    log_error "API failed to start"
    exit 1
}

print_summary() {
    echo ""
    echo "=========================================="
    echo -e "${GREEN}AHOY Tokenisation SDK - Local Deployment${NC}"
    echo "=========================================="
    echo ""
    echo "Services:"
    echo "  Chain (Anvil):  $RPC_URL"
    echo "  API Server:     $API_URL"
    echo "  API Docs:       $API_URL/api/docs"
    echo "  PostgreSQL:     localhost:5432"
    echo "  Redis:          localhost:6379"
    echo ""
    echo "Test Credentials:"
    echo "  API Key:        sk_test_sandbox_key_12345"
    echo "  Org ID:         org_sandbox_default"
    echo ""
    echo "Test Accounts (pre-funded with 10000 ETH):"
    echo "  Account 0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
    echo "  Account 1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
    echo "  Account 2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
    echo ""
    echo "Quick Start:"
    echo "  curl $API_URL/health"
    echo "  curl -H 'X-API-Key: sk_test_sandbox_key_12345' $API_URL/api/v1/tokens"
    echo ""
    echo "Logs:"
    echo "  docker compose logs -f api"
    echo ""
    echo "Stop:"
    echo "  docker compose down"
    echo "=========================================="
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo "=========================================="
    echo "AHOY Tokenisation SDK - Local Deployment"
    echo "=========================================="
    echo ""

    check_dependencies

    case "${1:-all}" in
        --chain)
            start_chain
            ;;
        --contracts)
            deploy_contracts
            ;;
        --api)
            start_database
            start_redis
            start_api
            ;;
        all|*)
            start_chain
            start_database
            start_redis
            deploy_contracts
            start_api
            print_summary
            ;;
    esac
}

main "$@"
