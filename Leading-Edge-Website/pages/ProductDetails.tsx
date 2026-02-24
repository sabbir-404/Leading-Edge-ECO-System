import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Product, ProductVariation } from '../types';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useShop } from '../context/ShopContext';
import { ArrowLeft, Star, CheckCircle2, ShoppingCart, Zap, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { CURRENCY } from '../constants';

const ProductDetails: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart, products } = useShop();
  const [product, setProduct] = useState<Product | undefined>(undefined);
  const [activeTab, setActiveTab] = useState('desc');
  const [mainImage, setMainImage] = useState('');
  
  // Variations State
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | undefined>(undefined);

  // Tab Scroll Ref
  const tabContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const found = products.find(p => p.id === id);
    if (found) {
      setProduct(found);
      setMainImage(found.image);
      window.scrollTo(0, 0);
    }
  }, [id, products]);

  const handleMouseMoveTabs = (e: React.MouseEvent) => {
    const container = tabContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    // Scroll regions
    const triggerZone = 50; 
    
    if (x < triggerZone) {
       container.scrollBy({ left: -10, behavior: 'auto' });
    } else if (x > width - triggerZone) {
       container.scrollBy({ left: 10, behavior: 'auto' });
    }
  };

  if (!product) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  if (!product.isVisible) {
      return (
        <div className="min-h-screen flex items-center justify-center flex-col gap-4">
             <h1 className="text-2xl font-bold">Product Unavailable</h1>
             <p>This product is currently hidden or out of stock.</p>
             <button onClick={() => navigate('/')} className="text-accent underline">Return Home</button>
        </div>
      );
  }

  // Derived Display Values based on variation
  const currentPrice = selectedVariation?.price ?? product.price;
  const currentSalePrice = selectedVariation?.salePrice ?? product.salePrice;
  const currentModelNumber = selectedVariation?.modelNumber || product.modelNumber;
  
  const handleVariationSelect = (v: ProductVariation) => {
    setSelectedVariation(v);
    if (v.image) setMainImage(v.image);
  };

  const uniqueVariationTypes = Array.from(new Set(product.variations.map(v => v.type)));

  const tabs = [
    { id: 'desc', label: 'Description' },
    { id: 'specs', label: 'Specifications' },
    ...product.customTabs.map(t => ({ id: t.id, label: t.title })),
    { id: 'reviews', label: 'Reviews (124)' },
    { id: 'shipping', label: 'Shipping' },
    { id: 'returns', label: 'Returns & Exchange' },
  ];

  // Breadcrumbs Logic (using first category for main path)
  const mainCategory = product.categories[0] || 'Uncategorized';

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Breadcrumbs */}
        <div className="flex items-center text-xs text-gray-500 mb-6 flex-wrap">
            <Link to="/" className="hover:text-primary">Home</Link>
            <ChevronRight size={12} className="mx-2"/>
            <Link to={`/gallery/${mainCategory}`} className="hover:text-primary">{mainCategory}</Link>
            <ChevronRight size={12} className="mx-2"/>
            <span className="font-medium text-gray-800 truncate max-w-[200px]">{product.name}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-20">
          
          <div className="relative">
             <div className="sticky top-24">
                {/* @ts-ignore */}
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={mainImage}
                  className="w-full bg-gray-100 aspect-[4/3] md:aspect-square rounded-lg overflow-hidden border border-gray-100 relative mb-4"
                >
                  <img src={mainImage} alt={product.name} className="w-full h-full object-cover" />
                  {product.onSale && (
                     <div className="absolute top-4 left-4 bg-red-600 text-white text-xs font-bold px-4 py-2 uppercase tracking-wider">
                        On Sale
                     </div>
                  )}
                </motion.div>
                
                <div className="grid grid-cols-4 gap-4">
                   <div 
                      className={`aspect-square rounded border cursor-pointer overflow-hidden ${mainImage === product.image ? 'border-primary' : 'border-transparent'}`}
                      onClick={() => setMainImage(product.image)}
                   >
                      <img src={product.image} className="w-full h-full object-cover" />
                   </div>
                   {product.images?.map((img, idx) => (
                      <div 
                        key={idx} 
                        className={`aspect-square rounded border cursor-pointer overflow-hidden ${mainImage === img ? 'border-primary' : 'border-transparent'}`}
                        onClick={() => setMainImage(img)}
                      >
                         <img src={img} className="w-full h-full object-cover" />
                      </div>
                   ))}
                </div>
             </div>
          </div>

          <div className="flex flex-col">
            <div className="flex flex-wrap gap-2 mb-2">
                {product.categories.map(cat => (
                    <span key={cat} className="text-gray-400 text-sm bg-gray-50 px-2 py-1 rounded">{cat}</span>
                ))}
            </div>
            <h1 className="text-2xl md:text-5xl font-serif font-bold text-primary mb-2 leading-tight">
              {product.name}
            </h1>
            <p className="text-sm text-gray-400 mb-6 font-mono">Model: {currentModelNumber}</p>
            
            <div className="flex items-end gap-4 mb-8 border-b border-gray-100 pb-8">
              {product.onSale ? (
                <div className="flex flex-col">
                   <span className="text-3xl font-bold text-red-600">{CURRENCY}{currentSalePrice}</span>
                   <span className="text-lg text-gray-400 line-through">{CURRENCY}{currentPrice}</span>
                </div>
              ) : (
                <span className="text-3xl font-semibold text-primary">{CURRENCY}{currentPrice}</span>
              )}
              
              <div className="flex items-center text-accent mb-1 ml-auto">
                <Star fill="currentColor" size={18} />
                <span className="ml-2 text-gray-500 text-sm font-bold">4.8</span>
                <span className="text-gray-400 text-sm ml-1">(124 Reviews)</span>
              </div>
            </div>

            <p className="text-gray-600 leading-relaxed mb-6 text-lg">
               {product.shortDescription || product.description.substring(0, 150) + '...'}
            </p>

            {uniqueVariationTypes.length > 0 && (
               <div className="mb-8 space-y-4">
                  {uniqueVariationTypes.map(type => (
                     <div key={type}>
                        <h4 className="font-bold text-sm mb-2">{type}</h4>
                        <div className="flex gap-2 flex-wrap">
                           {product.variations.filter(v => v.type === type).map(v => (
                              <button
                                 key={v.id}
                                 onClick={() => handleVariationSelect(v)}
                                 className={`px-4 py-2 rounded border text-sm transition-all ${selectedVariation?.id === v.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 hover:border-gray-400'}`}
                              >
                                 {v.value}
                              </button>
                           ))}
                        </div>
                     </div>
                  ))}
               </div>
            )}

            <div className="space-y-4 mb-8">
               <button 
                  onClick={() => addToCart(product, selectedVariation)}
                  disabled={uniqueVariationTypes.length > 0 && !selectedVariation}
                  className="w-full bg-primary text-white py-4 px-8 font-medium hover:bg-gray-800 transition-colors shadow-lg flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  <ShoppingCart size={20} /> Add to Cart
                </button>
                <button 
                  onClick={() => { addToCart(product, selectedVariation); navigate('/checkout'); }}
                  disabled={uniqueVariationTypes.length > 0 && !selectedVariation}
                  className="w-full bg-accent text-white py-4 px-8 font-medium hover:bg-orange-600 transition-colors shadow-lg flex items-center justify-center gap-2 disabled:bg-orange-200 disabled:cursor-not-allowed"
                >
                  <Zap size={20} fill="currentColor" /> Buy Now
                </button>
                {uniqueVariationTypes.length > 0 && !selectedVariation && (
                   <p className="text-red-500 text-sm text-center">Please select options before adding to cart.</p>
                )}
            </div>

            <div className="flex items-center gap-2 text-sm text-green-600 mb-12">
               <CheckCircle2 size={16} />
               <span>In Stock & Ready to Ship</span>
            </div>

            <div className="mt-8">
              <div 
                className="border-b border-gray-200 overflow-x-auto no-scrollbar relative"
                ref={tabContainerRef}
                onMouseMove={handleMouseMoveTabs}
              >
                <div className="flex min-w-max">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                        activeTab === tab.id 
                          ? 'border-accent text-accent' 
                          : 'border-transparent text-gray-500 hover:text-primary'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="py-6 text-gray-600 leading-relaxed text-sm">
                {activeTab === 'desc' && (
                  <p>{product.description}</p>
                )}
                {activeTab === 'specs' && (
                   <div className="bg-gray-50 rounded-lg p-6">
                      <table className="w-full">
                         <tbody>
                            <tr className="border-b border-gray-200"><td className="py-2 font-bold w-1/3">Model</td><td className="py-2">{currentModelNumber}</td></tr>
                            {product.specifications.map((spec, idx) => (
                               <tr key={idx} className="border-b border-gray-200 last:border-0">
                                  <td className="py-2 font-bold text-gray-700">{spec.key}</td>
                                  <td className="py-2 text-gray-600">{spec.value}</td>
                               </tr>
                            ))}
                         </tbody>
                      </table>
                   </div>
                )}
                {product.customTabs.map(t => (
                   activeTab === t.id && <div key={t.id} className="prose prose-sm max-w-none">{t.content}</div>
                ))}
                
                {activeTab === 'reviews' && <p>Customer reviews content...</p>}
                {activeTab === 'shipping' && <p>Standard shipping: 2-3 business days inside Dhaka.</p>}
                {activeTab === 'returns' && <p>7-Day Return Policy on original condition items.</p>}
              </div>
            </div>
          </div>
        </div>

        <h2 className="text-2xl font-serif font-bold mb-8">Related Products</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
           {products.filter(p => p.categories.some(c => product.categories.includes(c)) && p.id !== product.id).slice(0, 4).map(p => (
             <div key={p.id} className="cursor-pointer group" onClick={() => navigate(`/product/${p.id}`)}>
               <div className="bg-gray-100 aspect-square rounded-lg mb-3 overflow-hidden">
                 <img src={p.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
               </div>
               <h4 className="font-medium text-sm text-primary">{p.name}</h4>
               <div className="flex gap-2 text-sm">
                  {p.onSale ? (
                     <>
                        <span className="text-red-600 font-bold">{CURRENCY}{p.salePrice}</span>
                        <span className="text-gray-400 line-through">{CURRENCY}{p.price}</span>
                     </>
                  ) : (
                     <span className="text-gray-500">{CURRENCY}{p.price}</span>
                  )}
               </div>
             </div>
           ))}
        </div>

      </div>
      <Footer />
    </div>
  );
};

export default ProductDetails;