"""
Data models for the ShopDeck monitoring API.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class Purchase(BaseModel):
    """Purchase data model."""

    product_name: str = Field(..., description="Name of the product")
    product_id: str = Field(..., description="Product ID")
    customer_location: str = Field(..., description="Customer location")
    purchase_date: str = Field(..., description="Purchase date (YYYY-MM-DD)")
    purchase_time: str = Field(..., description="Purchase time (HH:MM)")
    created_at: datetime = Field(
        default_factory=datetime.now, description="Record creation timestamp"
    )


class PurchaseCreate(BaseModel):
    """Model for creating a new purchase record."""

    product_name: str
    product_id: str
    customer_location: str
    purchase_date: str
    purchase_time: str


class TriggerResponse(BaseModel):
    """Response model for trigger endpoint."""

    success: bool
    message: str
    records_found: int = 0
    records_stored: int = 0


class HealthResponse(BaseModel):
    """Response model for health check."""

    status: str
    database: str
    timestamp: datetime
