import { useEffect, useState } from "react";

const fallbackProduct = {
  title: "loafers",
  description:
    "Water-resistant everyday loafers that are lightweight, odor-resistant, and built for all-day comfort.",
  price_usd: 29900,
  image_url: "",
  images: [],
  image_entries: [],
  cta_text: "Order now"
};

const fallbackHomeHeroImage = "";
const fallbackStoreLocations = [
  { id: 1, store_name: "Crocspot", store_address: "80 Truman Ave. Apt. 111, Spring Valley, NY 10977" },
  { id: 2, store_name: "Designer Step", store_address: "74 Lee Ave., Brooklyn, NY 11211" },
  { id: 3, store_name: "Frankel's Designer Shoes", store_address: "100 Route 59 Suite 11, Monsey, NY 10952" },
  { id: 4, store_name: "Hatzlucha Shoes", store_address: "48 Bakertown Rd., Monroe, NY 10950" },
  { id: 5, store_name: "Marvel", store_address: "218 Wallabout St., Brooklyn, NY 11205" },
  { id: 6, store_name: "Mens Footwear", store_address: "51 Forest Rd #205, Monroe, NY 10950" },
  { id: 7, store_name: "your shoo", store_address: "5001 18th Ave., Brooklyn, NY 11204" },
  { id: 8, store_name: "Shoe Barn", store_address: "11 Main St., Monsey, NY 10952" },
  { id: 9, store_name: "Shoe Gardens", store_address: "157 Lee Ave., Brooklyn, NY 11211" },
  { id: 10, store_name: "Shoe Palace NJ", store_address: "6951 US 9 Unit 8, Howell, NJ 07731" },
  { id: 11, store_name: "Step In Elegance", store_address: "268 Cedar Bridge Ave., Lakewood, NJ 08701" },
  { id: 12, store_name: "Weingarten shoes", store_address: "27 Orchard St #206, Monsey, NY 10952" },
  { id: 13, store_name: "Shoe Laces", store_address: "5303 13th Ave., Brooklyn, NY 11219" }
];

const apiUrl = (import.meta.env.VITE_API_URL || "/api").trim();
const CART_STORAGE_KEY = "shos-cart-items";
const ADMIN_AUTH_STORAGE_KEY = "shos-admin-auth";
const ADMIN_DEFAULT_USERNAME = "admin";
const ABOUT_SECTION_HASH = "#home-about-images";
const CUSTOMER_SESSION_STORAGE_KEY = "shos-customer-session";

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

const getCartItemCount = (items) => (Array.isArray(items)
  ? items.reduce((total, item) => total + Math.max(1, Number(item?.quantity) || 1), 0)
  : 0);

const formatUsdCents = (value) => `$${((value || 0) / 100).toFixed(2)} USD`;
const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : "-");
const formatBrooklynDateTime = (value) => (value
  ? new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York"
  }).format(new Date(value))
  : "-");

const VISITOR_STATUS_LABELS = {
  active: "Active (last 7 days)",
  at_risk: "Needs follow-up",
  inactive: "Inactive"
};

const toVisitorStatusLabel = (value) => VISITOR_STATUS_LABELS[value] || "Unknown";

const SITE_NAME = "Sholors-Loafers";
const SITE_LOGO_URL = toAbsoluteImageUrl("/uploads/logo.png");
const SITE_FAVICON_URL = toAbsoluteImageUrl("/uploads/logo-s.png");
const DEFAULT_SEO_IMAGE =

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
  "/men-shoe": {
    title: "Men's Loafers | Sholors-Loafers",
    description:
      "Meet the men's loafer everyone has been waiting for: lightweight, water-resistant, and ready for all-day comfort.",
    keywords: "men loafers, comfortable men's shoes, lightweight men's loafers"
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
  "/stores": {
    title: "Store Locations | Sholors-Loafers",
    description: "Find stores that carry our loafers across New York and New Jersey.",
    keywords: "store locations, shoe stores, loafers retailers, where to buy"
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
  },
  "/admin/locations": {
    title: "Admin Store Locations | Sholors-Loafers",
    description: "Manage store locations that sell your products.",
    keywords: "admin locations, store list management",
    robots: "noindex,nofollow,noarchive,nosnippet,max-image-preview:none"
  },
  "/account": {
    title: "My Account | Sholors-Loafers",
    description: "Sign in with email code and view your order history.",
    keywords: "customer account, order history, email login",
    robots: "noindex,nofollow"
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

const readCustomerSession = () => {
  try {
    const rawValue = window.localStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY);
    const parsed = JSON.parse(rawValue || "null");
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (!parsed.session_token || !parsed.email) {
      return null;
    }

    return parsed;
  } catch (_error) {
    return null;
  }
};

const writeCustomerSession = (session) => {
  window.localStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, JSON.stringify(session));
};

