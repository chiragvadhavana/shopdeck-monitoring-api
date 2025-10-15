"""
Business logic for purchase tracking and data management.
"""

import re
import random
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from playwright.sync_api import sync_playwright
from .database import get_sync_collection


def parse_minutes(time_str: str) -> Optional[int]:
    """Parse 'X minutes ago' format from time string."""
    match = re.search(r"(\d+)\s*minutes?\s*ago", time_str.lower())
    return int(match.group(1)) if match else None


def fetch_purchases(product_url: str) -> Optional[List[Dict]]:
    """Fetch recent purchases from product page using Playwright."""
    api_data = None
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    ]

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(user_agent=random.choice(user_agents))
            page = context.new_page()

            def handle_response(response):
                nonlocal api_data
                if "/api/prashth/page/" in response.url and response.status == 200:
                    try:
                        data = response.json()
                        if data.get("code") == 200:
                            api_data = data
                    except:
                        pass

            page.on("response", handle_response)
            page.goto(product_url, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(2000)
            browser.close()
    except Exception as e:
        print(f"❌ Error fetching purchases: {e}")
        return None

    if api_data:
        widgets = api_data.get("data", {}).get("widgets", [])
        for widget in widgets:
            if widget.get("title") == "RECENT PURCHASE":
                return widget.get("entities", [])
    return None


def store_purchases(purchases: List[Dict], max_minutes: int = 60) -> int:
    """Store purchases in MongoDB, filtering by time window."""
    if not purchases:
        return 0

    collection = get_sync_collection()
    stored_count = 0
    current_time = datetime.now()

    for purchase in purchases:
        time_cta = purchase.get("time_cta", "")
        minutes_ago = parse_minutes(time_cta)

        # Only store if it's "X minutes ago" format AND within window
        if minutes_ago is not None and minutes_ago <= max_minutes:
            product_name = purchase.get("product_name", "")
            product_id = purchase.get("product_short_id", "")
            customer_location = purchase.get("title", "")

            # Calculate actual purchase time
            purchase_datetime = current_time - timedelta(minutes=minutes_ago)
            purchase_date = purchase_datetime.strftime("%Y-%m-%d")
            purchase_time = purchase_datetime.strftime("%H:%M")

            # Check if record already exists
            existing = collection.find_one(
                {
                    "product_id": product_id,
                    "customer_location": customer_location,
                    "purchase_date": purchase_date,
                    "purchase_time": purchase_time,
                }
            )

            if not existing:
                collection.insert_one(
                    {
                        "product_name": product_name,
                        "product_id": product_id,
                        "customer_location": customer_location,
                        "purchase_date": purchase_date,
                        "purchase_time": purchase_time,
                        "created_at": datetime.now(),
                    }
                )
                stored_count += 1

    return stored_count


def get_all_purchases() -> List[Dict]:
    """Get all purchases from MongoDB, sorted by date/time."""
    collection = get_sync_collection()
    cursor = collection.find({}).sort([("purchase_date", -1), ("purchase_time", -1)])
    return list(cursor)


def export_to_csv_data() -> str:
    """Export all purchases to CSV format string."""
    purchases = get_all_purchases()

    if not purchases:
        return "Product Name,Product ID,Customer,Date,Time\n"

    csv_lines = ["Product Name,Product ID,Customer,Date,Time"]

    for purchase in purchases:
        line = f'"{purchase["product_name"]}","{purchase["product_id"]}","{purchase["customer_location"]}","{purchase["purchase_date"]}","{purchase["purchase_time"]}"'
        csv_lines.append(line)

    return "\n".join(csv_lines)
