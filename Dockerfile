# RecVerse - Multi-stage Dockerfile
# Stage 1: Build dependencies
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (bcrypt, etc.)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Stage 2: Production runtime
FROM node:20-alpine AS runner

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    postgresql-client \
    tzdata \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S recverse -u 1001 -G nodejs

# Copy built dependencies from builder
COPY --from=builder --chown=recverse:nodejs /app/node_modules ./node_modules

# Copy application source
COPY --chown=recverse:nodejs . .

# Create storage directory
RUN mkdir -p storage && chown -R recverse:nodejs storage

# Switch to non-root user
USER recverse

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})" || exit 1

# Start application
CMD ["npm", "start"]