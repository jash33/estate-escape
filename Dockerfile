# Estate Escape - Multi-stage Dockerfile
# Runs TanStack Start (Node) + Python matcher

FROM node:22-slim AS base

# Install Python and dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---------- Python setup ----------
FROM base AS python-deps

COPY scripts/requirements.txt /app/scripts/
WORKDIR /app/scripts

RUN python3 -m venv venv && \
    ./venv/bin/pip install --no-cache-dir -r requirements.txt

# ---------- Node setup ----------
FROM base AS node-deps

COPY app/package*.json /app/app/
WORKDIR /app/app

RUN npm ci

# ---------- Final image ----------
FROM base AS runner

# Copy Python venv
COPY --from=python-deps /app/scripts/venv /app/scripts/venv

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
