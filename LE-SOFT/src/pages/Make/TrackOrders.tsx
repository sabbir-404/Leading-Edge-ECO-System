import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ClipboardList, ChevronDown, ChevronUp, CheckCircle, Trash2, Send, 
  FileText, Download, Eye, X, Edit2, Ruler, MapPin, 
  User, History, Layers, ArrowRight, RefreshCw, Upload
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import AlterOrder from './AlterOrder';

const STATUSES = [
  'Draft',
  'Awaiting Pricing',
  'Pricing Done',
  'Pending Approval',
  'Placed',
  'In Production',
  'Welding',
  'Painting',
  'Ready for Dispatch',
  'Delivered'
];

const PRODUCTION_STAGES = [
  'Work in process',
  'Production On Going',
  'Primary QC',
  'Color Ongoing',
  'QC Final',
  'Packaging',
  'Ready to Ship',
  'Delivered'
];

const statusColors: Record<string, string> = {
  'Draft': '#6b7280',
  'Awaiting Pricing': '#ca8a04',
  'Pricing Done': '#3b82f6',
  'Pending Approval': '#fb923c',
  'Placed': '#8b5cf6',
  'In Production': '#3b82f6',
  'Welding': '#f59e0b',
  'Painting': '#a855f7',
  'Ready for Dispatch': '#10b981',
  'Delivered': '#059669',
  'Cancelled': '#ef4444',
  'Rejected': '#dc2626',
  'Work in process': '#f59e0b',
  'Production On Going': '#3b82f6',
  'Primary QC': '#8b5cf6',
  'Color Ongoing': '#a855f7',
  'QC Final': '#06b6d4',
  'Packaging': '#ea580c',
  'Ready to Ship': '#10b981'
};

