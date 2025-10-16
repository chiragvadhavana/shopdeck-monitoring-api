# 🛍️ ShopDeck Monitoring API

Real-time purchase monitoring API for ShopDeck websites with automatic scraping and website tracking.

## 🚀 Features

- **Real-time Scraping**: Direct API calls to ShopDeck websites
- **Automatic Config Extraction**: No need to manually provide external_id and sale_id - they're extracted automatically!
- **Website Tracking**: Multi-website support with automatic website name extraction
- **MongoDB Storage**: Persistent storage of purchase data
- **CSV Export**: Download all stored purchases
- **Beautiful Web Interface**: FastAPI-style testing interface
- **Unified GitHub Actions**: Single workflow handles multiple websites
- **Vercel Deployment**: Serverless deployment with free tier support

## 🌐 Live Demo

- **API Interface**: [https://shopdeck-monitoring-api.vercel.app/](https://shopdeck-monitoring-api.vercel.app/)
- **Health Check**: [https://shopdeck-monitoring-api.vercel.app/](https://shopdeck-monitoring-api.vercel.app/)
- **API Endpoints**: [https://shopdeck-monitoring-api.vercel.app/api/trigger](https://shopdeck-monitoring-api.vercel.app/api/trigger)

## 📋 API Endpoints

### Health Check

```bash
GET /
```

### Trigger Scraping (with Auto-Config Extraction)

```bash
POST /api/trigger
Content-Type: application/json

{
  "product_url": "https://vinayakfashion.co/product/catalogue/ABC123/DEF456",
  "interval_minutes": 10
}
```

**Note**: The API now automatically extracts `external_id` and `sale_id` from the product page HTML. You don't need to provide them manually!

### Export Data

```bash
GET /api/export
```

## 🛠️ Setup Instructions

### 1. Environment Variables

Set these in your Vercel dashboard:

```env
MONGODB_URL=mongodb+srv://user:password@cluster.mongodb.net/shopdeck_monitoring
```

### 2. GitHub Actions Setup

1. Go to your GitHub repository settings
2. Navigate to "Secrets and variables" → "Actions"
3. Add a new repository secret:
   - **Name**: `VERCEL_API_URL`
   - **Value**: `https://shopdeck-monitoring-api.vercel.app`

### 3. Automated Scraping

The unified GitHub Actions workflow will automatically:

- Run every 10 minutes
- Scrape all 5 configured websites in parallel:
  - Vinayak Fashion
  - VIP Fashion Store
  - Rangrasia
  - Wama Trends
  - Rajgharana Lifestyle
- Store new purchases in MongoDB
- Provide detailed logs and summaries for each website

## 📊 Database Schema

```javascript
{
  website_name: "vinayakfashion.co",
  product_name: "Cotton Kurti",
  product_id: "ABC123",
  customer_location: "Mumbai",
  purchase_date: "2025-10-16",
  purchase_time: "13:24",
  created_at: "2025-10-16T13:24:00Z"
}
```

## 🎯 Usage Examples

### Manual API Call

```bash
curl -X POST https://shopdeck-monitoring-api.vercel.app/api/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "product_url": "https://vinayakfashion.co/Khadi-Cotton-A-line-Dress/catalogue/MuBDATc1/7jlKiiGv",
    "interval_minutes": 40
  }'
```

### Download CSV

```bash
curl -o purchases.csv https://shopdeck-monitoring-api.vercel.app/api/export
```

## 🔧 Local Development

```bash
# Install dependencies
npm install

# Set up environment
echo "MONGODB_URL=your_mongodb_url" > .env
echo "PORT=3000" >> .env

# Start development server
npm start
```

## 📁 Project Structure

```
shopdeck-monitoring-api/
├── api/
│   └── index.js          # Main API server with auto-config extraction
├── public/
│   └── index.html        # Web interface
├── .github/
│   └── workflows/
│       └── unified-scraper.yml # Unified multi-website scraper (5 websites)
├── package.json          # Dependencies
├── vercel.json          # Vercel config
└── README.md            # This file
```

## 🚀 Deployment

1. **Vercel**: Automatic deployment from GitHub
2. **Environment**: Set `MONGODB_URL` in Vercel dashboard
3. **GitHub Actions**: Configure `VERCEL_API_URL` secret

## 📈 Monitoring

- **Health Check**: Monitor API status
- **GitHub Actions**: View scraping logs and results
- **MongoDB**: Check stored purchase data
- **Vercel**: Monitor deployment and performance

## 🔒 Security

- Environment variables stored securely in Vercel
- GitHub secrets for API URLs
- No sensitive data in codebase
- Rate limiting and error handling

## 📞 Support

For issues or questions, please check:

1. GitHub Actions logs for scraping errors
2. Vercel deployment logs for API issues
3. MongoDB connection for database problems

---

**Built with ❤️ for automated e-commerce monitoring**
