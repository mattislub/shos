import { useEffect, useMemo, useState } from "react";

const fallbackProduct = {
  title: "סניקרס Horizon X",
  description:
    "נעל יומיומית קלה ונוחה במיוחד עם סוליה בולמת זעזועים, מתאימה לעבודה, הליכה ויציאות.",
  price_ils: 29900,
  image_url:
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
  images: [
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80"
  ],
  cta_text: "אני רוצה להזמין"
};

const apiUrl = "http://localhost:3001/api";
const serverBaseUrl = "http://localhost:3001";

const formatIls = (amount) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0
  }).format(amount / 100);

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
  const rawImages = Array.isArray(base.images) && base.images.length > 0
    ? base.images
    : base.image_url
      ? [base.image_url]
      : [];

  const images = rawImages.map(toAbsoluteImageUrl).filter(Boolean);

  return {
    ...base,
    image_url: toAbsoluteImageUrl(base.image_url || images[0] || ""),
    images
  };
};

const useProduct = () => {
  const [product, setProduct] = useState(null);
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
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Product update from server failed:", err);
          setError("לא הצלחנו לטעון את הנתונים מהשרת. מוצגת תצוגת ברירת מחדל.");
          setProduct(normalizeProduct(fallbackProduct));
        }
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
    return () => controller.abort();
  }, []);

  return { product, setProduct, loading, error };
};

const StorePage = () => {
  const { product, loading, error } = useProduct();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState("");
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const currentProduct = normalizeProduct(product || fallbackProduct);
  const displayImage = currentProduct.images[selectedImageIndex] || currentProduct.image_url;

  const totalLabel = useMemo(
    () => formatIls(currentProduct.price_ils * quantity),
    [currentProduct.price_ils, quantity]
  );

  const submitOrder = async (event) => {
    event.preventDefault();
    setStatus("");

    if (!name.trim() || !phone.trim()) {
      setStatus("נא למלא שם וטלפון.");
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_name: name.trim(), phone: phone.trim(), quantity })
      });

      if (!response.ok) {
        throw new Error("Order failed");
      }

      setStatus("ההזמנה התקבלה בהצלחה! נחזור אליך בהקדם.");
      setName("");
      setPhone("");
      setQuantity(1);
    } catch (_err) {
      setStatus("לא הצלחנו לשלוח הזמנה כרגע. אפשר לנסות שוב בעוד רגע.");
    }
  };

  return (
    <main className="page" dir="rtl">
      <section className="card">
        {loading ? <p>טוען מוצר...</p> : null}
        {error ? <p className="warning">{error}</p> : null}

        <img src={displayImage} alt={currentProduct.title} className="product-image" />

        {currentProduct.images.length > 1 ? (
          <div className="thumb-grid">
            {currentProduct.images.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                className={`thumb ${selectedImageIndex === index ? "thumb-active" : ""}`}
                onClick={() => setSelectedImageIndex(index)}
              >
                <img src={image} alt={`תמונה ${index + 1}`} />
              </button>
            ))}
          </div>
        ) : null}

        <h1>{currentProduct.title}</h1>
        <p>{currentProduct.description}</p>
        <p className="price">{formatIls(currentProduct.price_ils)}</p>

        <form onSubmit={submitOrder} className="order-form">
          <input placeholder="שם מלא" value={name} onChange={(event) => setName(event.target.value)} />
          <input placeholder="טלפון" value={phone} onChange={(event) => setPhone(event.target.value)} />
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
          />
          <button type="submit">{currentProduct.cta_text}</button>
        </form>

        <p className="total">סה״כ לתשלום: {totalLabel}</p>
        {status ? <p className="status">{status}</p> : null}
      </section>
    </main>
  );
};

const AdminPage = () => {
  const { product, setProduct, loading, error } = useProduct();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceIls, setPriceIls] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const current = normalizeProduct(product || fallbackProduct);
    setTitle(current.title);
    setDescription(current.description);
    setPriceIls(String((current.price_ils || 0) / 100));
    setCtaText(current.cta_text);
  }, [product]);

  const onFilesSelected = (event) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    setStatus("");

    const parsedPrice = Number(priceIls);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setStatus("מחיר לא תקין.");
      return;
    }

    try {
      const imagesPayload = await Promise.all(
        selectedFiles.map(
          (file) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve({ name: file.name, data: reader.result });
              reader.onerror = () => reject(new Error("failed reading file"));
              reader.readAsDataURL(file);
            })
        )
      );

      const response = await fetch(`${apiUrl}/admin/product`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          price_ils: Math.round(parsedPrice * 100),
          cta_text: ctaText.trim(),
          images: imagesPayload
        })
      });

      if (!response.ok) {
        throw new Error("save failed");
      }

      const payload = await response.json();
      setProduct(normalizeProduct(payload.product));
      setSelectedFiles([]);
      setStatus("המוצר נשמר בהצלחה.");
    } catch (_err) {
      setStatus("שמירת המוצר נכשלה.");
    }
  };

  const previewProduct = normalizeProduct(product || fallbackProduct);

  return (
    <main className="page" dir="rtl">
      <section className="card">
        <h1>ניהול מוצר</h1>
        {loading ? <p>טוען מוצר...</p> : null}
        {error ? <p className="warning">{error}</p> : null}

        <form onSubmit={saveProduct} className="order-form">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="כותרת" />
          <textarea
            className="admin-textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="תיאור"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={priceIls}
            onChange={(event) => setPriceIls(event.target.value)}
            placeholder="מחיר בש״ח"
          />
          <input value={ctaText} onChange={(event) => setCtaText(event.target.value)} placeholder="טקסט כפתור" />
          <label className="file-label">
            העלאת תמונות מוצר (אפשר לבחור כמה קבצים)
            <input type="file" accept="image/*" multiple onChange={onFilesSelected} />
          </label>
          {selectedFiles.length > 0 ? (
            <p className="status">נבחרו {selectedFiles.length} קבצים להעלאה.</p>
          ) : null}

          <button type="submit">שמור מוצר</button>
        </form>

        <h2>תמונות פעילות</h2>
        <div className="thumb-grid">
          {previewProduct.images.map((image, index) => (
            <div key={`${image}-${index}`} className="thumb thumb-static">
              <img src={image} alt={`תמונת מוצר ${index + 1}`} />
            </div>
          ))}
        </div>

        {status ? <p className="status">{status}</p> : null}
      </section>
    </main>
  );
};

function App() {
  const isAdminPage = window.location.pathname === "/admin";
  return isAdminPage ? <AdminPage /> : <StorePage />;
}

export default App;
