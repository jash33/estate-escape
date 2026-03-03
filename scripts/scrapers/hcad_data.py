#!/usr/bin/env python3
"""
HCAD Property Data Loader

Downloads and loads Harris County Appraisal District bulk data files.
Source: https://hcad.org/pdata/pdata-property-downloads.html

Usage:
    python hcad_data.py --download  # Download latest data files
    python hcad_data.py --search "SMITH JOHN"  # Search by owner name
"""

import argparse
import os
import zipfile
from collections import defaultdict
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional, Generator
import json

import httpx
from rapidfuzz import fuzz
from tqdm import tqdm


# HCAD data URLs (2025 certified values)
HCAD_BASE_URL = "https://download.hcad.org/data/CAMA/2025"
HCAD_FILES = {
    "real_acct_owner": f"{HCAD_BASE_URL}/Real_acct_owner.zip",
    "building_land": f"{HCAD_BASE_URL}/Real_building_land.zip",
}

# Data directory
DATA_DIR = Path(__file__).parent.parent / "data" / "hcad"


@dataclass
class Property:
    """Represents a property record from HCAD."""
    account_number: str
    owner_name: str
    site_address: str
    city: str
    market_value: Optional[int] = None
    land_value: Optional[int] = None
    building_value: Optional[int] = None
    legal_description: str = ""
    year_improved: Optional[int] = None
    building_area: Optional[int] = None
    land_area: Optional[float] = None
    
    def to_dict(self):
        return asdict(self)


class HCADDataLoader:
    """Loads and queries HCAD property data."""
    
    def __init__(self, data_dir: Path = DATA_DIR):
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        # Cached owner lookup
        self._owners_cache: dict[str, str] = {}
        self._owners_loaded = False
        
    def download_file(self, url: str, filename: str) -> Path:
        """Download a file from HCAD."""
        zip_path = self.data_dir / filename
        
        print(f"Downloading {url}...")
        with httpx.stream("GET", url, follow_redirects=True, timeout=300) as response:
            response.raise_for_status()
            total = int(response.headers.get("content-length", 0))
            
            with open(zip_path, "wb") as f:
                with tqdm(total=total, unit="B", unit_scale=True, desc=filename) as pbar:
                    for chunk in response.iter_bytes(chunk_size=8192):
                        f.write(chunk)
                        pbar.update(len(chunk))
                        
        return zip_path
        
    def extract_zip(self, zip_path: Path) -> list[Path]:
        """Extract a zip file."""
        print(f"Extracting {zip_path.name}...")
        extracted = []
        
        with zipfile.ZipFile(zip_path, 'r') as zf:
            for name in zf.namelist():
                zf.extract(name, self.data_dir)
                extracted.append(self.data_dir / name)
                print(f"  Extracted: {name}")
                
        return extracted
        
    def download_all(self):
        """Download and extract all HCAD data files."""
        for name, url in HCAD_FILES.items():
            filename = f"{name}.zip"
            zip_path = self.download_file(url, filename)
            self.extract_zip(zip_path)
            
            # Clean up zip file to save space
            zip_path.unlink()
            
        print("\nDownload complete!")
        self._list_data_files()
        
    def _list_data_files(self):
        """List available data files."""
        print("\nAvailable data files:")
        for f in sorted(self.data_dir.glob("*.txt")):
            size_mb = f.stat().st_size / (1024 * 1024)
            print(f"  {f.name}: {size_mb:.1f} MB")
            
    def _load_owners(self):
        """Load owner names from owners.txt into cache."""
        if self._owners_loaded:
            return
            
        owners_file = self.data_dir / "owners.txt"
        if not owners_file.exists():
            print(f"Warning: {owners_file} not found")
            self._owners_loaded = True
            return
            
        print("Loading owner names...")
        count = 0
        with open(owners_file, 'r', encoding='latin-1', errors='ignore') as f:
            # Skip header: acct, ln_num, name, aka, pct_own
            next(f, None)
            
            for line in f:
                count += 1
                if count % 300000 == 0:
                    print(f"  Loaded {count:,} records...")
                fields = line.strip().split('\t')
                if len(fields) >= 3:
                    acct = fields[0].strip()
                    name = fields[2].strip()
                    # Only store first owner (ln_num=1) or if not yet stored
                    if acct not in self._owners_cache:
                        self._owners_cache[acct] = name
                        
        print(f"  Loaded {len(self._owners_cache):,} owner records")
        self._owners_loaded = True
            
    def _parse_int(self, value: str) -> Optional[int]:
        """Parse integer value, handling empty/invalid strings."""
        if not value or not value.strip():
            return None
        try:
            return int(float(value.replace(',', '').strip()))
        except:
            return None
            
    def _parse_float(self, value: str) -> Optional[float]:
        """Parse float value, handling empty/invalid strings."""
        if not value or not value.strip():
            return None
        try:
            return float(value.replace(',', '').strip())
        except:
            return None
            
    def _parse_real_acct_line(self, line: str) -> Optional[dict]:
        """
        Parse a line from real_acct.txt.
        
        Key columns (0-indexed):
        0: acct - Account number
        17: site_addr_1 - Site address
        18: site_addr_2 - City
        33: yr_impr - Year improved
        38: bld_ar - Building area (sq ft)
        40: acreage - Land acreage
        43: land_val - Land value
        44: bld_val - Building value
        49: tot_mkt_val - Total market value
        66: lgl_1 - Legal description
        """
        try:
            fields = line.strip().split('\t')
            if len(fields) < 50:
                return None
                
            acct = fields[0].strip()
            
            return {
                'account_number': acct,
                'site_address': fields[17].strip() if len(fields) > 17 else '',
                'city': fields[18].strip() if len(fields) > 18 else '',
                'year_improved': self._parse_int(fields[33]) if len(fields) > 33 else None,
                'building_area': self._parse_int(fields[38]) if len(fields) > 38 else None,
                'acreage': self._parse_float(fields[40]) if len(fields) > 40 else None,
                'land_value': self._parse_int(fields[43]) if len(fields) > 43 else None,
                'building_value': self._parse_int(fields[44]) if len(fields) > 44 else None,
                'market_value': self._parse_int(fields[49]) if len(fields) > 49 else None,
                'legal_description': fields[66].strip() if len(fields) > 66 else '',
            }
        except Exception as e:
            return None
            
    def iter_properties(self) -> Generator[dict, None, None]:
        """Iterate over all property records with owner names."""
        # Load owners first
        self._load_owners()
        
        acct_file = self.data_dir / "real_acct.txt"
        if not acct_file.exists():
            raise FileNotFoundError(f"{acct_file} not found. Run --download first.")
            
        print(f"Reading {acct_file.name}...")
        
        with open(acct_file, 'r', encoding='latin-1', errors='ignore') as f:
            # Skip header
            next(f, None)
            
            for line in f:
                record = self._parse_real_acct_line(line)
                if record:
                    # Add owner name from cache
                    acct = record['account_number']
                    record['owner_name'] = self._owners_cache.get(acct, '')
                    yield record
                    
    def search_by_owner_name(
        self, 
        name: str, 
        min_score: int = 80,
        limit: int = 50
    ) -> list[tuple[dict, int, str]]:
        """
        Search for properties by owner name using fuzzy matching.
        
        Args:
            name: Owner name to search for
            min_score: Minimum fuzzy match score (0-100)
            limit: Maximum results to return
            
        Returns:
            List of (property_dict, match_score, match_type) tuples
        """
        name_upper = name.upper().strip()
        # Create normalized version for matching
        name_tokens = set(name_upper.split())
        
        results = []
        
        print(f"Searching for owner: {name}")
        
        for record in self.iter_properties():
            owner = record.get('owner_name', '').upper()
            
            if not owner:
                continue
                
            # Check for exact match first
            if name_upper == owner:
                results.append((record, 100, 'exact'))
                continue
                
            # Check token sort ratio for fuzzy match
            score = fuzz.token_sort_ratio(name_upper, owner)
            
            if score >= min_score:
                match_type = 'exact' if score == 100 else 'fuzzy'
                results.append((record, score, match_type))
                
        # Sort by score descending
        results.sort(key=lambda x: x[1], reverse=True)
        
        return results[:limit]
        
    def search_exact(self, name: str) -> list[dict]:
        """Search for exact owner name matches."""
        name_upper = name.upper().strip()
        results = []
        
        for record in self.iter_properties():
            owner = record.get('owner_name', '').upper()
            
            if name_upper in owner or owner in name_upper:
                results.append(record)
                
        return results


