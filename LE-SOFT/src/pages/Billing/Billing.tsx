import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Printer, Trash2, Plus, Minus, ScanBarcode, Save, UserSearch, Truck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

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
    mrp: number;
    discount_pct: number;
    discount_amt: number;
    price: number;
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

// Number-to-words conversion for Taka
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function numberToWords(num: number): string {
    if (num === 0) return 'Zero';
    const n = Math.floor(num);
    if (n < 0) return 'Minus ' + numberToWords(-n);

    let str = '';
    if (Math.floor(n / 10000000) > 0) { str += numberToWords(Math.floor(n / 10000000)) + ' Crore '; }
    const rem1 = n % 10000000;
    if (Math.floor(rem1 / 100000) > 0) { str += numberToWords(Math.floor(rem1 / 100000)) + ' Lakh '; }
    const rem2 = rem1 % 100000;
    if (Math.floor(rem2 / 1000) > 0) { str += numberToWords(Math.floor(rem2 / 1000)) + ' Thousand '; }
    const rem3 = rem2 % 1000;
    if (Math.floor(rem3 / 100) > 0) { str += ones[Math.floor(rem3 / 100)] + ' Hundred '; }
    const rem4 = rem3 % 100;
    if (rem4 > 0) {
        if (str !== '') str += 'and ';
        if (rem4 < 20) str += ones[rem4];
        else str += tens[Math.floor(rem4 / 10)] + (rem4 % 10 !== 0 ? ' ' + ones[rem4 % 10] : '');
    }
    return str.trim();
}

function amountInWords(amount: number): string {
    if (amount === 0) return 'Zero Tk Only';
    return numberToWords(amount) + ' Tk Only';
}

// Styles
const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem 0.75rem',
    background: '#fff',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    marginBottom: '0.25rem',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
};