const clearCustomerSession = () => {
  window.localStorage.removeItem(CUSTOMER_SESSION_STORAGE_KEY);
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

const useStoreLocations = () => {
  const [stores, setStores] = useState(fallbackStoreLocations);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const loadStores = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(`${apiUrl}/stores`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error("stores load failed");
        }

        const payload = await response.json();
        const nextStores = Array.isArray(payload?.stores) ? payload.stores : [];
        setStores(nextStores.length > 0 ? nextStores : fallbackStoreLocations);
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          setError("Could not load store locations right now.");
          setStores(fallbackStoreLocations);
        }
      } finally {
        setLoading(false);
      }
    };

    loadStores();
    return () => controller.abort();
  }, []);

  return { stores, loading, error };
};


const useSiteAvailability = () => {
  const [shabbatStatus, setShabbatStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    const loadStatus = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${apiUrl}/site-status`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Failed to load site status: ${response.status}`);
        }

        const payload = await response.json();
        setShabbatStatus(payload?.shabbat_status || null);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Failed to load site availability", error);
          setShabbatStatus(null);
        }
      } finally {
        setLoading(false);
      }
    };

    loadStatus();
    return () => controller.abort();
  }, []);

  return {
    shabbatStatus,
    loading
  };
};

const useProduct = () => {
  const [product, setProduct] = useState(null);
  const [homeHeroImageUrl, setHomeHeroImageUrl] = useState("");
  const [shippingPriceUsd, setShippingPriceUsd] = useState(0);
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
        setShippingPriceUsd(Number(payload.shipping_price_usd || 0));
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Product update from server failed:", err);
          setError("We couldn't load the product data from the server. Showing fallback content.");
          setProduct(normalizeProduct(fallbackProduct));
          setHomeHeroImageUrl(fallbackHomeHeroImage);
          setShippingPriceUsd(0);
        }
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
    return () => controller.abort();
  }, []);

  return {
    product,
    setProduct,
    homeHeroImageUrl,
    setHomeHeroImageUrl,
    shippingPriceUsd,
    setShippingPriceUsd,
    loading,
    error
  };
};


