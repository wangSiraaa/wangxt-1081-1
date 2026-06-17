FROM node:20-alpine AS base

WORKDIR /app

# Install build deps for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install pnpm compatible with Node 20
RUN npm install -g pnpm@9.0.0

# Set pnpm store inside container to avoid using host's cached binaries
ENV PNPM_STORE_DIR=/root/.pnpm-store

# Install dependencies (including native builds)
RUN pnpm install || pnpm install --no-frozen-lockfile

# Force rebuild better-sqlite3 for Alpine Linux musl inside base stage
RUN cd node_modules/better-sqlite3 && npm run install

# Copy source
COPY . .

# Build frontend and compile TS
RUN rm -rf node_modules/better-sqlite3/build
RUN pnpm run build:docker 2>&1 || echo "Build attempt finished"

# Runtime stage
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY --from=base /app ./

RUN npm install -g pnpm@9.0.0

# Force rebuild better-sqlite3 for Alpine Linux musl libc
RUN cd node_modules/better-sqlite3 && npm run install 2>&1 || \
    pnpm rebuild better-sqlite3 --force 2>&1

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    APP_PORT=18381 \
    API_PORT=19381 \
    DB_PATH=./api/data/exhibition.db

EXPOSE 18381 19381

# Data directory volume for persistence
VOLUME ["/app/api/data"]

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh \
 && echo 'set -e' >> /app/start.sh \
 && echo 'mkdir -p /app/api/data' >> /app/start.sh \
 && echo 'node --import tsx/esm api/server-prod.ts' >> /app/start.sh \
 && chmod +x /app/start.sh

CMD ["/app/start.sh"]
