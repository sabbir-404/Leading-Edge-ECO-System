import React from 'react';
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const userRole = localStorage.getItem('user_role');

  if (!userRole) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return (
      <div style={{
          height: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          color: '#ef4444', 
          background: '#0f172a'
      }}>
        <h2>Access Denied: You do not have permission to view this page.</h2>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
