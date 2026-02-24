
import React from 'react';
import { useShop } from '../context/ShopContext';
import { useNavigate } from 'react-router-dom';

const CategoryGrid: React.FC = () => {
  const { categories } = useShop();
  const navigate = useNavigate();

  // Filter categories marked as 'isFeatured' for the grid display
  // Or just show top level categories
  const displayCategories = categories
    .filter(c => c.isFeatured && !c.parentId)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .slice(0, 16);

  return (
    <div className="py-16 bg-secondary/30">
      <div className="max-w-7xl mx-auto px-4">
        <h3 className="text-2xl font-serif font-bold text-center mb-10 text-primary">Browse Categories</h3>
        
        {/* Desktop: Grid Layout 8 columns x 2 rows */}
        <div className="grid grid-cols-4 md:grid-cols-8 gap-y-10 gap-x-4 justify-items-center">
          {displayCategories.map((cat) => (
            <div 
              key={cat.id} 
              className="flex flex-col items-center group cursor-pointer"
              onClick={() => navigate(`/gallery/${cat.name}`)}
            >
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-2 border-white shadow-md group-hover:scale-110 transition-transform duration-300 bg-gray-200">
                {cat.image ? (
                  <img 
                    src={cat.image} 
                    alt={`Browse ${cat.name} category`} 
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-500 font-bold uppercase p-2 text-center">
                    {cat.name.substring(0, 2)}
                  </div>
                )}
              </div>
              <span className="mt-3 text-sm font-medium text-gray-700 group-hover:text-accent transition-colors text-center">
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
