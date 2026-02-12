import { useEffect, useMemo, useState } from "react";

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

  useEffect(() => {
    const load = async () => {
      try {
        setError("");
        const response = await fetch("/api/variants");
        if (!response.ok) {
          throw new Error("Failed to load variants");
        }
        const json = await response.json();
        const mapped = (json.variants || []).map((variant) => ({
          ...variant,
          draftImages: Array.isArray(variant.images)
            ? variant.images.join("\n")
            : "",
        }));
        setVariants(mapped);
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

  const saveImages = async (variant) => {
    const images = variant.draftImages
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    try {
      setSavingVariantId(variant.id);
      setSavedMessage("");
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

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">ניהול צבעים</p>
          <h1>העלאת תמונות לכל צבע</h1>
          <p className="subtitle">הדביקו קישורים לתמונות (אחד בכל שורה) ושמרו לכל צבע.</p>
        </div>
        <a className="secondary-link" href="/">
          חזרה לחנות
        </a>
      </header>

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

  const selectedVariant = useMemo(() => {
    if (!data) return null;
    return data.variants.find((variant) => variant.id === selectedVariantId);
  }, [data, selectedVariantId]);

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
  const shippingFee = settings?.shipping_flat_fee ?? 0;
  const currency = settings?.currency ?? "ILS";
  const price = selectedVariant ? resolvePrice(selectedVariant, product.base_price) : 0;
  const total = price + shippingFee;
  const selectedImage = selectedVariant?.images?.[0] ?? null;

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">New model</p>
          <h1>{product.title}</h1>
          <p className="subtitle">{product.description}</p>
        </div>
        <div className="price-card">
          <p className="label">Current price</p>
          <p className="price">{formatPrice(price, currency)}</p>
          <p className="muted">Shipping fee: {formatPrice(shippingFee, currency)}</p>
        </div>
      </header>

      <section className="panel">
        <div className="product-image-wrap">
          {selectedImage ? (
            <img
              className="product-image"
              src={selectedImage}
              alt={`${product.title} in ${selectedVariant.color_name}`}
            />
          ) : (
            <div className="image-placeholder">לא נוספה תמונה לצבע הזה עדיין</div>
          )}
        </div>

        <h2>Select a color</h2>
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
                <span className="stock">
                  {isOut ? "Out of stock" : `Stock: ${variant.stock_qty}`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="summary">
          <div>
            <p className="label">Total due</p>
            <p className="total">{formatPrice(total, currency)}</p>
          </div>
          <div className="actions-row">
            <a className="secondary-link" href="/color-images">
              ניהול תמונות צבעים
            </a>
            <button className="cta" type="button" disabled={selectedVariant?.stock_qty === 0}>
              Continue to purchase
            </button>
          </div>
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
