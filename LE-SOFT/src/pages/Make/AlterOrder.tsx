import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, AlertCircle, CheckCircle, History, ChevronDown } from 'lucide-react';

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
const RESTRICTED_STATUSES = ['Welding', 'Painting', 'Ready for Dispatch', 'Delivered'];

interface Order {
  id: number;
  furniture_name: string;
  description: string;
  quantity: number;
  priority: string;
  status: string;
  designer_name: string;
}

interface AltLog {
  id: number;
  field_name: string;
  old_value: string;
  new_value: string;
  altered_by: string;
  user_role: string;
  altered_at: string;
}

interface Props {
  order: Order;
  onClose: () => void;
  onSaved: () => void;
}

const AlterOrder: React.FC<Props> = ({ order, onClose, onSaved }) => {
  const [furnitureName, setFurnitureName] = useState(order.furniture_name);
  const [description, setDescription] = useState(order.description || '');
  const [quantity, setQuantity] = useState(order.quantity);
  const [priority, setPriority] = useState(order.priority);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [log, setLog] = useState<AltLog[]>([]);
  const [showLog, setShowLog] = useState(false);

  const userName = localStorage.getItem('user_name') || 'Unknown';
  const userRole = localStorage.getItem('user_role') || '';
  const isAdmin = userRole === 'admin';
  const isBlocked = !isAdmin && RESTRICTED_STATUSES.includes(order.status);

  useEffect(() => {
    // @ts-ignore
    window.electron.makeGetAlterationLog(order.id).then(setLog).catch(() => {});
  }, [order.id]);

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      // @ts-ignore
      const res = await window.electron.makeAlterOrder({
        orderId: order.id,
        changes: { furniture_name: furnitureName.trim(), description, quantity, priority },
        alteredBy: userName,
        userRole,
      });
      if (res?.error) { setResult({ type: 'error', msg: res.error }); }
      else {
        setResult({ type: 'success', msg: res?.message || 'Order updated successfully' });
        // @ts-ignore
        window.electron.makeGetAlterationLog(order.id).then(setLog).catch(() => {});
        setTimeout(() => { onSaved(); onClose(); }, 1200);
      }
    } catch { setResult({ type: 'error', msg: 'Failed to save changes' }); }
    finally { setSaving(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: isBlocked ? 'var(--bg-secondary)' : 'var(--input-bg, #f5f5f5)',
    border: '1px solid var(--border-color)', borderRadius: '8px', color: isBlocked ? 'var(--text-secondary)' : 'var(--text-primary)',
    fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none', cursor: isBlocked ? 'not-allowed' : 'text', opacity: isBlocked ? 0.7 : 1,
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.03em' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Alter Order #{order.id}</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Current status: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{order.status}</span>
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Blocked notice */}
        {isBlocked && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '12px 14px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', fontSize: '0.875rem' }}>
            <AlertCircle size={16} />
            <span>Order is in <strong>{order.status}</strong> stage. Only admins can make changes at this point.</span>
          </div>
        )}

        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              style={{ background: result.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${result.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: '10px', padding: '10px 14px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', color: result.type === 'success' ? '#16a34a' : '#dc2626', fontSize: '0.875rem' }}>
              {result.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />} {result.msg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <label style={labelStyle}>Furniture Name</label>
            <input value={furnitureName} onChange={e => setFurnitureName(e.target.value)} disabled={isBlocked} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Description / Notes</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} disabled={isBlocked}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Quantity</label>
              <input type="number" min={1} value={quantity} onChange={e => setQuantity(Number(e.target.value))} disabled={isBlocked} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} disabled={isBlocked}
                style={{ ...inputStyle, appearance: 'none' }}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
          <motion.button onClick={handleSave} disabled={saving || isBlocked} whileHover={{ scale: isBlocked ? 1 : 1.01 }} whileTap={{ scale: 0.98 }}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '11px', background: isBlocked ? '#9ca3af' : 'linear-gradient(135deg,#f97316,#ea580c)', color: 'white', border: 'none', borderRadius: '10px', cursor: isBlocked ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.9rem', opacity: saving ? 0.7 : 1 }}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
          </motion.button>
        </div>

        {/* Alteration History */}
        <div>
          <button onClick={() => setShowLog(prev => !prev)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            <History size={15} /> Alteration History ({log.length})
            <ChevronDown size={14} style={{ transform: showLog ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          <AnimatePresence>
            {showLog && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                style={{ overflow: 'hidden', marginTop: '8px' }}>
                {log.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '8px 0', opacity: 0.6 }}>No alteration history yet</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                    {log.map(entry => (
                      <div key={entry.id} style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '10px 12px', fontSize: '0.82rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{entry.field_name.replace(/_/g, ' ')}</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{new Date(entry.altered_at).toLocaleString()}</span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          <span style={{ color: '#ef4444' }}>{entry.old_value || '—'}</span>
                          {' → '}
                          <span style={{ color: '#22c55e' }}>{entry.new_value || '—'}</span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', marginTop: '3px', fontSize: '0.75rem' }}>
                          by <strong>{entry.altered_by}</strong> ({entry.user_role})
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default AlterOrder;
