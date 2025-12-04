FROM node:18-alpine

# Install pnpm and curl (for healthcheck)
RUN npm install -g pnpm@10.22.0 && \
    apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./

# Copy workspace packages (needed for workspace linking)
COPY packages/ ./packages/
COPY apps/watch-indexer/package.json ./apps/watch-indexer/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/watch-indexer/ ./apps/watch-indexer/
COPY packages/ ./packages/

# Build dependencies first, then watch-indexer
RUN pnpm turbo build --filter=@arkswap/watch-indexer...

# Expose port
EXPOSE 3002

# Run the application
CMD ["node", "apps/watch-indexer/dist/main.js"]

