import React from 'react';
import { useShop } from '../context/ShopContext';
import { ShoppingCart, Users, DollarSign, TrendingUp, Bell } from 'lucide-react';
import { CURRENCY } from '../constants';

const AdminDashboard: React.FC = () => {
  const { dashboardStats, orders } = useShop();

  // Simple CSS-based Bar Chart Component
  const SimpleBarChart = ({ data }: { data: { label: string; value: number }[] }) => {
    const maxValue = Math.max(...data.map(d => d.value));
    return (
      <div className="flex items-end gap-2 h-40 w-full mt-4">
        {data.map((item, idx) => (
          <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
             <div 
                className="w-full bg-accent/20 rounded-t-sm group-hover:bg-accent/40 transition-all relative"
                style={{ height: `${(item.value / maxValue) * 100}%` }}
             >
                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-xs px-2 py-1 rounded">
                    {item.value}
                </div>
             </div>
             <span className="text-[10px] text-gray-500 truncate w-full text-center">{item.label}</span>
          </div>
        ))}
      </div>
    );
  };

  const recentOrders = orders.slice(0, 5);

  return (
    <div className="space-y-8">
       {/* Stats Grid */}
       <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
             <div className="flex justify-between items-start mb-4">
                <div>
                   <p className="text-sm text-gray-500 font-medium">Total Orders (Month)</p>
                   <h3 className="text-2xl font-bold mt-1">{dashboardStats.totalOrdersMonth}</h3>
                </div>
                <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><ShoppingCart size={20} /></div>
             </div>
             <span className="text-xs text-green-600 font-medium">+12% from last month</span>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
             <div className="flex justify-between items-start mb-4">
                <div>
                   <p className="text-sm text-gray-500 font-medium">Revenue (Month)</p>
                   <h3 className="text-2xl font-bold mt-1">{CURRENCY}{dashboardStats.revenueMonth.toLocaleString()}</h3>
                </div>
                <div className="bg-green-50 p-2 rounded-lg text-green-600"><DollarSign size={20} /></div>
             </div>
             <span className="text-xs text-green-600 font-medium">+8% from last month</span>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
             <div className="flex justify-between items-start mb-4">
                <div>
                   <p className="text-sm text-gray-500 font-medium">Site Visits</p>
                   <h3 className="text-2xl font-bold mt-1">{dashboardStats.totalVisitsMonth.toLocaleString()}</h3>
                </div>
                <div className="bg-purple-50 p-2 rounded-lg text-purple-600"><Users size={20} /></div>
             </div>
             <span className="text-xs text-red-600 font-medium">-2% from last month</span>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
             <div className="flex justify-between items-start mb-4">
                <div>
                   <p className="text-sm text-gray-500 font-medium">Pending Orders</p>
                   <h3 className="text-2xl font-bold mt-1">{orders.filter(o => o.status === 'Pending').length}</h3>
                </div>
                <div className="bg-orange-50 p-2 rounded-lg text-orange-600"><Bell size={20} /></div>
             </div>
             <span className="text-xs text-gray-500 font-medium">Requires attention</span>
          </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Trending Products Chart */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
             <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg flex items-center gap-2"><TrendingUp size={20} className="text-accent"/> Trending Products</h3>
             </div>
             <SimpleBarChart data={dashboardStats.trendingProducts.map(p => ({ label: p.name, value: p.sales }))} />
          </div>

          {/* Activity Feed */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
             <h3 className="font-bold text-lg mb-6">Recent Activity</h3>
             <div className="space-y-4">
                {dashboardStats.recentActivity.map((activity, idx) => (
                   <div key={idx} className="flex items-start gap-3 text-sm pb-4 border-b last:border-0 border-gray-100">
                      <div className="w-2 h-2 rounded-full bg-accent mt-1.5 flex-shrink-0"></div>
                      <p className="text-gray-600">{activity}</p>
                   </div>
                ))}
             </div>
          </div>
       </div>

       {/* Recent Orders Table */}
       <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
             <h3 className="font-bold text-lg">Recent Orders</h3>
          </div>
          <table className="w-full text-left text-sm">
             <thead className="bg-gray-50">
                <tr>
                   <th className="p-4 font-bold text-gray-600">ID</th>
                   <th className="p-4 font-bold text-gray-600">Customer</th>
                   <th className="p-4 font-bold text-gray-600">Date</th>
                   <th className="p-4 font-bold text-gray-600">Amount</th>
                   <th className="p-4 font-bold text-gray-600">Status</th>
                </tr>
             </thead>
             <tbody className="divide-y">
                {recentOrders.map(order => (
                   <tr key={order.id} className="hover:bg-gray-50">
                      <td className="p-4 font-mono">{order.id}</td>
                      <td className="p-4 font-medium">{order.customerName}</td>
                      <td className="p-4 text-gray-500">{order.date}</td>
                      <td className="p-4 font-bold">{CURRENCY}{order.total}</td>
                      <td className="p-4">
                         <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            order.status === 'Delivered' ? 'bg-green-100 text-green-700' : 
                            order.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                         }`}>
                            {order.status}
                         </span>
                      </td>
                   </tr>
                ))}
             </tbody>
          </table>
       </div>
    </div>
  );
};

export default AdminDashboard;