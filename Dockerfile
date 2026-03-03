# Estate Escape - Dockerfile
# Runs TanStack Start (Node) + Python matcher with Playwright

FROM mcr.microsoft.com/playwright/python:v1.49.0-noble

# Install Node.js 22 and python3-venv
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs python3-venv && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---------- Python setup ----------
COPY scripts/requirements.txt /app/scripts/
WORKDIR /app/scripts

RUN python3 -m venv venv && \
    ./venv/bin/pip install --no-cache-dir -r requirements.txt && \
    ./venv/bin/playwright install chromium

# ---------- Node setup ----------
COPY app/package*.json /app/app/
WORKDIR /app/app

RUN npm ci

# ---------- Copy source ----------
WORKDIR /app
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
