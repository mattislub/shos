const express = require("express");
const cors = require("cors");
require("dotenv").config();

const db = require("./db");
const { initializeDatabaseStructure } = require("./schema");

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const toProductResponse = (row) => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  price_ils: row.price_ils,
  image_url: row.image_url,
  cta_text: row.cta_text
});

app.get("/api/product", async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT id, slug, title, description, price_ils, image_url, cta_text
       FROM store_products
       WHERE is_active = true
       ORDER BY id
       LIMIT 1`
    );

    const product = result.rows[0];

    if (!product) {
      return res.status(404).json({ message: "No active product found" });
    }

    return res.json({ product: toProductResponse(product) });
  } catch (error) {
    console.error("Failed to fetch active product", error);
    return res.status(500).json({ message: "Failed to load product" });
  }
});

app.post("/api/orders", async (req, res) => {
  const { customer_name, phone, quantity } = req.body || {};

  if (!customer_name || !phone) {
    return res.status(400).json({ message: "customer_name and phone are required" });
  }

  const parsedQuantity = Number(quantity);
  if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
    return res.status(400).json({ message: "quantity must be a positive integer" });
  }

  try {
    const productResult = await db.query(
      "SELECT id FROM store_products WHERE is_active = true ORDER BY id LIMIT 1"
    );

    const product = productResult.rows[0];
    if (!product) {
      return res.status(404).json({ message: "No active product found" });
    }

    const orderResult = await db.query(
      `INSERT INTO store_orders (product_id, customer_name, phone, quantity)
       VALUES ($1, $2, $3, $4)
       RETURNING id, status, created_at`,
      [product.id, String(customer_name).trim(), String(phone).trim(), parsedQuantity]
    );

    return res.status(201).json({ order: orderResult.rows[0] });
  } catch (error) {
    console.error("Failed to create order", error);
    return res.status(500).json({ message: "Failed to create order" });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const start = async () => {
  try {
    await initializeDatabaseStructure();
    console.log("Database structure recreated successfully");

    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to recreate database structure", error);
    process.exit(1);
  }
};

start();
