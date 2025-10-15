"""
FastAPI main application for ShopDeck purchase monitoring.
"""

import os
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from .models import TriggerResponse, HealthResponse
from .services import fetch_purchases, store_purchases, export_to_csv_data
from .database import get_async_collection

app = FastAPI(
    title="ShopDeck Monitoring API",
    description="API for monitoring and exporting ShopDeck purchase data",
    version="1.0.0",
)

# Get product URL from environment
PRODUCT_URL = os.getenv("PRODUCT_URL", "")
INTERVAL_MINUTES = int(os.getenv("INTERVAL_MINUTES", "60"))


@app.get("/", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    try:
        # Test database connection
        collection = get_async_collection()
        await collection.find_one({})
        db_status = "connected"
    except Exception:
        db_status = "disconnected"

    return HealthResponse(
        status="healthy", database=db_status, timestamp=datetime.now()
    )


@app.post("/trigger", response_model=TriggerResponse)
async def trigger_monitoring():
    """Manually trigger purchase monitoring."""
    if not PRODUCT_URL:
        raise HTTPException(
            status_code=400, detail="PRODUCT_URL environment variable not set"
        )

    try:
        # Fetch purchases from the product page
        purchases = fetch_purchases(PRODUCT_URL)

        if not purchases:
            return TriggerResponse(
                success=True,
                message="No purchases found",
                records_found=0,
                records_stored=0,
            )

        # Store purchases in database
        stored_count = store_purchases(purchases, INTERVAL_MINUTES)

        return TriggerResponse(
            success=True,
            message=f"Monitoring completed successfully",
            records_found=len(purchases),
            records_stored=stored_count,
        )

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error during monitoring: {str(e)}"
        )


@app.get("/export")
async def export_csv():
    """Export all purchases as CSV file."""
    try:
        csv_data = export_to_csv_data()

        return PlainTextResponse(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=purchases.csv"},
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting data: {str(e)}")


@app.get("/stats")
async def get_stats():
    """Get basic statistics about stored purchases."""
    try:
        collection = get_async_collection()

        total_count = await collection.count_documents({})

        # Get unique products
        unique_products = await collection.distinct("product_id")

        # Get date range
        oldest = await collection.find_one({}, sort=[("purchase_date", 1)])
        newest = await collection.find_one({}, sort=[("purchase_date", -1)])

        return {
            "total_purchases": total_count,
            "unique_products": len(unique_products),
            "date_range": {
                "oldest": oldest["purchase_date"] if oldest else None,
                "newest": newest["purchase_date"] if newest else None,
            },
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting stats: {str(e)}")
