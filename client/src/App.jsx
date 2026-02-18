import { useEffect, useMemo, useState } from "react";
import titleBannerImage from "./assets/products/Image (2).png";

const formatPrice = (value, currency = "ILS") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value / 100);

const resolvePrice = (variant, basePrice) => variant.price_override ?? basePrice;

const getPage = () => {
  if (window.location.pathname === "/admin") return "admin";
  if (window.location.pathname === "/cart") return "cart";
  return "product";
};

const navigateTo = (path) => {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

const sizeOptions = ["36", "37", "38", "39", "40", "41"];

function SiteHeader() {
  return (
    <header className="site-title-banner">
      <img
        className="site-title-banner-image"
        src={titleBannerImage}
        alt="כותרת האתר"
      />
      <nav className="menu-bar-placeholder" aria-label="Main menu placeholder">
        מיקום לבר תפריט
      </nav>
    </header>
  );
}

function AdminPage() {
  const [product, setProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingVariantId, setSavingVariantId] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [productImages, setProductImages] = useState([]);
  const [newVariant, setNewVariant] = useState({
    color_name: "",
    color_hex: "#000000",
    sku: "",
    stock_qty: 0,
    price_override: "",
  });

  useEffect(() => {
    const load = async () => {
      try {
        setError("");

        const [productResponse, variantsResponse, imagesResponse] = await Promise.all([
          fetch("/api/product"),
          fetch("/api/variants"),
          fetch("/api/product-images"),
        ]);

        if (!productResponse.ok) {
          throw new Error("Failed to load product");
        }

        if (!variantsResponse.ok) {
          throw new Error("Failed to load variants");
        }

        if (!imagesResponse.ok) {
          throw new Error("Failed to load product images");
        }

        const productJson = await productResponse.json();
        const variantsJson = await variantsResponse.json();
        const imagesJson = await imagesResponse.json();

        setProduct({
          id: productJson.product.id,
          title: productJson.product.title,
          description: productJson.product.description,
          base_price: productJson.product.base_price,
        });

        const mapped = (variantsJson.variants || []).map((variant) => ({
          ...variant,
          draftImages: Array.isArray(variant.images) ? variant.images.join("\n") : "",
        }));

        setVariants(mapped);
        setProductImages(imagesJson.images || []);
      } catch (loadError) {
        console.error(loadError);
        setError("לא הצלחנו לטעון את דף הניהול כרגע.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleProductChange = (field, value) => {
    setSavedMessage("");
    setProduct((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const saveProduct = async () => {
    if (!product) {
      return;
    }

    try {
      setSavingProduct(true);
      setError("");
      setSavedMessage("");

      const response = await fetch(`/api/product/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: product.title,
          description: product.description,
          base_price: Number(product.base_price),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Failed to save product");
      }

      const data = await response.json();
      setProduct(data.product);
      setSavedMessage("פרטי המוצר נשמרו בהצלחה.");
    } catch (saveError) {
      console.error(saveError);
      setError(`שמירת פרטי המוצר נכשלה: ${saveError.message}`);
    } finally {
      setSavingProduct(false);
    }
  };

  const handleDraftChange = (variantId, value) => {
    setSavedMessage("");
    setVariants((prev) =>
      prev.map((variant) =>
        variant.id === variantId ? { ...variant, draftImages: value } : variant
      )
    );
  };

  const addImageToVariant = (variantId, imageUrl) => {
    if (!imageUrl) return;

    setSavedMessage("");
    setVariants((prev) =>
      prev.map((variant) => {
        if (variant.id !== variantId) {
          return variant;
        }

        const current = variant.draftImages
          .split("\n")
          .map((entry) => entry.trim())
          .filter(Boolean);

        if (current.includes(imageUrl)) {
          return variant;
        }

        return {
          ...variant,
          draftImages: [...current, imageUrl].join("\n"),
        };
      })
    );
  };

  const saveImages = async (variant) => {
    const images = variant.draftImages
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    try {
      setSavingVariantId(variant.id);
      setSavedMessage("");
      setError("");

      const response = await fetch(`/api/variants/${variant.id}/images`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });

      if (!response.ok) {
        throw new Error("Failed to save image list");
      }

      setVariants((prev) =>
        prev.map((current) =>
          current.id === variant.id
            ? {
                ...current,
                images,
                draftImages: images.join("\n"),
              }
            : current
        )
      );
      setSavedMessage(`נשמר בהצלחה עבור ${variant.color_name}.`);
    } catch (saveError) {
      console.error(saveError);
      setError("שמירת התמונות נכשלה. נסו שוב.");
    } finally {
      setSavingVariantId(null);
    }
  };

  const handleNewVariantChange = (field, value) => {
    setNewVariant((prev) => ({ ...prev, [field]: value }));
  };

  const createVariant = async () => {
    try {
      setSavedMessage("");
      setError("");

      const payload = {
        color_name: newVariant.color_name,
        color_hex: newVariant.color_hex,
        sku: newVariant.sku,
        stock_qty: Number(newVariant.stock_qty),
        price_override:
          newVariant.price_override === "" ? null : Number(newVariant.price_override),
        images: [],
      };

      const response = await fetch("/api/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Failed to create variant");
      }

      const data = await response.json();
      const variant = data.variant;

      setVariants((prev) => [
        ...prev,
        {
          ...variant,
          draftImages: Array.isArray(variant.images) ? variant.images.join("\n") : "",
        },
      ]);

      setNewVariant({
        color_name: "",
        color_hex: "#000000",
        sku: "",
        stock_qty: 0,
        price_override: "",
      });

      setSavedMessage("צבע חדש נוסף בהצלחה.");
    } catch (createError) {
      console.error(createError);
      setError(`הוספת צבע נכשלה: ${createError.message}`);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">ניהול צבעים</p>
          <h1>ניהול מוצר, צבעים ותמונות</h1>
          <p className="subtitle">עריכת פרטי המוצר, הוספת צבעים ועדכון גלריית תמונות לכל צבע.</p>
        </div>
        <a className="secondary-link" href="/">
          חזרה לחנות
        </a>
      </header>

      <section className="panel add-variant-panel">
        <h2>פרטי המוצר</h2>
        <div className="new-variant-form">
          <input
            type="text"
            placeholder="שם המוצר"
            value={product?.title ?? ""}
            onChange={(event) => handleProductChange("title", event.target.value)}
          />
          <input
            type="number"
            min={0}
            step={100}
            placeholder="מחיר באגורות"
            value={product?.base_price ?? ""}
            onChange={(event) => handleProductChange("base_price", event.target.value)}
          />
        </div>
        <textarea
          rows={4}
          className="product-description-input"
          placeholder="תיאור מוצר"
          value={product?.description ?? ""}
          onChange={(event) => handleProductChange("description", event.target.value)}
        />
        <button className="cta" type="button" onClick={saveProduct} disabled={savingProduct}>
          {savingProduct ? "שומר..." : "שמור פרטי מוצר"}
        </button>
      </section>

      <section className="panel add-variant-panel">
        <h2>הוספת צבע חדש</h2>
        <div className="new-variant-form">
          <input
            type="text"
            placeholder="שם צבע"
            value={newVariant.color_name}
            onChange={(event) => handleNewVariantChange("color_name", event.target.value)}
          />
          <input
            type="color"
            value={newVariant.color_hex}
            onChange={(event) => handleNewVariantChange("color_hex", event.target.value)}
            aria-label="בחירת צבע"
          />
          <input
            type="text"
            placeholder="SKU"
            value={newVariant.sku}
            onChange={(event) => handleNewVariantChange("sku", event.target.value)}
          />
          <input
            type="number"
            min={0}
            placeholder="מלאי"
            value={newVariant.stock_qty}
            onChange={(event) => handleNewVariantChange("stock_qty", event.target.value)}
          />
          <input
            type="number"
            min={0}
            step={100}
            placeholder="מחיר מיוחד באגורות (אופציונלי)"
            value={newVariant.price_override}
            onChange={(event) => handleNewVariantChange("price_override", event.target.value)}
          />
          <button className="cta" type="button" onClick={createVariant}>
            הוסף צבע
          </button>
        </div>
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {savedMessage ? <p className="saved-text">{savedMessage}</p> : null}

      {loading ? (
        <div className="panel">
          <p>טוען צבעים...</p>
        </div>
      ) : (
        <section className="panel">
          <div className="image-manager-grid">
            {variants.map((variant) => {
              const previewImage = variant.draftImages
                .split("\n")
                .map((entry) => entry.trim())
                .find(Boolean);

              return (
                <article key={variant.id} className="image-card">
                  <h3>{variant.color_name}</h3>
                  <p className="muted">{variant.sku}</p>
                  <div className="default-image-row">
                    <span className="field-label">תמונת ברירת מחדל</span>
                    <div className="mini-preview-wrap">
                      {previewImage ? (
                        <img
                          src={previewImage}
                          className="mini-preview"
                          alt={`תמונת ברירת מחדל עבור ${variant.color_name}`}
                        />
                      ) : (
                        <p className="muted">אין תמונת ברירת מחדל</p>
                      )}
                    </div>
                  </div>

                  <label className="field-label">בחר תמונה מהנתיב הקיים</label>
                  <select
                    className="image-select"
                    defaultValue=""
                    onChange={(event) => {
                      addImageToVariant(variant.id, event.target.value);
                      event.target.value = "";
                    }}
                  >
                    <option value="">בחר תמונה...</option>
                    {productImages.map((image) => (
                      <option key={`${variant.id}-${image.url}`} value={image.url}>
                        {image.name}
                      </option>
                    ))}
                  </select>

                  <textarea
                    rows={4}
                    value={variant.draftImages}
                    onChange={(event) =>
                      handleDraftChange(variant.id, event.target.value)
                    }
                    placeholder="https://example.com/color-image.jpg"
                  />
                  <button
                    className="cta"
                    type="button"
                    onClick={() => saveImages(variant)}
                    disabled={savingVariantId === variant.id}
                  >
                    {savingVariantId === variant.id ? "שומר..." : "שמור תמונות"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function ProductPage({ cartCount, onAddToCart }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedSize, setSelectedSize] = useState(sizeOptions[0]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/product");
        const json = await response.json();
        setData(json);
        if (json?.variants?.length) {
          setSelectedVariantId(json.variants[0].id);
        }
      } catch (error) {
        console.error("Failed to load product", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const selectedVariant = data?.variants.find((variant) => variant.id === selectedVariantId);
  const selectedImages = selectedVariant?.images?.length ? selectedVariant.images : [];
  const mainImage = selectedImage || selectedImages[0] || null;

  useEffect(() => {
    setSelectedImage(selectedImages[0] || null);
  }, [selectedVariantId, selectedImages]);

  if (loading) {
    return (
      <div className="page">
        <p>Loading product data...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page">
        <p>Unable to load the product right now.</p>
      </div>
    );
  }

  const { product, variants, settings } = data;
  const currency = settings?.currency ?? "ILS";
  const price = selectedVariant ? resolvePrice(selectedVariant, product.base_price) : 0;
  const isOut = selectedVariant?.stock_qty === 0;

  const benefitCards = [
    { icon: "☁️", title: "All-day comfort", text: "Soft support that helps reduce pressure and fatigue." },
    { icon: "🛡️", title: "Non-slip stability", text: "Confident traction for city streets and smooth floors." },
    { icon: "🪶", title: "Lightweight & flexible", text: "Ultra-light feel with foldable flexibility for travel." },
    { icon: "✨", title: "Any occasion ready", text: "Perfect for workdays, events, and quick weekend trips." },
  ];

  return (
    <div className="page">
      <header className="panel top-nav">
        <button className="secondary-link" type="button" onClick={() => navigateTo("/cart")}>עגלה ({cartCount})</button>
      </header>

      <header className="panel store-hero">
        <div className="product-image-wrap">
          {mainImage ? (
            <img
              className="product-image"
              src={mainImage}
              alt={`${product.title} in ${selectedVariant?.color_name ?? "featured"}`}
            />
          ) : (
            <div className="image-placeholder">Product image coming soon</div>
          )}
        </div>

        <div className="hero-content">
          <p className="eyebrow">דף מוצר</p>
          <h1>{product.title}</h1>
          <p className="subtitle">{product.description}</p>
          <p className="price">{formatPrice(price, currency)}</p>

          <label className="field-label" htmlFor="size-select">בחרי מידה</label>
          <select
            id="size-select"
            className="size-select"
            value={selectedSize}
            onChange={(event) => setSelectedSize(event.target.value)}
          >
            {sizeOptions.map((size) => (
              <option value={size} key={size}>{size}</option>
            ))}
          </select>

          <div className="actions-row">
            <button
              className="cta"
              type="button"
              disabled={!selectedVariant || isOut}
              onClick={() => {
                if (!selectedVariant) return;
                onAddToCart({
                  variantId: selectedVariant.id,
                  colorName: selectedVariant.color_name,
                  size: selectedSize,
                  price,
                  image: mainImage,
                  title: product.title,
                });
              }}
            >
              הוסיפי לעגלה
            </button>
            <button className="secondary-link" type="button" onClick={() => navigateTo("/cart")}>מעבר לעגלה</button>
          </div>

          <p className="muted">{isOut ? "המוצר בצבע זה אזל מהמלאי" : `צבע: ${selectedVariant?.color_name ?? ""}`}</p>
        </div>
        </header>

        <section className="panel">
        <h2>גלריית תמונות לצבע הנבחר</h2>
        {selectedImages.length ? (
          <div className="gallery-grid">
            {selectedImages.map((imageUrl, index) => (
              <button
                key={`${imageUrl}-${index}`}
                type="button"
                className={`gallery-thumb ${imageUrl === mainImage ? "active" : ""}`}
                onClick={() => setSelectedImage(imageUrl)}
              >
                <img src={imageUrl} alt={`${selectedVariant?.color_name} - תצוגה ${index + 1}`} />
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">לא הוגדרו תמונות נוספות לצבע זה.</p>
        )}
      </section>

      <section className="panel">
        <h2>בחירת צבע</h2>
        <div className="variant-grid">
          {variants.map((variant) => {
            const variantIsOut = variant.stock_qty === 0;
            const isSelected = variant.id === selectedVariantId;
            return (
              <button
                key={variant.id}
                className={`variant ${isSelected ? "active" : ""}`}
                type="button"
                onClick={() => setSelectedVariantId(variant.id)}
                disabled={variantIsOut}
              >
                <span className="color" style={{ backgroundColor: variant.color_hex }} />
                <span>{variant.color_name}</span>
                <span className="stock">{variantIsOut ? "Out of stock" : "In stock"}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Benefits</h2>
        <div className="benefits-grid">
          {benefitCards.map((benefit) => (
            <article className="benefit-card" key={benefit.title}>
              <span className="benefit-icon" aria-hidden="true">{benefit.icon}</span>
              <h3>{benefit.title}</h3>
              <p>{benefit.text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function CartPage({ cartItems, onUpdateQuantity, onRemoveItem }) {
  const total = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems]
  );

  return (
    <div className="page">
      <header className="panel cart-header">
        <h1>עגלה</h1>
        <button className="secondary-link" type="button" onClick={() => navigateTo("/")}>חזרה לדף מוצר</button>
      </header>

      <section className="panel">
        {!cartItems.length ? (
          <p className="muted">העגלה שלך ריקה כרגע.</p>
        ) : (
          <div className="cart-list">
            {cartItems.map((item) => (
              <article className="cart-item" key={`${item.variantId}-${item.size}`}>
                {item.image ? <img className="cart-image" src={item.image} alt={item.title} /> : null}
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">צבע: {item.colorName} • מידה: {item.size}</p>
                  <p className="price-small">{formatPrice(item.price)} לכל יחידה</p>
                </div>
                <div className="cart-actions">
                  <label>
                    כמות
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) =>
                        onUpdateQuantity(item.variantId, item.size, Number(event.target.value))
                      }
                    />
                  </label>
                  <button type="button" className="secondary-link" onClick={() => onRemoveItem(item.variantId, item.size)}>
                    הסרה
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel cart-summary">
        <h2>סיכום הזמנה</h2>
        <p className="price">{formatPrice(total)}</p>
        <button className="cta" type="button" disabled={!cartItems.length}>לתשלום</button>
      </section>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(getPage());
  const [cartItems, setCartItems] = useState(() => {
    try {
      const cached = localStorage.getItem("cart_items");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const onPopState = () => setPage(getPage());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    localStorage.setItem("cart_items", JSON.stringify(cartItems));
  }, [cartItems]);

  const addToCart = (newItem) => {
    setCartItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.variantId === newItem.variantId && item.size === newItem.size
      );

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
        };
        return updated;
      }

      return [...prev, { ...newItem, quantity: 1 }];
    });
  };

  const updateQuantity = (variantId, size, quantity) => {
    if (!quantity || quantity < 1) return;

    setCartItems((prev) =>
      prev.map((item) =>
        item.variantId === variantId && item.size === size ? { ...item, quantity } : item
      )
    );
  };

  const removeItem = (variantId, size) => {
    setCartItems((prev) =>
      prev.filter((item) => !(item.variantId === variantId && item.size === size))
    );
  };

  if (page === "admin") {
    return (
      <>
        <SiteHeader />
        <AdminPage />
      </>
    );
  }

  if (page === "cart") {
    return (
      <>
        <SiteHeader />
        <CartPage
          cartItems={cartItems}
          onRemoveItem={removeItem}
          onUpdateQuantity={updateQuantity}
        />
      </>
    );
  }

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      <SiteHeader />
      <ProductPage cartCount={cartCount} onAddToCart={addToCart} />
    </>
  );
}
