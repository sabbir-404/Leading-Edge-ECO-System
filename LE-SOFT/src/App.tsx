import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
const Login = lazy(() => import('./pages/Auth/Login'));
const SetupScreen = lazy(() => import('./pages/Auth/SetupScreen'));
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'));
const Masters = lazy(() => import('./pages/Masters'));
const Vouchers = lazy(() => import('./pages/Vouchers'));
const CreateCompany = lazy(() => import('./pages/Company/CreateCompany'));
import './index.css';

// Accounting Masters
const GroupList = lazy(() => import('./pages/Accounting/Masters/GroupList'));
const GroupCreate = lazy(() => import('./pages/Accounting/Masters/GroupCreate'));
const LedgerList = lazy(() => import('./pages/Accounting/Masters/LedgerList'));
const LedgerCreate = lazy(() => import('./pages/Accounting/Masters/LedgerCreate'));
const SupplierManagement = lazy(() => import('./pages/Accounting/Masters/SupplierManagement'));
const SupplierLedgerDetail = lazy(() => import('./pages/Accounting/Masters/SupplierLedgerDetail'));
// Inventory Masters
const UnitList = lazy(() => import('./pages/Inventory/Masters/UnitList'));
const UnitCreate = lazy(() => import('./pages/Inventory/Masters/UnitCreate'));
const StockGroupList = lazy(() => import('./pages/Inventory/Masters/StockGroupList'));
const StockGroupCreate = lazy(() => import('./pages/Inventory/Masters/StockGroupCreate'));
const StockItemList = lazy(() => import('./pages/Inventory/Masters/StockItemList'));
const StockItemCreate = lazy(() => import('./pages/Inventory/Masters/StockItemCreate'));
const ProductList = lazy(() => import('./pages/Inventory/Masters/ProductList'));
const ProductCreate = lazy(() => import('./pages/Inventory/Masters/ProductCreate'));
const ProductLedger = lazy(() => import('./pages/Inventory/Masters/ProductLedger'));
const ProductModelRules = lazy(() => import('./pages/Inventory/Masters/ProductModelRules'));
const ProductAttributes = lazy(() => import('./pages/Inventory/Masters/ProductAttributes'));
const DamagedGoods = lazy(() => import('./pages/Inventory/Masters/DamagedGoods'));
const PurchaseRequisitions = lazy(() => import('./pages/Inventory/Masters/PurchaseRequisitions'));

// Master Stubs
const VoucherTypes = lazy(() => import('./pages/Stubs/VoucherTypes'));
const Currencies = lazy(() => import('./pages/Stubs/Currencies'));
const Godowns = lazy(() => import('./pages/Stubs/Godowns'));

// Vouchers
const VoucherList = lazy(() => import('./pages/Accounting/Vouchers/VoucherList'));
const VoucherEntry = lazy(() => import('./pages/Accounting/Vouchers/VoucherEntry'));
const PurchaseBillList = lazy(() => import('./pages/Accounting/Vouchers/PurchaseBillList'));
const PurchaseBillCreate = lazy(() => import('./pages/Accounting/Vouchers/PurchaseBillCreate'));

// Users
const UserList = lazy(() => import('./pages/Users/UserList'));
const UserCreate = lazy(() => import('./pages/Users/UserCreate'));
const UserGroupList = lazy(() => import('./pages/Users/UserGroupList'));
const UserGroupCreate = lazy(() => import('./pages/Users/UserGroupCreate'));
const ActiveUsers = lazy(() => import('./pages/Users/ActiveUsers'));
const PermissionLevels = lazy(() => import('./pages/Users/PermissionLevels'));

// Notifications
const Notifications = lazy(() => import('./pages/Notifications/Notifications'));

// Settings
const Settings = lazy(() => import('./pages/Settings/Settings'));
import MakeTutorial from './components/tutorial/MakeTutorial';

