# ShopDeck Monitoring API

A FastAPI backend for monitoring ShopDeck product purchases with automatic data collection and CSV export functionality.

## 🏗️ Architecture

- **FastAPI**: REST API backend
- **MongoDB Atlas**: Database storage
- **Vercel**: API hosting (serverless)
- **GitHub Actions**: Automated cron job (every 5 minutes)
- **Playwright**: Web scraping for purchase data

## 📁 Project Structure

```
shopdeck-monitoring-api/
├── app/
│   ├── __init__.py          # Package init
│   ├── main.py              # FastAPI application
│   ├── database.py          # MongoDB connection
│   ├── models.py            # Pydantic models
│   └── services.py          # Business logic
├── .github/workflows/
│   └── cron.yml             # GitHub Actions cron job
├── pyproject.toml           # Dependencies
├── vercel.json              # Vercel configuration
├── env.example              # Environment variables template
└── README.md                # This file
```

## 🚀 Quick Setup

### 1. Environment Variables

Copy `env.example` and set your values:

```bash
# MongoDB connection string (from MongoDB Atlas)
MONGODB_URL=mongodb+srv://technomad625_db_user:tfDmvELR50SgA0sa@testcluster.qzqdndu.mongodb.net/shopdeck_monitoring?retryWrites=true&w=majority&appName=TestCluster

# Product URL to monitor
PRODUCT_URL=https://your-product-url.com

# Monitoring interval in minutes (default: 60)
INTERVAL_MINUTES=60
```

### 2. Local Development

```bash
# Install dependencies
uv sync

# Install Playwright browsers
uv run playwright install chromium

# Run the API
uv run uvicorn app.main:app --reload
```

### 3. Deploy to Vercel

1. **Connect GitHub repo to Vercel**
2. **Set environment variables in Vercel dashboard**:
   - `MONGODB_URL`
   - `PRODUCT_URL`
   - `INTERVAL_MINUTES` (optional)

3. **Deploy**: Vercel will auto-deploy from GitHub

### 4. Setup GitHub Actions Cron

1. **Go to GitHub repo → Settings → Secrets and variables → Actions**
2. **Add repository secrets**:
   - `MONGODB_URL`: Your MongoDB connection string
   - `PRODUCT_URL`: Product URL to monitor
   - `INTERVAL_MINUTES`: Monitoring interval (optional, default: 60)

3. **Cron job runs every 5 minutes automatically**

## 📡 API Endpoints

### Health Check
```http
GET /
```
Returns API health status and database connection.

### Manual Trigger
```http
POST /trigger
```
Manually trigger purchase monitoring.

**Response:**
```json
{
  "success": true,
  "message": "Monitoring completed successfully",
  "records_found": 5,
  "records_stored": 3
}
```

### Export CSV
```http
GET /export
```
Download all purchases as CSV file.

### Statistics
```http
GET /stats
```
Get basic statistics about stored purchases.

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `MONGODB_URL` | MongoDB Atlas connection string | ✅ | - |
| `PRODUCT_URL` | ShopDeck product URL to monitor | ✅ | - |
| `INTERVAL_MINUTES` | Time window for purchase tracking | ❌ | 60 |

### Cron Schedule

The GitHub Actions cron job runs every 5 minutes:
```yaml
schedule:
  - cron: '*/5 * * * *'
```

## 🗄️ Database Schema

MongoDB collection: `purchases`

```json
{
  "_id": "ObjectId",
  "product_name": "string",
  "product_id": "string", 
  "customer_location": "string",
  "purchase_date": "YYYY-MM-DD",
  "purchase_time": "HH:MM",
  "created_at": "datetime"
}
```

## 🔍 How It Works

1. **GitHub Actions** runs every 5 minutes
2. **Playwright** scrapes the product page for recent purchases
3. **Filters** purchases with "X minutes ago" format within time window
4. **Stores** new purchases in MongoDB Atlas
5. **API** provides endpoints for manual trigger and CSV export

## 🛠️ Development

### Local Testing

```bash
# Test the API locally
uv run uvicorn app.main:app --reload --port 8000

# Test endpoints
curl http://localhost:8000/
curl -X POST http://localhost:8000/trigger
curl http://localhost:8000/export
```

### Manual Cron Test

```bash
# Test the monitoring script directly
uv run python -c "
from app.services import fetch_purchases, store_purchases
import os

product_url = 'YOUR_PRODUCT_URL'
purchases = fetch_purchases(product_url)
if purchases:
    stored = store_purchases(purchases, 60)
    print(f'Found: {len(purchases)}, Stored: {stored}')
"
```

## 📊 Monitoring

- **Vercel**: Check deployment status and logs
- **GitHub Actions**: Monitor cron job runs
- **MongoDB Atlas**: View stored data
- **API**: Use `/stats` endpoint for data insights

## 🔒 Security

- MongoDB connection string stored as environment variable
- No sensitive data in code
- Vercel handles HTTPS automatically
- GitHub Actions secrets for cron job

## 🚨 Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
   - Check connection string format
   - Verify network access in MongoDB Atlas

2. **No Purchases Found**
   - Verify PRODUCT_URL is correct
   - Check if product page structure changed

3. **Cron Job Not Running**
   - Check GitHub Actions secrets
   - Verify cron schedule syntax

4. **Vercel Deployment Failed**
   - Check environment variables
   - Verify Python version compatibility

### Logs

- **Vercel**: Dashboard → Functions → View logs
- **GitHub Actions**: Repository → Actions tab
- **Local**: Console output when running locally

## 📝 Notes

- Keeps original SQLite version intact
- MongoDB version is completely separate
- All free tiers used (Vercel, GitHub Actions, MongoDB Atlas)
- Automatic duplicate prevention in database
