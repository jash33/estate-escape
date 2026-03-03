# Estate Escape

Probate lead generator for Harris County real estate investors.

## Quick Start (Docker) 🐳

```bash
# Clone and run
git clone https://github.com/jash33/estate-escape.git
cd estate-escape
docker compose up --build
```

Open **http://localhost:3000**

First run downloads ~200MB of HCAD property data. Subsequent runs are fast.

### Useful Commands

```bash
# Run in background
docker compose up -d --build

# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild after code changes
docker compose up --build
```

## Development (without Docker)

Requires Node.js 22+ and Python 3.11+

```bash
# Frontend (terminal 1)
cd app
npm install
npm run dev

# Python setup (terminal 2)
cd scripts
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Repository Structure

```
estate-escape/
├── app/              # TanStack Start frontend
├── scripts/          # Python scrapers + matcher
│   ├── scrapers/     # Harris County + HCAD scrapers
│   ├── data/         # HCAD bulk data (gitignored)
│   └── output/       # Generated leads JSON
├── Dockerfile        # Container build
└── docker-compose.yml
```

## How It Works

1. **Scrape** - Fetches recent probate filings from Harris County District Clerk
2. **Match** - Fuzzy matches decedent names against 1.6M HCAD property records
3. **Display** - Shows leads with property values, addresses, match confidence

## Data Sources

- **Harris County Probate:** `cclerk.hctx.net`
- **Harris County Appraisal (HCAD):** `hcad.org` (bulk data)

---

*Built for Texas RE investors* 🤠
