#!/usr/bin/env python3
"""
Estate Escape - Entity Matcher

Matches probate decedents to HCAD property records.

Usage:
    python matcher.py --probate-file output/probate_cases.json
    python matcher.py --days 7  # Scrape fresh probate data and match
"""

import argparse
import asyncio
import json
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from rapidfuzz import fuzz

from scrapers.harris_probate import HarrisProbateScraper, ProbateCase
from scrapers.hcad_data import HCADDataLoader


# Output directory
OUTPUT_DIR = Path(__file__).parent / "output"


@dataclass
class PropertyMatch:
    """A potential property match for a probate case."""
    account_number: str
    owner_name: str
    site_address: str
    market_value: Optional[int]
    match_score: int  # 0-100
    match_type: str  # "exact", "fuzzy", "partial"


@dataclass 
class Lead:
    """A probate lead with matched properties."""
    # Probate info
    case_number: str
    court: str
    file_date: str
    status: str
    case_type: str
    decedent_name: str
    
    # Matched properties
    properties: list[PropertyMatch]
    
    # Metadata
    match_count: int
    best_match_score: int
    created_at: str
    
    def to_dict(self):
        return {
            **asdict(self),
            "properties": [asdict(p) for p in self.properties]
        }


class EntityMatcher:
    """Matches probate decedents to property records."""
    
    def __init__(self, hcad_loader: HCADDataLoader):
        self.hcad = hcad_loader
        self._owner_cache = None
        
    def match_decedent(
        self, 
        decedent_name: str,
        min_score: int = 85,
        max_results: int = 10
    ) -> list[PropertyMatch]:
        """
        Find properties potentially owned by a decedent.
        Uses streaming to avoid loading all data into memory.
        
        Args:
            decedent_name: Name from probate filing
            min_score: Minimum fuzzy match score (0-100)
            max_results: Maximum matches to return
            
        Returns:
            List of PropertyMatch objects sorted by score
        """
        if not decedent_name:
            return []
            
        name_upper = decedent_name.upper().strip()
        name_parts = set(name_upper.split())
        matches = []
        
        # Stream through records, using quick filters before expensive fuzzy match
        for record in self.hcad.iter_properties():
            owner = record.get('owner_name', '').upper()
            
            if not owner:
                continue
            
            # Quick pre-filter: check if any name part appears in owner
            # This avoids expensive fuzzy matching for obvious non-matches
            owner_parts = set(owner.split())
            if not name_parts & owner_parts:  # No common words
                continue
            
            # Now do the expensive fuzzy match
            score = fuzz.token_sort_ratio(name_upper, owner)
            
            if score >= min_score:
                match_type = "exact" if score == 100 else "fuzzy"
                
                # Check for partial/substring match
                if name_upper in owner or owner in name_upper:
                    match_type = "partial" if score < 100 else "exact"
                    score = max(score, 90)  # Boost partial matches
                    
                matches.append(PropertyMatch(
                    account_number=record.get('account_number', ''),
                    owner_name=record.get('owner_name', ''),
                    site_address=record.get('site_address', ''),
                    market_value=record.get('market_value'),
                    match_score=int(score),
                    match_type=match_type,
                ))
                
                # Early exit if we have enough high-quality matches
                if len(matches) >= max_results * 3:
                    break
                
        # Sort by score descending
        matches.sort(key=lambda x: x.match_score, reverse=True)
        
        return matches[:max_results]
        
    def process_probate_cases_batch(
        self,
        cases: list[ProbateCase],
        min_score: int = 85,
        max_properties_per_case: int = 5
    ) -> list[Lead]:
        """
        Process all probate cases in a single pass through property data.
        Much more efficient than individual lookups.
        
        Args:
            cases: List of ProbateCase objects
            min_score: Minimum match score
            max_properties_per_case: Max properties per lead
            
        Returns:
            List of Lead objects with matched properties
        """
        # Filter to cases with decedent names
        cases_with_names = [c for c in cases if c.decedent_name]
        print(f"Processing {len(cases_with_names)} cases with decedent names...")
        
        # Build lookup structures
        name_to_case = {}
        name_parts_lookup = {}  # For quick filtering
        matches_by_case = {c.case_number: [] for c in cases_with_names}
        
        for case in cases_with_names:
            name_upper = case.decedent_name.upper().strip()
            name_to_case[name_upper] = case
            name_parts_lookup[name_upper] = set(name_upper.split())
            
        print(f"Scanning property records for matches...")
        record_count = 0
        
        # Single pass through all property records
        for record in self.hcad.iter_properties():
            record_count += 1
            if record_count % 500000 == 0:
                print(f"  Scanned {record_count:,} records...")
                
            owner = record.get('owner_name', '').upper()
            if not owner:
                continue
                
            owner_parts = set(owner.split())
            
            # Check against all decedent names
            for name_upper, case in name_to_case.items():
                # Quick pre-filter
                if not name_parts_lookup[name_upper] & owner_parts:
                    continue
                    
                # Full fuzzy match
                score = fuzz.token_sort_ratio(name_upper, owner)
                
                if score >= min_score:
                    match_type = "exact" if score == 100 else "fuzzy"
                    
                    if name_upper in owner or owner in name_upper:
                        match_type = "partial" if score < 100 else "exact"
                        score = max(score, 90)
                        
                    match = PropertyMatch(
                        account_number=record.get('account_number', ''),
                        owner_name=record.get('owner_name', ''),
                        site_address=record.get('site_address', ''),
                        market_value=record.get('market_value'),
                        match_score=int(score),
                        match_type=match_type,
                    )
                    matches_by_case[case.case_number].append(match)
                    
        print(f"  Scanned {record_count:,} total records")
        
        # Build leads
        leads = []
        for case in cases_with_names:
            matches = matches_by_case[case.case_number]
            matches.sort(key=lambda x: x.match_score, reverse=True)
            matches = matches[:max_properties_per_case]
            
            lead = Lead(
                case_number=case.case_number,
                court=case.court,
                file_date=case.file_date,
                status=case.status,
                case_type=case.case_type,
                decedent_name=case.decedent_name,
                properties=matches,
                match_count=len(matches),
                best_match_score=matches[0].match_score if matches else 0,
                created_at=datetime.now().isoformat(),
            )
            leads.append(lead)
            
        # Sort by best match score
        leads.sort(key=lambda x: x.best_match_score, reverse=True)
        
        return leads
    
    def process_probate_cases(
        self,
        cases: list[ProbateCase],
        min_score: int = 85,
        max_properties_per_case: int = 5
    ) -> list[Lead]:
        """Alias for batch processing."""
        return self.process_probate_cases_batch(cases, min_score, max_properties_per_case)


