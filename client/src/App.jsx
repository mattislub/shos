import { useEffect, useState } from "react";

const fallbackProduct = {
  title: "loafers",
  description:
    "Water-resistant everyday loafers that are lightweight, odor-resistant, and built for all-day comfort.",
  price_usd: 29900,
  image_url:
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
  images: [
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80"
  ],
  image_entries: [
    {
      image_url:
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
      color_name: "Blue"
    }
  ],
  cta_text: "Order now"
};

const fallbackHomeHeroImage =
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1800&q=80";

const apiUrl = (import.meta.env.VITE_API_URL || "/api").trim();
const CART_STORAGE_KEY = "shos-cart-items";
const ADMIN_AUTH_STORAGE_KEY = "shos-admin-auth";
const ADMIN_DEFAULT_USERNAME = "admin";

const serverBaseUrl = (() => {
  try {
    return new URL(apiUrl, window.location.origin).origin;
  } catch (_error) {
    return window.location.origin;
  }
})();

const MAX_UPLOAD_EDGE_PX = 1600;
const MAX_UPLOAD_BYTES = 900 * 1024;
const JPEG_QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45];

const readFileAsDataUrl =
  (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("failed reading file"));
      reader.readAsDataURL(file);
    });

const loadImageElement =
  (source) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("failed decoding image"));
      image.src = source;
    });

const dataUrlToBytes = (dataUrl) => {
  const encoded = dataUrl.split(",")[1] || "";
  return Math.ceil((encoded.length * 3) / 4);
};

const compressImageForUpload = async (file) => {
  if (!file.type.startsWith("image/")) {
    return { name: file.name, data: await readFileAsDataUrl(file), compressed: false };
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(sourceDataUrl);

  const longestEdge = Math.max(image.width, image.height);
  const scale = longestEdge > MAX_UPLOAD_EDGE_PX ? MAX_UPLOAD_EDGE_PX / longestEdge : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return { name: file.name, data: sourceDataUrl, compressed: false };
  }

  context.drawImage(image, 0, 0, width, height);

  let bestDataUrl = sourceDataUrl;
  for (const quality of JPEG_QUALITY_STEPS) {
    const candidate = canvas.toDataURL("image/jpeg", quality);
    bestDataUrl = candidate;
    if (dataUrlToBytes(candidate) <= MAX_UPLOAD_BYTES) {
      break;
    }
  }

  return {
    name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
    data: bestDataUrl,
    compressed: bestDataUrl !== sourceDataUrl
  };
};

const toAbsoluteImageUrl = (url) => {
  if (!url) {
    return "";
  }
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  return `${serverBaseUrl}${url}`;
};

const normalizeProduct = (product) => {
  const base = product || fallbackProduct;
  const rawImageEntries = Array.isArray(base.image_entries) && base.image_entries.length > 0
    ? base.image_entries
    : Array.isArray(base.images) && base.images.length > 0
      ? base.images.map((imageUrl) => ({ image_url: imageUrl, color_name: "" }))
      : base.image_url
        ? [{ image_url: base.image_url, color_name: "" }]
        : [];

  const imageEntries = rawImageEntries
    .map((entry) => {
      if (typeof entry === "string") {
        return { image_url: toAbsoluteImageUrl(entry), color_name: "" };
      }

      return {
        image_url: toAbsoluteImageUrl(entry?.image_url || ""),
        color_name: String(entry?.color_name || "").trim()
      };
    })
    .filter((entry) => Boolean(entry.image_url));

  const images = imageEntries.map((entry) => entry.image_url);

  return {
    ...base,
    image_url: toAbsoluteImageUrl(base.image_url || images[0] || ""),
    images,
    image_entries: imageEntries
  };
};

const listUniqueColors = (entries) => {
  const seen = new Set();

  return (Array.isArray(entries) ? entries : [])
    .map((entry) => String(entry?.color_name || "").trim())
    .filter((color) => {
      const normalizedColor = color.toLowerCase();
      if (!color || seen.has(normalizedColor)) {
        return false;
      }

      seen.add(normalizedColor);
      return true;
    });
};

const listPrimaryImageIndicesByColor = (entries) => {
  const seenColors = new Set();
  const fallbackIndices = [];

  return (Array.isArray(entries) ? entries : []).reduce((indices, entry, index) => {
    const colorName = String(entry?.color_name || "").trim().toLowerCase();

    if (!colorName) {
      fallbackIndices.push(index);
      return indices;
    }

    if (seenColors.has(colorName)) {
      return indices;
    }

    seenColors.add(colorName);
    indices.push(index);
    return indices;
  }, []).concat(fallbackIndices.length > 0 ? [fallbackIndices[0]] : []);
};

const readCartItems = () => {
  try {
    const rawValue = window.localStorage.getItem(CART_STORAGE_KEY);
    const parsed = JSON.parse(rawValue || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const appendCartItem = (item) => {
  const nextItems = [...readCartItems(), item];
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextItems));
};

const writeCartItems = (items) => {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
};

const formatUsdCents = (value) => `$${((value || 0) / 100).toFixed(2)} USD`;
const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : "-");

const SITE_NAME = "Sholors-Loafers";
const DEFAULT_SEO_IMAGE =
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80";

