
import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const ScrollManager = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const scrollPositions = useRef<Record<string, number>>({});

  // Save scroll position before leaving or on scroll (throttled)
  useEffect(() => {
    const saveScroll = () => {
      const currentPath = location.pathname;
      const scrollY = window.scrollY;
      scrollPositions.current[currentPath] = scrollY;
      sessionStorage.setItem('scroll_positions', JSON.stringify(scrollPositions.current));
    };

    // Debounce scroll event to save performance
    let timeoutId: any;
    const handleScroll = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(saveScroll, 100);
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
        window.removeEventListener('scroll', handleScroll);
        saveScroll(); // Save one last time on unmount/change
    };
  }, [location.pathname]);

  // Restore or Reset Scroll on Route Change
  useEffect(() => {
    // Load stored positions on mount
    try {
        const stored = sessionStorage.getItem('scroll_positions');
        if (stored) {
            scrollPositions.current = JSON.parse(stored);
        }
    } catch (e) {}

    if (navType === 'POP') {
      // Back button pressed - restore position
      const savedPosition = scrollPositions.current[location.pathname];
      if (savedPosition !== undefined) {
        // Use a small timeout to allow React to render initial content
        // For heavy async pages, you might need a Layout effect or checking if data loaded, 
        // but this covers 90% of cases better than native which fails if height changed.
        setTimeout(() => {
            window.scrollTo(0, savedPosition);
        }, 50);
      }
    } else {
      // New navigation (PUSH/REPLACE) - reset to top
      window.scrollTo(0, 0);
    }
  }, [location.pathname, navType]);

  return null;
};

export default ScrollManager;