// Website Admin
const WebsiteDashboard = lazy(() => import('./pages/Website/WebsiteDashboard'));
const WebsiteProducts = lazy(() => import('./pages/Website/WebsiteProducts'));
const WebsiteOrders = lazy(() => import('./pages/Website/WebsiteOrders'));
const WebsiteCategories = lazy(() => import('./pages/Website/WebsiteCategories'));
const WebsiteProjects = lazy(() => import('./pages/Website/WebsiteProjects'));
const WebsitePages = lazy(() => import('./pages/Website/WebsitePages'));
const WebsiteMedia = lazy(() => import('./pages/Website/WebsiteMedia'));
const WebsiteNewsletter = lazy(() => import('./pages/Website/WebsiteNewsletter'));
const WebsiteSettings = lazy(() => import('./pages/Website/WebsiteSettings'));

// Billing
const Billing = lazy(() => import('./pages/Billing/Billing'));
const BillHistory = lazy(() => import('./pages/Billing/BillHistory'));
const AlterBill = lazy(() => import('./pages/Billing/AlterBill'));
const PendingAlterations = lazy(() => import('./pages/Billing/PendingAlterations'));


// Shipping
const ShippingDashboard = lazy(() => import('./pages/Shipping/ShippingDashboard'));

// MAKE Module
const PlaceOrder = lazy(() => import('./pages/Make/PlaceOrder'));
const TrackOrders = lazy(() => import('./pages/Make/TrackOrders'));
const MakeDashboard = lazy(() => import('./pages/Make/MakeDashboard'));
const MakeProductCatalog = lazy(() => import('./pages/Make/MakeProductCatalog'));
const MakeCostingRequests = lazy(() => import('./pages/Make/MakeCostingRequests'));


// Reports
const Reports = lazy(() => import('./pages/Reports/Reports'));
const TrialBalance = lazy(() => import('./pages/Reports/TrialBalance'));
const BalanceSheet = lazy(() => import('./pages/Reports/BalanceSheet'));
const ProfitAndLoss = lazy(() => import('./pages/Reports/ProfitAndLoss'));
const StockSummary = lazy(() => import('./pages/Reports/StockSummary'));
const DayBook = lazy(() => import('./pages/Reports/DayBook'));
const MarketAnalysis = lazy(() => import('./pages/Reports/MarketAnalysis'));
const ProductHistoryReport = lazy(() => import('./pages/Reports/ProductHistoryReport'));

// HRM Module
const HRMDashboard = lazy(() => import('./pages/HRM/HRMDashboard'));
const HRMEmployees = lazy(() => import('./pages/HRM/HRMEmployees'));
const HRMAttendance = lazy(() => import('./pages/HRM/HRMAttendance'));
const HRMLeaves = lazy(() => import('./pages/HRM/HRMLeaves'));
const HRMPayroll = lazy(() => import('./pages/HRM/HRMPayroll'));
const HRMHolidays = lazy(() => import('./pages/HRM/HRMHolidays'));

// CRM Module
const CRMDirectory = lazy(() => import('./pages/CRM/CRMDirectory'));
const CRMProgress = lazy(() => import('./pages/CRM/CRMProgress'));
const CustomerLedgerList = lazy(() => import('./pages/CRM/CustomerLedgerList'));
const CustomerLedgerDetail = lazy(() => import('./pages/CRM/CustomerLedgerDetail'));
const ExchangeOrders = lazy(() => import('./pages/CRM/ExchangeOrders'));
const ExchangeCreate = lazy(() => import('./pages/CRM/ExchangeCreate'));

// Quotation Module
const QuotationList = lazy(() => import('./pages/Quotation/QuotationList'));
const QuotationCreate = lazy(() => import('./pages/Quotation/QuotationCreate'));
const QuotationPreview = lazy(() => import('./pages/Quotation/QuotationPreview'));

const Email = lazy(() => import('./pages/Email/Email'));
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
const LicenseGate = lazy(() => import('./pages/Auth/LicenseGate'));
import UpdateBanner from './components/UpdateBanner';
import { ToastProvider } from './context/ToastContext';
import { NetworkProvider } from './context/NetworkContext';

import AppLoadingScreen from './components/AppLoadingScreen';
import { useIdleLogout } from './hooks/useIdleLogout';
import IdleWarningModal from './components/IdleWarningModal';

