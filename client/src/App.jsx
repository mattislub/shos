import { useEffect, useMemo, useState } from "react";

const formatPrice = (value, currency = "ILS") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value / 100);

const resolvePrice = (variant, basePrice) => variant.price_override ?? basePrice;

export default function App() {
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
          <button className="cta" type="button" disabled={selectedVariant?.stock_qty === 0}>
            Continue to purchase
          </button>
        </div>
      </section>
    </div>
  );
}
