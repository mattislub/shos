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

function App() {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const loadProduct = async () => {
      try {
        setLoading(true);
        const response = await fetch("http://localhost:3001/api/product", {
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
      const response = await fetch("http://localhost:3001/api/orders", {
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
    } catch (err) {
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
}

export default App;
