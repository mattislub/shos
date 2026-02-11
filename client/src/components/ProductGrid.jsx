const DEFAULT_RATING = 5;

function StarRating({ rating = DEFAULT_RATING }) {
  const stars = Array.from({ length: 5 }, (_, index) => {
    const isFilled = index < Math.round(rating);
    return (
      <span key={index} className={`star ${isFilled ? 'filled' : ''}`} aria-hidden="true">
        ★
      </span>
    );
  });

  return <span className="star-list">{stars}</span>;
}

function ProductCard({ product }) {
  const {
    title,
    imageSrc,
    rating = DEFAULT_RATING,
    reviewsCount = 1,
    available = false
  } = product;

  return (
    <article className="product-card">
      <div className="product-image-area">
        <img className="product-image" src={imageSrc} alt={title} loading="lazy" />
      </div>

      <h3 className="product-title" title={title}>
        {title}
      </h3>

      <p className="product-rating" aria-label={`Rating ${rating} out of 5 based on ${reviewsCount} reviews`}>
        <span className="rating-value">{rating.toFixed(1)}</span>
        <StarRating rating={rating} />
        <span className="reviews-count">{reviewsCount}</span>
      </p>

      <p className={`product-status ${available ? 'in-stock' : 'out-of-stock'}`}>
        {available ? 'In stock.' : 'Currently unavailable.'}
      </p>
    </article>
  );
}

export default function ProductGrid({ products }) {
  return (
    <section className="product-grid" aria-label="Similar products">
      {products.map((product) => (
        <ProductCard key={`${product.title}-${product.imageSrc}`} product={product} />
      ))}
    </section>
  );
}
