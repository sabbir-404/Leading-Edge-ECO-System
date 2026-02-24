import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { CATALOGUES } from '../constants';
import { ArrowLeft, Download } from 'lucide-react';

const CatalogueViewer: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const catalogue = CATALOGUES.find(c => c.id === id);

  if (!catalogue) return <div className="text-center py-20">Catalogue not found</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="bg-primary text-white py-12">
        <div className="max-w-7xl mx-auto px-4">
           <button 
             onClick={() => navigate('/')}
             className="flex items-center text-gray-400 hover:text-white mb-6 transition-colors"
           >
             <ArrowLeft size={16} className="mr-2" /> Back to Home
           </button>
           <h1 className="text-3xl md:text-5xl font-serif font-bold mb-2">{catalogue.title}</h1>
           <p className="text-gray-400 text-lg">{catalogue.season}</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* PDF Viewer Placeholder */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200 mb-8">
           <div className="aspect-[16/9] md:aspect-[A4] w-full bg-gray-200 relative group">
              {/* Using an iframe to simulate PDF viewing. In a real app, this would be a real PDF URL */}
              <iframe 
                src={catalogue.pdfUrl} 
                className="w-full h-full"
                title={catalogue.title}
              />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/5">
                  <span className="bg-black/70 text-white px-4 py-2 rounded text-sm">PDF Viewer Simulation</span>
              </div>
           </div>
           <div className="p-8">
              <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                 <div>
                    <h3 className="text-xl font-bold mb-4">Description</h3>
                    <p className="text-gray-600 leading-relaxed max-w-2xl">{catalogue.description}</p>
                 </div>
                 <button className="flex items-center gap-2 bg-accent text-white px-6 py-3 rounded-lg font-bold hover:bg-orange-600 transition-colors shadow-md">
                    <Download size={20} /> Download PDF
                 </button>
              </div>
           </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default CatalogueViewer;