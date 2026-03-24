const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
require("dotenv").config();

const db = require("./db");
const {
  hasSmtpConfig,
  sendOrderNotificationEmail,
  sendCustomerOrderConfirmationEmail,
  sendCustomerLoginCodeEmail,
  sendContactRequestEmail
} = require("./mailer");

const app = express();
const port = process.env.PORT || 3001;

const uploadsDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const DEFAULT_HOME_HERO_IMAGE =
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1800&q=80";
const DEFAULT_STORE_LOCATIONS = [
  { storeName: "Crocspot", storeAddress: "80 Truman Ave. Apt. 111, Spring Valley, NY 10977" },
  { storeName: "Designer Step", storeAddress: "74 Lee Ave., Brooklyn, NY 11211" },
  { storeName: "Frankel's Designer Shoes", storeAddress: "100 Route 59 Suite 11, Monsey, NY 10952" },
  { storeName: "Hatzlucha Shoes", storeAddress: "48 Bakertown Rd., Monroe, NY 10950" },
  { storeName: "Marvel", storeAddress: "218 Wallabout St., Brooklyn, NY 11205" },
  { storeName: "Mens Footwear", storeAddress: "51 Forest Rd #205, Monroe, NY 10950" },
  { storeName: "your shoo", storeAddress: "5001 18th Ave., Brooklyn, NY 11204" },
  { storeName: "Shoe Barn", storeAddress: "11 Main St., Monsey, NY 10952" },
  { storeName: "Shoe Gardens", storeAddress: "157 Lee Ave., Brooklyn, NY 11211" },
  { storeName: "Shoe Palace NJ", storeAddress: "6951 US 9 Unit 8, Howell, NJ 07731" },
  { storeName: "Step In Elegance", storeAddress: "268 Cedar Bridge Ave., Lakewood, NJ 08701" },
  { storeName: "Weingarten shoes", storeAddress: "27 Orchard St #206, Monsey, NY 10952" },
  { storeName: "Shoe Laces", storeAddress: "5303 13th Ave., Brooklyn, NY 11219" },
  { storeName: "Men's Shoes Special", storeAddress: "2 Lee Ave., Brooklyn, NY 11211" }
];

let productPriceColumnPromise;

const SHABBAT_LOCATION = {
  name: "Brooklyn, New York",
  latitude: 40.6501,
  longitude: -73.9496,
  timezone: "America/New_York"
};
const SHABBAT_API_CACHE_TTL_MS = 5 * 60 * 1000;

let shabbatStatusCache = {
  value: null,
  expiresAt: 0
};

const httpsGetJson = (url) => new Promise((resolve, reject) => {
  https.get(url, (response) => {
    let rawData = "";

    response.on("data", (chunk) => {
      rawData += chunk;
    });

    response.on("end", () => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`Hebcal request failed with status ${response.statusCode}`));
        return;
      }

      try {
        resolve(JSON.parse(rawData));
      } catch (error) {
        reject(new Error(`Failed to parse Hebcal response: ${error.message}`));
      }
    });
  }).on("error", reject);
});

const findHebcalItemByCategory = (items, category) => (Array.isArray(items)
  ? items.find((item) => item?.category === category && item?.date)
  : null);

const buildShabbatStatusPayload = ({ candles, havdalah, fetchedAt, source }) => {
  const now = new Date();
  const candlesAt = candles?.date ? new Date(candles.date) : null;
  const havdalahAt = havdalah?.date ? new Date(havdalah.date) : null;
  const isClosed = Boolean(candlesAt && havdalahAt && now >= candlesAt && now < havdalahAt);

  return {
    isClosed,
    locationName: SHABBAT_LOCATION.name,
    timezone: SHABBAT_LOCATION.timezone,
    fetchedAt,
    source,
    closesAt: candlesAt ? candlesAt.toISOString() : null,
    reopensAt: havdalahAt ? havdalahAt.toISOString() : null,
    message: isClosed
      ? "The store is closed for Shabbat and will reopen after Havdalah in Brooklyn, New York."
      : "The store is open."
  };
};

