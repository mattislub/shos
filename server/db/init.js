const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dbPath = process.env.DB_PATH || path.join(__dirname, "shos.sqlite");
const schemaPath = path.join(__dirname, "schema.sql");

const db = new Database(dbPath);
const schema = fs.readFileSync(schemaPath, "utf8");

db.exec(schema);

const hasProduct = db.prepare("SELECT COUNT(*) as count FROM products").get();

if (hasProduct.count === 0) {
  const insertProduct = db.prepare(
    "INSERT INTO products (title, description, base_price, active) VALUES (?, ?, ?, 1)"
  );
  const productInfo = insertProduct.run(
    "Nova Runner",
    "נעל ריצה קלה עם וריאציות צבעים.",
    49900
  );

  const insertVariant = db.prepare(
    "INSERT INTO variants (product_id, color_name, color_hex, sku, price_override, stock_qty, images) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );

  insertVariant.run(
    productInfo.lastInsertRowid,
    "לבן",
    "#FFFFFF",
    "NR-WHITE",
    null,
    12,
    JSON.stringify(["/images/white-1.jpg", "/images/white-2.jpg"])
  );

  insertVariant.run(
    productInfo.lastInsertRowid,
    "שחור",
    "#111111",
    "NR-BLACK",
    null,
    8,
    JSON.stringify(["/images/black-1.jpg", "/images/black-2.jpg"])
  );

  insertVariant.run(
    productInfo.lastInsertRowid,
    "אדום",
    "#D32F2F",
    "NR-RED",
    52900,
    5,
    JSON.stringify(["/images/red-1.jpg", "/images/red-2.jpg"])
  );

  db.prepare(
    "INSERT INTO settings (shipping_flat_fee, currency, support_email) VALUES (?, ?, ?)"
  ).run(2500, "ILS", "support@shos.local");
}

console.log(`Database initialized at ${dbPath}`);
