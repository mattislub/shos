const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const db = require("./db");

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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

    return res.json({
      product,
      variants: variantsResult.rows,
      settings: settingsResult.rows[0] || null,
    });
  } catch (error) {
    console.error("Failed to fetch product data", error);
    return res.status(500).json({ message: "Failed to load product data" });
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