const fetchBrooklynShabbatStatus = async () => {
  const params = new URLSearchParams({
    cfg: "json",
    latitude: String(SHABBAT_LOCATION.latitude),
    longitude: String(SHABBAT_LOCATION.longitude),
    tzid: SHABBAT_LOCATION.timezone,
    M: "on",
    leyning: "off"
  });

  const payload = await httpsGetJson(`https://www.hebcal.com/shabbat?${params.toString()}`);
  const candles = findHebcalItemByCategory(payload?.items, "candles");
  const havdalah = findHebcalItemByCategory(payload?.items, "havdalah");

  if (!candles || !havdalah) {
    throw new Error("Hebcal response is missing candle-lighting or Havdalah times");
  }

  return buildShabbatStatusPayload({
    candles,
    havdalah,
    fetchedAt: new Date().toISOString(),
    source: "hebcal-shabbat-api"
  });
};

const getShabbatStatus = async () => {
  if (shabbatStatusCache.value && Date.now() < shabbatStatusCache.expiresAt) {
    return shabbatStatusCache.value;
  }

  try {
    const status = await fetchBrooklynShabbatStatus();
    shabbatStatusCache = {
      value: status,
      expiresAt: Date.now() + SHABBAT_API_CACHE_TTL_MS
    };
    return status;
  } catch (error) {
    if (shabbatStatusCache.value) {
      console.warn("Falling back to cached Shabbat status", { message: error.message });
      return shabbatStatusCache.value;
    }

    console.error("Failed to load Shabbat status", error);
    return {
      isClosed: false,
      locationName: SHABBAT_LOCATION.name,
      timezone: SHABBAT_LOCATION.timezone,
      fetchedAt: new Date().toISOString(),
      source: "fallback-open",
      closesAt: null,
      reopensAt: null,
      message: "The store is open."
    };
  }
};

const requireStoreOpen = async (_req, res, next) => {
  const shabbatStatus = await getShabbatStatus();
  if (shabbatStatus.isClosed) {
    return res.status(403).json({
      message: shabbatStatus.message,
      shabbat_status: shabbatStatus
    });
  }

  return next();
};

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use("/uploads", express.static(uploadsDir));

const adminUsername = (process.env.ADMIN_USERNAME || "admin").trim();
const adminPassword = (process.env.ADMIN_PASSWORD || "admin123").trim();

const customerCodeExpiresMinutes = Number(process.env.CUSTOMER_LOGIN_CODE_EXPIRES_MINUTES || 10);
const customerSessionExpiresDays = Number(process.env.CUSTOMER_SESSION_EXPIRES_DAYS || 30);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeCustomerEmail = (value) => String(value || "").trim().toLowerCase();

const hashLoginCode = (email, code) => crypto
  .createHash("sha256")
  .update(`${normalizeCustomerEmail(email)}:${String(code)}`)
  .digest("hex");

const createOtpCode = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");

const createSessionToken = () => crypto.randomBytes(32).toString("hex");

const requireCustomerSession = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Customer authentication is required" });
  }

  const sessionToken = authHeader.slice(7).trim();
  if (!sessionToken) {
    return res.status(401).json({ message: "Customer authentication is required" });
  }

  try {
    const sessionResult = await db.query(
      `SELECT email
       FROM customer_sessions
       WHERE session_token = $1
         AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1`,
      [sessionToken]
    );

    const session = sessionResult.rows[0];
    if (!session) {
      return res.status(401).json({ message: "Customer session is invalid or expired" });
    }

    req.customerEmail = session.email;
    req.customerSessionToken = sessionToken;
    return next();
  } catch (error) {
    console.error("Failed to validate customer session", error);
    return res.status(500).json({ message: "Failed to validate customer session" });
  }
};

const requireAdminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="Admin Area"');
    return res.status(401).json({ message: "Admin authentication is required" });
  }

  const token = authHeader.slice(6).trim();
  let decoded = "";

  try {
    decoded = Buffer.from(token, "base64").toString("utf8");
  } catch (_error) {
    decoded = "";
  }

  const separatorIndex = decoded.indexOf(":");
  const username = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : "";
  const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

  if (username !== adminUsername || password !== adminPassword) {
    res.set("WWW-Authenticate", 'Basic realm="Admin Area"');
    return res.status(401).json({ message: "Invalid admin credentials" });
  }

  return next();
};

