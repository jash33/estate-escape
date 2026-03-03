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
import csv
import os
import re
import zipfile
from dataclasses import dataclass, asdict
from datetime import datetime
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
    "ownership_history": f"{HCAD_BASE_URL}/Real_acct_ownership_history.zip",
    "building_land": f"{HCAD_BASE_URL}/Real_building_land.zip",
    "jur_exempt": f"{HCAD_BASE_URL}/Real_jur_exempt.zip",
}

# Data directory
DATA_DIR = Path(__file__).parent.parent / "data" / "hcad"


@dataclass
class Property:
    """Represents a property record from HCAD."""
    account_number: str
    owner_name: str
    owner_address: str
    owner_city_state_zip: str
    property_address: str
    legal_description: str
    neighborhood: str
    market_value: Optional[int] = None
    land_value: Optional[int] = None
    improvement_value: Optional[int] = None
    year_built: Optional[int] = None
    living_area: Optional[int] = None
    land_area: Optional[float] = None
    
    def to_dict(self):
        return asdict(self)


class HCADDataLoader:
    """Loads and queries HCAD property data."""
    
    def __init__(self, data_dir: Path = DATA_DIR):
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        # File paths
        self.real_acct_file = self.data_dir / "real_acct.txt"
        self.building_res_file = self.data_dir / "building_res.txt"
        
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
            
    def _parse_real_acct_line(self, line: str) -> Optional[dict]:
        """
        Parse a line from the real_acct.txt file.
        
        The file is tab-delimited with columns:
        ACCT, YR, OWNER_NAME, ADDR1, ADDR2, ADDR3, STATE_CD, ZIP, ZIP4,
        LEGAL1, LEGAL2, LEGAL3, LEGAL4, SITE_ADDR_1, SITE_ADDR_2, SITE_ADDR_3,
        NEIGHBORHOOD_CD, NEIGHBORHOOD_NAME, MARKET_VAL, LAND_VAL, IMPR_VAL, ...
        """
        try:
            fields = line.strip().split('\t')
            if len(fields) < 20:
                return None
                
            # Parse market value
            market_val = None
            if len(fields) > 18 and fields[18].strip():
                try:
                    market_val = int(float(fields[18].replace(',', '')))
                except:
                    pass
                    
            land_val = None
            if len(fields) > 19 and fields[19].strip():
                try:
                    land_val = int(float(fields[19].replace(',', '')))
                except:
                    pass
                    
            impr_val = None
            if len(fields) > 20 and fields[20].strip():
                try:
                    impr_val = int(float(fields[20].replace(',', '')))
                except:
                    pass
                
            return {
                'account_number': fields[0].strip(),
                'year': fields[1].strip() if len(fields) > 1 else '',
                'owner_name': fields[2].strip() if len(fields) > 2 else '',
                'owner_addr1': fields[3].strip() if len(fields) > 3 else '',
                'owner_addr2': fields[4].strip() if len(fields) > 4 else '',
                'owner_addr3': fields[5].strip() if len(fields) > 5 else '',
                'state': fields[6].strip() if len(fields) > 6 else '',
                'zip': fields[7].strip() if len(fields) > 7 else '',
                'legal1': fields[9].strip() if len(fields) > 9 else '',
                'site_addr': fields[13].strip() if len(fields) > 13 else '',
                'neighborhood': fields[17].strip() if len(fields) > 17 else '',
                'market_value': market_val,
                'land_value': land_val,
                'improvement_value': impr_val,
            }
        except Exception as e:
            return None
            
    def iter_properties(self) -> Generator[dict, None, None]:
        """Iterate over all property records."""
        # Find the real_acct file (might have different names)
        acct_files = list(self.data_dir.glob("*acct*.txt")) + list(self.data_dir.glob("*real*.txt"))
        
        if not acct_files:
            raise FileNotFoundError(f"No account files found in {self.data_dir}. Run --download first.")
            
        acct_file = acct_files[0]
        print(f"Reading {acct_file.name}...")
        
        with open(acct_file, 'r', encoding='latin-1', errors='ignore') as f:
            # Skip header
            next(f, None)
            
            for line in f:
                record = self._parse_real_acct_line(line)
                if record:
                    yield record
                    
    def search_by_owner_name(
        self, 
        name: str, 
        min_score: int = 80,
        limit: int = 50
    ) -> list[tuple[dict, int]]:
        """
        Search for properties by owner name using fuzzy matching.
        
        Args:
            name: Owner name to search for
            min_score: Minimum fuzzy match score (0-100)
            limit: Maximum results to return
            
        Returns:
            List of (property_dict, match_score) tuples
        """
        name_upper = name.upper().strip()
        results = []
        
        print(f"Searching for owner: {name}")
        
        for record in self.iter_properties():
            owner = record.get('owner_name', '').upper()
            
            if not owner:
                continue
                
            # Calculate fuzzy match score
            score = fuzz.token_sort_ratio(name_upper, owner)
            
            if score >= min_score:
                results.append((record, score))
                
                # Early exit if we have enough high-quality matches
                if len(results) >= limit * 2:
                    break
                    
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
            results_with_scores = [(r, 100) for r in results]
        else:
            results_with_scores = loader.search_by_owner_name(
                args.search, 
                min_score=args.min_score,
                limit=args.limit
            )
            
        print(f"\nFound {len(results_with_scores)} matches:\n")
        
        for record, score in results_with_scores[:10]:
            print(f"[{score}%] {record['owner_name']}")
            print(f"       Account: {record['account_number']}")
            print(f"       Address: {record['site_addr']}")
            print(f"       Value: ${record['market_value']:,}" if record['market_value'] else "       Value: N/A")
            print()
            
        if args.output:
            output_data = [{"record": r, "score": s} for r, s in results_with_scores]
            with open(args.output, 'w') as f:
                json.dump(output_data, f, indent=2)
            print(f"Results saved to {args.output}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