const ContactModal = ({ onClose }) => {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const cleanedMessage = message.trim();
    if (!cleanedMessage) {
      setSubmitError("Please enter a message to the store before sending.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const response = await fetch(`${apiUrl}/contact-requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: cleanedMessage })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Failed to send contact request");
      }

      setIsSubmitted(true);
      setMessage("");
    } catch (error) {
      console.error("Failed to send contact request", error);
      setSubmitError("We could not send your message right now. Please try again in a few minutes.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Contact us"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Contact us</h2>
        <p>Write us a message and our store team will get back to you soon.</p>
        <ul className="contact-list">
          <li><strong>Email:</strong> info@sholors-loafers.com</li>
          <li><strong>Address:</strong> 199 Lee Ave. STE 684, Brooklyn NY 11211</li>
        </ul>
        <form className="contact-form" onSubmit={handleSubmit}>
          <label className="contact-form-label" htmlFor="contact-message">Message to the store</label>
          <textarea
            id="contact-message"
            className="contact-form-textarea"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Write your message here"
            rows={5}
            disabled={isSubmitting || isSubmitted}
            required
          />
          {submitError ? <p className="contact-form-feedback contact-form-feedback-error">{submitError}</p> : null}
          {isSubmitted ? <p className="contact-form-feedback contact-form-feedback-success">The store team will contact you in the coming days.</p> : null}
          <div className="contact-form-actions">
            <button type="submit" disabled={isSubmitting || isSubmitted}>
              {isSubmitting ? "Sending..." : "Send"}
            </button>
            <button type="button" className="contact-form-secondary-button" onClick={onClose}>Close</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const GlobalHeader = ({ cartItemCount = 0 }) => {
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

  return (
    <>
      <header className="home-header">
        <div className="home-title-wrap">
          <img src={SITE_LOGO_URL} alt="Sholors-Loafers logo" className="home-logo" />
          <h1 className="home-title">Sholors-Loafers</h1>
          <p className="home-store-name">Sholors-Loafers Store</p>
          <p className="home-eyebrow">Ultra-Comfort, Non-Slip, Foldable, Ventilated, Easy On Softers Loafers for Women</p>
        </div>
        <nav className="home-actions" aria-label="Main actions">
          <button type="button" className="home-action-button" onClick={() => setIsContactModalOpen(true)}><span className="home-action-icon">📞</span>Contact</button>
          <button type="button" className="home-action-button"><span className="home-action-icon">ℹ️</span>About</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/stores")}><span className="home-action-icon">🏬</span>Store list</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/account")}><span className="home-action-icon">👤</span>Sign in</button>
          <button type="button" className="home-action-button home-action-cart-button" onClick={() => window.location.assign("/cart")}>
            <span className="home-action-icon">🛒</span>
            Cart
            {cartItemCount > 0 ? <span className="cart-count-badge" aria-label={`Cart has ${cartItemCount} items`}>{cartItemCount}</span> : null}
          </button>
        </nav>
      </header>
      {isContactModalOpen ? <ContactModal onClose={() => setIsContactModalOpen(false)} /> : null}
    </>
  );
};

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
        <li><strong>Email:</strong> info@sholors-loafers.com</li>
        <li><strong>Address:</strong> 199 Lee Ave. STE 684, Brooklyn NY 11211</li>
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

  const currentProduct = product ? normalizeProduct(product) : null;
  const displayImage = currentProduct
    ? currentProduct.images[selectedImageIndex] || currentProduct.image_url
    : "";
  const selectedImageColor = currentProduct?.image_entries[selectedImageIndex]?.color_name || "";
  const selectedImageColorKey = selectedImageColor.trim().toLowerCase();
  const homeColorImageIndices = listPrimaryImageIndicesByColor(currentProduct?.image_entries);
  const productStepImageIndices = (currentProduct?.images || [])
    .map((_, index) => index)
    .filter((index) => {
      if (!selectedImageColorKey) {
        return true;
      }

      const imageColor = String(currentProduct?.image_entries[index]?.color_name || "").trim().toLowerCase();
      return imageColor === selectedImageColorKey;
    });

  useEffect(() => {
    if (selectedImageIndex >= (currentProduct?.images.length || 0)) {
      setSelectedImageIndex(0);
    }
  }, [currentProduct?.images.length, selectedImageIndex]);

  useEffect(() => {
    const syncCartItems = () => setCartItems(readCartItems());
    window.addEventListener("storage", syncCartItems);

    return () => {
      window.removeEventListener("storage", syncCartItems);
    };
  }, []);

  useEffect(() => {
    if (window.location.hash !== ABOUT_SECTION_HASH) {
      return;
    }

    const section = document.querySelector(ABOUT_SECTION_HASH);
    if (!section) {
      return;
    }

    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const sizeChartRows = [
    { brandSize: "35", usSize: "4", euSize: "35", shoeWidth: "9.8", footLength: "8.8" },
    { brandSize: "36", usSize: "5", euSize: "36", shoeWidth: "10.1", footLength: "9.1" },
    { brandSize: "37", usSize: "6", euSize: "37", shoeWidth: "10.3", footLength: "9.4" },
    { brandSize: "38", usSize: "7", euSize: "38", shoeWidth: "10.6", footLength: "9.6" },
    { brandSize: "39", usSize: "8", euSize: "39", shoeWidth: "10.9", footLength: "9.9" },
    { brandSize: "40", usSize: "9", euSize: "40", shoeWidth: "11.2", footLength: "10.1" }
  ];

  const usdPrice = (((currentProduct?.price_usd || 0) / 100)).toFixed(2);

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
    if (!currentProduct) {
      setStatus("Product data is still loading. Please wait a moment and try again.");
      return;
    }

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
      price_usd: currentProduct?.price_usd || 0,
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
        <GlobalHeader cartItemCount={getCartItemCount(cartItems)} />
        <section className="card product-step-page" aria-label="Product page">
          {loading ? <p>Loading product...</p> : null}
          {error ? <p className="warning">{error}</p> : null}

          <h1 className="product-step-main-title">Product page</h1>

          <section className="product-step-image-block" aria-label="Product image">
            {displayImage ? <img src={displayImage} alt={currentProduct?.title || "Product image"} className="product-image" /> : null}
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
                    {currentProduct?.image_entries[index]?.color_name ? (
                      <span>{currentProduct.image_entries[index].color_name}</span>
                    ) : null}
                  </button>
                  );
                })}
              </div>
            ) : null}

            {selectedImageColor ? <p className="status">Selected color: {selectedImageColor}</p> : null}
            <h2 className="product-step-product-title">{currentProduct?.title || ""}</h2>
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
      <GlobalHeader cartItemCount={getCartItemCount(cartItems)} />

      <section className="hero-banner">
        {homeHeroImageUrl ? <img src={homeHeroImageUrl} alt="Main banner" className="hero-banner-image" /> : null}
      </section>

      <section className="card">
        {loading ? <p>Loading product...</p> : null}
        {error ? <p className="warning">{error}</p> : null}

        {displayImage ? <img src={displayImage} alt={currentProduct?.title || "Product image"} className="product-image" /> : null}

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
                  {currentProduct?.image_entries[index]?.color_name ? (
                    <span>{currentProduct.image_entries[index].color_name}</span>
                  ) : null}
                </button>
                );
              })}
            </div>
          </>
        ) : null}

        {selectedImageColor ? <p className="status">Selected color: {selectedImageColor}</p> : null}

        <h1>{currentProduct?.title || ""}</h1>
        <p>{currentProduct?.description || ""}</p>
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

      <section id="home-about-images" className="card stacked-home-images" aria-label="Additional home images">
        <img src="/uploads/abc.jpg" alt="Promotional image top" className="stacked-home-image" />
        <img src="/uploads/dfg.jpg" alt="Promotional image bottom" className="stacked-home-image" />
      </section>
      <SiteFooter />
    </main>
  );
};

