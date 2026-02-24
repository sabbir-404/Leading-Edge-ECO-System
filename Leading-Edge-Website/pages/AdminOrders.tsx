import React, { useState, useRef } from 'react';
import { useShop } from '../context/ShopContext';
import { Order, CartItem, Product } from '../types';
import { Printer, ChevronDown, CheckCircle, XCircle, Search, Plus, User as UserIcon } from 'lucide-react';
import { CURRENCY } from '../constants';

const AdminOrders: React.FC = () => {
  const { orders, updateOrder, users, products, createOrder } = useShop();
  const [viewMode, setViewMode] = useState<'list' | 'create'>('list');
  
  // List View State
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filter, setFilter] = useState('All');
  
  // Create Order State
  const [newOrderStep, setNewOrderStep] = useState(1); // 1: User, 2: Products
  const [newOrderUserType, setNewOrderUserType] = useState<'existing' | 'new'>('existing');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [newCustomerDetails, setNewCustomerDetails] = useState({ name: '', email: '', phone: '', address: '' });
  const [orderItems, setOrderItems] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState('');

  const printRef = useRef<HTMLDivElement>(null);

  // Filtering Logic
  const filteredOrders = orders.filter(o => filter === 'All' ? true : o.paymentStatus === filter);
  const statusOptions = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

  const handlePrint = () => {
    const printContent = printRef.current;
    if (printContent) {
      const originalContents = document.body.innerHTML;
      document.body.innerHTML = printContent.innerHTML;
      window.print();
      document.body.innerHTML = originalContents;
      window.location.reload(); 
    }
  };

  // Create Order Logic
  const handleAddItem = (product: Product) => {
      setOrderItems(prev => {
          const exists = prev.find(p => p.id === product.id);
          if (exists) {
              return prev.map(p => p.id === product.id ? { ...p, quantity: p.quantity + 1 } : p);
          }
          return [...prev, { ...product, quantity: 1 }];
      });
  };

  const handleRemoveItem = (id: string) => {
      setOrderItems(prev => prev.filter(p => p.id !== id));
  };

  const calculateTotal = () => orderItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);

  const handleSubmitOrder = () => {
      let customerInfo;
      let userId = undefined;

      if (newOrderUserType === 'existing') {
          const user = users.find(u => u.id === selectedCustomer);
          if (!user) return alert('Please select a customer');
          customerInfo = {
              customerName: user.name,
              customerEmail: user.email,
              customerPhone: user.phone,
              shippingAddress: user.address || ''
          };
          userId = user.id;
      } else {
          if (!newCustomerDetails.name || !newCustomerDetails.email) return alert('Please fill customer details');
          customerInfo = {
              customerName: newCustomerDetails.name,
              customerEmail: newCustomerDetails.email,
              customerPhone: newCustomerDetails.phone,
              shippingAddress: newCustomerDetails.address
          };
      }

      if (orderItems.length === 0) return alert('Please add products');

      const subtotal = calculateTotal();
      const shipping = 100; // Flat rate for manual orders
      const total = subtotal + shipping;

      const newOrder: Order = {
          id: `ORD-${Date.now()}`,
          userId,
          ...customerInfo,
          date: new Date().toISOString().split('T')[0],
          items: orderItems,
          subtotal,
          shippingCost: shipping,
          tax: 0,
          total,
          status: 'Pending',
          paymentStatus: 'Unpaid'
      };

      createOrder(newOrder);
      setViewMode('list');
      setNewOrderStep(1);
      setOrderItems([]);
      alert('Order created successfully');
  };

  if (viewMode === 'create') {
      return (
          <div className="max-w-4xl mx-auto">
              <div className="flex justify-between items-center mb-8">
                  <h1 className="text-2xl font-bold">Create Manual Order</h1>
                  <button onClick={() => setViewMode('list')} className="text-gray-500 hover:text-gray-800">Cancel</button>
              </div>

              {/* Step 1: Customer Info */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <span className="bg-black text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                      Customer Details
                  </h3>
                  
                  <div className="flex gap-4 mb-4">
                      <button onClick={() => setNewOrderUserType('existing')} className={`flex-1 py-2 rounded border ${newOrderUserType === 'existing' ? 'bg-accent text-white border-accent' : 'border-gray-200'}`}>Existing Customer</button>
                      <button onClick={() => setNewOrderUserType('new')} className={`flex-1 py-2 rounded border ${newOrderUserType === 'new' ? 'bg-accent text-white border-accent' : 'border-gray-200'}`}>New Customer</button>
                  </div>

                  {newOrderUserType === 'existing' ? (
                      <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">Select Customer</label>
                          <select className="w-full border p-3 rounded bg-white" value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}>
                              <option value="">-- Select --</option>
                              {users.filter(u => u.role === 'customer').map(u => (
                                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                              ))}
                          </select>
                          {selectedCustomer && (
                              <div className="mt-4 p-4 bg-gray-50 rounded text-sm text-gray-600">
                                  {(() => {
                                      const u = users.find(user => user.id === selectedCustomer);
                                      return u ? <><p><strong>Phone:</strong> {u.phone}</p><p><strong>Address:</strong> {u.address}</p></> : null;
                                  })()}
                              </div>
                          )}
                      </div>
                  ) : (
                      <div className="grid grid-cols-2 gap-4">
                          <input placeholder="Full Name" className="border p-2 rounded" value={newCustomerDetails.name} onChange={e => setNewCustomerDetails({...newCustomerDetails, name: e.target.value})} />
                          <input placeholder="Email" className="border p-2 rounded" value={newCustomerDetails.email} onChange={e => setNewCustomerDetails({...newCustomerDetails, email: e.target.value})} />
                          <input placeholder="Phone" className="border p-2 rounded" value={newCustomerDetails.phone} onChange={e => setNewCustomerDetails({...newCustomerDetails, phone: e.target.value})} />
                          <input placeholder="Address" className="border p-2 rounded" value={newCustomerDetails.address} onChange={e => setNewCustomerDetails({...newCustomerDetails, address: e.target.value})} />
                      </div>
                  )}
              </div>

              {/* Step 2: Products */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <span className="bg-black text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                      Add Products
                  </h3>
                  
                  <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input 
                          className="w-full border pl-9 p-2 rounded" 
                          placeholder="Search product..." 
                          value={productSearch}
                          onChange={e => setProductSearch(e.target.value)}
                      />
                      {productSearch && (
                          <div className="absolute top-full left-0 right-0 bg-white border shadow-xl max-h-40 overflow-y-auto z-10">
                              {products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).map(p => (
                                  <div key={p.id} onClick={() => {handleAddItem(p); setProductSearch('');}} className="p-2 hover:bg-gray-50 cursor-pointer flex justify-between">
                                      <span>{p.name}</span>
                                      <span className="font-bold">{CURRENCY}{p.price}</span>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>

                  <div className="space-y-2">
                      {orderItems.map(item => (
                          <div key={item.id} className="flex justify-between items-center border-b pb-2">
                              <div>
                                  <p className="font-medium">{item.name}</p>
                                  <p className="text-xs text-gray-500">{CURRENCY}{item.price} x {item.quantity}</p>
                              </div>
                              <button onClick={() => handleRemoveItem(item.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><XCircle size={16}/></button>
                          </div>
                      ))}
                      {orderItems.length === 0 && <p className="text-gray-400 text-center py-4">No items added.</p>}
                  </div>
                  
                  <div className="mt-4 pt-4 border-t flex justify-between items-center font-bold text-lg">
                      <span>Total:</span>
                      <span>{CURRENCY}{calculateTotal() + 100}</span>
                  </div>
                  <p className="text-right text-xs text-gray-400">+ {CURRENCY}100 Shipping</p>
              </div>

              <div className="flex justify-end">
                  <button onClick={handleSubmitOrder} className="bg-green-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-green-700">Create Order</button>
              </div>
          </div>
      );
  }

  // LIST VIEW
  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
       {/* List */}
       <div className="w-1/3 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <div className="p-4 border-b">
             <div className="flex justify-between items-center mb-4">
                 <h2 className="font-bold text-lg">Orders</h2>
                 <button onClick={() => setViewMode('create')} className="bg-accent text-white p-2 rounded hover:bg-orange-600"><Plus size={20}/></button>
             </div>
             <div className="flex gap-2">
                {['All', 'Paid', 'Unpaid'].map(f => (
                   <button 
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`flex-1 py-2 text-sm font-medium rounded ${filter === f ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}
                   >
                      {f}
                   </button>
                ))}
             </div>
          </div>
          <div className="flex-1 overflow-y-auto">
             {filteredOrders.map(order => (
                <div 
                   key={order.id}
                   onClick={() => setSelectedOrder(order)}
                   className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${selectedOrder?.id === order.id ? 'bg-orange-50 border-l-4 border-l-accent' : ''}`}
                >
                   <div className="flex justify-between mb-1">
                      <span className="font-bold text-sm text-gray-800">#{order.id}</span>
                      <span className="text-xs text-gray-500">{order.date}</span>
                   </div>
                   <h3 className="text-sm font-medium text-gray-700">{order.customerName}</h3>
                   <div className="flex justify-between items-center mt-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${order.status === 'Delivered' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{order.status}</span>
                      <span className="font-bold text-sm">{CURRENCY}{order.total}</span>
                   </div>
                </div>
             ))}
          </div>
       </div>

       {/* Details */}
       <div className="w-2/3 bg-white rounded-xl shadow-sm border border-gray-200 overflow-y-auto p-8 relative">
          {selectedOrder ? (
             <div>
                <div className="flex justify-between items-start mb-8 border-b pb-6">
                   <div>
                      <h1 className="text-2xl font-bold mb-2">Order #{selectedOrder.id}</h1>
                      <div className="flex items-center gap-4">
                         <select 
                            className="border p-2 rounded text-sm font-medium"
                            value={selectedOrder.status}
                            onChange={e => {
                               const updated = { ...selectedOrder, status: e.target.value as any };
                               updateOrder(updated);
                               setSelectedOrder(updated);
                            }}
                         >
                            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                         </select>
                         <select 
                            className={`border p-2 rounded text-sm font-medium ${selectedOrder.paymentStatus === 'Paid' ? 'text-green-600 border-green-200 bg-green-50' : 'text-red-600 border-red-200 bg-red-50'}`}
                            value={selectedOrder.paymentStatus}
                            onChange={e => {
                               const updated = { ...selectedOrder, paymentStatus: e.target.value as any };
                               updateOrder(updated);
                               setSelectedOrder(updated);
                            }}
                         >
                            <option value="Paid">Paid</option>
                            <option value="Unpaid">Unpaid</option>
                         </select>
                      </div>
                   </div>
                   <button 
                      onClick={handlePrint} 
                      className="bg-gray-800 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-black"
                   >
                      <Printer size={16} /> Print Label
                   </button>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-8">
                   <div>
                      <h3 className="font-bold text-gray-500 text-xs uppercase tracking-wider mb-3">Customer</h3>
                      <p className="font-bold">{selectedOrder.customerName}</p>
                      <p>{selectedOrder.customerEmail}</p>
                      <p>{selectedOrder.customerPhone}</p>
                   </div>
                   <div>
                      <h3 className="font-bold text-gray-500 text-xs uppercase tracking-wider mb-3">Shipping Address</h3>
                      <p className="whitespace-pre-line text-gray-700">{selectedOrder.shippingAddress}</p>
                   </div>
                </div>

                <div className="border rounded-lg overflow-hidden mb-8">
                   <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 border-b">
                         <tr>
                            <th className="p-3">Item</th>
                            <th className="p-3">Qty</th>
                            <th className="p-3 text-right">Price</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y">
                         {selectedOrder.items.map((item, idx) => (
                            <tr key={idx}>
                               <td className="p-3">
                                  <div className="font-medium">{item.name}</div>
                                  <div className="text-xs text-gray-500">
                                     {item.selectedVariation && `${item.selectedVariation.type}: ${item.selectedVariation.value}`}
                                  </div>
                               </td>
                               <td className="p-3">{item.quantity}</td>
                               <td className="p-3 text-right">{CURRENCY}{item.price * item.quantity}</td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                   <div className="bg-gray-50 p-4 border-t">
                      <div className="flex justify-between mb-1"><span>Subtotal:</span><span>{CURRENCY}{selectedOrder.subtotal}</span></div>
                      <div className="flex justify-between mb-1"><span>Shipping:</span><span>{CURRENCY}{selectedOrder.shippingCost}</span></div>
                      <div className="flex justify-between font-bold text-lg pt-2 border-t"><span>Total:</span><span>{CURRENCY}{selectedOrder.total}</span></div>
                   </div>
                </div>

                {/* Hidden Print Template */}
                <div className="hidden">
                   <div ref={printRef} className="p-8 border-2 border-black max-w-[500px] mx-auto font-sans">
                      <div className="flex justify-between items-start mb-8 border-b-2 border-black pb-4">
                         <img src="/Logo/logo black.png" alt="Logo" className="h-12 object-contain" />
                         <div className="text-right">
                            <h2 className="font-bold text-xl uppercase">Shipping Label</h2>
                            <p className="font-mono">#{selectedOrder.id}</p>
                            <p className="text-sm">{selectedOrder.date}</p>
                         </div>
                      </div>
                      
                      <div className="mb-8">
                         <p className="text-xs font-bold uppercase text-gray-500 mb-1">Ship To:</p>
                         <h1 className="text-2xl font-bold">{selectedOrder.customerName}</h1>
                         <p className="text-lg">{selectedOrder.customerPhone}</p>
                         <p className="text-lg mt-2">{selectedOrder.shippingAddress}</p>
                      </div>

                      <div className="border-t-2 border-black pt-4 flex justify-between items-center">
                         <div>
                            <p className="font-bold">Total Weight:</p>
                            <p>{selectedOrder.items.reduce((sum, i) => sum + ((i.weight || 0) * i.quantity), 0)} kg</p>
                         </div>
                         <div>
                            <p className="font-bold">COD Amount:</p>
                            <p className="text-xl font-bold">{selectedOrder.paymentStatus === 'Unpaid' ? `${CURRENCY}${selectedOrder.total}` : 'PAID'}</p>
                         </div>
                      </div>
                      <div className="mt-8 text-center text-xs">
                         <p>Leading Edge Furniture | Dhaka, Bangladesh | +880 1700 000000</p>
                      </div>
                   </div>
                </div>
             </div>
          ) : (
             <div className="h-full flex items-center justify-center text-gray-400">Select an order to view details</div>
          )}
       </div>
    </div>
  );
};

export default AdminOrders;