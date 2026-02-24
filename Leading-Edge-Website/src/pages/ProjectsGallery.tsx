
import React from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useShop } from '../context/ShopContext';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const ProjectsGallery: React.FC = () => {
  const { projects } = useShop();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      
      {/* Header */}
      <div className="bg-gray-900 text-white py-20">
         <div className="max-w-7xl mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-6xl font-serif font-bold mb-4">Our Projects</h1>
            <p className="text-gray-400 max-w-2xl mx-auto text-lg">A showcase of our interior design excellence and completed furnishing works across the country.</p>
         </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-16">
         {projects.length === 0 ? (
            <div className="text-center text-gray-500 py-20">No projects found.</div>
         ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
               {projects.map((project) => (
                  <div 
                     key={project.id} 
                     className="group cursor-pointer"
                     onClick={() => navigate(`/projects/${project.id}`)}
                  >
                     <div className="relative aspect-[16/9] overflow-hidden rounded-xl mb-6 bg-gray-100">
                        <img 
                           src={project.coverImage} 
                           alt={`Cover image for ${project.title}`} 
                           loading="lazy"
                           className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                           <span className="bg-white text-primary px-6 py-3 rounded-full font-bold flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                              View Details <ArrowRight size={18} />
                           </span>
                        </div>
                     </div>
                     <h3 className="text-2xl font-bold text-gray-900 group-hover:text-accent transition-colors mb-2">{project.title}</h3>
                     <p className="text-gray-500 line-clamp-2">{project.description}</p>
                  </div>
               ))}
            </div>
         )}
      </div>

      <Footer />
    </div>
  );
};

export default ProjectsGallery;
