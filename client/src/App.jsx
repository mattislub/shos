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
  const sizeOptions = ["XS", "S", "M", "L", "XL"];
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [step, setStep] = useState("color");
  const [sizeQuantities, setSizeQuantities] = useState(() =>
    sizeOptions.reduce((acc, size) => ({ ...acc, [size]: 0 }), {})
  );
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [productDraft, setProductDraft] = useState({
    title: "",
    description: "",
    base_price: "",
  });
  const [productSaveState, setProductSaveState] = useState({
    loading: false,
    message: "",
    error: "",
  });

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/product");
        const json = await response.json();
        setData(json);
        setProductDraft({
          title: json?.product?.title ?? "",
          description: json?.product?.description ?? "",
          base_price: String(json?.product?.base_price ?? ""),
        });
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

  const selectedSizes = useMemo(
    () => Object.entries(sizeQuantities).filter(([, quantity]) => quantity > 0),
    [sizeQuantities]
  );

  const selectedItemsCount = useMemo(
    () => selectedSizes.reduce((sum, [, quantity]) => sum + quantity, 0),
    [selectedSizes]
  );

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
  const subtotal = price * Math.max(selectedItemsCount, 1);
  const total = subtotal + shippingFee;
  const selectedImage = selectedVariant?.images?.[0] ?? null;

  const updateSizeQuantity = (size, quantity) => {
    setSizeQuantities((prev) => ({
      ...prev,
      [size]: Math.max(0, quantity),
    }));
  };

  const startEditingProduct = () => {
    setProductSaveState({ loading: false, message: "", error: "" });
    setProductDraft({
      title: product.title,
      description: product.description,
      base_price: String(product.base_price),
    });
    setIsEditingProduct(true);
  };

  const cancelEditingProduct = () => {
    setIsEditingProduct(false);
    setProductSaveState({ loading: false, message: "", error: "" });
    setProductDraft({
      title: product.title,
      description: product.description,
      base_price: String(product.base_price),
    });
  };

  const saveProduct = async () => {
    const basePrice = Number(productDraft.base_price);

    if (!productDraft.title.trim() || !productDraft.description.trim()) {
      setProductSaveState({
        loading: false,
        message: "",
        error: "כותרת ותיאור הם שדות חובה.",
      });
      return;
    }

    if (!Number.isInteger(basePrice) || basePrice < 0) {
      setProductSaveState({
        loading: false,
        message: "",
        error: "מחיר בסיס חייב להיות מספר שלם לא שלילי (באגורות).",
      });
      return;
    }

    try {
      setProductSaveState({ loading: true, message: "", error: "" });
      const response = await fetch(`/api/product/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: productDraft.title,
          description: productDraft.description,
          base_price: basePrice,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update product");
      }

      const json = await response.json();
      setData((prev) =>
        prev
          ? {
              ...prev,
              product: json.product,
            }
          : prev
      );
      setProductDraft({
        title: json.product.title,
        description: json.product.description,
        base_price: String(json.product.base_price),
      });
      setIsEditingProduct(false);
      setProductSaveState({ loading: false, message: "המוצר נשמר בהצלחה.", error: "" });
    } catch (error) {
      console.error(error);
      setProductSaveState({
        loading: false,
        message: "",
        error: "שמירת פרטי המוצר נכשלה. נסו שוב.",
      });
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">New model</p>
          {isEditingProduct ? (
            <div className="product-edit-form">
              <input
                type="text"
                value={productDraft.title}
                onChange={(event) =>
                  setProductDraft((prev) => ({ ...prev, title: event.target.value }))
                }
                placeholder="שם מוצר"
              />
              <textarea
                rows={3}
                value={productDraft.description}
                onChange={(event) =>
                  setProductDraft((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="תיאור מוצר"
              />
              <input
                type="number"
                min={0}
                step={100}
                value={productDraft.base_price}
                onChange={(event) =>
                  setProductDraft((prev) => ({ ...prev, base_price: event.target.value }))
                }
                placeholder="מחיר בסיס באגורות"
              />
              <div className="product-edit-actions">
                <button
                  className="cta"
                  type="button"
                  onClick={saveProduct}
                  disabled={productSaveState.loading}
                >
                  {productSaveState.loading ? "שומר..." : "שמור מוצר"}
                </button>
                <button className="secondary-link" type="button" onClick={cancelEditingProduct}>
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1>{product.title}</h1>
              <p className="subtitle">{product.description}</p>
            </>
          )}
          {productSaveState.error ? <p className="error-text">{productSaveState.error}</p> : null}
          {productSaveState.message ? <p className="saved-text">{productSaveState.message}</p> : null}
        </div>
        <div className="price-card">
          <p className="label">Current price</p>
          <p className="price">{formatPrice(price, currency)}</p>
          <p className="muted">Shipping fee: {formatPrice(shippingFee, currency)}</p>
          {!isEditingProduct ? (
            <button className="secondary-link product-edit-toggle" type="button" onClick={startEditingProduct}>
              עריכת מוצר
            </button>
          ) : null}
        </div>
      </header>

      {step === "color" ? (
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

          <div className="step-actions">
            <button
              className="cta"
              type="button"
              onClick={() => setStep("size")}
              disabled={!selectedVariant || selectedVariant.stock_qty === 0}
            >
              המשך לבחירת מידה
            </button>
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="sizes-header">
            <div>
              <p className="label">צבע שנבחר</p>
              <h2>{selectedVariant?.color_name}</h2>
            </div>
            <button className="secondary-link" type="button" onClick={() => setStep("color")}>
              חזרה לבחירת צבע
            </button>
          </div>

          <p className="muted">אפשר לבחור כמה מידות שונות או להגדיל כמות במידה אחת.</p>

          <div className="sizes-grid">
            {sizeOptions.map((size) => {
              const quantity = sizeQuantities[size] ?? 0;
              return (
                <article key={size} className={`size-card ${quantity > 0 ? "active" : ""}`}>
                  <p className="size-title">מידה {size}</p>
                  <div className="size-controls">
                    <button type="button" onClick={() => updateSizeQuantity(size, quantity - 1)}>
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={quantity}
                      onChange={(event) =>
                        updateSizeQuantity(size, Number(event.target.value) || 0)
                      }
                    />
                    <button type="button" onClick={() => updateSizeQuantity(size, quantity + 1)}>
                      +
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="selected-sizes">
            <p className="label">מידות שנבחרו</p>
            {selectedSizes.length ? (
              <ul>
                {selectedSizes.map(([size, quantity]) => (
                  <li key={size}>
                    {size} × {quantity}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">לא נבחרו מידות עדיין.</p>
            )}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="summary">
          <div>
            <p className="label">Total due</p>
            <p className="total">{formatPrice(total, currency)}</p>
            <p className="muted">כמות פריטים: {Math.max(selectedItemsCount, 1)}</p>
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
