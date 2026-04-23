# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (layer cache — only reinstalls on package change)
COPY package*.json ./

# FIXED: npm ci requires package-lock.json in sync — use npm install instead
# FIXED: --only=production=false was invalid syntax
RUN npm install

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Security: run as non-root user
RUN addgroup -S stockscope && adduser -S stockscope -G stockscope

WORKDIR /app

# Copy only production deps
COPY package*.json ./
# FIXED: --only=production deprecated in npm 7+ → use --omit=dev
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R stockscope:stockscope /app
USER stockscope

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

EXPOSE 3001

ENV NODE_ENV=production

# FIXED: added -r dotenv/config so .env loads before any module reads process.env
CMD ["node", "-r", "dotenv/config", "dist/server.js"]
