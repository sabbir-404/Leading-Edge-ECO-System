import React, { useState, useEffect, useRef } from 'react';
import { Search, RefreshCw, Plus, Printer, CheckCircle, XCircle, User, MapPin, Phone, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

const STATUS_COLORS: Record<string, string> = {
    'Pending': '#eab308',
    'Processing': '#3b82f6',
    'Shipped': '#6366f1',
    'Delivered': '#22c55e',
    'Cancelled': '#ef4444',
};

const CreateOrderModal = ({ onClose, onSave, users, products }: any) => {
    const [step, setStep] = useState(1);
    const [customerType, setCustomerType] = useState('existing');
    const [selectedUser, setSelectedUser] = useState('');
    const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '', address: '' });
    const [orderItems, setOrderItems] = useState<any[]>([]);
    const [productSearch, setProductSearch] = useState('');

    const handleAddItem = (product: any) => {
        setOrderItems(prev => {
            const exists = prev.find((p: any) => p.id === product.id);
            if (exists) return prev.map((p: any) => p.id === product.id ? { ...p, quantity: p.quantity + 1 } : p);
            return [...prev, { ...product, quantity: 1 }];
        });
        setProductSearch('');
    };

    const handleSubmit = () => {
        let customerData: any = {};
        if (customerType === 'existing') {
            const u = users.find((user: any) => user.id === selectedUser);
            if (!u) return alert('Select a customer');
            customerData = { customerName: u.name, customerEmail: u.email, customerPhone: u.phone, shippingAddress: u.address };
        } else {
            if (!newCustomer.name || !newCustomer.email) return alert('Fill customer details');
            customerData = { customerName: newCustomer.name, customerEmail: newCustomer.email, customerPhone: newCustomer.phone, shippingAddress: newCustomer.address };
        }

        const subtotal = orderItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const total = subtotal + 100; // Flat shipping

        onSave({
            ...customerData,
            items: orderItems,
            total,
            date: new Date().toISOString()
        });
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                style={{ background: 'white', padding: '2rem', borderRadius: '16px', width: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Create Manual Order</h2>
                
                {step === 1 && (
                    <div>
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                            <button onClick={() => setCustomerType('existing')} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: customerType === 'existing' ? '2px solid var(--accent-color)' : '1px solid var(--border-color)', background: customerType === 'existing' ? 'rgba(249,115,22,0.1)' : 'white' }}>Existing Customer</button>
                            <button onClick={() => setCustomerType('new')} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: customerType === 'new' ? '2px solid var(--accent-color)' : '1px solid var(--border-color)', background: customerType === 'new' ? 'rgba(249,115,22,0.1)' : 'white' }}>New Customer</button>
                        </div>
                        
                        {customerType === 'existing' ? (
                            <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }}>
                                <option value="">-- Select Customer --</option>
                                {users.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                            </select>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <input placeholder="Name" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }} />
                                <input placeholder="Email" value={newCustomer.email} onChange={e => setNewCustomer({...newCustomer, email: e.target.value})} style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }} />
                                <input placeholder="Phone" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }} />
                                <input placeholder="Address" value={newCustomer.address} onChange={e => setNewCustomer({...newCustomer, address: e.target.value})} style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }} />
                            </div>
                        )}
                        <button onClick={() => setStep(2)} disabled={customerType === 'existing' ? !selectedUser : !newCustomer.name} style={{ width: '100%', padding: '0.75rem', marginTop: '1.5rem', background: 'var(--accent-color)', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer', opacity: (customerType === 'existing' ? !selectedUser : !newCustomer.name) ? 0.5 : 1 }}>Next: Add Products</button>
                    </div>
                )}

                {step === 2 && (
                    <div>
                        <div style={{ position: 'relative', marginBottom: '1rem' }}>
                            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                            <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search to add products..." style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                            {productSearch && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                    {products.filter((p: any) => p.name.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 5).map((p: any) => (
                                        <div key={p.id} onClick={() => handleAddItem(p)} style={{ padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #eee', display: 'flex', justifyItems: 'space-between' }}>
                                            <span>{p.name}</span>
                                            <span style={{ marginLeft: 'auto', fontWeight: 600 }}>৳{p.price}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
                            {orderItems.map((item, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                                    <span>{item.name} x {item.quantity}</span>
                                    <span>৳{item.price * item.quantity}</span>
                                </div>
                            ))}
                            {orderItems.length === 0 && <p style={{ textAlign: 'center', opacity: 0.5 }}>No items added</p>}
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.2rem', padding: '1rem 0', borderTop: '2px solid var(--border-color)' }}>
                            <span>Total (incl. shipping)</span>
                            <span>৳{orderItems.reduce((s, i) => s + (i.price * i.quantity), 0) + 100}</span>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button onClick={() => setStep(1)} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'white' }}>Back</button>
                            <button onClick={handleSubmit} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', background: '#22c55e', color: 'white' }}>Create Order</button>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

const WebsiteOrders: React.FC = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const [filter, setFilter] = useState('All');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    
    // Data for modal
    const [users, setUsers] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);

    const printRef = useRef<HTMLDivElement>(null);

    const fetchOrders = async () => {
        setLoading(true);
        // @ts-ignore
        const data = await window.electron.websiteGetOrders();
        setOrders(data || []);
        setLoading(false);
    };

    const fetchAuxData = async () => {
        // @ts-ignore
        const u = await window.electron.websiteGetUsers();
        // @ts-ignore
        const p = await window.electron.websiteGetProducts();
        setUsers(u || []);
        setProducts(p || []);
    };

    useEffect(() => { 
        fetchOrders();
        fetchAuxData();
    }, []);

    const filtered = orders.filter(o => filter === 'All' ? true : o.payment_status === filter);

    const updateOrder = async (order: any, updates: any) => {
        const updated = { ...order, ...updates };
        // @ts-ignore
        await window.electron.websiteUpdateOrder({ id: order.id, status: updated.status, paymentStatus: updated.payment_status });
        setSelectedOrder(updated);
        setOrders(prev => prev.map(o => o.id === order.id ? updated : o));
    };

    const handleCreateOrder = async (orderData: any) => {
        // @ts-ignore
        await window.electron.websiteCreateOrder({ ...orderData, id: `ORD-${Date.now()}` });
        setIsCreateModalOpen(false);
        fetchOrders();
    };

    const handlePrint = () => {
        if (!printRef.current) return;
        const width = 500;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        const printWindow = window.open('', '', `width=${width},height=${height},top=${top},left=${left}`);
        if(printWindow) {
            printWindow.document.write(`<html><head><title>Shipping Label</title></head><body>${printRef.current.innerHTML}</body></html>`);
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
        }
    };

    return (
        <DashboardLayout title="Website Orders">
            <div className="masters-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Website Orders</h1>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button onClick={() => setIsCreateModalOpen(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '8px', background: 'var(--accent-color)', color: 'white', border: 'none', cursor: 'pointer' }}>
                            <Plus size={18} /> New Order
                        </button>
                        <button onClick={fetchOrders} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', cursor: 'pointer' }}><RefreshCw size={18} /></button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', flex: 1, overflow: 'hidden' }}>
                    {/* LIST */}
                    <div style={{ width: '350px', display: 'flex', flexDirection: 'column', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem' }}>
                            {['All', 'Paid', 'Unpaid'].map(f => (
                                <button key={f} onClick={() => setFilter(f)} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: filter === f ? 'var(--text-primary)' : 'var(--bg-secondary)', color: filter === f ? 'white' : 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}>{f}</button>
                            ))}
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {filtered.map(order => (
                                <div key={order.id} onClick={() => setSelectedOrder(order)}
                                    style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', background: selectedOrder?.id === order.id ? 'var(--bg-secondary)' : 'transparent', borderLeft: selectedOrder?.id === order.id ? '4px solid var(--accent-color)' : '4px solid transparent' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>#{order.id}</span>
                                        <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>{new Date(order.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>{order.customer_name}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: `${STATUS_COLORS[order.status]}20`, color: STATUS_COLORS[order.status] }}>{order.status}</span>
                                        <span style={{ fontWeight: 700 }}>৳{order.total}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* DETAILS */}
                    <div style={{ flex: 1, background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflowY: 'auto', padding: '2rem' }}>
                        {selectedOrder ? (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={selectedOrder.id}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.5rem' }}>
                                    <div>
                                        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>Order #{selectedOrder.id}</h2>
                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <select value={selectedOrder.status} onChange={e => updateOrder(selectedOrder, { status: e.target.value })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                                {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                            <select value={selectedOrder.payment_status} onChange={e => updateOrder(selectedOrder, { payment_status: e.target.value })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                                <option value="Paid">Paid</option>
                                                <option value="Unpaid">Unpaid</option>
                                            </select>
                                        </div>
                                    </div>
                                    <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', borderRadius: '8px', background: 'var(--text-primary)', color: 'white', border: 'none', cursor: 'pointer' }}>
                                        <Printer size={18} /> Print Label
                                    </button>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                                    <div>
                                        <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', opacity: 0.5, marginBottom: '1rem', fontWeight: 700 }}>Customer Details</h3>
                                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem', alignItems: 'center' }}><User size={16} opacity={0.5}/> <span style={{ fontWeight: 600 }}>{selectedOrder.customer_name}</span></div>
                                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem', alignItems: 'center' }}><Mail size={16} opacity={0.5}/> <span>{selectedOrder.customer_email}</span></div>
                                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem', alignItems: 'center' }}><Phone size={16} opacity={0.5}/> <span>{selectedOrder.customer_phone}</span></div>
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', opacity: 0.5, marginBottom: '1rem', fontWeight: 700 }}>Shipping Address</h3>
                                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'start' }}><MapPin size={16} opacity={0.5} style={{ marginTop: '4px' }}/> <span style={{ lineHeight: '1.5' }}>{selectedOrder.shipping_address}</span></div>
                                    </div>
                                </div>

                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                                            <tr>
                                                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.9rem' }}>Item</th>
                                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>Qty</th>
                                                <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.9rem' }}>Price</th>
                                                <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.9rem' }}>Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedOrder.items?.map((item: any, i: number) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '1rem', fontWeight: 600 }}>{item.name}</td>
                                                    <td style={{ padding: '1rem', textAlign: 'center' }}>{item.quantity}</td>
                                                    <td style={{ padding: '1rem', textAlign: 'right' }}>৳{item.price}</td>
                                                    <td style={{ padding: '1rem', textAlign: 'right' }}>৳{item.price * item.quantity}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot style={{ background: 'var(--bg-secondary)' }}>
                                            <tr>
                                                <td colSpan={3} style={{ padding: '1rem', textAlign: 'right', fontWeight: 600 }}>Total</td>
                                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 700, fontSize: '1.1rem' }}>৳{selectedOrder.total}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                                
                                <div style={{ display: 'none' }}>
                                    <div ref={printRef} style={{ padding: '40px', fontFamily: 'sans-serif', border: '2px solid black', maxWidth: '500px', margin: '0 auto' }}>
                                        <div style={{ textAlign: 'center', marginBottom: '40px', borderBottom: '2px solid black', paddingBottom: '20px' }}>
                                            <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>LEADING EDGE</h1>
                                            <p style={{ margin: '5px 0' }}>Shipping Label</p>
                                        </div>
                                        <div style={{ marginBottom: '30px' }}>
                                            <p style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', marginBottom: '5px' }}>Deliver To:</p>
                                            <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 10px 0' }}>{selectedOrder.customer_name}</h2>
                                            <p style={{ fontSize: '18px', margin: '0 0 5px 0' }}>{selectedOrder.customer_phone}</p>
                                            <p style={{ fontSize: '16px', margin: 0, lineHeight: '1.5' }}>{selectedOrder.shipping_address}</p>
                                        </div>
                                        <div style={{ borderTop: '2px solid black', paddingTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
                                            <div>
                                                <p style={{ fontSize: '12px', fontWeight: 'bold' }}>ORDER #</p>
                                                <p style={{ fontSize: '16px' }}>{selectedOrder.id}</p>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <p style={{ fontSize: '12px', fontWeight: 'bold' }}>COD AMOUNT</p>
                                                <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{selectedOrder.payment_status === 'Unpaid' ? `৳${selectedOrder.total}` : 'PAID'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4 }}>
                                <RefreshCw size={48} style={{ marginBottom: '1rem' }} />
                                <p>Select an order to view details</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <AnimatePresence>
                {isCreateModalOpen && <CreateOrderModal onClose={() => setIsCreateModalOpen(false)} onSave={handleCreateOrder} users={users} products={products} />}
            </AnimatePresence>
        </DashboardLayout>
    );
};

export default WebsiteOrders;
