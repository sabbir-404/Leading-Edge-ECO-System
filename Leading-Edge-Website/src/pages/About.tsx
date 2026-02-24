import React from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useShop } from '../context/ShopContext';

const About: React.FC = () => {
  const { customPages } = useShop();
  const page = customPages.find(p => p.slug === 'about');
  
  if (!page) return null;

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      
      {/* Hero */}
      {page.hasHero && page.heroImage && (
        <div className="w-full aspect-video md:h-[500px] bg-black relative overflow-hidden">
           <img 
              src={page.heroImage} 
              alt="About Hero" 
              className="w-full h-full object-cover opacity-60"
           />
           <div className="absolute inset-0 flex items-center justify-center">
               <h1 className="text-4xl md:text-6xl font-serif font-bold text-white drop-shadow-lg">{page.title}</h1>
           </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-16">
         {page.sections.map(section => (
            <div key={section.id} className="prose prose-lg mx-auto text-gray-600 leading-relaxed whitespace-pre-wrap mb-8">
                {section.content}
            </div>
         ))}
      </div>

      <div className="bg-gray-50 py-16">
         <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="p-6">
               <h3 className="text-xl font-bold mb-3">Sustainable Sourcing</h3>
               <p className="text-gray-500">We work with eco-conscious manufacturers who prioritize renewable materials.</p>
            </div>
            <div className="p-6">
               <h3 className="text-xl font-bold mb-3">Artistic Integrity</h3>
               <p className="text-gray-500">Designs that stand the test of time, moving beyond fleeting trends.</p>
            </div>
            <div className="p-6">
               <h3 className="text-xl font-bold mb-3">Customer First</h3>
               <p className="text-gray-500">From browsing to delivery, your experience is our top priority.</p>
            </div>
         </div>
      </div>

      <Footer />
    </div>
  );
};

export default About;