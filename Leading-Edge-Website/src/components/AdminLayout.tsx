
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation, Outlet } from 'react-router-dom';
import { LogOut, User, LayoutDashboard, Globe, Truck, FileText, Users, ShoppingCart, Mail, BookOpen, BarChart3, LayoutTemplate, Layers, Briefcase, Search, Image as ImageIcon, Shield } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { SearchResult } from '../types';

const AdminLayout: React.FC = () => {
  const { user, logout, performGlobalSearch } = useShop();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  };

  // Search Debounce Logic
  useEffect(() => {
      const timer = setTimeout(async () => {
          if (searchQuery.length >= 2) {
              const results = await performGlobalSearch(searchQuery);
              setSearchResults(results);
              setShowResults(true);
          } else {
              setSearchResults([]);
              setShowResults(false);
          }
      }, 300);
      return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside to close search
  useEffect(() => {
      const handleClick = (e: MouseEvent) => {
          if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
              setShowResults(false);
          }
      };
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleResultClick = (result: SearchResult) => {
      setShowResults(false);
      setSearchQuery('');
      switch(result.type) {
          case 'product': navigate(`/admin/product/${result.id}`); break;
          case 'order': navigate(`/admin/orders`); break; 
          case 'user': navigate(`/admin/users`); break; 
          case 'page': navigate(`/admin/pages`); break;
      }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Fixed Sidebar */}
      <div className="w-64 bg-gray-900 text-white flex-shrink-0 flex flex-col fixed h-full z-20 overflow-y-auto">
        <div className="h-16 flex items-center px-6 border-b border-gray-800">
           {/* Logo */}
           <img 
               src="/Logo/logo black.png" 
               alt="Leading Edge" 
               className="h-8 w-auto object-contain invert brightness-0 saturate-100 filter" 
           />
        </div>

        <div className="flex-1 py-6 px-3 space-y-1">
           <p className="px-3 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Overview</p>
           
           <Link to="/admin" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin') && location.pathname === '/admin' ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <BarChart3 size={20} /> Dashboard
           </Link>

           <p className="px-3 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 mt-6">Management</p>
           
           <Link to="/admin/products" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin/products') || isActive('/admin/product') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <LayoutDashboard size={20} /> Products
           </Link>

           <Link to="/admin/categories" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin/categories') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <Layers size={20} /> Categories
           </Link>
           
           <Link to="/admin/projects" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin/projects') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <Briefcase size={20} /> Projects
           </Link>

           <Link to="/admin/orders" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin/orders') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <ShoppingCart size={20} /> Orders
           </Link>

           <Link to="/admin/users" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin/users') && !isActive('/admin/user-groups') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <Users size={20} /> Users & Roles
           </Link>

           <Link to="/admin/user-groups" className={`flex items-center gap-3 px-3 py-2.5 pl-8 rounded-lg transition-colors text-sm ${isActive('/admin/user-groups') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <Shield size={16} /> User Groups
           </Link>

           <p className="px-3 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 mt-6">Marketing & Content</p>

           <Link to="/admin/gallery" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin/gallery') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <ImageIcon size={20} /> Media Gallery
           </Link>

           <Link to="/admin/content" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin/content') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <Globe size={20} /> Home Page
           </Link>

           <Link to="/admin/header-footer" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin/header-footer') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <LayoutTemplate size={20} /> Header & Footer
           </Link>

           <Link to="/admin/catalogues" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin/catalogues') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <BookOpen size={20} /> Catalogues
           </Link>

           <Link to="/admin/pages" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin/pages') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <FileText size={20} /> Pages
           </Link>

           <Link to="/admin/newsletter" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin/newsletter') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <Mail size={20} /> Newsletter
           </Link>

           <Link to="/admin/shipping" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin/shipping') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <Truck size={20} /> Shipping
           </Link>
        </div>

        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-4 px-2">
             <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                <User size={16} />
             </div>
             <div>
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
             </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 ml-64 flex flex-col min-w-0">
         {/* Top Admin Navbar */}
         <header className="h-16 bg-white shadow-sm border-b border-gray-200 flex items-center justify-between px-8 sticky top-0 z-10">
             <h2 className="font-bold text-gray-700 capitalize">
                {location.pathname === '/admin' ? 'Dashboard' : location.pathname.split('/')[2]?.replace('-', ' ')}
             </h2>
             
             {/* Global Search Bar */}
             <div className="flex-1 max-w-lg mx-8 relative" ref={searchRef}>
                 <div className="relative">
                     <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                     <input 
                        type="text" 
                        placeholder="Search products, orders, users..."
                        className="w-full pl-10 pr-4 py-2 border rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                     />
                 </div>
                 
                 {showResults && searchResults.length > 0 && (
                     <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
                         <div className="py-2">
                             {searchResults.map((result) => (
                                 <div 
                                    key={`${result.type}-${result.id}`} 
                                    onClick={() => handleResultClick(result)}
                                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b last:border-0 border-gray-50"
                                 >
                                     <div className="flex justify-between items-center">
                                         <div>
                                             <div className="font-medium text-gray-800 text-sm">{result.title}</div>
                                             {result.subtitle && <div className="text-xs text-gray-500">{result.subtitle}</div>}
                                         </div>
                                         <span className="text-[10px] uppercase font-bold bg-gray-100 text-gray-500 px-2 py-1 rounded">{result.type}</span>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     </div>
                 )}
             </div>

             <div className="flex items-center gap-4">
               <Link to="/" className="text-sm text-gray-500 hover:text-accent flex items-center gap-1">View Store <Globe size={14}/></Link>
             </div>
         </header>

         <main className="p-8">
            <Outlet />
         </main>
      </div>
    </div>
  );
};

export default AdminLayout;
