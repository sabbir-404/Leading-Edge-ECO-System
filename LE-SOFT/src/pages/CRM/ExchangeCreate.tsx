import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ScanBarcode, ArrowRight, ArrowLeft, Trash2, ArrowLeftRight, Search, FileText, X, CheckCircle, AlertCircle, Plus, Minus } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

const safeDecrypt = (val: any): string => {
    if (!val || typeof val !== 'string') return String(val || '');
    if (val.startsWith('e1:') || val.startsWith('e2:')) return '[encrypted]';
    return val;
};

interface Product {
    id: number;
    name: string;
    sku: string;
    selling_price: number;
    category: string;
}

interface ExchangeItem {
    product_id: number;
    product_name: string;
    sku: string;
    quantity: number;
    rate: number;
    amount: number;
}

interface BillItem {
    id: number;
    product_id: number;
    product_name: string;
    sku: string;
    quantity: number;
    mrp: number;
    price: number;
}

interface Bill {
    id: number;
    invoice_number: string;
    grand_total: number;
    created_at: string;
    customer_name?: string;
    customer_phone?: string;
    customer_id?: number;
    items?: BillItem[];
}

const ExchangeCreate: React.FC = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [productsLoaded, setProductsLoaded] = useState(false);

    // ── Bill search ─────────────────────────────────────────────────────────
    const [showBillSearch, setShowBillSearch] = useState(true); // open by default
    const [billSearchQuery, setBillSearchQuery] = useState('');
    const [billSearchResults, setBillSearchResults] = useState<Bill[]>([]);
    const [billSearchLoading, setBillSearchLoading] = useState(false);
    const [linkedBill, setLinkedBill] = useState<Bill | null>(null);
    const [linkedBillItems, setLinkedBillItems] = useState<BillItem[]>([]);

    // ── Selected returned items (chosen from bill) ──────────────────────────
    const [returnedItems, setReturnedItems] = useState<ExchangeItem[]>([]);

    // ── New replacement items ────────────────────────────────────────────────
    const [newItems, setNewItems] = useState<ExchangeItem[]>([]);
    const [searchNew, setSearchNew] = useState('');
    const [showNewDropdown, setShowNewDropdown] = useState(false);

    const [saving, setSaving] = useState(false);
    const [maxExchanges, setMaxExchanges] = useState(1);

    // Load products lazily when the dropdown is first opened
    const ensureProductsLoaded = async () => {
        if (productsLoaded) return;
        try {
            // @ts-ignore
            const [pData, sData] = await Promise.all([
                window.electron?.getProducts?.(),
                window.electron?.getSettings?.()
            ]);
            setProducts(pData || []);
            if (sData?.max_exchanges_per_bill) setMaxExchanges(sData.max_exchanges_per_bill);
            setProductsLoaded(true);
        } catch (e) { console.error(e); }
    };

    // ── Bill search ──────────────────────────────────────────────────────────
    const searchBills = useCallback(async (query: string) => {
        setBillSearchLoading(true);
        try {
            // @ts-ignore
            const allBills: Bill[] = await window.electron?.getBills?.() || [];
            const q = query.toLowerCase().trim();
            const filtered = q === '' ? allBills.slice(0, 40) : allBills.filter(b =>
                safeDecrypt(b.invoice_number).toLowerCase().includes(q) ||
                safeDecrypt(b.customer_name || '').toLowerCase().includes(q) ||
                safeDecrypt(b.customer_phone || '').includes(q)
            ).slice(0, 40);
            setBillSearchResults(filtered);
        } catch (e) { console.error(e); }
        setBillSearchLoading(false);
    }, []);

    const openBillSearch = () => {
        setShowBillSearch(true);
        searchBills('');
    };

    const selectBill = async (bill: Bill) => {
        try {
            // @ts-ignore
            const count = await window.electron?.getBillExchangeCount?.(bill.id) || 0;
            if (count >= maxExchanges) {
                alert(`Policy Restriction: This bill has already been exchanged ${count} time(s). The current limit is ${maxExchanges}.`);
                return;
            }
            // @ts-ignore
            const detail = await window.electron?.getBillDetails?.(bill.id);
            const items: BillItem[] = (detail?.items || []).map((it: any) => ({
                ...it,
                product_name: safeDecrypt(it.product_name),
                sku: safeDecrypt(it.sku),
            }));
            setLinkedBill({
                ...bill,
                invoice_number: safeDecrypt(bill.invoice_number),
                customer_name: safeDecrypt(bill.customer_name || ''),
                customer_phone: safeDecrypt(bill.customer_phone || ''),
                items,
            });
            setLinkedBillItems(items);
            setReturnedItems([]); // reset selections when bill changes
            setShowBillSearch(false);
            setBillSearchQuery('');
        } catch (e) { console.error(e); }
    };

    const unlinkBill = () => {
        setLinkedBill(null);
        setLinkedBillItems([]);
        setReturnedItems([]);
        setNewItems([]);
        setShowBillSearch(true);
        searchBills('');
    };

    // ── Returned item toggling (from bill) ────────────────────────────────────
    const toggleReturnItem = (item: BillItem) => {
        const alreadyIn = returnedItems.find(r => r.product_id === item.product_id);
        if (alreadyIn) {
            setReturnedItems(prev => prev.filter(r => r.product_id !== item.product_id));
        } else {
            setReturnedItems(prev => [...prev, {
                product_id: item.product_id || 0,
                product_name: item.product_name,
                sku: item.sku,
                quantity: item.quantity,
                rate: item.mrp,
                amount: item.price,
            }]);
        }
    };

    const updateReturnQty = (productId: number, qty: number) => {
        setReturnedItems(prev => prev.map(r => r.product_id === productId
            ? { ...r, quantity: Math.max(1, qty), amount: Math.max(1, qty) * r.rate }
            : r
        ));
    };

    // ── New replacement items ─────────────────────────────────────────────────
    const addNewItem = (product: Product) => {
        const ex = newItems.find(i => i.product_id === product.id);
        if (ex) {
            setNewItems(prev => prev.map(i => i.product_id === product.id
                ? { ...i, quantity: i.quantity + 1, amount: (i.quantity + 1) * i.rate }
                : i));
        } else {
            setNewItems(prev => [...prev, {
                product_id: product.id,
                product_name: product.name,
                sku: product.sku || '',
                quantity: 1,
                rate: product.selling_price,
                amount: product.selling_price,
            }]);
        }
        setSearchNew('');
        setShowNewDropdown(false);
    };

    const updateNewItem = (idx: number, field: 'quantity' | 'rate', value: number) => {
        setNewItems(prev => prev.map((item, i) => {
            if (i !== idx) return item;
            const updated = { ...item, [field]: value };
            updated.amount = updated.quantity * updated.rate;
            return updated;
        }));
    };

    const removeNewItem = (idx: number) => setNewItems(prev => prev.filter((_, i) => i !== idx));

    const getFilteredProducts = (term: string) => products.filter(p =>
        p.name.toLowerCase().includes(term.toLowerCase()) || (p.sku || '').toLowerCase().includes(term.toLowerCase())
    ).slice(0, 15);

    // ── Totals ─────────────────────────────────────────────────────────────────
    const totalReturnValue = returnedItems.reduce((s, i) => s + i.amount, 0);
    const totalNewValue = newItems.reduce((s, i) => s + i.amount, 0);
    const differenceAmount = totalNewValue - totalReturnValue;

    // ── Save ───────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!linkedBill) return alert('Please select an original bill first.');
        if (returnedItems.length === 0) return alert('Please select at least one item to return.');
        if (newItems.length === 0) return alert('Please add at least one replacement product.');
        setSaving(true);
        try {
            // @ts-ignore
            const res = await window.electron?.createExchangeOrder?.({
                customer_id: linkedBill.customer_id || null,
                original_bill_id: linkedBill.id,
                returned_items: returnedItems,
                new_items: newItems,
                total_return_value: totalReturnValue,
                total_new_value: totalNewValue,
                difference_amount: differenceAmount,
            });
            if (res?.success) {
                alert(`Exchange Saved! Number: ${res.exchange_number}`);
                navigate('/crm/exchanges');
            }
        } catch (e: any) { console.error(e); alert('Error: ' + e.message); }
        setSaving(false);
    };

    const inp: React.CSSProperties = {
        width: '100%', padding: '0.6rem 0.75rem',
        border: '1px solid var(--border-color)', borderRadius: '6px',
        fontSize: '0.9rem', background: 'var(--input-bg)', color: 'var(--text-primary)',
        boxSizing: 'border-box',
    };

    return (
        <DashboardLayout title="Create Exchange Order">
            <div className="masters-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', gap: '0.75rem' }}>

                {/* ── STEP 1: Bill Header ── */}
                <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1rem 1.5rem', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                            <ArrowLeftRight size={20} style={{ color: 'var(--accent-color)' }} />
                            <div>
                                <h1 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Process Exchange / Return</h1>
                                <p style={{ opacity: 0.55, fontSize: '0.8rem', margin: 0 }}>Select the original purchase bill to begin the exchange</p>
                            </div>
                        </div>

                        {/* Bill Picker */}
                        {linkedBill ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '10px', padding: '0.6rem 1rem' }}>
                                <CheckCircle size={18} color="#10b981" />
                                <div>
                                    <div style={{ fontSize: '0.78rem', color: '#064e3b', fontWeight: 600 }}>Original Bill</div>
                                    <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.95rem', color: '#065f46' }}>{linkedBill.invoice_number}</div>
                                    {linkedBill.customer_name && (
                                        <div style={{ fontSize: '0.75rem', color: '#047857' }}>{linkedBill.customer_name} {linkedBill.customer_phone && `• ${linkedBill.customer_phone}`}</div>
                                    )}
                                </div>
                                <button onClick={unlinkBill} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', marginLeft: '0.5rem' }}>
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <button onClick={openBillSearch} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.25rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
                                <FileText size={16} /> Select Bill to Exchange
                            </button>
                        )}
                    </div>
                </div>

                {/* ── STEP 2: Items ── */}
                {linkedBill ? (
                    <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>

                        {/* LEFT: Products from the bill (customer selects what to return) */}
                        <div style={{ flex: 1, background: 'var(--card-bg)', border: '2px solid #ef4444', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div style={{ background: '#fef2f2', padding: '0.75rem 1rem', borderBottom: '1px solid #fee2e2', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                <ArrowLeft size={18} color="#ef4444" />
                                <div>
                                    <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#b91c1c', margin: 0 }}>Items to Return</h2>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#dc2626' }}>Select which products the customer is returning</p>
                                </div>
                                {returnedItems.length > 0 && (
                                    <span style={{ marginLeft: 'auto', background: '#fee2e2', color: '#b91c1c', borderRadius: '20px', padding: '2px 10px', fontSize: '0.78rem', fontWeight: 700 }}>
                                        {returnedItems.length} selected
                                    </span>
                                )}
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {linkedBillItems.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.4, color: '#ef4444' }}>
                                        <AlertCircle size={28} style={{ margin: '0 auto 0.5rem' }} />
                                        No items found on this bill.
                                    </div>
                                ) : linkedBillItems.map(item => {
                                    const selected = returnedItems.find(r => r.product_id === item.product_id);
                                    const returnedItem = selected;
                                    return (
                                        <div
                                            key={item.id}
                                            style={{
                                                background: selected ? '#fef2f2' : 'var(--hover-bg)',
                                                border: `2px solid ${selected ? '#fca5a5' : 'var(--border-color)'}`,
                                                borderRadius: '10px',
                                                padding: '0.65rem 0.85rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s',
                                            }}
                                            onClick={() => toggleReturnItem(item)}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                {/* Checkbox */}
                                                <div style={{
                                                    width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                                                    background: selected ? '#ef4444' : 'var(--card-bg)',
                                                    border: `2px solid ${selected ? '#ef4444' : 'var(--border-color)'}`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    transition: 'all 0.15s',
                                                }}>
                                                    {selected && <div style={{ width: 8, height: 8, background: 'white', borderRadius: '50%' }} />}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: selected ? '#991b1b' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {item.product_name}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: selected ? '#b91c1c' : 'var(--text-secondary)' }}>
                                                        SKU: {item.sku || 'N/A'} &nbsp;•&nbsp; Qty: {item.quantity} &nbsp;•&nbsp; ৳{item.price?.toLocaleString()}
                                                    </div>
                                                </div>
                                                {/* Qty adjuster (shown when selected) */}
                                                {selected && returnedItem && (
                                                    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                        <button onClick={() => updateReturnQty(item.product_id, returnedItem.quantity - 1)}
                                                            style={{ width: '22px', height: '22px', border: '1px solid #fca5a5', borderRadius: '4px', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                                                            <Minus size={10} />
                                                        </button>
                                                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#b91c1c', minWidth: '20px', textAlign: 'center' }}>{returnedItem.quantity}</span>
                                                        <button onClick={() => updateReturnQty(item.product_id, returnedItem.quantity + 1)}
                                                            style={{ width: '22px', height: '22px', border: '1px solid #fca5a5', borderRadius: '4px', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                                                            <Plus size={10} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* RIGHT: New replacement products */}
                        <div style={{ flex: 1, background: 'var(--card-bg)', border: '2px solid #10b981', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div style={{ background: '#ecfdf5', padding: '0.75rem 1rem', borderBottom: '1px solid #d1fae5', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                <ArrowRight size={18} color="#10b981" />
                                <div>
                                    <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#047857', margin: 0 }}>Replacement Products</h2>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#059669' }}>Add the new products the customer is taking</p>
                                </div>
                                {newItems.length > 0 && (
                                    <span style={{ marginLeft: 'auto', background: '#d1fae5', color: '#065f46', borderRadius: '20px', padding: '2px 10px', fontSize: '0.78rem', fontWeight: 700 }}>
                                        {newItems.length} items
                                    </span>
                                )}
                            </div>

                            {/* Product search */}
                            <div style={{ padding: '0.75rem', borderBottom: '1px solid #d1fae5', flexShrink: 0, position: 'relative' }}>
                                <div style={{ position: 'relative' }}>
                                    <ScanBarcode size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                                    <input
                                        placeholder="Search replacement product..."
                                        value={searchNew}
                                        onChange={e => { setSearchNew(e.target.value); setShowNewDropdown(true); }}
                                        onFocus={async () => { await ensureProductsLoaded(); setShowNewDropdown(true); }}
                                        onBlur={() => setTimeout(() => setShowNewDropdown(false), 200)}
                                        style={{ ...inp, paddingLeft: '2.2rem' }}
                                    />
                                    {showNewDropdown && searchNew && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: '220px', overflowY: 'auto' }}>
                                            {getFilteredProducts(searchNew).length === 0
                                                ? <div style={{ padding: '1rem', textAlign: 'center', opacity: 0.5, fontSize: '0.85rem' }}>No products found</div>
                                                : getFilteredProducts(searchNew).map(p => (
                                                    <div key={p.id} onMouseDown={() => addNewItem(p)}
                                                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                        onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                                                        <div>
                                                            <div style={{ fontWeight: 600, fontSize: '0.87rem' }}>{p.name}</div>
                                                            <div style={{ fontSize: '0.72rem', color: '#888' }}>{p.sku}</div>
                                                        </div>
                                                        <span style={{ fontWeight: 700, color: '#10b981', fontSize: '0.9rem' }}>৳{p.selling_price.toLocaleString()}</span>
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* New items list */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {newItems.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: '#34d399', opacity: 0.5, marginTop: '2rem', fontSize: '0.85rem' }}>
                                        <ArrowRight size={28} style={{ margin: '0 auto 0.5rem', display: 'block' }} />
                                        Search and add replacement products above
                                    </div>
                                ) : newItems.map((item, idx) => (
                                    <div key={idx} style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', padding: '0.6rem 0.85rem', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.87rem', color: '#065f46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name}</div>
                                            <div style={{ fontSize: '0.72rem', color: '#047857' }}>SKU: {item.sku || 'N/A'}</div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                            <button onClick={() => updateNewItem(idx, 'quantity', item.quantity - 1)}
                                                style={{ width: '22px', height: '22px', border: '1px solid #6ee7b7', borderRadius: '4px', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                                                <Minus size={10} />
                                            </button>
                                            <span style={{ fontWeight: 700, color: '#047857', minWidth: '22px', textAlign: 'center', fontSize: '0.85rem' }}>{item.quantity}</span>
                                            <button onClick={() => updateNewItem(idx, 'quantity', item.quantity + 1)}
                                                style={{ width: '22px', height: '22px', border: '1px solid #6ee7b7', borderRadius: '4px', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                                                <Plus size={10} />
                                            </button>
                                        </div>
                                        <div style={{ fontWeight: 700, color: '#10b981', width: '80px', textAlign: 'right', flexShrink: 0 }}>৳{item.amount.toLocaleString()}</div>
                                        <button onClick={() => removeNewItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', flexShrink: 0 }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* No bill selected yet — placeholder */
                    <div style={{ flex: 1, background: 'var(--card-bg)', borderRadius: '12px', border: '2px dashed var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', opacity: 0.5 }}>
                        <FileText size={48} />
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>No Bill Selected</div>
                            <div style={{ fontSize: '0.87rem' }}>Select an original bill above to view the products available for exchange</div>
                        </div>
                    </div>
                )}

                {/* ── Footer Totals ── */}
                {linkedBill && (
                    <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '0.9rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Return Value</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ef4444' }}>৳{totalReturnValue.toLocaleString()}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>New Value</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#10b981' }}>৳{totalNewValue.toLocaleString()}</div>
                            </div>
                            <div style={{ paddingLeft: '1.5rem', borderLeft: '2px solid var(--border-color)' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Net Difference</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: differenceAmount > 0 ? '#f59e0b' : differenceAmount < 0 ? '#ef4444' : '#64748b' }}>
                                    {differenceAmount > 0 ? `Customer Pays ৳${differenceAmount.toLocaleString()}` : differenceAmount < 0 ? `Refund ৳${Math.abs(differenceAmount).toLocaleString()}` : 'Even  ৳0'}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={saving || returnedItems.length === 0 || newItems.length === 0}
                            style={{
                                padding: '0.8rem 2rem', background: 'var(--accent-color)', color: 'white',
                                border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '1rem',
                                cursor: (saving || returnedItems.length === 0 || newItems.length === 0) ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                opacity: (returnedItems.length === 0 || newItems.length === 0) ? 0.5 : 1
                            }}
                        >
                            <Save size={18} /> {saving ? 'Saving...' : 'Complete Exchange'}
                        </button>
                    </div>
                )}
            </div>

            {/* ── Bill Search Modal ── */}
            {showBillSearch && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => linkedBill && setShowBillSearch(false)}>
                    <div style={{ background: 'var(--card-bg)', borderRadius: '16px', width: '680px', maxHeight: '82vh', overflow: 'hidden', boxShadow: '0 24px 72px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ fontWeight: 700, margin: 0 }}>Select Original Bill</h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.6 }}>Search by invoice number, customer name, or phone</p>
                            </div>
                            {linkedBill && <button onClick={() => setShowBillSearch(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={20} /></button>}
                        </div>
                        <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                                <input
                                    autoFocus
                                    value={billSearchQuery}
                                    onChange={e => { setBillSearchQuery(e.target.value); searchBills(e.target.value); }}
                                    placeholder="Search bills..."
                                    style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                                />
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {billSearchLoading ? (
                                <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>Searching...</div>
                            ) : billSearchResults.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>No bills found</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                                    <thead style={{ background: 'var(--hover-bg)', position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr>
                                            <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700 }}>Invoice</th>
                                            <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700 }}>Customer</th>
                                            <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700 }}>Date</th>
                                            <th style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 700 }}>Total</th>
                                            <th style={{ padding: '0.6rem 1rem', width: '70px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {billSearchResults.map((bill) => (
                                            <tr key={bill.id}
                                                style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer', transition: 'background 0.12s' }}
                                                onClick={() => selectBill(bill)}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', color: 'var(--accent-color)', fontWeight: 600 }}>{safeDecrypt(bill.invoice_number)}</td>
                                                <td style={{ padding: '0.65rem 1rem' }}>
                                                    <div style={{ fontWeight: 600 }}>{safeDecrypt(bill.customer_name || '') || 'Walk-in'}</div>
                                                    {bill.customer_phone && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{safeDecrypt(bill.customer_phone)}</div>}
                                                </td>
                                                <td style={{ padding: '0.65rem 1rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{new Date(bill.created_at).toLocaleDateString('en-GB')}</td>
                                                <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 700 }}>৳{bill.grand_total?.toLocaleString()}</td>
                                                <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                                                    <button style={{ padding: '3px 10px', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Select</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
};

export default ExchangeCreate;
