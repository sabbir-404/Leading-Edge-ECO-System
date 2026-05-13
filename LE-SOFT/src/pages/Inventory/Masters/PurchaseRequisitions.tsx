import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Edit2, Trash2, Check, X, Package, ShoppingCart, AlertCircle, Clock, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';
import './PurchaseRequisitions.css';

interface Product {
    id: string;
    name: string;
    code?: string;
    sku?: string;
    unit?: string;
}

interface RequisitionLineItem {
    id: string;
    productId: string;
    productSearch: string;
    quantity: string;
    quantityUnit: string;
    remarks: string;
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
    status: 'DRAFT' | 'APPROVED' | 'PURCHASED' | 'RECEIVED' | 'COMPLETED';
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
    items?: Array<{
        id: string;
        requisition_id: string;
        product_id: string;
        product_name?: string;
        quantity: number;
        quantity_unit: string;
        remarks?: string;
    }>;
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
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [showEstimatesModal, setShowEstimatesModal] = useState(false);
    const [estimates, setEstimates] = useState<any[]>([{ supplierId: '', estimatedPrice: '', remarks: '' }]);
    const [fetchedQuotes, setFetchedQuotes] = useState<any[]>([]);
    const [directorHistory, setDirectorHistory] = useState<any[]>([]);
    const [showDirectorModal, setShowDirectorModal] = useState(false);
    const [showPurchaseModal, setShowPurchaseModal] = useState(false);
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

            setRequisitions(reqsData || []);
            setProducts(productsData || []);
            setSuppliers((ledgersData || []).filter((l: any) => l.group_name === 'Sundry Creditors'));
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

            const result = await (window as any).electron?.createPurchaseRequisition?.({
                items,
                priorityLevel: formData.priorityLevel,
                requiredDeliveryDate: formData.requiredDeliveryDate,
                remarks: formData.remarks,
                productId: items[0]?.productId,
                quantity: items[0]?.quantity,
                quantityUnit: items[0]?.quantityUnit,
            });

