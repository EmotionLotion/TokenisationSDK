# =============================================================================
# AHOY Tokenisation Console UI - Dockerfile
# =============================================================================

FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS builder
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Production stage - serve static files
FROM node:20-alpine AS production
WORKDIR /app

RUN npm install -g serve@14

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 ahoy

COPY --from=builder /app/dist ./dist

USER ahoy

EXPOSE 5173

CMD ["serve", "-s", "dist", "-l", "5173"]
