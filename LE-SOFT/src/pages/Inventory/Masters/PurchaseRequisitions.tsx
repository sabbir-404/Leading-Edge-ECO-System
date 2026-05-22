import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, Check, X, Package, ShoppingCart, AlertCircle, Clock, FileText, Eye, Printer, Edit2, PackageMinus, ArrowLeft, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
    purchased_quantity?: number;
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
    purchase_order_number?: string;
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
    const [lastPurchasedPrices, setLastPurchasedPrices] = useState<Record<string, number | null>>({});
    const [showComparisonDrawer, setShowComparisonDrawer] = useState(false);
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
    const [purchasedQuantities, setPurchasedQuantities] = useState<Record<string, number>>({});
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

    useEffect(() => {
        if (showEstimatesModal && selectedRequisition) {
            const itemsList = getPrintableItems(selectedRequisition);
            const fetchAllHistory = async () => {
                const pricesMap: Record<string, number | null> = {};
                await Promise.all(itemsList.map(async (item) => {
                    try {
                        const history = await (window as any).electron?.getProductPurchaseHistory?.(Number(item.product_id));
                        if (history && history.length > 0) {
                            const rate = history[0].rate ?? (history[0].qty ? Number(history[0].amount || 0) / Number(history[0].qty) : history[0].amount);
                            pricesMap[String(item.product_id)] = Number(rate) || null;
                        } else {
                            pricesMap[String(item.product_id)] = null;
                        }
                    } catch (e) {
                        console.error(e);
                        pricesMap[String(item.product_id)] = null;
                    }
                }));
                setLastPurchasedPrices(pricesMap);
            };
            fetchAllHistory();
        } else {
            setLastPurchasedPrices({});
            setShowComparisonDrawer(false);
        }
    }, [showEstimatesModal, selectedRequisition]);

    useEffect(() => {
        if (showPurchaseModal && selectedRequisition) {
            const items = getPrintableItems(selectedRequisition);
            const initialQtys: Record<string, number> = {};
            items.forEach((item) => {
                initialQtys[item.id] = item.purchased_quantity ?? item.quantity;
            });
            setPurchasedQuantities(initialQtys);
        } else {
            setPurchasedQuantities({});
        }
    }, [showPurchaseModal, selectedRequisition]);

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
                        processedEstimates.push({
                            productId: est.productId,
                            supplierId: newLedger.id.toString(),
                            estimatedPrice: est.estimatedPrice,
                            remarks: est.remarks
                        });
                    } else {
                        throw new Error('Failed to create new supplier');
                    }
                } else {
                    processedEstimates.push({
                        productId: est.productId,
                        supplierId: est.supplierId,
                        estimatedPrice: est.estimatedPrice,
                        remarks: est.remarks
                    });
                }
            }

            const result = await (window as any).electron?.submitPurchaseEstimates?.(
                selectedRequisition.id,
                processedEstimates,
                userName
            );
            if (result?.success) {
                setShowEstimatesModal(false);
                setEstimates([]);
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
            
            const items = getPrintableItems(selectedRequisition);
            const finalQuantities: Record<string, number> = {};
            let totalPurchasedQuantity = 0;
            
            for (const item of items) {
                const qtyVal = purchasedQuantities[item.id];
                if (qtyVal === undefined || qtyVal === null || Number.isNaN(qtyVal) || qtyVal <= 0) {
                    alert(`Purchased quantity for ${item.product_name || 'product'} must be greater than zero.`);
                    return;
                }
                finalQuantities[item.id] = Number(qtyVal);
                totalPurchasedQuantity += Number(qtyVal);
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
                    purchasedQuantity: totalPurchasedQuantity || selectedRequisition.quantity,
                    purchasedQuantities: finalQuantities,
                    purchaseRemarks,
                    supplierId: finalSupplierId ? Number(finalSupplierId) : null,
                    performedByName: userName,
                }
            );
            if (result?.success) {
                setShowPurchaseModal(false);
                setWarehouseLocation('');
                setPurchaseInvoiceId('');
                setPurchasedQuantities({});
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

    const renderWorkflowStepper = (req: PurchaseRequisition) => {
        const stages = [
            { key: 'DRAFT', label: 'Store Draft' },
            { key: 'PENDING_AUDIT', label: 'Audit Review' },
            { key: 'PENDING_ESTIMATE', label: 'Estimates' },
            { key: 'PENDING_APPROVAL', label: 'Director Review' },
            { key: 'READY', label: 'Purchase' },
            { key: 'COMPLETED', label: 'Completed' },
        ];

        let currentIdx = 0;
        if (req.status === 'PENDING_AUDIT') currentIdx = 1;
        else if (req.status === 'PENDING_ESTIMATE') currentIdx = 2;
        else if (['PENDING_APPROVAL', 'PENDING_DIRECTOR'].includes(req.status)) currentIdx = 3;
        else if (['READY', 'APPROVED'].includes(req.status)) currentIdx = 4;
        else if (['COMPLETED', 'RECEIVED', 'PURCHASED'].includes(req.status)) currentIdx = 5;
        
        const isRejected = req.status.includes('REJECTED') || req.approval_status === 'REJECTED';

        return (
            <div className="stepper-container">
                {stages.map((stage, idx) => {
                    const isCompleted = idx < currentIdx;
                    const isActive = idx === currentIdx;
                    
                    let stepClass = 'step-upcoming';
                    if (isCompleted) stepClass = 'step-completed';
                    else if (isActive) stepClass = isRejected ? 'step-rejected' : 'step-active';

                    return (
                        <React.Fragment key={stage.key}>
                            <div className={`step-item ${stepClass}`}>
                                <div className="step-number">
                                    {isCompleted ? '✓' : isRejected && isActive ? '✗' : idx + 1}
                                </div>
                                <div className="step-label">{stage.label}</div>
                            </div>
                            {idx < stages.length - 1 && (
                                <div className={`step-connector ${idx < currentIdx ? 'completed' : ''}`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        );
    };

    useEffect(() => {
        if (filteredRequisitions.length > 0) {
            const stillExists = filteredRequisitions.some(r => r.id === selectedRequisition?.id);
            if (!selectedRequisition || !stillExists) {
                setSelectedRequisition(filteredRequisitions[0]);
            }
        } else {
            setSelectedRequisition(null);
        }
    }, [filteredRequisitions, selectedRequisition]);

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
        if (req.status === 'PENDING_ESTIMATE') return 'Purchase Department';
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
        { label: 'Purchase (Quotes)', status: ['PENDING_AUDIT', 'PENDING_DIRECTOR', 'APPROVED', 'PURCHASED', 'RECEIVED', 'COMPLETED'].includes(req.status) ? 'Cleared' : req.status === 'PENDING_ESTIMATE' ? 'Current' : 'Pending', note: 'Add supplier and estimated price' },
        { label: 'Audit', status: req.audit_status === 'APPROVED' ? 'Cleared' : req.audit_status === 'REJECTED' ? 'Rejected' : req.status === 'PENDING_AUDIT' ? 'Current' : 'Pending', note: req.audit_notes || 'Audit justification' },
        { label: 'Director', status: req.director_status === 'APPROVED' ? 'Cleared' : req.director_status === 'REJECTED' ? 'Rejected' : req.status === 'PENDING_DIRECTOR' ? 'Current' : 'Pending', note: req.director_notes || 'Final approval' },
        { label: 'Purchase (PO)', status: ['PURCHASED', 'RECEIVED', 'COMPLETED'].includes(req.status) ? 'Cleared' : req.status === 'APPROVED' ? 'Current' : 'Pending', note: req.purchase_remarks || 'Purchase and record PO' },
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
                ? '<tr><td colspan="4" class="empty">No supplier/vendor estimate recorded.</td></tr>'
                : (quotes || []).map((quote: any) => {
                    const matchedItem = items.find((item) => String(item.product_id) === String(quote.product_id));
                    const prodName = matchedItem?.product_name || products.find((p) => p.id === quote.product_id)?.name || 'General';
                    return `
                        <tr>
                            <td>${escapeHtml(quote.supplier?.name || 'Unknown vendor')}</td>
                            <td>${escapeHtml(prodName)}</td>
                            <td class="right">${escapeHtml(formatMoney(Number(quote.estimated_price)))}</td>
                            <td>${escapeHtml(quote.remarks || '—')}</td>
                        </tr>
                    `;
                }).join('');

            const printWindow = window.open('', '_blank', 'width=900,height=1100');
            if (!printWindow) {
                alert('Unable to open print window. Please allow popups for this app.');
                return;
            }

            const docTitle = req.purchase_order_number 
                ? `${escapeHtml(req.purchase_order_number)} - Purchase Order` 
                : `${escapeHtml(req.requisition_number)} - Purchase Requisition`;
                
            const headerTitle = req.purchase_order_number ? 'Purchase Order' : 'Purchase Requisition';

            printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>${docTitle}</title>
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
                <h1>${headerTitle}</h1>
            </div>
            <div>
                <div><span class="label">Requisition No.</span><span class="value">${escapeHtml(req.requisition_number)}</span></div>
                ${req.purchase_order_number ? `<div style="margin-top: 8px;"><span class="label">Purchase Order No.</span><span class="value" style="color: #f97316; font-weight: 800;">${escapeHtml(req.purchase_order_number)}</span></div>` : ''}
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
            <thead><tr><th>Supplier / Vendor</th><th>Product</th><th class="right">Estimated Amount</th><th>Remarks</th></tr></thead>
            <tbody>${quoteRows}</tbody>
        </table>

        <section class="signatures">
            <div class="signature">Store Head</div>
            <div class="signature">Purchase Department</div>
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
                            <div className="requisitions-split-pane">
                                {/* Left Side: Sidebar list of Requisitions */}
                                <div className="requisitions-sidebar">
                                    {filteredRequisitions.map((req) => {
                                        const isSelected = selectedRequisition?.id === req.id;
                                        return (
                                            <div 
                                                key={req.id} 
                                                className={`requisition-sidebar-card ${isSelected ? 'active' : ''}`}
                                                onClick={() => setSelectedRequisition(req)}
                                            >
                                                <div className="card-top">
                                                    <span className="req-no">{req.requisition_number}</span>
                                                    <span 
                                                        className="badge-pill priority" 
                                                        style={{ background: getPriorityColor(req.priority_level) }}
                                                    >
                                                        {req.priority_level}
                                                    </span>
                                                </div>
                                                <div className="card-middle">
                                                    <span 
                                                        className="badge-pill status" 
                                                        style={{ background: getStatusColor(req.status) }}
                                                    >
                                                        {formatStatusLabel(req.status)}
                                                    </span>
                                                    <span 
                                                        className="badge-pill approval"
                                                        style={{
                                                            background:
                                                                req.approval_status === 'APPROVED'
                                                                    ? '#22c55e'
                                                                    : req.approval_status === 'REJECTED'
                                                                    ? '#ef4444'
                                                                    : '#eab308'
                                                        }}
                                                    >
                                                        {formatStatusLabel(req.approval_status)}
                                                    </span>
                                                </div>
                                                <div className="card-bottom">
                                                    <span className="owner">Holder: {getCurrentOwner(req)}</span>
                                                    <span className="date">{formatDate(req.required_delivery_date)}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Right Side: Dynamic Formal Requisition Detail Panel */}
                                <div className="requisition-details-pane">
                                    {selectedRequisition ? (
                                        <div className="details-card">
                                            {/* Details Header */}
                                            <div className="details-header">
                                                <div className="title-section">
                                                    <h3>Purchase Requisition Details</h3>
                                                    <span className="req-id">{selectedRequisition.requisition_number}</span>
                                                </div>
                                            </div>

                                            {/* Stepper Timeline */}
                                            <div className="workflow-stepper">
                                                {renderWorkflowStepper(selectedRequisition)}
                                            </div>

                                            {/* Meta Details Grid */}
                                            <div className="meta-details-grid">
                                                <div className="meta-box">
                                                    <span className="meta-label">Priority Level</span>
                                                    <span className="meta-val priority" style={{ color: getPriorityColor(selectedRequisition.priority_level) }}>
                                                        {selectedRequisition.priority_level}
                                                    </span>
                                                </div>
                                                <div className="meta-box">
                                                    <span className="meta-label">Current Holder</span>
                                                    <span className="meta-val">{getCurrentOwner(selectedRequisition)}</span>
                                                </div>
                                                <div className="meta-box">
                                                    <span className="meta-label">Workflow Stage</span>
                                                    <span className="meta-val">{getStageLabel(selectedRequisition)}</span>
                                                </div>
                                                <div className="meta-box">
                                                    <span className="meta-label">Required Delivery</span>
                                                    <span className="meta-val">{formatDate(selectedRequisition.required_delivery_date)}</span>
                                                </div>
                                            </div>

                                            {/* Line Items Table */}
                                            <div className="details-items-section">
                                                <h4>Line Items ({selectedRequisition.items?.length || 0})</h4>
                                                <table className="details-items-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Product Specification</th>
                                                            <th style={{ textAlign: 'right' }}>Qty</th>
                                                            <th style={{ width: '40%' }}>Remarks / Specifications</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {(selectedRequisition.items || []).map((item, idx) => {
                                                            const productDetail = products.find(p => String(p.id) === String(item.product_id));
                                                            return (
                                                                <tr key={idx}>
                                                                    <td>
                                                                        <div className="prod-name">{item.product_name || productDetail?.name || 'Unknown Product'}</div>
                                                                        <div className="prod-sku font-mono">{productDetail?.sku || 'No SKU'}</div>
                                                                    </td>
                                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                                                        {item.quantity} <span className="unit-label">{productDetail?.unit_symbol || item.quantity_unit || 'pcs'}</span>
                                                                    </td>
                                                                    <td className="item-remarks">{item.remarks || '—'}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Requisition Narration */}
                                            {selectedRequisition.remarks && (
                                                <div className="details-narration-section">
                                                    <h4>Narration / Remarks</h4>
                                                    <p>{selectedRequisition.remarks}</p>
                                                </div>
                                            )}

                                            {/* Split-pane Action Buttons Panel */}
                                            <div className="details-actions-bar">
                                                {/* Print / History / Details (available for all) */}
                                                <button className="btn-action primary" title="View Print Format" onClick={() => openItemsView(selectedRequisition)}>
                                                    <Eye size={16} /> Details
                                                </button>
                                                <button className="btn-action secondary" title="Print Requisition" onClick={() => handlePrintRequisition(selectedRequisition)}>
                                                    <Printer size={16} /> Print
                                                </button>
                                                <button className="btn-action secondary" title="View Progress History" onClick={() => openHistory(selectedRequisition)}>
                                                    <Clock size={16} /> History
                                                </button>

                                                {/* Status specific actions */}
                                                {(selectedRequisition.status === 'DRAFT' || (canAlterRequisition && !['PURCHASED', 'RECEIVED', 'COMPLETED'].includes(selectedRequisition.status))) && (
                                                    <button className="btn-action warning" title="Alter Products / Quantity" onClick={() => openEditRequisition(selectedRequisition)}>
                                                        <Edit2 size={16} /> Alter
                                                    </button>
                                                )}

                                                {selectedRequisition.status === 'DRAFT' && can('approve_store_requisition') && (
                                                    <>
                                                        <button className="btn-action danger" title="Delete" onClick={() => handleDelete(selectedRequisition.id)}>
                                                            <Trash2 size={16} /> Delete
                                                        </button>
                                                        <button className="btn-action success" title="Approve" onClick={() => { setSelectedRequisition(selectedRequisition); setShowApprovalModal(true); }}>
                                                            <Check size={16} /> Approve
                                                        </button>
                                                    </>
                                                )}

                                                {selectedRequisition.status === 'PENDING_ESTIMATE' && can('add_purchase_estimates') && (
                                                    <button className="btn-action estimate" title="Add Estimates" onClick={() => {
                                                        setSelectedRequisition(selectedRequisition);
                                                        const itemsList = getPrintableItems(selectedRequisition);
                                                        const initialEstimates = itemsList.map((item) => ({
                                                            productId: item.product_id,
                                                            productName: item.product_name || 'Unknown Product',
                                                            supplierId: '',
                                                            estimatedPrice: '',
                                                            remarks: '',
                                                        }));
                                                        setEstimates(initialEstimates);
                                                        setShowEstimatesModal(true);
                                                    }}>
                                                        <FileText size={16} /> Add Estimates
                                                    </button>
                                                )}

                                                {selectedRequisition.status === 'PENDING_AUDIT' && can('audit_purchase_requisition') && (
                                                    <button className="btn-action audit" title="Audit Review" onClick={() => openAuditModal(selectedRequisition)}>
                                                        <AlertCircle size={16} /> Audit Review
                                                    </button>
                                                )}

                                                {selectedRequisition.status === 'PENDING_DIRECTOR' && can('director_approve_purchase_requisition') && (
                                                    <button className="btn-action approve" title="Director Review" onClick={() => openDirectorModal(selectedRequisition)}>
                                                        <Check size={16} /> Director Review
                                                    </button>
                                                )}

                                                {selectedRequisition.status === 'APPROVED' && can('purchase_requisition') && (
                                                    <button className="btn-action purchase" title="Purchase" onClick={() => { setSelectedRequisition(selectedRequisition); setShowPurchaseModal(true); }}>
                                                        <ShoppingCart size={16} /> Purchase
                                                    </button>
                                                )}

                                                {selectedRequisition.status === 'PURCHASED' && can('receive_purchase_requisition') && (
                                                    <button className="btn-action receive" title="Receive" onClick={() => handleReceive(selectedRequisition.id)}>
                                                        <Package size={16} /> Receive Goods
                                                    </button>
                                                )}

                                                {['PURCHASED', 'RECEIVED'].includes(selectedRequisition.status) && can('manage_damaged_goods') && (
                                                    <button className="btn-action danger" title="Record Damaged Goods" onClick={() => {
                                                        setSelectedRequisition(selectedRequisition);
                                                        const firstItem = asArray<any>(selectedRequisition.items)[0];
                                                        setDamageProductId(String(firstItem?.product_id || selectedRequisition.product_id || ''));
                                                        setDamageQty('');
                                                        setDamageNotes('');
                                                        setShowDamageModal(true);
                                                    }}>
                                                        <PackageMinus size={16} /> Damage Report
                                                    </button>
                                                )}

                                                {selectedRequisition.status === 'RECEIVED' && can('complete_purchase_requisition') && (
                                                    <button className="btn-action complete" title="Complete" onClick={() => handleComplete(selectedRequisition.id)}>
                                                        <Check size={16} /> Complete
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="empty-details-pane">
                                            <Package size={36} style={{ opacity: 0.3 }} />
                                            <p>Select a purchase requisition from the sidebar to view full workflow details and actions.</p>
                                        </div>
                                    )}
                                </div>
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
                                    className="action-btn delete"
                                    type="button"
                                    title="Close"
                                    onClick={() => {
                                        setShowItemsModal(false);
                                        setSelectedRequisition(null);
                                    }}
                                >
                                    <X size={18} />
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
                                    {asArray<any>(viewQuotes).map((quote) => {
                                        const item = getPrintableItems(selectedRequisition).find(it => String(it.product_id) === String(quote.product_id));
                                        return (
                                            <div key={quote.id} className="quote-detail-row">
                                                <strong>{quote.supplier?.name || 'Unknown vendor'}</strong>
                                                <span>{formatMoney(Number(quote.estimated_price))}</span>
                                                {item ? <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.8rem', color: 'var(--accent-color)', fontWeight: '600' }}>Product: {item.product_name}</p> : null}
                                                <p>{quote.remarks || 'No remarks'}</p>
                                            </div>
                                        );
                                    })}
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

                            {/* Workflow Actions */}
                            <div className="workflow-actions-panel" style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                {(selectedRequisition.status === 'DRAFT' || (canAlterRequisition && !['PURCHASED', 'RECEIVED', 'COMPLETED'].includes(selectedRequisition.status))) && (
                                    <button className="btn-secondary" onClick={() => { setShowItemsModal(false); openEditRequisition(selectedRequisition); }}><Edit2 size={16} /> Alter</button>
                                )}
                                {selectedRequisition.status === 'DRAFT' && can('approve_store_requisition') && (
                                    <>
                                        <button className="btn-secondary" style={{ color: '#ef4444' }} onClick={() => { setShowItemsModal(false); handleDelete(selectedRequisition.id); }}><Trash2 size={16} /> Delete</button>
                                        <button className="btn-success" onClick={() => { setShowItemsModal(false); setSelectedRequisition(selectedRequisition); setShowApprovalModal(true); }}><Check size={16} /> Approve (Store Head)</button>
                                    </>
                                )}
                                {selectedRequisition.status === 'PENDING_ESTIMATE' && can('add_purchase_estimates') && (
                                    <button className="btn-primary" onClick={() => {
                                        setShowItemsModal(false);
                                        setSelectedRequisition(selectedRequisition);
                                        const itemsList = getPrintableItems(selectedRequisition);
                                        const initialEstimates = itemsList.map((item) => ({
                                            productId: item.product_id,
                                            productName: item.product_name || 'Unknown Product',
                                            supplierId: '',
                                            estimatedPrice: '',
                                            remarks: '',
                                        }));
                                        setEstimates(initialEstimates);
                                        setShowEstimatesModal(true);
                                    }}><FileText size={16} /> Add Purchase Estimates</button>
                                )}
                                {selectedRequisition.status === 'PENDING_AUDIT' && can('audit_purchase_requisition') && (
                                    <button className="btn-primary" onClick={() => { setShowItemsModal(false); openAuditModal(selectedRequisition); }}><AlertCircle size={16} /> Audit Review</button>
                                )}
                                {selectedRequisition.status === 'PENDING_DIRECTOR' && can('director_approve_purchase_requisition') && (
                                    <button className="btn-primary" onClick={() => { setShowItemsModal(false); openDirectorModal(selectedRequisition); }}><Check size={16} /> Director Review</button>
                                )}
                                {selectedRequisition.status === 'APPROVED' && (
                                    <>
                                        <button className="btn-secondary" onClick={() => handlePrintRequisition(selectedRequisition)}><Printer size={16} /> Print</button>
                                        {can('purchase_requisition') && (
                                            <button className="btn-primary" onClick={() => { setShowItemsModal(false); setSelectedRequisition(selectedRequisition); setShowPurchaseModal(true); }}><ShoppingCart size={16} /> Record Purchase</button>
                                        )}
                                    </>
                                )}
                                {selectedRequisition.status === 'PURCHASED' && can('receive_purchase_requisition') && (
                                    <button className="btn-success" onClick={() => { setShowItemsModal(false); handleReceive(selectedRequisition.id); }}><Package size={16} /> Receive Goods</button>
                                )}
                                {['PURCHASED', 'RECEIVED'].includes(selectedRequisition.status) && can('manage_damaged_goods') && (
                                    <button className="btn-secondary" style={{ color: '#ef4444' }} onClick={() => {
                                        setShowItemsModal(false);
                                        setSelectedRequisition(selectedRequisition);
                                        const firstItem = asArray<any>(selectedRequisition.items)[0];
                                        setDamageProductId(String(firstItem?.product_id || selectedRequisition.product_id || ''));
                                        setDamageQty('');
                                        setDamageNotes('');
                                        setShowDamageModal(true);
                                    }}><PackageMinus size={16} /> Record Damaged Goods</button>
                                )}
                                {selectedRequisition.status === 'RECEIVED' && can('complete_purchase_requisition') && (
                                    <button className="btn-success" onClick={() => { setShowItemsModal(false); handleComplete(selectedRequisition.id); }}><Check size={16} /> Complete Requisition</button>
                                )}
                                <button className="btn-secondary" onClick={() => { setShowItemsModal(false); openHistory(selectedRequisition); }}><Clock size={16} /> History</button>
                            </div>
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
                                    className="action-btn delete"
                                    type="button"
                                    title="Close"
                                    onClick={() => {
                                        setShowProductSummaryModal(false);
                                        setProductSummary(null);
                                        setSelectedSummaryProductId('');
                                    }}
                                >
                                    <X size={18} />
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
                                <button className="action-btn delete" onClick={() => setShowDamageModal(false)}><X size={18} /></button>
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
                                                    <button className="action-btn audit" onClick={() => openAuditModal(req)}><AlertCircle size={19} /></button>
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
                                                    <button className="action-btn approve" onClick={() => openDirectorModal(req)}><Check size={19} /></button>
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
                        <form onSubmit={handleCreateSubmit} className="requisition-form" style={{ padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                            {/* Premium Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                                <button type="button" className="requisition-back-btn" onClick={resetCreateForm}>
                                    <ArrowLeft size={18} /> Back
                                </button>
                                <h2 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                    {editingRequisition ? `Alter Requisition #${editingRequisition.requisition_number}` : 'New Purchase Requisition'}
                                </h2>
                            </div>

                            {/* Horizontal Form Row */}
                            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', width: '100%', boxSizing: 'border-box' }}>
                                <div className="form-group compact" style={{ flex: 1, minWidth: 0 }}>
                                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                        Required Delivery Date *
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.requiredDeliveryDate}
                                        onChange={(e) => setFormData({ ...formData, requiredDeliveryDate: e.target.value })}
                                        required
                                        style={{ width: '100%', minWidth: '0', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--input-field-bg)', color: 'var(--text-primary)', outline: 'none', fontSize: '0.92rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div className="form-group compact" style={{ flex: 1, minWidth: 0 }}>
                                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                        Priority Level
                                    </label>
                                    <select
                                        value={formData.priorityLevel}
                                        onChange={(e) => setFormData({ ...formData, priorityLevel: e.target.value })}
                                        style={{ width: '100%', minWidth: '0', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--input-field-bg)', color: 'var(--text-primary)', outline: 'none', fontSize: '0.92rem', boxSizing: 'border-box' }}
                                    >
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                        <option value="URGENT">Urgent</option>
                                    </select>
                                </div>
                            </div>

                            {/* Line Items Section Separator */}
                            <div className="line-items-divider">
                                <span>LINE ITEMS</span>
                                <div className="divider-line" />
                            </div>

                             {/* Line Items List */}
                             <div className="line-items-shell" style={{ border: 'none', background: 'transparent', marginBottom: '1.25rem' }}>
                                 {/* Header Row - Perfectly aligned with input grid */}
                                 <div className="line-items-header-row" style={{ padding: '0 20px 8px', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                                     <div style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Product Specification *</div>
                                     <div style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>Info</div>
                                     <div style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right' }}>Qty *</div>
                                     <div style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Unit</div>
                                     <div style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Remarks / Specifications</div>
                                     <div></div>
                                 </div>

                                 <div className="line-items-rows" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                     {lineItems.map((item, index) => {
                                         const matchedProduct = productLabelLookup.get(item.productSearch);
                                         return (
                                             <div key={item.id} className="line-item-card">
                                                 {/* Product Search */}
                                                 <div>
                                                     <input
                                                         list="purchase-requisition-products"
                                                         value={item.productSearch}
                                                         onChange={(e) => handleLineItemChange(index, 'productSearch', e.target.value)}
                                                         placeholder="Search product"
                                                         required
                                                         style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--input-field-bg)', color: 'var(--text-primary)', outline: 'none' }}
                                                     />
                                                     {matchedProduct ? (
                                                         <div className="line-item-hint" style={{ fontSize: '0.72rem', color: 'var(--accent-color)', marginTop: '4px', fontWeight: 600 }}>Selected product</div>
                                                     ) : null}
                                                 </div>

                                                 {/* Info Button */}
                                                 <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                     <button
                                                         type="button"
                                                         className="action-btn view"
                                                         onClick={() => openProductSummary(item.productId)}
                                                         title="View product summary"
                                                         disabled={!item.productId}
                                                         style={{ border: '1px solid var(--border-color)', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card-bg)', cursor: item.productId ? 'pointer' : 'default', opacity: item.productId ? 1 : 0.4 }}
                                                     >
                                                         <Eye size={16} />
                                                     </button>
                                                 </div>

                                                 {/* Qty */}
                                                 <div>
                                                     <input
                                                         type="number"
                                                         min="1"
                                                         value={item.quantity}
                                                         onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                                                         placeholder="0"
                                                         required
                                                         style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--input-field-bg)', color: 'var(--text-primary)', textAlign: 'right', outline: 'none' }}
                                                     />
                                                 </div>

                                                 {/* Unit */}
                                                 <div>
                                                     <input
                                                         type="text"
                                                         value={item.quantityUnit}
                                                         onChange={(e) => handleLineItemChange(index, 'quantityUnit', e.target.value)}
                                                         placeholder="piece"
                                                         readOnly={!!matchedProduct}
                                                         title={matchedProduct ? 'Uses the selected product unit' : 'Select a product to load its unit'}
                                                         required
                                                         style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: matchedProduct ? 'var(--hover-bg)' : 'var(--input-field-bg)', color: matchedProduct ? 'var(--text-secondary)' : 'var(--text-primary)', outline: 'none' }}
                                                     />
                                                 </div>

                                                 {/* Remarks */}
                                                 <div>
                                                     <input
                                                         type="text"
                                                         value={item.remarks}
                                                         onChange={(e) => handleLineItemChange(index, 'remarks', e.target.value)}
                                                         placeholder="Optional line notes"
                                                         style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--input-field-bg)', color: 'var(--text-primary)', outline: 'none' }}
                                                     />
                                                 </div>

                                                 {/* Delete Button */}
                                                 <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                     <button
                                                         type="button"
                                                         className="action-btn delete"
                                                         onClick={() => removeLineItem(index)}
                                                         title="Remove line"
                                                         style={{ border: '1px solid var(--border-color)', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--text-secondary)' }}
                                                     >
                                                         <Trash2 size={16} />
                                                     </button>
                                                 </div>
                                             </div>
                                         );
                                     })}
                                 </div>
                             </div>

                            <datalist id="purchase-requisition-products">
                                {productLabels.map((product) => (
                                    <option key={product.id} value={product.label} />
                                ))}
                            </datalist>

                            {/* Add Line Dashed Button */}
                            <button
                                type="button"
                                className="add-line-btn"
                                onClick={addLineItem}
                                style={{ width: '100%', padding: '12px', border: '1px dashed var(--accent-color)', borderRadius: '8px', background: 'transparent', color: 'var(--accent-color)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer', transition: 'all 0.2s', marginBottom: '2.5rem' }}
                            >
                                <Plus size={16} /> Add Line Item
                            </button>

                            {/* Narration textarea */}
                            <div className="form-group" style={{ marginBottom: '2.5rem' }}>
                                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                    Narration / Notes
                                </label>
                                <textarea
                                    value={formData.remarks}
                                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                                    rows={3}
                                    placeholder="Optional overall requisition remarks..."
                                    style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--input-field-bg)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', fontSize: '0.92rem' }}
                                />
                            </div>

                            {/* Actions footer */}
                            <div className="form-actions requisition-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={resetCreateForm}
                                    style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                                >
                                    {editingRequisition ? 'Cancel Edit' : 'Reset Form'}
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary"
                                    style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--accent-color)', color: '#fff', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <Save size={16} /> {editingRequisition ? 'Save Alteration' : 'Submit Requisition'}
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
                                {fetchedQuotes.length === 0 ? <p style={{ fontSize: '0.9rem', color: '#64748b' }}>No quotes submitted yet.</p> : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                        {fetchedQuotes.map((q, i) => {
                                            const item = getPrintableItems(selectedRequisition).find(it => String(it.product_id) === String(q.product_id));
                                            const unitPrice = Number(q.unit_price || q.estimated_price) || 0;
                                            const qty = item ? Number(item.quantity) || 1 : 1;
                                            const totalPrice = unitPrice * qty;
                                            return (
                                                <div key={i} style={{ padding: '0.6rem 0.8rem', background: 'var(--page-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                                                        <div>
                                                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{q.supplier?.name || 'Unknown Supplier'}</div>
                                                            {q.supplier?.store_name && <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Store: {q.supplier.store_name}</div>}
                                                            {q.supplier?.contact_person && <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Contact: {q.supplier.contact_person} {q.supplier.contact_number ? `(${q.supplier.contact_number})` : ''}</div>}
                                                            {(item || q.product) && <div style={{ fontSize: '0.78rem', color: 'var(--accent-color)', marginTop: '2px' }}>For: {item?.product_name || q.product?.name || 'Unknown product'}</div>}
                                                            {q.remarks && <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>{q.remarks}</div>}
                                                        </div>
                                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#059669' }}>৳{totalPrice.toLocaleString()}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>৳{unitPrice} × {qty} {item?.quantity_unit || 'pcs'}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
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
                    <>
                        <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowEstimatesModal(false)}>
                            <motion.div className="modal-content" style={{ maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }} initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                                    <div>
                                        <h2 style={{ margin: 0 }}>Add Purchase Estimates (Quotes)</h2>
                                        <p style={{ margin: '0.25rem 0 0 0' }}>Requisition <strong>{selectedRequisition.requisition_number}</strong></p>
                                    </div>
                                    <button 
                                        type="button" 
                                        className="btn-primary" 
                                        onClick={() => setShowComparisonDrawer(true)}
                                        style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600 }}
                                    >
                                        <Clock size={16} /> Compare Quotes
                                    </button>
                                </div>
                                
                                <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {getPrintableItems(selectedRequisition).map((item) => {
                                        const itemQuotes = estimates.filter(est => String(est.productId) === String(item.product_id));
                                        const qty = Number(item.quantity) || 1;
                                        return (
                                            <div key={item.product_id} style={{ border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '10px', background: 'var(--card-bg)' }}>
                                                <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--accent-color)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                    <span>
                                                        {item.product_name || 'Unknown Product'}{' '}
                                                        <span style={{ color: '#64748b', fontWeight: 'normal', fontSize: '0.82rem' }}>— Qty: {qty} {item.quantity_unit}</span>
                                                    </span>
                                                    {lastPurchasedPrices[String(item.product_id)] !== undefined && (
                                                        <span style={{ 
                                                            color: '#059669', 
                                                            background: 'rgba(5, 150, 105, 0.08)', 
                                                            border: '1px solid rgba(5, 150, 105, 0.2)', 
                                                            padding: '0.2rem 0.6rem', 
                                                            borderRadius: '6px', 
                                                            fontSize: '0.78rem', 
                                                            fontWeight: 700 
                                                        }}>
                                                            Last Purchase: {lastPurchasedPrices[String(item.product_id)] ? `৳${lastPurchasedPrices[String(item.product_id)]}` : 'None'}
                                                        </span>
                                                    )}
                                                </h4>
                                                
                                                {/* Column headers */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.4fr 1.5fr auto', gap: '0.5rem', padding: '0 0 0.4rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem' }}>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Supplier</span>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Unit Price (per piece) *</span>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Remarks</span>
                                                    <span></span>
                                                </div>

                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                    {itemQuotes.map((est, idx) => {
                                                        const globalIdx = estimates.findIndex(e => e === est);
                                                        const unitPrice = Number(est.estimatedPrice) || 0;
                                                        const totalPrice = unitPrice * qty;
                                                        return (
                                                            <div key={idx} style={{ border: '1px solid var(--border-color)', padding: '0.75rem', borderRadius: '8px', background: 'var(--page-bg)' }}>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.4fr 1.5fr auto', gap: '0.5rem', alignItems: 'center' }}>
                                                                    <select 
                                                                        value={est.supplierId} 
                                                                        onChange={(e) => { 
                                                                            const newEst = [...estimates]; 
                                                                            newEst[globalIdx].supplierId = e.target.value; 
                                                                            setEstimates(newEst); 
                                                                        }}
                                                                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
                                                                    >
                                                                        <option value="">-- Select Vendor --</option>
                                                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                                        <option value="NEW">+ Create New Supplier</option>
                                                                    </select>
                                                                    <div>
                                                                        <input 
                                                                            type="number" 
                                                                            placeholder="Unit price e.g. 10" 
                                                                            value={est.estimatedPrice} 
                                                                            min="0"
                                                                            step="0.01"
                                                                            onChange={(e) => { 
                                                                                const newEst = [...estimates]; 
                                                                                newEst[globalIdx].estimatedPrice = e.target.value; 
                                                                                setEstimates(newEst); 
                                                                            }} 
                                                                            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', width: '100%' }} 
                                                                        />
                                                                        {unitPrice > 0 && (
                                                                            <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600, marginTop: '3px' }}>
                                                                                Total: ৳{totalPrice.toLocaleString('en-BD', { minimumFractionDigits: 2 })} ({qty} × ৳{unitPrice})
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <input 
                                                                        type="text" 
                                                                        placeholder="Remarks" 
                                                                        value={est.remarks} 
                                                                        onChange={(e) => { 
                                                                            const newEst = [...estimates]; 
                                                                            newEst[globalIdx].remarks = e.target.value; 
                                                                            setEstimates(newEst); 
                                                                        }} 
                                                                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)' }} 
                                                                    />
                                                                    <button 
                                                                        className="btn-secondary" 
                                                                        onClick={() => {
                                                                            setEstimates(estimates.filter((_, gIdx) => gIdx !== globalIdx));
                                                                        }} 
                                                                        style={{ padding: '0.5rem', minWidth: 'auto', border: 'none', background: 'transparent' }}
                                                                    >
                                                                        <Trash2 size={16} style={{ color: '#ef4444' }} />
                                                                    </button>
                                                                </div>
                                                                
                                                                {est.supplierId === 'NEW' && (
                                                                    <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                                        <input type="text" placeholder="Supplier Name *" value={est.newSupplier?.name || ''} onChange={(e) => { const newEst = [...estimates]; newEst[globalIdx].newSupplier = { ...newEst[globalIdx].newSupplier, name: e.target.value }; setEstimates(newEst); }} style={{ padding: '0.4rem', fontSize: '0.85rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-primary)' }} />
                                                                        <input type="text" placeholder="Store Name" value={est.newSupplier?.storeName || ''} onChange={(e) => { const newEst = [...estimates]; newEst[globalIdx].newSupplier = { ...newEst[globalIdx].newSupplier, storeName: e.target.value }; setEstimates(newEst); }} style={{ padding: '0.4rem', fontSize: '0.85rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-primary)' }} />
                                                                        <input type="text" placeholder="Contact Person" value={est.newSupplier?.contactPerson || ''} onChange={(e) => { const newEst = [...estimates]; newEst[globalIdx].newSupplier = { ...newEst[globalIdx].newSupplier, contactPerson: e.target.value }; setEstimates(newEst); }} style={{ padding: '0.4rem', fontSize: '0.85rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-primary)' }} />
                                                                        <input type="text" placeholder="Contact Number" value={est.newSupplier?.contactNumber || ''} onChange={(e) => { const newEst = [...estimates]; newEst[globalIdx].newSupplier = { ...newEst[globalIdx].newSupplier, contactNumber: e.target.value }; setEstimates(newEst); }} style={{ padding: '0.4rem', fontSize: '0.85rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-primary)' }} />
                                                                        <input type="text" placeholder="Payment Method" value={est.newSupplier?.paymentMethod || ''} onChange={(e) => { const newEst = [...estimates]; newEst[globalIdx].newSupplier = { ...newEst[globalIdx].newSupplier, paymentMethod: e.target.value }; setEstimates(newEst); }} style={{ padding: '0.4rem', fontSize: '0.85rem', gridColumn: '1 / -1', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-primary)' }} />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                    
                                                    <button 
                                                        className="btn-secondary" 
                                                        onClick={() => setEstimates([...estimates, { productId: item.product_id, supplierId: '', estimatedPrice: '', remarks: '' }])} 
                                                        style={{ width: 'fit-content', fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                    >
                                                        + Add Estimate
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="modal-actions" style={{ marginTop: '2rem' }}>
                                    <button className="btn-success" onClick={handleSubmitEstimates}><Check size={18} /> Submit Estimates</button>
                                    <button className="btn-secondary" onClick={() => setShowEstimatesModal(false)}>Cancel</button>
                                </div>
                            </motion.div>
                        </motion.div>

                        <AnimatePresence>
                            {showComparisonDrawer && (
                                <>
                                    <motion.div 
                                        className="modal-overlay" 
                                        initial={{ opacity: 0 }} 
                                        animate={{ opacity: 0.3 }} 
                                        exit={{ opacity: 0 }} 
                                        onClick={() => setShowComparisonDrawer(false)}
                                        style={{ zIndex: 1999, background: '#000' }}
                                    />
                                    
                                    <motion.div
                                        initial={{ x: '100%' }}
                                        animate={{ x: 0 }}
                                        exit={{ x: '100%' }}
                                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                        style={{
                                            position: 'fixed',
                                            right: 0,
                                            top: 0,
                                            bottom: 0,
                                            width: '460px',
                                            background: 'var(--card-bg)',
                                            borderLeft: '1px solid var(--border-color)',
                                            boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
                                            zIndex: 2000,
                                            padding: '1.75rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            color: 'var(--text-primary)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Quotes Comparison</h3>
                                                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Requisition: {selectedRequisition.requisition_number}</p>
                                            </div>
                                            <button 
                                                className="action-btn delete" 
                                                onClick={() => setShowComparisonDrawer(false)}
                                                style={{ border: 'none', background: 'transparent' }}
                                            >
                                                <X size={20} />
                                            </button>
                                        </div>
                                        
                                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingRight: '0.25rem' }}>
                                            {getPrintableItems(selectedRequisition).map((item) => {
                                                const itemQuotes = estimates.filter(est => String(est.productId) === String(item.product_id) && (est.supplierId || est.newSupplier?.name));
                                                
                                                const sortedQuotes = itemQuotes
                                                    .map(q => {
                                                        const supplierObj = suppliers.find(s => String(s.id) === String(q.supplierId));
                                                        const name = supplierObj?.name || (q.supplierId === 'NEW' ? q.newSupplier?.name || 'New Supplier' : 'Unknown Vendor');
                                                        return {
                                                            ...q,
                                                            supplierName: name,
                                                            priceNum: Number(q.estimatedPrice) || 0
                                                        };
                                                    })
                                                    .filter(q => q.priceNum > 0)
                                                    .sort((a, b) => a.priceNum - b.priceNum);
                                                    
                                                const lastPrice = lastPurchasedPrices[String(item.product_id)];
                                                
                                                return (
                                                    <div key={item.product_id} style={{ background: 'var(--hover-bg)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                                        <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '0.92rem', fontWeight: 700 }}>
                                                            {item.product_name || 'Unknown Product'}
                                                        </h4>
                                                        
                                                        {lastPrice !== undefined && lastPrice !== null && (
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span>Last Purchased Price:</span>
                                                                <strong style={{ color: '#059669' }}>৳{lastPrice}</strong>
                                                            </div>
                                                        )}
                                                        
                                                        {sortedQuotes.length === 0 ? (
                                                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.5rem 0' }}>
                                                                No estimated prices entered yet.
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                                                {sortedQuotes.map((q, idx) => {
                                                                    const isBest = idx === 0;
                                                                    const pctDiff = lastPrice && q.priceNum ? (((q.priceNum - lastPrice) / lastPrice) * 100).toFixed(1) : null;
                                                                    
                                                                    return (
                                                                        <div 
                                                                            key={idx} 
                                                                            style={{ 
                                                                                display: 'flex', 
                                                                                justifyContent: 'space-between', 
                                                                                alignItems: 'center', 
                                                                                padding: '0.6rem 0.75rem', 
                                                                                borderRadius: '8px', 
                                                                                background: isBest ? 'rgba(34, 197, 94, 0.06)' : 'var(--card-bg)',
                                                                                border: isBest ? '1px solid rgba(34, 197, 94, 0.25)' : '1px solid var(--border-color)',
                                                                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                                                                            }}
                                                                        >
                                                                            <div>
                                                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                                                                                    <span>{q.supplierName}</span>
                                                                                    {isBest && (
                                                                                        <span style={{ 
                                                                                            fontSize: '0.68rem', 
                                                                                            background: '#22c55e', 
                                                                                            color: '#fff', 
                                                                                            padding: '1px 6px', 
                                                                                            borderRadius: '4px',
                                                                                            fontWeight: 700
                                                                                        }}>
                                                                                            Best Price
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                {q.remarks && (
                                                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', fontStyle: 'italic' }}>
                                                                                        "{q.remarks}"
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            <div style={{ textAlign: 'right' }}>
                                                                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: isBest ? '#16a34a' : 'var(--text-primary)' }}>
                                                                                    ৳{q.estimatedPrice}
                                                                                </div>
                                                                                {pctDiff && (
                                                                                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: Number(pctDiff) <= 0 ? '#16a34a' : '#ef4444', marginTop: '1px' }}>
                                                                                        {Number(pctDiff) <= 0 ? `${pctDiff}% cheaper` : `+${pctDiff}% vs last`}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        
                                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                            <button className="btn-secondary" onClick={() => setShowComparisonDrawer(false)}>Close Comparison</button>
                                        </div>
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </>
                )}

                {showDirectorModal && selectedRequisition && (
                    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowDirectorModal(false)}>
                        <motion.div className="modal-content" style={{ maxWidth: '600px' }} initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
                            <h2>Director Approval</h2>
                            <p>Requisition <strong>{selectedRequisition.requisition_number}</strong></p>
                            
                            <div style={{ marginTop: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
                                <h4>Submitted Quotes</h4>
                                {fetchedQuotes.length === 0 ? <p style={{ fontSize: '0.9rem', color: '#64748b' }}>No quotes submitted yet.</p> : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                        {fetchedQuotes.map((q, i) => {
                                            const item = getPrintableItems(selectedRequisition).find(it => String(it.product_id) === String(q.product_id));
                                            const unitPrice = Number(q.unit_price || q.estimated_price) || 0;
                                            const qty = item ? Number(item.quantity) || 1 : 1;
                                            const totalPrice = unitPrice * qty;
                                            return (
                                                <div key={i} style={{ padding: '0.6rem 0.8rem', background: 'var(--page-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                                                        <div>
                                                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{q.supplier?.name || 'Unknown Supplier'}</div>
                                                            {q.supplier?.store_name && <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Store: {q.supplier.store_name}</div>}
                                                            {q.supplier?.contact_person && <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Contact: {q.supplier.contact_person} {q.supplier.contact_number ? `(${q.supplier.contact_number})` : ''}</div>}
                                                            {(item || q.product) && <div style={{ fontSize: '0.78rem', color: 'var(--accent-color)', marginTop: '2px' }}>For: {item?.product_name || q.product?.name || 'Unknown product'}</div>}
                                                            {q.remarks && <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>{q.remarks}</div>}
                                                        </div>
                                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#059669' }}>৳{totalPrice.toLocaleString()}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>৳{unitPrice} × {qty} {item?.quantity_unit || 'pcs'}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
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
                            style={{
                                width: '100%',
                                maxWidth: '560px',
                                padding: '2rem',
                                borderRadius: '12px',
                                backgroundColor: '#ffffff',
                                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                            }}
                        >
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>Record Purchase</h2>
                            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                                Requisition <strong>#{selectedRequisition.requisition_number}</strong>
                            </p>
                            
                            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#1e293b' }}>Warehouse Location (e.g., A-1-5)</label>
                                <input
                                    type="text"
                                    placeholder="Row-Rack-Bin format"
                                    value={warehouseLocation}
                                    onChange={(e) => setWarehouseLocation(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.6rem 0.8rem',
                                        borderRadius: '6px',
                                        border: '1px solid #cbd5e1',
                                        backgroundColor: '#ffffff',
                                        color: '#0f172a',
                                        fontSize: '0.95rem'
                                    }}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#1e293b' }}>Invoice ID / Bill Number *</label>
                                <input
                                    type="text"
                                    placeholder="INV-XXXX"
                                    value={purchaseInvoiceId}
                                    onChange={(e) => setPurchaseInvoiceId(e.target.value)}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '0.6rem 0.8rem',
                                        borderRadius: '6px',
                                        border: '1px solid #cbd5e1',
                                        backgroundColor: '#ffffff',
                                        color: '#0f172a',
                                        fontSize: '0.95rem'
                                    }}
                                />
                            </div>

                            {/* Product-specific purchased quantities list */}
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.6rem', color: '#1e293b' }}>
                                    Products to Purchase *
                                </label>
                                <div style={{
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    backgroundColor: '#f8fafc',
                                    maxHeight: '220px',
                                    overflowY: 'auto',
                                    padding: '0.75rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.75rem'
                                }}>
                                    {getPrintableItems(selectedRequisition).map((item) => (
                                        <div key={item.id} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            backgroundColor: '#ffffff',
                                            padding: '0.75rem',
                                            borderRadius: '6px',
                                            border: '1px solid #edf2f7',
                                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                                            gap: '1rem'
                                        }}>
                                            <div style={{ flex: 1, minWidth: '0' }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {item.product_name || 'Unknown Product'}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.1rem' }}>
                                                    Requested: {item.quantity} {item.quantity_unit || 'piece'}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                                <input
                                                    type="number"
                                                    value={purchasedQuantities[item.id] !== undefined ? purchasedQuantities[item.id] : ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                                                        setPurchasedQuantities(prev => ({
                                                            ...prev,
                                                            [item.id]: val
                                                        }));
                                                    }}
                                                    placeholder="Qty"
                                                    required
                                                    style={{
                                                        width: '100px',
                                                        padding: '0.4rem 0.6rem',
                                                        borderRadius: '6px',
                                                        border: '1px solid #cbd5e1',
                                                        backgroundColor: '#ffffff',
                                                        color: '#0f172a',
                                                        fontSize: '0.9rem',
                                                        fontWeight: 600,
                                                        textAlign: 'right'
                                                    }}
                                                />
                                                <span style={{ fontSize: '0.8rem', color: '#64748b', width: '45px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {item.quantity_unit || 'piece'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#1e293b' }}>Remarks</label>
                                <input
                                    type="text"
                                    placeholder="Any purchase remarks..."
                                    value={purchaseRemarks}
                                    onChange={(e) => setPurchaseRemarks(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.6rem 0.8rem',
                                        borderRadius: '6px',
                                        border: '1px solid #cbd5e1',
                                        backgroundColor: '#ffffff',
                                        color: '#0f172a',
                                        fontSize: '0.95rem'
                                    }}
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
