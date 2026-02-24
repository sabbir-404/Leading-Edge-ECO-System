import React, { useRef } from 'react';
import { useShop } from '../context/ShopContext';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';

const ProjectSlider: React.FC = () => {
  const { siteConfig, projects } = useShop();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!siteConfig.showProjectsSection || projects.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { current } = scrollRef;
      const scrollAmount = 350;
      current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-end mb-8">
          <div>
             <h3 className="text-3xl font-serif font-bold text-primary mb-2">Our Completed Projects</h3>
             <p className="text-gray-500 max-w-xl">Explore our portfolio of interior design and furnishing projects.</p>
          </div>
          <div className="flex items-center gap-4">
             <button 
                onClick={() => navigate('/projects')}
                className="hidden md:flex items-center text-sm font-bold text-accent hover:text-primary transition-colors mr-4"
             >
                View All Projects <ArrowRight size={14} className="ml-1" />
             </button>
             <div className="flex gap-2">
                <button 
                  onClick={() => scroll('left')}
                  className="p-2 rounded-full border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <button 
                  onClick={() => scroll('right')}
                  className="p-2 rounded-full border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
             </div>
          </div>
        </div>

        <div 
          ref={scrollRef}
          className="flex gap-6 overflow-x-auto no-scrollbar pb-8 snap-x snap-mandatory"
        >
          {projects.map((project) => (
            <div 
              key={project.id} 
              className="min-w-[300px] md:min-w-[400px] snap-start cursor-pointer group"
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl mb-4">
                <img 
                  src={project.coverImage} 
                  alt={project.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                   <span className="text-white font-bold flex items-center gap-2">View Project <ArrowRight size={16}/></span>
                </div>
              </div>
              <h4 className="text-xl font-bold text-primary mb-1">{project.title}</h4>
              <p className="text-gray-500 text-sm line-clamp-2">{project.description}</p>
            </div>
          ))}
        </div>
        
        <div className="md:hidden mt-4 text-center">
            <button 
                onClick={() => navigate('/projects')}
                className="text-sm font-bold text-accent hover:text-primary transition-colors inline-flex items-center"
             >
                View All Projects <ArrowRight size={14} className="ml-1" />
             </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectSlider;