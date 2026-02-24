import React, { useState } from 'react';
import { MessageCircle, Phone, Mail, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

const FloatingContact: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  // Hide on admin portal
  if (location.pathname.startsWith('/admin')) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-4">
      <AnimatePresence>
        {isOpen && (
          // @ts-ignore
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="bg-white rounded-2xl shadow-xl p-4 border border-gray-100 w-64 mb-2 origin-bottom-right"
          >
            <div className="flex justify-between items-center mb-4">
               <h4 className="font-bold text-gray-800">Contact Us</h4>
               <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
            </div>
            <div className="space-y-3">
               <a href="tel:+8801700000000" className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors group">
                  <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-colors">
                     <Phone size={16} />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Call Us</span>
               </a>
               <a href="mailto:support@leadingedge.com" className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors group">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                     <Mail size={16} />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Email Us</span>
               </a>
               <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <p className="text-xs text-gray-500">Chatbot coming soon!</p>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button 
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${isOpen ? 'bg-gray-800 text-white rotate-90' : 'bg-accent text-white hover:scale-110'}`}
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={28} />}
      </button>
    </div>
  );
};

export default FloatingContact;