const Billing: React.FC = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showProductDropdown, setShowProductDropdown] = useState(false);
    const barcodeInputRef = useRef<HTMLInputElement>(null);

    // Customer state
    const [customer, setCustomer] = useState<Customer>({ name: '', phone: '', email: '', address: '' });
    const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
    const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
    const [savedCustomerId, setSavedCustomerId] = useState<number | null>(null);

    // Bill state
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const billedBy = localStorage.getItem('user_name') || 'Admin';
    const [saving, setSaving] = useState(false);

    // Shipping state
    const [shippingEnabled, setShippingEnabled] = useState(false);
    const [shipTo, setShipTo] = useState({ name: '', address: '', phone: '' });
    const [shipFrom, setShipFrom] = useState({ name: 'Leading Edge', address: 'Dhaka, Bangladesh' });
    const [shippingCharge, setShippingCharge] = useState(0);

    // Load Products
    useEffect(() => {
        const loadProducts = async () => {
            // @ts-ignore
            const data = await window.electron.getProducts();
            setProducts(data || []);
        };
        loadProducts();

        // Generate preview invoice number
        const now = new Date();
        const dateStr = now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0');
        setInvoiceNumber(`${dateStr}-XXXX-XXX`);
    }, []);

    // Barcode hotkey
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') {
                e.preventDefault();
                barcodeInputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Customer phone search
    const searchCustomers = useCallback(async (query: string) => {
        if (query.length < 2) {
            setCustomerSuggestions([]);
            setShowCustomerSuggestions(false);
            return;
        }
        try {
            // @ts-ignore
            const results = await window.electron.searchBillingCustomers(query);
            setCustomerSuggestions(results || []);
            setShowCustomerSuggestions(results && results.length > 0);
        } catch (e) { console.error(e); }
    }, []);

    const handleCustomerPhoneChange = (value: string) => {
        setCustomer(prev => ({ ...prev, phone: value }));
        setSavedCustomerId(null);
        searchCustomers(value);
    };

    const selectCustomer = (c: Customer) => {
        setCustomer({ name: c.name || '', phone: c.phone || '', email: c.email || '', address: c.address || '' });
        setSavedCustomerId(c.id || null);
        setShowCustomerSuggestions(false);
    };

    // Cart operations
    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.product_id === product.id);
            if (existing) {
                return prev.map(item => item.product_id === product.id
                    ? { ...item, quantity: item.quantity + 1, price: (item.quantity + 1) * item.mrp * (1 - item.discount_pct / 100) }
                    : item
                );
            }
            return [...prev, {
                product_id: product.id,
                product_name: product.name,
                sku: product.sku || '',
                quantity: 1,
                mrp: product.selling_price,
                discount_pct: 0,
                discount_amt: 0,
                price: product.selling_price,
                image_path: product.image_path || '',
            }];
        });
        setSearchTerm('');
        setShowProductDropdown(false);
    };

    const removeFromCart = (productId: number) => {
        setCart(prev => prev.filter(item => item.product_id !== productId));
    };

    const updateCartItem = (productId: number, field: string, value: number) => {
        setCart(prev => prev.map(item => {
            if (item.product_id !== productId) return item;
            const updated = { ...item, [field]: value };
            // Recalculate
            if (field === 'discount_pct') {
                updated.discount_amt = updated.mrp * updated.quantity * (value / 100);
                updated.price = updated.mrp * updated.quantity - updated.discount_amt;
            } else if (field === 'quantity') {
                updated.discount_amt = updated.mrp * value * (updated.discount_pct / 100);
                updated.price = updated.mrp * value - updated.discount_amt;
            }
            return updated;
        }));
    };

    const handleSearchOrScan = (e: React.FormEvent) => {
        e.preventDefault();
        const term = searchTerm.trim().toLowerCase();
        if (!term) return;

        const exactMatch = products.find(p => (p.sku || '').toLowerCase() === term);
        if (exactMatch) {
            addToCart(exactMatch);
            return;
        }
        setShowProductDropdown(true);
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Totals
    const subtotal = cart.reduce((sum, item) => sum + (item.mrp * item.quantity), 0);
    const discountTotal = cart.reduce((sum, item) => sum + item.discount_amt, 0);
    const grandTotal = subtotal - discountTotal + (shippingEnabled ? shippingCharge : 0);

    // Save Bill
    const handleSaveBill = async () => {
        if (cart.length === 0) return alert('Add products to the bill first.');
        if (!customer.name) return alert('Enter customer name.');

        setSaving(true);
        try {
            // 1. Create or get customer
            // @ts-ignore
            const savedCustomer = await window.electron.createBillingCustomer(customer);
            const custId = savedCustomer.id;
            setSavedCustomerId(custId);

            // 2. Create bill
            // @ts-ignore
            const result = await window.electron.createBill({
                customer_id: custId,
                billed_by: billedBy,
                items: cart,
                subtotal,
                discount_total: discountTotal,
                grand_total: grandTotal,
            });

            if (result.success) {
                setInvoiceNumber(result.invoice_number);

                // 3. Save shipping if enabled
                if (shippingEnabled && shipTo.name && shipTo.address) {
                    // @ts-ignore
                    await window.electron.addBillShipping({
                        bill_id: result.id,
                        ship_to_name: shipTo.name,
                        ship_to_address: shipTo.address,
                        ship_to_phone: shipTo.phone,
                        ship_from_name: shipFrom.name,
                        ship_from_address: shipFrom.address,
                        shipping_charge: shippingCharge,
                        updated_by: billedBy,
                        user_role: localStorage.getItem('user_role') || 'cashier',
                    });
                }

                alert(`Bill saved! Invoice: ${result.invoice_number}${shippingEnabled ? ' (Shipping order created)' : ''}`);
            }
        } catch (e) {
            console.error(e);
            alert('Failed to save bill.');
        } finally {
            setSaving(false);
        }
    };

    const handlePrint = () => { window.print(); };

    const handleNewBill = () => {
        setCart([]);
        setCustomer({ name: '', phone: '', email: '', address: '' });
        setSavedCustomerId(null);
        const now = new Date();
        const dateStr = now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0');
        setInvoiceNumber(`${dateStr}-XXXX-XXX`);
    };

    return (
        <DashboardLayout title="Billing / POS">
            <div id="billing-page" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', gap: '0.75rem', padding: '0 0.5rem' }}>

                {/* ── TOP: CUSTOMER INFO BAR ── */}
                <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
                        {/* Left: Customer Fields */}
                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1rem' }}>
                            <div>
                                <label style={labelStyle}>Customer Name</label>
                                <input
                                    style={inputStyle}
                                    placeholder="Enter customer name"
                                    value={customer.name}
                                    onChange={e => setCustomer(prev => ({ ...prev, name: e.target.value }))}
                                />
                            </div>
                            <div style={{ position: 'relative' }}>
                                <label style={labelStyle}>Phone Number</label>
                                <input
                                    style={inputStyle}
                                    placeholder="+880"
                                    value={customer.phone}
                                    onChange={e => handleCustomerPhoneChange(e.target.value)}
                                    onFocus={() => customer.phone.length >= 2 && searchCustomers(customer.phone)}
                                />
                                {showCustomerSuggestions && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                        background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '200px', overflowY: 'auto', marginTop: '4px'
                                    }}>
                                        {customerSuggestions.map(c => (
                                            <div
                                                key={c.id}
                                                onClick={() => selectCustomer(c)}
                                                style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')}
                                                onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#666' }}>{c.phone}</div>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--accent-color)', fontWeight: 600 }}>
                                                    {c.total_bills} bills
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label style={labelStyle}>Address</label>
                                <input
                                    style={inputStyle}
                                    placeholder="Enter address"
                                    value={customer.address}
                                    onChange={e => setCustomer(prev => ({ ...prev, address: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Email</label>
                                <input
                                    style={inputStyle}
                                    placeholder="email@example.com"
                                    value={customer.email}
                                    onChange={e => setCustomer(prev => ({ ...prev, email: e.target.value }))}
                                />
                            </div>
                        </div>

                        {/* Right: Bill Meta */}
                        <div style={{ minWidth: '220px', textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Invoice</div>
                            <div style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700, color: 'var(--accent-color)' }}>{invoiceNumber}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                Billed By: <strong>{billedBy}</strong>
                            </div>
                            {savedCustomerId && (
                                <div style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: 600 }}>
                                    <UserSearch size={14} style={{ verticalAlign: 'middle' }} /> Returning Customer
                                </div>
                            )}
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} — {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── MIDDLE: PRODUCT SEARCH + TABLE ── */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>

                    {/* Search Bar */}
                    <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <form onSubmit={handleSearchOrScan} style={{ flex: 1, position: 'relative' }}>
                            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                            <input
                                ref={barcodeInputRef}
                                type="text"
                                placeholder="Scan Barcode (F2) or search product name / SKU..."
                                value={searchTerm}
                                onChange={e => { setSearchTerm(e.target.value); setShowProductDropdown(e.target.value.length > 0); }}
                                onFocus={() => searchTerm.length > 0 && setShowProductDropdown(true)}
                                onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                                style={{ ...inputStyle, paddingLeft: '2.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                            />
                            <AnimatePresence>
                                {showProductDropdown && filteredProducts.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                                        style={{
                                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                            background: '#fff', border: '1px solid var(--border-color)', borderRadius: '0 0 8px 8px',
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '250px', overflowY: 'auto'
                                        }}
                                    >
                                        {filteredProducts.slice(0, 15).map(p => (
                                            <div
                                                key={p.id}
                                                onMouseDown={() => addToCart(p)}
                                                style={{ padding: '0.6rem 1rem', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                                                onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    {p.image_path ? (
                                                        <img src={`file://${p.image_path}`} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #eee' }} />
                                                    ) : (
                                                        <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#94a3b8' }}>IMG</div>
                                                    )}
                                                    <div>
                                                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                                                        <div style={{ fontSize: '0.75rem', color: '#888' }}>SKU: {p.sku || 'N/A'}</div>
                                                    </div>
                                                </div>
                                                <span style={{ fontWeight: 700, color: 'var(--accent-color)' }}>৳{p.selling_price}</span>
                                            </div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </form>
                        <button onClick={handleSearchOrScan as any} style={{ height: '38px', width: '42px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ScanBarcode size={18} />
                        </button>
                    </div>

                    {/* Product Table */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 5 }}>
                                <tr>
                                    <th style={{ padding: '0.6rem 1rem', textAlign: 'center', width: '50px', fontWeight: 700 }}>No.</th>
                                    <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700 }}>Products</th>
                                    <th style={{ padding: '0.6rem 1rem', textAlign: 'center', width: '100px', fontWeight: 700 }}>Quantity</th>
                                    <th style={{ padding: '0.6rem 1rem', textAlign: 'center', width: '100px', fontWeight: 700 }}>Discount %</th>
                                    <th style={{ padding: '0.6rem 1rem', textAlign: 'right', width: '100px', fontWeight: 700 }}>MRP</th>
                                    <th style={{ padding: '0.6rem 1rem', textAlign: 'right', width: '120px', fontWeight: 700 }}>Discounted</th>
                                    <th style={{ padding: '0.6rem 1rem', textAlign: 'right', width: '120px', fontWeight: 700 }}>Price</th>
                                    <th style={{ padding: '0.6rem 1rem', textAlign: 'center', width: '50px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {cart.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#aaa' }}>
                                            <ScanBarcode size={32} style={{ marginBottom: '0.5rem', opacity: 0.3 }} />
                                            <p>Scan barcode or search to add products</p>
                                        </td>
                                    </tr>
                                ) : (
                                    cart.map((item, idx) => (
                                        <tr key={item.product_id} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? '#fafbfc' : '#fff' }}>
                                            <td style={{ padding: '0.6rem 1rem', textAlign: 'center', fontWeight: 600, color: '#888' }}>{String(idx + 1).padStart(2, '0')}.</td>
                                            <td style={{ padding: '0.6rem 1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    {item.image_path ? (
                                                        <img src={`file://${item.image_path}`} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #eee' }} />
                                                    ) : (
                                                        <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#94a3b8' }}>IMG</div>
                                                    )}
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#888' }}>SKU: {item.sku || 'N/A'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                    <button onClick={() => updateCartItem(item.product_id, 'quantity', Math.max(1, item.quantity - 1))} style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}><Minus size={12} /></button>
                                                    <input
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={e => updateCartItem(item.product_id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                                                        style={{ width: '40px', textAlign: 'center', border: '1px solid #ddd', borderRadius: '4px', padding: '2px', fontSize: '0.85rem' }}
                                                        min={1}
                                                    />
                                                    <button onClick={() => updateCartItem(item.product_id, 'quantity', item.quantity + 1)} style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}><Plus size={12} /></button>
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                                                <input
                                                    type="number"
                                                    value={item.discount_pct}
                                                    onChange={e => updateCartItem(item.product_id, 'discount_pct', Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                                                    style={{ width: '55px', textAlign: 'center', border: '1px solid #ddd', borderRadius: '4px', padding: '2px', fontSize: '0.85rem' }}
                                                    min={0} max={100}
                                                />
                                            </td>
                                            <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 500 }}>৳{(item.mrp * item.quantity).toLocaleString()}</td>
                                            <td style={{ padding: '0.6rem 1rem', textAlign: 'right', color: item.discount_amt > 0 ? '#ef4444' : '#999' }}>
                                                {item.discount_amt > 0 ? `-৳${item.discount_amt.toLocaleString()}` : '৳0'}
                                            </td>
                                            <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--accent-color)' }}>৳{item.price.toLocaleString()}</td>
                                            <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                                                <button onClick={() => removeFromCart(item.product_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── SHIPPING SECTION ── */}
                <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: `1px solid ${shippingEnabled ? 'var(--accent-color)' : 'var(--border-color)'}`, padding: '1rem 1.25rem', transition: 'border-color 0.2s' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}>
                        <input type="checkbox" checked={shippingEnabled} onChange={e => setShippingEnabled(e.target.checked)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--accent-color)' }} />
                        <Truck size={16} style={{ color: shippingEnabled ? 'var(--accent-color)' : 'var(--text-secondary)' }} />
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: shippingEnabled ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
                            Ship this order
                        </span>
                        {shippingEnabled && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>Fill in delivery details below</span>}
                    </label>

                    <AnimatePresence>
                        {shippingEnabled && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                style={{ overflow: 'hidden' }}>
                                <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    {/* Ship TO */}
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#f97316', marginBottom: '0.5rem' }}>📦 Ship TO (Recipient)</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <input style={inputStyle} placeholder="Recipient name *" value={shipTo.name}
                                                onChange={e => setShipTo(p => ({ ...p, name: e.target.value }))} />
                                            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} placeholder="Full delivery address *" value={shipTo.address}
                                                onChange={e => setShipTo(p => ({ ...p, address: e.target.value }))} />
                                            <input style={inputStyle} placeholder="Phone number" value={shipTo.phone}
                                                onChange={e => setShipTo(p => ({ ...p, phone: e.target.value }))} />
                                        </div>
                                    </div>
                                    {/* Ship FROM + Charge */}
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6366f1', marginBottom: '0.5rem' }}>🏢 Ship FROM (Sender)</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <input style={inputStyle} placeholder="Sender name" value={shipFrom.name}
                                                onChange={e => setShipFrom(p => ({ ...p, name: e.target.value }))} />
                                            <input style={inputStyle} placeholder="Sender address" value={shipFrom.address}
                                                onChange={e => setShipFrom(p => ({ ...p, address: e.target.value }))} />
                                            <div>
                                                <label style={labelStyle}>Shipping Charge (৳)</label>
                                                <input type="number" style={{ ...inputStyle, fontWeight: 700 }} placeholder="0" min={0} value={shippingCharge || ''}
                                                    onChange={e => setShippingCharge(parseFloat(e.target.value) || 0)} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── BOTTOM: TOTALS + ACTIONS ── */}
                <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1rem 1.25rem' }}>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {/* Left: Amount in words */}
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>In Words:</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 600, fontStyle: 'italic', color: 'var(--text-primary)' }}>
                                {amountInWords(Math.round(grandTotal))}
                            </div>
                        </div>

                        {/* Right: Totals + Buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                            <div style={{ textAlign: 'right' }}>
                                {discountTotal > 0 && (
                                    <div style={{ fontSize: '0.8rem', color: '#ef4444', marginBottom: '0.25rem' }}>
                                        Discount: -৳{discountTotal.toLocaleString()}
                                    </div>
                                )}
                                {shippingEnabled && shippingCharge > 0 && (
                                    <div style={{ fontSize: '0.8rem', color: '#6366f1', marginBottom: '0.25rem' }}>
                                        🚚 Shipping: +৳{shippingCharge.toLocaleString()}
                                    </div>
                                )}

                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total Price:</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-color)', fontFamily: 'monospace' }}>
                                    ৳{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={handleSaveBill}
                                    disabled={saving || cart.length === 0}
                                    style={{
                                        padding: '0.7rem 1.5rem', background: '#22c55e', color: 'white', border: 'none',
                                        borderRadius: '8px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: cart.length === 0 ? 0.5 : 1
                                    }}
                                >
                                    <Save size={16} /> {saving ? 'Saving...' : 'Save Bill'}
                                </button>
                                <button
                                    onClick={handlePrint}
                                    disabled={cart.length === 0}
                                    style={{
                                        padding: '0.7rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none',
                                        borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: cart.length === 0 ? 0.5 : 1
                                    }}
                                >
                                    <Printer size={16} /> Print
                                </button>
                                <button
                                    onClick={handleNewBill}
                                    style={{
                                        padding: '0.7rem 1.5rem', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)',
                                        borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '0.4rem'
                                    }}
                                >
                                    <Plus size={16} /> New Bill
                                </button>
                            </div>
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
                    #billing-page {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        height: auto !important;
                        padding: 0 !important;
                    }
                    button, .sidebar, .top-bar, .app-container > :not(.main-content) { display: none !important; }
                    input { border: none !important; background: transparent !important; }
                }
            `}</style>
        </DashboardLayout>
    );
};

export default Billing;
