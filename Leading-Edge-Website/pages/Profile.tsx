import React, { useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useShop } from '../context/ShopContext';
import { useNavigate } from 'react-router-dom';
import { Download, Package, User as UserIcon } from 'lucide-react';
import { CURRENCY } from '../constants';

const Profile: React.FC = () => {
  const { user, orders, logout } = useShop();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) navigate('/login');
  }, [user, navigate]);

  const downloadPDF = (orderId: string) => {
    alert(`Downloading Invoice PDF for Order #${orderId}...`);
    // In a real app, this would trigger a backend generation or use jsPDF
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex flex-col md:flex-row gap-8">
          
          {/* Sidebar */}
          <div className="w-full md:w-1/4">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-center">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                <UserIcon size={40} />
              </div>
              <h2 className="text-xl font-bold">{user.name}</h2>
              <p className="text-gray-500 text-sm mb-6">{user.email}</p>
              <button onClick={logout} className="text-red-500 font-medium text-sm hover:underline">Sign Out</button>
            </div>
          </div>

          {/* Content */}
          <div className="w-full md:w-3/4 space-y-8">
             <h2 className="text-2xl font-serif font-bold">Order History</h2>
             
             {orders.length === 0 ? (
               <div className="bg-white p-12 rounded-xl border border-gray-100 text-center text-gray-500">
                 No orders found.
               </div>
             ) : (
               orders.map(order => (
                 <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                   <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                     <div>
                       <span className="font-bold text-primary">Order #{order.id}</span>
                       <span className="text-sm text-gray-500 ml-4">{order.date}</span>
                     </div>
                     <button 
                       onClick={() => downloadPDF(order.id)}
                       className="flex items-center text-sm text-accent hover:text-orange-700 font-medium"
                      >
                       <Download size={16} className="mr-1" /> Invoice
                     </button>
                   </div>
                   <div className="p-6">
                     {order.items.map((item, idx) => (
                       <div key={idx} className="flex gap-4 mb-4 last:mb-0">
                         <img src={item.image} className="w-16 h-16 object-cover rounded bg-gray-100" />
                         <div>
                           <h4 className="font-medium">{item.name}</h4>
                           <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                         </div>
                         <div className="ml-auto font-medium">{CURRENCY}{item.price}</div>
                       </div>
                     ))}
                     <div className="border-t border-gray-100 mt-4 pt-4 flex justify-between items-center">
                       <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                         <Package size={16} /> {order.status}
                       </div>
                       <div className="text-lg font-bold">Total: {CURRENCY}{order.total}</div>
                     </div>
                   </div>
                 </div>
               ))
             )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Profile;