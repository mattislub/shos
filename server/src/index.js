const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const db = require("./db");

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/product", (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE active = 1 LIMIT 1").get();
  if (!product) {
    return res.status(404).json({ message: "No active product found" });
  }

  const variants = db
    .prepare("SELECT * FROM variants WHERE product_id = ? ORDER BY id")
    .all(product.id);

  const settings = db.prepare("SELECT * FROM settings LIMIT 1").get();

  return res.json({ product, variants, settings });
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
