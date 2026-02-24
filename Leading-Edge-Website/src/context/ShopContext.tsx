
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Product, CartItem, User, Order, SiteConfig, ShippingArea, ShippingMethod, CustomPage, DashboardStats, NewsletterCampaign, Catalogue, ToastMessage, Category, Project, SearchResult, AuditLogEntry } from '../types';
import { INITIAL_SITE_CONFIG, INITIAL_SHIPPING_AREAS, INITIAL_SHIPPING_METHODS, INITIAL_PAGES, MOCK_STATS, INITIAL_PROJECTS } from '../constants';
import { api } from '../services/api';
import { setCookie, getCookie, eraseCookie } from '../utils/cookieUtils';
import { hasPermission, Permission, setGroupPermissionsCache } from '../utils/permissionUtils';

interface ShopContextType {
  products: Product[];
  categories: Category[];
  projects: Project[];
  cart: CartItem[];
  user: User | null;
  users: User[]; 
  orders: Order[]; 
  siteConfig: SiteConfig;
  customPages: CustomPage[];
  shippingAreas: ShippingArea[];
  shippingMethods: ShippingMethod[];
  dashboardStats: DashboardStats;
  auditLogs: AuditLogEntry[];
  newsletters: NewsletterCampaign[];
  toasts: ToastMessage[];
  addToCart: (product: Product, variation?: any) => void;
  removeFromCart: (productId: string, variationId?: string) => void;
  updateQuantity: (productId: string, quantity: number, variationId?: string) => void;
  clearCart: () => void;
  cartTotal: number;
  itemCount: number;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => void;
  checkPermission: (permission: Permission) => boolean;
  performGlobalSearch: (query: string) => Promise<SearchResult[]>;
  addProduct: (product: Product) => void;
  updateProduct: (product: Product) => void;
  deleteProduct: (productId: string) => void;
  deleteProductsBulk: (productIds: string[]) => void;
  updateProductsStatusBulk: (productIds: string[], isVisible: boolean) => void;
  addCategory: (category: Category) => void;
  updateCategory: (category: Category) => void;
  deleteCategory: (categoryId: string) => void;
  reorderCategories: (orderedIds: string[]) => void;
  addProject: (project: Project) => void;
  updateProject: (project: Project) => void;
  deleteProject: (projectId: string) => void;
  updateSiteConfig: (config: SiteConfig) => void;
  addCatalogue: (catalogue: Catalogue) => void;
  updateCatalogue: (catalogue: Catalogue) => void;
  deleteCatalogue: (catalogueId: string) => void;
  addPage: (page: CustomPage) => void;
  updatePage: (page: CustomPage) => void;
  deletePage: (pageId: string) => void;
  updateShippingAreas: (areas: ShippingArea[]) => void;
  updateShippingMethods: (methods: ShippingMethod[]) => void;
  addUser: (user: User) => void;
  updateUser: (user: User) => void;
  updateOrder: (order: Order) => void;
  createOrder: (order: Order) => void;
  sendNewsletter: (campaign: NewsletterCampaign) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  dismissToast: (id: string) => void;
  isLoading: boolean;
}

const ShopContext = createContext<ShopContextType | undefined>(undefined);

