import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardList, ChevronDown, ChevronUp, Clock, CheckCircle, Trash2, AlertCircle, Send } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';

const STATUSES = ['Placed', 'In Production', 'Welding', 'Painting', 'Ready for Dispatch', 'Delivered'];

const statusColors: Record<string, string> = {
  'Placed': '#6b7280',
  'In Production': '#3b82f6',
  'Welding': '#f59e0b',
  'Painting': '#8b5cf6',
  'Ready for Dispatch': '#10b981',
  'Delivered': '#059669',
};

const priorityColors: Record<string, string> = {
  'Low': '#6b7280',
  'Normal': '#3b82f6',
  'High': '#f59e0b',
  'Urgent': '#ef4444',
};

interface Order {
  id: number;
  furniture_name: string;
  description: string;
  quantity: number;
  designer_name: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

interface StatusUpdate {
  id: number;
  order_id: number;
  status: string;
  note: string;
  updated_by: string;
  created_at: string;
}

const TrackOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [updates, setUpdates] = useState<StatusUpdate[]>([]);
  const [statusFilter, setStatusFilter] = useState('All');

  // Update form
  const [newStatus, setNewStatus] = useState('');
  const [updateNote, setUpdateNote] = useState('');
  const [updating, setUpdating] = useState(false);

  const userRole = localStorage.getItem('user_role') || '';
  const userName = localStorage.getItem('user_name') || 'Unknown';

