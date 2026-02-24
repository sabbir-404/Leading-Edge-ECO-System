import React from 'react';
import { useNavigate, Link, useLocation, Outlet } from 'react-router-dom';
import { LogOut, User, LayoutDashboard, Globe, Truck, FileText, Users, ShoppingCart, Mail, BookOpen, BarChart3, LayoutTemplate } from 'lucide-react';
import { useShop } from '../context/ShopContext';

const AdminLayout: React.FC = () => {
  const { user, logout } = useShop();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
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
           
           <Link to="/admin" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <BarChart3 size={20} /> Dashboard
           </Link>

           <p className="px-3 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 mt-6">Management</p>
           
           <Link to="/admin/products" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin/products') || isActive('/admin/product') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <LayoutDashboard size={20} /> Products
           </Link>
           
           <Link to="/admin/orders" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin/orders') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <ShoppingCart size={20} /> Orders
           </Link>

           <Link to="/admin/users" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/admin/users') ? 'bg-accent text-white font-medium' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <Users size={20} /> Users & Roles
           </Link>

           <p className="px-3 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 mt-6">Marketing & Content</p>

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
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
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