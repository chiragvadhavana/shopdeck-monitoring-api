"""
MongoDB database connection and configuration.
"""

import os
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

# MongoDB connection string from environment
MONGODB_URL = os.getenv(
    "MONGODB_URL",
    "mongodb+srv://technomad625_db_user:tfDmvELR50SgA0sa@testcluster.qzqdndu.mongodb.net/shopdeck_monitoring?retryWrites=true&w=majority&appName=TestCluster",
)

# Database and collection names
DATABASE_NAME = "shopdeck_monitoring"
COLLECTION_NAME = "purchases"

# Global clients (lazy initialization)
async_client = None
sync_client = None


def get_async_collection():
    """Get async MongoDB collection for FastAPI endpoints."""
    # Create a new client for each request in serverless environment
    # This prevents "Event loop is closed" errors in Vercel
    client = AsyncIOMotorClient(MONGODB_URL)
    return client[DATABASE_NAME][COLLECTION_NAME]


def get_sync_collection():
    """Get sync MongoDB collection for cron jobs."""
    global sync_client
    if sync_client is None:
        sync_client = MongoClient(MONGODB_URL)
    return sync_client[DATABASE_NAME][COLLECTION_NAME]
