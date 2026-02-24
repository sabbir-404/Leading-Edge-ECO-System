import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useShop } from '../context/ShopContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Product } from '../types';
import { ShoppingCart, Filter, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CURRENCY } from '../constants';

const CategoryGallery: React.FC = () => {
  const { category } = useParams();
  const navigate = useNavigate();
  const { products } = useShop();
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  // Filter States
  const [sortOption, setSortOption] = useState('newest');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  const [onSaleOnly, setOnSaleOnly] = useState(false);

  useEffect(() => {
    let result = products;

    // 1. Filter by Category
    if (category) {
      if (category.toLowerCase() === 'sale') {
        result = result.filter(p => p.onSale);
      } else {
        // Filter if category is in the categories array
        result = result.filter(p => p.categories.some(c => c.toLowerCase() === category.toLowerCase()));
      }
    }

    // 2. Filter by Price
    result = result.filter(p => {
       const price = p.onSale && p.salePrice ? p.salePrice : p.price;
       return price >= priceRange[0] && price <= priceRange[1];
    });

    // 3. Filter by Sale Only (checkbox)
    if (onSaleOnly) {
      result = result.filter(p => p.onSale);
    }

    // 4. Sort
    if (sortOption === 'low-high') {
      result.sort((a, b) => (a.onSale && a.salePrice ? a.salePrice : a.price) - (b.onSale && b.salePrice ? b.salePrice : b.price));
    } else if (sortOption === 'high-low') {
      result.sort((a, b) => (b.onSale && b.salePrice ? b.salePrice : b.price) - (a.onSale && a.salePrice ? a.salePrice : a.price));
    } else {
        // Mock newest by ID
        result.sort((a, b) => b.id.localeCompare(a.id)); 
    }

    setFilteredProducts(result);
  }, [category, products, sortOption, priceRange, onSaleOnly]);

  const FilterContent = () => (
    <div className="space-y-6">
      <div>
        <h4 className="font-bold mb-3">Sort By</h4>
        <select 
          value={sortOption} 
          onChange={(e) => setSortOption(e.target.value)}
          className="w-full border border-gray-200 rounded p-2"
        >
          <option value="newest">Newest Arrivals</option>
          <option value="low-high">Price: Low to High</option>
          <option value="high-low">Price: High to Low</option>
        </select>
      </div>
      <div>
        <h4 className="font-bold mb-3">Price Range: {CURRENCY}{priceRange[0]} - {CURRENCY}{priceRange[1]}</h4>
        <input 
          type="range" 
          min="0" 
          max="10000" 
          step="500"
          value={priceRange[1]}
          onChange={(e) => setPriceRange([0, Number(e.target.value)])}
          className="w-full accent-primary"
        />
      </div>
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input 
            type="checkbox" 
            checked={onSaleOnly}
            onChange={(e) => setOnSaleOnly(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          <span>Show Sale Items Only</span>
        </label>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Category Hero */}
      <div className="relative h-[300px] md:h-[400px] bg-gray-900 overflow-hidden">
        <img 
          src={`https://picsum.photos/seed/${category}/1920/600`} 
          alt={category} 
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <h1 className="text-5xl md:text-7xl font-serif font-bold text-white capitalize">{category}</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Desktop Sidebar Filters */}
          <div className="hidden lg:block w-64 flex-shrink-0">
             <div className="sticky top-24">
               <h3 className="text-xl font-bold mb-6">Filters</h3>
               <FilterContent />
             </div>
          </div>

          {/* Mobile Filter Button */}
          <div className="lg:hidden mb-6 flex justify-between items-center">
            <span className="font-bold text-gray-500">{filteredProducts.length} Products</span>
            <button 
              onClick={() => setIsFilterOpen(true)}
              className="flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-lg font-medium"
            >
              <Filter size={18} /> Filters
            </button>
          </div>

          {/* Product Grid */}
          <div className="flex-1">
             {filteredProducts.length === 0 ? (
               <div className="text-center py-20 text-gray-500">No products found fitting these criteria.</div>
             ) : (
               <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                 {filteredProducts.map(product => (
                    <div 
                      key={product.id} 
                      className="cursor-pointer group"
                      onClick={() => navigate(`/product/${product.id}`)}
                    >
                      <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden mb-3">
                        <img 
                          src={product.image} 
                          alt={product.name} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        {product.onSale && (
                          <div className="absolute top-2 left-2 bg-red-600 text-white text-xs font-bold px-2 py-1 uppercase tracking-wider">
                            Sale
                          </div>
                        )}
                      </div>
                      <h4 className="font-medium text-gray-900">{product.name}</h4>
                      <div className="flex items-center gap-2 text-sm mt-1">
                         {product.onSale ? (
                            <>
                              <span className="font-bold text-red-600">{CURRENCY}{product.salePrice}</span>
                              <span className="text-gray-400 line-through">{CURRENCY}{product.price}</span>
                            </>
                         ) : (
                            <span className="font-bold text-gray-900">{CURRENCY}{product.price}</span>
                         )}
                      </div>
                    </div>
                 ))}
               </div>
             )}
          </div>
        </div>
      </div>

      {/* Mobile Filter Modal */}
      <AnimatePresence>
        {isFilterOpen && (
          <>
            {/* @ts-ignore */}
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 lg:hidden" 
              onClick={() => setIsFilterOpen(false)}
            />
            {/* @ts-ignore */}
            <motion.div 
              initial={{ y: '100%' }} 
              animate={{ y: 0 }} 
              exit={{ y: '100%' }}
              transition={{ type: "tween" }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 lg:hidden p-6 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Filter & Sort</h3>
                <button onClick={() => setIsFilterOpen(false)}><X /></button>
              </div>
              <FilterContent />
              <button 
                onClick={() => setIsFilterOpen(false)}
                className="w-full bg-primary text-white py-4 rounded-xl mt-8 font-bold"
              >
                Show Results
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
};

export default CategoryGallery;