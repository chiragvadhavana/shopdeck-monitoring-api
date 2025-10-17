require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');
const { getPurchaseDateTime } = require('../utils/helper');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const MONGODB_URL = process.env.MONGODB_URL || '';

let mongoClient = null;
let db = null;
let purchasesCollection = 'purchases-v2';
let websitesCollection = 'monitored-websites';

// async function getMongoConnection() {
//   if (!MONGODB_URL) return null;
//   if (!mongoClient) {
//     mongoClient = new MongoClient(MONGODB_URL);
//     await mongoClient.connect();
//     db = mongoClient.db('shopdeck_monitoring');
//     purchasesCollection = db.collection('purchases-v2');
//     websitesCollection = db.collection('monitored-websites');
//   }
//   return purchasesCollection;
// }

async function getCollection(collectionName) {
  if (!MONGODB_URL) return null;

  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URL);
    await mongoClient.connect();
    db = mongoClient.db('shopdeck_monitoring');
  }

  return db.collection(collectionName);
}

function parseMinutes(timeStr) {
  const match = timeStr.toLowerCase().match(/(\d+)\s*minutes?\s*ago/);
  return match ? parseInt(match[1]) : null;
}

function extractProductIds(url) {
  const match = url.match(/catalogue\/([^\/]+)\/([^\/\?]+)/);
  if (!match) return null;
  return { productId: match[1], skuId: match[2] };
}

function extractWebsiteName(url) {
  try {
    return new URL(url).hostname;
  } catch (error) {
    return 'unknown';
  }
}

async function extractConfigFromPage(url) {
  try {
    console.log(`Fetching page to extract config: ${url}`);
    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      },
      timeout: 10000,
    });

    const html = response.data;

    // Extract sale_event_short_id (sale_id)
    const saleIdMatch = html.match(/"sale_event_short_id":"([^"]+)"/);
    const saleId = saleIdMatch ? saleIdMatch[1] : null;

    // Extract sellerId (external_id)
    const sellerIdMatch = html.match(/"sellerId":"([^"]+)"/);
    const sellerId = sellerIdMatch ? sellerIdMatch[1] : null;

    console.log(
      `Extracted from page - external_id: ${sellerId}, sale_id: ${saleId}`
    );

    return {
      external_id: sellerId,
      sale_id: saleId,
    };
  } catch (error) {
    console.error('Error extracting config from page:', error.message);
    return { external_id: null, sale_id: null };
  }
}

async function scrapePurchases(url, websiteConfig = {}) {
  try {
    console.log(`Scraping URL: ${url}`);

    const ids = extractProductIds(url);
    if (!ids) {
      console.error('Could not extract product IDs from URL');
      return [];
    }

    console.log(`Product ID: ${ids.productId}, SKU ID: ${ids.skuId}`);

    // If website_config is not provided or incomplete, try to extract from page
    let config = { ...websiteConfig };
    if (!config.external_id || !config.sale_id) {
      console.log('Website config incomplete, extracting from page...');
      const extractedConfig = await extractConfigFromPage(url);
      config.external_id = config.external_id || extractedConfig.external_id;
      config.sale_id = config.sale_id || extractedConfig.sale_id;
    }

    console.log(
      `Using config - external_id: ${config.external_id}, sale_id: ${config.sale_id}`
    );

    const urlObj = new URL(url);
    const baseDomain = urlObj.hostname;
    const apiUrl = `https://${baseDomain}/api/prashth/page/${ids.productId}/${ids.skuId}`;

    const params = {
      external_id: config.external_id,
      fbc: '',
      fbp: '',
      offer_params:
        '{"enable":true,"applied_coupon_codes":[],"pre_applied_coupon_codes":[]}',
      page_no: 1,
      page_size: 5,
      sale_id: config.sale_id,
    };

    const headers = {
      Accept: '*/*',
      'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
      Connection: 'keep-alive',
      Referer: url,
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      wm_device_type: 'mobile',
      wm_image_experiment: 'control',
      wm_lang: 'en',
      wm_platform: 'web',
      wm_pricing_cohort: '[]',
      wm_seller_website: baseDomain,
      wm_theme: 'premium',
      wm_video_experiment: 'control',
      wm_viewport: 'mobile',
      wm_web_version: '1.6',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      Cookie:
        '__wm_visitor_id=a3cdbd59846343c98a67b0834dac25db; _ga=GA1.1.1516941305.1749556790; _fbp=fb.1.1749556790621.339021267154647244; _fbc=fb.1.1754997368020.fbclid',
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
          widget.title === 'RECENT PURCHASE' ||
          widget.title === 'RECENT PURCHASES'
        ) {
          const entities = widget.entities || [];
          console.log(`Found ${entities.length} recent purchases`);
          return entities;
        }
      }
      console.log('No RECENT PURCHASE widget found');
    }

    return [];
  } catch (error) {
    console.error('Scraping error:', error.message);
    if (error.response) {
      console.error(`API returned status: ${error.response.status}`);
      console.error(`API response:`, error.response.data);
    }
    return [];
  }
}

