const fs = require("fs");
const path = require("path");

const db = require("./db");

const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

const DEFAULT_PRODUCT = {
  slug: "single-offer",
  title: "סניקרס Horizon X",
  description:
    "נעל יומיומית קלה ונוחה במיוחד עם סוליה בולמת זעזועים, מתאימה לעבודה, הליכה ויציאות.",
  priceIls: 29900,
  ctaText: "אני רוצה להזמין",
  defaultImage:
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80"
};

const DEFAULT_HOME_HERO_IMAGE =
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1800&q=80";

const initializeDatabaseStructure = async () => {
  await db.query(schema);

  const productResult = await db.query(
    `INSERT INTO store_products (slug, title, description, price_ils, cta_text, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id`,
    [
      DEFAULT_PRODUCT.slug,
      DEFAULT_PRODUCT.title,
      DEFAULT_PRODUCT.description,
      DEFAULT_PRODUCT.priceIls,
      DEFAULT_PRODUCT.ctaText
    ]
  );

  const productId = productResult.rows[0].id;

  await db.query(
    `INSERT INTO store_product_images (product_id, image_url, color_name, sort_order)
     VALUES ($1, $2, $3, 0)`,
    [productId, DEFAULT_PRODUCT.defaultImage, "Blue"]
  );

  await db.query(
    `INSERT INTO store_site_content (home_hero_image_url)
     VALUES ($1)`,
    [DEFAULT_HOME_HERO_IMAGE]
  );
};

module.exports = {
  initializeDatabaseStructure
};
