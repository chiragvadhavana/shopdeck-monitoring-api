import os
import re
import random
import asyncio
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from playwright.async_api import async_playwright
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
MONGODB_URL = os.getenv("MONGODB_URL", "")
PRODUCT_URL = os.getenv("PRODUCT_URL", "")
INTERVAL_MINUTES = int(os.getenv("INTERVAL_MINUTES", "60"))

# MongoDB Connection
mongo_client = MongoClient(MONGODB_URL) if MONGODB_URL else None
db = mongo_client["shopdeck_monitoring"] if mongo_client is not None else None
purchases_collection = db["purchases"] if db is not None else None

# FastAPI App
app = FastAPI(title="ShopDeck Monitoring API", version="1.0.0")


# Response Models
class TriggerResponse(BaseModel):
    success: bool
    message: str
    records_found: int = 0
    records_stored: int = 0
    all_purchases: list = []


# Helper Functions
def parse_minutes(time_str: str) -> Optional[int]:
    """Parse 'X minutes ago' format from time string."""
    match = re.search(r"(\d+)\s*minutes?\s*ago", time_str.lower())
    return int(match.group(1)) if match else None


async def scrape_purchases(url: str) -> list:
    """Scrape purchases from product page using Playwright."""
    api_data = None
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    ]

    try:
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
    except Exception as e:
        print(f"Error scraping: {e}")
        return []

    # Extract purchases from API data
    if api_data:
        widgets = api_data.get("data", {}).get("widgets", [])
        for widget in widgets:
            if widget.get("title") == "RECENT PURCHASE":
                return widget.get("entities", [])

    return []


def store_purchases(purchases: list, max_minutes: int = 60) -> int:
    """Store purchases within specified time window."""
    if not purchases or purchases_collection is None:
        return 0

    stored_count = 0
    current_time = datetime.now()

    for purchase in purchases:
        time_cta = purchase.get("time_cta", "")
        minutes_ago = parse_minutes(time_cta)

        if minutes_ago is not None and minutes_ago <= max_minutes:
            product_name = purchase.get("product_name", "")
            product_id = purchase.get("product_short_id", "")
            customer_location = purchase.get("title", "")

            purchase_datetime = current_time - timedelta(minutes=minutes_ago)
            purchase_datetime = purchase_datetime.replace(second=0, microsecond=0)
            purchase_date = purchase_datetime.strftime("%Y-%m-%d")
            purchase_time = purchase_datetime.strftime("%H:%M")
            purchases_collection.insert_one(
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


# API Endpoints
@app.get("/")
def health_check():
    """Health check endpoint."""
    db_status = "connected" if purchases_collection is not None else "not configured"

    if purchases_collection is not None:
        try:
            purchases_collection.find_one({})
        except Exception as e:
            db_status = f"error: {str(e)}"

    return {
        "status": "healthy",
        "database": db_status,
        "timestamp": datetime.now().isoformat(),
    }


@app.post("/trigger", response_model=TriggerResponse)
async def trigger_monitoring(
    interval_minutes: Optional[int] = None, product_url: Optional[str] = None
):
    """Manually trigger purchase monitoring."""

    if interval_minutes is None:
        interval_minutes = INTERVAL_MINUTES
    else:
        interval_minutes = int(interval_minutes)

    if product_url is None:
        product_url = PRODUCT_URL
    else:
        product_url = str(product_url)

    if not product_url:
        raise HTTPException(status_code=400, detail="PRODUCT_URL not set")

    if purchases_collection is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    try:
        purchases = await scrape_purchases(product_url)

        if not purchases:
            return TriggerResponse(
                success=True,
                message="No purchases found",
                records_found=0,
                records_stored=0,
                all_purchases=[],
            )

        stored_count = store_purchases(purchases, interval_minutes)

        return TriggerResponse(
            success=True,
            message="Monitoring completed successfully",
            records_found=len(purchases),
            records_stored=stored_count,
            all_purchases=purchases,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@app.get("/export")
def export_csv():
    """Export all purchases as CSV file."""
    if purchases_collection is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    try:
        cursor = purchases_collection.find({}).sort(
            [("purchase_date", -1), ("purchase_time", -1)]
        )
        purchases = list(cursor)

        if not purchases:
            csv_data = "Product Name,Product ID,Customer,Date,Time\n"
        else:
            csv_lines = ["Product Name,Product ID,Customer,Date,Time"]
            for p in purchases:
                line = f'"{p["product_name"]}","{p["product_id"]}","{p["customer_location"]}","{p["purchase_date"]}","{p["purchase_time"]}"'
                csv_lines.append(line)
            csv_data = "\n".join(csv_lines)

        return PlainTextResponse(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=purchases.csv"},
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
