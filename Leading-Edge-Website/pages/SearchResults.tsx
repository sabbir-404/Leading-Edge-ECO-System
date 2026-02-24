import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useShop } from '../context/ShopContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Product } from '../types';
import { CURRENCY } from '../constants';

const SearchResults: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const { products } = useShop();
  const navigate = useNavigate();
  const [results, setResults] = useState<Product[]>([]);

  useEffect(() => {
    if (query) {
      const filtered = products.filter(p => 
        p.name.toLowerCase().includes(query.toLowerCase()) || 
        p.categories.some(c => c.toLowerCase().includes(query.toLowerCase())) ||
        p.description.toLowerCase().includes(query.toLowerCase())
      );
      setResults(filtered);
    }
  }, [query, products]);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-serif font-bold mb-8">Search Results for "{query}"</h1>
        
        {results.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-lg">
            <h2 className="text-xl font-medium text-gray-600 mb-4">No products found.</h2>
            <p className="text-gray-500">Try checking your spelling or use different keywords.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {results.map(product => (
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
      <Footer />
    </div>
  );
};

export default SearchResults;