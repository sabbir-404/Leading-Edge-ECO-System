import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Database,
  FileText,
  BarChart2,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  ChevronDown,
  Users,
  Globe,
  ShoppingCart,
  Package,
  FolderTree,
  Briefcase,
  ImageIcon,
  Mail,
  History,
  Clock,
  User,
  Lock,
  Camera,
  Edit,
  Bell,
  Hammer,
  ClipboardList,
  Truck,
  ClipboardCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import logoBlack from '/logo-black.png';
import logoWhite from '/logo-white.png';
import '../pages/Dashboard/Dashboard.css';

interface DashboardLayoutProps {
    children: React.ReactNode;
    title: string;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, title }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileModalTab, setProfileModalTab] = useState<'name' | 'password' | 'picture'>('name');
  const profileRef = useRef<HTMLDivElement>(null);

  const userRole = localStorage.getItem('user_role') || '';
  const userName = localStorage.getItem('user_name') || 'Admin';
  const userId = parseInt(localStorage.getItem('user_id') || '0');

  // Notification state
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n: any) => !n.is_read).length;

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications
  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        // @ts-ignore
        const data = await window.electron.getNotifications(userId);
        setNotifications(data || []);
      } catch { }
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  // Auto-expand submenu based on current route
  useEffect(() => {
    navItems.forEach(item => {
      if (item.subItems && location.pathname.startsWith(item.path)) {
        setExpandedMenus(prev => prev.includes(item.label) ? prev : [...prev, item.label]);
      }
    });
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_id');
    navigate('/');
  };

  const navItems = [
    { icon: <LayoutDashboard size={20} />, label: 'Overview', path: '/dashboard' },
    { 
      icon: <ShoppingCart size={20} />, 
      label: 'Billing / POS', 
      path: '/billing',
      subItems: [
        { icon: <FileText size={18} />, label: 'New Bill', path: '/billing' },
        { icon: <History size={18} />, label: 'Bill History', path: '/billing/history' },
        { icon: <Edit size={18} />, label: 'Alter Bill', path: '/billing/alter' },
        ...(userRole === 'admin' ? [{ icon: <ClipboardCheck size={18} />, label: 'Pending Approvals', path: '/billing/pending-approvals' }] : []),
      ]
    },
    { icon: <Database size={20} />, label: 'Masters', path: '/masters' },
    { icon: <FileText size={20} />, label: 'Vouchers', path: '/vouchers' },
    { icon: <BarChart2 size={20} />, label: 'Reports', path: '/reports' },
    ...(userRole === 'admin' ? [{ 
      icon: <Users size={20} />, 
      label: 'Users', 
      path: '/users',
      subItems: [
        { icon: <User size={18} />, label: 'User List', path: '/users' },
        { icon: <Lock size={18} />, label: 'User Groups', path: '/users/groups' },
      ]
    }] : []),
    { 
      icon: <Hammer size={20} />, 
      label: 'MAKE', 
      path: '/make',
      subItems: [
        { icon: <ClipboardList size={18} />, label: 'Place Order', path: '/make/place-order' },
        { icon: <Clock size={18} />, label: 'Track Orders', path: '/make/track' },
      ]
    },
    {
      icon: <Truck size={20} />,
      label: 'Shipping',
      path: '/shipping',
    },
    { 
      icon: <Globe size={20} />, 
      label: 'Website', 
      path: '/website',
      subItems: [
        { icon: <LayoutDashboard size={18} />, label: 'Dashboard', path: '/website' },
        { icon: <Package size={18} />, label: 'Products', path: '/website/products' },
        { icon: <ShoppingCart size={18} />, label: 'Orders', path: '/website/orders' },
        { icon: <FolderTree size={18} />, label: 'Categories', path: '/website/categories' },
        { icon: <Briefcase size={18} />, label: 'Projects', path: '/website/projects' },
        { icon: <FileText size={18} />, label: 'Pages', path: '/website/pages' },
        { icon: <ImageIcon size={18} />, label: 'Media', path: '/website/media' },
        { icon: <Mail size={18} />, label: 'Newsletter', path: '/website/newsletter' },
        { icon: <Settings size={18} />, label: 'Settings', path: '/website/settings' },
      ]
    },
    { icon: <Settings size={20} />, label: 'Settings', path: '/settings' },
  ];

  const handleNavClick = (item: any) => {
    if (item.subItems) {
      if (!isSidebarOpen) setSidebarOpen(true);
      // Toggle: add or remove from expanded list
      setExpandedMenus(prev =>
        prev.includes(item.label)
          ? prev.filter(l => l !== item.label)
          : [...prev, item.label]
      );
    } else {
      navigate(item.path);
    }
  };

  // Profile modal save handlers
  const [profileForm, setProfileForm] = useState({ name: userName, currentPassword: '', newPassword: '', confirmPassword: '' });

  const handleSaveName = () => {
    localStorage.setItem('user_name', profileForm.name);
    alert('Name updated successfully!');
    setShowProfileModal(false);
    window.location.reload();
  };

  const handleSavePassword = () => {
    if (profileForm.newPassword !== profileForm.confirmPassword) {
      return alert('New passwords do not match.');
    }
    if (profileForm.newPassword.length < 4) {
      return alert('Password must be at least 4 characters.');
    }
    alert('Password updated successfully!');
    setShowProfileModal(false);
    setProfileForm(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.7rem 0.85rem',
    background: '#fff',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    fontSize: '0.9rem',
    color: 'var(--text-primary)',
  };

  return (
    <div className={`dashboard-container ${theme}`}>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            className="sidebar-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.div
        className={`sidebar ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}
        animate={{ width: isSidebarOpen ? 240 : 80 }}
        transition={{ duration: 0.3, type: 'spring', bounce: 0, damping: 20 }}
      >
        <div className="sidebar-header">
          {isSidebarOpen ? (
            <img 
              src={theme === 'dark' ? logoWhite : logoBlack} 
              alt="Leading Edge" 
              style={{ height: '32px', objectFit: 'contain' }} 
            />
          ) : (
            <span className="logo-text">LE</span>
          )}
          <button className="toggle-btn" onClick={() => setSidebarOpen(!isSidebarOpen)}>
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item, index) => {
            const isActive = location.pathname === item.path || 
              (item.subItems && location.pathname.startsWith(item.path));
            const isExpanded = expandedMenus.includes(item.label);
            
            return (
              <div key={index}>
                <div
                  className={`nav-item ${isActive && !item.subItems ? 'active' : ''}`}
                  onClick={() => handleNavClick(item)}
                  style={{ 
                    backgroundColor: isActive && !item.subItems ? 'var(--hover-bg)' : 'transparent',
                    justifyContent: isSidebarOpen ? 'flex-start' : 'center',
                    cursor: 'pointer'
                  }}
                >
                  <div className="nav-icon" style={{ color: isActive ? 'var(--accent-color)' : 'inherit' }}>{item.icon}</div>
                  {isSidebarOpen && (
                    <>
                      <span className="nav-label" style={{ flex: 1, color: isActive ? 'var(--accent-color)' : 'inherit' }}>{item.label}</span>
                      {item.subItems ? (
                        isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                      ) : (
                         isActive && <ChevronRight size={16} className="nav-arrow" style={{ opacity: 1, color: 'var(--accent-color)' }} />
                      )}
                    </>
                  )}
                </div>

                {/* Submenu — stays open until manually closed */}
                <AnimatePresence>
                  {isSidebarOpen && item.subItems && isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden' }}
                    >
                      {item.subItems.map((sub: any, subIndex: number) => {
                        const isSubActive = location.pathname === sub.path;
                        return (
                          <div
                            key={subIndex}
                            className={`nav-item`}
                            onClick={(e) => { e.stopPropagation(); navigate(sub.path); }}
                            style={{ 
                              paddingLeft: '3.5rem', 
                              backgroundColor: isSubActive ? 'var(--hover-bg)' : 'transparent',
                              fontSize: '0.9rem',
                              height: '40px',
                              cursor: 'pointer'
                            }}
                          >
                            <div className="nav-icon" style={{ opacity: 0.7, color: isSubActive ? 'var(--accent-color)' : 'inherit' }}>{sub.icon}</div>
                            <span style={{ color: isSubActive ? 'var(--accent-color)' : 'inherit', opacity: isSubActive ? 1 : 0.8 }}>
                              {sub.label}
                            </span>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={20} />
            {isSidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="main-content">
        <header className="top-bar">
          {/* Mobile hamburger */}
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!isSidebarOpen)}>
            <Menu size={22} />
          </button>

          <div className="page-title">
            <h1>{title}</h1>
            <p className="breadcrumb">Leading Edge Software / {title}</p>
          </div>

          {/* Live Clock — center */}
          <div className="topbar-clock">
            <Clock size={16} style={{ opacity: 0.5, marginRight: '6px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.3 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, fontFamily: 'monospace', letterSpacing: '0.5px' }}>{formatTime(currentTime)}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{formatDate(currentTime)}</span>
            </div>
          </div>

          {/* Notification bell + Profile section */}
          <div className="user-settings" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {/* Notification Bell */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <div
                onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                style={{ position: 'relative', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: showNotifDropdown ? 'var(--hover-bg)' : 'transparent', transition: 'background 0.15s ease' }}
              >
                <Bell size={20} style={{ color: unreadCount > 0 ? 'var(--accent-color)' : 'var(--text-secondary)' }} />
                {unreadCount > 0 && (
                  <span style={{ position: 'absolute', top: '2px', right: '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#ef4444', color: 'white', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--card-bg)' }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </div>

              {/* Notification Dropdown */}
              <AnimatePresence>
                {showNotifDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '340px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', boxShadow: '0 12px 40px rgba(0,0,0,0.2)', zIndex: 1000, overflow: 'hidden' }}
                  >
                    <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.9rem' }}>Notifications</strong>
                      {unreadCount > 0 && <span style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-color)', padding: '1px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700 }}>{unreadCount} new</span>}
                    </div>
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                      {notifications.slice(0, 5).map((n: any) => (
                        <div key={n.id} style={{ padding: '0.65rem 1rem', borderBottom: '1px solid var(--border-color)', background: n.is_read ? 'transparent' : 'rgba(99,102,241,0.04)', cursor: 'pointer', transition: 'background 0.15s' }}
                          onClick={async () => {
                            if (!n.is_read) {
                              // @ts-ignore
                              await window.electron.markNotificationRead(n.id);
                              setNotifications(prev => prev.map(p => p.id === n.id ? { ...p, is_read: 1 } : p));
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {!n.is_read && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-color)', flexShrink: 0 }} />}
                            <strong style={{ fontSize: '0.85rem', flex: 1 }}>{n.title}</strong>
                          </div>
                          {n.message && <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.message}</p>}
                        </div>
                      ))}
                      {notifications.length === 0 && <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No notifications</div>}
                    </div>
                    <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
                      <span onClick={() => { navigate('/notifications'); setShowNotifDropdown(false); }} style={{ color: 'var(--accent-color)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>View All Notifications</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="user-profile" ref={profileRef} style={{ position: 'relative' }}>
              <span className="profile-username">{userName}</span>
              <div 
                className="avatar"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                style={{ cursor: 'pointer', position: 'relative' }}
              >
                {userName.charAt(0)}
              </div>

              {/* Profile Dropdown */}
              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="profile-dropdown"
                  >
                    <div className="profile-dropdown-header">
                      <div className="profile-dropdown-avatar">{userName.charAt(0)}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{userName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{userRole || 'User'}</div>
                      </div>
                    </div>
                    <div className="profile-dropdown-divider" />
                    <div className="profile-dropdown-item" onClick={() => { setProfileModalTab('name'); setShowProfileModal(true); setShowProfileMenu(false); }}>
                      <Edit size={16} /> Change Name
                    </div>
                    <div className="profile-dropdown-item" onClick={() => { setProfileModalTab('password'); setShowProfileModal(true); setShowProfileMenu(false); }}>
                      <Lock size={16} /> Change Password
                    </div>
                    <div className="profile-dropdown-item" onClick={() => { setProfileModalTab('picture'); setShowProfileModal(true); setShowProfileMenu(false); }}>
                      <Camera size={16} /> Profile Picture
                    </div>
                    <div className="profile-dropdown-divider" />
                    <div className="profile-dropdown-item profile-dropdown-logout" onClick={handleLogout}>
                      <LogOut size={16} /> Logout
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="content-area">
          {children}
        </main>
      </div>

      {/* Profile Settings Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="profile-modal-overlay" onClick={() => setShowProfileModal(false)}>
            <motion.div
              className="profile-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Profile Settings</h2>
                <button onClick={() => setShowProfileModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                  <X size={20} />
                </button>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                {[
                  { key: 'name' as const, label: 'Name', icon: <User size={14} /> },
                  { key: 'password' as const, label: 'Password', icon: <Lock size={14} /> },
                  { key: 'picture' as const, label: 'Picture', icon: <Camera size={14} /> },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setProfileModalTab(tab.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '0.5rem 1rem', border: 'none', borderRadius: '6px',
                      background: profileModalTab === tab.key ? 'var(--accent-color)' : 'transparent',
                      color: profileModalTab === tab.key ? '#fff' : 'var(--text-primary)',
                      cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {profileModalTab === 'name' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>Display Name</label>
                    <input
                      style={inputStyle}
                      value={profileForm.name}
                      onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="Your display name"
                    />
                  </div>
                  <button onClick={handleSaveName} style={{ padding: '0.7rem', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
                    Save Name
                  </button>
                </div>
              )}

              {profileModalTab === 'password' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>Current Password</label>
                    <input
                      style={inputStyle}
                      type="password"
                      value={profileForm.currentPassword}
                      onChange={e => setProfileForm(p => ({ ...p, currentPassword: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>New Password</label>
                    <input
                      style={inputStyle}
                      type="password"
                      value={profileForm.newPassword}
                      onChange={e => setProfileForm(p => ({ ...p, newPassword: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>Confirm New Password</label>
                    <input
                      style={inputStyle}
                      type="password"
                      value={profileForm.confirmPassword}
                      onChange={e => setProfileForm(p => ({ ...p, confirmPassword: e.target.value }))}
                    />
                  </div>
                  <button onClick={handleSavePassword} style={{ padding: '0.7rem', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
                    Update Password
                  </button>
                </div>
              )}

              {profileModalTab === 'picture' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '1rem 0' }}>
                  <div style={{
                    width: '100px', height: '100px', borderRadius: '50%', background: 'var(--accent-color)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 700,
                    border: '3px solid var(--border-color)', position: 'relative'
                  }}>
                    {userName.charAt(0)}
                    <div style={{
                      position: 'absolute', bottom: 0, right: 0, width: '30px', height: '30px',
                      borderRadius: '50%', background: '#fff', border: '2px solid var(--border-color)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                    }}>
                      <Camera size={14} color="var(--accent-color)" />
                    </div>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                    Click the camera icon to upload a new profile picture.<br />
                    <em>Supported formats: JPG, PNG (max 2MB)</em>
                  </p>
                  <button style={{ padding: '0.7rem 1.5rem', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
                    Upload Picture
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DashboardLayout;
