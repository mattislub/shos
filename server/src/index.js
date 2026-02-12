const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const db = require("./db");

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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
