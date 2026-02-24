import React from 'react';
import Navbar from '../components/Navbar';
import HeroSlider from '../components/HeroSlider';
import CategoryGrid from '../components/CategoryGrid';
import ProductSlider from '../components/ProductSlider';
import CatalogueSlider from '../components/CatalogueSlider';
import Footer from '../components/Footer';
import { useShop } from '../context/ShopContext';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const Home: React.FC = () => {
  const { products, siteConfig } = useShop();

  // Filter Sales
  const saleProducts = products.filter(p => p.onSale && p.isVisible);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      
      <main>
        <section>
          <HeroSlider />
        </section>

        {/* Sale Section (Static for now, could be dynamic too) */}
        {saleProducts.length > 0 && (
          <div className="bg-red-50 mt-8 relative">
             <div className="absolute top-12 left-4 md:left-auto md:right-12 max-w-7xl mx-auto w-full z-10 pointer-events-none">
                 <div className="flex justify-end pointer-events-auto px-8">
                     <Link to="/gallery/sale" className="text-red-600 font-bold text-sm flex items-center hover:underline">
                         View All Sale <ArrowRight size={14} className="ml-1" />
                     </Link>
                 </div>
             </div>
            <ProductSlider title="Flash Sale" products={saleProducts} />
          </div>
        )}

        <CategoryGrid />

        <div className="space-y-8 mb-20">
          {siteConfig.homeSections.filter(s => s.isVisible).map((section) => {
             let sectionProducts: typeof products = [];
             
             if (section.type === 'category') {
                 // Check if the product has the section value in its categories array
                 sectionProducts = products.filter(p => p.categories.includes(section.value as string) && p.isVisible);
             } else if (section.type === 'ids' && Array.isArray(section.value)) {
                 sectionProducts = products.filter(p => (section.value as string[]).includes(p.id) && p.isVisible);
             }

             if (sectionProducts.length === 0) return null;
             
             return (
              <div key={section.id} className="relative">
                  {section.type === 'category' && (
                      <div className="max-w-7xl mx-auto px-4 relative top-16 z-10 flex justify-end pointer-events-none">
                        <div className="pointer-events-auto">
                            <Link to={`/gallery/${section.value}`} className="flex items-center text-sm font-bold text-accent hover:text-primary transition-colors">
                                See All {section.title} <ArrowRight size={14} className="ml-1" />
                            </Link>
                        </div>
                      </div>
                  )}
                  
                  <ProductSlider 
                    title={section.title} 
                    products={sectionProducts} 
                  />
              </div>
            );
          })}
        </div>

        {/* Catalogue Slider */}
        <CatalogueSlider />
      </main>

      <Footer />
    </div>
  );
};

export default Home;