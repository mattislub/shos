const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

const db = require("./db");
const {
  hasSmtpConfig,
  sendOrderNotificationEmail,
  sendCustomerOrderConfirmationEmail,
  sendCustomerLoginCodeEmail
} = require("./mailer");

const app = express();
const port = process.env.PORT || 3001;

const uploadsDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

let productPriceColumnPromise;

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
    color_name: image.color_name || ""
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
    `SELECT image_url, color_name
     FROM store_product_images
     WHERE product_id = $1
     ORDER BY sort_order, id`,
    [product.id]
  );

  return mapProductWithImages(product, imagesResult.rows);
};

const loadHomeHeroImage = async () => {
  const result = await db.query(
    `SELECT home_hero_image_url
     FROM store_site_content
     ORDER BY id
     LIMIT 1`
  );

  return result.rows[0]?.home_hero_image_url || "";
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
    const product = await loadActiveProduct();
    const homeHeroImageUrl = await loadHomeHeroImage();

    if (!product) {
      return res.status(404).json({ message: "No active product found" });
    }

    return res.json({ product, home_hero_image_url: homeHeroImageUrl });
  } catch (error) {
    console.error("Failed to fetch active product", error);
    return res.status(500).json({ message: "Failed to load product" });
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
        `INSERT INTO store_site_content (home_hero_image_url)
         VALUES ($1)`,
        [imageUrl]
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
        await dbClient.query(
          `INSERT INTO store_product_images (product_id, image_url, color_name, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [product.id, imageUrl, imageColor, index]
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

app.post("/api/customer-auth/request-code", async (req, res) => {
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

app.post("/api/customer-auth/verify-code", async (req, res) => {
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

app.get("/api/customer/me/orders", requireCustomerSession, async (req, res) => {
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
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

start();
