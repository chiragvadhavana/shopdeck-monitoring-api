"""
MongoDB database connection - Simple and clean.
"""

import os
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# MongoDB configuration
MONGODB_URL = os.getenv("MONGODB_URL", "")
DATABASE_NAME = "shopdeck_monitoring"
COLLECTION_NAME = "purchases"


def get_async_collection():
    """Get async MongoDB collection for FastAPI endpoints."""
    client = AsyncIOMotorClient(MONGODB_URL)
    return client[DATABASE_NAME][COLLECTION_NAME]


def get_sync_collection():
    """Get sync MongoDB collection for cron jobs."""
    client = MongoClient(MONGODB_URL)
    return client[DATABASE_NAME][COLLECTION_NAME]