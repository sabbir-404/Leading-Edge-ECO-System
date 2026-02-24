import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShop } from '../context/ShopContext';
import { Link } from 'react-router-dom';

const HeroSlider: React.FC = () => {
  const { siteConfig } = useShop();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (siteConfig.heroSlides.length === 0) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % siteConfig.heroSlides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [siteConfig.heroSlides.length]);

  if (siteConfig.heroSlides.length === 0) return null;

  const currentSlide = siteConfig.heroSlides[current];

  // Alignment styles
  const getAlignmentStyles = (align: string) => {
    switch(align) {
        case 'left-top': return 'items-start justify-start p-10 md:p-20 text-left';
        case 'left-bottom': return 'items-end justify-start p-10 md:p-20 text-left';
        case 'right-top': return 'items-start justify-end p-10 md:p-20 text-right';
        case 'right-bottom': return 'items-end justify-end p-10 md:p-20 text-right';
        case 'center': default: return 'items-center justify-center p-8 text-center';
    }
  };

  return (
    <div className="w-full bg-white">
      <div className="relative w-full aspect-video md:aspect-[21/9] lg:h-[600px] lg:aspect-auto overflow-hidden">
        <AnimatePresence mode="wait">
          {/* @ts-ignore */}
          <motion.div
            key={current}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="absolute inset-0"
          >
            <img 
              src={currentSlide.image} 
              alt={currentSlide.title} 
              className="w-full h-full object-cover"
            />
            <div className={`absolute inset-0 bg-black/30 flex ${getAlignmentStyles(currentSlide.alignment)}`}>
               <div className="max-w-xl text-white">
                  {/* @ts-ignore */}
                  <motion.h2 
                    initial={{ y: 20, opacity: 0 }} 
                    animate={{ y: 0, opacity: 1 }} 
                    className="text-3xl md:text-6xl font-serif font-bold mb-4 drop-shadow-md"
                  >
                     {currentSlide.title}
                  </motion.h2>
                  {/* @ts-ignore */}
                  <motion.p 
                    initial={{ y: 20, opacity: 0 }} 
                    animate={{ y: 0, opacity: 1 }} 
                    transition={{ delay: 0.2 }}
                    className="text-lg md:text-xl font-light opacity-90 drop-shadow-md mb-8"
                  >
                     {currentSlide.subtitle}
                  </motion.p>
                  
                  {currentSlide.buttonText && currentSlide.buttonLink && (
                     // @ts-ignore
                     <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.4 }}
                     >
                        <Link 
                            to={currentSlide.buttonLink}
                            className="inline-block bg-white text-primary px-8 py-3 font-bold uppercase tracking-widest hover:bg-accent hover:text-white transition-colors"
                        >
                            {currentSlide.buttonText}
                        </Link>
                     </motion.div>
                  )}
               </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default HeroSlider;