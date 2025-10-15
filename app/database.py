"""
MongoDB database connection and configuration.
"""
import os
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

# MongoDB connection string from environment
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb+srv://technomad625_db_user:tfDmvELR50SgA0sa@testcluster.qzqdndu.mongodb.net/shopdeck_monitoring?retryWrites=true&w=majority&appName=TestCluster")

# Database and collection names
DATABASE_NAME = "shopdeck_monitoring"
COLLECTION_NAME = "purchases"

# Async client for FastAPI
async_client = AsyncIOMotorClient(MONGODB_URL)
async_db = async_client[DATABASE_NAME]
async_collection = async_db[COLLECTION_NAME]

# Sync client for cron jobs
sync_client = MongoClient(MONGODB_URL)
sync_db = sync_client[DATABASE_NAME]
sync_collection = sync_db[COLLECTION_NAME]

def get_async_collection():
    """Get async MongoDB collection for FastAPI endpoints."""
    return async_collection

def get_sync_collection():
    """Get sync MongoDB collection for cron jobs."""
    return sync_collection
