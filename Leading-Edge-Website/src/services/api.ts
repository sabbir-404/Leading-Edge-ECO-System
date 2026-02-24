
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const headers = {
  'Content-Type': 'application/json',
};

const getHeaders = () => {
  const token = localStorage.getItem('furniture_token');
  const h: Record<string, string> = { ...headers };
  if (token) {
    h['Authorization'] = `Bearer ${token}`;
  }
  // Legacy: Keep passing x-admin-email for now if needed by legacy logs, but the server now uses req.user
  const userStr = localStorage.getItem('furniture_user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (user.role !== 'customer') {
        // @ts-ignore
        h['x-admin-email'] = user.email;
      }
    } catch (e) { }
  }
  return h;
};

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorData = await response.json();
      // Look for 'message' (standard) or 'error' (legacy)
      errorMessage = errorData.message || errorData.error || errorMessage || 'An unknown error occurred';
    } catch (e) {
      // If JSON parse fails, try text
      const textError = await response.text().catch(() => '');
      if (textError) errorMessage = textError;
    }
    throw new Error(errorMessage);
  }
  return response.json();
};

export const api = {
  // Stats & Logs & Search
  getStats: () => fetch(`${API_URL}/stats`, { headers: getHeaders() }).then(handleResponse),
  getAuditLogs: () => fetch(`${API_URL}/audit-logs`, { headers: getHeaders() }).then(handleResponse),
  globalSearch: (query: string) => fetch(`${API_URL}/admin/search?q=${query}`, { headers: getHeaders() }).then(handleResponse),

  // Gallery
  getImages: () => fetch(`${API_URL}/admin/images`, { headers: getHeaders() }).then(handleResponse),
  getImageUsage: (url: string) => fetch(`${API_URL}/admin/image-usage?url=${encodeURIComponent(url)}`, { headers: getHeaders() }).then(handleResponse),

  // File Upload
  uploadImage: async (file: File, context?: 'product' | 'project', name?: string) => {
    const formData = new FormData();
    formData.append('image', file);
    if (context) formData.append('context', context);
    if (name) formData.append('name', name);

    // Build auth headers without Content-Type (browser auto-sets for FormData)
    const authHeaders: Record<string, string> = {};
    const token = localStorage.getItem('furniture_token');
    if (token) authHeaders['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      headers: authHeaders,
      body: formData
    });
    return handleResponse(response);
  },

  // Products
  getProducts: () => fetch(`${API_URL}/products`, { headers }).then(handleResponse),
  getProduct: (id: string) => fetch(`${API_URL}/products/${id}`, { headers }).then(handleResponse),
  createProduct: (product: any) => fetch(`${API_URL}/products`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(product) }).then(handleResponse),
  updateProduct: (product: any) => fetch(`${API_URL}/products/${product.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(product) }).then(handleResponse),
  deleteProduct: (id: string) => fetch(`${API_URL}/products/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),

  // Categories
  getCategories: () => fetch(`${API_URL}/categories`, { headers }).then(handleResponse),
  createCategory: (category: any) => fetch(`${API_URL}/categories`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(category) }).then(handleResponse),
  updateCategory: (category: any) => fetch(`${API_URL}/categories/${category.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(category) }).then(handleResponse),
  deleteCategory: (id: string) => fetch(`${API_URL}/categories/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),

  // Users
  getUsers: () => fetch(`${API_URL}/users`, { headers: getHeaders() }).then(handleResponse),
  createUser: (user: any) => fetch(`${API_URL}/users`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(user) }).then(handleResponse),
  updateUser: (user: any) => fetch(`${API_URL}/users/${user.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(user) }).then(handleResponse),

  // Projects
  getProjects: () => fetch(`${API_URL}/projects`, { headers }).then(handleResponse),
  createProject: (project: any) => fetch(`${API_URL}/projects`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(project) }).then(handleResponse),
  updateProject: (project: any) => fetch(`${API_URL}/projects/${project.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(project) }).then(handleResponse),
  deleteProject: (id: string) => fetch(`${API_URL}/projects/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),

  // Config
  getConfig: () => fetch(`${API_URL}/config`, { headers }).then(handleResponse),
  updateConfig: (config: any) => fetch(`${API_URL}/config`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(config) }).then(handleResponse),

  // Pages
  getPages: () => fetch(`${API_URL}/pages`, { headers }).then(handleResponse),
  createPage: (page: any) => fetch(`${API_URL}/pages`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(page) }).then(handleResponse),
  updatePage: (page: any) => fetch(`${API_URL}/pages/${page.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(page) }).then(handleResponse),
  deletePage: (id: string) => fetch(`${API_URL}/pages/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),

  // Orders
  getOrders: () => fetch(`${API_URL}/orders`, { headers: getHeaders() }).then(handleResponse),
  createOrder: (orderData: any) => fetch(`${API_URL}/orders`, { method: 'POST', headers, body: JSON.stringify(orderData) }).then(handleResponse),
  updateOrder: (order: any) => fetch(`${API_URL}/orders/${order.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(order) }).then(handleResponse),

  // Shipping
  getShippingAreas: () => fetch(`${API_URL}/shipping/areas`, { headers: getHeaders() }).then(handleResponse),
  updateShippingAreas: (areas: any[]) => fetch(`${API_URL}/shipping/areas`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(areas) }).then(handleResponse),
  getShippingMethods: () => fetch(`${API_URL}/shipping/methods`, { headers: getHeaders() }).then(handleResponse),
  updateShippingMethods: (methods: any[]) => fetch(`${API_URL}/shipping/methods`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(methods) }).then(handleResponse),

  // Newsletters
  getNewsletters: () => fetch(`${API_URL}/newsletters`, { headers: getHeaders() }).then(handleResponse),
  sendNewsletter: (data: any) => fetch(`${API_URL}/newsletters`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),

  // Auth
  login: (email: string, password?: string) => fetch(`${API_URL}/auth/login`, { method: 'POST', headers, body: JSON.stringify({ email, password }) }).then(handleResponse),

  // User Groups
  getUserGroups: () => fetch(`${API_URL}/user-groups`, { headers: getHeaders() }).then(handleResponse),
  createUserGroup: (group: any) => fetch(`${API_URL}/user-groups`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(group) }).then(handleResponse),
  updateUserGroup: (group: any) => fetch(`${API_URL}/user-groups/${group.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(group) }).then(handleResponse),
  deleteUserGroup: (id: string) => fetch(`${API_URL}/user-groups/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),
};
