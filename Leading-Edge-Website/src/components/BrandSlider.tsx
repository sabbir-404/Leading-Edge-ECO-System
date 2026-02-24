
import React from 'react';
import { useShop } from '../context/ShopContext';

const BrandSlider: React.FC = () => {
  const { siteConfig } = useShop();
  const brands = siteConfig.brands || [];

  if (!siteConfig.showBrandsSection || brands.length === 0) return null;

  return (
    <div className="py-12 bg-gray-50 border-t border-gray-100 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 mb-8 text-center">
        <h3 className="text-xl font-serif font-bold text-gray-400 uppercase tracking-widest">Our Partnered Brands</h3>
      </div>
      
      <div className="relative w-full overflow-hidden">
        {/* Infinite scrolling track */}
        <div className="flex gap-16 animate-marquee whitespace-nowrap w-max">
          {/* Double the list to create seamless loop effect */}
          {[...brands, ...brands].map((brand, idx) => (
            <div key={`${brand.id}-${idx}`} className="w-32 h-20 md:w-40 md:h-24 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity grayscale hover:grayscale-0">
              <img 
                src={brand.logo} 
                alt={`${brand.name} logo`} 
                loading="lazy"
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ))}
        </div>
      </div>
      
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

export default BrandSlider;
