import React from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useShop } from '../context/ShopContext';

const Shipping: React.FC = () => {
  const { customPages } = useShop();
  const page = customPages.find(p => p.slug === 'shipping');

  if (!page) return null;

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-16">
         <h1 className="text-4xl font-serif font-bold mb-8 text-primary">{page.title}</h1>
         
         <div className="prose prose-lg text-gray-600 space-y-8 whitespace-pre-wrap">
            {page.sections.map(section => (
               <div key={section.id}>{section.content}</div>
            ))}
         </div>
      </div>
      <Footer />
    </div>
  );
};

export default Shipping;