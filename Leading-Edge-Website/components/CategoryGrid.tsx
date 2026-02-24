import React from 'react';
import { CATEGORIES } from '../constants';

const CategoryGrid: React.FC = () => {
  // We need 16 items for an 8x2 grid layout
  // On mobile/tablet we might scroll or stack differently
  return (
    <div className="py-16 bg-secondary/30">
      <div className="max-w-7xl mx-auto px-4">
        <h3 className="text-2xl font-serif font-bold text-center mb-10 text-primary">Browse Categories</h3>
        
        {/* Desktop: Grid Layout 8 columns x 2 rows */}
        <div className="grid grid-cols-4 md:grid-cols-8 gap-y-10 gap-x-4 justify-items-center">
          {CATEGORIES.slice(0, 16).map((cat) => (
            <div key={cat.id} className="flex flex-col items-center group cursor-pointer">
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-2 border-white shadow-md group-hover:scale-110 transition-transform duration-300">
                <img 
                  src={cat.image} 
                  alt={cat.name} 
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="mt-3 text-sm font-medium text-gray-700 group-hover:text-accent transition-colors">
                {cat.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CategoryGrid;
