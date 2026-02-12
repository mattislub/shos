const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs/promises");
require("dotenv").config();

const db = require("./db");

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const productAssetsPath = path.join(
  __dirname,
  "..",
  "..",
  "client",
  "src",
  "assets",
  "products"
);

app.use("/product-assets", express.static(productAssetsPath));
app.use("/api/product-assets", express.static(productAssetsPath));

const parseImages = (value) => {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

app.get("/api/product", async (req, res) => {
  try {
    const productResult = await db.query(
      "SELECT * FROM products WHERE active = true LIMIT 1"
    );
    const product = productResult.rows[0];

    if (!product) {
      return res.status(404).json({ message: "No active product found" });
    }

    const variantsResult = await db.query(
      "SELECT * FROM variants WHERE product_id = $1 ORDER BY id",
      [product.id]
    );

    const settingsResult = await db.query("SELECT * FROM settings LIMIT 1");

    const variants = variantsResult.rows.map((variant) => ({
      ...variant,
      images: parseImages(variant.images),
    }));

    return res.json({
      product,
      variants,
      settings: settingsResult.rows[0] || null,
    });
  } catch (error) {
    console.error("Failed to fetch product data", error);
    return res.status(500).json({ message: "Failed to load product data" });
  }
});

app.get("/api/variants", async (req, res) => {
  try {
    const variantResult = await db.query(
      "SELECT id, color_name, color_hex, sku, images FROM variants ORDER BY id"
    );

    const variants = variantResult.rows.map((variant) => ({
      ...variant,
      images: parseImages(variant.images),
    }));

    return res.json({ variants });
  } catch (error) {
    console.error("Failed to fetch variants", error);
    return res.status(500).json({ message: "Failed to fetch variants" });
  }
});

app.get("/api/product-images", async (req, res) => {
  try {
    const files = await fs.readdir(productAssetsPath, { withFileTypes: true });
    const images = files
      .filter((file) => file.isFile())
      .map((file) => file.name)
      .filter((name) => /\.(png|jpe?g|webp|gif|avif)$/i.test(name))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        name,
        url: `/api/product-assets/${name}`,
      }));

    return res.json({ images });
  } catch (error) {
    console.error("Failed to list product images", error);
    return res.status(500).json({ message: "Failed to list product images" });
  }
});

app.post("/api/variants", async (req, res) => {
  const { color_name, color_hex, sku, price_override, stock_qty, images } = req.body || {};

  if (!color_name || !sku) {
    return res.status(400).json({ message: "color_name and sku are required" });
  }

  const stockQty = Number(stock_qty);
  if (!Number.isInteger(stockQty) || stockQty < 0) {
    return res.status(400).json({ message: "stock_qty must be a non-negative integer" });
  }

  const priceOverride =
    price_override === null || price_override === undefined || price_override === ""
      ? null
      : Number(price_override);

  if (priceOverride !== null && (!Number.isInteger(priceOverride) || priceOverride < 0)) {
    return res.status(400).json({ message: "price_override must be a non-negative integer" });
  }

  const cleanImages = Array.isArray(images)
    ? images.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean)
    : [];

  try {
    const productResult = await db.query(
      "SELECT id FROM products WHERE active = true ORDER BY id LIMIT 1"
    );
    const activeProduct = productResult.rows[0];

    if (!activeProduct) {
      return res.status(404).json({ message: "No active product found" });
    }

    const existingSku = await db.query("SELECT id FROM variants WHERE sku = $1 LIMIT 1", [sku]);
    if (existingSku.rows.length) {
      return res.status(409).json({ message: "SKU already exists" });
    }

    const insertResult = await db.query(
      `INSERT INTO variants (product_id, color_name, color_hex, sku, price_override, stock_qty, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, product_id, color_name, color_hex, sku, price_override, stock_qty, images`,
      [
        activeProduct.id,
        String(color_name).trim(),
        color_hex ? String(color_hex).trim() : null,
        String(sku).trim(),
        priceOverride,
        stockQty,
        JSON.stringify(cleanImages),
      ]
    );

    return res.status(201).json({
      variant: {
        ...insertResult.rows[0],
        images: parseImages(insertResult.rows[0].images),
      },
    });
  } catch (error) {
    console.error("Failed to create variant", error);
    return res.status(500).json({ message: "Failed to create variant" });
  }
});

app.put("/api/variants/:id/images", async (req, res) => {
  const variantId = Number(req.params.id);
  const inputImages = Array.isArray(req.body?.images) ? req.body.images : null;

  if (!Number.isInteger(variantId) || variantId <= 0) {
    return res.status(400).json({ message: "Invalid variant id" });
  }

  if (!inputImages) {
    return res.status(400).json({ message: "images must be an array" });
  }

  const cleanedImages = inputImages
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  try {
    const result = await db.query(
      "UPDATE variants SET images = $1 WHERE id = $2 RETURNING id, color_name, images",
      [JSON.stringify(cleanedImages), variantId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Variant not found" });
    }

    return res.json({
      variant: {
        ...result.rows[0],
        images: parseImages(result.rows[0].images),
      },
    });
  } catch (error) {
    console.error("Failed to save variant images", error);
    return res.status(500).json({ message: "Failed to save images" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

if (process.env.NODE_ENV === "production") {
  const clientPath = path.join(__dirname, "..", "..", "client", "dist");
  app.use(express.static(clientPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientPath, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