const buildAbsoluteUrl = (path = "/") => {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${window.location.origin}${cleanPath}`;
};

const SEO_BY_PATH = {
  "/": {
    title: "Sholors-Loafers | Lightweight Everyday Comfort Shoes",
    description:
      "Discover water-resistant, lightweight, and odor-resistant loafers designed for all-day comfort.",
    keywords: "loafers, comfortable shoes, women loafers, lightweight shoes, non-slip shoes"
  },
  "/cart": {
    title: "Shopping Cart | Sholors-Loafers",
    description: "Review your selected loafers, adjust quantities, and continue to secure checkout.",
    keywords: "shopping cart, loafers checkout, shoe order"
  },
  "/shipping-details": {
    title: "Shipping Details | Sholors-Loafers Checkout",
    description: "Enter shipping details to complete your loafers order quickly and accurately.",
    keywords: "shipping details, checkout, loafers delivery"
  },
  "/privacy-shipping-policy": {
    title: "Privacy & Shipping Policy | Sholors-Loafers",
    description: "Read our privacy terms and shipping policy for orders across the United States.",
    keywords: "privacy policy, shipping policy, online store terms"
  },
  "/admin": {
    title: "Admin Product Management | Sholors-Loafers",
    description: "Manage product details, images, and homepage banner content.",
    keywords: "admin, product management, ecommerce dashboard",
    robots: "noindex,nofollow,noarchive,nosnippet,max-image-preview:none"
  },
  "/admin/customers": {
    title: "Admin Customer Management | Sholors-Loafers",
    description: "View customer activity and order history in the admin dashboard.",
    keywords: "admin customers, customer analytics, ecommerce admin",
    robots: "noindex,nofollow,noarchive,nosnippet,max-image-preview:none"
  },
  "/admin/orders": {
    title: "Admin Order Management | Sholors-Loafers",
    description: "Track and manage orders with status and customer details.",
    keywords: "admin orders, order management, ecommerce operations",
    robots: "noindex,nofollow,noarchive,nosnippet,max-image-preview:none"
  }
};

const upsertMetaTag = (name, content, attribute = "name") => {
  if (!content) {
    return;
  }

  let element = document.head.querySelector(`meta[${attribute}="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
};

const upsertLinkTag = (rel, href) => {
  if (!href) {
    return;
  }

  let element = document.head.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    document.head.appendChild(element);
  }

  element.setAttribute("href", href);
};

const setJsonLd = (path, data) => {
  const scriptId = `seo-json-ld-${path.replace(/[^a-z0-9]/gi, "-") || "home"}`;
  let script = document.head.querySelector(`#${scriptId}`);
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = scriptId;
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(data);
};

const applyPageSeo = (path) => {
  const seoData = SEO_BY_PATH[path] || SEO_BY_PATH["/"];
  const canonical = buildAbsoluteUrl(path);
  const robotsContent = seoData.robots || "index,follow,max-image-preview:large";

  document.title = seoData.title;

  upsertMetaTag("description", seoData.description);
  upsertMetaTag("keywords", seoData.keywords);
  upsertMetaTag("robots", robotsContent);
  upsertMetaTag("googlebot", robotsContent);

  upsertMetaTag("og:type", "website", "property");
  upsertMetaTag("og:site_name", SITE_NAME, "property");
  upsertMetaTag("og:title", seoData.title, "property");
  upsertMetaTag("og:description", seoData.description, "property");
  upsertMetaTag("og:url", canonical, "property");
  upsertMetaTag("og:image", DEFAULT_SEO_IMAGE, "property");

  upsertMetaTag("twitter:card", "summary_large_image");
  upsertMetaTag("twitter:title", seoData.title);
  upsertMetaTag("twitter:description", seoData.description);
  upsertMetaTag("twitter:image", DEFAULT_SEO_IMAGE);

  upsertLinkTag("canonical", canonical);

  setJsonLd(path, {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: seoData.title,
    description: seoData.description,
    url: canonical,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: buildAbsoluteUrl("/")
    }
  });
};

const buildAdminBasicToken = (username, password) => window.btoa(`${username}:${password}`);

const readAdminToken = () => {
  try {
    return window.sessionStorage.getItem(ADMIN_AUTH_STORAGE_KEY) || "";
  } catch (_error) {
    return "";
  }
};

const writeAdminToken = (token) => {
  window.sessionStorage.setItem(ADMIN_AUTH_STORAGE_KEY, token);
};

const clearAdminToken = () => {
  window.sessionStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
};

