import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, Check, X, Package, ShoppingCart, AlertCircle, Clock, FileText, Eye, Printer, Edit2, PackageMinus } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';
import { getPrintPageSize } from '../../../utils/printPageSize';
import './PurchaseRequisitions.css';

interface Product {
    id: string;
    name: string;
    code?: string;
    sku?: string;
    unit?: string;
    unit_name?: string;
    unit_symbol?: string;
}

interface RequisitionLineItem {
    id: string;
    productId: string;
    productSearch: string;
    quantity: string;
    quantityUnit: string;
    remarks: string;
}

interface PurchaseRequisitionItem {
    id: string;
    requisition_id: string;
    product_id: string;
    product_name?: string;
    quantity: number;
    quantity_unit: string;
    remarks?: string;
}

interface PurchaseRequisition {
    id: string;
    requisition_number: string;
    product_id: string;
    product_name?: string;
    item_count?: number;
    quantity: number;
    quantity_unit: string;
    priority_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    status: 'DRAFT' | 'PENDING_ESTIMATE' | 'PENDING_AUDIT' | 'PENDING_DIRECTOR' | 'APPROVED' | 'PURCHASED' | 'RECEIVED' | 'COMPLETED' | 'REJECTED';
    approval_status: 'PENDING' | 'APPROVED' | 'REJECTED';
    requisition_date: string;
    required_delivery_date: string;
    approval_date?: string;
    purchase_date?: string;
    received_date?: string;
    completed_date?: string;
    warehouse_location?: string;
    remarks?: string;
    store_head_notes?: string;
    audit_status?: 'PENDING' | 'APPROVED' | 'REJECTED';
    audit_notes?: string;
    audit_reviewed_at?: string;
    audit_reviewed_by_name?: string;
    director_status?: 'PENDING' | 'APPROVED' | 'REJECTED';
    director_notes?: string;
    director_reviewed_at?: string;
    director_reviewed_by_name?: string;
    created_by?: string;
    approved_by?: string;
    purchased_by?: string;
    supplier_ledger_id?: number;
    purchase_invoice_id?: string;
    purchased_quantity?: number;
    purchase_remarks?: string;
    items?: PurchaseRequisitionItem[];
}

interface PurchaseRequisitionHistory {
    id: string;
    requisition_id: string;
    from_status?: string;
    to_status: string;
    action: string;
    remarks?: string;
    performed_by_name?: string;
    performed_at: string;
}

