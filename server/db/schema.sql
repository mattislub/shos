-- Drop the existing schema and recreate it from scratch
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

CREATE TABLE store_products (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price_usd INTEGER NOT NULL CHECK (price_usd >= 0),
  cta_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE store_product_images (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  color_name TEXT NOT NULL DEFAULT '',
  color_quantity INTEGER NOT NULL DEFAULT 0 CHECK (color_quantity >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE store_orders (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES store_products(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  customer_email TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customer_login_codes (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customer_sessions (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE store_site_content (
  id SERIAL PRIMARY KEY,
  home_hero_image_url TEXT NOT NULL,
  shipping_price_usd INTEGER NOT NULL DEFAULT 0 CHECK (shipping_price_usd >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE store_locations (
  id SERIAL PRIMARY KEY,
  store_name TEXT NOT NULL,
  store_address TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