const fetchAdminApi = async (path, options = {}) => {
  const token = readAdminToken();
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Basic ${token}` } : {})
  };

  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    clearAdminToken();
  }

  return response;
};

const useProduct = () => {
  const [product, setProduct] = useState(null);
  const [homeHeroImageUrl, setHomeHeroImageUrl] = useState(fallbackHomeHeroImage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const loadProduct = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${apiUrl}/product`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Failed to load product: ${response.status} ${response.statusText}`);
        }

        const payload = await response.json();
        setProduct(normalizeProduct(payload.product || fallbackProduct));
        setHomeHeroImageUrl(toAbsoluteImageUrl(payload.home_hero_image_url || fallbackHomeHeroImage));
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Product update from server failed:", err);
          setError("We couldn't load the product data from the server. Showing fallback content.");
          setProduct(normalizeProduct(fallbackProduct));
          setHomeHeroImageUrl(fallbackHomeHeroImage);
        }
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
    return () => controller.abort();
  }, []);

  return { product, setProduct, homeHeroImageUrl, setHomeHeroImageUrl, loading, error };
};


const GlobalHeader = () => (
  <header className="home-header">
    <div className="home-title-wrap">
      <h1 className="home-title">Sholors-Loafers</h1>
      <p className="home-eyebrow">Ultra-Comfort, Non-Slip, Foldable, Ventilated, Easy On Softers Loafers for Women</p>
    </div>
    <nav className="home-actions" aria-label="Main actions">
      <button type="button" className="home-action-button"><span className="home-action-icon">📞</span>Contact</button>
      <button type="button" className="home-action-button"><span className="home-action-icon">ℹ️</span>About</button>
      <button type="button" className="home-action-button"><span className="home-action-icon">👤</span>Sign in</button>
      <button type="button" className="home-action-button" onClick={() => window.location.assign("/cart")}><span className="home-action-icon">🛒</span>Cart</button>
      <button type="button" className="home-action-button"><span className="home-action-icon">💖</span>Wishlist</button>
    </nav>
  </header>
);

const SiteFooter = () => (
  <footer className="site-footer" aria-label="Updates and contact">
    <div className="footer-block">
      <h2>Join our updates</h2>
      <p>Leave your email address to get perks, new products, and important updates.</p>
      <form className="footer-subscribe-form" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="updates-email" className="sr-only">Email address</label>
        <input id="updates-email" name="email" type="email" placeholder="name@email.com" required />
        <button type="submit">Subscribe for updates</button>
      </form>
    </div>

    <div className="footer-block">
      <h2>Contact us</h2>
      <p>We will be happy to help with any question.</p>
      <ul className="contact-list">
        <li><strong>Phone:</strong> 03-555-1234</li>
        <li><strong>Email:</strong> hello@shos.co.il</li>
        <li><strong>WhatsApp:</strong> 050-123-4567</li>
      </ul>
    </div>

    <div className="footer-block">
      <h2>Additional information</h2>
      <nav aria-label="Legal and shipping links">
        <ul className="footer-links-list">
          <li><a href="/privacy-shipping-policy#privacy-policy">Privacy policy</a></li>
          <li><a href="/privacy-shipping-policy#shipping-policy">Shipping policy</a></li>
        </ul>
      </nav>
    </div>
  </footer>
);

const StorePage = () => {
  const { product, homeHeroImageUrl, loading, error } = useProduct();
  const [status, setStatus] = useState("");
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [currentStep, setCurrentStep] = useState("color");
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [cartItems, setCartItems] = useState(() => readCartItems());

  const currentProduct = normalizeProduct(product || fallbackProduct);
  const displayImage = currentProduct.images[selectedImageIndex] || currentProduct.image_url;
  const selectedImageColor = currentProduct.image_entries[selectedImageIndex]?.color_name || "";
  const selectedImageColorKey = selectedImageColor.trim().toLowerCase();
  const homeColorImageIndices = listPrimaryImageIndicesByColor(currentProduct.image_entries);
  const productStepImageIndices = currentProduct.images
    .map((_, index) => index)
    .filter((index) => {
      if (!selectedImageColorKey) {
        return true;
      }

      const imageColor = String(currentProduct.image_entries[index]?.color_name || "").trim().toLowerCase();
      return imageColor === selectedImageColorKey;
    });

  useEffect(() => {
    if (selectedImageIndex >= currentProduct.images.length) {
      setSelectedImageIndex(0);
    }
  }, [currentProduct.images.length, selectedImageIndex]);

  useEffect(() => {
    const syncCartItems = () => setCartItems(readCartItems());
    window.addEventListener("storage", syncCartItems);

    return () => {
      window.removeEventListener("storage", syncCartItems);
    };
  }, []);

  const sizeChartRows = [
    { brandSize: "35", usSize: "4", euSize: "35", shoeWidth: "9.8", footLength: "8.8" },
    { brandSize: "36", usSize: "5", euSize: "36", shoeWidth: "10.1", footLength: "9.1" },
    { brandSize: "37", usSize: "6", euSize: "37", shoeWidth: "10.3", footLength: "9.4" },
    { brandSize: "38", usSize: "7", euSize: "38", shoeWidth: "10.6", footLength: "9.6" },
    { brandSize: "39", usSize: "8", euSize: "39", shoeWidth: "10.9", footLength: "9.9" },
    { brandSize: "40", usSize: "9", euSize: "40", shoeWidth: "11.2", footLength: "10.1" }
  ];

  const usdPrice = ((currentProduct.price_usd || 0) / 100).toFixed(2);

  const selectSize = (size) => {
    setSelectedSize((current) => (current === size ? "" : size));
  };

  const submitColorStep = async (event) => {
    event.preventDefault();
    setStatus("");
    setCurrentStep("product");
  };

  const submitProductStep = async (event) => {
    event.preventDefault();

    if (!selectedSize) {
      setStatus("Please select one size before continuing.");
      return;
    }

    setStatus(`Selected size ${selectedSize}, quantity ${quantity}. You can add this product to cart.`);
  };

  const resetSizeSelection = () => {
    setSelectedSize("");
    setStatus("");
  };

  const chooseAnotherColor = () => {
    setCurrentStep("color");
    setStatus("");
  };

  const addCurrentSelectionToCart = () => {
    if (!selectedSize) {
      setStatus("Please select one size before adding to cart.");
      return;
    }

    const colorOptions = listUniqueColors(currentProduct.image_entries);
    const imagesByColor = currentProduct.image_entries.reduce((result, entry) => {
      const colorName = String(entry?.color_name || "").trim();
      if (!colorName || result[colorName]) {
        return result;
      }

      return {
        ...result,
        [colorName]: entry.image_url
      };
    }, {});

    appendCartItem({
      title: currentProduct.title,
      image: displayImage,
      color: selectedImageColor,
      color_options: colorOptions,
      images_by_color: imagesByColor,
      size: selectedSize,
      quantity,
      price_usd: currentProduct.price_usd || 0,
      added_at: new Date().toISOString()
    });

    setCartItems(readCartItems());
    setStatus("Item added to cart successfully.");
  };

  const cartSummaryItems = cartItems.map((item, index) => ({
    ...item,
    rowKey: `${item.added_at || item.title}-${index}`
  }));
  const cartTotalUsd = cartItems.reduce(
    (sum, item) => sum + (item.price_usd || item.price_ils || 0) * (item.quantity || 1),
    0
  );

  const CartSidebar = () => (
    <aside className="cart-sidebar" aria-label="Cart summary">
      <h2>Cart items</h2>
      <div className="cart-sidebar-list">
        {cartSummaryItems.map((item) => (
          <article key={item.rowKey} className="cart-sidebar-item">
            <img src={item.image} alt={item.title} className="cart-sidebar-image" />
            <div>
              <p className="cart-sidebar-item-title">{item.title}</p>
              <p>Size: {item.size || "Not selected"}</p>
              <p>Qty: {item.quantity || 1}</p>
              <p>Unit price: {formatUsdCents(item.price_usd || item.price_ils || 0)}</p>
              <p>Item total: {formatUsdCents((item.price_usd || item.price_ils || 0) * (item.quantity || 1))}</p>
            </div>
          </article>
        ))}
      </div>
      <p className="cart-sidebar-total">Total: {formatUsdCents(cartTotalUsd)}</p>
      <button
        type="button"
        className="cart-sidebar-checkout"
        onClick={() => window.location.assign("/cart")}
      >
        Proceed to checkout
      </button>
    </aside>
  );


  if (currentStep === "product") {
    return (
      <main className="page product-page">
        {cartItems.length > 0 ? <CartSidebar /> : null}
        <GlobalHeader />
        <section className="card product-step-page" aria-label="Product page">
          {loading ? <p>Loading product...</p> : null}
          {error ? <p className="warning">{error}</p> : null}

          <h1 className="product-step-main-title">Product page</h1>

          <section className="product-step-image-block" aria-label="Product image">
            <img src={displayImage} alt={currentProduct.title} className="product-image" />
            {productStepImageIndices.length > 1 ? (
              <div className="thumb-grid">
                {productStepImageIndices.map((index) => {
                  const image = currentProduct.images[index];
                  return (
                  <button
                    key={`step-image-${image}-${index}`}
                    type="button"
                    className={`thumb ${selectedImageIndex === index ? "thumb-active" : ""}`}
                    onClick={() => setSelectedImageIndex(index)}
                  >
                    <img src={image} alt={`Product image ${index + 1}`} />
                    {currentProduct.image_entries[index]?.color_name ? (
                      <span>{currentProduct.image_entries[index].color_name}</span>
                    ) : null}
                  </button>
                  );
                })}
              </div>
            ) : null}

            {selectedImageColor ? <p className="status">Selected color: {selectedImageColor}</p> : null}
            <h2 className="product-step-product-title">{currentProduct.title}</h2>
            <p className="status">Price: ${usdPrice} USD</p>
          </section>

          <section className="product-step-selection" aria-label="Size and quantity selection">
            <h3>Select your size and quantity</h3>

            <div className="size-choice-pills" role="group" aria-label="Size selection">
              {sizeChartRows.map((row) => {
                const active = selectedSize === row.brandSize;
                return (
                  <button
                    key={`size-pill-${row.brandSize}`}
                    type="button"
                    className={`size-pill ${active ? "size-pill-active" : ""}`}
                    onClick={() => selectSize(row.brandSize)}
                    aria-pressed={active}
                  >
                    {row.brandSize}
                  </button>
                );
              })}
            </div>

            <p className="size-selection-hint">Only one size can be selected at a time.</p>

            <div className="quantity-stepper" aria-label="Quantity selection">
              <button
                type="button"
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span>{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((current) => current + 1)}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            <form onSubmit={submitProductStep} className="order-form">
              <button type="submit">Continue</button>
            </form>

            {status ? <p className="status product-step-status">{status}</p> : null}

            {selectedSize ? (
              <section className="checkout-clarity-panel" aria-label="Cart options">
                <p className="checkout-clarity-title">Ready to add this item?</p>
                <p className="checkout-clarity-summary">
                  Color: <strong>{selectedImageColor || "Default"}</strong> • Size: <strong>{selectedSize}</strong> • Qty: <strong>{quantity}</strong>
                </p>

                <div className="checkout-clarity-actions">
                  <button type="button" className="checkout-secondary" onClick={resetSizeSelection}>Change size</button>
                  <button type="button" className="checkout-secondary" onClick={chooseAnotherColor}>Change color</button>
                  <button type="button" className="checkout-primary" onClick={addCurrentSelectionToCart}>Add to cart</button>
                </div>
              </section>
            ) : null}
          </section>
        </section>
        <SiteFooter />
      </main>
    );
  }

  return (
    <main className="page">
      {cartItems.length > 0 ? <CartSidebar /> : null}
      <GlobalHeader />

      <section className="hero-banner">
        <img src={homeHeroImageUrl} alt="Main banner" className="hero-banner-image" />
      </section>

      <section className="card">
        {loading ? <p>Loading product...</p> : null}
        {error ? <p className="warning">{error}</p> : null}

        <img src={displayImage} alt={currentProduct.title} className="product-image" />

        {homeColorImageIndices.length > 1 ? (
          <>
            <p className="thumb-instruction">Choose the color you like and click Continue.</p>
            <div className="thumb-grid">
              {homeColorImageIndices.map((index) => {
                const image = currentProduct.images[index];
                return (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  className={`thumb ${selectedImageIndex === index ? "thumb-active" : ""}`}
                  onClick={() => setSelectedImageIndex(index)}
                >
                  <img src={image} alt={`Image ${index + 1}`} />
                  {currentProduct.image_entries[index]?.color_name ? (
                    <span>{currentProduct.image_entries[index].color_name}</span>
                  ) : null}
                </button>
                );
              })}
            </div>
          </>
        ) : null}

        {selectedImageColor ? <p className="status">Selected color: {selectedImageColor}</p> : null}

        <h1>{currentProduct.title}</h1>
        <p>{currentProduct.description}</p>
        <p className="status">Price: ${usdPrice} USD</p>

        <form onSubmit={submitColorStep} className="order-form">
          <button type="submit">Continue</button>
        </form>
      </section>

      <section className="card product-details-panel" aria-labelledby="product-details-title">
        <div className="details-header">
          <p className="rating">⭐⭐⭐⭐⭐</p>
        </div>

        <h2 id="product-details-title">Product details</h2>

        <h3>Top highlights</h3>
        <ul className="details-list">
          <li><strong>Sole material:</strong> Polyvinyl Chloride, Rubber</li>
          <li><strong>Outer material:</strong> Polyvinyl Chloride (PVC)</li>
          <li><strong>Closure type:</strong> No-closure</li>
          <li><strong>Water resistance level:</strong> Water Resistant</li>
        </ul>

        <h3>About this item</h3>
        <ul className="details-list">
          <li>Resistant to odors, a breeze to clean, and dries rapidly.</li>
          <li>Features a footbed with massage pods and improved arch support.</li>
          <li>Designed to be water-friendly and buoyant.</li>
          <li>
            Equipped with scuff-resistant soles and segmented traction, making them perfect for
            slippery and wet environments.
          </li>
        </ul>

        <h3>Style</h3>
        <div className="details-grid">
          <p><strong>Heel Type:</strong> Flat</p>
          <p><strong>Toe Style:</strong> Round Toe</p>
          <p><strong>Style Name:</strong> Casual</p>
          <p><strong>Pattern:</strong> Solid</p>
          <p><strong>Subject Character:</strong> Barbie</p>
          <p><strong>Seasons:</strong> All</p>
        </div>

        <h3>Features &amp; Specs</h3>
        <div className="details-grid">
          <p><strong>Closure Type:</strong> no-closure</p>
          <p><strong>Sport Type:</strong> Walking</p>
          <p><strong>Water Resistance Level:</strong> Water Resistant</p>
        </div>
      </section>

      <section className="card stacked-home-images" aria-label="Additional home images">
        <img src="/uploads/abc.jpg" alt="Promotional image top" className="stacked-home-image" />
        <img src="/uploads/dfg.jpg" alt="Promotional image bottom" className="stacked-home-image" />
      </section>
      <SiteFooter />
    </main>
  );
};

const AdminLoginPage = () => {
  const [username, setUsername] = useState(ADMIN_DEFAULT_USERNAME);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  const submitLogin = (event) => {
    event.preventDefault();

    if (!username || !password) {
      setStatus("Please enter a username and password.");
      return;
    }

    const token = buildAdminBasicToken(String(username).trim(), String(password));
    writeAdminToken(token);
    window.location.reload();
  };

  return (
    <main className="page product-page">
      <GlobalHeader />
      <section className="card">
        <h1>Admin login</h1>
        <p className="home-subtitle">Enter admin username and password to access management pages.</p>

        <form className="order-form" onSubmit={submitLogin}>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            autoComplete="username"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type="password"
            autoComplete="current-password"
          />
          <button type="submit">Login</button>
        </form>

        {status ? <p className="warning">{status}</p> : null}
      </section>
      <SiteFooter />
    </main>
  );
};

const AdminAuthGate = ({ children }) => {
  const hasToken = Boolean(readAdminToken());
  return hasToken ? children : <AdminLoginPage />;
};

const AdminPage = () => {
  const { product, setProduct, homeHeroImageUrl, setHomeHeroImageUrl, loading, error } = useProduct();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [imageColors, setImageColors] = useState({});
  const [additionalFilesByColor, setAdditionalFilesByColor] = useState({});
  const [removedImageKeys, setRemovedImageKeys] = useState([]);
  const [activeTab, setActiveTab] = useState("product");
  const [heroFile, setHeroFile] = useState(null);
  const [status, setStatus] = useState("");
  const [heroStatus, setHeroStatus] = useState("");

  useEffect(() => {
    const current = normalizeProduct(product || fallbackProduct);
    setTitle(current.title);
    setDescription(current.description);
    setPriceUsd(String((current.price_usd || 0) / 100));
    setCtaText(current.cta_text);
  }, [product]);

  const onFilesSelected = (event) => {
    const files = Array.from(event.target.files || []);
    console.info("[admin] image files selected", {
      count: files.length,
      names: files.map((file) => file.name),
      sizes: files.map((file) => file.size),
      inputMultipleEnabled: Boolean(event.target?.multiple)
    });

    if (files.length <= 1) {
      console.warn(
        "[admin] multiple image upload diagnostic: browser reported one (or zero) file only. If this keeps happening, verify platform supports multi-select (some mobile pickers don't) and pick multiple files in one selection."
      );
    }

    setSelectedFiles(files);
    setImageColors((current) => {
      const next = {};
      files.forEach((file) => {
        const key = `${file.name}-${file.lastModified}-${file.size}`;
        next[key] = current[key] || "";
      });
      return next;
    });
  };

  const fileKey = (file) => `${file.name}-${file.lastModified}-${file.size}`;
  const existingImageKey = (entry, index) => `${entry?.image_url || ""}-${entry?.color_name || ""}-${index}`;

  const previewProduct = normalizeProduct(product || fallbackProduct);
  const activeImageEntries = previewProduct.image_entries.filter(
    (entry, index) => !removedImageKeys.includes(existingImageKey(entry, index))
  );
  const existingColors = listUniqueColors(previewProduct.image_entries);

  const saveProduct = async (event) => {
    event.preventDefault();
    setStatus("");

    const parsedPrice = Number(priceUsd);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setStatus("Invalid price.");
      return;
    }

    try {
      console.info("[admin] preparing product save request", {
        selectedFilesCount: selectedFiles.length,
        selectedFileNames: selectedFiles.map((file) => file.name)
      });

      const additionalUploads = Object.entries(additionalFilesByColor).flatMap(([colorName, files]) =>
        (files || []).map((file) => ({ file, color_name: colorName }))
      );

      const missingColor = selectedFiles.find((file) => !String(imageColors[fileKey(file)] || "").trim());
      if (missingColor) {
        setStatus("Please select a color for every uploaded image.");
        return;
      }

      const imagesPayload = await Promise.all(selectedFiles.map((file) => compressImageForUpload(file)));
      const additionalImagesPayload = await Promise.all(
        additionalUploads.map(async ({ file, color_name }) => ({
          ...(await compressImageForUpload(file)),
          color_name: String(color_name || "").trim()
        }))
      );

      const oversizedImages = imagesPayload.filter((image) => dataUrlToBytes(image.data) > MAX_UPLOAD_BYTES);
      if (oversizedImages.length > 0) {
        console.warn("[admin] some images are still large after compression", {
          imageNames: oversizedImages.map((image) => image.name),
          maxExpectedBytes: MAX_UPLOAD_BYTES
        });
      }

      console.info("[admin] image payload ready", {
        payloadCount: imagesPayload.length,
        totalPayloadSize: imagesPayload.reduce((sum, image) => sum + dataUrlToBytes(image?.data || ""), 0),
        compressedCount: imagesPayload.filter((image) => image.compressed).length
      });

      const requestImages = imagesPayload.map(({ name, data }, index) => ({
        name,
        data,
        color_name: String(imageColors[fileKey(selectedFiles[index])] || "").trim()
      }));

      const preservedImages = activeImageEntries.map((entry) => ({
          image_url: entry.image_url,
          color_name: String(entry.color_name || "").trim()
        }));

      const allImagesForRequest = [
        ...preservedImages,
        ...requestImages,
        ...additionalImagesPayload.map(({ name, data, color_name }) => ({ name, data, color_name }))
      ];

      const response = await fetchAdminApi("/admin/product", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          price_usd: Math.round(parsedPrice * 100),
          cta_text: ctaText.trim(),
          images: allImagesForRequest
        })
      });

      if (!response.ok) {
        const responseText = await response.text();
        console.error("[admin] save failed", {
          status: response.status,
          body: responseText
        });
        throw new Error("save failed");
      }

      const payload = await response.json();
      const updatedImages = payload?.product?.images || [];
      console.info("[admin] save succeeded", {
        uploadedCount: imagesPayload.length,
        returnedImagesCount: updatedImages.length,
        returnedImages: updatedImages
      });

      if (imagesPayload.length > 0 && updatedImages.length === 0) {
        console.warn(
          "[admin] image display diagnostic: server returned zero images after upload. Verify /uploads static path and saved image URLs."
        );
      }

      if (imagesPayload.length > 1 && updatedImages.length <= 1) {
        console.warn(
          "[admin] multiple upload diagnostic: more than one file was sent, but one (or zero) image came back. Check backend insert loop / payload size limits."
        );
      }

      setProduct(normalizeProduct(payload.product));
      setSelectedFiles([]);
      setImageColors({});
      setAdditionalFilesByColor({});
      setRemovedImageKeys([]);
      setStatus("Product saved successfully.");
    } catch (err) {
      console.error("[admin] product save exception", {
        message: err?.message,
        stack: err?.stack
      });
      setStatus("Saving product failed.");
    }
  };

  const saveHomeHero = async (event) => {
    event.preventDefault();
    setHeroStatus("");

    if (!heroFile) {
      setHeroStatus("Please choose an image before saving.");
      return;
    }

    try {
      const uploadedImage = await compressImageForUpload(heroFile);
      const response = await fetchAdminApi("/admin/home-hero", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: {
            name: uploadedImage.name,
            data: uploadedImage.data
          }
        })
      });

      if (!response.ok) {
        throw new Error("hero save failed");
      }

      const payload = await response.json();
      setHomeHeroImageUrl(toAbsoluteImageUrl(payload.home_hero_image_url || ""));
      setHeroFile(null);
      setHeroStatus("Banner image saved successfully.");
    } catch (_error) {
      setHeroStatus("Saving banner image failed.");
    }
  };

  return (
    <main className="page">
      <section className="card">
        <h1>Product management</h1>
        <button type="button" className="checkout-link-button" onClick={() => { clearAdminToken(); window.location.assign("/admin"); }}>Logout</button>
        {loading ? <p>Loading product...</p> : null}
        {error ? <p className="warning">{error}</p> : null}

        <div className="admin-links" aria-label="Admin sections">
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin")}>Product settings</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/customers")}>Customer management</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/orders")}>Order management</button>
        </div>

        <div className="admin-tabs" role="tablist" aria-label="Management tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "product"}
            className={`tab-button ${activeTab === "product" ? "tab-button-active" : ""}`}
            onClick={() => setActiveTab("product")}
          >
            Product
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "hero"}
            className={`tab-button ${activeTab === "hero" ? "tab-button-active" : ""}`}
            onClick={() => setActiveTab("hero")}
          >
            Home banner image
          </button>
        </div>

        {activeTab === "product" ? (
          <>
            <form onSubmit={saveProduct} className="order-form">
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" />
              <textarea
                className="admin-textarea"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceUsd}
                onChange={(event) => setPriceUsd(event.target.value)}
                placeholder="Price in USD"
              />
              <input value={ctaText} onChange={(event) => setCtaText(event.target.value)} placeholder="Button text" />
              <label className="file-label">
                Upload product images (you can choose multiple files)
                <input type="file" accept="image/*" multiple onChange={onFilesSelected} />
              </label>
              {selectedFiles.length > 0 ? (
                <>
                  <p className="status">{selectedFiles.length} files selected for upload.</p>
                  {selectedFiles.map((file) => {
                    const key = fileKey(file);
                    return (
                      <label key={key} className="file-label">
                        Color for {file.name}
                        <input
                          value={imageColors[key] || ""}
                          onChange={(event) => setImageColors((current) => ({
                            ...current,
                            [key]: event.target.value
                          }))}
                          placeholder="e.g. Black"
                        />
                      </label>
                    );
                  })}
                </>
              ) : null}

              {existingColors.length > 0 ? (
                <>
                  <h3 className="admin-subtitle">Add more images by color</h3>
                  {existingColors.map((color) => (
                    <label key={`additional-${color}`} className="file-label">
                      Add images to color: {color}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(event) => {
                          const files = Array.from(event.target.files || []);
                          setAdditionalFilesByColor((current) => ({
                            ...current,
                            [color]: files
                          }));
                        }}
                      />
                      {additionalFilesByColor[color]?.length ? (
                        <span>{additionalFilesByColor[color].length} files selected.</span>
                      ) : null}
                    </label>
                  ))}
                </>
              ) : null}

              <button type="submit">Save product</button>
            </form>

            <h2>Active images</h2>
            <div className="thumb-grid">
              {previewProduct.image_entries.map((entry, index) => {
                const key = existingImageKey(entry, index);
                const isRemoved = removedImageKeys.includes(key);
                return (
                  <div key={key} className={`thumb thumb-manageable ${isRemoved ? "thumb-removed" : ""}`}>
                    <img src={entry.image_url} alt={`Product image ${index + 1}`} />
                    {entry.color_name ? <span>{entry.color_name}</span> : null}
                    <button
                      type="button"
                      className="thumb-action"
                      onClick={() => {
                        setRemovedImageKeys((current) => (
                          isRemoved ? current.filter((item) => item !== key) : [...current, key]
                        ));
                      }}
                    >
                      {isRemoved ? "Undo delete" : "Delete image"}
                    </button>
                  </div>
                );
              })}
            </div>
            {removedImageKeys.length > 0 ? (
              <p className="warning">{removedImageKeys.length} images marked for deletion. Click Save product to apply.</p>
            ) : null}

            {status ? <p className="status">{status}</p> : null}
          </>
        ) : (
          <>
            <form onSubmit={saveHomeHero} className="order-form">
              <label className="file-label">
                Upload a wide banner image for the home page
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setHeroFile(event.target.files?.[0] || null)}
                />
              </label>

              <button type="submit">Save banner image</button>
            </form>

            <h2>Current banner image</h2>
            <img src={homeHeroImageUrl} alt="Banner image" className="hero-banner-image" />

            {heroStatus ? <p className="status">{heroStatus}</p> : null}
          </>
        )}
      </section>
      <SiteFooter />
    </main>
  );
};

const AdminCustomersPage = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const loadCustomers = async () => {
      try {
        setLoading(true);
        const response = await fetchAdminApi("/admin/customers", { signal: controller.signal });
        if (!response.ok) {
          throw new Error("customers load failed");
        }

        const payload = await response.json();
        setCustomers(Array.isArray(payload.customers) ? payload.customers : []);
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          setError("Could not load customers.");
        }
      } finally {
        setLoading(false);
      }
    };

    loadCustomers();
    return () => controller.abort();
  }, []);

  return (
    <main className="page product-page">
      <GlobalHeader />
      <section className="card">
        <h1>Customer management</h1>
        <button type="button" className="checkout-link-button" onClick={() => { clearAdminToken(); window.location.assign("/admin"); }}>Logout</button>
        <div className="admin-links" aria-label="Admin sections">
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin")}>Product settings</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/customers")}>Customer management</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/orders")}>Order management</button>
        </div>

        {loading ? <p>Loading customers...</p> : null}
        {error ? <p className="warning">{error}</p> : null}

        {!loading ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Total orders</th>
                  <th>Total items</th>
                  <th>Last order</th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No customers yet.</td>
                  </tr>
                ) : customers.map((customer) => (
                  <tr key={customer.phone}>
                    <td>{customer.customer_name}</td>
                    <td>{customer.phone}</td>
                    <td>{customer.total_orders}</td>
                    <td>{customer.total_items}</td>
                    <td>{formatDateTime(customer.last_order_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <SiteFooter />
    </main>
  );
};

const AdminOrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const loadOrders = async () => {
      try {
        setLoading(true);
        const response = await fetchAdminApi("/admin/orders", { signal: controller.signal });
        if (!response.ok) {
          throw new Error("orders load failed");
        }

        const payload = await response.json();
        setOrders(Array.isArray(payload.orders) ? payload.orders : []);
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          setError("Could not load orders.");
        }
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
    return () => controller.abort();
  }, []);

  return (
    <main className="page product-page">
      <GlobalHeader />
      <section className="card">
        <h1>Order management</h1>
        <button type="button" className="checkout-link-button" onClick={() => { clearAdminToken(); window.location.assign("/admin"); }}>Logout</button>
        <div className="admin-links" aria-label="Admin sections">
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin")}>Product settings</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/customers")}>Customer management</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/orders")}>Order management</button>
        </div>

        {loading ? <p>Loading orders...</p> : null}
        {error ? <p className="warning">{error}</p> : null}

        {!loading ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>Created at</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No orders yet.</td>
                  </tr>
                ) : orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>{order.customer_name}</td>
                    <td>{order.phone}</td>
                    <td>{order.product_title}</td>
                    <td>{order.quantity}</td>
                    <td>{order.status}</td>
                    <td>{formatDateTime(order.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <SiteFooter />
    </main>
  );
};

const CartPage = () => {
  const [items, setItems] = useState(() => readCartItems());

  const persistItems = (nextItems) => {
    setItems(nextItems);
    writeCartItems(nextItems);
  };

  const clearCart = () => {
    persistItems([]);
  };

  const removeItem = (itemIndex) => {
    persistItems(items.filter((_, index) => index !== itemIndex));
  };

  const updateItemQuantity = (itemIndex, nextQuantity) => {
    const sanitizedQuantity = Math.max(1, nextQuantity);
    persistItems(items.map((item, index) => (
      index === itemIndex ? { ...item, quantity: sanitizedQuantity } : item
    )));
  };

  const updateItemColor = (itemIndex, nextColor) => {
    persistItems(items.map((item, index) => {
      if (index !== itemIndex) {
        return item;
      }

      return {
        ...item,
        color: nextColor,
        image: item.images_by_color?.[nextColor] || item.image
      };
    }));
  };

  const totalUsd = items.reduce(
    (sum, item) => sum + (item.price_usd || item.price_ils || 0) * (item.quantity || 1),
    0
  );

  return (
    <main className="page product-page">
      <GlobalHeader />

      <section className="card cart-actions-card" aria-label="Cart actions">
        <p className="home-eyebrow">SHOPPING BAG</p>
        <h2 className="product-step-main-title">Your cart</h2>
        <p className="home-subtitle">Review your picks before checkout.</p>
        <div className="home-actions" aria-label="Cart actions">
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/")}><span className="home-action-icon">↩️</span>Back to store</button>
          <button type="button" className="home-action-button" onClick={clearCart} disabled={items.length === 0}><span className="home-action-icon">🧹</span>Clear cart</button>
        </div>
      </section>

      <section className="card cart-list" aria-label="Cart items">
        {items.length === 0 ? <p>Your cart is empty.</p> : null}

        {items.map((item, index) => (
          <article key={`${item.added_at || item.title}-${index}`} className="cart-item">
            <img src={item.image} alt={item.title} className="cart-item-image" />
            <div>
              <h2>{item.title}</h2>
              <p>Color: {item.color || "Not selected"}</p>
              <p>Size: {item.size}</p>
              <p>Quantity: {item.quantity || 1}</p>
              <p>Price per unit: {formatUsdCents(item.price_usd || item.price_ils || 0)}</p>
              <p>Item total: {formatUsdCents((item.price_usd || item.price_ils || 0) * (item.quantity || 1))}</p>
              <div className="cart-item-actions">
                <div className="cart-qty-controls" role="group" aria-label={`Update quantity for ${item.title}`}>
                  <button
                    type="button"
                    className="home-action-button"
                    onClick={() => updateItemQuantity(index, (item.quantity || 1) - 1)}
                  >
                    −
                  </button>
                  <span>{item.quantity || 1}</span>
                  <button
                    type="button"
                    className="home-action-button"
                    onClick={() => updateItemQuantity(index, (item.quantity || 1) + 1)}
                  >
                    +
                  </button>
                </div>

                {Array.isArray(item.color_options) && item.color_options.length > 0 ? (
                  <label>
                    Color
                    <select
                      value={item.color || item.color_options[0]}
                      onChange={(event) => updateItemColor(index, event.target.value)}
                    >
                      {item.color_options.map((colorOption) => (
                        <option key={colorOption} value={colorOption}>{colorOption}</option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <button type="button" className="home-action-button" onClick={() => removeItem(index)}>
                  Remove item
                </button>
              </div>
            </div>
          </article>
        ))}

        {items.length > 0 ? <p className="status">Total: {formatUsdCents(totalUsd)}</p> : null}

        {items.length > 0 ? (
          <button
            type="button"
            className="checkout-next-button"
            onClick={() => window.location.assign("/shipping-details")}
          >
            Continue to shipping details
          </button>
        ) : null}

        <button
          type="button"
          className="checkout-link-button"
          onClick={() => window.location.assign("/privacy-shipping-policy")}
        >
          Privacy & shipping policy
        </button>
      </section>
    </main>
  );
};

const ShippingDetailsPage = () => {
  const [isPaymentNoticeOpen, setIsPaymentNoticeOpen] = useState(false);

  const submitShippingDetails = (event) => {
    event.preventDefault();
    setIsPaymentNoticeOpen(true);
  };

  return (
    <main className="page product-page">
      <GlobalHeader />

      <section className="card shipping-card">
        <p className="home-eyebrow">CHECKOUT</p>
        <h2 className="product-step-main-title">Shipping details</h2>
        <p className="home-subtitle">Fill in all required fields for shipping within the United States.</p>

        <form className="order-form" onSubmit={submitShippingDetails}>
          <input name="firstName" autoComplete="given-name" required placeholder="First name" />
          <input name="lastName" autoComplete="family-name" required placeholder="Last name" />
          <input name="phone" type="tel" autoComplete="tel" required placeholder="Phone number" />
          <input name="email" type="email" autoComplete="email" required placeholder="Email" />
          <input name="addressLine1" autoComplete="address-line1" required placeholder="Street address" />
          <input name="addressLine2" autoComplete="address-line2" placeholder="Apartment, suite, unit, building (optional)" />
          <input name="city" autoComplete="address-level2" required placeholder="City" />
          <select name="state" required defaultValue="">
            <option value="" disabled>Select state</option>
            {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"].map((stateCode) => (
              <option key={stateCode} value={stateCode}>{stateCode}</option>
            ))}
          </select>
          <input name="zip" inputMode="numeric" autoComplete="postal-code" required placeholder="ZIP code" pattern="[0-9]{5}(-[0-9]{4})?" title="Use ZIP format 12345 or 12345-6789" />
          <input name="country" required defaultValue="United States" readOnly />
          <textarea name="deliveryNotes" rows="3" placeholder="Delivery notes (optional)" />
          <button type="submit">Continue to payment</button>
        </form>
      </section>

      {isPaymentNoticeOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsPaymentNoticeOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Payment status"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Online payment is not available yet</h2>
            <p>We are still working on online checkout. Please leave your shipping details and we will contact you to complete the order.</p>
            <button type="button" onClick={() => setIsPaymentNoticeOpen(false)}>Close</button>
          </div>
        </div>
      ) : null}
      <SiteFooter />
    </main>
  );
};

const PrivacyShippingPolicyPage = () => (
  <main className="page product-page">
    <GlobalHeader />

    <section className="card policy-card">
      <p className="home-eyebrow">POLICY</p>
      <h2 className="product-step-main-title">Privacy & shipping policy</h2>

      <h3 id="privacy-policy">Privacy policy</h3>
      <p>We respect your privacy and protect personal information provided through this website.</p>
      <ul className="details-list">
        <li>We collect information needed to process orders, provide support, and improve our service.</li>
        <li>We do not sell personal information to third parties.</li>
        <li>We only share relevant data with shipping and service providers required to complete your order.</li>
        <li>You may contact us to request access, correction, or deletion of your personal data.</li>
      </ul>

      <h3 id="shipping-policy">Shipping policy</h3>
      <ul className="details-list">
        <li>Estimated delivery time is 3-7 business days for most U.S. destinations.</li>
        <li>Delivery times may vary during holidays, peak periods, weather events, or carrier delays.</li>
        <li>Please ensure your shipping details are accurate to avoid delivery issues.</li>
        <li>If a shipment is delayed or returned, our support team will contact you with next steps.</li>
      </ul>
    </section>
    <SiteFooter />
  </main>
);

function App() {
  useEffect(() => {
    applyPageSeo(window.location.pathname);
  }, []);

  const isCartPage = window.location.pathname === "/cart";
  const isAdminPage = window.location.pathname === "/admin";
  const isAdminCustomersPage = window.location.pathname === "/admin/customers";
  const isAdminOrdersPage = window.location.pathname === "/admin/orders";
  const isShippingDetailsPage = window.location.pathname === "/shipping-details";
  const isPolicyPage = window.location.pathname === "/privacy-shipping-policy";
  if (isAdminCustomersPage) {
    return <AdminAuthGate><AdminCustomersPage /></AdminAuthGate>;
  }

  if (isAdminOrdersPage) {
    return <AdminAuthGate><AdminOrdersPage /></AdminAuthGate>;
  }

  if (isAdminPage) {
    return <AdminAuthGate><AdminPage /></AdminAuthGate>;
  }

  if (isShippingDetailsPage) {
    return <ShippingDetailsPage />;
  }

  if (isPolicyPage) {
    return <PrivacyShippingPolicyPage />;
  }

  if (isCartPage) {
    return <CartPage />;
  }

  return <StorePage />;
}

export default App;