            if (result?.success) {
                setFormData({
                    priorityLevel: 'MEDIUM',
                    requiredDeliveryDate: '',
                    remarks: '',
                });
                setLineItems([createEmptyLineItem()]);
                setTab('list');
                fetchData();
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
                approvalNotes
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
            // Pre-process estimates to create new suppliers
            const processedEstimates = [];
            for (const est of estimates) {
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
                processedEstimates
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
                auditNotes
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
                directorNotes
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
            setHistoryRequisition(requisition);
            const entries = await (window as any).electron?.getPurchaseRequisitionHistory?.(requisition.id);
            setHistoryEntries(entries || []);
            setTab('history');
        } catch (error) {
            console.error('Error loading history:', error);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handlePurchase = async () => {
        if (!selectedRequisition) return;
        try {
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
                    supplierId: finalSupplierId ? Number(finalSupplierId) : null
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
            const result = await (window as any).electron?.receivePurchaseRequisition?.(id);
            if (result?.success) {
                fetchData();
            }
        } catch (error) {
            console.error('Error receiving requisition:', error);
        }
    };

    const handleComplete = async (id: string) => {
        try {
            const result = await (window as any).electron?.completePurchaseRequisition?.(id);
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
            const result = await (window as any).electron?.deletePurchaseRequisition?.(id);
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
            APPROVED: '#3b82f6',
            PURCHASED: '#f97316',
            RECEIVED: '#a855f7',
            COMPLETED: '#22c55e',
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
        if (req.status === 'APPROVED' && req.audit_status === 'PENDING') return 'Audit Review Pending';
        if (req.status === 'APPROVED' && req.audit_status === 'APPROVED' && req.director_status === 'PENDING') return 'Director Approval Pending';
        if (req.status === 'APPROVED' && req.audit_status === 'REJECTED') return 'Audit Rejected';
        if (req.status === 'APPROVED' && req.director_status === 'REJECTED') return 'Director Rejected';
        if (req.status === 'PURCHASED') return 'Purchase Processing';
        if (req.status === 'RECEIVED') return 'Goods Received';
        if (req.status === 'COMPLETED') return 'Completed';
        return req.status;
    };

    const filteredRequisitions = requisitions.map(req => ({
        ...req,
        product_name:
            req.items?.[0]?.product_name ||
            products.find(p => p.id === req.product_id)?.name ||
            'Unknown',
        item_count: req.items?.length || 1,
    }));

    const productLabels = useMemo(() => products.map((product) => {
        const productCode = product.code || product.sku || '';
        return {
            id: product.id,
            label: productCode ? `${product.name} (${productCode})` : product.name,
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
                    quantityUnit: matchedProduct ? (matchedProduct.label.includes('(') ? item.quantityUnit : item.quantityUnit) : item.quantityUnit,
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
                    <button
                        className={`tab ${tab === 'create' ? 'active' : ''}`}
                        onClick={() => setTab('create')}
                    >
                        <Plus size={18} /> New Requisition
                    </button>
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
                                <option value="APPROVED">Approved</option>
                                <option value="PURCHASED">Purchased</option>
                                <option value="RECEIVED">Received</option>
                                <option value="COMPLETED">Completed</option>
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
                                            <th>Product</th>
                                            <th>Qty</th>
                                            <th>Unit</th>
                                            <th>Priority</th>
                                            <th>Status</th>
                                            <th>Approval</th>
                                            <th>Stage</th>
                                            <th>Delivery Date</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRequisitions.map((req) => (
                                            <tr key={req.id}>
                                                <td className="font-mono">{req.requisition_number}</td>
                                                <td>{req.product_name}</td>
                                                <td className="text-right">{req.quantity}</td>
                                                <td>{req.quantity_unit}</td>
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
                                                        {req.status}
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
                                                        {req.approval_status}
                                                    </span>
                                                </td>
                                                <td>{getStageLabel(req)}</td>
                                                <td>{new Date(req.required_delivery_date).toLocaleDateString()}</td>
                                                <td className="actions">
                                                    {req.status === 'DRAFT' && (
                                                        <>
                                                            <button className="action-btn edit" title="Edit" onClick={() => setTab('create')}><Edit2 size={16} /></button>
                                                            <button className="action-btn delete" title="Delete" onClick={() => handleDelete(req.id)}><Trash2 size={16} /></button>
                                                            <button className="action-btn approve" title="Approve" onClick={() => { setSelectedRequisition(req); setShowApprovalModal(true); }}><Check size={16} /></button>
                                                        </>
                                                    )}
                                                    {req.status === 'PENDING_ESTIMATE' && (
                                                        <button className="action-btn" title="Add Estimates" onClick={() => { setSelectedRequisition(req); setShowEstimatesModal(true); }}><FileText size={16} /></button>
                                                    )}
                                                    {req.status === 'PENDING_AUDIT' && (
                                                        <button className="action-btn approve" title="Audit Review" onClick={() => openAuditModal(req)}><AlertCircle size={16} /></button>
                                                    )}
                                                    {req.status === 'PENDING_DIRECTOR' && (
                                                        <button className="action-btn approve" title="Director Review" onClick={() => openDirectorModal(req)}><Check size={16} /></button>
                                                    )}
                                                    {req.status === 'APPROVED' && (
                                                        <>
                                                            <button className="action-btn print" title="Print Document" onClick={() => alert('Printing Document...')}><FileText size={16} /></button>
                                                            <button className="action-btn purchase" title="Purchase" onClick={() => { setSelectedRequisition(req); setShowPurchaseModal(true); }}><ShoppingCart size={16} /></button>
                                                        </>
                                                    )}
                                                    {req.status === 'PURCHASED' && (
                                                        <button className="action-btn receive" title="Receive" onClick={() => handleReceive(req.id)}><Package size={16} /></button>
                                                    )}
                                                    {req.status === 'RECEIVED' && (
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
                                        {filteredRequisitions.filter(req => req.status === 'APPROVED' && req.audit_status === 'PENDING').map(req => (
                                            <tr key={req.id}>
                                                <td>{req.requisition_number}</td>
                                                <td>{req.product_name}</td>
                                                <td>{getStageLabel(req)}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button className="action-btn approve" onClick={() => { setSelectedRequisition(req); setShowAuditModal(true); }}><AlertCircle size={16} /></button>
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
                                        {filteredRequisitions.filter(req => req.status === 'APPROVED' && req.audit_status === 'APPROVED' && req.director_status === 'PENDING').map(req => (
                                            <tr key={req.id}>
                                                <td>{req.requisition_number}</td>
                                                <td>{req.product_name}</td>
                                                <td>{getStageLabel(req)}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button className="action-btn approve" onClick={() => { setSelectedRequisition(req); setShowDirectorModal(true); }}><Check size={16} /></button>
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
                                        <strong>{historyRequisition.requisition_number}</strong> - {historyRequisition.product_name}
                                        {historyRequisition.item_count && historyRequisition.item_count > 1 ? (
                                            <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                ({historyRequisition.item_count} items)
                                            </span>
                                        ) : null}
                                    </div>
                                    {historyRequisition.items && historyRequisition.items.length > 0 && (
                                        <div className="line-items-summary">
                                            {historyRequisition.items.map((item) => (
                                                <div key={item.id} className="line-item-summary-row">
                                                    <strong>{item.product_name || 'Unknown Product'}</strong>
                                                    <span>{item.quantity} {item.quantity_unit}</span>
                                                    <span>{item.remarks || 'No remarks'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {historyEntries.length === 0 ? (
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
                                                    {historyEntries.map((entry) => (
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
                                    <h2>Create Requisition</h2>
                                    <p>Add one or more products and submit the request for approval.</p>
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
                                            <th style={{ width: '34%' }}>Product</th>
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
                                    Reset
                                </button>
                                <button type="submit" className="btn-primary">
                                    Create Requisition
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
                                            <li key={i}>{new Date(h.purchase_bill.bill_date).toLocaleDateString()} - <strong>৳{h.price}</strong> from {h.purchase_bill.supplier?.name}</li>
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