async def scrape_and_match(
    days: int = 7,
    min_score: int = 85,
) -> list[Lead]:
    """Scrape fresh probate data and match to properties."""
    
    # Calculate date range
    to_date = datetime.now().strftime("%m/%d/%Y")
    from_date = (datetime.now() - timedelta(days=days)).strftime("%m/%d/%Y")
    
    print(f"Scraping probate cases from {from_date} to {to_date}...")
    
    # Scrape probate cases
    async with HarrisProbateScraper(headless=True) as scraper:
        cases = await scraper.search_by_date_range(from_date, to_date)
        
    print(f"Found {len(cases)} probate cases")
    
    # Match to properties
    hcad = HCADDataLoader()
    matcher = EntityMatcher(hcad)
    leads = matcher.process_probate_cases(cases, min_score=min_score)
    
    return leads


def load_probate_file(filepath: Path) -> list[ProbateCase]:
    """Load probate cases from JSON file."""
    with open(filepath) as f:
        data = json.load(f)
        
    cases = []
    for item in data:
        cases.append(ProbateCase(
            case_number=item.get('case_number', ''),
            case_id=item.get('case_id', ''),
            court=item.get('court', ''),
            file_date=item.get('file_date', ''),
            status=item.get('status', ''),
            case_type=item.get('case_type', ''),
            decedent_name=item.get('decedent_name'),
            parties=item.get('parties', []),
            attorneys=item.get('attorneys', []),
        ))
        
    return cases


def main():
    parser = argparse.ArgumentParser(description="Match probate cases to properties")
    parser.add_argument("--probate-file", type=str, help="JSON file with probate cases")
    parser.add_argument("--days", type=int, help="Scrape last N days of probate filings")
    parser.add_argument("--min-score", type=int, default=85, help="Minimum match score")
    parser.add_argument("--output", type=str, help="Output JSON file")
    
    args = parser.parse_args()
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    if args.days:
        # Scrape fresh and match
        leads = asyncio.run(scrape_and_match(days=args.days, min_score=args.min_score))
    elif args.probate_file:
        # Load from file and match
        cases = load_probate_file(Path(args.probate_file))
        print(f"Loaded {len(cases)} cases from {args.probate_file}")
        
        hcad = HCADDataLoader()
        matcher = EntityMatcher(hcad)
        leads = matcher.process_probate_cases(cases, min_score=args.min_score)
    else:
        parser.print_help()
        return
        
    # Summary
    leads_with_matches = [l for l in leads if l.match_count > 0]
    print(f"\n{'='*50}")
    print(f"MATCHING COMPLETE")
    print(f"{'='*50}")
    print(f"Total leads: {len(leads)}")
    print(f"Leads with property matches: {len(leads_with_matches)}")
    print(f"Match rate: {len(leads_with_matches)/len(leads)*100:.1f}%" if leads else "N/A")
    
    # Show top matches
    if leads_with_matches:
        print(f"\nTop matches:")
        for lead in leads_with_matches[:5]:
            print(f"\n  {lead.decedent_name} (Case {lead.case_number})")
            print(f"  Case Type: {lead.case_type}")
            for prop in lead.properties[:2]:
                val = f"${prop.market_value:,}" if prop.market_value else "N/A"
                print(f"    → [{prop.match_score}%] {prop.owner_name}")
                print(f"       {prop.site_address} | Value: {val}")
                
    # Save output
    if args.output:
        output_path = Path(args.output)
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = OUTPUT_DIR / f"leads_{timestamp}.json"
        
    output_data = [l.to_dict() for l in leads]
    with open(output_path, 'w') as f:
        json.dump(output_data, f, indent=2)
        
    print(f"\nResults saved to: {output_path}")
    
    return leads


if __name__ == "__main__":
    main()
