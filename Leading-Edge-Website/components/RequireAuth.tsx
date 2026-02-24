import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useShop } from '../context/ShopContext';

interface RequireAuthProps {
  children: React.ReactElement;
  adminOnly?: boolean;
}

const RequireAuth: React.FC<RequireAuthProps> = ({ children, adminOnly = false }) => {
  const { user } = useShop();
  const location = useLocation();

  if (!user) {
    if (adminOnly) {
         // Redirect to Admin Login if trying to access admin route
         return <Navigate to="/admin/login" state={{ from: location }} replace />;
    }
    // Redirect to normal login for other routes
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default RequireAuth;