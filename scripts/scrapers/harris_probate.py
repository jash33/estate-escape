#!/usr/bin/env python3
"""
Harris County Probate Court Scraper

Scrapes probate case filings from Harris County District Clerk website.
Source: https://cclerk.hctx.net/Applications/WebSearch/CourtSearch.aspx?CaseType=Probate

Usage:
    python harris_probate.py --days 7  # Scrape last 7 days
    python harris_probate.py --from 2026-01-01 --to 2026-01-31  # Date range
"""

import argparse
import asyncio
import json
import re
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from playwright.async_api import async_playwright, Page, TimeoutError as PlaywrightTimeout
from bs4 import BeautifulSoup
from tenacity import retry, stop_after_attempt, wait_exponential


# Constants
BASE_URL = "https://cclerk.hctx.net/Applications/WebSearch/CourtSearch.aspx?CaseType=Probate"
CASE_DETAIL_URL = "https://cclerk.hctx.net/Applications/WebSearch/CaseDetail.aspx?CaseID={case_id}"

# Output directory
OUTPUT_DIR = Path(__file__).parent.parent / "output"


@dataclass
class Party:
    """Represents a party in a probate case."""
    name: str
    role: str  # e.g., "Decedent", "Executor", "Administrator", "Attorney"
    address: Optional[str] = None
    bar_number: Optional[str] = None  # For attorneys


@dataclass
class ProbateCase:
    """Represents a probate case filing."""
    case_number: str
    case_id: str  # Internal ID for detail URL
    court: str
    file_date: str
    status: str
    case_type: str
    decedent_name: Optional[str] = None
    parties: list = None
    attorneys: list = None
    scraped_at: str = None
    
    def __post_init__(self):
        if self.parties is None:
            self.parties = []
        if self.attorneys is None:
            self.attorneys = []
        if self.scraped_at is None:
            self.scraped_at = datetime.now().isoformat()