def format_currency(value: Optional[int]) -> str:
    """Format integer as currency string."""
    if value is None:
        return "N/A"
    return f"${value:,}"


def main():
    parser = argparse.ArgumentParser(description="HCAD Property Data Loader")
    parser.add_argument("--download", action="store_true", help="Download HCAD data files")
    parser.add_argument("--search", type=str, help="Search by owner name")
    parser.add_argument("--exact", action="store_true", help="Use exact matching instead of fuzzy")
    parser.add_argument("--min-score", type=int, default=80, help="Minimum fuzzy match score")
    parser.add_argument("--limit", type=int, default=20, help="Max results to return")
    parser.add_argument("--output", type=str, help="Output JSON file")
    
    args = parser.parse_args()
    
    loader = HCADDataLoader()
    
    if args.download:
        loader.download_all()
        return
        
    if args.search:
        if args.exact:
            results = loader.search_exact(args.search)
            results_with_scores = [(r, 100, 'exact') for r in results]
        else:
            results_with_scores = loader.search_by_owner_name(
                args.search, 
                min_score=args.min_score,
                limit=args.limit
            )
            
        print(f"\nFound {len(results_with_scores)} matches:\n")
        
        for record, score, match_type in results_with_scores[:10]:
            print(f"[{score}%] {record['owner_name']}")
            print(f"       Account: {record['account_number']}")
            print(f"       Address: {record['site_address']}, {record['city']}")
            print(f"       Value: {format_currency(record['market_value'])}")
            if record.get('building_area'):
                print(f"       Building: {record['building_area']:,} sqft")
            if record.get('acreage'):
                print(f"       Land: {record['acreage']:.2f} acres")
            print()
            
        if args.output:
            output_data = [
                {"record": r, "score": s, "match_type": t} 
                for r, s, t in results_with_scores
            ]
            with open(args.output, 'w') as f:
                json.dump(output_data, f, indent=2)
            print(f"Results saved to {args.output}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
