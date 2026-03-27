import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, User, Eye, EyeOff, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import logoBlack from '../../assets/logo-black.png';
import logoWhite from '../../assets/logo-white.png';
import './Login.css';

interface LoginProps {
  onLoginSuccess?: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const existingToken = localStorage.getItem('supabase_admin_key');
    const existingLicense = localStorage.getItem('app_license_key');
    // BUG-19: Only redirect to /setup if setup keys are completely absent.
    // Users with stale/expired keys see a login error, not an unexpected redirect.
    if (!existingToken && !existingLicense) {
        navigate('/setup');
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // @ts-ignore
      const result = await window.electron.authenticateUser({ username: email, password });
      setLoading(false);
      if (result?.success && result.user) {
        localStorage.setItem('user', JSON.stringify(result.user));
        localStorage.setItem('user_role', result.user.role);
        // BUG-10 fix: always serialize permissions as a proper JSON string.
        // The backend now returns an object, but guard against legacy string responses.
        const permsRaw = result.user.permissions;
        const permsStr = (typeof permsRaw === 'object' && permsRaw !== null)
            ? JSON.stringify(permsRaw)
            : (typeof permsRaw === 'string' ? permsRaw : '{}');
        localStorage.setItem('user_permissions', permsStr);
        localStorage.setItem('user_name', result.user.full_name || result.user.username);
        localStorage.setItem('user_id', String(result.user.id));
        if (result.licenseWarning) {
            localStorage.setItem('license_warning', result.licenseWarning);
        } else {
            localStorage.removeItem('license_warning');
        }

        if (result.offlineMode) {
            showToast('Offline login — limited features', 'warning');
        } else {
            showToast('Login successful', 'success');
        }

        navigate('/dashboard');
        onLoginSuccess?.();
      } else {
        setError(result?.error || 'Invalid credentials');
      }
    } catch (err) {
      setLoading(false);
      setError('Login failed. Please try again.');
    }
  };

  return (
    <div className={`login-container ${theme}`}>
      <div className="login-backdrop">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
      </div>

      <motion.div 
        className="login-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="theme-toggle" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </div>

        <div className="login-header">
          <img 
            src={theme === 'dark' ? logoWhite : logoBlack} 
            alt="Leading Edge" 
            className="login-logo" 
          />
          <h1>Welcome Back</h1>
          <p>Sign in to access LE SOFT</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          {error && <div className="error-message">{error}</div>}

          <div className="input-group">
            <User size={20} className="input-icon" />
            <input 
              type="text" 
              placeholder="Email / Username" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <Lock size={20} className="input-icon" />
            <input 
              type={showPassword ? "text" : "password"} 
              placeholder="Password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button 
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <motion.button 
            type="submit" 
            className="login-btn"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={loading}
          >
            {loading ? <span className="loader"></span> : 'Sign In'}
          </motion.button>
        </form>

        <div className="login-footer">
          <p>Protected by <strong>Leading Edge Security</strong></p>
          <p className="version">v1.0.0 (Build 2026)</p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