const MenShoePage = () => {
  const { product, loading, error } = useProduct();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [status, setStatus] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);

  const currentProduct = product ? normalizeProduct(product) : null;
  const displayImage = currentProduct
    ? currentProduct.images[selectedImageIndex] || currentProduct.image_url
    : "";
  const selectedImageColor = currentProduct?.image_entries[selectedImageIndex]?.color_name || "";

  const menSizeRows = [
    { size: "40" },
    { size: "41" },
    { size: "42" },
    { size: "43" },
    { size: "44" },
    { size: "45" }
  ];

  const addCurrentSelectionToCart = () => {
    if (!currentProduct) {
      setStatus("Product data is still loading. Please wait a moment and try again.");
      return;
    }

    if (!selectedSize) {
      setStatus("Please select one size before adding to cart.");
      return;
    }

    appendCartItem({
      title: "Men's Loafer - The One You've Been Waiting For",
      image: displayImage,
      color: selectedImageColor,
      size: selectedSize,
      quantity,
      price_usd: currentProduct?.price_usd || 0,
      added_at: new Date().toISOString()
    });

    setStatus("Men's loafer added to cart successfully.");
  };

  return (
    <main className="page men-page">
      <GlobalHeader cartItemCount={getCartItemCount(readCartItems())} />

      <section className="card men-hero-card">
        <p className="home-eyebrow">NEW ARRIVAL</p>
        <h1 className="product-step-main-title">The men's shoe you've been waiting for</h1>
        <p className="home-subtitle">
          Built for movement and comfort all day long, with the lightweight feel you already love.
        </p>
      </section>

      <section className="card">
        {loading ? <p>Loading product...</p> : null}
        {error ? <p className="warning">{error}</p> : null}

        {displayImage ? <img src={displayImage} alt="Men's loafer" className="product-image" /> : null}

        {(currentProduct?.images || []).length > 1 ? (
          <div className="thumb-grid">
            {currentProduct.images.map((image, index) => (
              <button
                key={`men-image-${image}-${index}`}
                type="button"
                className={`thumb ${selectedImageIndex === index ? "thumb-active" : ""}`}
                onClick={() => setSelectedImageIndex(index)}
              >
                <img src={image} alt={`Men's loafer view ${index + 1}`} />
                {currentProduct?.image_entries[index]?.color_name ? (
                  <span>{currentProduct.image_entries[index].color_name}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        {selectedImageColor ? <p className="status">Selected color: {selectedImageColor}</p> : null}

        <h2>Men's Loafer - The One You've Been Waiting For</h2>
        <p>
          Water-resistant, breathable, and easy to wear. Designed for daily errands, work, and weekend use.
        </p>
        <p className="status">Price: {formatUsdCents(currentProduct?.price_usd || 0)}</p>

        <h3>Select your size</h3>
        <div className="size-choice-pills" role="group" aria-label="Men size selection">
          {menSizeRows.map((row) => {
            const active = selectedSize === row.size;
            return (
              <button
                key={`men-size-${row.size}`}
                type="button"
                className={`size-pill ${active ? "size-pill-active" : ""}`}
                onClick={() => setSelectedSize(row.size)}
                aria-pressed={active}
              >
                {row.size}
              </button>
            );
          })}
        </div>

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

        <div className="order-form">
          <button type="button" onClick={addCurrentSelectionToCart}>Add men's shoe to cart</button>
        </div>

        {status ? <p className="status">{status}</p> : null}
      </section>
      <SiteFooter />
    </main>
  );
};

const MenLaunchButton = () => (
  <button
    type="button"
    className="men-launch-popup-button"
    onClick={() => window.location.assign("/men-shoe")}
    aria-label="New men's shoe available"
  >
    ✨ New: Men's Shoe
    <span>The men's shoe you've been waiting for</span>
  </button>
);

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
      <GlobalHeader cartItemCount={getCartItemCount(readCartItems())} />
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
  const {
    product,
    setProduct,
    homeHeroImageUrl,
    setHomeHeroImageUrl,
    shippingPriceUsd,
    setShippingPriceUsd,
    loading,
    error
  } = useProduct();
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
  const [shippingPriceInput, setShippingPriceInput] = useState("0");
  const [shippingStatus, setShippingStatus] = useState("");

  useEffect(() => {
    const current = normalizeProduct(product || fallbackProduct);
    setTitle(current.title);
    setDescription(current.description);
    setPriceUsd(String((current.price_usd || 0) / 100));
    setCtaText(current.cta_text);
  }, [product]);

  useEffect(() => {
    setShippingPriceInput(String((shippingPriceUsd || 0) / 100));
  }, [shippingPriceUsd]);

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

  const saveShippingPrice = async (event) => {
    event.preventDefault();
    setShippingStatus("");

    const parsedShippingPrice = Number(shippingPriceInput);
    if (!Number.isFinite(parsedShippingPrice) || parsedShippingPrice < 0) {
      setShippingStatus("Invalid shipping price.");
      return;
    }

    try {
      const response = await fetchAdminApi("/admin/shipping-price", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipping_price_usd: Math.round(parsedShippingPrice * 100)
        })
      });

      if (!response.ok) {
        throw new Error("shipping price save failed");
      }

      const payload = await response.json();
      setShippingPriceUsd(Number(payload.shipping_price_usd || 0));
      setShippingStatus("Shipping price saved successfully.");
    } catch (_error) {
      setShippingStatus("Saving shipping price failed.");
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
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/locations")}>Store locations</button>
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
              <label>
                Shipping price in USD
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shippingPriceInput}
                  onChange={(event) => setShippingPriceInput(event.target.value)}
                  placeholder="Shipping price in USD"
                />
              </label>
              <button type="button" onClick={saveShippingPrice}>Save shipping price</button>
              {shippingStatus ? <p className="status">{shippingStatus}</p> : null}
              <p className="status">Current shipping price: {formatUsdCents(shippingPriceUsd)}</p>
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

  const loadCustomers = async (signal) => {
    try {
      setLoading(true);
      setError("");
      const response = await fetchAdminApi("/admin/customers", { signal });
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

  useEffect(() => {
    const controller = new AbortController();
    loadCustomers(controller.signal);
    return () => controller.abort();
  }, []);

  const activeVisitors = customers.filter((customer) => customer.visitor_status === "active").length;
  const atRiskVisitors = customers.filter((customer) => customer.visitor_status === "at_risk").length;
  const totalOrders = customers.reduce((sum, customer) => sum + Number(customer.total_orders || 0), 0);

  return (
    <main className="page product-page">
      <GlobalHeader cartItemCount={getCartItemCount(readCartItems())} />
      <section className="card admin-management-card">
        <div className="admin-management-header">
          <div>
            <p className="admin-kicker">Admin dashboard</p>
            <h1>Customer management</h1>
            <p className="home-subtitle admin-subcopy">Track returning visitors and quickly identify who needs follow-up.</p>
          </div>
          <div className="admin-toolbar-actions">
            <button type="button" className="home-action-button" onClick={() => loadCustomers()}>
              Refresh visitors
            </button>
            <button type="button" className="checkout-link-button" onClick={() => { clearAdminToken(); window.location.assign("/admin"); }}>
              Logout
            </button>
          </div>
        </div>

        <div className="admin-links" aria-label="Admin sections">
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin")}>Product settings</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/customers")}>Customer management</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/orders")}>Order management</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/locations")}>Store locations</button>
        </div>

        <div className="admin-metrics-grid" aria-label="Customer metrics">
          <article className="admin-metric-card">
            <p>Total visitors</p>
            <strong>{customers.length}</strong>
          </article>
          <article className="admin-metric-card">
            <p>Active visitors</p>
            <strong>{activeVisitors}</strong>
          </article>
          <article className="admin-metric-card">
            <p>Needs follow-up</p>
            <strong>{atRiskVisitors}</strong>
          </article>
          <article className="admin-metric-card">
            <p>Total orders</p>
            <strong>{totalOrders}</strong>
          </article>
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
                  <th>Visitor status</th>
                  <th>Total orders</th>
                  <th>Total items</th>
                  <th>Last order</th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No customers yet.</td>
                  </tr>
                ) : customers.map((customer) => (
                  <tr key={customer.phone}>
                    <td>{customer.customer_name}</td>
                    <td>{customer.phone}</td>
                    <td>
                      <span className={`visitor-status-badge visitor-status-${customer.visitor_status || "unknown"}`}>
                        {toVisitorStatusLabel(customer.visitor_status)}
                      </span>
                    </td>
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
      <GlobalHeader cartItemCount={getCartItemCount(readCartItems())} />
      <section className="card">
        <h1>Order management</h1>
        <button type="button" className="checkout-link-button" onClick={() => { clearAdminToken(); window.location.assign("/admin"); }}>Logout</button>
        <div className="admin-links" aria-label="Admin sections">
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin")}>Product settings</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/customers")}>Customer management</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/orders")}>Order management</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/locations")}>Store locations</button>
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

