const fs = require("fs");
const path = require("path");
require("dotenv").config();

const db = require("../src/db");

const schemaPath = path.join(__dirname, "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

const seedDatabase = async () => {
  await db.query(schema);

  const countResult = await db.query("SELECT COUNT(*)::int AS count FROM products");
  const count = countResult.rows[0]?.count || 0;

  if (count === 0) {
    const productResult = await db.query(
      "INSERT INTO products (title, description, base_price, active) VALUES ($1, $2, $3, true) RETURNING id",
      ["Nova Runner", "Lightweight running shoe with color variants.", 49900]
    );
    const productId = productResult.rows[0].id;

    await db.query(
      "INSERT INTO variants (product_id, color_name, color_hex, sku, price_override, stock_qty, images) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [
        productId,
        "White",
        "#FFFFFF",
        "NR-WHITE",
        null,
        12,
        JSON.stringify(["/images/white-1.jpg", "/images/white-2.jpg"]),
      ]
    );

    await db.query(
      "INSERT INTO variants (product_id, color_name, color_hex, sku, price_override, stock_qty, images) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [
        productId,
        "Black",
        "#111111",
        "NR-BLACK",
        null,
        8,
        JSON.stringify(["/images/black-1.jpg", "/images/black-2.jpg"]),
      ]
    );

    await db.query(
      "INSERT INTO variants (product_id, color_name, color_hex, sku, price_override, stock_qty, images) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [
        productId,
        "Red",
        "#D32F2F",
        "NR-RED",
        52900,
        5,
        JSON.stringify(["/images/red-1.jpg", "/images/red-2.jpg"]),
      ]
    );

    await db.query(
      "INSERT INTO settings (shipping_flat_fee, currency, support_email) VALUES ($1, $2, $3)",
      [2500, "ILS", "support@shos.local"]
    );
  }
};

seedDatabase()
  .then(() => {
    console.log("Database initialized");
  })
  .catch((error) => {
    console.error("Failed to initialize database", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
