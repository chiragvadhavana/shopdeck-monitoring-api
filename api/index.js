require("dotenv").config();
const express = require("express");
const { MongoClient } = require("mongodb");
const axios = require("axios");

const app = express();
app.use(express.json());

// Serve static files from public directory
app.use(express.static("public"));

// Configuration
const MONGODB_URL = process.env.MONGODB_URL || "";

// MongoDB Connection
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
  const match = timeStr.toLowerCase().match(/(\d+)\s*minutes?\s*ago/);
  return match ? parseInt(match[1]) : null;
}

function extractProductIds(url) {
  const match = url.match(/catalogue\/([^\/]+)\/([^\/\?]+)/);
  if (!match) return null;
  return {
    productId: match[1],
    skuId: match[2],
  };
}

function extractWebsiteName(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.error("Error extracting website name:", error.message);
    return "unknown";
  }
}

async function scrapePurchases(url) {
  try {
    console.log(`Scraping URL: ${url}`);

    const ids = extractProductIds(url);
    if (!ids) {
      console.error("Could not extract product IDs from URL");
      return [];
    }

    console.log(`Product ID: ${ids.productId}, SKU ID: ${ids.skuId}`);

    // Extract the base domain from the input URL
    const urlObj = new URL(url);
    const baseDomain = urlObj.hostname;
    const apiUrl = `https://${baseDomain}/api/prashth/page/${ids.productId}/${ids.skuId}`;

    const params = {
      external_id: "30f011de9b2542ab96b0302e49463db4",
      fbc: "fb.1.1754997368020.fbclid",
      fbp: "fb.1.1749556790621.339021267154647244",
      offer_params:
        '{"enable":true,"applied_coupon_codes":[],"pre_applied_coupon_codes":[]}',
      page_no: 1,
      page_size: 5,
      sale_id: "68c81b3e891920179d3adab9",
    };

    const headers = {
      Accept: "*/*",
      "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
      Connection: "keep-alive",
      Referer: url,
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
      wm_device_type: "mobile",
      wm_image_experiment: "control",
      wm_lang: "en",
      wm_platform: "web",
      wm_pricing_cohort: "[]",
      wm_seller_website: baseDomain,
      wm_theme: "premium",
      wm_video_experiment: "control",
      wm_viewport: "mobile",
      wm_web_version: "1.6",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      Cookie:
        "__wm_visitor_id=a3cdbd59846343c98a67b0834dac25db; _ga=GA1.1.1516941305.1749556790; _fbp=fb.1.1749556790621.339021267154647244; _fbc=fb.1.1754997368020.fbclid",
    };

    console.log(`Calling API: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      params,
      headers,
      timeout: 10000,
    });

    console.log(`API response status: ${response.status}`);
    console.log(`API response code: ${response.data.code}`);

    if (response.data && response.data.code === 200) {
      const widgets = response.data.data?.widgets || [];
      console.log(`Found ${widgets.length} widgets`);

      for (const widget of widgets) {
        if (
          widget.title === "RECENT PURCHASE" ||
          widget.title === "RECENT PURCHASES"
        ) {
          const entities = widget.entities || [];
          console.log(`Found ${entities.length} recent purchases`);
          return entities;
        }
      }
      console.log("No RECENT PURCHASE widget found");
    }

    return [];
  } catch (error) {
    console.error("Scraping error:", error.message);
    if (error.response) {
      console.error(`API returned status: ${error.response.status}`);
      console.error(`API response:`, error.response.data);
    }
    return [];
  }
}

async function storePurchases(
  purchases,
  maxMinutes = 40,
  websiteName = "unknown"
) {
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
        website_name: websiteName,
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
      req.body.interval_minutes || req.query.interval_minutes || 40;
    const productUrl = req.body.product_url || req.query.product_url;

    console.log("=== TRIGGER CALLED ===");
    console.log("Product URL:", productUrl);
    console.log("Interval:", intervalMinutes);

    if (!productUrl) {
      return res
        .status(400)
        .json({ error: "product_url parameter is required" });
    }

    const collection = await getMongoConnection();
    if (!collection) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const websiteName = extractWebsiteName(productUrl);
    console.log("Website:", websiteName);

    const purchases = await scrapePurchases(productUrl);
    console.log(`Found ${purchases.length} purchases`);

    if (!purchases || purchases.length === 0) {
      return res.json({
        success: true,
        message: "No purchases found",
        website: websiteName,
        records_found: 0,
        records_stored: 0,
        all_purchases: [],
      });
    }

    const storedCount = await storePurchases(
      purchases,
      parseInt(intervalMinutes),
      websiteName
    );
    console.log(`Stored ${storedCount} purchases`);

    res.json({
      success: true,
      message: "Monitoring completed successfully",
      website: websiteName,
      records_found: purchases.length,
      records_stored: storedCount,
      all_purchases: purchases,
    });
  } catch (error) {
    console.error("=== TRIGGER ERROR ===");
    console.error("Message:", error.message);
    console.error("Stack:", error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Manual scraper endpoint (no DB interaction)
app.post("/api/scrape", async (req, res) => {
  try {
    const { product_url, interval_minutes = 10 } = req.body;

    if (!product_url) {
      return res.status(400).json({ error: "product_url is required" });
    }

    console.log("=== MANUAL SCRAPE CALLED ===");
    console.log("Product URL:", product_url);
    console.log("Interval:", interval_minutes);

    const purchases = await scrapePurchases(product_url);
    console.log(`Found ${purchases.length} purchases`);

    if (!purchases || purchases.length === 0) {
      return res.json({
        success: true,
        message: "No purchases found",
        website: extractWebsiteName(product_url),
        records_found: 0,
        filtered_purchases: [],
      });
    }

    // Filter purchases based on interval_minutes
    const filteredPurchases = purchases.filter((purchase) => {
      const timeCta = purchase.time_cta || "";
      const minutesAgo = parseMinutes(timeCta);
      return minutesAgo !== null && minutesAgo <= parseInt(interval_minutes);
    });

    console.log(
      `Filtered to ${filteredPurchases.length} purchases within ${interval_minutes} minutes`
    );

    res.json({
      success: true,
      message: "Scraping completed successfully",
      website: extractWebsiteName(product_url),
      records_found: purchases.length,
      filtered_records: filteredPurchases.length,
      all_purchases: purchases,
      filtered_purchases: filteredPurchases,
    });
  } catch (error) {
    console.error("=== MANUAL SCRAPE ERROR ===");
    console.error("Message:", error.message);
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
      const csvData = "Website,Product Name,Product ID,Customer,Date,Time\n";
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=purchases.csv"
      );
      return res.send(csvData);
    }

    const csvLines = ["Website,Product Name,Product ID,Customer,Date,Time"];
    for (const p of purchases) {
      const line = `"${p.website_name}","${p.product_name}","${p.product_id}","${p.customer_location}","${p.purchase_date}","${p.purchase_time}"`;
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
