
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useShop } from '../context/ShopContext';
import { ArrowLeft, Calendar, User } from 'lucide-react';

const ProjectDetails: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { projects, isLoading } = useShop();
  
  const project = projects.find(p => p.id === id);

  if (isLoading && !project) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  if (!project) return <div className="min-h-screen flex items-center justify-center flex-col gap-4">
      <h2 className="text-xl font-bold">Project not found</h2>
      <button onClick={() => navigate('/projects')} className="text-accent hover:underline">Back to Projects</button>
  </div>;

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      
      {/* Hero */}
      <div className="relative h-[60vh] bg-gray-900">
         <img src={project.coverImage} alt={project.title} className="w-full h-full object-cover opacity-60" />
         <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-16 max-w-7xl mx-auto w-full">
            <button onClick={() => navigate('/projects')} className="text-white/80 hover:text-white mb-6 flex items-center gap-2 w-fit">
               <ArrowLeft size={20} /> Back to Projects
            </button>
            <h1 className="text-4xl md:text-6xl font-serif font-bold text-white mb-4">{project.title}</h1>
            <div className="flex flex-wrap gap-6 text-white/90">
               {project.client && (
                  <div className="flex items-center gap-2">
                     <User size={18} className="text-accent" />
                     <span>Client: {project.client}</span>
                  </div>
               )}
               {project.date && (
                  <div className="flex items-center gap-2">
                     <Calendar size={18} className="text-accent" />
                     <span>Completed: {project.date}</span>
                  </div>
               )}
            </div>
         </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-16">
         <div className="prose prose-lg mx-auto text-gray-600 mb-16 leading-relaxed">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Project Overview</h3>
            <p>{project.description}</p>
         </div>

         {project.images && project.images.length > 0 && (
             <div className="grid grid-cols-1 gap-8">
                {project.images.map((img, idx) => (
                   <div key={idx} className="rounded-xl overflow-hidden shadow-sm bg-gray-100">
                      <img src={img} alt={`Project detail ${idx + 1}`} className="w-full h-auto" />
                   </div>
                ))}
             </div>
         )}
      </div>

      <Footer />
    </div>
  );
};

export default ProjectDetails;
