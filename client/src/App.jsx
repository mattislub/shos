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

const fallbackHomeHeroImage =
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1800&q=80";

const apiUrl = (import.meta.env.VITE_API_URL || "/api").trim();

const serverBaseUrl = (() => {
  try {
    return new URL(apiUrl, window.location.origin).origin;
  } catch (_error) {
    return window.location.origin;
  }
})();

const formatIls = (amount) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0
  }).format(amount / 100);

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
          setError("לא הצלחנו לטעון את הנתונים מהשרת. מוצגת תצוגת ברירת מחדל.");
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

const StorePage = () => {
  const { product, homeHeroImageUrl, loading, error } = useProduct();
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
      <header className="home-header">
        <h1 className="home-title">ברוכים הבאים לחנות</h1>
        <nav className="home-actions" aria-label="פעולות ראשיות">
          <button type="button">צור קשר</button>
          <button type="button">אודות</button>
          <button type="button">התחבר</button>
          <button type="button">עגלה</button>
          <button type="button">רשימת משאלות</button>
        </nav>
      </header>

      <section className="hero-banner">
        <img src={homeHeroImageUrl} alt="באנר ראשי" className="hero-banner-image" />
      </section>

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
  const { product, setProduct, homeHeroImageUrl, setHomeHeroImageUrl, loading, error } = useProduct();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceIls, setPriceIls] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [activeTab, setActiveTab] = useState("product");
  const [heroFile, setHeroFile] = useState(null);
  const [status, setStatus] = useState("");
  const [heroStatus, setHeroStatus] = useState("");

  useEffect(() => {
    const current = normalizeProduct(product || fallbackProduct);
    setTitle(current.title);
    setDescription(current.description);
    setPriceIls(String((current.price_ils || 0) / 100));
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
      console.info("[admin] preparing product save request", {
        selectedFilesCount: selectedFiles.length,
        selectedFileNames: selectedFiles.map((file) => file.name)
      });

      const imagesPayload = await Promise.all(selectedFiles.map((file) => compressImageForUpload(file)));

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

      const requestImages = imagesPayload.map(({ name, data }) => ({ name, data }));

      const response = await fetch(`${apiUrl}/admin/product`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          price_ils: Math.round(parsedPrice * 100),
          cta_text: ctaText.trim(),
          images: requestImages
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
      setStatus("המוצר נשמר בהצלחה.");
    } catch (err) {
      console.error("[admin] product save exception", {
        message: err?.message,
        stack: err?.stack
      });
      setStatus("שמירת המוצר נכשלה.");
    }
  };

  const previewProduct = normalizeProduct(product || fallbackProduct);

  const saveHomeHero = async (event) => {
    event.preventDefault();
    setHeroStatus("");

    if (!heroFile) {
      setHeroStatus("נא לבחור תמונה לפני שמירה.");
      return;
    }

    try {
      const uploadedImage = await compressImageForUpload(heroFile);
      const response = await fetch(`${apiUrl}/admin/home-hero`, {
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
      setHeroStatus("תמונת הבאנר נשמרה בהצלחה.");
    } catch (_error) {
      setHeroStatus("שמירת תמונת הבאנר נכשלה.");
    }
  };

  return (
    <main className="page" dir="rtl">
      <section className="card">
        <h1>ניהול מוצר</h1>
        {loading ? <p>טוען מוצר...</p> : null}
        {error ? <p className="warning">{error}</p> : null}

        <div className="admin-tabs" role="tablist" aria-label="לשוניות ניהול">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "product"}
            className={`tab-button ${activeTab === "product" ? "tab-button-active" : ""}`}
            onClick={() => setActiveTab("product")}
          >
            מוצר
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "hero"}
            className={`tab-button ${activeTab === "hero" ? "tab-button-active" : ""}`}
            onClick={() => setActiveTab("hero")}
          >
            תמונת באנר בית
          </button>
        </div>

        {activeTab === "product" ? (
          <>
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
          </>
        ) : (
          <>
            <form onSubmit={saveHomeHero} className="order-form">
              <label className="file-label">
                העלאת תמונת באנר לרוחב לדף הבית
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setHeroFile(event.target.files?.[0] || null)}
                />
              </label>

              <button type="submit">שמור תמונת באנר</button>
            </form>

            <h2>תמונת באנר נוכחית</h2>
            <img src={homeHeroImageUrl} alt="תמונת באנר" className="hero-banner-image" />

            {heroStatus ? <p className="status">{heroStatus}</p> : null}
          </>
        )}
      </section>
    </main>
  );
};

function App() {
  const isAdminPage = window.location.pathname === "/admin";
  return isAdminPage ? <AdminPage /> : <StorePage />;
}

export default App;
