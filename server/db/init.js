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

    const variants = [
      {
        colorName: "Beige",
        colorHex: "#D8C3A5",
        sku: "LF-BEIGE",
        priceOverride: null,
        stockQty: 10,
        images: ["/images/loafer_beige_2.jpg"],
      },
      {
        colorName: "Black",
        colorHex: "#111111",
        sku: "LF-BLACK",
        priceOverride: null,
        stockQty: 8,
        images: ["/images/loafer_black_2.jpg"],
      },
      {
        colorName: "Blue",
        colorHex: "#3B5AA3",
        sku: "LF-BLUE",
        priceOverride: null,
        stockQty: 7,
        images: ["/images/loafer_blue_2.jpg"],
      },
      {
        colorName: "Olive",
        colorHex: "#6B7B3A",
        sku: "LF-OLIVE",
        priceOverride: null,
        stockQty: 6,
        images: ["/images/loafer_olive_2.jpg"],
      },
      {
        colorName: "Pink",
        colorHex: "#E39AB1",
        sku: "LF-PINK",
        priceOverride: 52900,
        stockQty: 5,
        images: ["/images/loafer_pink_2.jpg"],
      },
      {
        colorName: "White",
        colorHex: "#F5F5F5",
        sku: "LF-WHITE",
        priceOverride: null,
        stockQty: 12,
        images: ["/images/loafer_white_2.jpg"],
      },
    ];

    for (const variant of variants) {
      await db.query(
        "INSERT INTO variants (product_id, color_name, color_hex, sku, price_override, stock_qty, images) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          productId,
          variant.colorName,
          variant.colorHex,
          variant.sku,
          variant.priceOverride,
          variant.stockQty,
          JSON.stringify(variant.images),
        ]
      );
    }

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
