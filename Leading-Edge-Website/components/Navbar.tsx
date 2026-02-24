import React, { useState, useEffect, useRef } from 'react';
import { Search, User, ShoppingBag, Menu, X, ChevronRight, LogOut, Trash2, Plus, Minus, Check } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useShop } from '../context/ShopContext';
import { MAIN_MENU_CATEGORIES, CATEGORIES, CURRENCY } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';

const Navbar: React.FC = () => {
  const { itemCount, user, logout, cart, cartTotal, updateQuantity, removeFromCart, products } = useShop();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCartHovered, setIsCartHovered] = useState(false);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<typeof products>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Cart Toast State
  const [showCartToast, setShowCartToast] = useState(false);
  const prevItemCountRef = useRef(itemCount);

  useEffect(() => {
    // Show toast only when items increase (added to cart)
    if (itemCount > prevItemCountRef.current) {
      setShowCartToast(true);
      const timer = setTimeout(() => setShowCartToast(false), 3000);
      return () => clearTimeout(timer);
    }
    prevItemCountRef.current = itemCount;
  }, [itemCount]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      const filtered = products.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.categories.some(c => c.toLowerCase().includes(searchQuery.toLowerCase()))
      ).slice(0, 5); 
      setSearchResults(filtered);
      setShowSearchDropdown(true);
    } else {
      setSearchResults([]);
      setShowSearchDropdown(false);
    }
  }, [searchQuery, products]);

  const handleSearchSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setShowSearchDropdown(false);
      navigate(`/search?q=${searchQuery}`);
    }
  };

  const handleProfileClick = () => {
    if (user) {
      navigate('/profile');
    } else {
      navigate('/login');
    }
  };

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-100 h-16 md:h-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between gap-4">
          
          <button 
            className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-primary"
            onClick={() => setIsMenuOpen(true)}
          >
            <Menu size={24} />
          </button>

          {/* Desktop Logo */}
          <div className="flex-shrink-0 cursor-pointer hidden md:block" onClick={() => navigate('/')}>
             <img 
               src="/Logo/logo black.png" 
               alt="Leading Edge" 
               className="h-10 w-auto object-contain" 
             />
          </div>
          
          {/* Mobile Logo */}
           <div className="flex-shrink-0 cursor-pointer md:hidden" onClick={() => navigate('/')}>
             <img 
               src="/Logo/logo black.png" 
               alt="Leading Edge" 
               className="h-8 w-auto object-contain" 
             />
          </div>

          <div className="flex-1 max-w-xl mx-2 md:mx-8 relative z-50" ref={searchRef}>
            <div className="relative group">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchSubmit}
                placeholder="Search furniture..." 
                className="w-full bg-gray-50 border border-gray-200 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
              />
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-accent transition-colors" />
            </div>

            {/* Search Dropdown */}
            <AnimatePresence>
              {showSearchDropdown && (
                // @ts-ignore
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden"
                >
                  {searchResults.length > 0 ? (
                    <ul>
                      {searchResults.map(result => (
                        <li 
                          key={result.id}
                          className="px-4 py-3 hover:bg-gray-50 cursor-pointer flex items-center gap-3 border-b border-gray-50 last:border-0"
                          onClick={() => {
                            navigate(`/product/${result.id}`);
                            setShowSearchDropdown(false);
                            setSearchQuery('');
                          }}
                        >
                          <img src={result.image} alt={result.name} className="w-10 h-10 rounded object-cover" />
                          <div>
                            <p className="text-sm font-medium text-gray-800">{result.name}</p>
                            <p className="text-xs text-gray-500">{result.categories[0]}</p>
                          </div>
                        </li>
                      ))}
                      <li 
                        className="px-4 py-2 bg-gray-50 text-center text-xs text-accent font-bold cursor-pointer hover:bg-gray-100"
                        onClick={() => {
                          navigate(`/search?q=${searchQuery}`);
                          setShowSearchDropdown(false);
                        }}
                      >
                        View all results for "{searchQuery}"
                      </li>
                    </ul>
                  ) : (
                    <div className="px-4 py-3 text-sm text-gray-500">No products found.</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="hidden lg:flex items-center space-x-6">
            {MAIN_MENU_CATEGORIES.map((cat) => (
              <Link 
                key={cat} 
                to={cat === 'Sale' ? '/gallery/sale' : `/gallery/${cat}`} 
                className="text-sm font-medium text-gray-600 hover:text-accent transition-colors"
              >
                {cat}
              </Link>
            ))}
          </div>

          <div className="flex items-center space-x-3 md:space-x-5 text-gray-600 flex-shrink-0">
            <button 
              onClick={handleProfileClick}
              className="hidden md:block hover:text-accent transition-colors"
              title={user ? "Profile" : "Login"}
            >
              <User size={22} strokeWidth={1.5} />
            </button>
            {user && (
              <button 
                onClick={logout} 
                className="hidden md:block hover:text-red-500 transition-colors"
                title="Logout"
              >
                <LogOut size={20} strokeWidth={1.5} />
              </button>
            )}
            
            {/* Cart Button with Hover Preview */}
            <div 
              className="relative"
              onMouseEnter={() => setIsCartHovered(true)}
              onMouseLeave={() => setIsCartHovered(false)}
            >
              <button 
                className="relative hover:text-accent transition-colors py-2"
                onClick={() => navigate('/checkout')}
              >
                <ShoppingBag size={22} strokeWidth={1.5} />
                {itemCount > 0 && (
                  <span className="absolute top-0 -right-1 bg-accent text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center">
                    {itemCount}
                  </span>
                )}
              </button>

              {/* Add to Cart Toast - Near Icon */}
              <AnimatePresence>
                {showCartToast && (
                  // @ts-ignore
                  <motion.div
                    initial={{ opacity: 0, y: 10, x: '-50%' }}
                    animate={{ opacity: 1, y: 0, x: '-50%' }}
                    exit={{ opacity: 0, y: 10, x: '-50%' }}
                    className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs font-bold py-2 px-3 rounded-lg shadow-lg flex items-center gap-2 whitespace-nowrap z-[60]"
                  >
                    <Check size={14} className="text-green-400" />
                    Added to Cart!
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {isCartHovered && !showCartToast && (
                  // @ts-ignore
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 top-full mt-0 w-80 bg-white shadow-xl rounded-xl border border-gray-100 z-50 overflow-hidden"
                  >
                    <div className="p-4 max-h-[400px] overflow-y-auto">
                      <h3 className="font-bold text-gray-800 mb-3">Shopping Cart</h3>
                      {cart.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-4">Your cart is empty</p>
                      ) : (
                        <div className="space-y-4">
                          {cart.map(item => (
                            <div key={item.id} className="flex gap-3">
                              <img src={item.image} alt={item.name} className="w-16 h-16 rounded object-cover bg-gray-50" />
                              <div className="flex-1">
                                <h4 className="text-sm font-medium line-clamp-1">{item.name}</h4>
                                <p className="text-xs text-gray-500 mb-2">{CURRENCY}{item.onSale && item.salePrice ? item.salePrice : item.price}</p>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center border border-gray-200 rounded">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, item.quantity - 1); }}
                                      className="p-1 hover:bg-gray-100"
                                    >
                                      <Minus size={12} />
                                    </button>
                                    <span className="text-xs px-2">{item.quantity}</span>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, item.quantity + 1); }}
                                      className="p-1 hover:bg-gray-100"
                                    >
                                      <Plus size={12} />
                                    </button>
                                  </div>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }}
                                    className="text-gray-400 hover:text-red-500"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {cart.length > 0 && (
                      <div className="bg-gray-50 p-4 border-t border-gray-100">
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-sm font-medium">Subtotal</span>
                          <span className="font-bold text-primary">{CURRENCY}{cartTotal.toFixed(2)}</span>
                        </div>
                        <button 
                          onClick={() => navigate('/checkout')}
                          className="w-full bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                        >
                          Checkout
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* @ts-ignore */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/50 z-50 lg:hidden"
            />
            {/* @ts-ignore */}
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="fixed top-0 left-0 bottom-0 w-[80%] max-w-sm bg-white z-50 lg:hidden shadow-xl overflow-y-auto"
            >
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h2 className="text-lg font-bold">Menu</h2>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 text-gray-500">
                  <X size={24} />
                </button>
              </div>

              <div className="p-4">
                <div className="space-y-6">
                  <div className="flex items-center gap-4 pb-6 border-b border-gray-100">
                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center text-gray-500">
                      <User size={24} />
                    </div>
                    <div>
                      {user ? (
                         <>
                          <p className="font-medium">{user.name}</p>
                          <button onClick={() => {logout(); setIsMenuOpen(false);}} className="text-sm text-red-500 font-medium">Logout</button>
                         </>
                      ) : (
                        <>
                          <p className="font-medium">Welcome Guest</p>
                          <button onClick={() => {navigate('/login'); setIsMenuOpen(false);}} className="text-sm text-accent font-medium">Sign In / Register</button>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Shop By Room</h3>
                    <ul className="space-y-3">
                      {MAIN_MENU_CATEGORIES.map((cat) => (
                        <li key={cat}>
                          <Link 
                            to={cat === 'Sale' ? '/gallery/sale' : `/gallery/${cat}`}
                            onClick={() => setIsMenuOpen(false)}
                            className="flex items-center justify-between text-gray-700 font-medium py-1"
                          >
                            {cat} <ChevronRight size={16} className="text-gray-300" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">All Categories</h3>
                    <ul className="space-y-3">
                      {CATEGORIES.slice(0, 10).map((cat) => (
                        <li key={cat.id}>
                          <Link 
                             to={`/gallery/${cat.name}`}
                             onClick={() => setIsMenuOpen(false)}
                             className="flex items-center gap-3 py-1"
                          >
                            <img src={cat.image} alt={cat.name} className="w-8 h-8 rounded-full object-cover" />
                            <span className="text-gray-600">{cat.name}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="border-t border-gray-100 pt-6">
                     <ul className="space-y-3 text-sm text-gray-500">
                        <li><Link to="/profile" onClick={() => setIsMenuOpen(false)}>My Account</Link></li>
                        <li><Link to="/about" onClick={() => setIsMenuOpen(false)}>About Us</Link></li>
                        <li><Link to="/shipping" onClick={() => setIsMenuOpen(false)}>Shipping Policy</Link></li>
                        <li><Link to="/" onClick={() => setIsMenuOpen(false)}>Contact Us</Link></li>
                     </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;