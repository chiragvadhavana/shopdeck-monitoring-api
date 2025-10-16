"""
Test script for ShopDeck purchase scraping.
"""

import os
import re
import random
import asyncio
from datetime import datetime, timedelta
from playwright.async_api import async_playwright
from dotenv import load_dotenv

load_dotenv()

PRODUCT_URL = os.getenv("PRODUCT_URL", "")


def parse_minutes(time_str: str):
    """Parse 'X minutes ago' format."""
    match = re.search(r"(\d+)\s*minutes?\s*ago", time_str.lower())
    return int(match.group(1)) if match else None


async def scrape_purchases(url: str):
    """Scrape purchases from product page."""
    print(f"Scraping: {url}\n")

    api_data = None
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    ]

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(user_agent=random.choice(user_agents))
        page = await context.new_page()

        async def handle_response(response):
            nonlocal api_data
            if "/api/prashth/page/" in response.url and response.status == 200:
                try:
                    data = await response.json()
                    if data.get("code") == 200:
                        api_data = data
                except:
                    pass

        page.on("response", handle_response)
        await page.goto(url, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2000)
        await browser.close()

    # Extract purchases from API data
    if api_data:
        widgets = api_data.get("data", {}).get("widgets", [])
        for widget in widgets:
            if widget.get("title") == "RECENT PURCHASE":
                return widget.get("entities", [])

    return []


async def main():
    if not PRODUCT_URL:
        print("Error: PRODUCT_URL not set in .env file")
        return

    MAX_MINUTES = 40
    print(f"Testing with {MAX_MINUTES}-minute cap...\n")

    purchases = await scrape_purchases(PRODUCT_URL)

    if not purchases:
        print("No purchases found")
        return

    print(f"Found {len(purchases)} total purchases:\n")

    current_time = datetime.now()
    within_window = 0
    outside_window = 0

    for i, purchase in enumerate(purchases, 1):
        time_cta = purchase.get("time_cta", "")
        minutes_ago = parse_minutes(time_cta)

        product_name = purchase.get("product_name", "Unknown")
        customer = purchase.get("title", "Unknown")

        if minutes_ago is not None:
            purchase_time = current_time - timedelta(minutes=minutes_ago)
            status = (
                "WITHIN WINDOW"
                if minutes_ago <= MAX_MINUTES
                else "OUTSIDE WINDOW"
            )

            if minutes_ago <= MAX_MINUTES:
                within_window += 1
            else:
                outside_window += 1

            print(f"{i}. {product_name}")
            print(f"   Customer: {customer}")
            print(
                f"   Time: {minutes_ago} minutes ago ({purchase_time.strftime('%Y-%m-%d %H:%M')})"
            )
            print(f"   Status: {status}")
        else:
            print(f"{i}. {product_name}")
            print(f"   Customer: {customer}")
            print(f"   Time: {time_cta}")
            print(f"   Status: NOT MINUTE-BASED FORMAT")
        print()

    print("=" * 50)
    print(f"SUMMARY (40-minute window):")
    print(f"   Total found: {len(purchases)}")
    print(f"   Within window: {within_window}")
    print(f"   Outside window: {outside_window}")
    print(f"   Would be stored: {within_window}")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
