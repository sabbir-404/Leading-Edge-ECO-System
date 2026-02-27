import { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Auth/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import Masters from './pages/Masters';
import Vouchers from './pages/Vouchers';
import CreateCompany from './pages/Company/CreateCompany';
import './index.css';

// Accounting Masters
import GroupList from './pages/Accounting/Masters/GroupList';
import GroupCreate from './pages/Accounting/Masters/GroupCreate';
import LedgerList from './pages/Accounting/Masters/LedgerList';
import LedgerCreate from './pages/Accounting/Masters/LedgerCreate';

// Inventory Masters
import UnitList from './pages/Inventory/Masters/UnitList';
import UnitCreate from './pages/Inventory/Masters/UnitCreate';
import StockGroupList from './pages/Inventory/Masters/StockGroupList';
import StockGroupCreate from './pages/Inventory/Masters/StockGroupCreate';
import StockItemList from './pages/Inventory/Masters/StockItemList';
import StockItemCreate from './pages/Inventory/Masters/StockItemCreate';
import ProductList from './pages/Inventory/Masters/ProductList';
import ProductCreate from './pages/Inventory/Masters/ProductCreate';

// Master Stubs
import VoucherTypes from './pages/Stubs/VoucherTypes';
import Currencies from './pages/Stubs/Currencies';
import Godowns from './pages/Stubs/Godowns';

// Vouchers
import VoucherList from './pages/Accounting/Vouchers/VoucherList';
import VoucherEntry from './pages/Accounting/Vouchers/VoucherEntry';
import PurchaseBillList from './pages/Accounting/Vouchers/PurchaseBillList';
import PurchaseBillCreate from './pages/Accounting/Vouchers/PurchaseBillCreate';

// Users
import UserList from './pages/Users/UserList';
import UserCreate from './pages/Users/UserCreate';
import UserGroupList from './pages/Users/UserGroupList';
import UserGroupCreate from './pages/Users/UserGroupCreate';

// Notifications
import Notifications from './pages/Notifications/Notifications';

// Settings
import Settings from './pages/Settings/Settings';

// Website Admin
import WebsiteDashboard from './pages/Website/WebsiteDashboard';
import WebsiteProducts from './pages/Website/WebsiteProducts';
import WebsiteOrders from './pages/Website/WebsiteOrders';
import WebsiteCategories from './pages/Website/WebsiteCategories';
import WebsiteProjects from './pages/Website/WebsiteProjects';
import WebsitePages from './pages/Website/WebsitePages';
import WebsiteMedia from './pages/Website/WebsiteMedia';
import WebsiteNewsletter from './pages/Website/WebsiteNewsletter';
import WebsiteSettings from './pages/Website/WebsiteSettings';

// Billing
import Billing from './pages/Billing/Billing';
import BillHistory from './pages/Billing/BillHistory';
import AlterBill from './pages/Billing/AlterBill';
import PendingAlterations from './pages/Billing/PendingAlterations';


// Shipping
import ShippingDashboard from './pages/Shipping/ShippingDashboard';

// MAKE Module
import PlaceOrder from './pages/Make/PlaceOrder';
import TrackOrders from './pages/Make/TrackOrders';
import MakeDashboard from './pages/Make/MakeDashboard';


// Reports
import Reports from './pages/Reports/Reports';
import TrialBalance from './pages/Reports/TrialBalance';
import BalanceSheet from './pages/Reports/BalanceSheet';
import ProfitAndLoss from './pages/Reports/ProfitAndLoss';
import StockSummary from './pages/Reports/StockSummary';
import DayBook from './pages/Reports/DayBook';

// HRM Module
import HRMDashboard from './pages/HRM/HRMDashboard';
import HRMEmployees from './pages/HRM/HRMEmployees';
import HRMAttendance from './pages/HRM/HRMAttendance';
import HRMLeaves from './pages/HRM/HRMLeaves';
import HRMPayroll from './pages/HRM/HRMPayroll';

// CRM Module
import CRMDirectory from './pages/CRM/CRMDirectory';
import CRMProgress from './pages/CRM/CRMProgress';

import Email from './pages/Email/Email';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import LicenseGate from './pages/Auth/LicenseGate';
import UpdateBanner from './components/UpdateBanner';

function App() {
  const navigate = useNavigate();
  const location = useLocation();

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

  useEffect(() => {
    // Listen for redirect signals from main process (e.g., first-launch network setup)
    const cleanup = (window as any).electron.onRedirect((path: string) => {
      navigate(path);
    });
    return () => cleanup();
  }, [navigate]);

  // License gate state
  const [licenseChecked, setLicenseChecked] = useState(false);
  const [isLicensed, setIsLicensed] = useState(false);

  useEffect(() => {
    (window as any).electron.checkLicense?.().then((result: any) => {
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
    <ThemeProvider>
      <UpdateBanner />
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

        {/* Masters & Sub Routes */}
        <Route path="/masters" element={<ProtectedRoute><Masters /></ProtectedRoute>}>
           <Route path="groups" element={<GroupList />} />
           <Route path="groups/create" element={<GroupCreate />} />
           <Route path="ledgers" element={<LedgerList />} />
           <Route path="ledgers/create" element={<LedgerCreate />} />
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
        </Route>

        {/* Users */}
        <Route path="/users" element={<ProtectedRoute><UserList /></ProtectedRoute>} />
        <Route path="/users/create" element={<ProtectedRoute><UserCreate /></ProtectedRoute>} />
        <Route path="/users/groups" element={<ProtectedRoute><UserGroupList /></ProtectedRoute>} />
        <Route path="/users/groups/create" element={<ProtectedRoute><UserGroupCreate /></ProtectedRoute>} />

        {/* Notifications */}
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />

        {/* Email System */}
        <Route path="/email" element={<ProtectedRoute><Email /></ProtectedRoute>} />

        {/* Settings */}
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

        {/* Website Admin */}
        <Route path="/website" element={<ProtectedRoute><WebsiteDashboard /></ProtectedRoute>} />

        {/* MAKE Module */}
        <Route path="/make/dashboard" element={<ProtectedRoute><MakeDashboard /></ProtectedRoute>} />
        <Route path="/make/place-order" element={<ProtectedRoute><PlaceOrder /></ProtectedRoute>} />
        <Route path="/make/track" element={<ProtectedRoute><TrackOrders /></ProtectedRoute>} />

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

        {/* Shipping */}
        <Route path="/shipping" element={<ProtectedRoute><ShippingDashboard /></ProtectedRoute>} />

        {/* CRM Module (under Billing) */}
        <Route path="/billing/crm/directory" element={<ProtectedRoute><CRMDirectory /></ProtectedRoute>} />
        <Route path="/billing/crm/progress" element={<ProtectedRoute><CRMProgress /></ProtectedRoute>} />

        {/* Company */}
        <Route path="/company/create" element={<ProtectedRoute><CreateCompany /></ProtectedRoute>} />

        {/* Network Setup (Unguarded) */}

      </Routes>
    </ThemeProvider>
  );
}

export default App;
