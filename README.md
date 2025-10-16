# ShopDeck Purchase Monitoring API

FastAPI backend for monitoring ShopDeck product purchases with automatic data collection and CSV export functionality.

## Overview

- Scrapes recent purchases from ShopDeck product pages
- Filters purchases marked as "X minutes ago" format
- Stores purchases in MongoDB Atlas within specified time window
- Exports data as CSV
- Auto-runs every 5 minutes via GitHub Actions

## Project Structure

```
shopdeck-monitoring-api/
├── api.py                   # Main API application
├── test_scrape.py           # Test script for scraping
├── pyproject.toml           # Dependencies
├── vercel.json              # Vercel deployment config
├── .github/workflows/
│   └── cron.yml             # Automated monitoring
└── README.md                # Documentation
```

## Quick Setup

### 1. Prerequisites

- Python 3.8+
- MongoDB Atlas account (free tier)
- Vercel account (free tier)
- GitHub account

### 2. MongoDB Setup

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Go to "Network Access" → Add IP Address → Allow Access from Anywhere (0.0.0.0/0)
4. Create a database user with password
5. Get your connection string (looks like `mongodb+srv://username:password@cluster...`)

### 3. Local Development

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/shopdeck-monitoring-api.git
cd shopdeck-monitoring-api

# Create .env file
cat > .env << EOF
MONGODB_URL=mongodb+srv://username:password@cluster.mongodb.net/
PRODUCT_URL=https://your-shopdeck-product-url.com
INTERVAL_MINUTES=60
EOF

# Install dependencies
uv sync

# Install Playwright browsers
uv run playwright install chromium

# Test scraping first
uv run python test_scrape.py

# Run the API
uv run uvicorn api:app --reload
```

### 4. Test Your API

```bash
# Health check
curl http://localhost:8000/

# Trigger monitoring
curl -X POST http://localhost:8000/trigger

# Get stats
curl http://localhost:8000/stats

# Export CSV
curl http://localhost:8000/export -o purchases.csv
```

### 5. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "New Project" → Import your repository
3. Add environment variables in Vercel dashboard:
   - `MONGODB_URL`: Your MongoDB connection string
   - `PRODUCT_URL`: Your ShopDeck product URL
   - `INTERVAL_MINUTES`: `60` (or whatever you want, max 59 for minute-based tracking)
4. Deploy!

Your API will be at: `https://your-project.vercel.app`

### 6. Setup GitHub Actions (Auto-Monitoring)

1. Go to your GitHub repo → Settings → Secrets and variables → Actions
2. Add these secrets:
   - `MONGODB_URL`: Your MongoDB connection string
   - `PRODUCT_URL`: Your ShopDeck product URL
   - `INTERVAL_MINUTES`: `60` (optional, defaults to 60)
3. The cron job runs automatically every 5 minutes! ✅

## API Endpoints

| Endpoint   | Method | Description                    |
| ---------- | ------ | ------------------------------ |
| `/`        | GET    | Health check + database status |
| `/trigger` | POST   | Manually trigger monitoring    |
| `/export`  | GET    | Download purchases as CSV      |
| `/stats`   | GET    | Get database statistics        |

## Configuration

### Environment Variables

| Variable           | Description                       | Required | Default |
| ------------------ | --------------------------------- | -------- | ------- |
| `MONGODB_URL`      | MongoDB connection string         | ✅       | -       |
| `PRODUCT_URL`      | ShopDeck product page URL         | ✅       | -       |
| `INTERVAL_MINUTES` | Time window for tracking (max 59) | ❌       | 60      |

### How the Time Window Works

Only purchases with "X minutes ago" format are tracked.

- If `INTERVAL_MINUTES=30`, only purchases within last 30 minutes are stored
- If `INTERVAL_MINUTES=60`, only purchases within last 60 minutes are stored
- Purchases marked as "an hour ago", "2 hours ago", etc. are ignored
- No duplicate checking - each run stores fresh data

**Example:**

If you set `INTERVAL_MINUTES=40` and the scraper finds:

- "5 minutes ago" → Stored (within 40 minutes)
- "35 minutes ago" → Stored (within 40 minutes)
- "45 minutes ago" → NOT stored (outside 40 minutes)
- "an hour ago" → NOT stored (not minute-based format)

## Database Schema

MongoDB Collection: `shopdeck_monitoring.purchases`

```json
{
  "_id": "ObjectId",
  "product_name": "Product Name",
  "product_id": "abc123",
  "customer_location": "Customer in City",
  "purchase_date": "2025-10-16",
  "purchase_time": "14:30",
  "created_at": "2025-10-16T14:35:22"
}
```

## Troubleshooting

### MongoDB Connection Failed

- Check your connection string format
- Make sure you allowed access from anywhere (0.0.0.0/0) in MongoDB Network Access
- Verify username/password are correct

### No Purchases Stored

- Check if purchases are in "X minutes ago" format (not "an hour ago")
- Verify they're within your `INTERVAL_MINUTES` window
- Test with `test_scrape.py` first to see what's being scraped

### Vercel Deployment Issues

- Make sure environment variables are set in Vercel dashboard
- Check Vercel logs for errors
- MongoDB Atlas must allow connections from anywhere

## GitHub Actions Monitoring

The cron job (`*/5 * * * *`) runs every 5 minutes automatically:

1. Scrapes the product page
2. Filters for "X minutes ago" purchases
3. Stores in MongoDB if within time window
4. Logs results in GitHub Actions tab

## Summary

The system provides:

- Single `api.py` file with all logic
- Tracks only minute-based purchases
- No duplicate checking for simplicity
- Works on Vercel + GitHub Actions
- Uses free tier services

## Files

- `api.py` - Main API (replaced old `app/` folder)
- `test_scrape.py` - Quick test script
- `vercel.json` - Points to `api.py`
- `.github/workflows/cron.yml` - Uses `api.py`

## Changes from Previous Version

- Everything consolidated into one file (`api.py`)
- Removed separate `models.py`, `services.py`, `database.py`
- No duplicate checking for simplicity
- Same logic as SQLite version
- Only minute-based tracking
