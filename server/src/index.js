const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const db = require("./db");
const { initializeDatabaseStructure } = require("./schema");

const app = express();
const port = process.env.PORT || 3001;

const uploadsDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use("/uploads", express.static(uploadsDir));

const mapProductWithImages = (row, imageRows) => {
  const images = imageRows.map((image) => image.image_url);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    price_ils: row.price_ils,
    cta_text: row.cta_text,
    image_url: images[0] || "",
    images
  };
};

const loadActiveProduct = async () => {
  const productResult = await db.query(
    `SELECT id, slug, title, description, price_ils, cta_text
     FROM store_products
     WHERE is_active = true
     ORDER BY id
     LIMIT 1`
  );

  const product = productResult.rows[0];
  if (!product) {
    return null;
  }

  const imagesResult = await db.query(
    `SELECT image_url
     FROM store_product_images
     WHERE product_id = $1
     ORDER BY sort_order, id`,
    [product.id]
  );

  return mapProductWithImages(product, imagesResult.rows);
};

const saveBase64Image = (imagePayload) => {
  const { name, data } = imagePayload || {};
  if (!name || !data || typeof name !== "string" || typeof data !== "string") {
    throw new Error("Invalid image payload");
  }

  const matches = data.match(/^data:(.+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid image data format");
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  if (!mimeType.startsWith("image/")) {
    throw new Error(`Unsupported mime type: ${mimeType}`);
  }

  const mimeExtension = mimeType.split("/")[1] || "bin";
  const safeName = name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const originalExtension = path.extname(safeName).replace(".", "").toLowerCase();

  const extension = originalExtension || mimeExtension;
  const finalName = originalExtension ? safeName : `${safeName}.${extension}`;
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${finalName}`;
  const filePath = path.join(uploadsDir, filename);

  fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));

  if (originalExtension && originalExtension !== mimeExtension) {
    console.warn("[admin] image extension mismatch", {
      originalName: name,
      originalExtension,
      mimeType,
      mimeExtension,
      savedFile: filename
    });
  }

  return `/uploads/${filename}`;
};

app.get("/api/product", async (_req, res) => {
  try {
    const product = await loadActiveProduct();

    if (!product) {
      return res.status(404).json({ message: "No active product found" });
    }

    return res.json({ product });
  } catch (error) {
    console.error("Failed to fetch active product", error);
    return res.status(500).json({ message: "Failed to load product" });
  }
});

app.post("/api/orders", async (req, res) => {
  const { customer_name, phone, quantity } = req.body || {};

  if (!customer_name || !phone) {
    return res.status(400).json({ message: "customer_name and phone are required" });
  }

  const parsedQuantity = Number(quantity);
  if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
    return res.status(400).json({ message: "quantity must be a positive integer" });
  }

  try {
    const productResult = await db.query(
      "SELECT id FROM store_products WHERE is_active = true ORDER BY id LIMIT 1"
    );

    const product = productResult.rows[0];
    if (!product) {
      return res.status(404).json({ message: "No active product found" });
    }

    const orderResult = await db.query(
      `INSERT INTO store_orders (product_id, customer_name, phone, quantity)
       VALUES ($1, $2, $3, $4)
       RETURNING id, status, created_at`,
      [product.id, String(customer_name).trim(), String(phone).trim(), parsedQuantity]
    );

    return res.status(201).json({ order: orderResult.rows[0] });
  } catch (error) {
    console.error("Failed to create order", error);
    return res.status(500).json({ message: "Failed to create order" });
  }
});

app.put("/api/admin/product", async (req, res) => {
  const { title, description, price_ils, cta_text, images } = req.body || {};

  console.info("[admin] update product request received", {
    hasTitle: Boolean(title),
    hasDescription: Boolean(description),
    hasCtaText: Boolean(cta_text),
    imagesType: Array.isArray(images) ? "array" : typeof images,
    imagesCount: Array.isArray(images) ? images.length : 0
  });

  if (!title || !description || !cta_text) {
    return res.status(400).json({ message: "title, description and cta_text are required" });
  }

  const parsedPrice = Number(price_ils);
  if (!Number.isInteger(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({ message: "price_ils must be a non-negative integer" });
  }

  if (images && !Array.isArray(images)) {
    return res.status(400).json({ message: "images must be an array" });
  }

  try {
    const productResult = await db.query(
      "SELECT id FROM store_products WHERE is_active = true ORDER BY id LIMIT 1"
    );

    const product = productResult.rows[0];
    if (!product) {
      return res.status(404).json({ message: "No active product found" });
    }

    await db.query(
      `UPDATE store_products
       SET title = $1,
           description = $2,
           price_ils = $3,
           cta_text = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [String(title).trim(), String(description).trim(), parsedPrice, String(cta_text).trim(), product.id]
    );

    if (Array.isArray(images) && images.length > 0) {
      console.info("[admin] processing uploaded images", {
        requestedCount: images.length,
        names: images.map((image) => image?.name || "unknown")
      });

      const imageUrls = images.map(saveBase64Image);

      console.info("[admin] image files saved to disk", {
        savedCount: imageUrls.length,
        imageUrls
      });

      await db.query("DELETE FROM store_product_images WHERE product_id = $1", [product.id]);
      for (const [index, imageUrl] of imageUrls.entries()) {
        await db.query(
          `INSERT INTO store_product_images (product_id, image_url, sort_order)
           VALUES ($1, $2, $3)`,
          [product.id, imageUrl, index]
        );
      }
    }

    const updatedProduct = await loadActiveProduct();
    console.info("[admin] update product response summary", {
      returnedImagesCount: updatedProduct?.images?.length || 0,
      returnedImages: updatedProduct?.images || []
    });

    if (Array.isArray(images) && images.length > 1 && (updatedProduct?.images?.length || 0) <= 1) {
      console.warn(
        "[admin] multiple upload diagnostic: request included multiple images but response has one (or zero). Check DB insert loop and constraints."
      );
    }

    if (Array.isArray(images) && images.length > 0 && (updatedProduct?.images?.length || 0) === 0) {
      console.warn(
        "[admin] image display diagnostic: images were uploaded but no image URLs were returned. Check /uploads static serving and store_product_images rows."
      );
    }

    return res.json({ product: updatedProduct });
  } catch (error) {
    console.error("Failed to update product", error);
    return res.status(500).json({ message: "Failed to update product" });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const start = async () => {
  try {
    await initializeDatabaseStructure();
    console.log("Database structure recreated successfully");

    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to recreate database structure", error);
    process.exit(1);
  }
};

start();