  const fetchOrders = async () => {
    try {
      // @ts-ignore
      const data = await window.electron.getMakeOrders();
      setOrders(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  const loadTimeline = async (orderId: number) => {
    if (expandedId === orderId) { setExpandedId(null); return; }
    setExpandedId(orderId);
    try {
      // @ts-ignore
      const data = await window.electron.getMakeOrderUpdates(orderId);
      setUpdates(data || []);
      const order = orders.find(o => o.id === orderId);
      if (order) {
        const currentIdx = STATUSES.indexOf(order.status);
        setNewStatus(currentIdx < STATUSES.length - 1 ? STATUSES[currentIdx + 1] : order.status);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (orderId: number) => {
    if (!newStatus) return;
    setUpdating(true);
    try {
      // @ts-ignore
      await window.electron.updateMakeOrderStatus({ orderId, status: newStatus, note: updateNote, updatedBy: userName });
      setUpdateNote('');
      await fetchOrders();
      // Refresh timeline
      // @ts-ignore
      const data = await window.electron.getMakeOrderUpdates(orderId);
      setUpdates(data || []);
      // Advance to next status
      const nextIdx = STATUSES.indexOf(newStatus);
      if (nextIdx < STATUSES.length - 1) setNewStatus(STATUSES[nextIdx + 1]);
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this order permanently?')) return;
    try {
      // @ts-ignore
      await window.electron.deleteMakeOrder(id);
      fetchOrders();
      if (expandedId === id) setExpandedId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = statusFilter === 'All' ? orders : orders.filter(o => o.status === statusFilter);

  const chipStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    padding: '4px 10px', borderRadius: '20px',
    background: `${color}18`, color, fontSize: '0.75rem', fontWeight: 600,
  });

  return (
    <DashboardLayout title="Track Orders">
      <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
        {/* Filter Bar */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {['All', ...STATUSES].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                fontSize: '0.8rem', fontWeight: 600,
                background: statusFilter === s ? 'var(--accent-color)' : 'var(--input-bg, #f0f0f0)',
                color: statusFilter === s ? 'white' : 'var(--text-secondary)',
                transition: 'all 0.15s'
              }}
            >
              {s} {s !== 'All' && `(${orders.filter(o => o.status === s).length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading orders...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <ClipboardList size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <p>No orders found</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filtered.map(order => (
              <motion.div
                key={order.id}
                layout
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  overflow: 'hidden'
                }}
              >
                {/* Order Row */}
                <div
                  onClick={() => loadTimeline(order.id)}
                  style={{
                    padding: '16px 20px',
                    display: 'flex', alignItems: 'center', gap: '16px',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                        {order.furniture_name}
                      </span>
                      <span style={chipStyle(statusColors[order.status] || '#6b7280')}>
                        {order.status}
                      </span>
                      <span style={chipStyle(priorityColors[order.priority] || '#6b7280')}>
                        {order.priority}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '16px' }}>
                      <span>Qty: {order.quantity}</span>
                      <span>By: {order.designer_name}</span>
                      <span>{new Date(order.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {userRole === 'admin' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(order.id); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--text-secondary)' }}
                      title="Delete order"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}

                  {expandedId === order.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>

                {/* Expanded: Timeline + Update */}
                <AnimatePresence>
                  {expandedId === order.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden', borderTop: '1px solid var(--border-color)' }}
                    >
                      <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        {/* Left: Timeline */}
                        <div>
                          <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>Status Timeline</h4>
                          {order.description && (
                            <div style={{ background: 'var(--input-bg, #f5f5f5)', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                              {order.description}
                            </div>
                          )}
                          <div style={{ position: 'relative', paddingLeft: '20px' }}>
                            {updates.map((upd, i) => (
                              <div key={upd.id} style={{ position: 'relative', paddingBottom: i < updates.length - 1 ? '16px' : '0', marginBottom: i < updates.length - 1 ? '0' : '0' }}>
                                {/* Line */}
                                {i < updates.length - 1 && (
                                  <div style={{ position: 'absolute', left: '-14px', top: '18px', width: '2px', height: 'calc(100%)', background: 'var(--border-color)' }} />
                                )}
                                {/* Dot */}
                                <div style={{
                                  position: 'absolute', left: '-18px', top: '4px',
                                  width: '10px', height: '10px', borderRadius: '50%',
                                  background: statusColors[upd.status] || '#6b7280',
                                  border: '2px solid var(--card-bg)'
                                }} />
                                <div>
                                  <span style={{ fontWeight: 600, fontSize: '0.85rem', color: statusColors[upd.status] || 'var(--text-primary)' }}>{upd.status}</span>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                    {upd.updated_by} • {new Date(upd.created_at).toLocaleString()}
                                  </div>
                                  {upd.note && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px', fontStyle: 'italic' }}>{upd.note}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Right: Update Status */}
                        <div>
                          <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>Update Status</h4>
                          {order.status === 'Delivered' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', fontSize: '0.9rem', padding: '12px', background: 'rgba(5,150,105,0.08)', borderRadius: '10px' }}>
                              <CheckCircle size={18} /> Order completed
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div style={{ position: 'relative' }}>
                                <select
                                  value={newStatus}
                                  onChange={(e) => setNewStatus(e.target.value)}
                                  style={{
                                    width: '100%', padding: '10px 14px', background: 'var(--input-bg, #f5f5f5)',
                                    border: '1px solid var(--border-color)', borderRadius: '8px',
                                    color: 'var(--text-primary)', fontSize: '0.9rem', appearance: 'none' as any, outline: 'none'
                                  }}
                                >
                                  {STATUSES.filter(s => STATUSES.indexOf(s) > STATUSES.indexOf(order.status)).map(s => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                                <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                              </div>
                              <textarea
                                placeholder="Add a note (optional)..."
                                value={updateNote}
                                onChange={(e) => setUpdateNote(e.target.value)}
                                rows={2}
                                style={{
                                  width: '100%', padding: '10px 14px', background: 'var(--input-bg, #f5f5f5)',
                                  border: '1px solid var(--border-color)', borderRadius: '8px',
                                  color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'none' as any, outline: 'none', boxSizing: 'border-box' as any
                                }}
                              />
                              <motion.button
                                onClick={() => handleUpdateStatus(order.id)}
                                disabled={updating}
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                  padding: '10px', background: statusColors[newStatus] || '#3b82f6',
                                  color: 'white', border: 'none', borderRadius: '8px',
                                  fontWeight: 600, fontSize: '0.85rem', cursor: updating ? 'not-allowed' : 'pointer',
                                  opacity: updating ? 0.7 : 1
                                }}
                              >
                                <Send size={14} /> {updating ? 'Updating...' : `Mark as ${newStatus}`}
                              </motion.button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default TrackOrders;
