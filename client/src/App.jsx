import { useEffect, useMemo, useState } from "react";

const fallbackProduct = {
  title: "סניקרס Horizon X",
  description:
    "נעל יומיומית קלה ונוחה במיוחד עם סוליה בולמת זעזועים, מתאימה לעבודה, הליכה ויציאות.",
  price_ils: 29900,
  image_url:
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
  cta_text: "אני רוצה להזמין"
};

const formatIls = (amount) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0
  }).format(amount / 100);

const apiUrl = "http://localhost:3001/api";

const useProduct = () => {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const loadProduct = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${apiUrl}/product`, {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error("Failed to load product");
        }

        const payload = await response.json();
        setProduct(payload.product || fallbackProduct);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError("לא הצלחנו לטעון את הנתונים מהשרת. מוצגת תצוגת ברירת מחדל.");
          setProduct(fallbackProduct);
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

  const totalLabel = useMemo(() => {
    const data = product || fallbackProduct;
    return formatIls(data.price_ils * quantity);
  }, [product, quantity]);

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
        body: JSON.stringify({
          customer_name: name.trim(),
          phone: phone.trim(),
          quantity
        })
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

  const currentProduct = product || fallbackProduct;

  return (
    <main className="page" dir="rtl">
      <section className="card">
        {loading ? <p>טוען מוצר...</p> : null}
        {error ? <p className="warning">{error}</p> : null}

        <img src={currentProduct.image_url} alt={currentProduct.title} className="product-image" />

        <h1>{currentProduct.title}</h1>
        <p>{currentProduct.description}</p>

        <p className="price">{formatIls(currentProduct.price_ils)}</p>

        <form onSubmit={submitOrder} className="order-form">
          <input
            placeholder="שם מלא"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            placeholder="טלפון"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
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
  const [imageUrl, setImageUrl] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const current = product || fallbackProduct;
    setTitle(current.title);
    setDescription(current.description);
    setPriceIls(String((current.price_ils || 0) / 100));
    setCtaText(current.cta_text);
    setImageUrl(current.image_url);
  }, [product]);

  const onFileSelected = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
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
      const response = await fetch(`${apiUrl}/admin/product`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          price_ils: Math.round(parsedPrice * 100),
          cta_text: ctaText.trim(),
          image_url: imageUrl.trim()
        })
      });

      if (!response.ok) {
        throw new Error("save failed");
      }

      const payload = await response.json();
      setProduct(payload.product);
      setStatus("המוצר נשמר בהצלחה.");
    } catch (_err) {
      setStatus("שמירת המוצר נכשלה.");
    }
  };

  const previewProduct = product || fallbackProduct;

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
          <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="קישור תמונה" />
          <input type="file" accept="image/*" onChange={onFileSelected} />

          <button type="submit">שמור מוצר</button>
        </form>

        <h2>תצוגה מקדימה</h2>
        <img src={imageUrl || previewProduct.image_url} alt={title || previewProduct.title} className="product-image" />
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
