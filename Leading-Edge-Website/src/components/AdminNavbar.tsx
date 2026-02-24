import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut, User, LayoutDashboard, Globe, Settings } from 'lucide-react';
import { useShop } from '../context/ShopContext';

const AdminNavbar: React.FC = () => {
  const { user, logout } = useShop();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <nav className="bg-gray-900 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link to="/admin" className="flex items-center gap-2 font-bold text-xl tracking-tight">
               <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center font-serif text-white">A</div>
               <span>Admin Portal</span>
            </Link>
            
            <div className="hidden md:flex items-center space-x-4">
              <Link to="/admin" className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-800 flex items-center gap-2">
                <LayoutDashboard size={16} /> Products
              </Link>
              <Link to="/admin/content" className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-800 flex items-center gap-2">
                <Globe size={16} /> Site Content
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden md:flex items-center gap-2 text-sm text-gray-400">
                <User size={16} />
                <span>{user?.name || 'Admin'}</span>
             </div>
             <button 
               onClick={handleLogout}
               className="bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
             >
               <LogOut size={16} /> Logout
             </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default AdminNavbar;