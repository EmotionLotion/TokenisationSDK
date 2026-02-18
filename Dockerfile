# Tokenisation SDK - Production Docker Image
# Multi-stage build for minimal image size

# ============================================================================
# Stage 1: Build
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies and enable corepack for pnpm
RUN apk add --no-cache python3 make g++ && corepack enable

# Copy package files and workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY sdk/package.json ./sdk/
COPY server/package.json ./server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY sdk ./sdk
COPY server ./server
COPY tsconfig.json ./

# Build SDK and server
RUN pnpm --filter sdk run build
RUN pnpm --filter @tokenisation/server run build

# Prune dev dependencies
RUN pnpm prune --prod

# ============================================================================
# Stage 2: Production
# ============================================================================
FROM node:20-alpine AS production

WORKDIR /app

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built artifacts
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/sdk/dist ./sdk/dist
COPY --from=builder --chown=nodejs:nodejs /app/sdk/package.json ./sdk/
COPY --from=builder --chown=nodejs:nodejs /app/server/dist ./server/dist
COPY --from=builder --chown=nodejs:nodejs /app/server/package.json ./server/

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Switch to non-root user
USER nodejs

# Start server
CMD ["node", "server/dist/index.js"]

# ============================================================================
# Stage 3: Development
# ============================================================================
FROM node:20-alpine AS development

WORKDIR /app

# Install development tools and enable corepack for pnpm
RUN apk add --no-cache python3 make g++ git && corepack enable

# Copy package files and workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY sdk/package.json ./sdk/
COPY server/package.json ./server/

RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Set environment
ENV NODE_ENV=development

# Expose ports (server + debug)
EXPOSE 3000 9229

# Start with hot reload
CMD ["pnpm", "--filter", "@tokenisation/server", "run", "dev"]