const AdminStoreLocationsPage = () => {
  const [stores, setStores] = useState([]);
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const loadStores = async (signal) => {
    try {
      setLoading(true);
      setError("");
      const response = await fetchAdminApi("/admin/stores", { signal });
      if (!response.ok) {
        throw new Error("store load failed");
      }

      const payload = await response.json();
      setStores(Array.isArray(payload?.stores) ? payload.stores : []);
    } catch (loadError) {
      if (loadError.name !== "AbortError") {
        setError("Could not load store locations.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadStores(controller.signal);
    return () => controller.abort();
  }, []);

  const addStore = async (event) => {
    event.preventDefault();
    setStatus("");
    setError("");

    const trimmedName = storeName.trim();
    const trimmedAddress = storeAddress.trim();
    if (!trimmedName || !trimmedAddress) {
      setStatus("Store name and address are required.");
      return;
    }

    try {
      const response = await fetchAdminApi("/admin/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_name: trimmedName,
          store_address: trimmedAddress
        })
      });

      if (!response.ok) {
        throw new Error("create store failed");
      }

      const payload = await response.json();
      setStores((current) => [...current, payload.store]);
      setStoreName("");
      setStoreAddress("");
      setStatus("Store added successfully.");
    } catch (_saveError) {
      setError("Failed to add store location.");
    }
  };

  return (
    <main className="page">
      <section className="card">
        <h1>Store locations management</h1>
        <button type="button" className="checkout-link-button" onClick={() => { clearAdminToken(); window.location.assign("/admin"); }}>Logout</button>
        <div className="admin-links" aria-label="Admin sections">
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin")}>Product settings</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/customers")}>Customer management</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/orders")}>Order management</button>
          <button type="button" className="home-action-button" onClick={() => window.location.assign("/admin/locations")}>Store locations</button>
        </div>

        <form onSubmit={addStore} className="order-form">
          <input value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="Store name" />
          <textarea
            className="admin-textarea"
            value={storeAddress}
            onChange={(event) => setStoreAddress(event.target.value)}
            placeholder="Store address"
          />
          <button type="submit">Add store</button>
        </form>

        {status ? <p className="status">{status}</p> : null}
        {error ? <p className="warning">{error}</p> : null}
        {loading ? <p>Loading stores...</p> : null}

        <div className="stores-grid">
          {stores.map((store) => (
            <article key={`${store.id}-${store.store_name}`} className="store-location-card">
              <h3>{store.store_name}</h3>
              <p>{store.store_address}</p>
            </article>
          ))}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
};

