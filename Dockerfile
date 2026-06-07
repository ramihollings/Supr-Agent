# Use the official Node.js 20 Alpine base image
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js telemetry can be disabled during build
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Pre-install Chromium runtime libraries, bash, and optional download tooling.
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    bash \
    curl \
    openssl

# The standalone server only needs the Node runtime. Remove package-manager
# tooling from the final image to reduce attack surface and avoid shipping
# dependencies that are never executed in production.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg

# CloakBrowser can be supplied as a verified build argument. By default, use the
# packaged Chromium wrapper so production builds never fetch unsigned binaries.
ARG CLOAKBROWSER_DOWNLOAD_URL=""
ARG CLOAKBROWSER_SHA256=""
RUN mkdir -p /usr/bin && \
    if [ -n "$CLOAKBROWSER_DOWNLOAD_URL" ]; then \
      curl -fsSL -o /usr/bin/cloakbrowser "$CLOAKBROWSER_DOWNLOAD_URL" && \
      if [ -n "$CLOAKBROWSER_SHA256" ]; then \
        echo "$CLOAKBROWSER_SHA256  /usr/bin/cloakbrowser" | sha256sum -c -; \
      fi; \
    fi && \
    if [ ! -s /usr/bin/cloakbrowser ]; then \
      echo '#!/bin/bash' > /usr/bin/cloakbrowser && \
      echo 'exec chromium-browser --disable-blink-features=AutomationControlled "$@"' >> /usr/bin/cloakbrowser; \
    fi && \
    chmod +x /usr/bin/cloakbrowser

# Configure CloakBrowser path environment variable
ENV CLOAKBROWSER_PATH="/usr/bin/cloakbrowser"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone build from builder phase
COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Next standalone tracing misses this dynamically loaded Playwright manifest.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/playwright-core/browsers.json ./node_modules/playwright-core/browsers.json

# Execution workspaces are ephemeral. Durable artifacts are uploaded to GCS.
RUN mkdir -p /app/.agents && chown nextjs:nodejs /app/.agents
RUN mkdir -p /app/supr_workspaces && chown nextjs:nodejs /app/supr_workspaces

USER nextjs

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
CMD ["node", "server.js"]
