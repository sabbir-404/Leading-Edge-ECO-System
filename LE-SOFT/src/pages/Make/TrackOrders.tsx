import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ClipboardList, ChevronDown, ChevronUp, CheckCircle, Trash2, Send, 
  FileText, Download, Eye, X, Edit2, Ruler, MapPin, 
  User, History, Layers, ArrowRight, RefreshCw, Upload, Search, Copy, Paperclip,
  CreditCard, Shield, DollarSign, AlertCircle
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import AlterOrder from './AlterOrder';
import { getUserPricingPermissions } from '../../utils/permissions';
import { resolveImageSrc, handleImageLoadError } from '../../utils/imageSrc';

export const TRACK_ORDERS_FILTERS = [
  'All',
  'Draft',
  'Awaiting Price',
  'Pricing done',
  'Pending approved',
  'Work in process',
  'Production On Going',
  'Primary QC',
  'Color Ongoing (oven)',
  'QC Final',
  'Packaging',
  'Ready to Ship',
  'Delivered'
] as const;

export type TrackOrderFilter = typeof TRACK_ORDERS_FILTERS[number];

const PRODUCTION_STAGES = [
  'Work in process',
  'Production On Going',
  'Primary QC',
  'Color Ongoing (oven)',
  'QC Final',
  'Packaging',
  'Ready to Ship',
  'Delivered'
];

const LEGACY_STAGE_INDEX_MAP: Record<string, number> = {
  // Canonical 8 stages
  'Work in process': 0,
  'Production On Going': 1,
  'Primary QC': 2,
  'Color Ongoing (oven)': 3,
  'QC Final': 4,
  'Packaging': 5,
  'Ready to Ship': 6,
  'Delivered': 7,

  // Historical variants & WordPress plugin variants
  'Color Ongoing': 3,
  'Color Ongoing (Oven)': 3,
  'color ongoing': 3,
  'In Production': 1,
  'Production Ongoing': 1,
  'Work In Progress': 0,
  'WIP': 0,
  'Placed': 0,
  'Welding': 1,
  'Painting': 3,
  'Ready for Dispatch': 6,
  'Dispatch': 6,
  'Completed': 7,

  // Historical 6-stage fallback mapping
  'Cutting & Woodworking': 0,
  'Metalwork': 1,
  'Polish & Paint': 3,
  'Upholstery': 4,
  'Packaging & QC': 5
};

export const getStageIndex = (stage?: string | null): number => {
  if (!stage) return -1;
  const trimmed = stage.trim();
  if (trimmed in LEGACY_STAGE_INDEX_MAP) return LEGACY_STAGE_INDEX_MAP[trimmed];
  const lower = trimmed.toLowerCase();
  for (const [key, idx] of Object.entries(LEGACY_STAGE_INDEX_MAP)) {
    if (key.toLowerCase() === lower) return idx;
  }
  return -1;
};

export const orderMatchesFilter = (order: Order, filter: string): boolean => {
  if (!filter || filter === 'All') return true;

  const rawStatus = (order.status || '').trim();
  const lowerStatus = rawStatus.toLowerCase();
  const rawApproval = (order.approval_status || '').trim().toLowerCase();
  const rawStage = (order.current_stage || '').trim();

  if (filter === 'Draft') {
    return lowerStatus === 'draft' || rawApproval === 'draft';
  }

  if (filter === 'Awaiting Price') {
    return (
      lowerStatus === 'awaiting price' ||
      lowerStatus === 'awaiting pricing' ||
      lowerStatus === 'pending_pricing' ||
      rawApproval === 'pending_pricing'
    );
  }

  if (filter === 'Pricing done') {
    return (
      lowerStatus === 'pricing done' ||
      lowerStatus === 'priced' ||
      rawApproval === 'priced'
    );
  }

  if (filter === 'Pending approved') {
    return (
      lowerStatus === 'pending approved' ||
      lowerStatus === 'pending approval' ||
      rawApproval === 'pending' ||
      rawApproval === 'pending_approval' ||
      rawApproval === 'modification_pending_approval'
    );
  }

  // Canonical factory production stages:
  const targetStageIdx = PRODUCTION_STAGES.indexOf(filter);
  if (targetStageIdx !== -1) {
    if (
      lowerStatus === 'draft' ||
      rawApproval === 'draft' ||
      rawApproval === 'pending_pricing' ||
      rawApproval === 'priced' ||
      rawApproval === 'pending' ||
      rawApproval === 'pending_approval' ||
      rawApproval === 'modification_pending_approval'
    ) {
      if (rawStage) {
        return getStageIndex(rawStage) === targetStageIdx;
      }
      return false;
    }

    const stageIdx = getStageIndex(rawStage || rawStatus);
    return stageIdx === targetStageIdx;
  }

  return rawStatus === filter;
};

const statusColors: Record<string, string> = {
  // Canonical 8 stages
  'Work in process': '#f59e0b',
  'Production On Going': '#3b82f6',
  'Primary QC': '#8b5cf6',
  'Color Ongoing (oven)': '#ec4899',
  'Color Ongoing': '#ec4899',
  'QC Final': '#06b6d4',
  'Packaging': '#ea580c',
  'Ready to Ship': '#10b981',
  'Delivered': '#059669',

  // Order lifecycle & Historical stages
  'Draft': '#6b7280',
  'Awaiting Price': '#ca8a04',
  'Awaiting Pricing': '#ca8a04',
  'Pricing done': '#3b82f6',
  'Pricing Done': '#3b82f6',
  'Pending approved': '#fb923c',
  'Pending Approval': '#fb923c',
  'Placed': '#8b5cf6',
  'In Production': '#3b82f6',
  'Welding': '#f59e0b',
  'Painting': '#a855f7',
  'Ready for Dispatch': '#10b981',
  'Cancelled': '#ef4444',
  'Rejected': '#dc2626',
  'Cutting & Woodworking': '#f59e0b',
  'Metalwork': '#3b82f6',
  'Polish & Paint': '#8b5cf6',
  'Upholstery': '#a855f7',
  'Packaging & QC': '#06b6d4',
  'Dispatch': '#10b981'
};

const approvalBadgeColors: Record<string, { bg: string; text: string; border: string; label: string }> = {
  'pending_pricing': { bg: 'rgba(234, 179, 8, 0.1)', text: '#ca8a04', border: 'rgba(234, 179, 8, 0.3)', label: 'Awaiting Cost Pricing' },
  'priced': { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)', label: 'Priced (Awaiting Sales Approval)' },
  'awaiting_sales_approval': { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)', label: 'Designer Reviewed (Awaiting Sales Approval)' },
  'approved': { bg: 'rgba(34, 197, 94, 0.1)', text: '#16a34a', border: 'rgba(34, 197, 94, 0.3)', label: 'Salesperson Approved' },
  'sales_approved': { bg: 'rgba(34, 197, 94, 0.1)', text: '#16a34a', border: 'rgba(34, 197, 94, 0.3)', label: 'Salesperson Approved' },
  'modification_pending_approval': { bg: 'rgba(249, 115, 22, 0.12)', text: '#ea580c', border: 'rgba(249, 115, 22, 0.4)', label: 'Modification Pending Approval' },
  'rejected': { bg: 'rgba(239, 68, 68, 0.1)', text: '#dc2626', border: 'rgba(239, 68, 68, 0.3)', label: 'Rejected by Salesperson' },
  'draft': { bg: 'rgba(107, 114, 128, 0.1)', text: '#6b7280', border: 'rgba(107, 114, 128, 0.3)', label: 'Draft' }
};

interface OrderItem {
  id: number;
  order_id?: number;
  product_id?: number;
  product_name: string;
  spec_name?: string;
  spec_details?: string;
  dimensions_text?: string;
  size_label?: string;
  is_customized?: boolean;
  custom_dimensions?: string;
  color_name?: string;
  quantity: number;
  unit_cost_price?: number;
  unit_sale_price?: number;
  item_cost_price?: number;
  item_sale_price?: number;
  total_cost_price?: number;
  total_sale_price?: number;
  designer_notes?: string;
  salesperson_note?: string;
  technical_drawing_url?: string;
  pdf_urls?: string[];
  drawings?: PdfEntry[];
}

interface Order {
  id: number;
  order_number?: string;
  furniture_name: string;
  description: string;
  quantity: number;
  designer_name: string;
  status: string;
  current_stage?: string | null;
  priority: string;
  delivery_date: string | null;
  target_delivery_date?: string | null;
  requested_delivery_date?: string | null;
  salesman_id: number | null;
  salesman_name?: string;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
  custom_price?: number;
  cost_price?: number;
  sale_price?: number;
  current_version?: number;
  approved_version?: number | null;
  approval_status?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  shipping_address?: string;
  location_landmark?: string;
  receiver_name?: string;
  receiver_phone?: string;
  special_instructions?: string;
  items?: OrderItem[];
  bill_invoice_number?: string | null;
  reference_bill_no?: string | null;
  target_delivery_days?: number | null;
  factory_manager_id?: number | null;
  factory_manager_name?: string | null;
  current_stage_photo?: string | null;
  invoice_attachment_urls?: string[] | null;
  production_hold?: boolean;
  hold_reason?: string | null;
  admin_approval_status?: 'none' | 'pending' | 'approved' | 'rejected' | string;
  admin_approval_by?: number | null;
  admin_approval_at?: string | null;
  admin_approval_notes?: string | null;
  money_received?: number;
  amount_due?: number;
  payment_status?: 'unpaid' | 'partial' | 'paid' | string;
  final_price?: number;
}

interface StatusUpdate { 
  id: number; 
  order_id: number; 
  status: string; 
  stage?: string;
  note: string; 
  photo_url?: string | null;
  photo_urls?: string[];
  updated_by: string; 
  created_at: string; 
}
interface PdfEntry { path: string; name: string; url: string; isPending?: boolean; }
interface Part { id: number; part_name: string; length: string; width: string; height: string; notes: string; sort_order: number; }