const mapProductWithImages = (row, imageRows) => {
  const images = imageRows.map((image) => image.image_url);
  const imageEntries = imageRows.map((image) => ({
    image_url: image.image_url,
    color_name: image.color_name || "",
    color_quantity: Number(image.color_quantity || 0)
  }));
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    price_usd: row.price_usd,
    cta_text: row.cta_text,
    image_url: images[0] || "",
    images,
    image_entries: imageEntries
  };
};

const resolveProductPriceColumn = async () => {
  if (!productPriceColumnPromise) {
    productPriceColumnPromise = (async () => {
      const columnResult = await db.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'store_products'
           AND column_name IN ('price_usd', 'price_ils')`
      );

      const columnNames = columnResult.rows.map((row) => row.column_name);

      if (columnNames.includes("price_usd")) {
        return "price_usd";
      }

      if (columnNames.includes("price_ils")) {
        return "price_ils";
      }

      throw new Error("Missing expected price column on store_products");
    })().catch((error) => {
      productPriceColumnPromise = undefined;
      throw error;
    });
  }

  return productPriceColumnPromise;
};

const loadActiveProduct = async () => {
  const priceColumn = await resolveProductPriceColumn();
  const productResult = await db.query(
    `SELECT id, slug, title, description, ${priceColumn} AS price_usd, cta_text
     FROM store_products
     WHERE is_active = true
     ORDER BY id
     LIMIT 1`
  );

  const product = productResult.rows[0];
  if (!product) {
    return null;
  }

  const imagesResult = await db.query(
    `SELECT image_url, color_name, color_quantity
     FROM store_product_images
     WHERE product_id = $1
     ORDER BY sort_order, id`,
    [product.id]
  );

  return mapProductWithImages(product, imagesResult.rows);
};

const loadSiteContent = async () => {
  const result = await db.query(
    `SELECT home_hero_image_url, shipping_price_usd
     FROM store_site_content
     ORDER BY id
     LIMIT 1`
  );

  return {
    homeHeroImageUrl: result.rows[0]?.home_hero_image_url || "",
    shippingPriceUsd: Number(result.rows[0]?.shipping_price_usd || 0)
  };
};

const loadStoreLocations = async () => {
  const result = await db.query(
    `SELECT id, store_name, store_address
     FROM store_locations
     ORDER BY sort_order, id`
  );

  return result.rows.map((row) => ({
    id: row.id,
    store_name: row.store_name,
    store_address: row.store_address
  }));
};

const ensureCustomerAuthTables = async () => {
  await db.query(
    `CREATE TABLE IF NOT EXISTS customer_login_codes (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS customer_sessions (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      session_token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
};

const ensureStoreOrdersCustomerEmailColumn = async () => {
  await db.query(
    `ALTER TABLE store_orders
     ADD COLUMN IF NOT EXISTS customer_email TEXT`
  );
};

const ensureStoreSiteContentShippingPriceColumn = async () => {
  await db.query(
    `ALTER TABLE store_site_content
     ADD COLUMN IF NOT EXISTS shipping_price_usd INTEGER NOT NULL DEFAULT 0`
  );

  await db.query(
    `UPDATE store_site_content
     SET shipping_price_usd = 0
     WHERE shipping_price_usd IS NULL OR shipping_price_usd < 0`
  );
};

const ensureStoreLocationsTable = async () => {
  await db.query(
    `CREATE TABLE IF NOT EXISTS store_locations (
      id SERIAL PRIMARY KEY,
      store_name TEXT NOT NULL,
      store_address TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );

  const countResult = await db.query("SELECT COUNT(*)::INTEGER AS total FROM store_locations");
  const totalRows = Number(countResult.rows[0]?.total || 0);
  if (totalRows > 0) {
    return;
  }

  for (const [index, location] of DEFAULT_STORE_LOCATIONS.entries()) {
    await db.query(
      `INSERT INTO store_locations (store_name, store_address, sort_order)
       VALUES ($1, $2, $3)`,
      [location.storeName, location.storeAddress, index]
    );
  }
};

const ensureMensSpecialStoreLocation = async () => {
  const mensSpecialLocation = DEFAULT_STORE_LOCATIONS.find(
    (location) => location.storeName === "Men's Shoes Special"
  );

  if (!mensSpecialLocation) {
    return;
  }

  await db.query(
    `INSERT INTO store_locations (store_name, store_address, sort_order)
     SELECT $1, $2, COALESCE(MAX(sort_order), -1) + 1
     FROM store_locations
     WHERE NOT EXISTS (
       SELECT 1
       FROM store_locations
       WHERE store_name = $1
     )`,
    [mensSpecialLocation.storeName, mensSpecialLocation.storeAddress]
const ensureStoreProductImagesColorQuantityColumn = async () => {
  await db.query(
    `ALTER TABLE store_product_images
     ADD COLUMN IF NOT EXISTS color_quantity INTEGER NOT NULL DEFAULT 0`
  );

  await db.query(
    `UPDATE store_product_images
     SET color_quantity = 0
     WHERE color_quantity IS NULL OR color_quantity < 0`
  );
};

const saveBase64Image = (imagePayload) => {
  const { name, data } = imagePayload || {};
  if (!name || !data || typeof name !== "string" || typeof data !== "string") {
    throw new Error("Invalid image payload");
  }

  const matches = data.match(/^data:(.+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid image data format");
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  if (!mimeType.startsWith("image/")) {
    throw new Error(`Unsupported mime type: ${mimeType}`);
  }

  const mimeExtension = mimeType.split("/")[1] || "bin";
  const safeName = name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const originalExtension = path.extname(safeName).replace(".", "").toLowerCase();

  const extension = originalExtension || mimeExtension;
  const finalName = originalExtension ? safeName : `${safeName}.${extension}`;
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${finalName}`;
  const filePath = path.join(uploadsDir, filename);

  fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));

  if (originalExtension && originalExtension !== mimeExtension) {
    console.warn("[admin] image extension mismatch", {
      originalName: name,
      originalExtension,
      mimeType,
      mimeExtension,
      savedFile: filename
    });
  }

  return `/uploads/${filename}`;
};

const resolveImageUrl = (imagePayload) => {
  if (imagePayload?.image_url && typeof imagePayload.image_url === "string") {
    return imagePayload.image_url;
  }

  return saveBase64Image(imagePayload);
};

app.get("/api/product", async (_req, res) => {
  try {
    const [product, siteContent, shabbatStatus] = await Promise.all([
      loadActiveProduct(),
      loadSiteContent(),
      getShabbatStatus()
    ]);

    if (!product) {
      return res.status(404).json({ message: "No active product found" });
    }

    return res.json({
      product,
      home_hero_image_url: siteContent.homeHeroImageUrl,
      shipping_price_usd: siteContent.shippingPriceUsd,
      shabbat_status: shabbatStatus
    });
  } catch (error) {
    console.error("Failed to fetch active product", error);
    return res.status(500).json({ message: "Failed to load product" });
  }
});

app.get("/api/stores", async (_req, res) => {
  try {
    const stores = await loadStoreLocations();
    return res.json({ stores });
  } catch (error) {
    console.error("Failed to load store locations", error);
    return res.status(500).json({ message: "Failed to load store locations" });
  }
});

app.get("/api/admin/stores", requireAdminAuth, async (_req, res) => {
  try {
    const stores = await loadStoreLocations();
    return res.json({ stores });
  } catch (error) {
    console.error("Failed to load admin store locations", error);
    return res.status(500).json({ message: "Failed to load store locations" });
  }
});

app.post("/api/admin/stores", requireAdminAuth, async (req, res) => {
  const storeName = String(req.body?.store_name || "").trim();
  const storeAddress = String(req.body?.store_address || "").trim();

  if (!storeName || !storeAddress) {
    return res.status(400).json({ message: "store_name and store_address are required" });
  }

  try {
    const nextSortOrderResult = await db.query("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order FROM store_locations");
    const nextSortOrder = Number(nextSortOrderResult.rows[0]?.next_sort_order || 0);

    const insertResult = await db.query(
      `INSERT INTO store_locations (store_name, store_address, sort_order)
       VALUES ($1, $2, $3)
       RETURNING id, store_name, store_address`,
      [storeName, storeAddress, nextSortOrder]
    );

    return res.status(201).json({ store: insertResult.rows[0] });
  } catch (error) {
    console.error("Failed to create store location", error);
    return res.status(500).json({ message: "Failed to create store location" });
  }
});

app.put("/api/admin/home-hero", requireAdminAuth, async (req, res) => {
  const { image } = req.body || {};

  if (!image || typeof image !== "object") {
    return res.status(400).json({ message: "image is required" });
  }

  try {
    const imageUrl = saveBase64Image(image);

    const existingResult = await db.query("SELECT id FROM store_site_content ORDER BY id LIMIT 1");
    const existing = existingResult.rows[0];

    if (!existing) {
      await db.query(
        `INSERT INTO store_site_content (home_hero_image_url, shipping_price_usd)
         VALUES ($1, $2)`,
        [imageUrl, 0]
      );
    } else {
      await db.query(
        `UPDATE store_site_content
         SET home_hero_image_url = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [imageUrl, existing.id]
      );
    }

    return res.json({ home_hero_image_url: imageUrl });
  } catch (error) {
    console.error("Failed to update home hero image", error);
    return res.status(500).json({ message: "Failed to update home hero image" });
  }
});

app.put("/api/admin/shipping-price", requireAdminAuth, async (req, res) => {
  const parsedShippingPrice = Number(req.body?.shipping_price_usd);

  if (!Number.isInteger(parsedShippingPrice) || parsedShippingPrice < 0) {
    return res.status(400).json({ message: "shipping_price_usd must be a non-negative integer" });
  }

  try {
    const existingResult = await db.query("SELECT id, home_hero_image_url FROM store_site_content ORDER BY id LIMIT 1");
    const existing = existingResult.rows[0];

    if (!existing) {
      await db.query(
        `INSERT INTO store_site_content (home_hero_image_url, shipping_price_usd)
         VALUES ($1, $2)`,
        [DEFAULT_HOME_HERO_IMAGE, parsedShippingPrice]
      );
    } else {
      await db.query(
        `UPDATE store_site_content
         SET shipping_price_usd = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [parsedShippingPrice, existing.id]
      );
    }

    return res.json({ shipping_price_usd: parsedShippingPrice });
  } catch (error) {
    console.error("Failed to update shipping price", error);
    return res.status(500).json({ message: "Failed to update shipping price" });
  }
});

app.post("/api/contact-requests", async (req, res) => {
  const message = String(req.body?.message || "").trim();

  if (!message) {
    return res.status(400).json({ message: "message is required" });
  }

  try {
    const emailResult = await sendContactRequestEmail({
      message,
      createdAt: new Date().toISOString()
    });

    if (emailResult.skipped) {
      return res.status(503).json({ message: "Contact email is not configured" });
    }

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error("Failed to send contact request", error);
    return res.status(500).json({ message: "Failed to send contact request" });
  }
});

app.post("/api/orders", async (req, res) => {
  const { customer_name, phone, quantity, customer_email } = req.body || {};

  if (!customer_name || !phone) {
    return res.status(400).json({ message: "customer_name and phone are required" });
  }

  const cleanedCustomerEmail = normalizeCustomerEmail(customer_email);
  if (cleanedCustomerEmail) {
    if (!emailPattern.test(cleanedCustomerEmail)) {
      return res.status(400).json({ message: "customer_email must be a valid email" });
    }
  }

  const parsedQuantity = Number(quantity);
  if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
    return res.status(400).json({ message: "quantity must be a positive integer" });
  }

  try {
    const productResult = await db.query(
      "SELECT id, title FROM store_products WHERE is_active = true ORDER BY id LIMIT 1"
    );

    const product = productResult.rows[0];
    if (!product) {
      return res.status(404).json({ message: "No active product found" });
    }

    const cleanedCustomerName = String(customer_name).trim();
    const cleanedPhone = String(phone).trim();

    const orderResult = await db.query(
      `INSERT INTO store_orders (product_id, customer_name, phone, customer_email, quantity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, status, created_at`,
      [product.id, cleanedCustomerName, cleanedPhone, cleanedCustomerEmail || null, parsedQuantity]
    );

    const order = orderResult.rows[0];

    try {
      const emailResult = await sendOrderNotificationEmail({
        orderId: order.id,
        customerName: cleanedCustomerName,
        phone: cleanedPhone,
        quantity: parsedQuantity,
        productTitle: product.title,
        createdAt: order.created_at
      });

      if (emailResult.skipped) {
        console.info("Order created without email notification", {
          orderId: order.id,
          reason: emailResult.reason
        });
      }
    } catch (emailError) {
      console.error("Order created but failed to send notification email", {
        orderId: order.id,
        message: emailError?.message
      });
    }

    if (cleanedCustomerEmail) {
      try {
        await sendCustomerOrderConfirmationEmail({
          orderId: order.id,
          customerName: cleanedCustomerName,
          customerEmail: cleanedCustomerEmail,
          quantity: parsedQuantity,
          productTitle: product.title
        });
      } catch (customerEmailError) {
        console.error("Order created but failed to send customer confirmation email", {
          orderId: order.id,
          customerEmail: cleanedCustomerEmail,
          message: customerEmailError?.message
        });
      }
    }

    return res.status(201).json({ order });
  } catch (error) {
    console.error("Failed to create order", error);
    return res.status(500).json({ message: "Failed to create order" });
  }
});

app.put("/api/admin/product", requireAdminAuth, async (req, res) => {
  const { title, description, price_usd, cta_text, images } = req.body || {};

  console.info("[admin] update product request received", {
    hasTitle: Boolean(title),
    hasDescription: Boolean(description),
    hasCtaText: Boolean(cta_text),
    imagesType: Array.isArray(images) ? "array" : typeof images,
    imagesCount: Array.isArray(images) ? images.length : 0
  });

  if (!title || !description || !cta_text) {
    return res.status(400).json({ message: "title, description and cta_text are required" });
  }

  const parsedPrice = Number(price_usd);
  if (!Number.isInteger(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({ message: "price_usd must be a non-negative integer" });
  }

  if (images && !Array.isArray(images)) {
    return res.status(400).json({ message: "images must be an array" });
  }

  if (Array.isArray(images)) {
    const hasImageWithoutColor = images.some((image) => !String(image?.color_name || "").trim());
    if (hasImageWithoutColor) {
      return res.status(400).json({ message: "every uploaded image must include color_name" });
    }

    const hasInvalidImagePayload = images.some((image) => {
      const hasImageUrl = typeof image?.image_url === "string" && image.image_url.trim().length > 0;
      const hasUploadPayload = typeof image?.data === "string" && typeof image?.name === "string";
      return !hasImageUrl && !hasUploadPayload;
    });

    if (hasInvalidImagePayload) {
      return res.status(400).json({ message: "each image must include image_url or upload payload" });
    }

    const hasInvalidColorQuantity = images.some((image) => {
      const parsedColorQuantity = Number(image?.color_quantity);
      return !Number.isInteger(parsedColorQuantity) || parsedColorQuantity < 0;
    });

    if (hasInvalidColorQuantity) {
      return res.status(400).json({ message: "each image must include color_quantity as a non-negative integer" });
    }
  }

  const dbClient = await db.connect();
  let isTransactionOpen = false;

  try {
    const priceColumn = await resolveProductPriceColumn();

    await dbClient.query("BEGIN");
    isTransactionOpen = true;

    const productResult = await dbClient.query(
      "SELECT id FROM store_products WHERE is_active = true ORDER BY id LIMIT 1"
    );

    const product = productResult.rows[0];
    if (!product) {
      await dbClient.query("ROLLBACK");
      isTransactionOpen = false;
      return res.status(404).json({ message: "No active product found" });
    }

    await dbClient.query(
      `UPDATE store_products
       SET title = $1,
           description = $2,
           ${priceColumn} = $3,
           cta_text = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [String(title).trim(), String(description).trim(), parsedPrice, String(cta_text).trim(), product.id]
    );

    if (Array.isArray(images) && images.length > 0) {
      console.info("[admin] processing uploaded images", {
        requestedCount: images.length,
        names: images.map((image) => image?.name || "unknown")
      });

      const imageUrls = images.map(resolveImageUrl);

      console.info("[admin] image files saved to disk", {
        savedCount: imageUrls.length,
        imageUrls
      });

      await dbClient.query("DELETE FROM store_product_images WHERE product_id = $1", [product.id]);
      for (const [index, imageUrl] of imageUrls.entries()) {
        const imageColor = String(images[index]?.color_name || "").trim();
        const imageColorQuantity = Number(images[index]?.color_quantity);
        await dbClient.query(
          `INSERT INTO store_product_images (product_id, image_url, color_name, color_quantity, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [product.id, imageUrl, imageColor, imageColorQuantity, index]
        );
      }
    }

    await dbClient.query("COMMIT");
    isTransactionOpen = false;

    const updatedProduct = await loadActiveProduct();
    console.info("[admin] update product response summary", {
      returnedImagesCount: updatedProduct?.images?.length || 0,
      returnedImages: updatedProduct?.images || []
    });

    if (Array.isArray(images) && images.length > 1 && (updatedProduct?.images?.length || 0) <= 1) {
      console.warn(
        "[admin] multiple upload diagnostic: request included multiple images but response has one (or zero). Check DB insert loop and constraints."
      );
    }

    if (Array.isArray(images) && images.length > 0 && (updatedProduct?.images?.length || 0) === 0) {
      console.warn(
        "[admin] image display diagnostic: images were uploaded but no image URLs were returned. Check /uploads static serving and store_product_images rows."
      );
    }

    return res.json({ product: updatedProduct });
  } catch (error) {
    if (isTransactionOpen) {
      await dbClient.query("ROLLBACK");
    }
    console.error("Failed to update product", error);
    return res.status(500).json({ message: "Failed to update product" });
  } finally {
    dbClient.release();
  }
});


app.get("/api/admin/orders", requireAdminAuth, async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT
         o.id,
         o.customer_name,
         o.phone,
         o.quantity,
         o.status,
         o.created_at,
         p.title AS product_title
       FROM store_orders o
       INNER JOIN store_products p ON p.id = o.product_id
       ORDER BY o.created_at DESC`
    );

    return res.json({ orders: result.rows });
  } catch (error) {
    console.error("Failed to load admin orders", error);
    return res.status(500).json({ message: "Failed to load orders" });
  }
});

app.get("/api/admin/customers", requireAdminAuth, async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT
         phone,
         (ARRAY_AGG(customer_name ORDER BY created_at DESC))[1] AS customer_name,
         COUNT(*)::INTEGER AS total_orders,
         COALESCE(SUM(quantity), 0)::INTEGER AS total_items,
         MAX(created_at) AS last_order_at,
         CASE
           WHEN MAX(created_at) >= NOW() - INTERVAL '7 days' THEN 'active'
           WHEN MAX(created_at) >= NOW() - INTERVAL '30 days' THEN 'at_risk'
           ELSE 'inactive'
         END AS visitor_status
       FROM store_orders
       GROUP BY phone
       ORDER BY MAX(created_at) DESC`
    );

    return res.json({ customers: result.rows });
  } catch (error) {
    console.error("Failed to load admin customers", error);
    return res.status(500).json({ message: "Failed to load customers" });
  }
});

