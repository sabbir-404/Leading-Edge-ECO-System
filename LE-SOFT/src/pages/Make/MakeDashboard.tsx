import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ClipboardList, Clock, CheckCircle, Truck, Package, BarChart2, RefreshCw } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';

const STATUSES = ['Placed', 'In Production', 'Welding', 'Painting', 'Ready for Dispatch', 'Delivered'];
const statusColors: Record<string, string> = {
  'Placed': '#6b7280', 'In Production': '#3b82f6', 'Welding': '#f59e0b',
  'Painting': '#8b5cf6', 'Ready for Dispatch': '#10b981', 'Delivered': '#059669',
};
const priorityColors: Record<string, string> = {
  'Low': '#6b7280', 'Normal': '#3b82f6', 'High': '#f59e0b', 'Urgent': '#ef4444',
};

const StatCard = ({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) => (
  <motion.div whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
    style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'box-shadow 0.2s' }}>
    <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={22} color={color} />
    </div>
    <div>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px', fontWeight: 500 }}>{label}</div>
    </div>
  </motion.div>
);

const MakeDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      // @ts-ignore
      const data = await window.electron.makeGetDashboardStats();
      setStats(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStats(); }, []);

  const chipStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', padding: '3px 9px',
    borderRadius: '20px', background: `${color}18`, color, fontSize: '0.72rem', fontWeight: 600,
  });

  const barMax = stats ? Math.max(1, ...STATUSES.map(s => stats.byStatus?.[s] || 0)) : 1;

  return (
    <DashboardLayout title="Make Dashboard">
      <div style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Production Dashboard</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Overview of all Make orders</p>
          </div>
          <button onClick={fetchStats}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Loading...</div>
        ) : !stats ? null : (
          <>
            {/* Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <StatCard label="Total Orders" value={stats.total} icon={ClipboardList} color="#6366f1" />
              <StatCard label="Pending Orders" value={stats.pending} icon={Clock} color="#f59e0b" />
              <StatCard label="In Progress" value={stats.inProgress} icon={BarChart2} color="#3b82f6" />
              <StatCard label="Ready for Dispatch" value={stats.readyForDispatch} icon={Truck} color="#10b981" />
              <StatCard label="Delivered" value={stats.delivered} icon={CheckCircle} color="#059669" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
              {/* Orders by Status — bar chart */}
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1.25rem', fontSize: '0.95rem', fontWeight: 700 }}>Orders by Status</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {STATUSES.map(s => {
                    const count = stats.byStatus?.[s] || 0;
                    const pct = Math.round((count / barMax) * 100);
                    return (
                      <div key={s}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{s}</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: statusColors[s] }}>{count}</span>
                        </div>
                        <div style={{ height: '6px', borderRadius: '4px', background: 'var(--border-color)', overflow: 'hidden' }}>
                          <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.1, duration: 0.6 }}
                            style={{ height: '100%', borderRadius: '4px', background: statusColors[s] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pending Delivery list */}
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1.25rem', fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Package size={16} color="#10b981" /> Pending Delivery ({stats.pendingDelivery?.length || 0})
                </h3>
                {stats.pendingDelivery?.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0', opacity: 0.6 }}>No orders ready for dispatch</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
                    {stats.pendingDelivery.map((o: any) => (
                      <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(16,185,129,0.06)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{o.furniture_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>By {o.designer_name}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>DISPATCH READY</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{new Date(o.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent Orders */}
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Recent Orders</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      {['#', 'Furniture', 'Designer', 'Status', 'Priority', 'Date'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent.map((o: any, i: number) => (
                      <tr key={o.id} style={{ borderTop: '1px solid var(--border-color)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)' }}>
                        <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>#{o.id}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{o.furniture_name}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{o.designer_name}</td>
                        <td style={{ padding: '12px 16px' }}><span style={chipStyle(statusColors[o.status] || '#6b7280')}>{o.status}</span></td>
                        <td style={{ padding: '12px 16px' }}><span style={chipStyle(priorityColors[o.priority] || '#6b7280')}>{o.priority}</span></td>
                        <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{new Date(o.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stats.recent.length === 0 && (
                  <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', opacity: 0.6 }}>No orders yet</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MakeDashboard;
