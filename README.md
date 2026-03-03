# Estate Escape

Lead generation platform for real estate investors targeting probate properties.

## Repository Structure

```
estate-escape/
├── scripts/          # Data scrapers and processing scripts
│   └── scrapers/     # Web scrapers for county data
├── frontend/         # Web dashboard (Next.js)
├── cdk/              # AWS CDK infrastructure
└── docs/             # Documentation
```

## Quick Start

### Scripts

```bash
cd scripts
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run probate scraper
python scrapers/harris_probate.py
```

## Data Sources

- **Harris County Probate:** `cclerk.hctx.net`
- **Harris County Appraisal (HCAD):** `hcad.org`

## MVP Sprint Plan

- Week 1: Scrapers + Database
- Week 2: Entity matching
- Week 3: Dashboard
- Week 4: Polish + Demo

