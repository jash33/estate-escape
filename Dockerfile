# Estate Escape - Multi-stage Dockerfile
# Runs TanStack Start (Node) + Python matcher

FROM node:22-slim AS base

# Install Python and Playwright system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    # Playwright dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---------- Python setup ----------
FROM base AS python-deps

COPY scripts/requirements.txt /app/scripts/
WORKDIR /app/scripts

RUN python3 -m venv venv && \
    ./venv/bin/pip install --no-cache-dir -r requirements.txt && \
    ./venv/bin/playwright install chromium

# ---------- Node setup ----------
FROM base AS node-deps

COPY app/package*.json /app/app/
WORKDIR /app/app

RUN npm ci

# ---------- Final image ----------
FROM base AS runner

# Copy Python venv
COPY --from=python-deps /app/scripts/venv /app/scripts/venv

# Copy Playwright browsers
COPY --from=python-deps /root/.cache/ms-playwright /root/.cache/ms-playwright

# Copy Node modules
COPY --from=node-deps /app/app/node_modules /app/app/node_modules

# Copy source code
COPY scripts /app/scripts
COPY app /app/app

# Create output directory
RUN mkdir -p /app/scripts/output

WORKDIR /app/app

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1

# Start the app
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