// Error Boundary for the whole app
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("App Crash:", error, errorInfo);
    try {
      (window as any).electron?.reportClientError?.({
        error: error || 'React ErrorBoundary caught error',
        source: 'renderer',
        severity: 'fatal',
        operation: 'REACT_ERROR_BOUNDARY',
        metadata: { componentStack: errorInfo?.componentStack }
      });
    } catch {}
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', background: '#1e293b', color: '#f8fafc', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
          <h1 style={{ color: '#ef4444' }}>Something went wrong</h1>
          <pre style={{ background: '#0f172a', padding: '1rem', borderRadius: '8px', overflow: 'auto' }}>
            {this.state.error?.toString() || 'Unknown Error'}
          </pre>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [isAppReady, setIsAppReady] = useState(false);

  useKeyboardShortcuts({
    'Escape': () => {
      // If we're at /dashboard or /, don't go back further
      if (location.pathname !== '/dashboard' && location.pathname !== '/') {
        navigate(-1);
      }
    },
    'Alt+d': () => navigate('/dashboard'),
    'Alt+s': () => navigate('/settings'),
    'Alt+b': () => navigate('/billing'),
    'Alt+h': () => navigate('/billing/history'),
  });

  const isAuthPage = location.pathname === '/' || location.pathname === '/login' || location.pathname === '/setup';

  // Auto-logout on idle — clears ALL session keys to prevent stale state (BUG-02 fix)
  const handleAutoLogout = () => {
    const keepKeys = ['app_license_key', 'supabase_admin_key', 'barcode_sticker_size', 'barcode_printer', 'auto_logout_enabled', 'auto_logout_minutes', 'theme'];
    const keysToKeep = Object.keys(localStorage).filter((key) => keepKeys.includes(key) || key.startsWith('print_page_size_')).reduce((acc, key) => {
      const val = localStorage.getItem(key);
      if (val !== null) acc[key] = val;
      return acc;
    }, {} as Record<string, string>);

    localStorage.clear();
    sessionStorage.clear();

    Object.entries(keysToKeep).forEach(([k, v]) => localStorage.setItem(k, v));
    
    // Also notify main process if needed
    if ((window as any).electron?.clearSession) {
      (window as any).electron.clearSession();
    }
    
    navigate('/');
  };

  const { showWarning, countdown, stayLoggedIn } = useIdleLogout(handleAutoLogout, !isAuthPage);

  useEffect(() => {
    // Listen for redirect signals from main process (e.g., first-launch network setup)
    if (!(window as any).electron?.onRedirect) return;
    const cleanup = (window as any).electron.onRedirect((path: string) => {
      navigate(path);
    });
    return () => cleanup?.();
  }, [navigate]);

  // Watchdog ping-pong heartbeat response to main process
  useEffect(() => {
    if (window.electron?.onWatchdogPing) {
      const cleanup = window.electron.onWatchdogPing(() => {
        window.electron?.sendWatchdogPong?.();
      });
      return () => cleanup?.();
    }
  }, []);

  // License gate state
  const [licenseChecked, setLicenseChecked] = useState(false);
  const [isLicensed, setIsLicensed] = useState(false);

  useEffect(() => {
    if (!(window as any).electron?.checkLicense) {
        setIsLicensed(true);
        setLicenseChecked(true);
        return;
    }

    (window as any).electron.checkLicense().then((result: any) => {
      setIsLicensed(result?.valid === true);
      setLicenseChecked(true);
    }).catch(() => {
      // If license check fails (e.g., in dev mode), allow access
      setIsLicensed(true);
      setLicenseChecked(true);
    });
  }, []);

  // Show loading while checking license
  if (!licenseChecked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#94a3b8', fontFamily: "'Inter', sans-serif" }}>
        <p>Initializing...</p>
      </div>
    );
  }

  // Show license gate if not licensed
  if (!isLicensed) {
    return <LicenseGate onActivated={() => setIsLicensed(true)} />;
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <NetworkProvider>
        <UpdateBanner />
        <IdleWarningModal show={showWarning} countdown={countdown} onStay={stayLoggedIn} />
        
        {/* Render the unified loading screen over the protected routes until the offline cache is fully warmed up */}
        {!isAuthPage && !isAppReady && (
            <AppLoadingScreen onReady={() => setIsAppReady(true)} />
        )}

        <Suspense fallback={<div role="status" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Loading page…</div>}>
        <Routes>
        <Route path="/" element={<Login onLoginSuccess={() => setIsAppReady(false)} />} />
        <Route path="/login" element={<Login onLoginSuccess={() => setIsAppReady(false)} />} />
        <Route path="/setup" element={<SetupScreen />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

        {/* Masters & Sub Routes */}
        <Route path="/masters" element={<ProtectedRoute><Masters /></ProtectedRoute>}>
           <Route path="groups" element={<GroupList />} />
           <Route path="groups/create" element={<GroupCreate />} />
           <Route path="ledgers" element={<LedgerList />} />
           <Route path="ledgers/create" element={<LedgerCreate />} />
           <Route path="suppliers" element={<SupplierManagement />} />
           <Route path="suppliers/ledger/:id" element={<SupplierLedgerDetail />} />
           <Route path="voucher-types" element={<VoucherTypes />} />
           <Route path="currencies" element={<Currencies />} />

           {/* Inventory */}
           <Route path="units" element={<UnitList />} />
           <Route path="units/create" element={<UnitCreate />} />
           <Route path="stock-groups" element={<StockGroupList />} />
           <Route path="stock-groups/create" element={<StockGroupCreate />} />
           <Route path="stock-items" element={<StockItemList />} />
           <Route path="stock-items/create" element={<StockItemCreate />} />
           <Route path="products" element={<ProductList />} />
           <Route path="products/create" element={<ProductCreate />} />
           <Route path="products/:id/ledger" element={<ProductLedger />} />
           <Route path="product-model-rules" element={<ProductModelRules />} />
           <Route path="product-attributes" element={<ProductAttributes />} />
           <Route path="damaged-goods" element={<DamagedGoods />} />
          <Route path="purchase-requisitions" element={<PurchaseRequisitions />} />
           <Route path="godowns" element={<Godowns />} />
        </Route>

        {/* Vouchers */}
        <Route path="/vouchers" element={<ProtectedRoute><Vouchers /></ProtectedRoute>}>
            <Route index element={<VoucherList />} />
            <Route path="create" element={<VoucherEntry />} />
            <Route path="purchase-bill" element={<PurchaseBillList />} />
            <Route path="purchase-bill/create" element={<PurchaseBillCreate />} />
        </Route>

        {/* Reports */}
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>}>
            <Route path="trial-balance" element={<TrialBalance />} />
            <Route path="balance-sheet" element={<BalanceSheet />} />
            <Route path="profit-and-loss" element={<ProfitAndLoss />} />
            <Route path="stock-summary" element={<StockSummary />} />
            <Route path="day-book" element={<DayBook />} />
            <Route path="market-analysis" element={<MarketAnalysis />} />
            <Route path="product-history" element={<ProductHistoryReport />} />
        </Route>

        {/* Users */}
        <Route path="/users" element={<ProtectedRoute><UserList /></ProtectedRoute>} />
        <Route path="/users/create" element={<ProtectedRoute><UserCreate /></ProtectedRoute>} />
        <Route path="/users/groups" element={<ProtectedRoute><UserGroupList /></ProtectedRoute>} />
        <Route path="/users/groups/create" element={<ProtectedRoute><UserGroupCreate /></ProtectedRoute>} />
        <Route path="/users/active" element={<ProtectedRoute><ActiveUsers /></ProtectedRoute>} />

        {/* Notifications */}
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />

        {/* Email System */}
        <Route path="/email" element={<ProtectedRoute><Email /></ProtectedRoute>} />

        {/* Settings */}
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

        {/* Website Admin */}
        <Route path="/website" element={<ProtectedRoute><WebsiteDashboard /></ProtectedRoute>} />

        {/* MAKE Module */}
        <Route path="/make" element={<Navigate to="/make/dashboard" replace />} />
        <Route path="/make/dashboard" element={<ProtectedRoute><MakeDashboard /></ProtectedRoute>} />
        <Route path="/make/products" element={<ProtectedRoute><MakeProductCatalog /></ProtectedRoute>} />
        <Route path="/make/place-order" element={<ProtectedRoute><PlaceOrder /></ProtectedRoute>} />
        <Route path="/make/place-order/drafts" element={<ProtectedRoute><PlaceOrder /></ProtectedRoute>} />
        <Route path="/make/track" element={<ProtectedRoute><TrackOrders /></ProtectedRoute>} />
        <Route path="/make/requestion" element={<ProtectedRoute><MakeCostingRequests /></ProtectedRoute>} />
        <Route path="/make/requestion/process" element={<ProtectedRoute><MakeCostingRequests /></ProtectedRoute>} />

        <Route path="/website/products" element={<ProtectedRoute><WebsiteProducts /></ProtectedRoute>} />
        <Route path="/website/orders" element={<ProtectedRoute><WebsiteOrders /></ProtectedRoute>} />
        <Route path="/website/categories" element={<ProtectedRoute><WebsiteCategories /></ProtectedRoute>} />
        <Route path="/website/projects" element={<ProtectedRoute><WebsiteProjects /></ProtectedRoute>} />
        <Route path="/website/pages" element={<ProtectedRoute><WebsitePages /></ProtectedRoute>} />
        <Route path="/website/media" element={<ProtectedRoute><WebsiteMedia /></ProtectedRoute>} />
        <Route path="/website/newsletter" element={<ProtectedRoute><WebsiteNewsletter /></ProtectedRoute>} />
        <Route path="/website/settings" element={<ProtectedRoute><WebsiteSettings /></ProtectedRoute>} />

        {/* Billing */}
        <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
        <Route path="/billing/history" element={<ProtectedRoute><BillHistory /></ProtectedRoute>} />
        <Route path="/billing/alter" element={<ProtectedRoute><AlterBill /></ProtectedRoute>} />
        <Route path="/billing/pending-approvals" element={<ProtectedRoute><PendingAlterations /></ProtectedRoute>} />

        {/* HRM Module */}
        <Route path="/hrm" element={<ProtectedRoute><HRMDashboard /></ProtectedRoute>} />
        <Route path="/hrm/employees" element={<ProtectedRoute><HRMEmployees /></ProtectedRoute>} />
        <Route path="/hrm/attendance" element={<ProtectedRoute><HRMAttendance /></ProtectedRoute>} />
        <Route path="/hrm/leaves" element={<ProtectedRoute><HRMLeaves /></ProtectedRoute>} />
        <Route path="/hrm/payroll" element={<ProtectedRoute><HRMPayroll /></ProtectedRoute>} />
        <Route path="/hrm/holidays" element={<ProtectedRoute><HRMHolidays /></ProtectedRoute>} />

        {/* Shipping */}
        <Route path="/shipping" element={<ProtectedRoute><ShippingDashboard /></ProtectedRoute>} />

        {/* CRM Module (under Billing) */}
        <Route path="/billing/crm/directory" element={<ProtectedRoute><CRMDirectory /></ProtectedRoute>} />
        <Route path="/billing/crm/progress" element={<ProtectedRoute><CRMProgress /></ProtectedRoute>} />

        {/* Customer Ledger */}
        <Route path="/crm/ledger" element={<ProtectedRoute><CustomerLedgerList /></ProtectedRoute>} />
        <Route path="/crm/ledger/:id" element={<ProtectedRoute><CustomerLedgerDetail /></ProtectedRoute>} />

        {/* Exchange Orders */}
        <Route path="/crm/exchanges" element={<ProtectedRoute><ExchangeOrders /></ProtectedRoute>} />
        <Route path="/crm/exchanges/create" element={<ProtectedRoute><ExchangeCreate /></ProtectedRoute>} />

        {/* Quotation Module */}
        <Route path="/quotations" element={<ProtectedRoute><QuotationList /></ProtectedRoute>} />
        <Route path="/quotations/create" element={<ProtectedRoute><QuotationCreate /></ProtectedRoute>} />
        <Route path="/quotations/preview/:id" element={<ProtectedRoute><QuotationPreview /></ProtectedRoute>} />

        {/* Permission Levels */}
        <Route path="/users/permissions" element={<ProtectedRoute><PermissionLevels /></ProtectedRoute>} />

        {/* Company */}
        <Route path="/company/create" element={<ProtectedRoute><CreateCompany /></ProtectedRoute>} />

        {/* Network Setup (Unguarded) */}

      </Routes>
        </Suspense>
      <MakeTutorial />
      </NetworkProvider>
    </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
