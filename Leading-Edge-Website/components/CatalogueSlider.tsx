import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CATALOGUES } from '../constants';
import { ArrowRight } from 'lucide-react';

const CatalogueSlider: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="py-16 bg-white border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4">
        <h3 className="text-2xl font-serif font-bold text-primary mb-8">Our Catalogues</h3>
        
        <div className="flex gap-6 overflow-x-auto no-scrollbar pb-8 snap-x snap-mandatory">
          {CATALOGUES.map((cat) => (
            <div 
              key={cat.id} 
              className="min-w-[280px] md:min-w-[350px] snap-start cursor-pointer group"
              onClick={() => navigate(`/catalogue/${cat.id}`)}
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-lg shadow-md mb-4">
                <img 
                  src={cat.coverImage} 
                  alt={cat.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <span className="bg-white text-primary px-6 py-2 rounded-full font-medium opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 flex items-center gap-2">
                    View Catalogue <ArrowRight size={16} />
                  </span>
                </div>
              </div>
              <h4 className="text-xl font-bold text-primary">{cat.title}</h4>
              <p className="text-gray-500 text-sm">{cat.season}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CatalogueSlider;