class HarrisProbateScraper:
    """Scraper for Harris County Probate Court records."""
    
    def __init__(self, headless: bool = True):
        self.headless = headless
        self.browser = None
        self.page = None
        
    async def __aenter__(self):
        await self.start()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
        
    async def start(self):
        """Initialize the browser."""
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=self.headless)
        self.context = await self.browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        self.page = await self.context.new_page()
        
    async def close(self):
        """Close the browser."""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
            
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def navigate_to_search(self):
        """Navigate to the probate search page."""
        print(f"Navigating to {BASE_URL}")
        await self.page.goto(BASE_URL, wait_until="networkidle")
        await asyncio.sleep(1)  # Let page fully load
        
    async def search_by_date_range(self, from_date: str, to_date: str) -> list[ProbateCase]:
        """
        Search for probate cases filed within a date range.
        
        Args:
            from_date: Start date in MM/DD/YYYY format
            to_date: End date in MM/DD/YYYY format
            
        Returns:
            List of ProbateCase objects
        """
        await self.navigate_to_search()
        
        # Click on the date search tab/section
        # The form has File Date (From) and File Date (To) fields
        try:
            # Fill in date fields
            from_input = self.page.locator('input[name*="FileDateFrom"]').first
            to_input = self.page.locator('input[name*="FileDateTo"]').first
            
            # Clear and fill
            await from_input.fill(from_date)
            await to_input.fill(to_date)
            
            print(f"Searching cases from {from_date} to {to_date}")
            
            # Submit the search
            search_btn = self.page.locator('input[type="submit"][value*="Search"], button:has-text("Search")').first
            await search_btn.click()
            
            # Wait for results
            await self.page.wait_for_load_state("networkidle")
            await asyncio.sleep(2)
            
        except Exception as e:
            print(f"Error during search: {e}")
            # Try alternative approach - look for any submit button
            await self.page.screenshot(path=OUTPUT_DIR / "debug_search.png")
            raise
            
        # Parse results
        cases = await self._parse_search_results()
        return cases
        
    async def _parse_search_results(self) -> list[ProbateCase]:
        """Parse the search results page."""
        cases = []
        
        html = await self.page.content()
        soup = BeautifulSoup(html, 'lxml')
        
        # Find the results table
        # Typically has columns: Case Number, Court, Status, File Date, etc.
        results_table = soup.find('table', {'id': re.compile(r'.*Grid.*|.*Results.*', re.I)})
        
        if not results_table:
            # Try finding any table with case data
            tables = soup.find_all('table')
            for table in tables:
                if table.find('a', href=re.compile(r'CaseDetail')):
                    results_table = table
                    break
                    
        if not results_table:
            print("No results table found")
            await self.page.screenshot(path=OUTPUT_DIR / "debug_no_results.png")
            return cases
            
        rows = results_table.find_all('tr')[1:]  # Skip header row
        print(f"Found {len(rows)} case rows")
        
        for row in rows:
            cells = row.find_all('td')
            if len(cells) < 4:
                continue
                
            # Extract case link and ID
            case_link = row.find('a', href=re.compile(r'CaseDetail'))
            if not case_link:
                continue
                
            case_number = case_link.get_text(strip=True)
            href = case_link.get('href', '')
            
            # Extract case ID from URL
            case_id_match = re.search(r'CaseID=(\d+)', href)
            case_id = case_id_match.group(1) if case_id_match else ""
            
            # Parse other fields (order may vary)
            try:
                case = ProbateCase(
                    case_number=case_number,
                    case_id=case_id,
                    court=cells[1].get_text(strip=True) if len(cells) > 1 else "",
                    file_date=cells[2].get_text(strip=True) if len(cells) > 2 else "",
                    status=cells[3].get_text(strip=True) if len(cells) > 3 else "",
                    case_type=cells[4].get_text(strip=True) if len(cells) > 4 else "",
                )
                cases.append(case)
            except Exception as e:
                print(f"Error parsing row: {e}")
                continue
                
        return cases
        
    async def get_case_details(self, case: ProbateCase) -> ProbateCase:
        """
        Fetch detailed information for a case, including parties and attorneys.
        
        Args:
            case: ProbateCase with case_id set
            
        Returns:
            Updated ProbateCase with party/attorney details
        """
        if not case.case_id:
            return case
            
        url = CASE_DETAIL_URL.format(case_id=case.case_id)
        
        try:
            await self.page.goto(url, wait_until="networkidle")
            await asyncio.sleep(1)
            
            html = await self.page.content()
            soup = BeautifulSoup(html, 'lxml')
            
            # Parse parties section
            parties_section = soup.find(string=re.compile(r'Part(y|ies)', re.I))
            if parties_section:
                parties_table = parties_section.find_parent('table') or parties_section.find_next('table')
                if parties_table:
                    for row in parties_table.find_all('tr')[1:]:
                        cells = row.find_all('td')
                        if len(cells) >= 2:
                            party = Party(
                                name=cells[0].get_text(strip=True),
                                role=cells[1].get_text(strip=True) if len(cells) > 1 else "",
                            )
                            case.parties.append(asdict(party))
                            
                            # Identify decedent
                            if 'decedent' in party.role.lower():
                                case.decedent_name = party.name
                                
            # Parse attorneys section
            attorney_section = soup.find(string=re.compile(r'Attorney', re.I))
            if attorney_section:
                attorney_table = attorney_section.find_parent('table') or attorney_section.find_next('table')
                if attorney_table:
                    for row in attorney_table.find_all('tr')[1:]:
                        cells = row.find_all('td')
                        if len(cells) >= 1:
                            attorney = Party(
                                name=cells[0].get_text(strip=True),
                                role="Attorney",
                                bar_number=cells[1].get_text(strip=True) if len(cells) > 1 else None,
                                address=cells[2].get_text(strip=True) if len(cells) > 2 else None,
                            )
                            case.attorneys.append(asdict(attorney))
                            
        except Exception as e:
            print(f"Error fetching case details for {case.case_number}: {e}")
            
        return case


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Scrape Harris County Probate Court records")
    parser.add_argument("--days", type=int, default=7, help="Number of days to look back")
    parser.add_argument("--from-date", type=str, help="Start date (MM/DD/YYYY)")
    parser.add_argument("--to-date", type=str, help="End date (MM/DD/YYYY)")
    parser.add_argument("--no-headless", action="store_true", help="Show browser window")
    parser.add_argument("--details", action="store_true", help="Fetch detailed case info")
    parser.add_argument("--output", type=str, help="Output JSON file path")
    
    args = parser.parse_args()
    
    # Determine date range
    if args.from_date and args.to_date:
        from_date = args.from_date
        to_date = args.to_date
    else:
        to_date = datetime.now().strftime("%m/%d/%Y")
        from_date = (datetime.now() - timedelta(days=args.days)).strftime("%m/%d/%Y")
        
    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    print(f"Starting Harris County Probate Scraper")
    print(f"Date range: {from_date} to {to_date}")
    print("-" * 50)
    
    async with HarrisProbateScraper(headless=not args.no_headless) as scraper:
        # Search for cases
        cases = await scraper.search_by_date_range(from_date, to_date)
        print(f"Found {len(cases)} cases")
        
        # Optionally fetch details for each case
        if args.details and cases:
            print("Fetching case details...")
            for i, case in enumerate(cases):
                print(f"  [{i+1}/{len(cases)}] {case.case_number}")
                await scraper.get_case_details(case)
                await asyncio.sleep(0.5)  # Rate limiting
                
        # Output results
        results = [asdict(c) for c in cases]
        
        if args.output:
            output_path = Path(args.output)
        else:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = OUTPUT_DIR / f"probate_cases_{timestamp}.json"
            
        with open(output_path, 'w') as f:
            json.dump(results, f, indent=2)
            
        print(f"\nResults saved to: {output_path}")
        
        # Print summary
        if cases:
            print("\nSample cases:")
            for case in cases[:5]:
                print(f"  - {case.case_number}: {case.decedent_name or 'Unknown'} ({case.file_date})")
                
    return cases


if __name__ == "__main__":
    asyncio.run(main())
