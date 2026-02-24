import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';

const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useShop();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Mock admin validation
    if (email.includes('admin')) {
      login(email);
      navigate('/admin');
    } else {
      setError('Invalid admin credentials');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700">
        <div className="p-8">
          <div className="flex justify-center mb-6">
            <div className="bg-gray-700 p-4 rounded-full">
              <Lock className="text-accent" size={32} />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-white mb-2">Admin Portal</h2>
          <p className="text-gray-400 text-center mb-8">Secure Access Only</p>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-2 rounded text-sm text-center">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Admin Email</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white focus:outline-none focus:border-accent placeholder-gray-500"
                placeholder="admin@leadingedge.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white focus:outline-none focus:border-accent placeholder-gray-500"
                placeholder="••••••••"
                required
              />
            </div>
            <button 
              type="submit" 
              className="w-full bg-accent text-white py-3 rounded-lg font-bold hover:bg-orange-600 transition-colors"
            >
              Access Dashboard
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <button onClick={() => navigate('/')} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              Return to Store
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;