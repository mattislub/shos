-- מוחקים את כל המבנה הקיים ובונים מחדש
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

CREATE TABLE store_products (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price_ils INTEGER NOT NULL CHECK (price_ils >= 0),
  cta_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE store_product_images (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE store_orders (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES store_products(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