const approvalBadgeColors: Record<string, { bg: string; text: string; border: string; label: string }> = {
  'pending_pricing': { bg: 'rgba(234, 179, 8, 0.1)', text: '#ca8a04', border: 'rgba(234, 179, 8, 0.3)', label: 'Awaiting Cost Pricing' },
  'priced': { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)', label: 'Priced (Awaiting Sales Approval)' },
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
interface PdfEntry { path: string; name: string; url: string; }
interface Part { id: number; part_name: string; length: string; width: string; height: string; notes: string; sort_order: number; }

const TrackOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [updates, setUpdates] = useState<StatusUpdate[]>([]);
  const [statusFilter, setStatusFilter] = useState('All');
  
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
  const [stagePhotoPath, setStagePhotoPath] = useState<string>('');
  const [stagePhotoPreview, setStagePhotoPreview] = useState<string | null>(null);
  const [updatingStage, setUpdatingStage] = useState(false);
  const [approving, setApproving] = useState(false);

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
    if (userRole === 'admin' || userRole === 'superadmin' || userRole === 'manager') return true;
    return !!userPermissions[key];
  };

  const fetchOrders = async () => {
    try {
      // @ts-ignore
      const data = await window.electron.getMakeOrders();
      setOrders(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchOrders(); }, []);
  useAutoRefresh(['make_orders', 'make_order_updates', 'make_order_versions'], fetchOrders);

  const loadExpanded = async (orderId: number) => {
    if (expandedId === orderId) { setExpandedId(null); return; }
    setExpandedId(orderId);
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

        const curStageIdx = PRODUCTION_STAGES.indexOf(order.status);
        if (curStageIdx >= 0 && curStageIdx < PRODUCTION_STAGES.length - 1) {
          setSelectedStage(PRODUCTION_STAGES[curStageIdx + 1]);
        } else if (curStageIdx >= 0) {
          setSelectedStage(PRODUCTION_STAGES[curStageIdx]);
        } else {
          setSelectedStage(PRODUCTION_STAGES[0]);
        }
        setStageNote('');
        setStagePhotoFile(null);
        setStagePhotoPath('');
        setStagePhotoPreview(null);
      }
    } catch (e) { 
      console.error(e); 
    } finally {
      setLoadingItems(false);
    }
  };

  const handleSelectStagePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStagePhotoFile(file);
    const filePath = (file as any).path || '';
    setStagePhotoPath(filePath);

    const reader = new FileReader();
    reader.onload = () => {
      setStagePhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleClearStagePhoto = () => {
    setStagePhotoFile(null);
    setStagePhotoPath('');
    setStagePhotoPreview(null);
  };

  const handleUpdateProductionStage = async (orderId: number) => {
    if (!selectedStage) {
      alert('Please select a production stage.');
      return;
    }
    const order = orders.find(o => o.id === orderId);
    const curIdx = PRODUCTION_STAGES.indexOf(order?.status || '');
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
        photoPath: stagePhotoPath || undefined,
        photoBase64: stagePhotoPreview || undefined,
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
      setStagePhotoPath('');
      setStagePhotoPreview(null);
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
      await window.electron.approveMakeOrder({ orderId, approvedBy: userName });
      await fetchOrders();
      if (expandedId === orderId) await loadExpanded(orderId);
    } catch (e) { console.error(e); }
    finally { setApproving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this order permanently?')) return;
    try {
      // @ts-ignore
      await window.electron.deleteMakeOrder(id);
      fetchOrders();
      if (expandedId === id) setExpandedId(null);
    } catch (e) { console.error(e); }
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
    // @ts-ignore
    await window.electron.makeDownloadPdf({ url: pdf.url, fileName: pdf.name });
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

  const canAlter = (order: Order) => {
    if (userRole === 'admin') return true;
    return ['Placed', 'In Production', 'Pending Approval', 'Awaiting Pricing'].includes(order.status);
  };

  const filtered = statusFilter === 'All' ? orders : orders.filter(o => o.status === statusFilter);

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
        
        {/* Header & Filter Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {['All', ...STATUSES].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                fontSize: '0.8rem', fontWeight: 600,
                background: statusFilter === s ? 'var(--accent-color)' : 'var(--input-bg, #f0f0f0)',
                color: statusFilter === s ? 'white' : 'var(--text-secondary)', transition: 'all 0.15s'
              }}>
                {s} {s !== 'All' && `(${orders.filter(o => o.status === s).length})`}
              </button>
            ))}
          </div>
          <button onClick={fetchOrders} style={{ ...smallBtn(), padding: '8px 14px' }}>
            <RefreshCw size={15} /> Refresh Orders
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Loading orders from NAS database...</div>
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
                        {order.cost_price ? (
                          <span style={{ color: '#059669', fontWeight: 700 }}>
                            Cost: ৳{Number(order.cost_price).toLocaleString()}
                          </span>
                        ) : (
                          <span style={{ color: '#ca8a04', fontWeight: 600, fontStyle: 'italic' }}>
                            Cost Price Needed
                          </span>
                        )}
                        {order.sale_price && (
                          <span style={{ color: 'var(--accent-color)', fontWeight: 700 }}>
                            Sale: ৳{Number(order.sale_price).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleOpenVersionDiff(order)} style={smallBtn('#6366f1')} title="View Version Diff & History">
                        <History size={14} /> Diff
                      </button>

                      {order.approval_status === 'priced' && hasPermission('approve_make_order') && (
                        <button onClick={() => handleApprove(order.id)} disabled={approving} style={smallBtn('#22c55e')}>
                          <CheckCircle size={14} /> {approving ? 'Approving...' : 'Approve'}
                        </button>
                      )}

                      {canAlter(order) && (
                        <button onClick={() => setAlterOrder(order)} style={smallBtn('#f97316')}>
                          <Edit2 size={14} /> Alter
                        </button>
                      )}

                      {userRole === 'admin' && (
                        <button onClick={() => handleDelete(order.id)} style={smallBtn('#ef4444')}>
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

                          {/* ── TOP ROW: LOGISTICS & ORDER SPECS SUMMARY ── */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                            
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
                                              <div style={{ display: 'flex', gap: '4px' }}>
                                                <button onClick={() => setPdfViewer(pdf)} style={smallBtn('#3b82f6')} title="View Drawing"><Eye size={12} /></button>
                                                <button onClick={() => handleDownloadPdf(pdf)} style={smallBtn('#10b981')} title="Download Drawing"><Download size={12} /></button>
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
                                    {hasPermission('set_make_cost_price') && (
                                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.5fr', gap: '12px', alignItems: 'flex-end', paddingTop: '4px' }}>
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
                                        <div style={{ background: 'var(--card-bg)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.78rem' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Total Cost ({order.quantity}x):</span>
                                            <strong style={{ color: '#059669' }}>
                                              ৳{((parseFloat(costPrices[order.id] || '0') || 0) * (order.quantity || 1)).toLocaleString()}
                                            </strong>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Total Sale:</span>
                                            <strong style={{ color: 'var(--accent-color)' }}>
                                              {(parseFloat(salePrices[order.id] || '0') > 0) ? `৳${((parseFloat(salePrices[order.id] || '0') || 0) * (order.quantity || 1)).toLocaleString()}` : '—'}
                                            </strong>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  /* Multi-Item Catalog Products List */
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {orderItems.map((item, idx) => {
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
                                                {item.spec_name && (
                                                  <span><strong>Spec:</strong> {item.spec_name}</span>
                                                )}
                                                <span>
                                                  <strong>Dimensions:</strong>{' '}
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
                                                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                                      <button type="button" onClick={() => setPdfViewer(d)} style={smallBtn('#3b82f6')} title="View Drawing">
                                                        <Eye size={12} />
                                                      </button>
                                                      <button type="button" onClick={() => handleDownloadPdf(d)} style={smallBtn('#10b981')} title="Download Drawing">
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
                                          {hasPermission('set_make_cost_price') ? (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.5fr 2fr', gap: '12px', alignItems: 'flex-end', paddingTop: '2px' }}>
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

                                              {/* Line Subtotals */}
                                              <div style={{ background: 'var(--input-bg)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.78rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                  <span style={{ color: 'var(--text-secondary)' }}>Line Cost ({item.quantity}x):</span>
                                                  <strong style={{ color: '#059669' }}>
                                                    ৳{lineCost.toLocaleString()}
                                                  </strong>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                                                  <span style={{ color: 'var(--text-secondary)' }}>Line Sale:</span>
                                                  <strong style={{ color: 'var(--accent-color)' }}>
                                                    {lineSale > 0 ? `৳${lineSale.toLocaleString()}` : '—'}
                                                  </strong>
                                                </div>
                                                {lineMarginPct && (
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
                                              <div>Unit Cost: <strong style={{ color: '#059669' }}>{item.item_cost_price ? `৳${Number(item.item_cost_price).toLocaleString()}` : 'Pending'}</strong></div>
                                              <div>Unit Sale: <strong style={{ color: 'var(--accent-color)' }}>{item.item_sale_price ? `৳${Number(item.item_sale_price).toLocaleString()}` : 'Pending'}</strong></div>
                                              <div>Line Cost ({item.quantity}x): <strong style={{ color: '#059669' }}>৳{(Number(item.item_cost_price || 0) * item.quantity).toLocaleString()}</strong></div>
                                              {item.designer_notes && <div style={{ fontStyle: 'italic' }}>Note: {item.designer_notes}</div>}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* ── ORDER PRICING SUMMARY & PUBLISH BAR ── */}
                                {hasPermission('set_make_cost_price') && (
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
                                        <div style={{ width: '1px', height: '30px', background: 'var(--border-color)' }} />
                                        <div>
                                          <span style={{ fontSize: '0.72rem', color: 'var(--accent-color)', textTransform: 'uppercase', fontWeight: 700 }}>Total Order Sale</span>
                                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-color)' }}>
                                            {liveTotalSale > 0 ? `৳${liveTotalSale.toLocaleString()}` : 'Not Specified'}
                                          </div>
                                        </div>
                                        {liveTotalSale > liveTotalCost && (
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

                          {/* Lower Grid: Timeline + Update Status */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

                            {/* Left: Timeline */}
                            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' }}>
                              <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 700 }}>Status Timeline</h4>
                              {order.description && (
                                <div style={{ background: 'var(--input-bg)', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  {order.description}
                                </div>
                              )}
                              <div style={{ position: 'relative', paddingLeft: '20px' }}>
                                {updates.map((upd, i) => (
                                  <div key={upd.id} style={{ position: 'relative', paddingBottom: i < updates.length - 1 ? '16px' : '0' }}>
                                    {i < updates.length - 1 && <div style={{ position: 'absolute', left: '-14px', top: '18px', width: '2px', height: 'calc(100%)', background: 'var(--border-color)' }} />}
                                    <div style={{ position: 'absolute', left: '-18px', top: '4px', width: '10px', height: '10px', borderRadius: '50%', background: statusColors[upd.status] || '#6b7280', border: '2px solid var(--card-bg)' }} />
                                    <div>
                                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: statusColors[upd.status] || 'var(--text-primary)' }}>{upd.status}</span>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{upd.updated_by} • {new Date(upd.created_at).toLocaleString()}</div>
                                      {upd.note && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px', fontStyle: 'italic' }}>{upd.note}</div>}
                                      {upd.photo_url && (
                                        <div style={{ marginTop: '8px' }}>
                                          <img 
                                            src={upd.photo_url} 
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
                              {order.current_stage_photo && (
                                <div style={{ marginBottom: '14px', position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}>
                                  <img 
                                    src={order.current_stage_photo} 
                                    alt="Current Stage" 
                                    onClick={() => setPdfViewer({ url: order.current_stage_photo!, name: `${order.status} Live Photo`, path: '' })}
                                    style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block', cursor: 'pointer' }}
                                    title="Click to inspect latest stage photo"
                                  />
                                  <div style={{ position: 'absolute', bottom: 0, insetInline: 0, padding: '6px 10px', background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', color: '#fff', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600 }}>Latest Photo ({order.status})</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.74rem' }} onClick={() => setPdfViewer({ url: order.current_stage_photo!, name: `${order.status} Live Photo`, path: '' })}>
                                      <Eye size={13} /> View Enlarge
                                    </span>
                                  </div>
                                </div>
                              )}

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
                                              const curIdx = PRODUCTION_STAGES.indexOf(order.status);
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
                                        <input 
                                          type="file" 
                                          id={`stage-photo-${order.id}`} 
                                          accept="image/*" 
                                          onChange={handleSelectStagePhoto} 
                                          style={{ display: 'none' }} 
                                        />
                                        {!stagePhotoPreview ? (
                                          <label 
                                            htmlFor={`stage-photo-${order.id}`}
                                            style={{ 
                                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                              padding: '10px 14px', border: '1px dashed var(--accent-color)', borderRadius: '8px',
                                              background: 'rgba(99,102,241,0.05)', color: 'var(--accent-color)', cursor: 'pointer',
                                              fontSize: '0.84rem', fontWeight: 600, transition: 'all 0.2s'
                                            }}>
                                            <Upload size={15} /> Select Stored Image from PC
                                          </label>
                                        ) : (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                            <img 
                                              src={stagePhotoPreview} 
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

                                      <motion.button 
                                        onClick={() => handleUpdateProductionStage(order.id)} 
                                        disabled={updatingStage} 
                                        whileHover={{ scale: 1.01 }} 
                                        whileTap={{ scale: 0.98 }}
                                        style={{ 
                                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', 
                                          padding: '11px', background: statusColors[selectedStage] || 'var(--accent-color)', 
                                          color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.88rem', 
                                          cursor: updatingStage ? 'not-allowed' : 'pointer', opacity: updatingStage ? 0.7 : 1,
                                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                                        }}>
                                        <Send size={15} /> {updatingStage ? 'Updating Stage & Notifying...' : `Update Stage to "${selectedStage}"`}
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
                                    {parts.map((p, i) => (
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
                                <FileText size={15} /> Technical PDF Drawings &amp; Blueprints ({pdfs.length})
                              </h4>
                              <button onClick={() => handleUploadPdf(order.id)} disabled={pdfLoading}
                                style={{ ...smallBtn(), display: 'flex', alignItems: 'center', gap: '5px' }}>
                                {pdfLoading ? 'Uploading...' : '+ Attach PDF'}
                              </button>
                            </div>
                            {pdfs.length === 0 ? (
                              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', opacity: 0.6 }}>No technical PDFs attached.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {pdfs.map(pdf => (
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
              style={{ background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
              
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
                  {orderVersions.map(v => (
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
                  {orderVersions.map(v => (
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
                          {versionDiff.fieldChanges.map((ch: any, idx: number) => (
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
                  {versionDiff.itemChanges && versionDiff.itemChanges.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: 700 }}>Item Specification Changes</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {versionDiff.itemChanges.map((itCh: any, idx: number) => (
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
                      {orderVersions.map(v => (
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
                  <img src={pdfViewer.url} alt={pdfViewer.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }} />
                </div>
              ) : (
                <iframe src={pdfViewer.url} title={pdfViewer.name}
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
    </DashboardLayout>
  );
};

export default TrackOrders;
