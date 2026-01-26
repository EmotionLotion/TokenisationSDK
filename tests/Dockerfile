# =============================================================================
# AHOY Conformance Test Suite - Dockerfile
# =============================================================================

FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy test files
COPY . .

# Run tests
CMD ["npm", "run", "test:conformance"]
