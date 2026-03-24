const fs = require("fs");
const path = require("path");

const db = require("./db");

const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

const DEFAULT_PRODUCT = {
  slug: "single-offer",
  title: "loafers",
  description:
    "A lightweight everyday shoe with shock-absorbing support, designed for work, walking, and going out.",
  priceUsd: 29900,
  ctaText: "I want to order",
  defaultImage:
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80"
};

const DEFAULT_HOME_HERO_IMAGE =
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1800&q=80";

const DEFAULT_STORE_LOCATIONS = [
  { storeName: "Crocspot", storeAddress: "80 Truman Ave. Apt. 111, Spring Valley, NY 10977" },
  { storeName: "Designer Step", storeAddress: "74 Lee Ave., Brooklyn, NY 11211" },
  { storeName: "Frankel's Designer Shoes", storeAddress: "100 Route 59 Suite 11, Monsey, NY 10952" },
  { storeName: "Hatzlucha Shoes", storeAddress: "48 Bakertown Rd., Monroe, NY 10950" },
  { storeName: "Marvel", storeAddress: "218 Wallabout St., Brooklyn, NY 11205" },
  { storeName: "Mens Footwear", storeAddress: "51 Forest Rd #205, Monroe, NY 10950" },
  { storeName: "your shoo", storeAddress: "5001 18th Ave., Brooklyn, NY 11204" },
  { storeName: "Shoe Barn", storeAddress: "11 Main St., Monsey, NY 10952" },
  { storeName: "Shoe Gardens", storeAddress: "157 Lee Ave., Brooklyn, NY 11211" },
  { storeName: "Shoe Palace NJ", storeAddress: "6951 US 9 Unit 8, Howell, NJ 07731" },
  { storeName: "Step In Elegance", storeAddress: "268 Cedar Bridge Ave., Lakewood, NJ 08701" },
  { storeName: "Weingarten shoes", storeAddress: "27 Orchard St #206, Monsey, NY 10952" },
  { storeName: "Shoe Laces", storeAddress: "5303 13th Ave., Brooklyn, NY 11219" }
];

const initializeDatabaseStructure = async () => {
  await db.query(schema);

  const productResult = await db.query(
    `INSERT INTO store_products (slug, title, description, price_usd, cta_text, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id`,
    [
      DEFAULT_PRODUCT.slug,
      DEFAULT_PRODUCT.title,
      DEFAULT_PRODUCT.description,
      DEFAULT_PRODUCT.priceUsd,
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
    `INSERT INTO store_site_content (home_hero_image_url, shipping_price_usd)
     VALUES ($1, $2)`,
    [DEFAULT_HOME_HERO_IMAGE, 0]
  );

  for (const [index, location] of DEFAULT_STORE_LOCATIONS.entries()) {
    await db.query(
      `INSERT INTO store_locations (store_name, store_address, sort_order)
       VALUES ($1, $2, $3)`,
      [location.storeName, location.storeAddress, index]
    );
  }
};

module.exports = {
  initializeDatabaseStructure
};