const TrackOrders: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const pricingPerms = getUserPricingPermissions();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoadError, setOrdersLoadError] = useState<string | null>(null);
  const [expandedLoadError, setExpandedLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [updates, setUpdates] = useState<StatusUpdate[]>([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Order[] | null>(null);
  const searchSeqRef = React.useRef(0);
  
  // Designer pricing form state per order
  const [costPrices, setCostPrices] = useState<Record<number, string>>({});
  const [salePrices, setSalePrices] = useState<Record<number, string>>({});
  const [pricingNotes, setPricingNotes] = useState<Record<number, string>>({});
  const [submittingPriceId, setSubmittingPriceId] = useState<number | null>(null);

  // Individual item pricing form state
  const [itemCostPrices, setItemCostPrices] = useState<Record<number, string>>({});
  const [itemSalePrices, setItemSalePrices] = useState<Record<number, string>>({});
  const [itemDesignerNotes, setItemDesignerNotes] = useState<Record<number, string>>({});
  const [uploadingItemId, setUploadingItemId] = useState<number | null>(null);

  // Multi-items state for expanded order
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Version Diff & History Modal
  const [diffModalOrder, setDiffModalOrder] = useState<Order | null>(null);
  const [orderVersions, setOrderVersions] = useState<any[]>([]);
  const [selectedVersionFrom, setSelectedVersionFrom] = useState<number | null>(null);
  const [selectedVersionTo, setSelectedVersionTo] = useState<number | null>(null);
  const [versionDiff, setVersionDiff] = useState<any>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  // PDFs & Parts
  const [pdfs, setPdfs] = useState<PdfEntry[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfViewer, setPdfViewer] = useState<PdfEntry | null>(null);
  const [parts, setParts] = useState<Part[]>([]);

  // Alter
  const [alterOrder, setAlterOrder] = useState<Order | null>(null);

  // Factory Manager Stage Update state
  const [selectedStage, setSelectedStage] = useState('');
  const [stageNote, setStageNote] = useState('');
  const [stagePhotoFile, setStagePhotoFile] = useState<File | null>(null);
  const [stagePhotoPreview, setStagePhotoPreview] = useState<string | null>(null);
  const [stagePhotoUrl, setStagePhotoUrl] = useState<string | null>(null);
  const [uploadingStagePhoto, setUploadingStagePhoto] = useState(false);
  const [updatingStage, setUpdatingStage] = useState(false);
  const [approving, setApproving] = useState(false);

  // Payment & Hold Modals state
  const [paymentModalOrder, setPaymentModalOrder] = useState<Order | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const [requestApprovalModalOrder, setRequestApprovalModalOrder] = useState<Order | null>(null);
  const [requestApprovalNotes, setRequestApprovalNotes] = useState<string>('');
  const [submittingApprovalRequest, setSubmittingApprovalRequest] = useState(false);

  const [decideApprovalModalOrder, setDecideApprovalModalOrder] = useState<Order | null>(null);
  const [decideApprovalDecision, setDecideApprovalDecision] = useState<'approved' | 'rejected'>('approved');
  const [decideApprovalNotes, setDecideApprovalNotes] = useState<string>('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  const [viewPaymentsOrder, setViewPaymentsOrder] = useState<Order | null>(null);
  const [orderPayments, setOrderPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  const rawRole = (localStorage.getItem('user_role') || '').trim();
  const userRole = (!rawRole || rawRole === 'undefined' || rawRole === 'null') ? 'admin' : rawRole.toLowerCase();
  const userName = localStorage.getItem('user_name') || 'Unknown';

  const isFactoryManager = userRole === 'factory_manager' || userRole === 'factory manager' || userRole === 'factory';
  const canControlFactory = isFactoryManager || userRole === 'admin' || userRole === 'superadmin' || userRole === 'manager';

  let userPermissions: Record<string, boolean> = {};
  try {
    userPermissions = JSON.parse(localStorage.getItem('user_permissions') || '{}');
  } catch {
    userPermissions = {};
  }

  const hasPermission = (key: string) => {
    if (key === 'set_make_cost_price') {
      return pricingPerms.canEditCostPrice;
    }
    if (userRole === 'admin' || userRole === 'superadmin' || userRole === 'manager') return true;
    return !!userPermissions[key];
  };
  const canApproveMakeOrder = ['admin', 'superadmin', 'manager', 'salesperson', 'salesman', 'sales'].includes(userRole) ||
    hasPermission('approve_make_order') || hasPermission('sales_approve') || hasPermission('make_approve');

  const handleDuplicateOrder = async (orderToDuplicate: Order) => {
    let items = orderToDuplicate.items || [];
    if (items.length === 0) {
      if (expandedId === orderToDuplicate.id && orderItems.length > 0) {
        items = orderItems;
      } else if (window.electron?.makeGetOrderItems) {
        try {
          items = await window.electron.makeGetOrderItems(orderToDuplicate.id) || [];
        } catch (err) {
          console.warn('Failed to load items for duplicate order:', err);
        }
      }
    }
    navigate('/make/place-order', { state: { duplicateFromOrder: { ...orderToDuplicate, items } } });
  };

  const handleOpenPaymentModal = (order: Order) => {
    setPaymentModalOrder(order);
    const balance = order.amount_due ?? (order.sale_price ? Math.max(0, order.sale_price - (order.money_received || 0)) : 0);
    setPaymentAmount(balance > 0 ? String(balance) : '');
    setPaymentMethod('Cash');
    setPaymentRef('');
    setPaymentNotes('');
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalOrder) return;
    const amt = Number(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid positive payment amount.');
      return;
    }
    setSubmittingPayment(true);
    try {
      if (window.electron?.makeRecordOrderPayment) {
        const res = await window.electron.makeRecordOrderPayment({
          orderId: paymentModalOrder.id,
          amount: amt,
          paymentMethod: paymentMethod,
          reference: paymentRef || undefined,
          notes: paymentNotes || undefined
        });
        if (res && res.error) {
          alert('Failed to record payment: ' + res.error);
        } else {
          setPaymentModalOrder(null);
          await fetchOrders();
          if (expandedId === paymentModalOrder.id && window.electron?.makeGetOrderPayments) {
            const freshPaymentsRes = await window.electron.makeGetOrderPayments(paymentModalOrder.id);
            setOrderPayments(freshPaymentsRes?.payments || []);
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      alert('Error recording payment: ' + (err?.message || 'Unknown error'));
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleOpenRequestApproval = (order: Order) => {
    setRequestApprovalModalOrder(order);
    setRequestApprovalNotes('');
  };

  const handleSubmitApprovalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestApprovalModalOrder) return;
    setSubmittingApprovalRequest(true);
    try {
      if (window.electron?.makeRequestProductionApproval) {
        const res = await window.electron.makeRequestProductionApproval({
          orderId: requestApprovalModalOrder.id,
          notes: requestApprovalNotes || undefined
        });
        if (res && res.error) {
          alert('Failed to request approval: ' + res.error);
        } else {
          setRequestApprovalModalOrder(null);
          await fetchOrders();
        }
      }
    } catch (err: any) {
      console.error(err);
      alert('Error requesting approval: ' + (err?.message || 'Unknown error'));
    } finally {
      setSubmittingApprovalRequest(false);
    }
  };

  const handleOpenDecideApproval = (order: Order, decision: 'approved' | 'rejected') => {
    setDecideApprovalModalOrder(order);
    setDecideApprovalDecision(decision);
    setDecideApprovalNotes('');
  };

  const handleSubmitApprovalDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decideApprovalModalOrder) return;
    setSubmittingDecision(true);
    try {
      if (window.electron?.makeDecideProductionApproval) {
        const res = await window.electron.makeDecideProductionApproval({
          orderId: decideApprovalModalOrder.id,
          decision: decideApprovalDecision,
          notes: decideApprovalNotes || undefined
        });
        if (res && res.error) {
          alert('Failed to record decision: ' + res.error);
        } else {
          setDecideApprovalModalOrder(null);
          await fetchOrders();
        }
      }
    } catch (err: any) {
      console.error(err);
      alert('Error recording decision: ' + (err?.message || 'Unknown error'));
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleViewPayments = async (order: Order) => {
    setViewPaymentsOrder(order);
    setLoadingPayments(true);
    try {
      if (window.electron?.makeGetOrderPayments) {
        const res = await window.electron.makeGetOrderPayments(order.id);
        if (res?.error || res?.success === false) {
          alert('Could not load payment history: ' + (res.error || 'Database request failed.'));
          return;
        }
        setOrderPayments(res?.payments || []);
      }
    } catch (err) {
      console.error(err);
      alert('Could not load payment history. Check the database connection and try again.');
    } finally {
      setLoadingPayments(false);
    }
  };

  const isDesigner = userRole === 'designer' || userRole === 'furniture_designer' || userRole === 'furniture designer' || userRole === 'make_designer';
  const canDeleteOrder = userRole === 'admin' || userRole === 'superadmin' || isDesigner || hasPermission('delete_make_order') || hasPermission('make_delete');

  const fetchOrders = async () => {
    try {
      // @ts-ignore
      const data = await window.electron.getMakeOrders();
      setOrders(Array.isArray(data) ? data : ((data as any)?.orders || []));
      setOrdersLoadError(null);
    } catch (e: any) {
      console.error('[TrackOrders] Failed to load orders:', e);
      setOrdersLoadError(e?.message || 'Could not load orders from the database.');
    }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchOrders(); }, []);
  useAutoRefresh(['make_orders', 'make_order_updates', 'make_order_versions'], fetchOrders);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    const currentSeq = ++searchSeqRef.current;
    setIsSearching(true);
    const timeout = setTimeout(async () => {
      try {
        // @ts-ignore
        if (window.electron?.makeSearchOrders) {
          // @ts-ignore
          const results = await window.electron.makeSearchOrders({
            query: trimmed,
            status: statusFilter !== 'All' ? statusFilter : undefined
          });
          if (currentSeq === searchSeqRef.current) {
            setSearchResults(Array.isArray(results) ? results : []);
          }
        } else {
          const lower = trimmed.toLowerCase();
          const local = orders.filter(o => 
            (o.order_number || '').toLowerCase().includes(lower) ||
            (o.furniture_name || '').toLowerCase().includes(lower) ||
            (o.customer_name || '').toLowerCase().includes(lower) ||
            (o.customer_phone || '').toLowerCase().includes(lower) ||
            (o.shipping_address || '').toLowerCase().includes(lower)
          );
          if (currentSeq === searchSeqRef.current) {
            setSearchResults(local);
          }
        }
      } catch (err) {
        console.error('[TrackOrders] Order search failed:', err);
      } finally {
        if (currentSeq === searchSeqRef.current) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [searchQuery, statusFilter, orders]);

  const loadExpanded = async (orderId: number) => {
    if (expandedId === orderId) { setExpandedId(null); return; }
    setExpandedId(orderId);
    setExpandedLoadError(null);
    setPdfs([]); setParts([]); setOrderItems([]);
    setLoadingItems(true);

    try {
      // @ts-ignore
      const [data, pdfData, partsData, itemsData] = await Promise.all([
        // @ts-ignore
        window.electron.getMakeOrderUpdates(orderId),
        // @ts-ignore
        window.electron.makeGetPdfUrls(orderId),
        // @ts-ignore
        window.electron.makeGetOrderParts(orderId),
        // @ts-ignore
        window.electron.makeGetOrderItems ? window.electron.makeGetOrderItems(orderId) : Promise.resolve([])
      ]);
      setUpdates(data || []);
      setPdfs(pdfData || []);
      setParts(partsData || []);
      setOrderItems(itemsData || []);

      if (window.electron?.makeGetOrderPayments && pricingPerms.canViewSalePrice) {
        try {
          const res = await window.electron.makeGetOrderPayments(orderId);
          setOrderPayments(res?.payments || []);
        } catch {
          setOrderPayments([]);
        }
      }

      // Populate item-level prices and notes
      const costMap: Record<number, string> = {};
      const saleMap: Record<number, string> = {};
      const notesMap: Record<number, string> = {};

      if (Array.isArray(itemsData) && itemsData.length > 0) {
        itemsData.forEach((it: any) => {
          const costVal = (it.item_cost_price !== undefined && it.item_cost_price !== null && it.item_cost_price > 0) 
            ? it.item_cost_price 
            : (it.unit_cost_price || '');
          const saleVal = (it.item_sale_price !== undefined && it.item_sale_price !== null && it.item_sale_price > 0) 
            ? it.item_sale_price 
            : (it.unit_sale_price || '');
          costMap[it.id] = costVal !== '' ? String(costVal) : '';
          saleMap[it.id] = saleVal !== '' ? String(saleVal) : '';
          notesMap[it.id] = it.designer_notes || '';
        });
      }
      setItemCostPrices(prev => ({ ...prev, ...costMap }));
      setItemSalePrices(prev => ({ ...prev, ...saleMap }));
      setItemDesignerNotes(prev => ({ ...prev, ...notesMap }));

      const order = orders.find(o => o.id === orderId);
      if (order) {
        setCostPrices(prev => ({ ...prev, [orderId]: order.cost_price ? String(order.cost_price) : '' }));
        setSalePrices(prev => ({ ...prev, [orderId]: order.sale_price ? String(order.sale_price) : '' }));

        const curStageIdx = getStageIndex(order.status);
        if (curStageIdx >= 0 && curStageIdx < PRODUCTION_STAGES.length - 1) {
          setSelectedStage(PRODUCTION_STAGES[curStageIdx + 1]);
        } else if (curStageIdx >= 0) {
          setSelectedStage(PRODUCTION_STAGES[curStageIdx]);
        } else {
          setSelectedStage(PRODUCTION_STAGES[0]);
        }
        setStageNote('');
        setStagePhotoFile(null);
        setStagePhotoPreview(null);
        setStagePhotoUrl(null);
      }
    } catch (e: any) {
      console.error('[TrackOrders] Failed to load order details:', e);
      setExpandedLoadError(e?.message || 'Could not load this order’s database details.');
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    const targetId = Number((location.state as any)?.focusOrderId);
    if (!targetId || !orders.length) return;
    setStatusFilter('All');
    setSearchQuery('');
    void loadExpanded(targetId);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.key, orders.length]);

  const handlePickStagePhotoNative = async (orderId: number) => {
    if (uploadingStagePhoto) return;
    setUploadingStagePhoto(true);
    try {
      if (window.electron?.makePickAndUploadStagePhoto) {
        const res = await window.electron.makePickAndUploadStagePhoto({ orderId });
        const durableRef = res?.durableKey || res?.publicUrl;
        if (res?.success && durableRef) {
          setStagePhotoUrl(durableRef);
          let previewUrl = res.publicUrl || '';
          if (!previewUrl && window.electron?.makeResolveAttachmentUrl) {
            try {
              const resolved = await window.electron.makeResolveAttachmentUrl(durableRef);
              previewUrl = resolved?.url || '';
            } catch { /* queued uploads may resolve after background sync */ }
          }
          setStagePhotoPreview(previewUrl || durableRef);
          setStagePhotoFile(null);
          return;
        } else if (res?.error) {
          alert('Photo selection failed: ' + res.error);
          return;
        }
      }
    } catch (e: any) {
      console.error('Native photo pick error:', e);
    } finally {
      setUploadingStagePhoto(false);
    }
  };

  const handleClearStagePhoto = () => {
    setStagePhotoFile(null);
    setStagePhotoPreview(null);
    setStagePhotoUrl(null);
  };

  const handleUpdateProductionStage = async (orderId: number) => {
    if (uploadingStagePhoto) {
      alert('Please wait for the stage photo upload to finish before updating the production stage.');
      return;
    }
    if (!selectedStage) {
      alert('Please select a production stage.');
      return;
    }
    const order = orders.find(o => o.id === orderId);
    if (order && order.production_hold && order.admin_approval_status !== 'approved') {
      alert(`Cannot advance production stage: Order #${order.order_number || order.id} is on Production Hold due to an unpaid balance. Full payment must be recorded or an Admin must approve production release before factory work can proceed.`);
      return;
    }
    const curIdx = getStageIndex(order?.status || '');
    const targetIdx = PRODUCTION_STAGES.indexOf(selectedStage);
    if (targetIdx === -1) {
      alert('Please select a valid production stage.');
      return;
    }
    if (curIdx === -1) {
      if (targetIdx !== 0) {
        alert(`Stages must be updated sequentially. Initial stage must be "${PRODUCTION_STAGES[0]}".`);
        return;
      }
    } else if (targetIdx > curIdx + 1) {
      alert(`Stages must be updated sequentially. The next required stage is "${PRODUCTION_STAGES[curIdx + 1]}". You cannot skip ahead.`);
      return;
    }
    setUpdatingStage(true);
    try {
      const rawUserId = localStorage.getItem('user_id');
      const numericUserId = rawUserId ? parseInt(rawUserId, 10) : undefined;
      // @ts-ignore
      const res = await window.electron.makeUpdateProductionStage({
        orderId,
        stage: selectedStage,
        note: stageNote,
        photoUrl: stagePhotoUrl || undefined,
        photoBase64: stagePhotoPreview?.startsWith('data:') ? stagePhotoPreview : undefined,
        updatedBy: userName,
        userRole: userRole,
        userId: numericUserId
      });
      if (res?.error) {
        alert('Failed to update stage: ' + res.error);
        return;
      }
      setStageNote('');
      setStagePhotoFile(null);
      setStagePhotoPreview(null);
      setStagePhotoUrl(null);
      await fetchOrders();
      // @ts-ignore
      const data = await window.electron.getMakeOrderUpdates(orderId);
      setUpdates(data || []);
      const nextIdx = PRODUCTION_STAGES.indexOf(selectedStage);
      if (nextIdx >= 0 && nextIdx < PRODUCTION_STAGES.length - 1) {
        setSelectedStage(PRODUCTION_STAGES[nextIdx + 1]);
      }
    } catch (err: any) {
      console.error(err);
      alert('Error updating stage: ' + (err?.message || 'Unknown error'));
    } finally {
      setUpdatingStage(false);
    }
  };

  const handleUploadItemPdf = async (orderId: number, itemId: number) => {
    setUploadingItemId(itemId);
    try {
      // @ts-ignore
      const res = await window.electron.makeUploadItemPdf({ orderId, itemId });
      if (!res?.canceled && !res?.error) {
        // @ts-ignore
        const freshItems = await window.electron.makeGetOrderItems(orderId);
        setOrderItems(freshItems || []);
      } else if (res?.error) {
        alert('Upload failed: ' + res.error);
      }
    } catch (e: any) {
      console.error(e);
      alert('Failed to upload technical drawing: ' + (e?.message || 'Unknown error'));
    } finally {
      setUploadingItemId(null);
    }
  };

  const handleDeleteItemPdf = async (orderId: number, itemId: number, storagePath: string) => {
    if (!confirm('Remove this technical drawing from this product?')) return;
    try {
      // @ts-ignore
      await window.electron.makeDeleteItemPdf({ itemId, storagePath });
      // @ts-ignore
      const freshItems = await window.electron.makeGetOrderItems(orderId);
      setOrderItems(freshItems || []);
    } catch (e: any) {
      console.error(e);
      alert('Failed to remove technical drawing: ' + (e?.message || 'Unknown error'));
    }
  };

  const handleRemoveOrderItem = async (orderId: number, item: OrderItem) => {
    if (orderItems.length <= 1) {
      alert('An order must keep at least one product. Cancel the entire order if it should not proceed.');
      return;
    }
    if (!confirm(`Remove “${item.product_name}” (Qty: ${item.quantity}) from this order? This is recorded in the order audit.`)) return;
    try {
      const res = await window.electron?.makeRemoveOrderItem?.({ orderId, itemId: item.id });
      if (!res?.success) {
        alert(res?.error || 'Could not remove the product from this order.');
        return;
      }
      const freshItems = await window.electron?.makeGetOrderItems(orderId);
      setOrderItems(freshItems || []);
      await fetchOrders();
    } catch (err: any) {
      console.error('[TrackOrders] Item removal failed:', err);
      alert('Could not remove the product: ' + (err?.message || 'Database request failed.'));
    }
  };

  const handleChangeOrderItemQuantity = async (orderId: number, item: OrderItem) => {
    const entered = window.prompt(`Set quantity for “${item.product_name}”:`, String(item.quantity || 1));
    if (entered === null) return;
    const quantity = Number(entered.trim());
    if (!Number.isInteger(quantity) || quantity < 1) {
      alert('Enter a positive whole-number quantity.');
      return;
    }
    try {
      const res = await window.electron?.makeUpdateOrderItemQuantity?.({ orderId, itemId: item.id, quantity });
      if (!res?.success) {
        alert(res?.error || 'Could not update this product quantity.');
        return;
      }
      const freshItems = await window.electron?.makeGetOrderItems(orderId);
      setOrderItems(freshItems || []);
      await fetchOrders();
    } catch (err: any) {
      console.error('[TrackOrders] Item quantity update failed:', err);
      alert('Could not update the product quantity: ' + (err?.message || 'Database request failed.'));
    }
  };

  const handleDesignerSavePricing = async (orderId: number) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    let preparedItems: any[] = [];
    let totalCost = 0;
    let totalSale = 0;
    let hasSaleEntered = false;

    if (orderItems.length > 0) {
      for (const it of orderItems) {
        const cStr = itemCostPrices[it.id] !== undefined ? itemCostPrices[it.id] : String(it.item_cost_price || it.unit_cost_price || '');
        const cNum = parseFloat(cStr);
        if (isNaN(cNum) || cNum <= 0) {
          alert(`Cost price for "${it.product_name}" is required and must be greater than 0.`);
          return;
        }

        const sStr = itemSalePrices[it.id] !== undefined ? itemSalePrices[it.id] : String(it.item_sale_price || it.unit_sale_price || '');
        const sNum = sStr ? parseFloat(sStr) : null;
        if (sNum !== null && !isNaN(sNum) && sNum > 0) {
          hasSaleEntered = true;
          totalSale += sNum * (it.quantity || 1);
        }

        const notes = itemDesignerNotes[it.id] !== undefined ? itemDesignerNotes[it.id] : (it.designer_notes || '');
        totalCost += cNum * (it.quantity || 1);

        preparedItems.push({
          ...it,
          item_cost_price: cNum,
          item_sale_price: (sNum !== null && !isNaN(sNum)) ? sNum : null,
          designer_notes: notes
        });
      }
    } else {
      // Fallback for legacy orders without items
      const cNum = parseFloat(costPrices[orderId] || '0');
      if (isNaN(cNum) || cNum <= 0) {
        alert('Cost Price is required and must be greater than 0.');
        return;
      }
      const sNum = salePrices[orderId] ? parseFloat(salePrices[orderId]) : undefined;
      totalCost = cNum;
      if (sNum && sNum > 0) {
        totalSale = sNum;
        hasSaleEntered = true;
      }
    }

    setSubmittingPriceId(orderId);
    try {
      // @ts-ignore
      const res = await window.electron.makeDesignerSaveSpecsAndPricing({
        orderId,
        costPrice: totalCost,
        salePrice: hasSaleEntered ? totalSale : undefined,
        items: preparedItems,
        updatedBy: userName,
        userRole,
        modificationReason: pricingNotes[orderId] || 'Individual product cost pricing & technical specifications submitted by designer'
      });

      if (res?.error) {
        alert(res.error);
      } else {
        alert(`Pricing and specifications saved successfully! Total Cost: ৳${totalCost.toLocaleString()}${hasSaleEntered ? ` | Total Sale: ৳${totalSale.toLocaleString()}` : ''}`);
        await fetchOrders();
        if (expandedId === orderId) await loadExpanded(orderId);
      }
    } catch (e: any) {
      console.error(e);
      alert('Failed to save designer pricing: ' + (e?.message || 'Unknown error'));
    } finally {
      setSubmittingPriceId(null);
    }
  };

  const handleApprove = async (orderId: number) => {
    if (!confirm('Approve this order and move it to production?')) return;
    setApproving(true);
    try {
      // @ts-ignore
      const result = await window.electron.approveMakeOrder({ orderId, approvedBy: userName });
      if (result?.error) {
        alert(result.error);
        return;
      }
      if (result?.success === false) {
        alert(result.error || 'Order approval failed.');
        return;
      }
      alert('Order approved and sent to production.');
      await fetchOrders();
      if (expandedId === orderId) await loadExpanded(orderId);
    } catch (e: any) {
      console.error(e);
      alert('Order approval failed: ' + (e?.message || 'Unknown error'));
    }
    finally { setApproving(false); }
  };

  const handleDelete = async (id: number | string) => {
    if (!confirm('Are you sure you want to delete this custom furniture order? If linked to an active bill, it will be marked Cancelled to protect financial records.')) return;
    try {
      // @ts-ignore
      const res = await (window.electron.makeDeleteOrder ? window.electron.makeDeleteOrder(id) : window.electron.deleteMakeOrder(id));
      if (res && res.cancelled) {
        alert(res.message || `Order is linked to active bill #${res.reference_bill_no}. It has been marked Cancelled to preserve financial records.`);
      } else if (res && res.success) {
        alert('Order deleted successfully.');
      }
      await fetchOrders();
      if (expandedId === id) setExpandedId(null);
    } catch (e: any) {
      console.error(e);
      alert('Error deleting order: ' + (e?.message || 'Permission denied or unable to delete order.'));
    }
  };

  const handleUploadPdf = async (orderId: number) => {
    setPdfLoading(true);
    try {
      // @ts-ignore
      const res = await window.electron.makeUploadPdf({ orderId });
      if (!res?.canceled) {
        // @ts-ignore
        const pdfData = await window.electron.makeGetPdfUrls(orderId);
        setPdfs(pdfData || []);
      }
    } catch (e) { console.error(e); }
    finally { setPdfLoading(false); }
  };

  const handleDeletePdf = async (orderId: number, storagePath: string) => {
    if (!confirm('Remove this PDF?')) return;
    // @ts-ignore
    await window.electron.makeDeletePdf({ orderId, storagePath });
    // @ts-ignore
    const pdfData = await window.electron.makeGetPdfUrls(orderId);
    setPdfs(pdfData || []);
  };

  const handleDownloadPdf = async (pdf: PdfEntry) => {
    if (pdf.isPending || !pdf.url) {
      alert('This attachment is currently staged locally and waiting for background synchronization.');
      return;
    }
    try {
      // @ts-ignore
      if (window.electron?.makeDownloadPdf) {
        // @ts-ignore
        await window.electron.makeDownloadPdf({ url: pdf.url, fileName: pdf.name });
      } else {
        const resolved = resolveImageSrc(pdf.url);
        const a = document.createElement('a');
        a.href = resolved;
        a.download = pdf.name;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (e: any) {
      console.error('[TrackOrders] Download error:', e);
    }
  };

  // Open Version Diff modal
  const handleOpenVersionDiff = async (order: Order) => {
    setDiffModalOrder(order);
    setLoadingDiff(true);
    try {
      // @ts-ignore
      const versions = await window.electron.makeGetOrderVersions(order.id);
      setOrderVersions(versions || []);
      if (versions && versions.length > 0) {
        const latestVer = versions[0].version_number;
        const prevVer = versions.length > 1 ? versions[1].version_number : latestVer;
        setSelectedVersionTo(latestVer);
        setSelectedVersionFrom(prevVer);
        
        // @ts-ignore
        const diff = await window.electron.makeGetVersionDiff(order.id, prevVer, latestVer);
        setVersionDiff(diff);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDiff(false);
    }
  };

  const handleCompareVersions = async (vFrom: number, vTo: number) => {
    if (!diffModalOrder) return;
    setSelectedVersionFrom(vFrom);
    setSelectedVersionTo(vTo);
    setLoadingDiff(true);
    try {
      // @ts-ignore
      const diff = await window.electron.makeGetVersionDiff(diffModalOrder.id, vFrom, vTo);
      setVersionDiff(diff);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDiff(false);
    }
  };

  const isPostProductionStage = (stg?: string | null) => {
    if (!stg) return false;
    const lower = stg.trim().toLowerCase();
    const postStages = [
      'production on going',
      'primary qc',
      'color ongoing (oven)',
      'color ongoing',
      'qc final',
      'packaging',
      'ready to ship',
      'delivered',
      'in production',
      'welding',
      'painting',
      'ready for dispatch'
    ];
    return postStages.includes(lower);
  };

  const isSalesperson = userRole === 'sales' || userRole === 'salesman' || userRole === 'salesperson';
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  const canAlter = (order: Order) => {
    if (isSalesperson) return false;
    if (isAdmin) return true;
    if (isDesigner) {
      const isPost = isPostProductionStage(order.current_stage) || isPostProductionStage(order.status);
      return !isPost;
    }
    return false;
  };

  const baseOrders = searchResults !== null ? searchResults : orders;
  const filtered = statusFilter === 'All' ? baseOrders : baseOrders.filter(o => orderMatchesFilter(o, statusFilter));

  const chipStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    padding: '4px 10px', borderRadius: '20px', background: `${color}18`, color,
    fontSize: '0.75rem', fontWeight: 600,
  });

  const smallBtn = (color?: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px',
    background: color ? `${color}15` : 'var(--input-bg)', border: `1px solid ${color ? `${color}30` : 'var(--border-color)'}`,
    borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
    color: color || 'var(--text-secondary)', transition: 'all 0.15s'
  });

  return (
    <DashboardLayout title="Track Orders & Production">
      <div style={{ padding: '1.5rem', maxWidth: '1150px', margin: '0 auto' }}>
        
        {/* Global Track Orders Search Bar */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: '14px', pointerEvents: 'none' }} />
            <input
              id="track-orders-global-search"
              placeholder="Search orders by order #, product name, model/SKU, category, size, color, customer, phone, location landmark..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '11px 40px 11px 40px',
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                fontSize: '0.88rem',
                color: 'var(--text-primary)',
                outline: 'none',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px'
                }}
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>
          {searchQuery && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '0 4px' }}>
              <span>
                {isSearching ? 'Searching complete order dataset...' : `Found ${filtered.length} order${filtered.length === 1 ? '' : 's'} matching "${searchQuery}"`}
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
              >
                Clear search
              </button>
            </div>
          )}
        </div>

        {/* Header & Filter Bar */}
        <div data-tutorial="make-track-orders" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {TRACK_ORDERS_FILTERS.map(s => {
              const count = s === 'All' ? baseOrders.length : baseOrders.filter(o => orderMatchesFilter(o, s)).length;
              const isActive = statusFilter === s;
              return (
                <button key={s} onClick={() => setStatusFilter(s)} style={{
                  padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                  fontSize: '0.8rem', fontWeight: 600,
                  background: isActive ? 'var(--accent-color)' : 'var(--input-bg, #f0f0f0)',
                  color: isActive ? 'white' : 'var(--text-secondary)', transition: 'all 0.15s'
                }}>
                  {s} {s !== 'All' && `(${count})`}
                </button>
              );
            })}
          </div>
          <button onClick={fetchOrders} style={{ ...smallBtn(), padding: '8px 14px' }}>
            <RefreshCw size={15} /> Refresh Orders
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Loading orders...</div>
        ) : ordersLoadError ? (
          <div role="alert" style={{ padding: '1.25rem', marginTop: '1rem', borderRadius: 10, color: '#b91c1c', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <strong>Could not load Track Orders.</strong> {ordersLoadError}
            <button type="button" onClick={() => { setLoading(true); void fetchOrders(); }} style={{ marginLeft: 12, ...smallBtn('#b91c1c') }}>Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <ClipboardList size={48} style={{ opacity: 0.3, marginBottom: '12px', color: 'var(--accent-color)' }} />
            <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem' }}>No orders found</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Orders submitted via the Sales Portal or MAKE module will appear here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {filtered.map(order => {
              const approvalCfg = approvalBadgeColors[order.approval_status || ''] || {
                bg: 'rgba(107, 114, 128, 0.1)', text: '#6b7280', border: 'rgba(107, 114, 128, 0.3)', label: order.approval_status || 'Standard'
              };

              return (
                <motion.div key={order.id} layout
                  style={{ 
                    background: 'var(--card-bg)', 
                    border: `1px solid ${order.approval_status === 'modification_pending_approval' ? 'rgba(249,115,22,0.4)' : 'var(--border-color)'}`, 
                    borderRadius: '14px', 
                    overflow: 'hidden',
                    boxShadow: order.approval_status === 'modification_pending_approval' ? '0 4px 20px rgba(249,115,22,0.08)' : '0 2px 8px rgba(0,0,0,0.03)'
                  }}>
                  
                  {/* Order Main Row */}
                  <div onClick={() => loadExpanded(order.id)}
                    style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', transition: 'background 0.15s' }}>
                    
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                          {order.furniture_name}
                        </span>
                        {order.order_number && (
                          <span style={{ fontSize: '0.78rem', fontFamily: 'monospace', fontWeight: 700, padding: '2px 8px', background: 'rgba(99,102,241,0.1)', color: 'var(--accent-color)', borderRadius: '6px' }}>
                            {order.order_number}
                          </span>
                        )}
                        <span style={chipStyle(statusColors[order.status] || '#6b7280')}>{order.status}</span>
                        
                        {/* Approval Status Badge */}
                        <span style={{ 
                          fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', 
                          background: approvalCfg.bg, color: approvalCfg.text, border: `1px solid ${approvalCfg.border}` 
                        }}>
                          {approvalCfg.label}
                        </span>

                        {/* Version Indicator */}
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 7px', background: 'var(--input-bg)', borderRadius: '12px', color: 'var(--text-secondary)' }}>
                          v{order.current_version || 1} {order.approved_version ? `(Approved v${order.approved_version})` : ''}
                        </span>

                        {/* Hold & Admin Override Badges */}
                        {order.production_hold && order.admin_approval_status !== 'approved' && (
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 800, padding: '3px 9px', borderRadius: '20px',
                            background: 'rgba(239, 68, 68, 0.12)', color: '#dc2626', border: '1px solid rgba(239, 68, 68, 0.35)',
                            display: 'inline-flex', alignItems: 'center', gap: '4px'
                          }}>
                            ⛔ HOLD ACTIVE
                          </span>
                        )}

                        {order.production_hold && order.admin_approval_status === 'pending' && (
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 800, padding: '3px 9px', borderRadius: '20px',
                            background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1', border: '1px solid rgba(99, 102, 241, 0.35)',
                            display: 'inline-flex', alignItems: 'center', gap: '4px'
                          }}>
                            ⏳ APPROVAL PENDING
                          </span>
                        )}

                        {order.admin_approval_status === 'approved' && (
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 800, padding: '3px 9px', borderRadius: '20px',
                            background: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.35)',
                            display: 'inline-flex', alignItems: 'center', gap: '4px'
                          }}>
                            ✓ OVERRIDE APPROVED
                          </span>
                        )}

                        {pricingPerms.canViewSalePrice && order.payment_status && (
                          <span style={{
                            fontSize: '0.70rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px',
                            textTransform: 'uppercase',
                            background: order.payment_status === 'paid' ? 'rgba(16, 185, 129, 0.12)' : (order.payment_status === 'partial' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.1)'),
                            color: order.payment_status === 'paid' ? '#059669' : (order.payment_status === 'partial' ? '#d97706' : '#dc2626'),
                            border: `1px solid ${order.payment_status === 'paid' ? 'rgba(16, 185, 129, 0.25)' : (order.payment_status === 'partial' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(239, 68, 68, 0.25)')}`
                          }}>
                            {order.payment_status}
                          </span>
                        )}
                      </div>

                      {/* Meta info tags */}
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {order.customer_name && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-primary)', fontWeight: 600 }}>
                            <User size={14} color="var(--accent-color)" /> {order.customer_name}
                          </span>
                        )}
                        {order.location_landmark && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ea580c' }}>
                            <MapPin size={13} /> {order.location_landmark}
                          </span>
                        )}
                        {order.reference_bill_no && (
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                            Ref Bill: <strong style={{ fontFamily: 'monospace' }}>#{order.reference_bill_no}</strong>
                          </span>
                        )}
                        <span>Qty: <strong>{order.quantity}</strong></span>
                        <span>Designer: <strong>{order.designer_name}</strong></span>
                        <span style={{ color: (order.target_delivery_date || order.delivery_date) ? 'var(--accent-color)' : 'inherit', fontWeight: (order.target_delivery_date || order.delivery_date) ? 600 : 400 }}>
                          Target Delivery: {(order.target_delivery_date || order.delivery_date) ? new Date(order.target_delivery_date || order.delivery_date!).toLocaleDateString() : 'TBD'} {order.target_delivery_days ? `(${order.target_delivery_days}d)` : ''}
                        </span>
                        {order.requested_delivery_date && (
                          <span style={{ color: '#0284c7', fontWeight: 600 }}>
                            Req. Delivery: {new Date(order.requested_delivery_date).toLocaleDateString()}
                          </span>
                        )}
                        {pricingPerms.canViewCostPrice && (
                          order.cost_price ? (
                            <span style={{ color: '#059669', fontWeight: 700 }}>
                              Cost: ৳{Number(order.cost_price).toLocaleString()}
                            </span>
                          ) : (
                            <span style={{ color: '#ca8a04', fontWeight: 600, fontStyle: 'italic' }}>
                              Cost Price Needed
                            </span>
                          )
                        )}
                        {pricingPerms.canViewSalePrice && order.sale_price && (
                          <span style={{ color: 'var(--accent-color)', fontWeight: 700 }}>
                            Sale: ৳{Number(order.sale_price).toLocaleString()}
                          </span>
                        )}
                        {order.amount_due !== undefined && order.amount_due > 0 && (
                          <span style={{ color: '#ea580c', fontWeight: 700 }}>
                            Due: ৳{Number(order.amount_due).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                      {pricingPerms.canEnterInitialPayment && (
                        <button onClick={() => handleOpenPaymentModal(order)} style={{ ...smallBtn('#10b981'), display: 'flex', alignItems: 'center', gap: '4px' }} title="Record Payment">
                          <DollarSign size={13} /> Pay
                        </button>
                      )}

                      {!isFactoryManager && (
                        <button onClick={() => handleDuplicateOrder(order)} style={{ ...smallBtn('var(--accent-color)'), display: 'flex', alignItems: 'center', gap: '4px' }} title="Duplicate Order to new Place Order draft">
                          <Copy size={13} /> Duplicate
                        </button>
                      )}

                      <button onClick={() => handleOpenVersionDiff(order)} style={smallBtn('#6366f1')} title="View Version Diff & History">
                        <History size={14} /> Diff
                      </button>

                      {['priced', 'awaiting_sales_approval', 'modification_pending_approval'].includes((order.approval_status || '').toLowerCase()) && canApproveMakeOrder && (Number(order.amount_due || 0) <= 0 || order.admin_approval_status === 'approved') && (
                        <button onClick={() => handleApprove(order.id)} disabled={approving} style={smallBtn('#22c55e')}>
                          <CheckCircle size={14} /> {approving ? 'Approving...' : 'Approve'}
                        </button>
                      )}

                      {canAlter(order) && (
                        <button onClick={() => setAlterOrder(order)} style={smallBtn('#f97316')}>
                          <Edit2 size={14} /> Alter
                        </button>
                      )}

                      {canDeleteOrder && (
                        <button onClick={() => handleDelete(order.id)} style={smallBtn('#ef4444')} title="Delete or Cancel Order">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    {expandedId === order.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>

                  {/* Expanded Details Section */}
                  <AnimatePresence>
                    {expandedId === order.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary, rgba(0,0,0,0.01))' }}>
                        <div style={{ padding: '24px' }}>

                          {expandedLoadError && (
                            <div role="alert" style={{ padding: '12px 14px', marginBottom: 16, borderRadius: 8, color: '#b91c1c', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                              Could not load all database details for this order: {expandedLoadError}
                            </div>
                          )}
                          {/* ── TOP ROW: LOGISTICS & ORDER SPECS SUMMARY ── */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px', marginBottom: '20px' }}>
                            
                            {/* Customer & Delivery Logistics Card */}
                            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' }}>
                              <h4 style={{ margin: '0 0 12px', fontSize: '0.88rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-color)' }}>
                                <MapPin size={16} /> Customer &amp; Delivery Logistics
                              </h4>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.84rem' }}>
                                <div>
                                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>Customer:</span>
                                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{order.customer_name || 'Standard Client'}</div>
                                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{order.customer_phone} {order.customer_email ? `• ${order.customer_email}` : ''}</div>
                                </div>
                                {(order.receiver_name || order.receiver_phone) && (
                                  <div style={{ background: 'var(--input-bg)', padding: '8px 10px', borderRadius: '8px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase' }}>Receiver:</span>
                                    <div style={{ fontWeight: 600 }}>{order.receiver_name || 'Same as customer'}</div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{order.receiver_phone}</div>
                                  </div>
                                )}
                                {order.shipping_address && (
                                  <div>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>Full Delivery Address:</span>
                                    <div style={{ color: 'var(--text-primary)', lineHeight: 1.3 }}>{order.shipping_address}</div>
                                  </div>
                                )}
                                {order.location_landmark && (
                                  <div style={{ background: 'rgba(249,115,22,0.08)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(249,115,22,0.2)' }}>
                                    <span style={{ color: '#ea580c', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Delivery Landmark:</span>
                                    <div style={{ fontWeight: 700, color: '#c2410c' }}>📍 {order.location_landmark}</div>
                                  </div>
                                )}
                                {order.reference_bill_no && (
                                  <div style={{ background: 'rgba(59,130,246,0.06)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)' }}>
                                    <span style={{ color: '#0284c7', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Reference Bill Number:</span>
                                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>#{order.reference_bill_no}</div>
                                  </div>
                                )}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
                                  <div>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>Target Delivery:</span>
                                    <div style={{ fontWeight: 700, color: 'var(--accent-color)' }}>
                                      {(order.target_delivery_date || order.delivery_date) ? new Date(order.target_delivery_date || order.delivery_date!).toLocaleDateString() : 'Not Set'} {order.target_delivery_days ? `(${order.target_delivery_days} days)` : ''}
                                    </div>
                                  </div>
                                  {order.requested_delivery_date && (
                                    <div>
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>Client Requested:</span>
                                      <div style={{ fontWeight: 600, color: '#0284c7' }}>
                                        {new Date(order.requested_delivery_date).toLocaleDateString()}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Order & Salesperson Overview Card */}
                            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' }}>
                              <h4 style={{ margin: '0 0 12px', fontSize: '0.88rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-color)' }}>
                                <ClipboardList size={16} /> Order &amp; Production Overview
                              </h4>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.84rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                  <div>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>Order Number:</span>
                                    <div style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>{order.order_number || `#${order.id}`}</div>
                                  </div>
                                  <div>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>Salesperson:</span>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{order.salesman_name || 'Unassigned / Internal'}</div>
                                  </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                  <div>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>Assigned Designer:</span>
                                    <div style={{ fontWeight: 600 }}>{order.designer_name || '—'}</div>
                                  </div>
                                  <div>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>Version State:</span>
                                    <div style={{ fontWeight: 700, color: 'var(--accent-color)' }}>
                                      v{order.current_version || 1} {order.approved_version ? `(Approved: v${order.approved_version})` : '(Unapproved)'}
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>Approval Status:</span>
                                  <div style={{ marginTop: '3px' }}>
                                    <span style={chipStyle(approvalBadgeColors[order.approval_status || 'pending_pricing']?.text || '#ca8a04')}>
                                      {approvalBadgeColors[order.approval_status || 'pending_pricing']?.label || order.approval_status || 'Pending Pricing'}
                                    </span>
                                  </div>
                                </div>
                                {order.special_instructions && (
                                  <div style={{ marginTop: '2px', background: 'var(--input-bg)', padding: '8px 10px', borderRadius: '8px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>Client Special Instructions:</span>
                                    <div style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '2px' }}>{order.special_instructions}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* ── FULL-WIDTH CATALOG PRODUCTS, DRAWINGS & PER-PRODUCT PRICING ── */}
                          {(() => {
                            const liveTotalCost = orderItems.length > 0
                              ? orderItems.reduce((acc, it) => {
                                  const c = parseFloat(itemCostPrices[it.id] !== undefined ? itemCostPrices[it.id] : String(it.item_cost_price || it.unit_cost_price || 0));
                                  return acc + (isNaN(c) ? 0 : c * (it.quantity || 1));
                                }, 0)
                              : (parseFloat(costPrices[order.id] || '0') || 0);

                            const liveTotalSale = orderItems.length > 0
                              ? orderItems.reduce((acc, it) => {
                                  const s = parseFloat(itemSalePrices[it.id] !== undefined ? itemSalePrices[it.id] : String(it.item_sale_price || it.unit_sale_price || 0));
                                  return acc + (isNaN(s) ? 0 : s * (it.quantity || 1));
                                }, 0)
                              : (parseFloat(salePrices[order.id] || '0') || 0);

                            const totalUnitsCount = orderItems.length > 0
                              ? orderItems.reduce((acc, it) => acc + (it.quantity || 1), 0)
                              : (order.quantity || 1);

                            return (
                              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px', marginBottom: '24px', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
                                
                                {/* Section Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                                  <div>
                                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                                      <Layers size={18} color="var(--accent-color)" /> Catalog Products, Technical Drawings &amp; Pricing ({orderItems.length || 1} Product{orderItems.length === 1 ? '' : 's'})
                                    </h4>
                                    <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                      Furniture designers must enter cost &amp; sale prices individually for each catalog item, and attach technical drawings directly to each individual product.
                                    </p>
                                  </div>
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--input-bg)', padding: '4px 12px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
                                      Total Order Units: {totalUnitsCount} pcs
                                    </span>
                                  </div>
                                </div>

                                {loadingItems ? (
                                  <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                                    Loading product specifications and technical drawings...
                                  </div>
                                ) : orderItems.length === 0 ? (
                                  /* Legacy Order Fallback (Single Product) */
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                                      <div>
                                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{order.furniture_name}</div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '4px' }}>{order.description || 'Standard custom furniture item.'}</div>
                                      </div>
                                      <span style={{ padding: '4px 12px', background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)', fontWeight: 700, fontSize: '0.82rem' }}>
                                        Qty: {order.quantity}
                                      </span>
                                    </div>

                                    {/* Drawing Attachment Tray for Legacy Order */}
                                    <div style={{ background: 'var(--card-bg)', borderRadius: '8px', padding: '12px', border: '1px solid var(--border-color)' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: pdfs.length > 0 ? '10px' : '0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700 }}>
                                          <FileText size={15} color="var(--accent-color)" />
                                          Technical Drawing &amp; CAD Blueprints ({pdfs.length})
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleUploadPdf(order.id)}
                                          disabled={pdfLoading}
                                          style={{ ...smallBtn('var(--accent-color)'), padding: '4px 10px', fontSize: '0.78rem' }}
                                        >
                                          <Upload size={13} /> {pdfLoading ? 'Uploading...' : '+ Attach Technical Drawing'}
                                        </button>
                                      </div>
                                      {pdfs.length > 0 && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px', marginTop: '8px' }}>
                                          {pdfs.map(pdf => (
                                            <div key={pdf.path} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.8rem' }}>
                                              <FileText size={14} color="#f97316" style={{ flexShrink: 0 }} />
                                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={pdf.name}>{pdf.name}</span>
                                              {pdf.isPending && (
                                                <span style={{ fontSize: '0.65rem', background: '#f59e0b', color: '#fff', padding: '1px 5px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.5px', flexShrink: 0 }}>
                                                  PENDING
                                                </span>
                                              )}
                                              <div style={{ display: 'flex', gap: '4px' }}>
                                                <button
                                                  onClick={() => {
                                                    if (pdf.isPending || !pdf.url) {
                                                      alert('This attachment is currently staged locally and waiting for background synchronization.');
                                                      return;
                                                    }
                                                    setPdfViewer(pdf);
                                                  }}
                                                  disabled={pdf.isPending || !pdf.url}
                                                  style={{ ...smallBtn('#3b82f6'), opacity: (pdf.isPending || !pdf.url) ? 0.5 : 1, cursor: (pdf.isPending || !pdf.url) ? 'not-allowed' : 'pointer' }}
                                                  title={pdf.isPending ? 'Pending synchronization' : 'View Drawing'}
                                                >
                                                  <Eye size={12} />
                                                </button>
                                                <button
                                                  onClick={() => handleDownloadPdf(pdf)}
                                                  disabled={pdf.isPending || !pdf.url}
                                                  style={{ ...smallBtn('#10b981'), opacity: (pdf.isPending || !pdf.url) ? 0.5 : 1, cursor: (pdf.isPending || !pdf.url) ? 'not-allowed' : 'pointer' }}
                                                  title={pdf.isPending ? 'Pending synchronization' : 'Download Drawing'}
                                                >
                                                  <Download size={12} />
                                                </button>
                                                {userRole === 'admin' && (
                                                  <button onClick={() => handleDeletePdf(order.id, pdf.path)} style={smallBtn('#ef4444')} title="Remove Drawing"><Trash2 size={12} /></button>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Designer Pricing for Legacy Order */}
                                    {pricingPerms.canEditCostPrice && (
                                      <div style={{ display: 'grid', gridTemplateColumns: pricingPerms.canViewSalePrice ? '1.2fr 1.2fr 1.5fr' : '1.2fr 1.5fr', gap: '12px', alignItems: 'flex-end', paddingTop: '4px' }}>
                                        <div>
                                          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#dc2626', marginBottom: '4px', textTransform: 'uppercase' }}>
                                            * Unit Cost Price (৳) [Required]
                                          </label>
                                          <input
                                            type="number"
                                            min={1}
                                            placeholder="Enter unit cost..."
                                            value={costPrices[order.id] !== undefined ? costPrices[order.id] : (order.cost_price ? String(Math.round(order.cost_price / (order.quantity || 1))) : '')}
                                            onChange={e => setCostPrices({ ...costPrices, [order.id]: e.target.value })}
                                            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 700, boxSizing: 'border-box' }}
                                          />
                                        </div>
                                        {pricingPerms.canViewSalePrice && (
                                          <div>
                                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                                              Unit Sale Price (৳) [Optional]
                                            </label>
                                            <input
                                              type="number"
                                              min={1}
                                              placeholder="Enter unit sale..."
                                              value={salePrices[order.id] !== undefined ? salePrices[order.id] : (order.sale_price ? String(Math.round(order.sale_price / (order.quantity || 1))) : '')}
                                              onChange={e => setSalePrices({ ...salePrices, [order.id]: e.target.value })}
                                              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 700, boxSizing: 'border-box' }}
                                            />
                                          </div>
                                        )}
                                        <div style={{ background: 'var(--card-bg)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.78rem' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Total Cost ({order.quantity}x):</span>
                                            <strong style={{ color: '#059669' }}>
                                              ৳{((parseFloat(costPrices[order.id] || '0') || 0) * (order.quantity || 1)).toLocaleString()}
                                            </strong>
                                          </div>
                                          {pricingPerms.canViewSalePrice && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                                              <span style={{ color: 'var(--text-secondary)' }}>Total Sale:</span>
                                              <strong style={{ color: 'var(--accent-color)' }}>
                                                {(parseFloat(salePrices[order.id] || '0') > 0) ? `৳${((parseFloat(salePrices[order.id] || '0') || 0) * (order.quantity || 1)).toLocaleString()}` : '—'}
                                              </strong>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  /* Multi-Item Catalog Products List */
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {(orderItems || []).map((item, idx) => {
                                      const itemCostVal = itemCostPrices[item.id] !== undefined
                                        ? itemCostPrices[item.id]
                                        : (item.item_cost_price !== undefined && item.item_cost_price !== null && item.item_cost_price > 0 ? String(item.item_cost_price) : (item.unit_cost_price ? String(item.unit_cost_price) : ''));
                                      const itemSaleVal = itemSalePrices[item.id] !== undefined
                                        ? itemSalePrices[item.id]
                                        : (item.item_sale_price !== undefined && item.item_sale_price !== null && item.item_sale_price > 0 ? String(item.item_sale_price) : (item.unit_sale_price ? String(item.unit_sale_price) : ''));
                                      const itemNotesVal = itemDesignerNotes[item.id] !== undefined
                                        ? itemDesignerNotes[item.id]
                                        : (item.designer_notes || '');

                                      const parsedCost = parseFloat(itemCostVal) || 0;
                                      const parsedSale = parseFloat(itemSaleVal) || 0;
                                      const lineCost = parsedCost * (item.quantity || 1);
                                      const lineSale = parsedSale * (item.quantity || 1);
                                      const lineMarginPct = (parsedCost > 0 && parsedSale > 0)
                                        ? (((parsedSale - parsedCost) / parsedCost) * 100).toFixed(1)
                                        : null;

                                      return (
                                        <div
                                          key={item.id || idx}
                                          style={{
                                            background: 'var(--card-bg)',
                                            border: `1.5px solid ${item.is_customized ? 'rgba(249,115,22,0.35)' : 'var(--border-color)'}`,
                                            borderRadius: '12px',
                                            padding: '16px 18px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '14px',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                                          }}
                                        >
                                          {/* Product Item Header */}
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                                            <div>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 800, fontSize: '1.02rem', color: 'var(--text-primary)' }}>
                                                  {item.product_name}
                                                </span>
                                                {item.is_customized && (
                                                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(249,115,22,0.15)', color: '#ea580c', border: '1px solid rgba(249,115,22,0.3)', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    ✨ Customized Dimensions
                                                  </span>
                                                )}
                                              </div>
                                              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                {(item.spec_details || item.spec_name) && (
                                                  <span><strong>Spec:</strong> {item.spec_details || item.spec_name}</span>
                                                )}
                                                <span>
                                                  <strong>Size / Dimensions:</strong>{' '}
                                                  <span style={{ color: item.is_customized ? '#c2410c' : 'inherit', fontWeight: item.is_customized ? 700 : 400 }}>
                                                    {item.custom_dimensions || item.dimensions_text || item.size_label || 'Standard Dimensions'}
                                                  </span>
                                                </span>
                                                {item.color_name && (
                                                  <span><strong>Color / Finish:</strong> {item.color_name}</span>
                                                )}
                                                {item.salesperson_note && (
                                                  <span style={{ color: '#0284c7', fontStyle: 'italic' }}>
                                                    <strong>Sales Note:</strong> {item.salesperson_note}
                                                  </span>
                                                )}
                                              </div>
                                            </div>

                                            <div style={{ padding: '4px 14px', background: 'var(--input-bg)', borderRadius: '20px', border: '1px solid var(--border-color)', fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                              Qty: {item.quantity}
                                            </div>
                                            {(isDesigner || isAdmin) && order.approval_status === 'awaiting_designer' && (
                                              <button type="button" onClick={() => handleChangeOrderItemQuantity(order.id, item)} style={smallBtn('#2563eb')} title="Change product quantity during designer review">
                                                <Edit2 size={13} /> Change Qty
                                              </button>
                                            )}
                                            {(isDesigner || isAdmin) && order.approval_status === 'awaiting_designer' && orderItems.length > 1 && (
                                              <button type="button" onClick={() => handleRemoveOrderItem(order.id, item)} style={smallBtn('#ef4444')} title="Remove this product during designer review">
                                                <Trash2 size={13} /> Remove Product
                                              </button>
                                            )}
                                          </div>

                                          {/* Individual Technical Drawings for this Catalog Item */}
                                          <div style={{ background: 'var(--input-bg)', borderRadius: '10px', padding: '12px 14px', border: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (item.drawings && item.drawings.length > 0) ? '10px' : '4px', flexWrap: 'wrap', gap: '8px' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                <FileText size={15} color="var(--accent-color)" />
                                                Individual Technical Drawing &amp; Blueprints ({item.drawings ? item.drawings.length : 0})
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => handleUploadItemPdf(order.id, item.id)}
                                                disabled={uploadingItemId === item.id}
                                                style={{
                                                  ...smallBtn('var(--accent-color)'),
                                                  padding: '5px 12px',
                                                  fontSize: '0.78rem',
                                                  cursor: uploadingItemId === item.id ? 'not-allowed' : 'pointer',
                                                  opacity: uploadingItemId === item.id ? 0.6 : 1
                                                }}
                                              >
                                                <Upload size={13} /> {uploadingItemId === item.id ? 'Uploading...' : '+ Attach Technical Drawing'}
                                              </button>
                                            </div>

                                            {(!item.drawings || item.drawings.length === 0) ? (
                                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '6px 2px' }}>
                                                No individual blueprint attached yet for {item.product_name}. Click "+ Attach Technical Drawing" to upload PDF, image, or CAD drawing.
                                              </div>
                                            ) : (
                                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '8px' }}>
                                                {item.drawings.map(d => (
                                                  <div key={d.path} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.8rem' }}>
                                                    <FileText size={14} color="#f97316" style={{ flexShrink: 0 }} />
                                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={d.name}>
                                                      {d.name}
                                                    </span>
                                                    {d.isPending && (
                                                      <span style={{ fontSize: '0.65rem', background: '#f59e0b', color: '#fff', padding: '1px 5px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.5px', flexShrink: 0 }}>
                                                        PENDING
                                                      </span>
                                                    )}
                                                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          if (d.isPending || !d.url) {
                                                            alert('This attachment is currently staged locally and waiting for background synchronization.');
                                                            return;
                                                          }
                                                          setPdfViewer(d);
                                                        }}
                                                        disabled={d.isPending || !d.url}
                                                        style={{ ...smallBtn('#3b82f6'), opacity: (d.isPending || !d.url) ? 0.5 : 1, cursor: (d.isPending || !d.url) ? 'not-allowed' : 'pointer' }}
                                                        title={d.isPending ? 'Pending synchronization' : 'View Drawing'}
                                                      >
                                                        <Eye size={12} />
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() => handleDownloadPdf(d)}
                                                        disabled={d.isPending || !d.url}
                                                        style={{ ...smallBtn('#10b981'), opacity: (d.isPending || !d.url) ? 0.5 : 1, cursor: (d.isPending || !d.url) ? 'not-allowed' : 'pointer' }}
                                                        title={d.isPending ? 'Pending synchronization' : 'Download Drawing'}
                                                      >
                                                        <Download size={12} />
                                                      </button>
                                                      <button type="button" onClick={() => handleDeleteItemPdf(order.id, item.id, d.path)} style={smallBtn('#ef4444')} title="Remove Drawing">
                                                        <Trash2 size={12} />
                                                      </button>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>

                                          {/* Individual Product Pricing & Designer Notes */}
                                          {pricingPerms.canEditCostPrice ? (
                                            <div className="make-responsive-grid-4" style={{ gap: '12px', alignItems: 'flex-end', paddingTop: '2px' }}>
                                              <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#dc2626', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                  * Unit Cost Price (৳) [Required]
                                                </label>
                                                <input
                                                  type="number"
                                                  min={1}
                                                  placeholder="e.g. 4500"
                                                  value={itemCostVal}
                                                  onChange={e => setItemCostPrices({ ...itemCostPrices, [item.id]: e.target.value })}
                                                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 700, boxSizing: 'border-box' }}
                                                />
                                              </div>

                                              {pricingPerms.canViewSalePrice && (
                                                <div>
                                                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                    Unit Sale Price (৳) [Optional]
                                                  </label>
                                                  <input
                                                    type="number"
                                                    min={1}
                                                    placeholder="e.g. 7200"
                                                    value={itemSaleVal}
                                                    onChange={e => setItemSalePrices({ ...itemSalePrices, [item.id]: e.target.value })}
                                                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 700, boxSizing: 'border-box' }}
                                                  />
                                                </div>
                                              )}

                                              {/* Line Subtotals */}
                                              <div style={{ background: 'var(--input-bg)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.78rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                  <span style={{ color: 'var(--text-secondary)' }}>Line Cost ({item.quantity}x):</span>
                                                  <strong style={{ color: '#059669' }}>
                                                    ৳{lineCost.toLocaleString()}
                                                  </strong>
                                                </div>
                                                {pricingPerms.canViewSalePrice && (
                                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                                                    <span style={{ color: 'var(--text-secondary)' }}>Line Sale:</span>
                                                    <strong style={{ color: 'var(--accent-color)' }}>
                                                      {lineSale > 0 ? `৳${lineSale.toLocaleString()}` : '—'}
                                                    </strong>
                                                  </div>
                                                )}
                                                {pricingPerms.canViewSalePrice && lineMarginPct && (
                                                  <div style={{ fontSize: '0.7rem', color: Number(lineMarginPct) >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700, marginTop: '2px', textAlign: 'right' }}>
                                                    {Number(lineMarginPct) >= 0 ? `+${lineMarginPct}% margin` : `${lineMarginPct}% loss`}
                                                  </div>
                                                )}
                                              </div>

                                              <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                  Workshop / Designer Notes
                                                </label>
                                                <input
                                                  type="text"
                                                  placeholder="e.g. 1.5mm cold rolled steel, electro-powder coating matte black..."
                                                  value={itemNotesVal}
                                                  onChange={e => setItemDesignerNotes({ ...itemDesignerNotes, [item.id]: e.target.value })}
                                                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.82rem', boxSizing: 'border-box' }}
                                                />
                                              </div>
                                            </div>
                                          ) : (
                                            <div style={{ display: 'flex', gap: '16px', fontSize: '0.82rem', paddingTop: '4px', color: 'var(--text-secondary)' }}>
                                              {pricingPerms.canViewCostPrice && (
                                                <div>Unit Cost: <strong style={{ color: '#059669' }}>{item.item_cost_price ? `৳${Number(item.item_cost_price).toLocaleString()}` : 'Pending'}</strong></div>
                                              )}
                                              {pricingPerms.canViewSalePrice && (
                                                <div>Unit Sale: <strong style={{ color: 'var(--accent-color)' }}>{item.item_sale_price ? `৳${Number(item.item_sale_price).toLocaleString()}` : 'Pending'}</strong></div>
                                              )}
                                              {pricingPerms.canViewCostPrice && (
                                                <div>Line Cost ({item.quantity}x): <strong style={{ color: '#059669' }}>৳{(Number(item.item_cost_price || 0) * item.quantity).toLocaleString()}</strong></div>
                                              )}
                                              {item.designer_notes && <div style={{ fontStyle: 'italic' }}>Note: {item.designer_notes}</div>}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* ── ORDER PRICING SUMMARY & PUBLISH BAR ── */}
                                {pricingPerms.canEditCostPrice && (
                                  <div style={{
                                    background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(249,115,22,0.06))',
                                    border: '1.5px solid var(--accent-color)',
                                    borderRadius: '12px',
                                    padding: '16px 20px',
                                    marginTop: '20px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '14px',
                                    boxShadow: '0 4px 16px rgba(99,102,241,0.08)'
                                  }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                                        <div>
                                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Total Units</span>
                                          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                            {totalUnitsCount} pcs ({orderItems.length || 1} product{orderItems.length === 1 ? '' : 's'})
                                          </div>
                                        </div>
                                        <div style={{ width: '1px', height: '30px', background: 'var(--border-color)' }} />
                                        <div>
                                          <span style={{ fontSize: '0.72rem', color: '#059669', textTransform: 'uppercase', fontWeight: 700 }}>Total Order Cost</span>
                                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>
                                            ৳{liveTotalCost.toLocaleString()}
                                          </div>
                                        </div>
                                        {pricingPerms.canViewSalePrice && (
                                          <>
                                            <div style={{ width: '1px', height: '30px', background: 'var(--border-color)' }} />
                                            <div>
                                              <span style={{ fontSize: '0.72rem', color: 'var(--accent-color)', textTransform: 'uppercase', fontWeight: 700 }}>Total Order Sale</span>
                                              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-color)' }}>
                                                {liveTotalSale > 0 ? `৳${liveTotalSale.toLocaleString()}` : 'Not Specified'}
                                              </div>
                                            </div>
                                          </>
                                        )}
                                        {pricingPerms.canViewSalePrice && liveTotalSale > liveTotalCost && (
                                          <>
                                            <div style={{ width: '1px', height: '30px', background: 'var(--border-color)' }} />
                                            <div>
                                              <span style={{ fontSize: '0.72rem', color: '#16a34a', textTransform: 'uppercase', fontWeight: 700 }}>Gross Profit</span>
                                              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#16a34a' }}>
                                                +৳{(liveTotalSale - liveTotalCost).toLocaleString()} ({(((liveTotalSale - liveTotalCost) / liveTotalCost) * 100).toFixed(1)}%)
                                              </div>
                                            </div>
                                          </>
                                        )}
                                      </div>

                                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                        Submitting will create version <strong>v{(order.current_version || 1) + 1}</strong> and trigger salesperson review
                                      </span>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center' }}>
                                      <input
                                        type="text"
                                        placeholder="Designer modification reason / notes for salesperson (e.g. Set individual raw material & fabrication costs)..."
                                        value={pricingNotes[order.id] || ''}
                                        onChange={e => setPricingNotes({ ...pricingNotes, [order.id]: e.target.value })}
                                        style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.88rem', boxSizing: 'border-box' }}
                                      />
                                      <motion.button
                                        type="button"
                                        onClick={() => handleDesignerSavePricing(order.id)}
                                        disabled={submittingPriceId === order.id}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        style={{
                                          padding: '11px 24px',
                                          background: 'linear-gradient(135deg, #f97316, #ea580c)',
                                          color: 'white',
                                          border: 'none',
                                          borderRadius: '8px',
                                          fontWeight: 700,
                                          fontSize: '0.9rem',
                                          cursor: submittingPriceId === order.id ? 'not-allowed' : 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '8px',
                                          boxShadow: '0 4px 14px rgba(249,115,22,0.3)',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        <Send size={16} /> {submittingPriceId === order.id ? 'Publishing...' : `Save & Publish Pricing (v${(order.current_version || 1) + 1})`}
                                      </motion.button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Financial, Payment & Production Hold Controls */}
                          <div style={{
                            marginBottom: '20px',
                            padding: '16px 20px',
                            background: 'var(--card-bg)',
                            border: `1px solid ${order.production_hold && order.admin_approval_status !== 'approved' ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-color)'}`,
                            borderRadius: '12px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CreditCard size={18} color="var(--accent-color)" />
                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                  Payment, Balance &amp; Production Hold Status
                                </h4>
                              </div>

                              {/* Action buttons */}
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                {pricingPerms.canEnterInitialPayment && (
                                  <>
                                    <motion.button
                                      whileHover={{ scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={() => handleOpenPaymentModal(order)}
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '7px 14px', background: 'linear-gradient(135deg, #10b981, #059669)',
                                        color: 'white', border: 'none', borderRadius: '7px', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer'
                                      }}
                                    >
                                      <DollarSign size={14} /> Record Payment
                                    </motion.button>

                                    {pricingPerms.canViewSalePrice && <button
                                      type="button"
                                      onClick={() => handleViewPayments(order)}
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                        padding: '7px 12px', background: 'var(--input-bg)', border: '1px solid var(--border-color)',
                                        borderRadius: '7px', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer'
                                      }}
                                    >
                                      <History size={13} /> Payment Logs
                                    </button>}
                                  </>
                                )}

                                {/* Admin Approval request for staff */}
                                {order.production_hold && order.admin_approval_status !== 'approved' && order.admin_approval_status !== 'pending' && (
                                  <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => handleOpenRequestApproval(order)}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                                      padding: '7px 14px', background: 'rgba(99,102,241,0.12)', color: 'var(--accent-color)',
                                      border: '1px solid rgba(99,102,241,0.3)', borderRadius: '7px', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer'
                                    }}
                                  >
                                    <Shield size={14} /> Request Admin Approval
                                  </motion.button>
                                )}

                                {/* Admin Decision Controls for Admins */}
                                {(userRole === 'admin' || userRole === 'superadmin' || pricingPerms.isAdmin || pricingPerms.isSuperadmin) && order.production_hold && (
                                  <>
                                    {order.admin_approval_status !== 'approved' && (
                                      <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => handleOpenDecideApproval(order, 'approved')}
                                        style={{
                                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                                          padding: '7px 14px', background: 'linear-gradient(135deg, #059669, #047857)',
                                          color: 'white', border: 'none', borderRadius: '7px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer'
                                        }}
                                      >
                                        <CheckCircle size={14} /> Approve Production Release
                                      </motion.button>
                                    )}

                                    {order.admin_approval_status === 'pending' && (
                                      <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => handleOpenDecideApproval(order, 'rejected')}
                                        style={{
                                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                                          padding: '7px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626',
                                          border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '7px', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer'
                                        }}
                                      >
                                        <X size={14} /> Reject Request
                                      </motion.button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Financial breakdown values */}
                            {pricingPerms.canEnterInitialPayment && !pricingPerms.canViewSalePrice && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', marginBottom: 14, borderRadius: 9, background: Number(order.amount_due || 0) > 0 ? 'rgba(234, 88, 12, 0.08)' : 'rgba(16, 185, 129, 0.08)' }}>
                                <span style={{ fontWeight: 700 }}>Payment status: {order.payment_status || 'unpaid'}</span>
                                <span style={{ fontWeight: 800, color: Number(order.amount_due || 0) > 0 ? '#ea580c' : '#059669' }}>Due: ৳{Number(order.amount_due || 0).toLocaleString()}</span>
                              </div>
                            )}
                            {pricingPerms.canViewSalePrice && (() => {
                              const orderTotalVal = Math.round((Number(order.final_price ?? order.sale_price ?? 0) + Number.EPSILON) * 100) / 100;
                              const moneyReceivedVal = Math.round((Number(order.money_received || 0) + Number.EPSILON) * 100) / 100;
                              const amountDueVal = order.amount_due !== undefined && order.amount_due !== null
                                ? Math.max(0, Math.round((Number(order.amount_due) + Number.EPSILON) * 100) / 100)
                                : Math.max(0, Math.round((orderTotalVal - moneyReceivedVal + Number.EPSILON) * 100) / 100);

                              let paymentStatusVal: 'PAID' | 'PARTIAL' | 'UNPAID' = 'UNPAID';
                              if (order.payment_status) {
                                const norm = String(order.payment_status).toUpperCase();
                                if (norm === 'PAID') paymentStatusVal = 'PAID';
                                else if (norm === 'PARTIAL') paymentStatusVal = 'PARTIAL';
                                else paymentStatusVal = 'UNPAID';
                              } else {
                                if (amountDueVal === 0 && (orderTotalVal > 0 || moneyReceivedVal > 0)) {
                                  paymentStatusVal = 'PAID';
                                } else if (moneyReceivedVal > 0 && amountDueVal > 0) {
                                  paymentStatusVal = 'PARTIAL';
                                } else {
                                  paymentStatusVal = 'UNPAID';
                                }
                              }

                              return (
                                <div style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                  gap: '12px',
                                  marginBottom: '14px',
                                  background: 'var(--bg-secondary)',
                                  padding: '12px 16px',
                                  borderRadius: '10px',
                                  border: '1px solid var(--border-color)'
                                }}>
                                  <div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Order Total</div>
                                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--accent-color)' }}>
                                      ৳{orderTotalVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Money Received / Amount Paid</div>
                                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669' }}>
                                      ৳{moneyReceivedVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Amount Due</div>
                                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: amountDueVal > 0 ? '#ea580c' : '#059669' }}>
                                      ৳{amountDueVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Payment Status</div>
                                    <div style={{ marginTop: '2px' }}>
                                      <span style={{
                                        display: 'inline-block',
                                        padding: '3px 10px',
                                        borderRadius: '12px',
                                        fontWeight: 800,
                                        fontSize: '0.74rem',
                                        textTransform: 'uppercase',
                                        background: paymentStatusVal === 'PAID' ? 'rgba(16, 185, 129, 0.15)' : (paymentStatusVal === 'PARTIAL' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)'),
                                        color: paymentStatusVal === 'PAID' ? '#059669' : (paymentStatusVal === 'PARTIAL' ? '#d97706' : '#dc2626'),
                                        border: `1px solid ${paymentStatusVal === 'PAID' ? 'rgba(16, 185, 129, 0.3)' : (paymentStatusVal === 'PARTIAL' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)')}`
                                      }}>
                                        {paymentStatusVal}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Production Hold Status Notification Box */}
                            {order.production_hold && order.admin_approval_status !== 'approved' ? (
                              <div style={{
                                padding: '12px 14px',
                                borderRadius: '8px',
                                background: 'rgba(245, 158, 11, 0.1)',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px'
                              }}>
                                <AlertCircle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div style={{ fontSize: '0.82rem', color: '#b45309', lineHeight: 1.45 }}>
                                  <strong>⛔ Production Hold Active:</strong> {order.hold_reason || `An outstanding balance of ৳${(order.amount_due || 0).toLocaleString()} remains unpaid.`} Workshop production cannot advance until the balance is cleared or an Admin approves an override.
                                  {order.admin_approval_status === 'pending' && (
                                    <div style={{ marginTop: '4px', fontWeight: 700, color: '#6366f1' }}>
                                      ⏳ Staff requested Admin Approval for production release. Awaiting decision.
                                    </div>
                                  )}
                                  {order.admin_approval_status === 'rejected' && (
                                    <div style={{ marginTop: '4px', fontWeight: 700, color: '#dc2626' }}>
                                      ❌ Previous production release request was rejected by admin.
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : order.admin_approval_status === 'approved' ? (
                              <div style={{
                                padding: '12px 14px',
                                borderRadius: '8px',
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.35)',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px'
                              }}>
                                <CheckCircle size={18} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div style={{ fontSize: '0.82rem', color: '#047857', lineHeight: 1.45 }}>
                                  <strong>✓ Production Override Active:</strong> Admin approved production release. Factory manager is authorized to begin and advance manufacturing stages.
                                  {order.admin_approval_notes && (
                                    <div style={{ marginTop: '3px', fontStyle: 'italic', color: '#065f46' }}>
                                      Note: {order.admin_approval_notes}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </div>

                          {/* Lower Grid: Timeline + Update Status */}
                          <div className="make-responsive-grid-2" style={{ gap: '24px' }}>

                            {/* Left: Timeline */}
                            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' }}>
                              <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 700 }}>Status Timeline</h4>
                              {order.description && (
                                <div style={{ background: 'var(--input-bg)', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  {order.description}
                                </div>
                              )}
                              <div style={{ position: 'relative', paddingLeft: '20px' }}>
                                {(updates || []).map((upd, i) => (
                                  <div key={upd.id} style={{ position: 'relative', paddingBottom: i < (updates || []).length - 1 ? '16px' : '0' }}>
                                    {i < (updates || []).length - 1 && <div style={{ position: 'absolute', left: '-14px', top: '18px', width: '2px', height: 'calc(100%)', background: 'var(--border-color)' }} />}
                                    <div style={{ position: 'absolute', left: '-18px', top: '4px', width: '10px', height: '10px', borderRadius: '50%', background: statusColors[upd.status] || '#6b7280', border: '2px solid var(--card-bg)' }} />
                                    <div>
                                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: statusColors[upd.status] || 'var(--text-primary)' }}>{upd.status}</span>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{upd.updated_by} • {new Date(upd.created_at).toLocaleString()}</div>
                                      {upd.note && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px', fontStyle: 'italic' }}>{upd.note}</div>}
                                      {!isSalesperson && upd.photo_url && (
                                        <div style={{ marginTop: '8px' }}>
                                          <img 
                                            src={resolveImageSrc(upd.photo_url)} 
                                            onError={e => handleImageLoadError(e, upd.photo_url)} 
                                            alt="Stage Photo" 
                                            onClick={() => setPdfViewer({ url: upd.photo_url!, name: `${upd.status || 'Stage'} Photo`, path: '' })}
                                            style={{ width: '100px', height: '70px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color)', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
                                            title="Click to view full photo"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Right: Production Progress & Factory Manager Workbench */}
                            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Layers size={16} color="var(--accent-color)" /> Production Stage Progress
                                </h4>
                                {order.factory_manager_name && (
                                  <span style={{ fontSize: '0.74rem', background: 'rgba(99,102,241,0.1)', color: 'var(--accent-color)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                                    Lead: {order.factory_manager_name}
                                  </span>
                                )}
                              </div>

                              {/* Latest Stage Live Photo Banner */}
                              {(() => {
                                const displayPhoto = !isSalesperson ? (order.current_stage_photo || (updates || []).slice().reverse().find(u => u.photo_url)?.photo_url) : null;
                                if (!displayPhoto) return null;
                                return (
                                  <div style={{ marginBottom: '14px', position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}>
                                    <img
                                      src={resolveImageSrc(displayPhoto)}
                                      onError={e => handleImageLoadError(e, displayPhoto)}
                                      alt="Current Stage"
                                      onClick={() => setPdfViewer({ url: displayPhoto, name: `${order.status} Live Photo`, path: '' })}
                                      style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block', cursor: 'pointer' }}
                                      title="Click to inspect latest stage photo"
                                    />
                                    <div style={{ position: 'absolute', bottom: 0, insetInline: 0, padding: '6px 10px', background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', color: '#fff', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ fontWeight: 600 }}>Latest Photo ({order.status})</span>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.74rem' }} onClick={() => setPdfViewer({ url: displayPhoto, name: `${order.status} Live Photo`, path: '' })}>
                                        <Eye size={13} /> View Enlarge
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}

                              {order.status === 'Delivered' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', fontSize: '0.9rem', padding: '12px', background: 'rgba(5,150,105,0.08)', borderRadius: '10px' }}>
                                  <CheckCircle size={18} /> Order completed and delivered
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                  {canControlFactory ? (
                                    <>
                                      <div>
                                        <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                                          Factory Production Stage
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                          <select 
                                            value={selectedStage} 
                                            onChange={(e) => setSelectedStage(e.target.value)}
                                            style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.9rem', appearance: 'none', outline: 'none' }}>
                                            {PRODUCTION_STAGES.map((s, idx) => {
                                              const curIdx = getStageIndex(order.status);
                                              const isPast = curIdx >= 0 && idx < curIdx;
                                              const isCurrent = idx === curIdx;
                                              const isNext = (curIdx === -1 && idx === 0) || (idx === curIdx + 1);
                                              const isLocked = !isPast && !isCurrent && !isNext;
                                              let label = `${idx + 1}. ${s}`;
                                              if (isCurrent) label += ' (Current)';
                                              else if (isNext) label += ' ➔ (Next Sequential)';
                                              else if (isPast) label += ' ✓ (Done)';
                                              else if (isLocked) label += ' 🔒 (Locked: Sequential)';
                                              return (
                                                <option key={s} value={s} disabled={isLocked}>{label}</option>
                                              );
                                            })}
                                          </select>
                                          <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                                        </div>
                                      </div>

                                      {/* Stored Photo Picker for PC */}
                                      <div>
                                        <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                                          Stage Photo (Stored PC Image)
                                        </label>
                                        {!stagePhotoPreview ? (
                                          <button 
                                            type="button"
                                            disabled={uploadingStagePhoto}
                                            onClick={() => handlePickStagePhotoNative(order.id)}
                                            style={{ 
                                              width: '100%',
                                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                              padding: '10px 14px', border: '1px dashed var(--accent-color)', borderRadius: '8px',
                                              background: 'rgba(99,102,241,0.05)', color: 'var(--accent-color)', cursor: uploadingStagePhoto ? 'wait' : 'pointer', opacity: uploadingStagePhoto ? 0.75 : 1,
                                              fontSize: '0.84rem', fontWeight: 600, transition: 'all 0.2s'
                                            }}>
                                            {uploadingStagePhoto ? <><RefreshCw size={15} className="upload-spinner" /> Uploading stage photo…</> : <><Upload size={15} /> Select Stage Photo via Secure File Picker</>}
                                          </button>
                                        ) : (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                            <img 
                                              src={resolveImageSrc(stagePhotoPreview)}
                                              alt="Preview" 
                                              onClick={() => setPdfViewer({ url: stagePhotoPreview, name: 'Stage Photo Preview', path: '' })}
                                              style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer' }} 
                                            />
                                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                                {stagePhotoFile?.name || 'Selected photo'}
                                              </div>
                                              <div style={{ fontSize: '0.72rem', color: '#10b981' }}>Ready to upload with stage</div>
                                            </div>
                                            <button type="button" onClick={handleClearStagePhoto} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }} title="Remove photo">
                                              <X size={16} />
                                            </button>
                                          </div>
                                        )}
                                      </div>

                                      <div>
                                        <textarea 
                                          placeholder="Add workshop / stage notes or remarks..." 
                                          value={stageNote} 
                                          onChange={(e) => setStageNote(e.target.value)} 
                                          rows={2}
                                          style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} 
                                        />
                                      </div>

                                      {order.production_hold && order.admin_approval_status !== 'approved' && (
                                        <div style={{
                                          padding: '10px 12px',
                                          background: 'rgba(239, 68, 68, 0.1)',
                                          border: '1px solid rgba(239, 68, 68, 0.3)',
                                          borderRadius: '8px',
                                          color: '#dc2626',
                                          fontSize: '0.8rem',
                                          marginBottom: '8px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px'
                                        }}>
                                          <AlertCircle size={15} />
                                          <span><strong>Stage Advance Locked:</strong> Order is on Production Hold due to unpaid balance. Admin approval or payment is required to advance.</span>
                                        </div>
                                      )}

                                      <motion.button
                                        onClick={() => handleUpdateProductionStage(order.id)}
                                        disabled={updatingStage || uploadingStagePhoto || Boolean(order.production_hold && order.admin_approval_status !== 'approved')}
                                        whileHover={{ scale: (updatingStage || (order.production_hold && order.admin_approval_status !== 'approved')) ? 1 : 1.01 }}
                                        whileTap={{ scale: (updatingStage || (order.production_hold && order.admin_approval_status !== 'approved')) ? 1 : 0.98 }}
                                        style={{
                                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                          padding: '11px', background: (order.production_hold && order.admin_approval_status !== 'approved') ? '#94a3b8' : (statusColors[selectedStage] || 'var(--accent-color)'),
                                          color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.88rem',
                                          cursor: (updatingStage || (order.production_hold && order.admin_approval_status !== 'approved')) ? 'not-allowed' : 'pointer',
                                          opacity: (updatingStage || (order.production_hold && order.admin_approval_status !== 'approved')) ? 0.6 : 1,
                                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                                        }}>
                                        <Send size={15} /> {updatingStage ? 'Updating Stage & Notifying...' : (order.production_hold && order.admin_approval_status !== 'approved') ? 'Locked by Production Hold' : `Update Stage to "${selectedStage}"`}
                                      </motion.button>
                                    </>
                                  ) : (
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '12px', background: 'var(--input-bg)', borderRadius: '8px' }}>
                                      Current Status: <strong>{order.status}</strong>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Parts / Dimensions */}
                          {parts.length > 0 && (
                            <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                              <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Ruler size={15} /> Workshop Parts &amp; Cut Dimensions
                              </h4>
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                  <thead>
                                    <tr style={{ background: 'var(--bg-secondary)' }}>
                                      {['Part Name', 'Length', 'Width', 'Height', 'Notes'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(parts || []).map((p, i) => (
                                      <tr key={p.id} style={{ borderTop: '1px solid var(--border-color)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                                        <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{p.part_name}</td>
                                        <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{p.length || '—'}</td>
                                        <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{p.width || '—'}</td>
                                        <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{p.height || '—'}</td>
                                        <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontStyle: p.notes ? 'normal' : 'italic', opacity: p.notes ? 1 : 0.5 }}>{p.notes || 'No notes'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* PDF Attachments */}
                          <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FileText size={15} /> Technical PDF Drawings &amp; Blueprints ({(pdfs || []).length})
                              </h4>
                              <button onClick={() => handleUploadPdf(order.id)} disabled={pdfLoading}
                                style={{ ...smallBtn(), display: 'flex', alignItems: 'center', gap: '5px' }}>
                                {pdfLoading ? 'Uploading...' : '+ Attach PDF'}
                              </button>
                            </div>
                            {(!pdfs || pdfs.length === 0) ? (
                              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', opacity: 0.6 }}>No technical PDFs attached.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {(pdfs || []).map(pdf => (
                                  <div key={pdf.path} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.18)', borderRadius: '8px' }}>
                                    <FileText size={15} color="#f97316" />
                                    <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdf.name}</span>
                                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                      <button onClick={() => setPdfViewer(pdf)} style={smallBtn('#3b82f6')} title="View PDF">
                                        <Eye size={13} /> View
                                      </button>
                                      <button onClick={() => handleDownloadPdf(pdf)} style={smallBtn('#10b981')} title="Download PDF">
                                        <Download size={13} /> Download
                                      </button>
                                      {userRole === 'admin' && (
                                        <button onClick={() => handleDeletePdf(order.id, pdf.path)} style={smallBtn('#ef4444')} title="Delete PDF">
                                          <Trash2 size={13} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Invoice Attachments & Documents */}
                          {Array.isArray(order.invoice_attachment_urls) && order.invoice_attachment_urls.length > 0 && (
                            <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Paperclip size={15} color="var(--accent-color)" /> Invoice Attachments &amp; Documents ({order.invoice_attachment_urls.length})
                                </h4>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {order.invoice_attachment_urls.map((attUrl, attIdx) => {
                                  const attName = attUrl.split('/').pop()?.replace(/^\d+_/, '')?.split('?')[0] || `Invoice Attachment #${attIdx + 1}`;
                                  const isPdf = attUrl.toLowerCase().endsWith('.pdf') || attUrl.toLowerCase().includes('.pdf?');
                                  const isPending = attUrl.startsWith('upl_') || !attUrl.startsWith('http') || attUrl.includes('make-order-files/');
                                  return (
                                    <div key={attUrl + attIdx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: '8px' }}>
                                      {isPdf ? <FileText size={15} color="#3b82f6" /> : <Paperclip size={15} color="var(--accent-color)" />}
                                      <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attName}</span>
                                      {isPending && (
                                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(234, 179, 8, 0.15)', color: '#d97706', fontWeight: 600 }}>
                                          PENDING SYNC
                                        </span>
                                      )}
                                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                        <button
                                          onClick={async () => {
                                            let targetUrl = attUrl;
                                            if (window.electron?.makeResolveAttachmentUrl && (!targetUrl.startsWith('http') || targetUrl.includes('supabase.co'))) {
                                              try {
                                                const resolved = await window.electron.makeResolveAttachmentUrl(targetUrl);
                                                if (resolved?.url) targetUrl = resolved.url;
                                              } catch {}
                                            }
                                            setPdfViewer({ path: targetUrl, name: attName, url: targetUrl });
                                          }}
                                          style={smallBtn('#3b82f6')}
                                          title="View Attachment"
                                        >
                                          <Eye size={13} /> View
                                        </button>
                                        <button
                                          onClick={async () => {
                                            let targetUrl = attUrl;
                                            if (window.electron?.makeResolveAttachmentUrl && (!targetUrl.startsWith('http') || targetUrl.includes('supabase.co'))) {
                                              try {
                                                const resolved = await window.electron.makeResolveAttachmentUrl(targetUrl);
                                                if (resolved?.url) targetUrl = resolved.url;
                                              } catch {}
                                            }
                                            handleDownloadPdf({ path: targetUrl, name: attName, url: targetUrl, isPending: false });
                                          }}
                                          style={smallBtn('#10b981')}
                                          title="Download Attachment"
                                        >
                                          <Download size={13} /> Download
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Version Diff & History Modal */}
      <AnimatePresence>
        {diffModalOrder && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
            onClick={(e) => { if (e.target === e.currentTarget) setDiffModalOrder(null); }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="make-modal-container"
              style={{ background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', width: '100%', maxWidth: 'min(900px, calc(100vw - 32px))', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxSizing: 'border-box', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <History size={20} color="var(--accent-color)" /> Version Diff &amp; History: {diffModalOrder.furniture_name}
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Current Active Version: <strong>v{diffModalOrder.current_version || 1}</strong> {diffModalOrder.approved_version ? `| Approved Version: v${diffModalOrder.approved_version}` : ''}
                  </p>
                </div>
                <button onClick={() => setDiffModalOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <X size={22} />
                </button>
              </div>

              {/* Version Comparison Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--input-bg)', padding: '12px 16px', borderRadius: '10px', marginBottom: '20px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Compare:</span>
                <select
                  value={selectedVersionFrom || ''}
                  onChange={e => handleCompareVersions(Number(e.target.value), selectedVersionTo || 1)}
                  style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600 }}>
                  {(orderVersions || []).map(v => (
                    <option key={`from-${v.version_number}`} value={v.version_number}>
                      v{v.version_number} ({new Date(v.created_at).toLocaleDateString()})
                    </option>
                  ))}
                </select>

                <ArrowRight size={16} style={{ opacity: 0.6 }} />

                <select
                  value={selectedVersionTo || ''}
                  onChange={e => handleCompareVersions(selectedVersionFrom || 1, Number(e.target.value))}
                  style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600 }}>
                  {(orderVersions || []).map(v => (
                    <option key={`to-${v.version_number}`} value={v.version_number}>
                      v{v.version_number} ({new Date(v.created_at).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Diff Output */}
              {loadingDiff ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Comparing versions...</div>
              ) : !versionDiff ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No difference found or versions identical.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Field Diffs */}
                  {versionDiff.fieldChanges && versionDiff.fieldChanges.length > 0 && (
                    <div>
                      <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: 700 }}>Field Changes</h4>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-secondary)' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Property</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#dc2626' }}>Before (v{selectedVersionFrom})</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#16a34a' }}>After (v{selectedVersionTo})</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(versionDiff.fieldChanges || []).map((ch: any, idx: number) => (
                            <tr key={idx} style={{ borderTop: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600, textTransform: 'capitalize' }}>{ch.field.replace(/_/g, ' ')}</td>
                              <td style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.06)', color: '#dc2626' }}>{String(ch.old_value ?? '—')}</td>
                              <td style={{ padding: '8px 12px', background: 'rgba(34,197,94,0.06)', color: '#16a34a', fontWeight: 700 }}>{String(ch.new_value ?? '—')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Items Diff */}
                  {versionDiff.itemChanges && (versionDiff.itemChanges || []).length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: 700 }}>Item Specification Changes</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(versionDiff.itemChanges || []).map((itCh: any, idx: number) => (
                          <div key={idx} style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                            <div style={{ fontWeight: 700, marginBottom: '4px' }}>{itCh.item_name}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.8rem' }}>
                              <div style={{ color: '#dc2626', background: 'rgba(239,68,68,0.05)', padding: '6px 8px', borderRadius: '6px' }}>
                                <strong>Before:</strong> {itCh.old_details || '—'}
                              </div>
                              <div style={{ color: '#16a34a', background: 'rgba(34,197,94,0.05)', padding: '6px 8px', borderRadius: '6px' }}>
                                <strong>After:</strong> {itCh.new_details || '—'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Version List History */}
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                    <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 700 }}>Snapshot History Log</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                      {(orderVersions || []).map(v => (
                        <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--input-bg)', borderRadius: '8px', fontSize: '0.82rem' }}>
                          <div>
                            <span style={{ fontWeight: 700, color: 'var(--accent-color)' }}>v{v.version_number}</span> — {v.modification_reason || 'Version snapshot'}
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>by {v.created_by_name || 'System'}</div>
                          </div>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                            {new Date(v.created_at).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PDF Viewer Modal */}
      <AnimatePresence>
        {pdfViewer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div style={{ width: '100%', maxWidth: '900px', background: 'var(--card-bg)', borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '90vh' }}>
              <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} color="#f97316" />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{pdfViewer.name}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleDownloadPdf(pdfViewer)} style={smallBtn('#10b981')}>
                    <Download size={14} /> Download
                  </button>
                  <button onClick={() => setPdfViewer(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)' }}>
                    <X size={20} />
                  </button>
                </div>
              </div>
              {(/\.(png|jpe?g|webp|gif|svg)$/i.test(pdfViewer.name) || /\.(png|jpe?g|webp|gif|svg)/i.test(pdfViewer.url)) ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e293b', overflow: 'auto', padding: '20px' }}>
                  <img src={resolveImageSrc(pdfViewer.url)} onError={e => handleImageLoadError(e, pdfViewer.url)} alt={pdfViewer.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }} />
                </div>
              ) : (/\.(dwg|dxf|step|stp|iges|igs|skp|stl|obj)$/i.test(pdfViewer.name) || /\.(dwg|dxf|step|stp|iges|igs|skp|stl|obj)/i.test(pdfViewer.url)) ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '40px', textAlign: 'center' }}>
                  <div style={{ width: '72px', height: '72px', borderRadius: '16px', background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', marginBottom: '18px' }}>
                    <FileText size={36} />
                  </div>
                  <h3 style={{ margin: '0 0 8px', color: '#f8fafc', fontSize: '1.2rem', fontWeight: 800 }}>
                    {pdfViewer.name}
                  </h3>
                  <span style={{ display: 'inline-block', background: 'rgba(14,165,233,0.2)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.4)', borderRadius: '20px', padding: '4px 14px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '14px' }}>
                    CAD / 3D Model File
                  </span>
                  <p style={{ margin: '0 0 22px', color: '#94a3b8', fontSize: '0.86rem', maxWidth: '460px', lineHeight: 1.5 }}>
                    This file contains engineering CAD blueprints or 3D geometry. Download the file to open and inspect in AutoCAD, Autodesk Viewer, SolidWorks, or Fusion 360.
                  </p>
                  <button 
                    onClick={() => handleDownloadPdf(pdfViewer)}
                    style={{ padding: '11px 24px', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 16px rgba(14,165,233,0.3)' }}
                  >
                    <Download size={16} /> Download CAD File
                  </button>
                </div>
              ) : (
                <iframe src={resolveImageSrc(pdfViewer.url)} title={pdfViewer.name}
                  style={{ flex: 1, border: 'none', width: '100%', background: '#525659' }} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AlterOrder Modal */}
      <AnimatePresence>
        {alterOrder && (
          <AlterOrder key={alterOrder.id} order={alterOrder} onClose={() => setAlterOrder(null)} onSaved={fetchOrders} />
        )}
      </AnimatePresence>

      {/* Record Payment Modal */}
      <AnimatePresence>
        {paymentModalOrder && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              style={{ width: '100%', maxWidth: '480px', background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <DollarSign size={20} color="#10b981" />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Record Order Payment</h3>
                </div>
                <button type="button" onClick={() => setPaymentModalOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleRecordPayment} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem' }}>
                  <div>Order: <strong>#{paymentModalOrder.order_number || paymentModalOrder.id}</strong> ({paymentModalOrder.furniture_name})</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    {pricingPerms.canViewSalePrice && <span style={{ color: 'var(--text-secondary)' }}>Total: ৳{Number(paymentModalOrder.final_price || paymentModalOrder.sale_price || 0).toLocaleString()}</span>}
                    <span style={{ color: '#ea580c', fontWeight: 700 }}>Due: ৳{Number(paymentModalOrder.amount_due ?? 0).toLocaleString()}</span>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Payment Amount (৳) *</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    placeholder="e.g. 5000"
                    style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 700, boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 600, boxSizing: 'border-box' }}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer / EFT</option>
                    <option value="bKash">bKash</option>
                    <option value="Nagad">Nagad</option>
                    <option value="POS / Card">POS / Credit Card</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Reference / Transaction ID</label>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={e => setPaymentRef(e.target.value)}
                    placeholder="e.g. TrxID / Cheque # / Deposit Slip #"
                    style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Notes / Remarks</label>
                  <textarea
                    rows={2}
                    value={paymentNotes}
                    onChange={e => setPaymentNotes(e.target.value)}
                    placeholder="Optional notes regarding this payment..."
                    style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button type="button" onClick={() => setPaymentModalOrder(null)} style={{ padding: '10px 18px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={submittingPayment} style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: submittingPayment ? 'not-allowed' : 'pointer', opacity: submittingPayment ? 0.7 : 1 }}>
                    {submittingPayment ? 'Saving...' : 'Record Payment'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Request Admin Approval Modal */}
      <AnimatePresence>
        {requestApprovalModalOrder && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              style={{ width: '100%', maxWidth: '460px', background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={20} color="var(--accent-color)" />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Request Production Approval</h3>
                </div>
                <button type="button" onClick={() => setRequestApprovalModalOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitApprovalRequest} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  This order is on hold with an unpaid balance of <strong>৳{Number(requestApprovalModalOrder.amount_due || 0).toLocaleString()}</strong>. Submit a justification note to request an administrative override to commence factory production.
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Justification / Notes *</label>
                  <textarea
                    rows={3}
                    required
                    value={requestApprovalNotes}
                    onChange={e => setRequestApprovalNotes(e.target.value)}
                    placeholder="e.g. VIP client agreed to balance payment on delivery; urgent event deadline..."
                    style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button type="button" onClick={() => setRequestApprovalModalOrder(null)} style={{ padding: '10px 18px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={submittingApprovalRequest} style={{ padding: '10px 22px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: submittingApprovalRequest ? 'not-allowed' : 'pointer', opacity: submittingApprovalRequest ? 0.7 : 1 }}>
                    {submittingApprovalRequest ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Decide Admin Approval Modal */}
      <AnimatePresence>
        {decideApprovalModalOrder && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              style={{ width: '100%', maxWidth: '460px', background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {decideApprovalDecision === 'approved' ? (
                    <CheckCircle size={20} color="#059669" />
                  ) : (
                    <X size={20} color="#dc2626" />
                  )}
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                    {decideApprovalDecision === 'approved' ? 'Approve Production Release' : 'Reject Production Release'}
                  </h3>
                </div>
                <button type="button" onClick={() => setDecideApprovalModalOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitApprovalDecision} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {decideApprovalDecision === 'approved' ? (
                    <span>Granting override approval will release the production hold and authorize factory staff to advance manufacturing stages despite outstanding balance of <strong>৳{Number(decideApprovalModalOrder.amount_due || 0).toLocaleString()}</strong>.</span>
                  ) : (
                    <span>Rejecting this request will keep the order strictly on Production Hold until full payment is received.</span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Decision Notes / Conditions (Optional)</label>
                  <textarea
                    rows={3}
                    value={decideApprovalNotes}
                    onChange={e => setDecideApprovalNotes(e.target.value)}
                    placeholder={decideApprovalDecision === 'approved' ? 'e.g. Approved per Director verbal approval; balance payment expected on Thursday' : 'e.g. Declined; minimum 50% deposit required before cutting wood.'}
                    style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button type="button" onClick={() => setDecideApprovalModalOrder(null)} style={{ padding: '10px 18px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingDecision}
                    style={{
                      padding: '10px 22px',
                      background: decideApprovalDecision === 'approved' ? 'linear-gradient(135deg, #059669, #047857)' : '#dc2626',
                      color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700,
                      cursor: submittingDecision ? 'not-allowed' : 'pointer', opacity: submittingDecision ? 0.7 : 1
                    }}
                  >
                    {submittingDecision ? 'Processing...' : (decideApprovalDecision === 'approved' ? 'Confirm Approval' : 'Confirm Rejection')}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment History Log Modal */}
      <AnimatePresence>
        {viewPaymentsOrder && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              style={{ width: '100%', maxWidth: '640px', maxHeight: '85vh', background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={18} color="var(--accent-color)" />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Payment Transactions — #{viewPaymentsOrder.order_number || viewPaymentsOrder.id}</h3>
                </div>
                <button type="button" onClick={() => setViewPaymentsOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                {loadingPayments ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading payment logs...</div>
                ) : orderPayments.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    No payment transactions recorded for this order yet.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Date</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Method</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Reference</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Amount (৳)</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderPayments.map((p, idx) => (
                        <tr key={p.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                            {new Date(p.created_at).toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.payment_method || 'Cash'}</td>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.reference_number || '—'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                            ৳{Number(p.amount || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{p.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
};

export default TrackOrders;