const CartPage = () => {
  const [items, setItems] = useState(() => readCartItems());
  const { shippingPriceUsd } = useProduct();

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
  const orderTotalUsd = totalUsd + shippingPriceUsd;

  return (
    <main className="page product-page">
      <GlobalHeader cartItemCount={getCartItemCount(items)} />

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

        {items.length > 0 ? (
          <>
            <p className="status">Products total: {formatUsdCents(totalUsd)}</p>
            <p className="status">Shipping: {formatUsdCents(shippingPriceUsd)}</p>
            <p className="status">Order total: {formatUsdCents(orderTotalUsd)}</p>
          </>
        ) : null}

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
  const { shippingPriceUsd } = useProduct();
  const cartSubtotalUsd = readCartItems().reduce(
    (sum, item) => sum + (item.price_usd || item.price_ils || 0) * (item.quantity || 1),
    0
  );

  const submitShippingDetails = (event) => {
    event.preventDefault();
    setIsPaymentNoticeOpen(true);
  };

  return (
    <main className="page product-page">
      <GlobalHeader cartItemCount={getCartItemCount(readCartItems())} />

      <section className="card shipping-card">
        <p className="home-eyebrow">CHECKOUT</p>
        <h2 className="product-step-main-title">Shipping details</h2>
        <p className="home-subtitle">Fill in all required fields for shipping within the United States.</p>
        <p className="status">Products total: {formatUsdCents(cartSubtotalUsd)}</p>
        <p className="status">Shipping price: {formatUsdCents(shippingPriceUsd)}</p>
        <p className="status">Estimated order total: {formatUsdCents(cartSubtotalUsd + shippingPriceUsd)}</p>

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

const AccountPage = () => {
  const [session, setSession] = useState(() => readCustomerSession());
  const [emailInput, setEmailInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [isCodeRequested, setIsCodeRequested] = useState(false);
  const [status, setStatus] = useState("");
  const [orders, setOrders] = useState([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  const requestLoginCode = async (event) => {
    event.preventDefault();
    setStatus("");

    try {
      const response = await fetch(`${apiUrl}/customer-auth/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.trim().toLowerCase() })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Failed to send login code");
      }

      setIsCodeRequested(true);
      setStatus("Login code sent to your email.");
    } catch (error) {
      setStatus(error.message || "Failed to send login code");
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setStatus("");

    try {
      const response = await fetch(`${apiUrl}/customer-auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailInput.trim().toLowerCase(),
          code: codeInput.trim()
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Failed to verify code");
      }

      writeCustomerSession(payload);
      setSession(payload);
      setStatus("You are now signed in.");
    } catch (error) {
      setStatus(error.message || "Failed to verify code");
    }
  };

  const logout = () => {
    clearCustomerSession();
    setSession(null);
    setOrders([]);
    setIsCodeRequested(false);
    setCodeInput("");
    setStatus("You have been signed out.");
  };

  useEffect(() => {
    if (!session?.session_token) {
      return;
    }

    const controller = new AbortController();

    const loadOrders = async () => {
      try {
        setIsLoadingOrders(true);
        const response = await fetch(`${apiUrl}/customer/me/orders`, {
          headers: { Authorization: `Bearer ${session.session_token}` },
          signal: controller.signal
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || "Failed to load order history");
        }

        setOrders(Array.isArray(payload.orders) ? payload.orders : []);
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }

        if (String(error.message || "").toLowerCase().includes("expired")) {
          clearCustomerSession();
          setSession(null);
        }

        setStatus(error.message || "Failed to load order history");
      } finally {
        setIsLoadingOrders(false);
      }
    };

    loadOrders();
    return () => controller.abort();
  }, [session?.session_token]);

  return (
    <main className="page product-page">
      <GlobalHeader cartItemCount={getCartItemCount(readCartItems())} />

      <section className="card shipping-card">
        <p className="home-eyebrow">MY ACCOUNT</p>
        <h2 className="product-step-main-title">Customer sign in</h2>
        <p className="home-subtitle">Real sign-in with email and a one-time 6-digit code.</p>

        {!session ? (
          <>
            <form className="order-form" onSubmit={requestLoginCode}>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="Email"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
              />
              <button type="submit">Send code to email</button>
            </form>

            {isCodeRequested ? (
              <form className="order-form" onSubmit={verifyCode}>
                <input
                  name="code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  title="6 digit code"
                  required
                  placeholder="6-digit code"
                  value={codeInput}
                  onChange={(event) => setCodeInput(event.target.value)}
                />
                <button type="submit">Verify and sign in</button>
              </form>
            ) : null}
          </>
        ) : (
          <div>
            <p className="status">Signed in as: {session.email}</p>
            <button type="button" className="checkout-link-button" onClick={logout}>Sign out</button>
          </div>
        )}

        {status ? <p className="status">{status}</p> : null}
      </section>

      {session ? (
        <section className="card admin-table-card" aria-label="Customer order history">
          <h2 className="product-step-main-title">Purchase history</h2>
          {isLoadingOrders ? <p>Loading orders...</p> : null}
          {!isLoadingOrders ? (
            <div className="table-scroll" role="region" aria-label="Customer order history table">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No orders found for this email yet.</td>
                    </tr>
                  ) : orders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.id}</td>
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
      ) : null}

      <SiteFooter />
    </main>
  );
};


const ClosedForShabbatPage = ({ shabbatStatus, loading }) => (
  <main className="page closed-page">
    <section className="card closed-card">
      <p className="home-eyebrow">Shabbat mode</p>
      <h1 className="product-step-main-title">The store is currently closed for Shabbat</h1>
      {loading ? <p className="status">Checking the current halachic time for Brooklyn, New York...</p> : null}
      <p>
        Orders and customer access are paused from sunset on Friday until Havdalah on Saturday,
        based on Brooklyn, New York zmanim.
      </p>
      <p className="closed-reopen-time">
        {shabbatStatus?.reopensAt
          ? `The site will reopen on ${formatBrooklynDateTime(shabbatStatus.reopensAt)} (Brooklyn time).`
          : "The reopening time will appear here as soon as it is available."}
      </p>
      <p className="home-subtitle">
        Thank you for your patience. Please come back after Shabbat.
      </p>
    </section>
    <SiteFooter />
  </main>
);

const PrivacyShippingPolicyPage = () => (
  <main className="page product-page">
    <GlobalHeader cartItemCount={getCartItemCount(readCartItems())} />

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
        <li>Returns are at your own cost.</li>
      </ul>
    </section>
    <SiteFooter />
  </main>
);

const StoreLocationsPage = () => {
  const { stores, loading, error } = useStoreLocations();

  return (
    <main className="page stores-page">
      <GlobalHeader cartItemCount={getCartItemCount(readCartItems())} />

      <section className="card stores-card">
        <p className="home-eyebrow">WHERE TO BUY</p>
        <h2 className="product-step-main-title">Stores that sell our product</h2>
        <p className="home-subtitle">Choose the closest store from the list below.</p>

        {loading ? <p className="status">Loading stores...</p> : null}
        {error ? <p className="warning">{error}</p> : null}

        <div className="stores-grid">
          {stores.map((store) => (
            <article key={`${store.id}-${store.store_name}`} className="store-location-card">
              <h3>{store.store_name}</h3>
              <p>{store.store_address}</p>
            </article>
          ))}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
};

function App() {
  useEffect(() => {
    applyPageSeo(window.location.pathname);
  }, []);

  useEffect(() => {
    let faviconLink = document.querySelector("link[rel='icon']");

    if (!faviconLink) {
      faviconLink = document.createElement("link");
      faviconLink.rel = "icon";
      document.head.appendChild(faviconLink);
    }

    faviconLink.href = SITE_FAVICON_URL;
  }, []);

  const { shabbatStatus, loading: siteStatusLoading } = useSiteAvailability();
  const isCartPage = window.location.pathname === "/cart";
  const isAdminPage = window.location.pathname === "/admin";
  const isAdminCustomersPage = window.location.pathname === "/admin/customers";
  const isAdminOrdersPage = window.location.pathname === "/admin/orders";
  const isAdminLocationsPage = window.location.pathname === "/admin/locations";
  const isShippingDetailsPage = window.location.pathname === "/shipping-details";
  const isPolicyPage = window.location.pathname === "/privacy-shipping-policy";
  const isStoresPage = window.location.pathname === "/stores";
  const isAccountPage = window.location.pathname === "/account";
  const isMensPage = window.location.pathname === "/men-shoe";
  const isAdminRoute = isAdminPage || isAdminCustomersPage || isAdminOrdersPage || isAdminLocationsPage;

  if (!isAdminRoute && shabbatStatus?.isClosed) {
    return <ClosedForShabbatPage shabbatStatus={shabbatStatus} loading={siteStatusLoading} />;
  }
  if (isAdminCustomersPage) {
    return <AdminAuthGate><AdminCustomersPage /></AdminAuthGate>;
  }

  if (isAdminOrdersPage) {
    return <AdminAuthGate><AdminOrdersPage /></AdminAuthGate>;
  }

  if (isAdminPage) {
    return <AdminAuthGate><AdminPage /></AdminAuthGate>;
  }

  if (isAdminLocationsPage) {
    return <AdminAuthGate><AdminStoreLocationsPage /></AdminAuthGate>;
  }

  if (isShippingDetailsPage) {
    return <ShippingDetailsPage />;
  }

  if (isPolicyPage) {
    return <PrivacyShippingPolicyPage />;
  }

  if (isStoresPage) {
    return <StoreLocationsPage />;
  }

  if (isAccountPage) {
    return <AccountPage />;
  }

  if (isMensPage) {
    return <MenShoePage />;
  }

  if (isCartPage) {
    return <CartPage />;
  }

  return (
    <>
      <MenLaunchButton />
      <StorePage />
    </>
  );
}

export default App;
