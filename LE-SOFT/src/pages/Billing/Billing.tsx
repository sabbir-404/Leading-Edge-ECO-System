import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Search, Printer, Trash2, Plus, Minus, ScanBarcode, Save, UserSearch,
    Truck, Tag, ChevronDown, ChevronUp, Package, Receipt, Wrench, Sliders
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import { canAdjustBillPrice } from '../../utils/permissions';

interface Product {
    id: number;
    name: string;
    sku: string;
    selling_price: number;
    category: string;
    image_path?: string;
    quantity?: number;
}

interface CartItem {
    product_id: number;
    product_name: string;
    sku: string;
    quantity: number;
    mrp: number;           // unit price
    discount_pct: number;
    discount_amt: number;  // total discount for row
    price: number;         // line total after discount
    image_path?: string;
}

interface Customer {
    id?: number;
    name: string;
    phone: string;
    email: string;
    address: string;
    total_bills?: number;
}

// ─── Taka-to-words ──────────────────────────────────────────────────────────
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens_ = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function numberToWords(num: number): string {
    if (num === 0) return 'Zero';
    const n = Math.floor(num);
    if (n < 0) return 'Minus ' + numberToWords(-n);
    let str = '';
    if (Math.floor(n / 10000000) > 0) str += numberToWords(Math.floor(n / 10000000)) + ' Crore ';
    const r1 = n % 10000000;
    if (Math.floor(r1 / 100000) > 0) str += numberToWords(Math.floor(r1 / 100000)) + ' Lakh ';
    const r2 = r1 % 100000;
    if (Math.floor(r2 / 1000) > 0) str += numberToWords(Math.floor(r2 / 1000)) + ' Thousand ';
    const r3 = r2 % 1000;
    if (Math.floor(r3 / 100) > 0) str += ones[Math.floor(r3 / 100)] + ' Hundred ';
    const r4 = r3 % 100;
    if (r4 > 0) {
        if (str !== '') str += 'and ';
        if (r4 < 20) str += ones[r4];
        else str += tens_[Math.floor(r4 / 10)] + (r4 % 10 !== 0 ? ' ' + ones[r4 % 10] : '');
    }
    return str.trim();
}
function amountInWords(n: number) { return n === 0 ? 'Zero Tk Only' : numberToWords(n) + ' Tk Only'; }

// ─── Shared styles ───────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
    width: '100%', padding: '0.5rem 0.7rem', background: 'var(--input-bg)',
    border: '1px solid var(--border-color)', borderRadius: '8px',
    color: 'var(--text-primary)', fontSize: '0.875rem', boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
    display: 'block', fontSize: '0.7rem', fontWeight: 700, marginBottom: '0.25rem',
    color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px',
};
const card: React.CSSProperties = {
    background: 'var(--card-bg)', borderRadius: '12px',
    border: '1px solid var(--border-color)', padding: '0.9rem 1.1rem',
};

