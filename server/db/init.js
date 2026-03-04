const fs = require("fs");
const path = require("path");
require("dotenv").config();

const db = require("../src/db");

const schemaPath = path.join(__dirname, "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

const DEFAULT_PRODUCT = {
  slug: "single-offer",
  title: "סניקרס Horizon X",
  description:
    "נעל יומיומית קלה ונוחה במיוחד עם סוליה בולמת זעזועים, מתאימה לעבודה, הליכה ויציאות.",
  priceIls: 29900,
  imageUrl:
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
  ctaText: "אני רוצה להזמין"
};

const seedDatabase = async () => {
  await db.query(schema);

  await db.query(
    `INSERT INTO products (slug, title, description, price_ils, image_url, cta_text, active)
     VALUES ($1, $2, $3, $4, $5, $6, true)`,
    [
      DEFAULT_PRODUCT.slug,
      DEFAULT_PRODUCT.title,
      DEFAULT_PRODUCT.description,
      DEFAULT_PRODUCT.priceIls,
      DEFAULT_PRODUCT.imageUrl,
      DEFAULT_PRODUCT.ctaText
    ]
  );
};

seedDatabase()
  .then(() => {
    console.log("Database initialized with one-product store schema");
  })
  .catch((error) => {
    console.error("Failed to initialize database", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
