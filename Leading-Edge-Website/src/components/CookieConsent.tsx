import React, { useState, useEffect } from 'react';
import { setCookie, getCookie } from '../utils/cookieUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie } from 'lucide-react';

const CookieConsent: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = getCookie('site_consent');
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleChoice = (choice: 'accepted' | 'rejected') => {
    setCookie('site_consent', choice, 365);
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        // @ts-ignore
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="fixed bottom-0 left-0 right-0 z-[90] bg-white border-t border-gray-200 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] p-4 md:p-6"
        >
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-gray-100 rounded-full hidden md:block">
                 <Cookie className="text-gray-600" size={24} />
              </div>
              <div className="text-center md:text-left">
                <h4 className="font-bold text-gray-900 text-base mb-1">We value your privacy</h4>
                <p className="text-gray-600 text-sm max-w-2xl leading-relaxed">
                  We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic. 
                  By clicking "Accept All", you consent to our use of cookies.
                </p>
              </div>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <button 
                onClick={() => handleChoice('rejected')}
                className="flex-1 md:flex-none px-6 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Reject All
              </button>
              <button 
                onClick={() => handleChoice('accepted')}
                className="flex-1 md:flex-none px-8 py-2.5 text-sm font-bold text-white bg-primary rounded-xl hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200"
              >
                Accept All
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CookieConsent;