// ─── Component ───────────────────────────────────────────────────────────────
const Billing: React.FC = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showProductDropdown, setShowProductDropdown] = useState(false);
    const barcodeInputRef = useRef<HTMLInputElement>(null);

    // Customer
    const [customer, setCustomer] = useState<Customer>({ name: '', phone: '', email: '', address: '' });
    const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
    const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
    const [savedCustomerId, setSavedCustomerId] = useState<number | null>(null);

    // Bill
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const billedBy = localStorage.getItem('user_name') || 'Admin';
    const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [searching, setSearching] = useState(false);
    const [detailedResults, setDetailedResults] = useState<Product[]>([]);
    const [priceAdjustment, setPriceAdjustment] = useState(0);
    const [maxAdj, setMaxAdj] = useState(0);
    const [globalDiscountPct, setGlobalDiscountPct] = useState<number | ''>('');
    const canAdjust = canAdjustBillPrice();

    // Shipping
    const [shippingEnabled, setShippingEnabled] = useState(false);
    const [shipTo, setShipTo] = useState({ name: '', address: '', phone: '' });
    const [shipFrom, setShipFrom] = useState({ name: 'Leading Edge', address: 'Dhaka, Bangladesh' });
    const [shippingCharge, setShippingCharge] = useState(0);
    const [showShipping, setShowShipping] = useState(false);

    // Extras
    const [installationCharge, setInstallationCharge] = useState(0);
    const [installationNote, setInstallationNote] = useState('');
    const [showExtras, setShowExtras] = useState(false);

    // Payment
    const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<number | null>(null);
    const [paymentRef, setPaymentRef] = useState('');

    // Load data
    useEffect(() => {
        const load = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const el = window.electron as any;
                const [prods, methods, policy] = await Promise.all([
                    el.getProducts(),
                    el.getPaymentMethods(),
                    el.getPolicy?.() || { maxPriceAdjustment: 0 }
                ]);
                setProducts(prods || []);
                setPaymentMethods(methods || []);
                setMaxAdj(Number(policy?.maxPriceAdjustment ?? 0));
                const cash = (methods || []).find((m: any) => m.provider === 'Cash');
                if (cash) setSelectedPaymentMethod(cash.id);
            } catch (e) { console.error(e); }
        };
        load();
        const now = new Date();
        setInvoiceNumber(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-XXXX-XXX`);
    }, []);

    // F2 barcode hotkey
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); barcodeInputRef.current?.focus(); } };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, []);

    // Real-time product search (Debounced)
    useEffect(() => {
        if (searchTerm.length < 1) {
            setDetailedResults([]);
            setSearching(false);
            return;
        }

        // Barcode check (if it looks like a barcode/exact SKU, we might not want to search yet)
        // but for now, we search everything.
        
        const timeout = setTimeout(async () => {
            setSearching(true);
            try {
                // @ts-ignore
                const results = await window.electron.searchProductsDetailed(searchTerm);
                setDetailedResults(results || []);
            } catch (e) {
                console.error('Search error:', e);
            } finally {
                setSearching(false);
            }
        }, 300);

        return () => clearTimeout(timeout);
    }, [searchTerm]);

    // Customer search
    const searchCustomers = useCallback(async (q: string) => {
        if (q.length < 2) { setCustomerSuggestions([]); setShowCustomerSuggestions(false); return; }
        try {
            // @ts-ignore
            const r = await window.electron.searchBillingCustomers(q);
            setCustomerSuggestions(r || []);
            setShowCustomerSuggestions(r && r.length > 0);
        } catch (e) { console.error(e); }
    }, []);

    const selectCustomer = (c: Customer) => {
        setCustomer({ name: c.name || '', phone: c.phone || '', email: c.email || '', address: c.address || '' });
        setSavedCustomerId(c.id || null);
        setShowCustomerSuggestions(false);
    };

    // ── Cart ops ─────────────────────────────────────────────────────────────
    const addToCart = (product: Product) => {
        setCart(prev => {
            const ex = prev.find(i => i.product_id === product.id);
            if (ex) return prev.map(i => i.product_id === product.id
                ? { ...i, quantity: i.quantity + 1, price: (i.quantity + 1) * i.mrp * (1 - i.discount_pct / 100) }
                : i
            );
            return [...prev, {
                product_id: product.id, product_name: product.name, sku: product.sku || '',
                quantity: 1, mrp: product.selling_price, discount_pct: 0, discount_amt: 0,
                price: product.selling_price, image_path: product.image_path || '',
            }];
        });
        setSearchTerm('');
        setShowProductDropdown(false);
    };

    const removeFromCart = (id: number) => setCart(prev => prev.filter(i => i.product_id !== id));

    // ── Bidirectional discount ────────────────────────────────────────────────
    // Changing quantity → recalc based on existing %
    // Changing discount_pct → recalc discounted price
    // Changing discounted_price (final price) → back-calc % (price can only go DOWN, not above MRP×qty)
    const updateCartItem = (productId: number, field: 'quantity' | 'discount_pct' | 'discounted_price', rawValue: number) => {
        setCart(prev => prev.map(item => {
            if (item.product_id !== productId) return item;
            let { quantity, mrp, discount_pct, discount_amt, price } = item;

            if (field === 'quantity') {
                quantity = Math.max(1, rawValue);
                discount_amt = mrp * quantity * (discount_pct / 100);
                price = mrp * quantity - discount_amt;
            } else if (field === 'discount_pct') {
                discount_pct = Math.min(100, Math.max(0, rawValue));
                discount_amt = mrp * quantity * (discount_pct / 100);
                price = mrp * quantity - discount_amt;
            } else if (field === 'discounted_price') {
                // Clamp: cannot exceed MRP × qty (no price increase allowed)
                const maxPrice = mrp * quantity;
                const lineTotal = Math.min(maxPrice, Math.max(0, rawValue));
                price = lineTotal;
                discount_amt = maxPrice - lineTotal;
                const totalMrp = mrp * quantity;
                discount_pct = totalMrp > 0 ? +((discount_amt / totalMrp) * 100).toFixed(2) : 0;
            }
            return { ...item, quantity, discount_pct, discount_amt, price };
        }));
    };

    // Filtered products for dropdown (Local fallback + Detailed)
    // We prioritize detailedResults from backend
    const displayProducts = detailedResults.length > 0 ? detailedResults : products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // ── Totals ────────────────────────────────────────────────────────────────
    const subtotal = cart.reduce((s, i) => s + i.mrp * i.quantity, 0);
    const discountTotal = cart.reduce((s, i) => s + Math.max(0, i.discount_amt), 0);
    const itemsTotal = subtotal - discountTotal;
    // Clamp adjustment to ±maxAdj
    const adjClamped = maxAdj > 0 ? Math.max(-maxAdj, Math.min(maxAdj, priceAdjustment)) : 0;
    const grandTotal = itemsTotal + installationCharge + (shippingEnabled ? shippingCharge : 0) + adjClamped;

    /** Calculated discount % across all items (for display only) */
    const calcGlobalDiscPct = subtotal > 0 ? +((discountTotal / subtotal) * 100).toFixed(2) : 0;

    /** Apply a uniform discount % to all items */
    const applyGlobalDiscount = (pct: number) => {
        const p = Math.min(100, Math.max(0, pct));
        setCart(prev => prev.map(item => {
            const disc_amt = item.mrp * item.quantity * (p / 100);
            return { ...item, discount_pct: p, discount_amt: disc_amt, price: item.mrp * item.quantity - disc_amt };
        }));
    };

    // ── Save Bill ─────────────────────────────────────────────────────────────
    const handleSaveBill = async () => {
        if (cart.length === 0) return alert('Add products to the bill first.');
        if (!customer.name) return alert('Enter customer name.');
        setSaving(true);
        try {
            // @ts-ignore
            const savedCustomer = await window.electron.createBillingCustomer(customer);
            const custId = savedCustomer.id;
            setSavedCustomerId(custId);
            // @ts-ignore
            const result = await window.electron.createBill({
                customer_id: custId, billed_by: billedBy, items: cart,
                subtotal, discount_total: discountTotal,
                price_adjustment: canAdjust ? adjClamped : 0,
                installation_charge: installationCharge, installation_note: installationNote,
                grand_total: grandTotal, payment_method_id: selectedPaymentMethod, payment_ref: paymentRef,
            });
            if (result.success) {
                setInvoiceNumber(result.invoice_number);
                if (shippingEnabled && shipTo.name && shipTo.address) {
                    // @ts-ignore
                    await window.electron.addBillShipping({
                        bill_id: result.id, ship_to_name: shipTo.name, ship_to_address: shipTo.address,
                        ship_to_phone: shipTo.phone, ship_from_name: shipFrom.name,
                        ship_from_address: shipFrom.address, shipping_charge: shippingCharge,
                        updated_by: billedBy, user_role: localStorage.getItem('user_role') || 'cashier',
                    });
                }
                alert(`Bill saved! Invoice: ${result.invoice_number}`);
            }
        } catch (e) { console.error(e); alert('Failed to save bill.'); }
        finally { setSaving(false); }
    };

    const handleNewBill = () => {
        setCart([]); setCustomer({ name: '', phone: '', email: '', address: '' }); setSavedCustomerId(null);
        const now = new Date();
        setInvoiceNumber(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-XXXX-XXX`);
        setInstallationCharge(0); setInstallationNote(''); setPaymentRef('');
        setShippingEnabled(false); setShipTo({ name: '', address: '', phone: '' }); setShippingCharge(0);
        setPriceAdjustment(0); setGlobalDiscountPct('');
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <DashboardLayout title="Billing / POS">
            <div id="billing-page" style={{ display: 'flex', height: 'calc(100vh - 80px)', gap: '0.75rem', padding: '0 0.25rem' }}>

                {/* ══ LEFT PANEL: Customer + Products ══ */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.65rem', minWidth: 0 }}>

                    {/* ── Customer bar ── */}
                    <div style={{ ...card, display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                        {/* Name */}
                        <div style={{ flex: 2 }}>
                            <label style={lbl}>Customer Name</label>
                            <input style={inp} placeholder="Enter name" value={customer.name}
                                onChange={e => setCustomer(p => ({ ...p, name: e.target.value }))} />
                        </div>
                        {/* Phone + suggestions */}
                        <div style={{ flex: 2, position: 'relative' }}>
                            <label style={lbl}>Phone</label>
                            <input style={inp} placeholder="+880" value={customer.phone}
                                onChange={e => { setCustomer(p => ({ ...p, phone: e.target.value })); setSavedCustomerId(null); searchCustomers(e.target.value); }}
                                onFocus={() => customer.phone.length >= 2 && searchCustomers(customer.phone)} />
                            {showCustomerSuggestions && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '180px', overflowY: 'auto', marginTop: '4px' }}>
                                    {customerSuggestions.map(c => (
                                        <div key={c.id} onClick={() => selectCustomer(c)}
                                            style={{ padding: '0.6rem 0.9rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')}
                                            onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.87rem' }}>{c.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#888' }}>{c.phone}</div>
                                            </div>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--accent-color)', fontWeight: 600 }}>{c.total_bills} bills</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {/* Address */}
                        <div style={{ flex: 3 }}>
                            <label style={lbl}>Address</label>
                            <input style={inp} placeholder="Delivery address (optional)" value={customer.address}
                                onChange={e => setCustomer(p => ({ ...p, address: e.target.value }))} />
                        </div>
                        {/* Email */}
                        <div style={{ flex: 2 }}>
                            <label style={lbl}>Email</label>
                            <input style={inp} placeholder="email@example.com" value={customer.email}
                                onChange={e => setCustomer(p => ({ ...p, email: e.target.value }))} />
                        </div>
                        {/* Returning tag */}
                        {savedCustomerId && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#22c55e', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap', paddingBottom: '0.35rem' }}>
                                <UserSearch size={14} /> Returning
                            </div>
                        )}
                    </div>

                    {/* ── Product Search + Table (main area) ── */}
                    <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>

                        {/* Search bar */}
                        <div style={{ padding: '0.7rem 0.9rem', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem' }}>
                            <form onSubmit={e => { 
                                e.preventDefault(); 
                                const t = searchTerm.trim().toLowerCase(); 
                                if (!t) return; 
                                // Check local state first (fast)
                                let ex = products.find(p => (p.sku || '').toLowerCase() === t);
                                // Fallback to detailed results if not in local yet (e.g. still loading chunks)
                                if (!ex) ex = detailedResults.find(p => (p.sku || '').toLowerCase() === t);
                                
                                if (ex) {
                                    addToCart(ex);
                                } else {
                                    setShowProductDropdown(true); 
                                }
                            }} style={{ flex: 1, position: 'relative' }}>
                                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                <input ref={barcodeInputRef} type="text"
                                    placeholder="Scan Barcode (F2) or search product name / SKU..."
                                    value={searchTerm}
                                    onChange={e => { setSearchTerm(e.target.value); setShowProductDropdown(e.target.value.length > 0); }}
                                    onFocus={() => searchTerm.length > 0 && setShowProductDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                                    style={{ ...inp, paddingLeft: '2.2rem', height: '36px' }} />

                                <AnimatePresence>
                                    {showProductDropdown && (searchTerm.length > 0) && (
                                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                                            style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid var(--border-color)', borderRadius: '0 0 10px 10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '320px', overflowY: 'auto' }}>
                                            
                                            {searching && (
                                                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                    Searching...
                                                </div>
                                            )}

                                            {!searching && displayProducts.length === 0 && (
                                                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No products found</div>
                                                    <div style={{ fontSize: '0.75rem' }}>Try a different name or SKU</div>
                                                </div>
                                            )}

                                            {!searching && displayProducts.slice(0, 30).map(p => (
                                                <div key={p.id} onMouseDown={() => addToCart(p)}
                                                    style={{ padding: '0.55rem 0.9rem', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        {p.image_path
                                                            ? <img src={`file://${p.image_path}`} alt="" style={{ width: '30px', height: '30px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #eee' }} />
                                                            : <div style={{ width: '30px', height: '30px', borderRadius: '4px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#94a3b8' }}>IMG</div>}
                                                        <div>
                                                            <div style={{ fontWeight: 600, fontSize: '0.87rem' }}>{p.name}</div>
                                                            <div style={{ fontSize: '0.72rem', color: '#888' }}>SKU: {p.sku || 'N/A'} {p.quantity !== undefined && ` • Stock: ${p.quantity}`}</div>
                                                        </div>
                                                    </div>
                                                    <span style={{ fontWeight: 700, color: 'var(--accent-color)', fontSize: '0.9rem' }}>৳{p.selling_price.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </form>
                            <button onClick={() => barcodeInputRef.current?.focus()}
                                style={{ height: '36px', width: '40px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ScanBarcode size={16} />
                            </button>
                        </div>

                        {/* Cart Table */}
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {cart.length === 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.35, gap: '0.5rem' }}>
                                    <Package size={44} />
                                    <p style={{ fontSize: '0.95rem' }}>Scan or search to add products</p>
                                    <p style={{ fontSize: '0.8rem' }}>Press F2 to focus barcode scanner</p>
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead style={{ background: 'var(--hover-bg)', position: 'sticky', top: 0, zIndex: 5 }}>
                                        <tr>
                                            <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', width: '40px', fontWeight: 700, color: 'var(--text-secondary)' }}>#</th>
                                            <th style={{ padding: '0.55rem 0.75rem', textAlign: 'left', fontWeight: 700 }}>Product</th>
                                            <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', width: '105px', fontWeight: 700 }}>Qty</th>
                                            <th style={{ padding: '0.55rem 0.5rem', textAlign: 'right', width: '90px', fontWeight: 700 }}>Unit MRP</th>
                                            <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', width: '80px', fontWeight: 700 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}><Tag size={12} />Disc%</div>
                                            </th>
                                            <th style={{ padding: '0.55rem 0.5rem', textAlign: 'right', width: '105px', fontWeight: 700 }}>Final Price</th>
                                            <th style={{ padding: '0.55rem 0.5rem', textAlign: 'right', width: '90px', fontWeight: 700, color: '#22c55e' }}>Savings</th>
                                            <th style={{ width: '34px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cart.map((item, idx) => (
                                            <tr key={item.product_id}
                                                style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'var(--hover-bg)' : 'var(--card-bg)', transition: 'background 0.1s' }}>
                                                <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{idx + 1}</td>
                                                <td style={{ padding: '0.5rem 0.75rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                        {item.image_path
                                                            ? <img src={`file://${item.image_path}`} alt="" style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #eee', flexShrink: 0 }} />
                                                            : <div style={{ width: '28px', height: '28px', borderRadius: '4px', background: '#f1f5f9', flexShrink: 0 }} />}
                                                        <div>
                                                            <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{item.product_name}</div>
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{item.sku || 'No SKU'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* Qty */}
                                                <td style={{ padding: '0.4rem 0.3rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                                        <button onClick={() => updateCartItem(item.product_id, 'quantity', item.quantity - 1)}
                                                            style={{ width: '22px', height: '22px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--card-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <Minus size={10} />
                                                        </button>
                                                        <input type="number" value={item.quantity}
                                                            onChange={e => updateCartItem(item.product_id, 'quantity', parseInt(e.target.value) || 1)}
                                                            style={{ width: '38px', textAlign: 'center', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '2px', fontSize: '0.82rem' }} min={1} />
                                                        <button onClick={() => updateCartItem(item.product_id, 'quantity', item.quantity + 1)}
                                                            style={{ width: '22px', height: '22px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--card-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <Plus size={10} />
                                                        </button>
                                                    </div>
                                                </td>
                                                {/* MRP */}
                                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontWeight: 500, color: 'var(--text-secondary)' }}>
                                                    ৳{item.mrp.toLocaleString()}
                                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>×{item.quantity}</div>
                                                </td>
                                                {/* Discount % — typing here sets price */}
                                                <td style={{ padding: '0.4rem 0.3rem' }}>
                                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                        <input type="number"
                                                            value={item.discount_pct === 0 ? '' : item.discount_pct}
                                                            placeholder="0"
                                                            onChange={e => updateCartItem(item.product_id, 'discount_pct', parseFloat(e.target.value) || 0)}
                                                            style={{ width: '58px', textAlign: 'center', border: `1px solid ${item.discount_pct > 0 ? '#f97316' : 'var(--border-color)'}`, borderRadius: '6px', padding: '3px 18px 3px 5px', fontSize: '0.82rem', background: item.discount_pct > 0 ? '#fff7ed' : 'var(--card-bg)', color: item.discount_pct > 0 ? '#c2410c' : 'inherit', fontWeight: item.discount_pct > 0 ? 700 : 400 }}
                                                            min={0} max={100} />
                                                        <span style={{ position: 'absolute', right: '5px', fontSize: '0.72rem', color: '#c2410c', fontWeight: 700 }}>%</span>
                                                    </div>
                                                </td>
                                                {/* Final price — click to edit, clamps to MRP×qty max */}
                                                <td style={{ padding: '0.4rem 0.3rem' }}>
                                                    {editingPriceId === item.product_id ? (
                                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                            <span style={{ position: 'absolute', left: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>৳</span>
                                                            <input type="number" autoFocus
                                                                defaultValue={+item.price.toFixed(2)}
                                                                onBlur={e => { updateCartItem(item.product_id, 'discounted_price', parseFloat(e.target.value) || 0); setEditingPriceId(null); }}
                                                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingPriceId(null); }}
                                                                style={{ width: '85px', textAlign: 'right', border: '1px solid var(--accent-color)', borderRadius: '6px', padding: '3px 5px 3px 16px', fontSize: '0.87rem', fontWeight: 700, color: 'var(--accent-color)', background: '#f0fdf4', outline: 'none' }}
                                                                min={0} max={+(item.mrp * item.quantity).toFixed(2)} />
                                                        </div>
                                                    ) : (
                                                        <div onClick={() => setEditingPriceId(item.product_id)}
                                                            title="Click to edit price"
                                                            style={{ width: '85px', textAlign: 'right', padding: '3px 5px', fontSize: '0.87rem', fontWeight: 700, color: 'var(--accent-color)', background: item.discount_amt > 0 ? '#f0fdf4' : 'transparent', borderRadius: '6px', border: `1px solid ${item.discount_amt > 0 ? '#86efac' : 'transparent'}`, cursor: 'text', userSelect: 'none' }}>
                                                            ৳{item.price.toFixed(0)}
                                                        </div>
                                                    )}
                                                </td>
                                                {/* Savings */}
                                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: item.discount_amt > 0 ? '#22c55e' : 'var(--text-secondary)', fontWeight: item.discount_amt > 0 ? 700 : 400, fontSize: '0.8rem' }}>
                                                    {item.discount_amt > 0 ? `-৳${item.discount_amt.toFixed(0)}` : '—'}
                                                </td>
                                                <td style={{ padding: '0.4rem 0.3rem', textAlign: 'center' }}>
                                                    <button onClick={() => removeFromCart(item.product_id)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '3px' }}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* ── Collapsible: Shipping ── */}
                    <div style={{ ...card, padding: 0, overflow: 'hidden', border: `1px solid ${shippingEnabled ? 'var(--accent-color)' : 'var(--border-color)'}` }}>
                        <button onClick={() => setShowShipping(v => !v)}
                            style={{ width: '100%', padding: '0.65rem 1rem', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left' }}>
                            <input type="checkbox" checked={shippingEnabled} onChange={e => { e.stopPropagation(); setShippingEnabled(e.target.checked); }}
                                style={{ width: '15px', height: '15px', accentColor: 'var(--accent-color)' }} />
                            <Truck size={15} color={shippingEnabled ? 'var(--accent-color)' : 'var(--text-secondary)'} />
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: shippingEnabled ? 'var(--accent-color)' : 'var(--text-secondary)', flex: 1 }}>Ship this order</span>
                            {shippingEnabled && shippingCharge > 0 && <span style={{ fontSize: '0.8rem', color: '#6366f1', fontWeight: 700 }}>+৳{shippingCharge}</span>}
                            {showShipping ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <AnimatePresence>
                            {showShipping && (
                                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden' }}>
                                    <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div>
                                            <div style={{ ...lbl, color: '#f97316', marginBottom: '0.4rem' }}>📦 SHIP TO (RECIPIENT)</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                <input style={inp} placeholder="Recipient name *" value={shipTo.name} onChange={e => setShipTo(p => ({ ...p, name: e.target.value }))} />
                                                <textarea style={{ ...inp, resize: 'vertical', minHeight: '52px' }} placeholder="Full delivery address *" value={shipTo.address} onChange={e => setShipTo(p => ({ ...p, address: e.target.value }))} />
                                                <input style={inp} placeholder="Phone number" value={shipTo.phone} onChange={e => setShipTo(p => ({ ...p, phone: e.target.value }))} />
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ ...lbl, color: '#6366f1', marginBottom: '0.4rem' }}>🏢 SHIP FROM (SENDER)</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                <input style={inp} value={shipFrom.name} onChange={e => setShipFrom(p => ({ ...p, name: e.target.value }))} placeholder="Sender" />
                                                <input style={inp} value={shipFrom.address} onChange={e => setShipFrom(p => ({ ...p, address: e.target.value }))} placeholder="Sender address" />
                                                <div>
                                                    <label style={lbl}>Shipping Charge (৳)</label>
                                                    <input type="number" style={{ ...inp, fontWeight: 700 }} placeholder="0" min={0} value={shippingCharge || ''} onChange={e => setShippingCharge(parseFloat(e.target.value) || 0)} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ── Collapsible: Extras (Installation + Notes) ── */}
                    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                        <button onClick={() => setShowExtras(v => !v)}
                            style={{ width: '100%', padding: '0.65rem 1rem', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Wrench size={15} color="var(--text-secondary)" />
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)', flex: 1 }}>Installation / Service Note</span>
                            {installationCharge > 0 && <span style={{ fontSize: '0.8rem', color: '#8b5cf6', fontWeight: 700 }}>+৳{installationCharge}</span>}
                            {showExtras ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <AnimatePresence>
                            {showExtras && (
                                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden' }}>
                                    <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.75rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={lbl}>Note</label>
                                            <input style={inp} placeholder="Brief note about installation (optional)" value={installationNote} onChange={e => setInstallationNote(e.target.value)} />
                                        </div>
                                        <div style={{ width: '160px' }}>
                                            <label style={lbl}>Charge (৳)</label>
                                            <input type="number" style={{ ...inp, fontWeight: 700 }} placeholder="0" min={0} value={installationCharge || ''} onChange={e => setInstallationCharge(parseFloat(e.target.value) || 0)} />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* ══ RIGHT PANEL: Invoice Meta + Totals + Payment ══ */}
                <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '0.65rem', flexShrink: 0 }}>

                    {/* Invoice meta */}
                    <div style={{ ...card, textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Invoice</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 800, color: 'var(--accent-color)', letterSpacing: '1px' }}>{invoiceNumber}</div>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            <div>Billed By: <strong>{billedBy}</strong></div>
                            <div>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                        </div>
                    </div>

                    {/* Payment method */}
                    <div style={card}>
                        <label style={lbl}>Payment Method</label>
                        <select style={{ ...inp, fontWeight: 600 }} value={selectedPaymentMethod || ''}
                            onChange={e => setSelectedPaymentMethod(parseInt(e.target.value) || null)}>
                            <option value="">Select Method</option>
                            {paymentMethods.map(m => <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>)}
                        </select>
                        {selectedPaymentMethod && paymentMethods.find(m => m.id === selectedPaymentMethod)?.provider !== 'Cash' && (
                            <div style={{ marginTop: '0.6rem' }}>
                                <label style={lbl}>Transaction ID / Reference</label>
                                <input style={{ ...inp, border: paymentRef ? '1px solid var(--border-color)' : '1px solid #ef4444' }}
                                    placeholder="Enter Ref / Trans ID" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} />
                            </div>
                        )}
                    </div>

                    {/* ── Price summary ── */}
                    <div style={{ ...card, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.9rem' }}>
                            <Receipt size={15} color="var(--text-secondary)" />
                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Order Summary</span>
                        </div>

                        {/* Line-by-line summary */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.82rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Subtotal ({cart.reduce((s, i) => s + i.quantity, 0)} items)</span>
                                <span style={{ fontWeight: 600 }}>৳{subtotal.toLocaleString()}</span>
                            </div>

                            {/* Editable Total Discount */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#16a34a' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Tag size={11} />
                                    <span>Total Discount</span>
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                        <input
                                            type="number"
                                            min={0} max={100}
                                            placeholder={String(calcGlobalDiscPct)}
                                            value={globalDiscountPct}
                                            title="Set a global discount % to distribute evenly to all products"
                                            onChange={e => {
                                                const v = e.target.value === '' ? '' : parseFloat(e.target.value);
                                                setGlobalDiscountPct(v);
                                                if (typeof v === 'number' && !isNaN(v)) applyGlobalDiscount(v);
                                            }}
                                            onBlur={() => { if (globalDiscountPct === '') setGlobalDiscountPct(''); }}
                                            style={{
                                                width: '52px', textAlign: 'center', border: '1px solid #86efac',
                                                borderRadius: '5px', padding: '2px 16px 2px 4px',
                                                fontSize: '0.78rem', background: '#f0fdf4', color: '#15803d', fontWeight: 700
                                            }}
                                        />
                                        <span style={{ position: 'absolute', right: '4px', fontSize: '0.7rem', color: '#15803d', fontWeight: 700 }}>%</span>
                                    </div>
                                    {discountTotal > 0 && (
                                        <span style={{ fontWeight: 700 }}>-৳{discountTotal.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                                    )}
                                </div>
                            </div>

                            {installationCharge > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7c3aed' }}>
                                    <span>🔧 Installation</span>
                                    <span style={{ fontWeight: 600 }}>+৳{installationCharge.toLocaleString()}</span>
                                </div>
                            )}

                            {shippingEnabled && shippingCharge > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4f46e5' }}>
                                    <span>🚚 Shipping</span>
                                    <span style={{ fontWeight: 600 }}>+৳{shippingCharge.toLocaleString()}</span>
                                </div>
                            )}

                            {/* Price Adjustment — only shown when permitted and policy allows */}
                            {canAdjust && maxAdj > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: adjClamped < 0 ? '#dc2626' : '#2563eb' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Sliders size={11} />
                                        <span>Price Adjust</span>
                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>(±৳{maxAdj})</span>
                                    </span>
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                        <span style={{ position: 'absolute', left: '5px', fontSize: '0.76rem', fontWeight: 700 }}>৳</span>
                                        <input
                                            type="number"
                                            value={priceAdjustment}
                                            onChange={e => setPriceAdjustment(parseFloat(e.target.value) || 0)}
                                            style={{
                                                width: '80px', textAlign: 'right', paddingLeft: '16px', paddingRight: '5px',
                                                border: `1px solid ${adjClamped < 0 ? '#fca5a5' : adjClamped > 0 ? '#93c5fd' : 'var(--border-color)'}`,
                                                borderRadius: '5px', fontSize: '0.82rem', fontWeight: 700,
                                                background: adjClamped < 0 ? '#fef2f2' : adjClamped > 0 ? '#eff6ff' : 'var(--card-bg)',
                                                color: adjClamped < 0 ? '#dc2626' : '#2563eb',
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            <div style={{ borderTop: '2px solid var(--border-color)', marginTop: '0.35rem', paddingTop: '0.65rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Grand Total</span>
                                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-color)', fontFamily: 'monospace' }}>৳{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>

                            {/* Amount in words */}
                            <div style={{ padding: '0.5rem 0.6rem', background: 'var(--hover-bg)', borderRadius: '6px', fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                {amountInWords(Math.round(grandTotal))}
                            </div>
                        </div>
                    </div>


                    {/* ── Action buttons ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <button onClick={handleSaveBill} disabled={saving || cart.length === 0}
                            style={{ padding: '0.8rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.95rem', cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: cart.length === 0 ? 0.5 : 1 }}>
                            <Save size={17} /> {saving ? 'Saving...' : 'Save Bill'}
                        </button>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => window.print()} disabled={cart.length === 0}
                                style={{ flex: 1, padding: '0.65rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', opacity: cart.length === 0 ? 0.5 : 1, fontSize: '0.85rem' }}>
                                <Printer size={15} /> Print
                            </button>
                            <button onClick={handleNewBill}
                                style={{ flex: 1, padding: '0.65rem', background: 'var(--hover-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                <Plus size={15} /> New Bill
                            </button>
                        </div>
                    </div>
                </div>

            </div>

            {/* Print Styles */}
            <style>{`
                @media print {
                    @page { margin: 10mm; }
                    body * { visibility: hidden; }
                    #billing-page, #billing-page * { visibility: visible; }
                    #billing-page { position: absolute; left: 0; top: 0; width: 100%; height: auto !important; padding: 0 !important; }
                    button, .sidebar, .top-bar { display: none !important; }
                    input, select, textarea { border: none !important; background: transparent !important; }
                }
            `}</style>
        </DashboardLayout>
    );
};

export default Billing;
