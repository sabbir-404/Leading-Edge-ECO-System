import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { User, Order } from '../types';
import { Search, Mail, Phone, MapPin, Package, UserPlus, Edit, Save, X } from 'lucide-react';
import { CURRENCY } from '../constants';

const AdminUsers: React.FC = () => {
  const { users, orders, updateUser, addUser } = useShop();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [search, setSearch] = useState('');
  
  // Modes: 'view', 'edit', 'add'
  const [mode, setMode] = useState<'view' | 'edit' | 'add'>('view');
  
  // Form State
  const [formData, setFormData] = useState<User>({id:'', name:'', email:'', role:'customer', joinDate: '', phone: '', address: ''});

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const userOrders = selectedUser ? orders.filter(o => o.userId === selectedUser.id || o.customerEmail === selectedUser.email) : [];

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setMode('view');
  };

  const handleStartEdit = () => {
    if (selectedUser) {
        setFormData(selectedUser);
        setMode('edit');
    }
  };

  const handleStartAdd = () => {
      setFormData({
          id: '',
          name: '',
          email: '',
          role: 'customer',
          joinDate: new Date().toISOString().split('T')[0],
          phone: '',
          address: ''
      });
      setMode('add');
      setSelectedUser(null);
  };

  const handleSave = () => {
      if (mode === 'add') {
          const newUser = { ...formData, id: `u-${Date.now()}` };
          addUser(newUser);
          setSelectedUser(newUser);
      } else if (mode === 'edit') {
          updateUser(formData);
          setSelectedUser(formData);
      }
      setMode('view');
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      {/* User List */}
      <div className="w-1/3 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
        <div className="p-4 border-b">
           <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg">Users</h2>
              <button onClick={handleStartAdd} className="text-accent hover:bg-gray-100 p-2 rounded"><UserPlus size={20}/></button>
           </div>
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                className="w-full border rounded-lg pl-9 pr-4 py-2 text-sm" 
                placeholder="Search name or email..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
           </div>
        </div>
        <div className="flex-1 overflow-y-auto">
           {filteredUsers.map(user => (
             <div 
                key={user.id} 
                onClick={() => handleSelectUser(user)}
                className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${selectedUser?.id === user.id && mode !== 'add' ? 'bg-orange-50 border-l-4 border-l-accent' : ''}`}
             >
                <h3 className="font-bold text-gray-800">{user.name}</h3>
                <p className="text-xs text-gray-500">{user.email}</p>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded mt-2 inline-block ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>{user.role}</span>
             </div>
           ))}
        </div>
      </div>

      {/* User Details / Form */}
      <div className="w-2/3 bg-white rounded-xl shadow-sm border border-gray-200 overflow-y-auto p-8">
        
        {/* Form View (Edit/Add) */}
        {(mode === 'edit' || mode === 'add') && (
            <div className="max-w-xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">{mode === 'add' ? 'Add New User' : 'Edit User'}</h2>
                    <button onClick={() => setMode(selectedUser ? 'view' : 'add')} className="text-gray-500 hover:bg-gray-100 p-2 rounded"><X size={20}/></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Full Name</label>
                        <input className="w-full border p-3 rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                        <input className="w-full border p-3 rounded" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Phone</label>
                        <input className="w-full border p-3 rounded" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+880..." />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Address</label>
                        <textarea className="w-full border p-3 rounded h-24" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Role</label>
                        <select className="w-full border p-3 rounded bg-white" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as any})}>
                            <option value="customer">Customer</option>
                            <option value="moderator">Moderator</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <div className="flex gap-4 pt-4">
                        <button onClick={handleSave} className="flex-1 bg-accent text-white py-3 rounded font-bold flex items-center justify-center gap-2">
                            <Save size={18} /> Save User
                        </button>
                        <button onClick={() => setMode(selectedUser ? 'view' : 'add')} className="flex-1 bg-gray-200 text-gray-800 py-3 rounded font-bold">Cancel</button>
                    </div>
                </div>
            </div>
        )}

        {/* View Mode */}
        {mode === 'view' && selectedUser && (
          <div>
             <div className="flex justify-between items-start mb-8 border-b pb-6">
                <div>
                   <h1 className="text-3xl font-bold mb-1">{selectedUser.name}</h1>
                   <div className="flex items-center gap-4 text-gray-500 text-sm">
                      <span className="flex items-center gap-1"><Mail size={14}/> {selectedUser.email}</span>
                      <span className="flex items-center gap-1"><Phone size={14}/> {selectedUser.phone || 'N/A'}</span>
                   </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                   <button onClick={handleStartEdit} className="flex items-center gap-1 text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded font-medium">
                        <Edit size={14} /> Edit Profile
                   </button>
                   <span className="text-xs text-gray-400 mt-2">Joined: {selectedUser.joinDate}</span>
                </div>
             </div>

             <div className="grid grid-cols-2 gap-8 mb-8">
                <div className="bg-gray-50 p-6 rounded-lg">
                   <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2"><MapPin size={18}/> Address</h3>
                   <p className="text-gray-600 whitespace-pre-line">{selectedUser.address || 'No address provided.'}</p>
                </div>
                <div className="bg-gray-50 p-6 rounded-lg">
                   <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2"><Package size={18}/> Stats</h3>
                   <div className="flex justify-between text-sm">
                      <span>Total Orders:</span>
                      <span className="font-bold">{userOrders.length}</span>
                   </div>
                   <div className="flex justify-between text-sm mt-2">
                      <span>Total Spent:</span>
                      <span className="font-bold text-accent">{CURRENCY}{userOrders.reduce((sum, o) => sum + o.total, 0).toLocaleString()}</span>
                   </div>
                </div>
             </div>

             <h3 className="font-bold text-xl mb-4">Order History</h3>
             <table className="w-full text-left text-sm">
                <thead className="bg-gray-100">
                   <tr>
                      <th className="p-3 rounded-l">Order ID</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Total</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 rounded-r">Payment</th>
                   </tr>
                </thead>
                <tbody>
                   {userOrders.map(order => (
                      <tr key={order.id} className="border-b">
                         <td className="p-3 font-mono">{order.id}</td>
                         <td className="p-3">{order.date}</td>
                         <td className="p-3">{CURRENCY}{order.total}</td>
                         <td className="p-3"><span className="px-2 py-1 bg-gray-100 rounded-full text-xs">{order.status}</span></td>
                         <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs ${order.paymentStatus === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{order.paymentStatus}</span></td>
                      </tr>
                   ))}
                </tbody>
             </table>
             {userOrders.length === 0 && <p className="text-center text-gray-400 py-4">No orders found.</p>}
          </div>
        )}

        {/* Empty State */}
        {mode === 'view' && !selectedUser && (
          <div className="h-full flex items-center justify-center text-gray-400">Select a user to view details</div>
        )}
      </div>
    </div>
  );
};

export default AdminUsers;