async function storePurchases(purchases, maxMinutes = 60, websiteName) {
  const collection = await getCollection(purchasesCollection);
  if (!purchases || !collection) return 0;

  let storedCount = 0;
  const currentTime = new Date();

  for (const purchase of purchases) {
    const timeCta = purchase.time_cta || '';
    const minutesAgo = parseMinutes(timeCta);

    if (minutesAgo !== null && minutesAgo <= maxMinutes) {
      const purchaseDateTime = new Date(currentTime - minutesAgo * 60000);
      purchaseDateTime.setSeconds(0, 0);
      const purchaseDate = purchaseDateTime.toISOString().split('T')[0];
      const purchaseTime = purchaseDateTime.toTimeString().slice(0, 5);

      await collection.insertOne({
        product_name: purchase.product_name || '',
        product_id: purchase.product_short_id || '',
        customer_location: purchase.title || '',
        purchase_date: purchaseDate,
        purchase_time: purchaseTime,
        website: websiteName,
        created_at: new Date(),
      });
      storedCount++;
    }
  }
  return storedCount;
}

app.get('/health', async (req, res) => {
  let dbStatus = 'not configured';
  if (MONGODB_URL) {
    try {
      const collection = await getCollection(purchasesCollection);
      await collection.findOne({});
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = `error: ${error.message}`;
    }
  }
  res.json({
    status: 'healthy',
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/trigger', async (req, res) => {
  try {
    const intervalMinutes =
      req.body.interval_minutes || req.query.interval_minutes || 10;
    const productUrl = req.body.product_url || req.query.product_url;
    const websiteConfig = req.body.website_config || {};

    console.log('=== TRIGGER CALLED ===');
    console.log('Product URL:', productUrl);
    console.log('Interval:', intervalMinutes);
    console.log('Website Config:', websiteConfig);

    if (!productUrl) {
      return res.status(400).json({ error: 'product_url is required' });
    }

    const collection = await getCollection(purchasesCollection);
    if (!collection) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const purchases = await scrapePurchases(productUrl, websiteConfig);
    console.log(`Found ${purchases.length} purchases`);

    if (!purchases || purchases.length === 0) {
      return res.json({
        success: true,
        message: 'No purchases found',
        website: extractWebsiteName(productUrl),
        records_found: 0,
        records_stored: 0,
        all_purchases: [],
      });
    }

    const websiteName = extractWebsiteName(productUrl);
    const storedCount = await storePurchases(
      purchases,
      parseInt(intervalMinutes),
      websiteName
    );
    console.log(`Stored ${storedCount} purchases`);

    res.json({
      success: true,
      message: 'Monitoring completed successfully',
      website: websiteName,
      records_found: purchases.length,
      records_stored: storedCount,
      all_purchases: purchases,
    });
  } catch (error) {
    console.error('=== TRIGGER ERROR ===');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/scrape', async (req, res) => {
  try {
    const {
      product_url,
      interval_minutes = 10,
      website_config = {},
    } = req.body;

    if (!product_url) {
      return res.status(400).json({ error: 'product_url is required' });
    }

    console.log('=== MANUAL SCRAPE CALLED ===');
    console.log('Product URL:', product_url);
    console.log('Interval:', interval_minutes);
    console.log('Website Config:', website_config);

    const purchases = await scrapePurchases(product_url, website_config);
    console.log(`Found ${purchases.length} purchases`);

    if (!purchases || purchases.length === 0) {
      return res.json({
        success: true,
        message: 'No purchases found',
        website: extractWebsiteName(product_url),
        records_found: 0,
        filtered_purchases: [],
      });
    }

    const filteredPurchases = purchases.filter((purchase) => {
      const timeCta = purchase.time_cta || '';
      const minutesAgo = parseMinutes(timeCta);
      return minutesAgo !== null && minutesAgo <= parseInt(interval_minutes);
    });

    console.log(
      `Filtered to ${filteredPurchases.length} purchases within ${interval_minutes} minutes`
    );

    res.json({
      success: true,
      message: 'Scraping completed successfully',
      website: extractWebsiteName(product_url),
      records_found: purchases.length,
      filtered_records: filteredPurchases.length,
      all_purchases: purchases,
      filtered_purchases: filteredPurchases,
    });
  } catch (error) {
    console.error('=== MANUAL SCRAPE ERROR ===');
    console.error('Message:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/export', async (req, res) => {
  try {
    const collection = await getCollection(purchasesCollection);
    if (!collection) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const purchases = await collection
      .find({})
      .sort({ purchase_date: -1, purchase_time: -1 })
      .toArray();

    if (!purchases || purchases.length === 0) {
      const csvData = 'Product Name,Product ID,Customer,Date,Time,Website\n';
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=purchases.csv'
      );
      return res.send(csvData);
    }

    const csvLines = ['Product Name,Product ID,Customer,Date,Time,Website'];
    for (const p of purchases) {
      const line = `"${p.product_name}","${p.product_id}","${
        p.customer_location
      }","${p.purchase_date}","${p.purchase_time}","${p.website || ''}"`;
      csvLines.push(line);
    }

    const csvData = csvLines.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=purchases.csv');
    res.send(csvData);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// app.post('/api/scrape-common', async (req, res) => {
//   try {
//     // const {
//     //   product_url,
//     //   interval_minutes = 10,
//     //   website_config = {},
//     // } = req.body;

//     // Mongo query to fetch all website where we need monitoring

//     // temporary Hardcoded

//     const product_url = req.body.product_url;
//     const website_config = {};

//     if (!product_url) {
//       return res.status(400).json({ error: 'product_url is required' });
//     }

//     console.log('=== MANUAL SCRAPE CALLED ===');
//     console.log('Product URL:', product_url);
//     console.log('Website Config:', website_config);

//     const purchases = await scrapePurchases(product_url, website_config);
//     const url = new URL(product_url);

//     // console.log(url.hostname); // Output: shanaya.in
//     for (let index = 0; index < purchases.length; index++) {
//       let purchase = purchases[index];

//       // Get the Purchase time
//       purchase.purchasedAt = getPurchaseDateTime(purchase.time_cta);

//       // Add website info
//       purchase.hostname = url.hostname;

//       // Add scraped time
//       purchase.scrapedAt = new Date();
//     }

//     if (!purchases || purchases.length === 0) {
//       return res.json({
//         success: true,
//         message: 'No purchases found',
//         website: extractWebsiteName(product_url),
//         records_found: 0,
//         filtered_purchases: [],
//       });
//     }

//     // Get MongoDB connection
//     const collection = await getCollection(purchasesCollection);

//     if (!collection) {
//       return res.status(500).json({
//         error: 'MongoDB connection not available',
//       });
//     }

//     // Prepare bulk operations
//     const bulkOps = purchases.map((purchase) => ({
//       updateOne: {
//         filter: {
//           title: purchase.title,
//           product_short_id: purchase.product_short_id,
//           sku_short_id: purchase.sku_short_id,
//           hostname: purchase.hostname,
//         },
//         update: {
//           $set: purchase,
//           $setOnInsert: {
//             createdAt: new Date(),
//           },
//         },
//         upsert: true,
//       },
//     }));

//     // Execute bulk operation
//     const result = await collection.bulkWrite(bulkOps, { ordered: false });

//     console.log('Bulk write results:', {
//       inserted: result.upsertedCount,
//       updated: result.modifiedCount,
//       matched: result.matchedCount,
//     });

//     res.json({
//       success: true,
//       message: 'Scraping and storage completed successfully',
//       website: extractWebsiteName(product_url),
//       records_found: purchases.length,
//       inserted: result.upsertedCount,
//       updated: result.modifiedCount,
//       matched: result.matchedCount,
//       all_purchases: purchases,
//     });
//   } catch (error) {
//     console.error('=== MANUAL SCRAPE ERROR ===');
//     console.error('Message:', error.message);
//     console.error('Stack:', error.stack);
//     res.status(500).json({ error: error.message });
//   }
// });

app.get('/api/scrape-common', async (req, res) => {
  try {
    console.log('=== SCRAPE COMMON CALLED ===');

    // Get MongoDB connection for monitored websites
    const websitesCollection = await getCollection('monitored-websites');
    if (!websitesCollection) {
      return res.status(500).json({
        error: 'MongoDB connection not available',
      });
    }

    // Fetch all websites that need monitoring
    const monitoredWebsites = await websitesCollection.find({}).toArray();

    if (!monitoredWebsites || monitoredWebsites.length === 0) {
      return res.json({
        success: true,
        message: 'No websites to monitor',
        total_websites: 0,
        results: [],
      });
    }

    console.log(`Found ${monitoredWebsites.length} websites to monitor`);

    const results = [];
    let totalPurchasesFound = 0;
    let totalInserted = 0;
    let totalUpdated = 0;

    // Process each website
    for (const website of monitoredWebsites) {
      const product_url = website.website;
      const website_config = website.website_config || {};

      console.log(`Processing: ${product_url}`);

      try {
        const purchases = await scrapePurchases(product_url, website_config);
        const url = new URL(product_url);

        // Enhance purchase data
        for (let index = 0; index < purchases.length; index++) {
          let purchase = purchases[index];
          purchase.purchasedAt = getPurchaseDateTime(purchase.time_cta);
          purchase.hostname = url.hostname;
          purchase.scrapedAt = new Date();
        }

        if (purchases && purchases.length > 0) {
          // Get purchases collection
          const purchasesCollection = await getCollection('purchases-v2');

          // Prepare bulk operations
          const bulkOps = purchases.map((purchase) => ({
            updateOne: {
              filter: {
                title: purchase.title,
                product_short_id: purchase.product_short_id,
                sku_short_id: purchase.sku_short_id,
                hostname: purchase.hostname,
              },
              update: {
                $set: purchase,
                $setOnInsert: {
                  createdAt: new Date(),
                },
              },
              upsert: true,
            },
          }));

          // Execute bulk operation
          const result = await purchasesCollection.bulkWrite(bulkOps, {
            ordered: false,
          });

          totalPurchasesFound += purchases.length;
          totalInserted += result.upsertedCount;
          totalUpdated += result.modifiedCount;

          results.push({
            website: product_url,
            hostname: url.hostname,
            success: true,
            records_found: purchases.length,
            inserted: result.upsertedCount,
            updated: result.modifiedCount,
          });

          console.log(
            `${url.hostname}: Found ${purchases.length}, Inserted ${result.upsertedCount}, Updated ${result.modifiedCount}`
          );
        } else {
          results.push({
            website: product_url,
            hostname: url.hostname,
            success: true,
            records_found: 0,
            inserted: 0,
            updated: 0,
          });
          console.log(`${url.hostname}: No purchases found`);
        }
      } catch (error) {
        console.error(`Error processing ${product_url}:`, error.message);
        results.push({
          website: product_url,
          hostname: extractWebsiteName(product_url),
          success: false,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: 'Bulk scraping completed',
      total_websites: monitoredWebsites.length,
      total_purchases_found: totalPurchasesFound,
      total_inserted: totalInserted,
      total_updated: totalUpdated,
      results: results,
    });
  } catch (error) {
    console.error('=== SCRAPE COMMON ERROR ===');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/monitored-websites', async (req, res) => {
  try {
    const collection = await getCollection(websitesCollection);
    if (!collection) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const data = await collection.find({}).toArray();

    for (let i = 0; i < data.length; i++) {
      const websiteData = data[i];
      websiteData.host = new URL(websiteData.website).hostname;
    }

    // res.send(data);
    res.status(200).json({
      success: true,
      message: 'Monitored websites fetched successfully',
      websites: data,
    });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/add-website', async (req, res) => {
  try {
    const collection = await getCollection(websitesCollection);
    if (!collection) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { website_url } = req.body;
    if (!website_url) {
      return res.status(400).json({ error: 'website_url is required' });
    }

    await collection.insertOne({
      website: website_url,
      createdAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'Website added successfully',
      website: website_url,
    });
  } catch (error) {
    console.error('Add website error:', error);
    res.status(500).json({ error: error.message });
  }
});