app.post("/api/customer-auth/request-code", requireStoreOpen, async (req, res) => {
  const cleanedCustomerEmail = normalizeCustomerEmail(req.body?.email);

  if (!cleanedCustomerEmail || !emailPattern.test(cleanedCustomerEmail)) {
    return res.status(400).json({ message: "email must be a valid email" });
  }

  const loginCode = createOtpCode();
  const codeHash = hashLoginCode(cleanedCustomerEmail, loginCode);

  try {
    await db.query(
      `INSERT INTO customer_login_codes (email, code_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3::text || ' minutes')::interval)`,
      [cleanedCustomerEmail, codeHash, customerCodeExpiresMinutes]
    );

    try {
      const emailResult = await sendCustomerLoginCodeEmail({
        customerEmail: cleanedCustomerEmail,
        code: loginCode,
        expiresInMinutes: customerCodeExpiresMinutes
      });

      if (emailResult.skipped) {
        console.warn("Customer login code email skipped", {
          customerEmail: cleanedCustomerEmail,
          reason: emailResult.reason
        });
      }
    } catch (emailError) {
      console.error("Failed to send customer login code email", {
        customerEmail: cleanedCustomerEmail,
        message: emailError?.message
      });
    }

    return res.status(201).json({ message: "If this email exists, a login code has been sent" });
  } catch (error) {
    console.error("Failed to request customer login code", error);
    return res.status(500).json({ message: "Failed to request login code" });
  }
});

