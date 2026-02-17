import { useEffect, useState } from "react";

const formatPrice = (value, currency = "ILS") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value / 100);

const resolvePrice = (variant, basePrice) => variant.price_override ?? basePrice;

const getPage = () =>
  window.location.pathname === "/color-images" ? "color-images" : "store";

function ColorImagesPage() {
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingVariantId, setSavingVariantId] = useState(null);
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

        const [variantsResponse, imagesResponse] = await Promise.all([
          fetch("/api/variants"),
          fetch("/api/product-images"),
        ]);

        if (!variantsResponse.ok) {
          throw new Error("Failed to load variants");
        }

        if (!imagesResponse.ok) {
          throw new Error("Failed to load product images");
        }

        const variantsJson = await variantsResponse.json();
        const imagesJson = await imagesResponse.json();

        const mapped = (variantsJson.variants || []).map((variant) => ({
          ...variant,
          draftImages: Array.isArray(variant.images) ? variant.images.join("\n") : "",
        }));

        setVariants(mapped);
        setProductImages(imagesJson.images || []);
      } catch (loadError) {
        console.error(loadError);
        setError("לא הצלחנו לטעון את רשימת הצבעים כרגע.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

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
          <h1>העלאת תמונות לכל צבע</h1>
          <p className="subtitle">ניתן לבחור תמונות מהמאגר וגם להדביק קישורים ידנית.</p>
        </div>
        <a className="secondary-link" href="/">
          חזרה לחנות
        </a>
      </header>

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
                  <div className="mini-preview-wrap">
                    {previewImage ? (
                      <img
                        src={previewImage}
                        className="mini-preview"
                        alt={`תצוגה מקדימה עבור ${variant.color_name}`}
                      />
                    ) : (
                      <p className="muted">אין תמונה לתצוגה מקדימה</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function StorePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariantId, setSelectedVariantId] = useState(null);

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
  const selectedImage = selectedVariant?.images?.[0] ?? null;
  const benefitCards = [
    { icon: "☁️", title: "All-day comfort", text: "Soft support that helps reduce pressure and fatigue." },
    { icon: "🛡️", title: "Non-slip stability", text: "Confident traction for city streets and smooth floors." },
    { icon: "🪶", title: "Lightweight & flexible", text: "Ultra-light feel with foldable flexibility for travel." },
    { icon: "✨", title: "Any occasion ready", text: "Perfect for workdays, events, and quick weekend trips." },
  ];

  const specificationRows = [
    ["Sole material", "Non-slip PVC"],
    ["Outer material", "PVC"],
    ["Closure type", "Pull-On (No laces)"],
    ["Water resistance", "Water-resistant finish"],
    ["Heel type", "Flat heel"],
    ["Toe style", "Round toe"],
  ];

  return (
    <div className="page">
      <header className="panel store-hero">
        <div className="product-image-wrap">
          {selectedImage ? (
            <img
              className="product-image"
              src={selectedImage}
              alt={`${product.title} in ${selectedVariant?.color_name ?? "featured"}`}
            />
          ) : (
            <div className="image-placeholder">Product image coming soon</div>
          )}
        </div>

        <div className="hero-content">
          <p className="eyebrow">Women&apos;s Foldable Loafers</p>
          <h1>Where Comfort Meets Elegance</h1>
          <p className="subtitle">
            Lightweight, foldable loafers designed for all-day confidence and comfort.
          </p>
          <p className="price">{formatPrice(price, currency)}</p>

          <div className="actions-row">
            <button className="cta" type="button">Add to Cart</button>
            <button className="secondary-link" type="button">Buy Now</button>
          </div>

          <p className="muted">Ultra-comfortable • Non-slip • Ventilated • Water-resistant</p>
        </div>
      </header>

      <section className="panel">
        <h2>Choose your color</h2>
        <div className="variant-grid">
          {variants.map((variant) => {
            const isOut = variant.stock_qty === 0;
            const isSelected = variant.id === selectedVariantId;
            return (
              <button
                key={variant.id}
                className={`variant ${isSelected ? "active" : ""}`}
                type="button"
                onClick={() => setSelectedVariantId(variant.id)}
                disabled={isOut}
              >
                <span className="color" style={{ backgroundColor: variant.color_hex }} />
                <span>{variant.color_name}</span>
                <span className="stock">{isOut ? "Out of stock" : "In stock"}</span>
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

      <section className="panel">
        <h2>Specifications</h2>
        <div className="specification-table-wrap">
          <table className="specification-table">
            <tbody>
              {specificationRows.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel marketing-panel">
        <h2>Designed to keep you moving beautifully.</h2>
        <p>
          Discover the shoe that transforms your day. Designed with a soft, non-slip sole and
          ultra-light construction, these loafers deliver maximum comfort without compromising
          style.
        </p>
        <p>
          Perfect for work, events, and travel — flexible enough to fold and easy enough to wear
          all day.
        </p>
        <div className="actions-row">
          <button className="cta" type="button">Get Yours Today</button>
          <a className="secondary-link" href="/color-images">
            Manage product images
          </a>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(getPage());

  useEffect(() => {
    const onPopState = () => setPage(getPage());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (page === "color-images") {
    return <ColorImagesPage />;
  }

  return <StorePage />;
}
