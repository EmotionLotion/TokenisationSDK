#!/bin/bash
# =============================================================================
# Testnet Deployment Script
# =============================================================================
# Deploy contracts and infrastructure to various testnets
#
# Usage:
#   ./scripts/deploy-testnet.sh [network] [options]
#
# Networks:
#   sepolia     - Ethereum Sepolia testnet
#   base-sepolia - Base Sepolia testnet
#   arbitrum-sepolia - Arbitrum Sepolia testnet
#   polygon-amoy - Polygon Amoy testnet
#
# Options:
#   --verify    - Verify contracts on block explorer
#   --dry-run   - Simulate deployment without executing
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
NETWORK="${1:-sepolia}"
VERIFY=false
DRY_RUN=false

# Parse options
shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        --verify)
            VERIFY=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Configuration per network
case $NETWORK in
    sepolia)
        CHAIN_ID=11155111
        RPC_URL="${SEPOLIA_RPC_URL:-https://rpc.sepolia.org}"
        EXPLORER_URL="https://sepolia.etherscan.io"
        EXPLORER_API="${ETHERSCAN_API_KEY:-}"
        ;;
    base-sepolia)
        CHAIN_ID=84532
        RPC_URL="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"
        EXPLORER_URL="https://sepolia.basescan.org"
        EXPLORER_API="${BASESCAN_API_KEY:-}"
        ;;
    arbitrum-sepolia)
        CHAIN_ID=421614
        RPC_URL="${ARBITRUM_SEPOLIA_RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"
        EXPLORER_URL="https://sepolia.arbiscan.io"
        EXPLORER_API="${ARBISCAN_API_KEY:-}"
        ;;
    polygon-amoy)
        CHAIN_ID=80002
        RPC_URL="${POLYGON_AMOY_RPC_URL:-https://rpc-amoy.polygon.technology}"
        EXPLORER_URL="https://amoy.polygonscan.com"
        EXPLORER_API="${POLYGONSCAN_API_KEY:-}"
        ;;
    *)
        echo -e "${RED}Unknown network: $NETWORK${NC}"
        echo "Supported networks: sepolia, base-sepolia, arbitrum-sepolia, polygon-amoy"
        exit 1
        ;;
esac

# Check required environment variables
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo -e "${RED}Error: DEPLOYER_PRIVATE_KEY environment variable is required${NC}"
    exit 1
fi

# Print configuration
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Tokenisation SDK - Testnet Deployment${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "Network:      ${GREEN}$NETWORK${NC}"
echo -e "Chain ID:     ${GREEN}$CHAIN_ID${NC}"
echo -e "RPC URL:      ${GREEN}$RPC_URL${NC}"
echo -e "Explorer:     ${GREEN}$EXPLORER_URL${NC}"
echo -e "Verify:       ${GREEN}$VERIFY${NC}"
echo -e "Dry Run:      ${GREEN}$DRY_RUN${NC}"
echo ""

# Check deployer balance
echo -e "${YELLOW}Checking deployer balance...${NC}"
DEPLOYER_ADDRESS=$(cast wallet address --private-key $DEPLOYER_PRIVATE_KEY)
BALANCE=$(cast balance $DEPLOYER_ADDRESS --rpc-url $RPC_URL)
BALANCE_ETH=$(cast from-wei $BALANCE)

echo -e "Deployer:     ${GREEN}$DEPLOYER_ADDRESS${NC}"
echo -e "Balance:      ${GREEN}$BALANCE_ETH ETH${NC}"
echo ""

# Check minimum balance (0.1 ETH)
MIN_BALANCE="100000000000000000"
if [ $(echo "$BALANCE < $MIN_BALANCE" | bc -l 2>/dev/null || echo "0") -eq 1 ]; then
    echo -e "${RED}Warning: Low balance. Deployment may fail.${NC}"
    echo -e "${YELLOW}Get testnet ETH from a faucet:${NC}"
    case $NETWORK in
        sepolia)
            echo "  https://sepoliafaucet.com/"
            echo "  https://www.alchemy.com/faucets/ethereum-sepolia"
            ;;
        base-sepolia)
            echo "  https://www.coinbase.com/faucets/base-ethereum-goerli-faucet"
            ;;
        arbitrum-sepolia)
            echo "  https://faucet.quicknode.com/arbitrum/sepolia"
            ;;
        polygon-amoy)
            echo "  https://faucet.polygon.technology/"
            ;;
    esac
    echo ""
fi

# Create deployment directory
DEPLOY_DIR="deployments/$NETWORK"
mkdir -p $DEPLOY_DIR

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN - Simulating deployment...${NC}"
    echo ""
fi

# Deploy contracts
echo -e "${YELLOW}Deploying contracts...${NC}"
cd contracts

FORGE_ARGS="--rpc-url $RPC_URL --private-key $DEPLOYER_PRIVATE_KEY"

if [ "$DRY_RUN" = true ]; then
    FORGE_ARGS="$FORGE_ARGS --dry-run"
fi

if [ "$VERIFY" = true ] && [ -n "$EXPLORER_API" ]; then
    FORGE_ARGS="$FORGE_ARGS --verify --etherscan-api-key $EXPLORER_API"
fi

# Run deployment script
forge script script/Deploy.s.sol $FORGE_ARGS --broadcast

# Save deployment info
DEPLOYMENT_FILE="../$DEPLOY_DIR/deployment.json"

if [ "$DRY_RUN" = false ]; then
    # Extract deployed addresses from broadcast
    BROADCAST_FILE="broadcast/Deploy.s.sol/$CHAIN_ID/run-latest.json"

    if [ -f "$BROADCAST_FILE" ]; then
        # Parse deployment addresses
        cat > "$DEPLOYMENT_FILE" << EOF
{
  "network": "$NETWORK",
  "chainId": $CHAIN_ID,
  "deployer": "$DEPLOYER_ADDRESS",
  "deployedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "explorer": "$EXPLORER_URL",
  "contracts": $(cat $BROADCAST_FILE | jq '.transactions | map(select(.transactionType == "CREATE")) | map({(.contractName): .contractAddress}) | add')
}
EOF
        echo -e "${GREEN}Deployment info saved to $DEPLOYMENT_FILE${NC}"
    fi
fi

cd ..

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

if [ "$DRY_RUN" = false ] && [ -f "$DEPLOYMENT_FILE" ]; then
    echo -e "${YELLOW}Deployed Contracts:${NC}"
    cat "$DEPLOYMENT_FILE" | jq -r '.contracts | to_entries[] | "  \(.key): \(.value)"'
    echo ""
    echo -e "${YELLOW}View on explorer:${NC}"
    cat "$DEPLOYMENT_FILE" | jq -r '.contracts | to_entries[] | "  \(.key): '"$EXPLORER_URL"'/address/\(.value)"'
fi

echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Update .env with deployed contract addresses"
echo "  2. Run integration tests: npm run test:integration"
echo "  3. Deploy API server: docker-compose up -d api"
echo ""
