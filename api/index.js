// api/index.js
require('dotenv').config();
const express = require("express");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");
const { MongoClient } = require("mongodb");

const app = express();
app.use(express.json());

// Configuration
const MONGODB_URL = process.env.MONGODB_URL || "";
const PRODUCT_URL = process.env.PRODUCT_URL || "";
const INTERVAL_MINUTES = parseInt(process.env.INTERVAL_MINUTES || "60");

// MongoDB Connection (singleton)
let mongoClient = null;
let db = null;
let purchasesCollection = null;

async function getMongoConnection() {
  if (!MONGODB_URL) return null;

  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URL);
    await mongoClient.connect();
    db = mongoClient.db("shopdeck_monitoring");
    purchasesCollection = db.collection("purchases");
  }
  return purchasesCollection;
}

// Helper Functions
function parseMinutes(timeStr) {
  // Only handle "X minutes ago" format
  const match = timeStr.toLowerCase().match(/(\d+)\s*minutes?\s*ago/);
  return match ? parseInt(match[1]) : null;
}

async function scrapePurchases(url) {
  let apiData = null;
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  ];

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      userAgents[Math.floor(Math.random() * userAgents.length)]
    );
    await page.setViewport({ width: 1920, height: 1080 });

    // Intercept API responses
    page.on("response", async (response) => {
      try {
        const url = response.url();
        if (url.includes("/api/prashth/page/") && response.status() === 200) {
          const data = await response.json();
          if (data.code === 200) {
            apiData = data;
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForTimeout(5000);
    await browser.close();

    // Extract purchases from API data
    if (apiData) {
      const widgets = apiData.data?.widgets || [];
      for (const widget of widgets) {
        if (widget.title === "RECENT PURCHASE") {
          return widget.entities || [];
        }
      }
    }

    return [];
  } catch (error) {
    console.error("Scraping error:", error);
    return [];
  }
}

async function storePurchases(purchases, maxMinutes = 60) {
  const collection = await getMongoConnection();
  if (!purchases || !collection) return 0;

  let storedCount = 0;
  const currentTime = new Date();

  for (const purchase of purchases) {
    const timeCta = purchase.time_cta || "";
    const minutesAgo = parseMinutes(timeCta);

    if (minutesAgo !== null && minutesAgo <= maxMinutes) {
      const purchaseDateTime = new Date(currentTime - minutesAgo * 60000);
      purchaseDateTime.setSeconds(0, 0);

      const purchaseDate = purchaseDateTime.toISOString().split("T")[0];
      const purchaseTime = purchaseDateTime.toTimeString().slice(0, 5);

      await collection.insertOne({
        product_name: purchase.product_name || "",
        product_id: purchase.product_short_id || "",
        customer_location: purchase.title || "",
        purchase_date: purchaseDate,
        purchase_time: purchaseTime,
        created_at: new Date(),
      });

      storedCount++;
    }
  }

  return storedCount;
}

// API Endpoints
app.get("/", async (req, res) => {
  let dbStatus = "not configured";

  if (MONGODB_URL) {
    try {
      const collection = await getMongoConnection();
      await collection.findOne({});
      dbStatus = "connected";
    } catch (error) {
      dbStatus = `error: ${error.message}`;
    }
  }

  res.json({
    status: "healthy",
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/trigger", async (req, res) => {
  try {
    const intervalMinutes =
      req.body.interval_minutes ||
      req.query.interval_minutes ||
      INTERVAL_MINUTES;
    const productUrl =
      req.body.product_url || req.query.product_url || PRODUCT_URL;

    if (!productUrl) {
      return res.status(400).json({ error: "PRODUCT_URL not set" });
    }

    const collection = await getMongoConnection();
    if (!collection) {
      return res.status(500).json({ error: "Database not configured" });
    }

    console.log(`Starting scrape for URL: ${productUrl}`);
    const purchases = await scrapePurchases(productUrl);
    console.log(`Scraped ${purchases.length} purchases`);

    if (!purchases || purchases.length === 0) {
      return res.json({
        success: true,
        message: "No purchases found",
        records_found: 0,
        records_stored: 0,
        all_purchases: [],
      });
    }

    const storedCount = await storePurchases(
      purchases,
      parseInt(intervalMinutes)
    );
    console.log(`Stored ${storedCount} purchases`);

    res.json({
      success: true,
      message: "Monitoring completed successfully",
      records_found: purchases.length,
      records_stored: storedCount,
      all_purchases: purchases,
    });
  } catch (error) {
    console.error("Trigger error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/export", async (req, res) => {
  try {
    const collection = await getMongoConnection();
    if (!collection) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const purchases = await collection
      .find({})
      .sort({ purchase_date: -1, purchase_time: -1 })
      .toArray();

    if (!purchases || purchases.length === 0) {
      const csvData = "Product Name,Product ID,Customer,Date,Time\n";
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=purchases.csv"
      );
      return res.send(csvData);
    }

    const csvLines = ["Product Name,Product ID,Customer,Date,Time"];
    for (const p of purchases) {
      const line = `"${p.product_name}","${p.product_id}","${p.customer_location}","${p.purchase_date}","${p.purchase_time}"`;
      csvLines.push(line);
    }
    const csvData = csvLines.join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=purchases.csv");
    res.send(csvData);
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Export for Vercel serverless
module.exports = app;

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