export const ShopProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [isLoading, setIsLoading] = useState(true);

  // Shopping State
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Auth State - Initialize from Cookie or LocalStorage
  const [user, setUser] = useState<User | null>(() => {
    try {
      const cookieUser = getCookie('furniture_user');
      if (cookieUser) return JSON.parse(decodeURIComponent(cookieUser));
      
      const storedUser = localStorage.getItem('furniture_user');
      return storedUser ? JSON.parse(storedUser) : null;
    } catch (error) {
      return null;
    }
  });
  
  // Admin Data States
  const [users, setUsers] = useState<User[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [siteConfig, setSiteConfig] = useState<SiteConfig>(INITIAL_SITE_CONFIG);
  const [customPages, setCustomPages] = useState<CustomPage[]>(INITIAL_PAGES);
  const [shippingAreas, setShippingAreas] = useState<ShippingArea[]>(INITIAL_SHIPPING_AREAS);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>(INITIAL_SHIPPING_METHODS);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>(MOCK_STATS);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [newsletters, setNewsletters] = useState<NewsletterCampaign[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Initial Data Fetch
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [prodData, catData, userData, projData, configData, pagesData, ordersData, statsData, logsData, shipAreas, shipMethods, newsData] = await Promise.all([
          api.getProducts().catch(err => []), 
          api.getCategories().catch(err => []),
          api.getUsers().catch(err => []),
          api.getProjects().catch(err => []),
          api.getConfig().catch(err => {}),
          api.getPages().catch(err => []),
          api.getOrders().catch(err => []),
          api.getStats().catch(err => MOCK_STATS),
          api.getAuditLogs().catch(err => []),
          api.getShippingAreas().catch(err => []),
          api.getShippingMethods().catch(err => []),
          api.getNewsletters().catch(err => [])
        ]);

        if (prodData.length > 0) setProducts(prodData);
        if (catData.length > 0) setCategories(catData);
        if (userData.length > 0) setUsers(userData);
        if (projData.length > 0) setProjects(projData);
        if (configData && Object.keys(configData).length > 0) setSiteConfig(configData);
        if (pagesData.length > 0) setCustomPages(pagesData);
        if (ordersData.length > 0) setOrders(ordersData);
        if (statsData) setDashboardStats(statsData);
        if (logsData) setAuditLogs(logsData);
        if (shipAreas.length > 0) setShippingAreas(shipAreas);
        if (shipMethods.length > 0) setShippingMethods(shipMethods);
        if (newsData.length > 0) setNewsletters(newsData);

        // Load user groups into permission cache
        try {
          const groupsData = await api.getUserGroups().catch(() => []);
          if (groupsData.length > 0) setGroupPermissionsCache(groupsData);
        } catch (e) { /* non-critical */ }
        
      } catch (error) {
        console.error("Failed to fetch initial data", error);
        showToast("Backend connection failed. Using cached/mock data where available.", "error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => dismissToast(id), 5000); 
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Cart Logic
  const addToCart = (product: Product, variation?: any) => {
    setCart((prev) => {
      const existing = prev.find((item) => {
        const sameId = item.id === product.id;
        const sameVariation = variation 
          ? item.selectedVariation?.id === variation.id 
          : !item.selectedVariation;
        return sameId && sameVariation;
      });

      if (existing) {
        return prev.map((item) => {
          const sameId = item.id === product.id;
          const sameVariation = variation 
            ? item.selectedVariation?.id === variation.id 
            : !item.selectedVariation;
          return (sameId && sameVariation) ? { ...item, quantity: item.quantity + 1 } : item;
        });
      }
      return [...prev, { ...product, quantity: 1, selectedVariation: variation }];
    });
  };

  const updateQuantity = (productId: string, quantity: number, variationId?: string) => {
    if (quantity < 1) {
      removeFromCart(productId, variationId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        const sameId = item.id === productId;
        const sameVariation = variationId ? item.selectedVariation?.id === variationId : !item.selectedVariation;
        return (sameId && sameVariation) ? { ...item, quantity: quantity } : item;
      })
    );
  };

  const removeFromCart = (productId: string, variationId?: string) => {
    setCart((prev) => prev.filter((item) => {
      const sameId = item.id === productId;
      const sameVariation = variationId ? item.selectedVariation?.id === variationId : !item.selectedVariation;
      return !(sameId && sameVariation);
    }));
  };

  const clearCart = () => setCart([]);

  const cartTotal = cart.reduce((sum, item) => {
    let price = item.price;
    if (item.selectedVariation) {
      if (item.onSale && item.selectedVariation.salePrice) price = item.selectedVariation.salePrice;
      else if (item.selectedVariation.price) price = item.selectedVariation.price;
      else if (item.onSale && item.salePrice) price = item.salePrice;
    } else {
       if (item.onSale && item.salePrice) price = item.salePrice;
    }
    return sum + price * item.quantity;
  }, 0);
  
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Auth Logic
  const login = async (email: string, password?: string) => {
    try {
      const response = await api.login(email, password);
      const { token, user: userData } = response;
      
      if (token) {
          localStorage.setItem('furniture_token', token);
      }
      
      setUser(userData);
      localStorage.setItem('furniture_user', JSON.stringify(userData));
      setCookie('furniture_user', encodeURIComponent(JSON.stringify(userData)), 7); 
      showToast('Logged in successfully', 'success');
    } catch (e: any) {
      showToast(e.message || 'Login failed', 'error');
      throw e;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('furniture_user');
    localStorage.removeItem('furniture_token');
    eraseCookie('furniture_user');
    showToast('Logged out', 'info');
  };

  const checkPermission = (permission: Permission) => {
      return hasPermission(user, permission);
  };

  const performGlobalSearch = async (query: string) => {
      try {
          return await api.globalSearch(query);
      } catch (e) {
          console.error(e);
          return [];
      }
  };

  // --- CRUD Operations ---

  const addProduct = async (product: Product) => {
    try {
        const newProduct = { ...product, id: product.id || `PROD-${Date.now()}` };
        await api.createProduct(newProduct);
        setProducts(prev => [...prev, newProduct]);
        showToast('Product saved to database', 'success');
    } catch (e: any) {
        showToast(`Failed to save: ${e.message}`, 'error');
    }
  };
  
  const updateProduct = async (product: Product) => {
    try {
        await api.updateProduct(product);
        setProducts(prev => prev.map(p => p.id === product.id ? product : p));
        showToast('Product updated successfully', 'success');
    } catch (e: any) {
        showToast(`Failed to update: ${e.message}`, 'error');
    }
  };

  const deleteProduct = async (productId: string) => {
    try {
        await api.deleteProduct(productId);
        setProducts(prev => prev.filter(p => p.id !== productId));
        showToast('Product deleted from database', 'info');
    } catch (e: any) {
        showToast(`Failed to delete: ${e.message}`, 'error');
    }
  };

  const deleteProductsBulk = (productIds: string[]) => {
    setProducts(prev => prev.filter(p => !productIds.includes(p.id)));
    productIds.forEach(id => api.deleteProduct(id).catch(console.error));
    showToast(`${productIds.length} products deleted`, 'info');
  };

  const updateProductsStatusBulk = (productIds: string[], isVisible: boolean) => {
    setProducts(prev => prev.map(p => {
        if (productIds.includes(p.id)) {
            const updated = { ...p, isVisible };
            api.updateProduct(updated).catch(console.error);
            return updated;
        }
        return p;
    }));
    showToast('Statuses updated', 'success');
  };

  // Categories
  const addCategory = async (category: Category) => {
    try {
        await api.createCategory(category);
        setCategories(prev => [...prev, category]);
        showToast('Category saved', 'success');
    } catch (e: any) {
        showToast(`Failed to save category: ${e.message}`, 'error');
    }
  };

  const updateCategory = async (category: Category) => {
    try {
        await api.updateCategory(category);
        setCategories(prev => prev.map(c => c.id === category.id ? category : c));
        showToast('Category updated', 'success');
    } catch (e: any) {
        showToast(`Failed to update category: ${e.message}`, 'error');
    }
  };

  const deleteCategory = async (categoryId: string) => {
    try {
        await api.deleteCategory(categoryId);
        setCategories(prev => prev.filter(c => c.id !== categoryId));
        showToast('Category deleted', 'info');
    } catch (e: any) {
        showToast(`Failed to delete category: ${e.message}`, 'error');
    }
  };

  const reorderCategories = (orderedIds: string[]) => {
    setCategories(prev => {
        const newCats = [...prev];
        orderedIds.forEach((id, index) => {
            const found = newCats.find(c => c.id === id);
            if (found) {
                found.order = index;
                api.updateCategory(found).catch(console.error); 
            }
        });
        return newCats;
    });
  };

  // User Actions
  const addUser = async (user: User) => {
    try {
      await api.createUser(user);
      setUsers(prev => [...prev, user]);
      showToast('User created successfully', 'success');
    } catch (e: any) {
      showToast(`Failed to create user: ${e.message}`, 'error');
    }
  };

  const updateUser = async (user: User) => {
    try {
      await api.updateUser(user);
      setUsers(prev => prev.map(u => u.id === user.id ? user : u));
      showToast('User updated successfully', 'success');
    } catch (e: any) {
      showToast(`Failed to update user: ${e.message}`, 'error');
    }
  };

  // Projects
  const addProject = async (project: Project) => {
    try {
        await api.createProject(project);
        setProjects(prev => [...prev, project]);
        showToast('Project saved', 'success');
    } catch (e: any) {
        showToast(e.message, 'error');
    }
  };

  const updateProject = async (project: Project) => {
    try {
        await api.updateProject(project);
        setProjects(prev => prev.map(p => p.id === project.id ? project : p));
        showToast('Project updated', 'success');
    } catch (e: any) {
        showToast(e.message, 'error');
    }
  };

  const deleteProject = async (projectId: string) => {
    try {
        await api.deleteProject(projectId);
        setProjects(prev => prev.filter(p => p.id !== projectId));
        showToast('Project deleted', 'info');
    } catch (e: any) {
        showToast(e.message, 'error');
    }
  };
  
  // Other Settings
  const updateSiteConfig = async (config: SiteConfig) => {
    try {
        await api.updateConfig(config);
        setSiteConfig(config);
        showToast('Configuration saved', 'success');
    } catch (e: any) {
        showToast(e.message, 'error');
    }
  };

  const addCatalogue = (catalogue: Catalogue) => {
    const newConfig = { ...siteConfig, catalogues: [...siteConfig.catalogues, catalogue] };
    updateSiteConfig(newConfig);
  };
  const updateCatalogue = (catalogue: Catalogue) => {
    const newConfig = { ...siteConfig, catalogues: siteConfig.catalogues.map(c => c.id === catalogue.id ? catalogue : c) };
    updateSiteConfig(newConfig);
  };
  const deleteCatalogue = (catalogueId: string) => {
    const newConfig = { ...siteConfig, catalogues: siteConfig.catalogues.filter(c => c.id !== catalogueId) };
    updateSiteConfig(newConfig);
  };
  
  const addPage = async (page: CustomPage) => {
    try {
        await api.createPage(page);
        setCustomPages(prev => [...prev, page]);
        showToast('Page created', 'success');
    } catch (e: any) { showToast(e.message, 'error'); }
  };
  const updatePage = async (page: CustomPage) => {
    try {
        await api.updatePage(page);
        setCustomPages(prev => prev.map(p => p.id === page.id ? page : p));
        showToast('Page updated', 'success');
    } catch (e: any) { showToast(e.message, 'error'); }
  };
  const deletePage = async (pageId: string) => {
    try {
        await api.deletePage(pageId);
        setCustomPages(prev => prev.filter(p => p.id !== pageId));
        showToast('Page deleted', 'info');
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  const updateShippingAreas = async (areas: ShippingArea[]) => {
      try {
          await api.updateShippingAreas(areas);
          setShippingAreas(areas);
          showToast('Shipping areas saved', 'success');
      } catch (e: any) { showToast(e.message, 'error'); }
  };
  const updateShippingMethods = async (methods: ShippingMethod[]) => {
      try {
          await api.updateShippingMethods(methods);
          setShippingMethods(methods);
          showToast('Shipping methods saved', 'success');
      } catch (e: any) { showToast(e.message, 'error'); }
  };

  const updateOrder = async (order: Order) => {
    try {
        await api.updateOrder(order);
        setOrders(prev => prev.map(o => o.id === order.id ? order : o));
        showToast('Order updated', 'success');
    } catch (e: any) { showToast(e.message, 'error'); }
  };
  
  const createOrder = async (order: Order) => {
    try {
      await api.createOrder(order);
      setOrders(prev => [order, ...prev]);
      setDashboardStats(prev => ({
          ...prev,
          totalOrdersMonth: prev.totalOrdersMonth + 1,
          revenueMonth: prev.revenueMonth + order.total
      }));
      clearCart();
      showToast('Order created successfully', 'success');
    } catch (e: any) {
      showToast(`Failed to create order: ${e.message}`, 'error');
    }
  };

  const sendNewsletter = async (campaign: NewsletterCampaign) => {
    try {
        await api.sendNewsletter(campaign);
        setNewsletters(prev => [campaign, ...prev]);
        showToast('Newsletter sent', 'success');
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  return (
    <ShopContext.Provider value={{ 
      products, categories, projects, cart, user, users, orders, siteConfig, customPages, shippingAreas, shippingMethods,
      dashboardStats, auditLogs, newsletters, toasts, isLoading,
      addToCart, removeFromCart, updateQuantity, clearCart, 
      login, logout, 
      checkPermission, performGlobalSearch,
      addProduct, updateProduct, deleteProduct, deleteProductsBulk, updateProductsStatusBulk,
      addCategory, updateCategory, deleteCategory, reorderCategories,
      addProject, updateProject, deleteProject,
      updateSiteConfig,
      addCatalogue, updateCatalogue, deleteCatalogue,
      addPage, updatePage, deletePage,
      updateShippingAreas, updateShippingMethods,
      addUser, updateUser,
      updateOrder, createOrder,
      sendNewsletter,
      showToast, dismissToast,
      cartTotal, itemCount 
    }}>
      {children}
    </ShopContext.Provider>
  );
};

export const useShop = () => {
  const context = useContext(ShopContext);
  if (!context) throw new Error('useShop must be used within a ShopProvider');
  return context;
};
