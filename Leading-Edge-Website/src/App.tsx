
import React from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Home from './pages/Home';
import ProductDetails from './pages/ProductDetails';
import CategoryGallery from './pages/CategoryGallery';
import SearchResults from './pages/SearchResults';
import CatalogueViewer from './pages/CatalogueViewer';
import ProjectsGallery from './pages/ProjectsGallery';
import ProjectDetails from './pages/ProjectDetails';
import Checkout from './pages/Checkout';
import About from './pages/About';
import Shipping from './pages/Shipping';
import Returns from './pages/Returns';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import AdminLogin from './pages/AdminLogin';
import AdminProductEditor from './pages/AdminProductEditor';
import AdminCategories from './pages/AdminCategories';
import AdminProjects from './pages/AdminProjects';
import AdminContent from './pages/AdminContent';
import AdminShipping from './pages/AdminShipping';
import AdminPages from './pages/AdminPages';
import AdminUsers from './pages/AdminUsers';
import AdminUserGroups from './pages/AdminUserGroups';
import AdminOrders from './pages/AdminOrders';
import AdminDashboard from './pages/AdminDashboard';
import AdminCatalogues from './pages/AdminCatalogues';
import AdminNewsletter from './pages/AdminNewsletter';
import AdminHeaderFooter from './pages/AdminHeaderFooter';
import AdminGallery from './pages/AdminGallery';
import RequireAuth from './components/RequireAuth';
import AdminLayout from './components/AdminLayout';
import ToastContainer from './components/ToastContainer';
import FloatingContact from './components/FloatingContact';
import CookieConsent from './components/CookieConsent';
import ScrollManager from './components/ScrollManager';
import { ShopProvider } from './context/ShopContext';

const PageTransition = ({ children }: { children: React.ReactNode }) => {
  return (
    // @ts-ignore
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
};

const AnimatedRoutes = () => {
  const location = useLocation();

  const isAdmin = location.pathname.startsWith('/admin') && location.pathname !== '/admin/login';

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={isAdmin ? 'admin-root' : location.pathname}>
        <Route path="/" element={<PageTransition><Home /></PageTransition>} />
        <Route path="/gallery/:category" element={<PageTransition><CategoryGallery /></PageTransition>} />
        <Route path="/search" element={<PageTransition><SearchResults /></PageTransition>} />
        <Route path="/catalogue/:id" element={<PageTransition><CatalogueViewer /></PageTransition>} />
        <Route path="/product/:id" element={<PageTransition><ProductDetails /></PageTransition>} />
        <Route path="/projects" element={<PageTransition><ProjectsGallery /></PageTransition>} />
        <Route path="/projects/:id" element={<PageTransition><ProjectDetails /></PageTransition>} />
        <Route path="/checkout" element={<PageTransition><Checkout /></PageTransition>} />
        
        <Route path="/about" element={<PageTransition><About /></PageTransition>} />
        <Route path="/shipping" element={<PageTransition><Shipping /></PageTransition>} />
        <Route path="/returns" element={<PageTransition><Returns /></PageTransition>} />
        
        <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
        <Route path="/profile" element={<PageTransition><Profile /></PageTransition>} />
        <Route path="/admin/login" element={<PageTransition><AdminLogin /></PageTransition>} />
        
        <Route path="/admin" element={<RequireAuth adminOnly><AdminLayout /></RequireAuth>}>
           <Route index element={<AdminDashboard />} />
           <Route path="products" element={<Admin />} />
           <Route path="product/:id" element={<AdminProductEditor />} />
           <Route path="categories" element={<AdminCategories />} />
           <Route path="projects" element={<AdminProjects />} />
           <Route path="content" element={<AdminContent />} />
           <Route path="pages" element={<AdminPages />} />
           <Route path="shipping" element={<AdminShipping />} />
           <Route path="users" element={<AdminUsers />} />
           <Route path="user-groups" element={<AdminUserGroups />} />
           <Route path="orders" element={<AdminOrders />} />
           <Route path="catalogues" element={<AdminCatalogues />} />
           <Route path="newsletter" element={<AdminNewsletter />} />
           <Route path="header-footer" element={<AdminHeaderFooter />} />
           <Route path="gallery" element={<AdminGallery />} />
        </Route>
      </Routes>
    </AnimatePresence>
  );
};

const App: React.FC = () => {
  return (
    <ShopProvider>
      <Router>
        <ScrollManager />
        <AnimatedRoutes />
        <FloatingContact />
        <CookieConsent />
        <ToastContainer />
      </Router>
    </ShopProvider>
  );
};

export default App;
