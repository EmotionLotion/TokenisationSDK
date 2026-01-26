# =============================================================================
# AHOY Contracts Deployer - Dockerfile
# =============================================================================

FROM ghcr.io/foundry-rs/foundry:latest

WORKDIR /app

# Copy contract files
COPY . .

# Install dependencies
RUN forge install

# Build contracts
RUN forge build

# Default command
CMD ["forge", "script", "script/Deploy.s.sol", "--rpc-url", "$RPC_URL", "--broadcast"]
