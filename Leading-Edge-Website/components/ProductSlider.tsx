import React, { useRef, useEffect } from 'react';
import { Product } from '../types';
import { ChevronLeft, ChevronRight, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CURRENCY } from '../constants';

interface ProductSliderProps {
  title: string;
  products: Product[];
  autoSlide?: boolean;
}

const ProductSlider: React.FC<ProductSliderProps> = ({ title, products, autoSlide = true }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { current } = scrollRef;
      // Scroll amount accounts for smaller item width on mobile
      const scrollAmount = window.innerWidth < 768 ? 170 : 320;
      current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  useEffect(() => {
    if (!autoSlide) return;
    const interval = setInterval(() => {
      if (scrollRef.current) {
        const { current } = scrollRef;
        if (current.scrollLeft + current.clientWidth >= current.scrollWidth) {
          current.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          scroll('right');
        }
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [autoSlide, products.length]);

  if (products.length === 0) return null;

  return (
    <div className="py-12 border-b border-gray-100 last:border-0">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-2xl font-serif font-bold text-primary">{title}</h3>
          <div className="flex gap-2">
            <button 
              onClick={() => scroll('left')}
              className="p-2 rounded-full border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={() => scroll('right')}
              className="p-2 rounded-full border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div 
          ref={scrollRef}
          className="flex gap-4 md:gap-6 overflow-x-auto no-scrollbar pb-4 snap-x snap-mandatory"
        >
          {products.map((product) => (
            <div 
              key={product.id} 
              className="min-w-[160px] md:min-w-[320px] snap-start group cursor-pointer"
              onClick={() => navigate(`/product/${product.id}`)}
            >
              <div className="relative aspect-square bg-gray-100 rounded-xl overflow-hidden mb-4">
                <img 
                  src={product.image} 
                  alt={product.name} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                {product.onSale && (
                  <div className="absolute top-2 left-2 md:top-4 md:left-4 bg-red-600 text-white text-[10px] md:text-xs font-bold px-2 py-1 md:px-3 md:py-1 uppercase tracking-wider">
                    Sale
                  </div>
                )}
                <button className="absolute bottom-4 right-4 bg-white p-3 rounded-full shadow-lg translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 hover:bg-primary hover:text-white hidden md:block">
                  <ShoppingCart size={18} />
                </button>
              </div>
              <div>
                <h4 className="font-medium text-sm md:text-lg text-primary line-clamp-1">{product.name}</h4>
                <div className="flex items-center gap-2">
                  {product.onSale ? (
                    <>
                      <span className="font-semibold text-sm md:text-base text-red-600">{CURRENCY}{product.salePrice}</span>
                      <span className="text-xs md:text-sm text-gray-400 line-through">{CURRENCY}{product.price}</span>
                    </>
                  ) : (
                    <span className="font-semibold text-sm md:text-base text-primary">{CURRENCY}{product.price}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProductSlider;