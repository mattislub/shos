import ProductGrid from './components/ProductGrid';

const products = [
  {
    title: 'Blue Soft Loafer Comfortable Walking Shoes for Everyday Style',
    imageSrc: '/src/assets/products/loafer_blue_2.jpg',
    rating: 5,
    reviewsCount: 1,
    available: false
  },
  {
    title: 'Olive Classic Slip-On Loafer with Cushioned Sole',
    imageSrc: '/src/assets/products/loafer_olive_2.jpg',
    rating: 5,
    reviewsCount: 1,
    available: false
  },
  {
    title: 'Red Minimal Everyday Loafer with Flexible Fit',
    imageSrc: '/src/assets/products/loafer_red_2.jpg',
    rating: 5,
    reviewsCount: 1,
    available: false
  },
  {
    title: 'Black Premium Loafer Shoes for Day-to-Night Looks',
    imageSrc: '/src/assets/products/loafer_black_2.jpg',
    rating: 5,
    reviewsCount: 1,
    available: false
  },
  {
    title: 'Pink Lightweight Loafer for Casual Outfits',
    imageSrc: '/src/assets/products/loafer_pink_2.jpg',
    rating: 5,
    reviewsCount: 1,
    available: false
  },
  {
    title: 'White Neutral Loafer with Soft Interior Lining',
    imageSrc: '/src/assets/products/loafer_white_2.jpg',
    rating: 5,
    reviewsCount: 1,
    available: false
  }
];

export default function App() {
  return (
    <main className="page">
      <ProductGrid products={products} />
    </main>
  );
}
