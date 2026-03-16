import React from 'react';
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  permissionKey?: string | string[]; // Allow a single key or an array of keys (OR logic)
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, permissionKey }) => {
  const userRole = localStorage.getItem('user_role');
  
  // Superadmins bypass all checks
  if (userRole === 'superadmin') {
      return <>{children}</>;
  }

  if (!userRole) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <AccessDenied />;
  }

  if (permissionKey) {
      let userPermissions: Record<string, boolean> = {};
      try {
          userPermissions = JSON.parse(localStorage.getItem('user_permissions') || '{}');
      } catch (e) {
          userPermissions = {};
      }

      const keysToCheck = Array.isArray(permissionKey) ? permissionKey : [permissionKey];
      const hasAccess = keysToCheck.some(key => userPermissions[key] === true);

      if (!hasAccess) {
          return <AccessDenied />;
      }
  }

  return <>{children}</>;
};

const AccessDenied = () => (
    <div style={{
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        flexDirection: 'column',
        gap: '1rem',
        color: '#ef4444', 
        background: '#0f172a'
    }}>
      <h2>Access Denied</h2>
      <p style={{ color: '#94a3b8' }}>You do not have permission to view this specific tool or page.</p>
    </div>
);

export default ProtectedRoute;