app.post("/api/customer-auth/verify-code", requireStoreOpen, async (req, res) => {
  const cleanedCustomerEmail = normalizeCustomerEmail(req.body?.email);
  const submittedCode = String(req.body?.code || "").trim();

  if (!cleanedCustomerEmail || !emailPattern.test(cleanedCustomerEmail)) {
    return res.status(400).json({ message: "email must be a valid email" });
  }

  if (!/^\d{6}$/.test(submittedCode)) {
    return res.status(400).json({ message: "code must be exactly 6 digits" });
  }

  const codeHash = hashLoginCode(cleanedCustomerEmail, submittedCode);

  const dbClient = await db.connect();
  let isTransactionOpen = false;

  try {
    await dbClient.query("BEGIN");
    isTransactionOpen = true;

    const codeResult = await dbClient.query(
      `SELECT id
       FROM customer_login_codes
       WHERE email = $1
         AND code_hash = $2
         AND consumed_at IS NULL
         AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [cleanedCustomerEmail, codeHash]
    );

    const loginCodeRow = codeResult.rows[0];

    if (!loginCodeRow) {
      await dbClient.query("ROLLBACK");
      isTransactionOpen = false;
      return res.status(401).json({ message: "Invalid or expired code" });
    }

    await dbClient.query(
      `UPDATE customer_login_codes
       SET consumed_at = NOW()
       WHERE id = $1`,
      [loginCodeRow.id]
    );

    const sessionToken = createSessionToken();

    const sessionResult = await dbClient.query(
      `INSERT INTO customer_sessions (email, session_token, expires_at)
       VALUES ($1, $2, NOW() + ($3::text || ' days')::interval)
       RETURNING expires_at`,
      [cleanedCustomerEmail, sessionToken, customerSessionExpiresDays]
    );

    await dbClient.query("COMMIT");
    isTransactionOpen = false;

    return res.json({
      session_token: sessionToken,
      email: cleanedCustomerEmail,
      expires_at: sessionResult.rows[0].expires_at
    });
  } catch (error) {
    if (isTransactionOpen) {
      await dbClient.query("ROLLBACK");
    }
    console.error("Failed to verify customer login code", error);
    return res.status(500).json({ message: "Failed to verify login code" });
  } finally {
    dbClient.release();
  }
});

app.get("/api/customer/me/orders", requireStoreOpen, requireCustomerSession, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         o.id,
         o.customer_name,
         o.customer_email,
         o.phone,
         o.quantity,
         o.status,
         o.created_at,
         p.title AS product_title
       FROM store_orders o
       INNER JOIN store_products p ON p.id = o.product_id
       WHERE o.customer_email = $1
       ORDER BY o.created_at DESC`,
      [req.customerEmail]
    );

    return res.json({ email: req.customerEmail, orders: result.rows });
  } catch (error) {
    console.error("Failed to load customer order history", error);
    return res.status(500).json({ message: "Failed to load customer order history" });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, smtpConfigured: hasSmtpConfig() });
});

const start = async () => {
  try {
    await ensureCustomerAuthTables();
    await ensureStoreOrdersCustomerEmailColumn();
    await ensureStoreSiteContentShippingPriceColumn();
    await ensureStoreLocationsTable();
    await ensureMensSpecialStoreLocation();
    await ensureStoreProductImagesColorQuantityColumn();

    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

start();