const PurchaseRequisitions: React.FC = () => {
    const [tab, setTab] = useState<'list' | 'create' | 'approvals' | 'history'>('list');
    const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [showItemsModal, setShowItemsModal] = useState(false);
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [showEstimatesModal, setShowEstimatesModal] = useState(false);
    const [estimates, setEstimates] = useState<any[]>([{ supplierId: '', estimatedPrice: '', remarks: '' }]);
    const [fetchedQuotes, setFetchedQuotes] = useState<any[]>([]);
    const [directorHistory, setDirectorHistory] = useState<any[]>([]);
    const [showDirectorModal, setShowDirectorModal] = useState(false);
    const [showPurchaseModal, setShowPurchaseModal] = useState(false);
    const [viewQuotes, setViewQuotes] = useState<any[]>([]);
    const [viewPurchaseHistory, setViewPurchaseHistory] = useState<Record<string, any[]>>({});
    const [viewHistoryEntries, setViewHistoryEntries] = useState<PurchaseRequisitionHistory[]>([]);
    const [viewLoading, setViewLoading] = useState(false);
    const [showProductSummaryModal, setShowProductSummaryModal] = useState(false);
    const [productSummary, setProductSummary] = useState<any>(null);
    const [productSummaryLoading, setProductSummaryLoading] = useState(false);
    const [productSummaryFilters, setProductSummaryFilters] = useState({ fromDate: '', toDate: '' });
    const [selectedSummaryProductId, setSelectedSummaryProductId] = useState<string>('');
    const [editingRequisition, setEditingRequisition] = useState<PurchaseRequisition | null>(null);
    const [showDamageModal, setShowDamageModal] = useState(false);
    const [damageProductId, setDamageProductId] = useState('');
    const [damageQty, setDamageQty] = useState('');
    const [damageNotes, setDamageNotes] = useState('');
    const [approvalNotes, setApprovalNotes] = useState('');
    const [auditNotes, setAuditNotes] = useState('');
    const [directorNotes, setDirectorNotes] = useState('');
    const [warehouseLocation, setWarehouseLocation] = useState('');
    const [purchaseInvoiceId, setPurchaseInvoiceId] = useState('');
    const [purchasedQuantity, setPurchasedQuantity] = useState('');
    const [purchaseRemarks, setPurchaseRemarks] = useState('');
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
    const [newSupplier, setNewSupplier] = useState({ name: '', storeName: '', contactNumber: '', contactPerson: '', paymentMethod: '' });
    const [selectedRequisition, setSelectedRequisition] = useState<PurchaseRequisition | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [approvalFilter, setApprovalFilter] = useState<string>('');
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyRequisition, setHistoryRequisition] = useState<PurchaseRequisition | null>(null);
    const [historyEntries, setHistoryEntries] = useState<PurchaseRequisitionHistory[]>([]);

    const [formData, setFormData] = useState({
        priorityLevel: 'MEDIUM',
        requiredDeliveryDate: '',
        remarks: '',
    });
    const createEmptyLineItem = (): RequisitionLineItem => ({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        productId: '',
        productSearch: '',
        quantity: '',
        quantityUnit: 'piece',
        remarks: '',
    });
    const [lineItems, setLineItems] = useState<RequisitionLineItem[]>([createEmptyLineItem()]);

    const userRole = localStorage.getItem('user_role') || '';
    const userName = localStorage.getItem('user_name') || 'desktop-user';
    const userPermissions = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('user_permissions') || '{}') as Record<string, boolean>;
        } catch {
            return {};
        }
    }, []);
    const isAdminUser = userRole === 'superadmin' || userRole === 'admin';
    const can = useCallback((permission: string) => isAdminUser || !!userPermissions[permission], [isAdminUser, userPermissions]);
    const canViewPurchasePricing = isAdminUser || can('purchase_requisition') || can('director_approve_purchase_requisition') || can('view_purchase_requisition_pricing');
    const canAlterRequisition = isAdminUser || can('director_approve_purchase_requisition') || can('alter_purchase_requisition');

    const asArray = <T,>(value: unknown): T[] => Array.isArray(value) ? value : [];

    const normalizeRequisition = (req: PurchaseRequisition): PurchaseRequisition => ({
        ...req,
        items: asArray(req.items),
    });

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [reqsData, productsData, ledgersData] = await Promise.all([
                (window as any).electron?.getPurchaseRequisitions?.({
                    status: statusFilter || undefined,
                    approvalStatus: approvalFilter || undefined,
                }) || [],
                (window as any).electron?.getProducts?.() || [],
                (window as any).electron?.getLedgers?.() || [],
            ]);

            setRequisitions(asArray<PurchaseRequisition>(reqsData).map(normalizeRequisition));
            setProducts(asArray<Product>(productsData));
            setSuppliers(asArray<any>(ledgersData).filter((l: any) => l.group_name === 'Sundry Creditors' || l.group?.name === 'Sundry Creditors'));
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, approvalFilter]);

    useAutoRefresh(['purchase_requisitions', 'products'], fetchData);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const validLineItems = lineItems.filter((item) => item.productId && Number(item.quantity) > 0);
            if (validLineItems.length === 0) {
                alert('Add at least one valid product line before saving.');
                return;
            }

            const items = validLineItems.map((item, index) => ({
                lineNo: index + 1,
                productId: Number(item.productId),
                quantity: Number(item.quantity),
                quantityUnit: item.quantityUnit || 'piece',
                remarks: item.remarks,
            }));

            const payload = {
                items,
                priorityLevel: formData.priorityLevel,
                requiredDeliveryDate: formData.requiredDeliveryDate,
                remarks: formData.remarks,
                productId: items[0]?.productId,
                quantity: items[0]?.quantity,
                quantityUnit: items[0]?.quantityUnit,
                performedByName: userName,
            };

            const result = editingRequisition
                ? await (window as any).electron?.updatePurchaseRequisition?.(editingRequisition.id, payload)
                : await (window as any).electron?.createPurchaseRequisition?.(payload);

            if (result?.success) {
                setFormData({
                    priorityLevel: 'MEDIUM',
                    requiredDeliveryDate: '',
                    remarks: '',
                });
                setLineItems([createEmptyLineItem()]);
                setEditingRequisition(null);
                setTab('list');
                fetchData();
            } else if (result?.error) {
                alert(result.error);
            }
        } catch (error) {
            console.error('Error creating requisition:', error);
        }
    };

    const handleApprove = async () => {
        if (!selectedRequisition) return;
        try {
            const result = await (window as any).electron?.approvePurchaseRequisition?.(
                selectedRequisition.id,
                'APPROVED',
                approvalNotes,
                userName
            );
            if (result?.success) {
                setShowApprovalModal(false);
                setApprovalNotes('');
                setSelectedRequisition(null);
                fetchData();
            }
        } catch (error) {
            console.error('Error approving requisition:', error);
        }
    };

    const handleSubmitEstimates = async () => {
        if (!selectedRequisition) return;
        try {
            const usableEstimates = estimates.filter((est) =>
                est.supplierId && Number(est.estimatedPrice) > 0 &&
                (est.supplierId !== 'NEW' || est.newSupplier?.name?.trim())
            );
            if (usableEstimates.length === 0) {
                alert('Add at least one vendor quote with supplier and estimated price.');
                return;
            }
            // Pre-process estimates to create new suppliers
            const processedEstimates = [];
            for (const est of usableEstimates) {
                if (est.supplierId === 'NEW' && est.newSupplier) {
                    const newLedger = await (window as any).electron?.createLedger({
                        name: est.newSupplier.name,
                        group: 'Sundry Creditors',
                        openingBalance: 0,
                        type: 'Cr',
                        mailingName: est.newSupplier.contactPerson,
                        contactPerson: est.newSupplier.contactPerson,
                        contactNumber: est.newSupplier.contactNumber,
                        paymentStatus: 'OPEN',
                        storeName: est.newSupplier.storeName,
                        paymentMethod: est.newSupplier.paymentMethod
                    });
                    if (newLedger?.id) {
                        processedEstimates.push({ ...est, supplierId: newLedger.id.toString() });
                    } else {
                        throw new Error('Failed to create new supplier');
                    }
                } else {
                    processedEstimates.push(est);
                }
            }

            const result = await (window as any).electron?.submitPurchaseEstimates?.(
                selectedRequisition.id,
                processedEstimates,
                userName
            );
            if (result?.success) {
                setShowEstimatesModal(false);
                setEstimates([{ supplierId: '', estimatedPrice: '', remarks: '' }]);
                setSelectedRequisition(null);
                fetchData();
            }
        } catch (error) {
            console.error('Error submitting estimates:', error);
            alert('Error submitting estimates. Please check the inputs.');
        }
    };

    const handleAuditReview = async (nextStatus: 'APPROVED' | 'REJECTED') => {
        if (!selectedRequisition) return;
        try {
            const result = await (window as any).electron?.auditReviewPurchaseRequisition?.(
                selectedRequisition.id,
                nextStatus,
                auditNotes,
                userName
            );
            if (result?.success) {
                setShowAuditModal(false);
                setAuditNotes('');
                setSelectedRequisition(null);
                fetchData();
            }
        } catch (error) {
            console.error('Error recording audit review:', error);
        }
    };

    const openAuditModal = async (req: PurchaseRequisition) => {
        setSelectedRequisition(req);
        setShowAuditModal(true);
        try {
            const quotes = await (window as any).electron?.getPurchaseRequisitionQuotes?.(req.id);
            setFetchedQuotes(quotes || []);
        } catch (e) {
            console.error(e);
        }
    };

    const openDirectorModal = async (req: PurchaseRequisition) => {
        setSelectedRequisition(req);
        setShowDirectorModal(true);
        try {
            const hist = await (window as any).electron?.getProductPurchaseHistory?.(req.product_id);
            setDirectorHistory(hist || []);
            const quotes = await (window as any).electron?.getPurchaseRequisitionQuotes?.(req.id);
            setFetchedQuotes(quotes || []);
        } catch (e) {
            console.error(e);
        }
    };

    const handleDirectorReview = async (nextStatus: 'APPROVED' | 'REJECTED') => {
        if (!selectedRequisition) return;
        try {
            const result = await (window as any).electron?.directorReviewPurchaseRequisition?.(
                selectedRequisition.id,
                nextStatus,
                directorNotes,
                userName
            );
            if (result?.success) {
                setShowDirectorModal(false);
                setDirectorNotes('');
                setSelectedRequisition(null);
                fetchData();
            }
        } catch (error) {
            console.error('Error recording director review:', error);
        }
    };

    const openHistory = async (requisition: PurchaseRequisition) => {
        try {
            setHistoryLoading(true);
            setHistoryRequisition(normalizeRequisition(requisition));
            const entries = await (window as any).electron?.getPurchaseRequisitionHistory?.(requisition.id);
            setHistoryEntries(asArray(entries));
            setTab('history');
        } catch (error) {
            console.error('Error loading history:', error);
        } finally {
            setHistoryLoading(false);
        }
    };

    const openItemsView = async (req: PurchaseRequisition) => {
        const safeReq = normalizeRequisition(req);
        setSelectedRequisition(safeReq);
        setShowItemsModal(true);
        setViewLoading(true);
        setViewQuotes([]);
        setViewPurchaseHistory({});
        setViewHistoryEntries([]);
        try {
            const items = safeReq.items && safeReq.items.length > 0
                ? safeReq.items
                : [{
                    product_id: safeReq.product_id,
                    quantity: safeReq.quantity,
                    quantity_unit: safeReq.quantity_unit,
                }];
            const [quotes, history, ...productHistories] = await Promise.all([
                (window as any).electron?.getPurchaseRequisitionQuotes?.(safeReq.id) || [],
                (window as any).electron?.getPurchaseRequisitionHistory?.(safeReq.id) || [],
                ...items.map((item) => (window as any).electron?.getProductPurchaseHistory?.(Number(item.product_id)) || []),
            ]);
            const historyMap: Record<string, any[]> = {};
            items.forEach((item, index) => {
                historyMap[String(item.product_id)] = asArray(productHistories[index]);
            });
            setViewQuotes(asArray(quotes));
            setViewHistoryEntries(asArray(history));
            setViewPurchaseHistory(historyMap);
        } catch (error) {
            console.error('Error loading requisition details:', error);
        } finally {
            setViewLoading(false);
        }
    };

    const loadProductSummary = async (productId: string, filters = productSummaryFilters) => {
        if (!productId) return;
        setProductSummaryLoading(true);
        try {
            const summary = await (window as any).electron?.getProductRequisitionSummary?.(Number(productId), {
                fromDate: filters.fromDate || undefined,
                toDate: filters.toDate || undefined,
            });
            setProductSummary(summary || null);
        } catch (error) {
            console.error('Error loading product summary:', error);
            setProductSummary(null);
        } finally {
            setProductSummaryLoading(false);
        }
    };

    const openProductSummary = async (productId: string) => {
        if (!productId) {
            alert('Select a product first.');
            return;
        }
        setSelectedSummaryProductId(productId);
        setProductSummaryFilters({ fromDate: '', toDate: '' });
        setProductSummary(null);
        setShowProductSummaryModal(true);
        await loadProductSummary(productId, { fromDate: '', toDate: '' });
    };

    const applyProductSummaryFilter = async () => {
        await loadProductSummary(selectedSummaryProductId, productSummaryFilters);
    };

    const handlePurchase = async () => {
        if (!selectedRequisition) return;
        try {
            if (!purchaseInvoiceId.trim()) {
                alert('Invoice ID / Bill Number is required.');
                return;
            }
            if (purchasedQuantity && Number(purchasedQuantity) <= 0) {
                alert('Purchased quantity must be greater than zero.');
                return;
            }
            if (selectedSupplierId === 'NEW' && !newSupplier.name.trim()) {
                alert('Supplier name is required.');
                return;
            }
            let finalSupplierId = selectedSupplierId;
            if (selectedSupplierId === 'NEW') {
                const newLedger = await (window as any).electron?.createLedger({
                    name: newSupplier.name,
                    group: 'Sundry Creditors',
                    openingBalance: 0,
                    type: 'Cr',
                    mailingName: newSupplier.contactPerson,
                    contactPerson: newSupplier.contactPerson,
                    contactNumber: newSupplier.contactNumber,
                    paymentStatus: 'OPEN',
                    storeName: newSupplier.storeName,
                    paymentMethod: newSupplier.paymentMethod
                });
                if (newLedger?.id) {
                    finalSupplierId = newLedger.id.toString();
                } else {
                    throw new Error('Failed to create supplier on the spot');
                }
            }

            const result = await (window as any).electron?.purchasePurchaseRequisition?.(
                selectedRequisition.id,
                {
                    warehouseLocation,
                    purchaseInvoiceId,
                    purchasedQuantity: Number(purchasedQuantity) || selectedRequisition.quantity,
                    purchaseRemarks,
                    supplierId: finalSupplierId ? Number(finalSupplierId) : null,
                    performedByName: userName,
                }
            );
            if (result?.success) {
                setShowPurchaseModal(false);
                setWarehouseLocation('');
                setPurchaseInvoiceId('');
                setPurchasedQuantity('');
                setPurchaseRemarks('');
                setSelectedSupplierId('');
                setNewSupplier({ name: '', storeName: '', contactNumber: '', contactPerson: '', paymentMethod: '' });
                setSelectedRequisition(null);
                fetchData();
            }
        } catch (error) {
            console.error('Error purchasing requisition:', error);
            alert('Error purchasing requisition');
        }
    };

    const handleReceive = async (id: string) => {
        try {
            const result = await (window as any).electron?.receivePurchaseRequisition?.(id, userName);
            if (result?.success) {
                fetchData();
            }
        } catch (error) {
            console.error('Error receiving requisition:', error);
        }
    };

    const handleComplete = async (id: string) => {
        try {
            const result = await (window as any).electron?.completePurchaseRequisition?.(id, userName);
            if (result?.success) {
                fetchData();
            }
        } catch (error) {
            console.error('Error completing requisition:', error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this requisition?')) return;
        try {
            const result = await (window as any).electron?.deletePurchaseRequisition?.(id, userName);
            if (result?.success) {
                fetchData();
            }
        } catch (error) {
            console.error('Error deleting requisition:', error);
        }
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            DRAFT: '#6b7280',
            PENDING_ESTIMATE: '#f97316',
            PENDING_AUDIT: '#0ea5e9',
            PENDING_DIRECTOR: '#8b5cf6',
            APPROVED: '#3b82f6',
            PURCHASED: '#f97316',
            RECEIVED: '#a855f7',
            COMPLETED: '#22c55e',
            REJECTED: '#ef4444',
        };
        return colors[status] || '#6b7280';
    };

    const getPriorityColor = (priority: string) => {
        const colors: Record<string, string> = {
            LOW: '#22c55e',
            MEDIUM: '#eab308',
            HIGH: '#f97316',
            URGENT: '#ef4444',
        };
        return colors[priority] || '#6b7280';
    };

    const getStageLabel = (req: PurchaseRequisition) => {
        if (req.status === 'DRAFT') return 'Store Draft';
        if (req.status === 'PENDING_ESTIMATE') return 'Vendor Estimates';
        if (req.status === 'PENDING_AUDIT') return 'Audit Review';
        if (req.status === 'PENDING_DIRECTOR') return 'Director Approval';
        if (req.status === 'REJECTED' && req.audit_status === 'REJECTED') return 'Audit Rejected';
        if (req.status === 'REJECTED' && req.director_status === 'REJECTED') return 'Director Rejected';
        if (req.status === 'APPROVED') return 'Ready to Purchase';
        if (req.status === 'PURCHASED') return 'Purchase Processing';
        if (req.status === 'RECEIVED') return 'Goods Received';
        if (req.status === 'COMPLETED') return 'Completed';
        return req.status;
    };

    const filteredRequisitions = asArray<PurchaseRequisition>(requisitions).map(req => {
        const safeReq = normalizeRequisition(req);
        return {
        ...safeReq,
        product_name:
            safeReq.items?.[0]?.product_name ||
            products.find(p => String(p.id) === String(safeReq.product_id))?.name ||
            'Unknown',
        item_count: safeReq.items?.length || 1,
    };
    });

    const getProductSummary = (req: PurchaseRequisition) => {
        const items = asArray<PurchaseRequisitionItem>(req.items);
        if (items.length === 0) return req.product_name || 'Unknown';
        const first = items[0];
        return items.length > 1
            ? `${first.product_name || 'Unknown Product'} +${items.length - 1} more`
            : first.product_name || 'Unknown Product';
    };

    const getCurrentOwner = (req: PurchaseRequisition) => {
        if (req.status === 'DRAFT') return 'Store Head';
        if (req.status === 'PENDING_ESTIMATE') return 'Accounts Department';
        if (req.status === 'PENDING_AUDIT') return 'Audit Department';
        if (req.status === 'PENDING_DIRECTOR') return 'Director';
        if (req.status === 'APPROVED') return 'Purchase Department';
        if (req.status === 'PURCHASED') return 'Receiving Team';
        if (req.status === 'RECEIVED') return 'Inventory / Store';
        if (req.status === 'COMPLETED') return 'Completed';
        if (req.status === 'REJECTED') return 'Closed';
        return 'Store';
    };

    const getWorkflowSteps = (req: PurchaseRequisition) => [
        { label: 'Store', status: 'Cleared', note: 'Created requisition' },
        { label: 'Store Head', status: req.approval_status === 'APPROVED' ? 'Cleared' : req.status === 'DRAFT' ? 'Current' : req.approval_status === 'REJECTED' ? 'Rejected' : 'Pending', note: req.store_head_notes || 'Review and approve' },
        { label: 'Accounts', status: ['PENDING_AUDIT', 'PENDING_DIRECTOR', 'APPROVED', 'PURCHASED', 'RECEIVED', 'COMPLETED'].includes(req.status) ? 'Cleared' : req.status === 'PENDING_ESTIMATE' ? 'Current' : 'Pending', note: 'Add supplier and estimated price' },
        { label: 'Audit', status: req.audit_status === 'APPROVED' ? 'Cleared' : req.audit_status === 'REJECTED' ? 'Rejected' : req.status === 'PENDING_AUDIT' ? 'Current' : 'Pending', note: req.audit_notes || 'Audit justification' },
        { label: 'Director', status: req.director_status === 'APPROVED' ? 'Cleared' : req.director_status === 'REJECTED' ? 'Rejected' : req.status === 'PENDING_DIRECTOR' ? 'Current' : 'Pending', note: req.director_notes || 'Final approval' },
        { label: 'Purchase', status: ['PURCHASED', 'RECEIVED', 'COMPLETED'].includes(req.status) ? 'Cleared' : req.status === 'APPROVED' ? 'Current' : 'Pending', note: req.purchase_remarks || 'Purchase after approval' },
    ];

    const getBestEstimatedTotal = () => {
        const values = asArray<any>(viewQuotes)
            .map((quote) => Number(quote.estimated_price))
            .filter((value) => Number.isFinite(value) && value > 0);
        if (values.length === 0) return null;
        return Math.min(...values);
    };

    const formatMoney = (value: number | null | undefined) => {
        if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
        return `৳${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    };

    const formatStatusLabel = (status: string) => status.replace(/_/g, ' ');

    const formatDate = (value?: string) => {
        if (!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
    };

    const escapeHtml = (value: any) => String(value ?? '—')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const getPrintableItems = (req: PurchaseRequisition) => (
        asArray<PurchaseRequisitionItem>(req.items).length > 0
            ? asArray<PurchaseRequisitionItem>(req.items)
            : [{
                id: req.id,
                requisition_id: req.id,
                product_id: req.product_id,
                product_name: req.product_name,
                quantity: req.quantity,
                quantity_unit: req.quantity_unit,
                remarks: req.remarks,
            }]
    );

    const handlePrintRequisition = async (req: PurchaseRequisition) => {
        try {
            const items = getPrintableItems(req);
            const [quotes, ...productHistories] = await Promise.all([
                (window as any).electron?.getPurchaseRequisitionQuotes?.(req.id) || [],
                ...items.map((item) => (window as any).electron?.getProductPurchaseHistory?.(Number(item.product_id)) || []),
            ]);
            const historyMap = new Map<string, any[]>();
            items.forEach((item, index) => historyMap.set(String(item.product_id), productHistories[index] || []));
            const bestEstimate = (quotes || [])
                .map((quote: any) => Number(quote.estimated_price))
                .filter((value: number) => Number.isFinite(value) && value > 0)
                .sort((a: number, b: number) => a - b)[0];
            const approvedBy = req.director_reviewed_by_name || req.approved_by || '—';
            const printedAt = new Date().toLocaleString();
            const pageSize = getPrintPageSize('purchase_requisition');

            const itemRows = items.map((item, index) => {
                const previous = (historyMap.get(String(item.product_id)) || [])[0];
                const previousRate = previous
                    ? previous.rate ?? (previous.qty ? Number(previous.amount || 0) / Number(previous.qty) : previous.amount)
                    : null;
                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td>
                            <strong>${escapeHtml(item.product_name || products.find((p) => p.id === item.product_id)?.name || 'Unknown Product')}</strong>
                            ${item.remarks ? `<div class="muted">${escapeHtml(item.remarks)}</div>` : ''}
                        </td>
                        <td class="right">${escapeHtml(item.quantity)} ${escapeHtml(item.quantity_unit)}</td>
                        <td class="right">${canViewPurchasePricing ? escapeHtml(formatMoney(previousRate)) : 'Restricted'}</td>
                    </tr>
                `;
            }).join('');

            const quoteRows = (quotes || []).length === 0
                ? '<tr><td colspan="3" class="empty">No supplier/vendor estimate recorded.</td></tr>'
                : (quotes || []).map((quote: any) => `
                    <tr>
                        <td>${escapeHtml(quote.supplier?.name || 'Unknown vendor')}</td>
                        <td class="right">${escapeHtml(formatMoney(Number(quote.estimated_price)))}</td>
                        <td>${escapeHtml(quote.remarks || '—')}</td>
                    </tr>
                `).join('');

            const printWindow = window.open('', '_blank', 'width=900,height=1100');
            if (!printWindow) {
                alert('Unable to open print window. Please allow popups for this app.');
                return;
            }

            printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>${escapeHtml(req.requisition_number)} - Purchase Requisition</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 28px; font-family: Arial, sans-serif; color: #111827; background: #fff; }
        .sheet { width: 100%; max-width: 860px; margin: 0 auto; }
        .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111827; padding-bottom: 18px; margin-bottom: 18px; }
        .brand { font-size: 24px; font-weight: 800; letter-spacing: 0.04em; }
        .brand span { color: #f97316; }
        h1 { margin: 6px 0 0; font-size: 22px; }
        h2 { margin: 22px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; }
        .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0; }
        .box { border: 1px solid #d1d5db; padding: 10px; min-height: 58px; }
        .label { display: block; color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
        .value { font-weight: 700; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; vertical-align: top; }
        th { background: #f3f4f6; text-align: left; text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; }
        .right { text-align: right; }
        .muted { color: #6b7280; font-size: 11px; margin-top: 3px; }
        .empty { text-align: center; color: #6b7280; padding: 18px; }
        .remark { border-top: 0; background: #fafafa; }
        .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 42px; }
        .signature { border-top: 1px solid #111827; padding-top: 8px; text-align: center; font-size: 12px; }
        @page { size: ${pageSize}; margin: ${pageSize === 'A5' ? '9mm' : '14mm'}; }
        @media print { body { padding: 0; } .sheet { max-width: none; } }
    </style>
</head>
<body>
    <main class="sheet">
        <section class="top">
            <div>
                <div class="brand">LE<span>A</span>DING EDGE</div>
                <h1>Purchase Requisition</h1>
            </div>
            <div>
                <div><span class="label">Requisition No.</span><span class="value">${escapeHtml(req.requisition_number)}</span></div>
                <div style="margin-top: 8px;"><span class="label">Printed At</span><span class="value">${escapeHtml(printedAt)}</span></div>
            </div>
        </section>

        <section class="meta">
            <div class="box"><span class="label">Status</span><span class="value">${escapeHtml(formatStatusLabel(req.status))}</span></div>
            <div class="box"><span class="label">Current Holder</span><span class="value">${escapeHtml(getCurrentOwner(req))}</span></div>
            <div class="box"><span class="label">Priority</span><span class="value">${escapeHtml(req.priority_level)}</span></div>
            <div class="box"><span class="label">Required Delivery</span><span class="value">${escapeHtml(formatDate(req.required_delivery_date))}</span></div>
            <div class="box"><span class="label">Best Estimated Total</span><span class="value">${escapeHtml(formatMoney(bestEstimate))}</span></div>
            <div class="box"><span class="label">Director Approval</span><span class="value">${escapeHtml(req.director_status || '—')} by ${escapeHtml(approvedBy)}</span></div>
        </section>

        <h2>Products</h2>
        <table>
            <thead><tr><th style="width: 44px;">#</th><th>Product</th><th class="right">Quantity</th><th class="right">Previous Purchase Price</th></tr></thead>
            <tbody>${itemRows}</tbody>
        </table>

        <h2>Supplier / Vendor Details</h2>
        <table>
            <thead><tr><th>Supplier / Vendor</th><th class="right">Estimated Amount</th><th>Remarks</th></tr></thead>
            <tbody>${quoteRows}</tbody>
        </table>

        <section class="signatures">
            <div class="signature">Store Head</div>
            <div class="signature">Accounts</div>
            <div class="signature">Audit</div>
            <div class="signature">Director</div>
        </section>
    </main>
    <script>
        window.onload = function() {
            window.focus();
            setTimeout(function() { window.print(); }, 250);
        };
    </script>
</body>
</html>`);
            printWindow.document.close();
        } catch (error) {
            console.error('Error printing requisition:', error);
            alert('Unable to print requisition. Please try again.');
        }
    };

    const productLabels = useMemo(() => products.map((product) => {
        const productCode = product.code || product.sku || '';
        const defaultUnit = product.unit_symbol || product.unit_name || product.unit || 'piece';
        return {
            id: product.id,
            label: productCode ? `${product.name} (${productCode})` : product.name,
            defaultUnit,
        };
    }), [products]);

    const productLabelLookup = useMemo(() => new Map(productLabels.map((product) => [product.label, product])), [productLabels]);

    const handleLineItemChange = (index: number, field: keyof RequisitionLineItem, value: string) => {
        setLineItems((prev) => prev.map((item, itemIndex) => {
            if (itemIndex !== index) return item;

            if (field === 'productSearch') {
                const matchedProduct = productLabelLookup.get(value);
                return {
                    ...item,
                    productSearch: value,
                    productId: matchedProduct?.id || '',
                    quantityUnit: matchedProduct?.defaultUnit || item.quantityUnit,
                };
            }

            return { ...item, [field]: value };
        }));
    };

    const addLineItem = () => {
        setLineItems((prev) => [...prev, createEmptyLineItem()]);
    };

    const removeLineItem = (index: number) => {
        setLineItems((prev) => {
            if (prev.length <= 1) return prev;
            return prev.filter((_, itemIndex) => itemIndex !== index);
        });
    };

    const resetCreateForm = () => {
        setFormData({
            priorityLevel: 'MEDIUM',
            requiredDeliveryDate: '',
            remarks: '',
        });
        setLineItems([createEmptyLineItem()]);
        setEditingRequisition(null);
    };

    const openEditRequisition = (req: PurchaseRequisition) => {
        if (!canAlterRequisition && req.status !== 'DRAFT') {
            alert('Only admin/director can alter requisitions after creation.');
            return;
        }
        if (['PURCHASED', 'RECEIVED', 'COMPLETED'].includes(req.status)) {
            alert('Purchased or stocked requisitions cannot be altered.');
            return;
        }
        const sourceItems = asArray(req.items).length > 0
            ? asArray<any>(req.items)
            : [{
                product_id: req.product_id,
                product_name: req.product_name,
                quantity: req.quantity,
                quantity_unit: req.quantity_unit,
                remarks: req.remarks,
            }];
        setEditingRequisition(req);
        setFormData({
            priorityLevel: req.priority_level || 'MEDIUM',
            requiredDeliveryDate: req.required_delivery_date || '',
            remarks: req.remarks || '',
        });
        setLineItems(sourceItems.map((item, index) => {
            const product = products.find(p => String(p.id) === String(item.product_id));
            const productCode = product?.code || product?.sku || item.product_code || '';
            const productName = product?.name || item.product_name || 'Unknown Product';
            return {
                id: item.id || `${Date.now()}-${index}`,
                productId: String(item.product_id || ''),
                productSearch: productCode ? `${productName} (${productCode})` : productName,
                quantity: String(item.quantity || ''),
                quantityUnit: item.quantity_unit || product?.unit_symbol || product?.unit_name || product?.unit || 'piece',
                remarks: item.remarks || '',
            };
        }));
        setTab('create');
    };

    return (
            <div className="purchase-requisitions-container">
                <motion.div
                    className="tabs"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                >
                    <button
                        className={`tab ${tab === 'list' ? 'active' : ''}`}
                        onClick={() => setTab('list')}
                    >
                        <ShoppingCart size={18} /> Requisitions
                    </button>
                    {can('create_purchase_requisition') && (
                        <button
                            className={`tab ${tab === 'create' ? 'active' : ''}`}
                            onClick={() => setTab('create')}
                        >
                            <Plus size={18} /> {editingRequisition ? 'Edit Requisition' : 'New Requisition'}
                        </button>
                    )}
                    <button
                        className={`tab ${tab === 'approvals' ? 'active' : ''}`}
                        onClick={() => setTab('approvals')}
                    >
                        <Check size={18} /> Reviews
                    </button>
                    <button
                        className={`tab ${tab === 'history' ? 'active' : ''}`}
                        onClick={() => setTab('history')}
                    >
                        <Clock size={18} /> History
                    </button>
                </motion.div>

                {tab === 'list' && (
                    <motion.div
                        className="list-view"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <div className="filters">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="filter-select"
                            >
                                <option value="">All Status</option>
                                <option value="DRAFT">Draft</option>
                                <option value="PENDING_ESTIMATE">Pending Estimate</option>
                                <option value="PENDING_AUDIT">Pending Audit</option>
                                <option value="PENDING_DIRECTOR">Pending Director</option>
                                <option value="APPROVED">Approved</option>
                                <option value="PURCHASED">Purchased</option>
                                <option value="RECEIVED">Received</option>
                                <option value="COMPLETED">Completed</option>
                                <option value="REJECTED">Rejected</option>
                            </select>

                            <select
                                value={approvalFilter}
                                onChange={(e) => setApprovalFilter(e.target.value)}
                                className="filter-select"
                            >
                                <option value="">All Approval Status</option>
                                <option value="PENDING">Pending</option>
                                <option value="APPROVED">Approved</option>
                                <option value="REJECTED">Rejected</option>
                            </select>
                        </div>

                        {loading ? (
                            <div className="loading">Loading requisitions...</div>
                        ) : filteredRequisitions.length === 0 ? (
                            <div className="empty-state">
                                <Package size={48} />
                                <h3>No Purchase Requisitions</h3>
                                <p>Create your first purchase requisition to get started</p>
                            </div>
                        ) : (
                            <div className="table-wrapper">
                                <table className="requisitions-table">
                                    <thead>
                                        <tr>
                                            <th>Requisition #</th>
                                            <th>Priority</th>
                                            <th>Status</th>
                                            <th>Approval</th>
                                            <th>Current Holder</th>
                                            <th>Stage</th>
                                            <th>Delivery Date</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRequisitions.map((req) => (
                                            <tr key={req.id}>
                                                <td className="font-mono">{req.requisition_number}</td>
                                                <td>
                                                    <span
                                                        className="badge"
                                                        style={{
                                                            background: getPriorityColor(req.priority_level),
                                                            color: 'white',
                                                        }}
                                                    >
                                                        {req.priority_level}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span
                                                        className="badge"
                                                        style={{
                                                            background: getStatusColor(req.status),
                                                            color: 'white',
                                                        }}
                                                    >
                                                        {formatStatusLabel(req.status)}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span
                                                        className="badge"
                                                        style={{
                                                            background:
                                                                req.approval_status === 'APPROVED'
                                                                    ? '#22c55e'
                                                                    : req.approval_status === 'REJECTED'
                                                                    ? '#ef4444'
                                                                    : '#eab308',
                                                            color: 'white',
                                                        }}
                                                    >
                                                        {formatStatusLabel(req.approval_status)}
                                                    </span>
                                                </td>
                                                <td className="stage-cell">{getCurrentOwner(req)}</td>
                                                <td className="stage-cell">{getStageLabel(req)}</td>
                                                <td>{formatDate(req.required_delivery_date)}</td>
                                                <td className="actions">
                                                    <button className="action-btn view" title="View Details" onClick={() => openItemsView(req)}><Eye size={16} /></button>
                                                    {(req.status === 'DRAFT' || (canAlterRequisition && !['PURCHASED', 'RECEIVED', 'COMPLETED'].includes(req.status))) && (
                                                        <button className="action-btn" title="Alter Products / Quantity" onClick={() => openEditRequisition(req)}><Edit2 size={16} /></button>
                                                    )}
                                                    {req.status === 'DRAFT' && can('approve_store_requisition') && (
                                                        <>
                                                            <button className="action-btn delete" title="Delete" onClick={() => handleDelete(req.id)}><Trash2 size={16} /></button>
                                                            <button className="action-btn approve" title="Approve" onClick={() => { setSelectedRequisition(req); setShowApprovalModal(true); }}><Check size={16} /></button>
                                                        </>
                                                    )}
                                                    {req.status === 'PENDING_ESTIMATE' && can('add_purchase_estimates') && (
                                                        <button className="action-btn" title="Add Estimates" onClick={() => { setSelectedRequisition(req); setShowEstimatesModal(true); }}><FileText size={16} /></button>
                                                    )}
                                                    {req.status === 'PENDING_AUDIT' && can('audit_purchase_requisition') && (
                                                        <button className="action-btn approve" title="Audit Review" onClick={() => openAuditModal(req)}><AlertCircle size={16} /></button>
                                                    )}
                                                    {req.status === 'PENDING_DIRECTOR' && can('director_approve_purchase_requisition') && (
                                                        <button className="action-btn approve" title="Director Review" onClick={() => openDirectorModal(req)}><Check size={16} /></button>
                                                    )}
                                                    {req.status === 'APPROVED' && (
                                                        <>
                                                            <button className="action-btn print" title="Print Requisition" onClick={() => handlePrintRequisition(req)}><Printer size={16} /></button>
                                                            {can('purchase_requisition') && (
                                                                <button className="action-btn purchase" title="Purchase" onClick={() => { setSelectedRequisition(req); setShowPurchaseModal(true); }}><ShoppingCart size={16} /></button>
                                                            )}
                                                        </>
                                                    )}
                                                    {req.status === 'PURCHASED' && can('receive_purchase_requisition') && (
                                                        <button className="action-btn receive" title="Receive" onClick={() => handleReceive(req.id)}><Package size={16} /></button>
                                                    )}
                                                    {['PURCHASED', 'RECEIVED'].includes(req.status) && can('manage_damaged_goods') && (
                                                        <button className="action-btn delete" title="Record Damaged Goods" onClick={() => {
                                                            setSelectedRequisition(req);
                                                            const firstItem = asArray<any>(req.items)[0];
                                                            setDamageProductId(String(firstItem?.product_id || req.product_id || ''));
                                                            setDamageQty('');
                                                            setDamageNotes('');
                                                            setShowDamageModal(true);
                                                        }}><PackageMinus size={16} /></button>
                                                    )}
                                                    {req.status === 'RECEIVED' && can('complete_purchase_requisition') && (
                                                        <button className="action-btn complete" title="Complete" onClick={() => handleComplete(req.id)}><Check size={16} /></button>
                                                    )}
                                                    <button className="action-btn" title="History" onClick={() => openHistory(req)}><Clock size={16} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </motion.div>
                )}

                {showItemsModal && selectedRequisition && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => setShowItemsModal(false)}
                    >
                        <motion.div
                            className="modal-content requisition-items-modal"
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal-header-row">
                                <div>
                                    <h2>Requisition Details</h2>
                                    <p><strong>{selectedRequisition.requisition_number}</strong> · Current holder: {getCurrentOwner(selectedRequisition)}</p>
                                </div>
                                <button
                                    className="action-btn"
                                    type="button"
                                    title="Close"
                                    onClick={() => {
                                        setShowItemsModal(false);
                                        setSelectedRequisition(null);
                                    }}
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="detail-metrics-grid">
                                <div>
                                    <span>Products</span>
                                    <strong>{asArray(selectedRequisition.items).length || 1}</strong>
                                </div>
                                <div>
                                    <span>Best Estimated Total</span>
                                    <strong>{formatMoney(getBestEstimatedTotal())}</strong>
                                </div>
                                <div>
                                    <span>Delivery Date</span>
                                    <strong>{formatDate(selectedRequisition.required_delivery_date)}</strong>
                                </div>
                            </div>

                            <div className="workflow-strip">
                                {getWorkflowSteps(selectedRequisition).map((step) => (
                                    <div key={step.label} className={`workflow-step ${step.status.toLowerCase()}`}>
                                        <strong>{step.label}</strong>
                                        <span>{step.status}</span>
                                        <p>{step.note}</p>
                                    </div>
                                ))}
                            </div>

                            <h3 className="detail-section-title">Products & Quantities</h3>
                            <div className="items-detail-list">
                                {(asArray<PurchaseRequisitionItem>(selectedRequisition.items).length > 0
                                    ? asArray<PurchaseRequisitionItem>(selectedRequisition.items)
                                    : [{
                                        id: selectedRequisition.id,
                                        requisition_id: selectedRequisition.id,
                                        product_id: selectedRequisition.product_id,
                                        product_name: selectedRequisition.product_name,
                                        quantity: selectedRequisition.quantity,
                                        quantity_unit: selectedRequisition.quantity_unit,
                                        remarks: selectedRequisition.remarks,
                                    }]
                                ).map((item, index) => (
                                    <div key={item.id || `${item.product_id}-${index}`} className="items-detail-row">
                                        <div>
                                            <span className="line-number">#{index + 1}</span>
                                            <strong>{item.product_name || 'Unknown Product'}</strong>
                                            {item.remarks ? <p>{item.remarks}</p> : null}
                                            {canViewPurchasePricing && (
                                                <div className="previous-price-list">
                                                    {(viewPurchaseHistory[String(item.product_id)] || []).length === 0 ? (
                                                        <span>No previous purchase price found</span>
                                                    ) : (
                                                        (viewPurchaseHistory[String(item.product_id)] || []).slice(0, 3).map((history, historyIndex) => (
                                                            <span key={historyIndex}>
                                                                Previous: {formatMoney(history.rate ?? (history.qty ? Number(history.amount || 0) / Number(history.qty) : history.amount || 0))}
                                                                {' '}on {formatDate(history.purchase_bill?.bill_date)}
                                                                {history.purchase_bill?.supplier?.name ? ` from ${history.purchase_bill.supplier.name}` : ''}
                                                            </span>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <span className="items-detail-qty">{item.quantity} {item.quantity_unit}</span>
                                    </div>
                                ))}
                            </div>

                            <h3 className="detail-section-title">Supplier / Vendor Estimates</h3>
                            {viewLoading ? (
                                <div className="loading">Loading details...</div>
                            ) : asArray(viewQuotes).length === 0 ? (
                                <div className="empty-inline">No supplier estimates added yet.</div>
                            ) : (
                                <div className="quote-detail-list">
                                    {asArray<any>(viewQuotes).map((quote) => (
                                        <div key={quote.id} className="quote-detail-row">
                                            <strong>{quote.supplier?.name || 'Unknown vendor'}</strong>
                                            <span>{formatMoney(Number(quote.estimated_price))}</span>
                                            <p>{quote.remarks || 'No remarks'}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {(isAdminUser || can('view_purchase_requisition_audit')) && (
                                <>
                                    <h3 className="detail-section-title">Audit Trail</h3>
                                    {asArray(viewHistoryEntries).length === 0 ? (
                                        <div className="empty-inline">No workflow history found.</div>
                                    ) : (
                                        <div className="history-detail-list">
                                            {asArray<PurchaseRequisitionHistory>(viewHistoryEntries).map((entry) => (
                                                <div key={entry.id} className="history-detail-row">
                                                    <strong>{entry.action}</strong>
                                                    <span>{entry.from_status || '—'} → {entry.to_status}</span>
                                                    <p>{entry.performed_by_name || '—'} · {formatDate(entry.performed_at)} · {entry.remarks || 'No remarks'}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}

                {showProductSummaryModal && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => setShowProductSummaryModal(false)}
                    >
                        <motion.div
                            className="modal-content product-summary-modal"
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal-header-row">
                                <div>
                                    <h2>Product Summary</h2>
                                    <p>Stock, last purchase, and sales record for the selected product.</p>
                                </div>
                                <button
                                    className="action-btn"
                                    type="button"
                                    title="Close"
                                    onClick={() => {
                                        setShowProductSummaryModal(false);
                                        setProductSummary(null);
                                        setSelectedSummaryProductId('');
                                    }}
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {productSummaryLoading && !productSummary ? (
                                <div className="loading">Loading product summary...</div>
                            ) : !productSummary ? (
                                <div className="empty-inline">No product summary found.</div>
                            ) : (
                                <>
                                    <div className="product-summary-hero">
                                        <div>
                                            <span className="line-number">Product</span>
                                            <strong>{productSummary.product?.name || 'Unknown Product'}</strong>
                                            <p>{productSummary.product?.product_code || productSummary.product?.model_number || productSummary.product?.sku || 'No model number'} · {productSummary.product?.group_name || 'No stock group'}</p>
                                        </div>
                                        <div className="product-summary-stock">
                                            <span>Current Stock</span>
                                            <strong>{Number(productSummary.product?.quantity || 0).toLocaleString()} {productSummary.product?.unit_symbol || productSummary.product?.unit_name || ''}</strong>
                                        </div>
                                    </div>

                                    <div className="detail-metrics-grid">
                                        <div>
                                            <span>Last Purchase Date</span>
                                            <strong>{formatDate(productSummary.lastPurchase?.purchase_bill?.bill_date)}</strong>
                                        </div>
                                        <div>
                                            <span>Last Purchase Price</span>
                                            <strong>{formatMoney(productSummary.lastPurchase?.rate ?? (productSummary.lastPurchase?.qty ? Number(productSummary.lastPurchase?.amount || 0) / Number(productSummary.lastPurchase?.qty) : productSummary.lastPurchase?.amount))}</strong>
                                        </div>
                                        <div>
                                            <span>Last Supplier</span>
                                            <strong>{productSummary.lastPurchase?.purchase_bill?.supplier?.name || '—'}</strong>
                                        </div>
                                    </div>

                                    <h3 className="detail-section-title">Sales Record</h3>
                                    <div className="product-summary-filters">
                                        <div className="form-group compact">
                                            <label>From</label>
                                            <input
                                                type="date"
                                                value={productSummaryFilters.fromDate}
                                                onChange={(e) => setProductSummaryFilters(prev => ({ ...prev, fromDate: e.target.value }))}
                                            />
                                        </div>
                                        <div className="form-group compact">
                                            <label>To</label>
                                            <input
                                                type="date"
                                                value={productSummaryFilters.toDate}
                                                onChange={(e) => setProductSummaryFilters(prev => ({ ...prev, toDate: e.target.value }))}
                                            />
                                        </div>
                                        <button type="button" className="btn-primary" onClick={applyProductSummaryFilter} disabled={productSummaryLoading}>
                                            {productSummaryLoading ? 'Loading...' : 'Apply'}
                                        </button>
                                    </div>

                                    <div className="detail-metrics-grid">
                                        <div>
                                            <span>Sale Entries</span>
                                            <strong>{productSummary.salesSummary?.count || 0}</strong>
                                        </div>
                                        <div>
                                            <span>Total Sold</span>
                                            <strong>{Number(productSummary.salesSummary?.totalSoldQty || 0).toLocaleString()}</strong>
                                        </div>
                                        <div>
                                            <span>Total Sales</span>
                                            <strong>{formatMoney(productSummary.salesSummary?.totalSalesAmount)}</strong>
                                        </div>
                                    </div>

                                    {asArray(productSummary.sales).length === 0 ? (
                                        <div className="empty-inline">No sales found for this product in the selected date range.</div>
                                    ) : (
                                        <div className="product-summary-sales-list">
                                            {asArray<any>(productSummary.sales).map((sale, index) => (
                                                <div key={`${sale.bill?.id || index}-${index}`} className="product-summary-sale-row">
                                                    <div>
                                                        <strong>{sale.bill?.invoice_number || 'Invoice'}</strong>
                                                        <span>{formatDate(sale.bill?.created_at)} · {sale.bill?.customer_name || 'Walk-in customer'}</span>
                                                    </div>
                                                    <span>{Number(sale.quantity || 0).toLocaleString()} sold</span>
                                                    <strong>{formatMoney(sale.price)}</strong>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}

                {showDamageModal && selectedRequisition && (
                    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowDamageModal(false)}>
                        <motion.div className="modal-content" initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header-row">
                                <div>
                                    <h2>Record Damaged Goods</h2>
                                    <p>Damaged quantity will be kept separate from usable stock for requisition <strong>{selectedRequisition.requisition_number}</strong>.</p>
                                </div>
                                <button className="action-btn" onClick={() => setShowDamageModal(false)}><X size={16} /></button>
                            </div>
                            <div className="form-group">
                                <label>Product</label>
                                <select value={damageProductId} onChange={(e) => setDamageProductId(e.target.value)}>
                                    {(asArray(selectedRequisition.items).length > 0 ? asArray<any>(selectedRequisition.items) : [{
                                        product_id: selectedRequisition.product_id,
                                        product_name: selectedRequisition.product_name,
                                        quantity: selectedRequisition.quantity,
                                        quantity_unit: selectedRequisition.quantity_unit,
                                    }]).map((item: any) => (
                                        <option key={item.product_id} value={item.product_id}>{item.product_name || 'Unknown Product'} ({item.quantity} {item.quantity_unit})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Damaged Quantity</label>
                                <input type="number" min="0.001" step="0.001" value={damageQty} onChange={(e) => setDamageQty(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Damage Notes</label>
                                <textarea rows={3} value={damageNotes} onChange={(e) => setDamageNotes(e.target.value)} placeholder="Damage reason or receiving note" />
                            </div>
                            <div className="modal-actions">
                                <button className="btn-secondary" onClick={() => setShowDamageModal(false)}>Cancel</button>
                                <button className="btn-primary" onClick={async () => {
                                    const result = await (window as any).electron?.createDamagedGoods?.({
                                        productId: Number(damageProductId),
                                        quantity: Number(damageQty),
                                        notes: damageNotes,
                                        sourceRequisitionId: selectedRequisition.id,
                                        performedByName: userName,
                                        userRole,
                                        canManageDamaged: can('manage_damaged_goods'),
                                    });
                                    if (result?.success) {
                                        setShowDamageModal(false);
                                        fetchData();
                                    } else {
                                        alert(result?.error || 'Failed to record damaged goods.');
                                    }
                                }}><PackageMinus size={16} /> Record Damaged</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {tab === 'approvals' && (
                    <motion.div className="list-view" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="master-create-container" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                            <h3 style={{ marginBottom: '1rem' }}>Audit Review Queue</h3>
                            <div className="table-container">
                                <table className="master-table">
                                    <thead>
                                        <tr>
                                            <th>Req #</th><th>Product</th><th>Stage</th><th style={{ textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRequisitions.filter(req => req.status === 'PENDING_AUDIT').map(req => (
                                            <tr key={req.id}>
                                                <td>{req.requisition_number}</td>
                                                <td>{getProductSummary(req)}</td>
                                                <td>{getStageLabel(req)}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button className="action-btn approve" onClick={() => openAuditModal(req)}><AlertCircle size={16} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="master-create-container" style={{ padding: '1.25rem' }}>
                            <h3 style={{ marginBottom: '1rem' }}>Director Review Queue</h3>
                            <div className="table-container">
                                <table className="master-table">
                                    <thead>
                                        <tr>
                                            <th>Req #</th><th>Product</th><th>Stage</th><th style={{ textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRequisitions.filter(req => req.status === 'PENDING_DIRECTOR').map(req => (
                                            <tr key={req.id}>
                                                <td>{req.requisition_number}</td>
                                                <td>{getProductSummary(req)}</td>
                                                <td>{getStageLabel(req)}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button className="action-btn approve" onClick={() => openDirectorModal(req)}><Check size={16} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </motion.div>
                )}

                {tab === 'history' && (
                    <motion.div className="list-view" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="master-create-container" style={{ padding: '1.25rem' }}>
                            <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Clock size={18} /> Requisition History</h3>
                            <p style={{ opacity: 0.75, marginBottom: '1rem' }}>Select a requisition from the list to review its complete workflow history.</p>
                            {historyLoading ? (
                                <div className="loading">Loading history...</div>
                            ) : historyRequisition ? (
                                <div>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <strong>{historyRequisition.requisition_number}</strong> - {getProductSummary(historyRequisition)}
                                        {historyRequisition.item_count && historyRequisition.item_count > 1 ? (
                                            <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                ({historyRequisition.item_count} items)
                                            </span>
                                        ) : null}
                                    </div>
                                    {asArray(historyRequisition.items).length > 0 && (
                                        <div className="line-items-summary">
                                            {asArray<PurchaseRequisitionItem>(historyRequisition.items).map((item) => (
                                                <div key={item.id} className="line-item-summary-row">
                                                    <strong>{item.product_name || 'Unknown Product'}</strong>
                                                    <span>{item.quantity} {item.quantity_unit}</span>
                                                    <span>{item.remarks || 'No remarks'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {asArray(historyEntries).length === 0 ? (
                                        <div className="empty-state">No workflow history found</div>
                                    ) : (
                                        <div className="table-container">
                                            <table className="master-table">
                                                <thead>
                                                    <tr>
                                                        <th>When</th><th>Action</th><th>From</th><th>To</th><th>By</th><th>Remarks</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {asArray<PurchaseRequisitionHistory>(historyEntries).map((entry) => (
                                                        <tr key={entry.id}>
                                                            <td>{new Date(entry.performed_at).toLocaleString()}</td>
                                                            <td>{entry.action}</td>
                                                            <td>{entry.from_status || '—'}</td>
                                                            <td>{entry.to_status}</td>
                                                            <td>{entry.performed_by_name || '—'}</td>
                                                            <td>{entry.remarks || '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="empty-state">Open a requisition history from the list view</div>
                            )}
                        </div>
                    </motion.div>
                )}

                {tab === 'create' && (
                    <motion.div
                        className="create-view"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <form onSubmit={handleCreateSubmit} className="requisition-form">
                            <div className="requisition-form-header">
                                <div>
                                    <div className="requisition-eyebrow">Purchase Requisition</div>
                                    <h2>{editingRequisition ? `Alter ${editingRequisition.requisition_number}` : 'Create Requisition'}</h2>
                                    <p>{editingRequisition ? 'Admin/director alteration of product lines and quantities.' : 'Add one or more products and submit the request for approval.'}</p>
                                </div>
                                <div className="requisition-meta-grid">
                                    <div className="form-group compact">
                                        <label>Required Delivery Date *</label>
                                        <input
                                            type="date"
                                            value={formData.requiredDeliveryDate}
                                            onChange={(e) => setFormData({ ...formData, requiredDeliveryDate: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group compact">
                                        <label>Priority</label>
                                        <select
                                            value={formData.priorityLevel}
                                            onChange={(e) => setFormData({ ...formData, priorityLevel: e.target.value })}
                                        >
                                            <option value="LOW">Low</option>
                                            <option value="MEDIUM">Medium</option>
                                            <option value="HIGH">High</option>
                                            <option value="URGENT">Urgent</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="section-divider">Line Items</div>

                            <div className="line-items-shell">
                                <table className="line-items-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '32%' }}>Product</th>
                                            <th style={{ width: '72px' }}>Info</th>
                                            <th style={{ width: '12%', textAlign: 'right' }}>Qty</th>
                                            <th style={{ width: '16%' }}>Unit</th>
                                            <th>Remarks</th>
                                            <th style={{ width: '52px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lineItems.map((item, index) => {
                                            const matchedProduct = productLabelLookup.get(item.productSearch);
                                            return (
                                                <tr key={item.id}>
                                                    <td>
                                                        <input
                                                            list="purchase-requisition-products"
                                                            value={item.productSearch}
                                                            onChange={(e) => handleLineItemChange(index, 'productSearch', e.target.value)}
                                                            placeholder="Search product"
                                                            required
                                                        />
                                                        {matchedProduct ? (
                                                            <div className="line-item-hint">Selected product</div>
                                                        ) : null}
                                                    </td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className="action-btn"
                                                            onClick={() => openProductSummary(item.productId)}
                                                            title="View product summary"
                                                            disabled={!item.productId}
                                                        >
                                                            <Eye size={15} />
                                                        </button>
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            value={item.quantity}
                                                            onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                                                            placeholder="0"
                                                            required
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="text"
                                                            value={item.quantityUnit}
                                                            onChange={(e) => handleLineItemChange(index, 'quantityUnit', e.target.value)}
                                                            placeholder="piece"
                                                            readOnly={!!matchedProduct}
                                                            title={matchedProduct ? 'Uses the selected product unit' : 'Select a product to load its unit'}
                                                            required
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="text"
                                                            value={item.remarks}
                                                            onChange={(e) => handleLineItemChange(index, 'remarks', e.target.value)}
                                                            placeholder="Optional line notes"
                                                        />
                                                    </td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className="action-btn delete"
                                                            onClick={() => removeLineItem(index)}
                                                            title="Remove line"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <datalist id="purchase-requisition-products">
                                {productLabels.map((product) => (
                                    <option key={product.id} value={product.label} />
                                ))}
                            </datalist>

                            <button type="button" className="add-line-btn" onClick={addLineItem}>
                                <Plus size={16} /> Add Line Item
                            </button>

                            <div className="form-group">
                                <label>Remarks</label>
                                <textarea
                                    value={formData.remarks}
                                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                                    rows={4}
                                    placeholder="Optional overall notes"
                                />
                            </div>

                            <div className="form-actions requisition-actions">
                                <button type="button" className="btn-secondary" onClick={resetCreateForm}>
                                    {editingRequisition ? 'Cancel Edit' : 'Reset'}
                                </button>
                                <button type="submit" className="btn-primary">
                                    {editingRequisition ? 'Save Alteration' : 'Create Requisition'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                )}

                {showApprovalModal && selectedRequisition && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => setShowApprovalModal(false)}
                    >
                        <motion.div
                            className="modal-content"
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2>Approve Requisition</h2>
                            <p>
                                Requisition <strong>{selectedRequisition.requisition_number}</strong>
                            </p>
                            <textarea
                                placeholder="Approval notes..."
                                value={approvalNotes}
                                onChange={(e) => setApprovalNotes(e.target.value)}
                                rows={4}
                            />
                            <div className="modal-actions">
                                <button className="btn-success" onClick={handleApprove}>
                                    <Check size={18} /> Approve
                                </button>
                                <button
                                    className="btn-secondary"
                                    onClick={() => {
                                        setShowApprovalModal(false);
                                        setApprovalNotes('');
                                        setSelectedRequisition(null);
                                    }}
                                >
                                    <X size={18} /> Cancel
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {showAuditModal && selectedRequisition && (
                    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowAuditModal(false)}>
                        <motion.div className="modal-content" initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
                            <h2>Audit Review</h2>
                            <p>Requisition <strong>{selectedRequisition.requisition_number}</strong></p>
                            
                            <div style={{ marginTop: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
                                <h4>Submitted Quotes</h4>
                                {fetchedQuotes.length === 0 ? <p style={{ fontSize: '0.9rem', color: '#666' }}>No quotes available.</p> : (
                                    <ul style={{ fontSize: '0.9rem', paddingLeft: '1.2rem', marginTop: '0.5rem' }}>
                                        {fetchedQuotes.map((q, i) => (
                                            <li key={i}><strong>{q.supplier?.name}</strong> - ৳{q.estimated_price} {q.remarks ? `(${q.remarks})` : ''}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <textarea placeholder="Audit remarks..." value={auditNotes} onChange={(e) => setAuditNotes(e.target.value)} rows={4} style={{ marginTop: '1rem' }} />
                            <div className="modal-actions">
                                <button className="btn-success" onClick={() => handleAuditReview('APPROVED')}><Check size={18} /> Approve</button>
                                <button className="btn-secondary" onClick={() => handleAuditReview('REJECTED')}><X size={18} /> Reject</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {showEstimatesModal && selectedRequisition && (
                    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowEstimatesModal(false)}>
                        <motion.div className="modal-content" style={{ maxWidth: '600px' }} initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
                            <h2>Add Purchase Estimates (Quotes)</h2>
                            <p>Requisition <strong>{selectedRequisition.requisition_number}</strong></p>
                            
                            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {estimates.map((est, i) => (
                                    <div key={i} style={{ border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '8px', background: '#f8fafc' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: '0.5rem', alignItems: 'center' }}>
                                            <select 
                                                value={est.supplierId} 
                                                onChange={(e) => { const newEst = [...estimates]; newEst[i].supplierId = e.target.value; setEstimates(newEst); }}
                                                style={{ padding: '0.5rem' }}
                                            >
                                                <option value="">-- Select Vendor --</option>
                                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                <option value="NEW">+ Create New Supplier</option>
                                            </select>
                                            <input type="number" placeholder="Est. Price" value={est.estimatedPrice} onChange={(e) => { const newEst = [...estimates]; newEst[i].estimatedPrice = e.target.value; setEstimates(newEst); }} style={{ padding: '0.5rem' }} />
                                            <input type="text" placeholder="Remarks" value={est.remarks} onChange={(e) => { const newEst = [...estimates]; newEst[i].remarks = e.target.value; setEstimates(newEst); }} style={{ padding: '0.5rem' }} />
                                            <button className="btn-secondary" onClick={() => setEstimates(estimates.filter((_, idx) => idx !== i))} style={{ padding: '0.5rem' }}><Trash2 size={16} /></button>
                                        </div>
                                        {est.supplierId === 'NEW' && (
                                            <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                <input type="text" placeholder="Supplier Name *" value={est.newSupplier?.name || ''} onChange={(e) => { const newEst = [...estimates]; newEst[i].newSupplier = { ...newEst[i].newSupplier, name: e.target.value }; setEstimates(newEst); }} style={{ padding: '0.5rem' }} />
                                                <input type="text" placeholder="Store Name" value={est.newSupplier?.storeName || ''} onChange={(e) => { const newEst = [...estimates]; newEst[i].newSupplier = { ...newEst[i].newSupplier, storeName: e.target.value }; setEstimates(newEst); }} style={{ padding: '0.5rem' }} />
                                                <input type="text" placeholder="Contact Person" value={est.newSupplier?.contactPerson || ''} onChange={(e) => { const newEst = [...estimates]; newEst[i].newSupplier = { ...newEst[i].newSupplier, contactPerson: e.target.value }; setEstimates(newEst); }} style={{ padding: '0.5rem' }} />
                                                <input type="text" placeholder="Contact Number" value={est.newSupplier?.contactNumber || ''} onChange={(e) => { const newEst = [...estimates]; newEst[i].newSupplier = { ...newEst[i].newSupplier, contactNumber: e.target.value }; setEstimates(newEst); }} style={{ padding: '0.5rem' }} />
                                                <input type="text" placeholder="Payment Method" value={est.newSupplier?.paymentMethod || ''} onChange={(e) => { const newEst = [...estimates]; newEst[i].newSupplier = { ...newEst[i].newSupplier, paymentMethod: e.target.value }; setEstimates(newEst); }} style={{ padding: '0.5rem', gridColumn: '1 / -1' }} />
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <button className="btn-secondary" onClick={() => setEstimates([...estimates, { supplierId: '', estimatedPrice: '', remarks: '' }])} style={{ width: 'fit-content' }}>+ Add Vendor Quote</button>
                            </div>

                            <div className="modal-actions" style={{ marginTop: '2rem' }}>
                                <button className="btn-success" onClick={handleSubmitEstimates}><Check size={18} /> Submit Estimates</button>
                                <button className="btn-secondary" onClick={() => setShowEstimatesModal(false)}>Cancel</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {showDirectorModal && selectedRequisition && (
                    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowDirectorModal(false)}>
                        <motion.div className="modal-content" style={{ maxWidth: '600px' }} initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
                            <h2>Director Approval</h2>
                            <p>Requisition <strong>{selectedRequisition.requisition_number}</strong></p>
                            
                            <div style={{ marginTop: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
                                <h4>Submitted Quotes</h4>
                                {fetchedQuotes.length === 0 ? <p style={{ fontSize: '0.9rem', color: '#666' }}>No quotes available.</p> : (
                                    <ul style={{ fontSize: '0.9rem', paddingLeft: '1.2rem', marginTop: '0.5rem' }}>
                                        {fetchedQuotes.map((q, i) => (
                                            <li key={i}><strong>{q.supplier?.name}</strong> - ৳{q.estimated_price} {q.remarks ? `(${q.remarks})` : ''}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <div style={{ marginTop: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
                                <h4>Past Purchase History</h4>
                                {directorHistory.length === 0 ? <p style={{ fontSize: '0.9rem', color: '#666' }}>No past purchase history available.</p> : (
                                    <ul style={{ fontSize: '0.9rem', paddingLeft: '1.2rem', marginTop: '0.5rem' }}>
                                        {directorHistory.map((h, i) => (
                                            <li key={i}>
                                                {formatDate(h.purchase_bill?.bill_date)} - <strong>৳{h.rate ?? (h.qty ? Number(h.amount || 0) / Number(h.qty) : h.amount || 0)}</strong> from {h.purchase_bill?.supplier?.name || 'Unknown supplier'}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <textarea placeholder="Director comments..." value={directorNotes} onChange={(e) => setDirectorNotes(e.target.value)} rows={4} style={{ marginTop: '1rem' }} />
                            <div className="modal-actions">
                                <button className="btn-success" onClick={() => handleDirectorReview('APPROVED')}><Check size={18} /> Approve</button>
                                <button className="btn-secondary" onClick={() => handleDirectorReview('REJECTED')}><X size={18} /> Reject</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {showPurchaseModal && selectedRequisition && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => setShowPurchaseModal(false)}
                    >
                        <motion.div
                            className="modal-content"
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2>Purchase Requisition</h2>
                            <p>
                                Requisition <strong>{selectedRequisition.requisition_number}</strong>
                            </p>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label>Warehouse Location (e.g., A-1-5)</label>
                                <input
                                    type="text"
                                    placeholder="Row-Rack-Bin format"
                                    value={warehouseLocation}
                                    onChange={(e) => setWarehouseLocation(e.target.value)}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label>Invoice ID / Bill Number *</label>
                                    <input
                                        type="text"
                                        placeholder="INV-XXXX"
                                        value={purchaseInvoiceId}
                                        onChange={(e) => setPurchaseInvoiceId(e.target.value)}
                                        required
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label>Quantity Purchased *</label>
                                    <input
                                        type="number"
                                        placeholder="Quantity"
                                        value={purchasedQuantity}
                                        onChange={(e) => setPurchasedQuantity(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label>Remarks</label>
                                <input
                                    type="text"
                                    placeholder="Any purchase remarks..."
                                    value={purchaseRemarks}
                                    onChange={(e) => setPurchaseRemarks(e.target.value)}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label>Supplier / Vendor</label>
                                <select 
                                    value={selectedSupplierId} 
                                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid #ccc' }}
                                >
                                    <option value="">-- Select Existing Supplier --</option>
                                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} {s.contact_number ? `(${s.contact_number})` : ''}</option>)}
                                    <option value="NEW">+ Create New Supplier</option>
                                </select>
                            </div>
                            {selectedSupplierId === 'NEW' && (
                                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem' }}>New Supplier Details</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <input type="text" placeholder="Supplier Name *" required value={newSupplier.name} onChange={e => setNewSupplier(p => ({ ...p, name: e.target.value }))} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
                                        <input type="text" placeholder="Store Name" value={newSupplier.storeName} onChange={e => setNewSupplier(p => ({ ...p, storeName: e.target.value }))} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
                                        <input type="text" placeholder="Contact Person" value={newSupplier.contactPerson} onChange={e => setNewSupplier(p => ({ ...p, contactPerson: e.target.value }))} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
                                        <input type="text" placeholder="Contact Number" value={newSupplier.contactNumber} onChange={e => setNewSupplier(p => ({ ...p, contactNumber: e.target.value }))} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
                                        <input type="text" placeholder="Payment Method (e.g. Bank, Cash, Bkash)" value={newSupplier.paymentMethod} onChange={e => setNewSupplier(p => ({ ...p, paymentMethod: e.target.value }))} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', gridColumn: '1 / -1' }} />
                                    </div>
                                </div>
                            )}
                            <div className="modal-actions">
                                <button className="btn-success" onClick={handlePurchase}>
                                    <ShoppingCart size={18} /> Purchase
                                </button>
                                <button
                                    className="btn-secondary"
                                    onClick={() => {
                                        setShowPurchaseModal(false);
                                        setWarehouseLocation('');
                                        setSelectedRequisition(null);
                                    }}
                                >
                                    <X size={18} /> Cancel
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </div>
    );
};

export default PurchaseRequisitions;
