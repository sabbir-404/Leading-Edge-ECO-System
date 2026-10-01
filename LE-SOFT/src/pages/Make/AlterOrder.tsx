import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, AlertCircle, CheckCircle, History, ChevronDown, Package } from 'lucide-react';

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

const CANONICAL_POST_PRODUCTION_STAGES = [
  'production on going',
  'primary qc',
  'color ongoing (oven)',
  'color ongoing',
  'qc final',
  'packaging',
  'ready to ship',
  'delivered',
  'in production',
  'welding',
  'painting',
  'ready for dispatch'
];

interface Order {
  id: number;
  order_number?: string;
  furniture_name: string;
  description: string;
  quantity: number;
  priority: string;
  delivery_date: string | null;
  status: string;
  current_stage?: string | null;
  designer_name: string;
  cost_price?: number;
  sale_price?: number;
  items?: Array<{
    id?: number;
    product_id?: number;
    product_name: string;
    quantity: number;
  }>;
}

interface AltLog {
  id: number;
  order_id?: number;
  order_number?: string;
  action_type?: string;
  field_name: string;
  old_value: string;
  new_value: string;
  altered_by: string;
  user_role: string;
  reason?: string;
  altered_at: string;
}

interface Props {
  order: Order;
  onClose: () => void;
  onSaved: () => void;
}

const AlterOrder: React.FC<Props> = ({ order, onClose, onSaved }) => {
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    order.items?.[0]?.product_id || null
  );
  const [furnitureName, setFurnitureName] = useState(order.furniture_name);
  const [description, setDescription] = useState(order.description || '');
  const [quantity, setQuantity] = useState(order.quantity || 1);
  const [priority, setPriority] = useState(order.priority || 'Normal');
  const [deliveryDate, setDeliveryDate] = useState(order.delivery_date || '');
  const [reason, setReason] = useState('');
  
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [log, setLog] = useState<AltLog[]>([]);
  const [showLog, setShowLog] = useState(false);

  const rawRole = (localStorage.getItem('user_role') || '').trim().toLowerCase();
  const userName = localStorage.getItem('user_name') || 'Unknown';
  const isAdmin = rawRole === 'admin' || rawRole === 'superadmin';
  const isSalesperson = rawRole === 'sales' || rawRole === 'salesman' || rawRole === 'salesperson';
  
  const effectiveStage = (order.current_stage || order.status || '').trim().toLowerCase();
  const isPostProduction = CANONICAL_POST_PRODUCTION_STAGES.includes(effectiveStage);

  // Locked conditions:
  // 1. Salesperson is always locked.
  // 2. Non-admins are locked once production has reached "Production On Going" or any later stage.
  const isBlocked = isSalesperson || (!isAdmin && isPostProduction);

  useEffect(() => {
    // Load catalog products for catalog selector
    // @ts-ignore
    if (window.electron?.makeGetCatalogProducts) {
      // @ts-ignore
      window.electron.makeGetCatalogProducts().then((res: any[]) => {
        if (Array.isArray(res)) setCatalogProducts(res);
      }).catch(console.error);
    }

    // Load audit log
    // @ts-ignore
    if (window.electron?.makeGetAlterationLog) {
      // @ts-ignore
      window.electron.makeGetAlterationLog(order.id)
        .then((data: any) => setLog(Array.isArray(data) ? data : []))
        .catch(() => setLog([]));
    }
  }, [order.id]);

  const handleSave = async () => {
    if (isBlocked) {
      setResult({
        type: 'error',
        msg: isSalesperson 
          ? 'Sales personnel cannot alter orders.' 
          : `Order is locked in ${order.status} stage. Only administrators can alter orders once production has started.`
      });
      return;
    }

    if (!furnitureName.trim()) {
      setResult({ type: 'error', msg: 'Product / Furniture name cannot be empty.' });
      return;
    }

    if (quantity < 1) {
      setResult({ type: 'error', msg: 'Quantity must be at least 1.' });
      return;
    }

    setSaving(true);
    setResult(null);
    try {
      // @ts-ignore
      const res = await window.electron.makeAlterOrder({
        orderId: order.id,
        changes: {
          furniture_name: furnitureName.trim(),
          description: description.trim(),
          quantity: Math.max(1, Math.floor(quantity)),
          priority,
          delivery_date: deliveryDate || null
        },
        items: [
          {
            product_id: selectedProductId || undefined,
            product_name: furnitureName.trim(),
            quantity: Math.max(1, Math.floor(quantity))
          }
        ],
        reason: reason.trim() || undefined,
        alteredBy: userName,
        userRole: rawRole,
      });

      if (res?.error) {
        setResult({ type: 'error', msg: res.error });
      } else {
        setResult({ type: 'success', msg: res?.message || 'Order updated successfully' });
        // @ts-ignore
        window.electron?.makeGetAlterationLog(order.id)
          .then((data: any) => setLog(Array.isArray(data) ? data : []))
          .catch(() => setLog([]));
        setTimeout(() => {
          onSaved();
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setResult({ type: 'error', msg: err?.message || 'Failed to save changes' });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: isBlocked ? 'var(--bg-secondary)' : 'var(--input-bg, #f5f5f5)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: isBlocked ? 'var(--text-secondary)' : 'var(--text-primary)',
    fontSize: '0.9rem',
    boxSizing: 'border-box',
    outline: 'none',
    cursor: isBlocked ? 'not-allowed' : 'text',
    opacity: isBlocked ? 0.7 : 1,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '5px',
    textTransform: 'uppercase',
    letterSpacing: '0.03em'
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="make-modal-container"
        style={{
          background: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '2rem',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.2)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
              Alter Order #{order.order_number || order.id}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Current stage: <strong style={{ color: 'var(--text-primary)' }}>{order.current_stage || order.status}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)' }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Locked / Permission Notice */}
        {isBlocked && (
          <div
            id="order-locked-notice"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#dc2626',
              fontSize: '0.875rem'
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>
              {isSalesperson ? (
                'Order editing is restricted. Sales personnel are not permitted to alter orders.'
              ) : (
                <>
                  Order is in <strong>{order.current_stage || order.status}</strong> stage (production active). Once production starts, only administrators may modify orders.
                </>
              )}
            </span>
          </div>
        )}

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                background: result.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${result.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                borderRadius: '10px',
                padding: '10px 14px',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: result.type === 'success' ? '#16a34a' : '#dc2626',
                fontSize: '0.875rem'
              }}
            >
              {result.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {result.msg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
          
          {/* Catalog Product Selector */}
          <div>
            <label style={labelStyle}>
              <Package size={13} style={{ display: 'inline', marginRight: '4px' }} />
              Catalog Product
            </label>
            <select
              value={selectedProductId || ''}
              onChange={e => {
                const pId = e.target.value ? Number(e.target.value) : null;
                setSelectedProductId(pId);
                if (pId) {
                  const p = catalogProducts.find(item => item.id === pId);
                  if (p) setFurnitureName(p.product_name);
                }
              }}
              disabled={isBlocked}
              style={{ ...inputStyle, marginBottom: '6px' }}
            >
              <option value="">-- Choose From Catalog or Keep Custom --</option>
              {catalogProducts.map(p => (
                <option key={p.id} value={p.id}>
                  {p.product_code ? `[${p.product_code}] ` : ''}{p.product_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Furniture / Product Name *</label>
            <input
              value={furnitureName}
              onChange={e => setFurnitureName(e.target.value)}
              disabled={isBlocked}
              placeholder="e.g. Executive Desk"
              required
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Description / Specifications</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              disabled={isBlocked}
              placeholder="Design details, finish notes, or customized changes..."
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Quantity *</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={isBlocked}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                disabled={isBlocked}
                style={{ ...inputStyle, appearance: 'none' }}
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Estimated Delivery Date</label>
            <input
              type="date"
              value={deliveryDate ? deliveryDate.slice(0, 10) : ''}
              onChange={e => setDeliveryDate(e.target.value)}
              disabled={isBlocked}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Modification Reason (Audit Context)</label>
            <input
              type="text"
              placeholder="e.g. Client requested quantity increase from 2 to 4"
              value={reason}
              onChange={e => setReason(e.target.value)}
              disabled={isBlocked}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '11px',
              background: 'var(--input-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
              color: 'var(--text-secondary)'
            }}
          >
            Cancel
          </button>
          <motion.button
            type="button"
            onClick={handleSave}
            disabled={saving || isBlocked}
            whileHover={{ scale: isBlocked ? 1 : 1.01 }}
            whileTap={{ scale: isBlocked ? 1 : 0.98 }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '11px',
              background: isBlocked ? '#9ca3af' : 'linear-gradient(135deg,#f97316,#ea580c)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: isBlocked ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '0.9rem',
              opacity: saving ? 0.7 : 1
            }}
          >
            <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
          </motion.button>
        </div>

        {/* Mandatory Alteration History Log */}
        <div>
          <button
            type="button"
            onClick={() => setShowLog(prev => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 0',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--text-secondary)'
            }}
          >
            <History size={15} /> Alteration History ({(log || []).length})
            <ChevronDown size={14} style={{ transform: showLog ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          <AnimatePresence>
            {showLog && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ overflow: 'hidden', marginTop: '8px' }}
              >
                {(log || []).length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '8px 0', opacity: 0.6 }}>
                    No alteration history logged for this order yet.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                    {(log || []).map(entry => (
                      <div
                        key={entry.id}
                        style={{
                          background: 'var(--bg-secondary)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          fontSize: '0.82rem',
                          border: '1px solid var(--border-color)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                            {entry.action_type ? `[${entry.action_type}] ` : ''}
                            {entry.field_name.replace(/_/g, ' ')}
                          </span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                            {new Date(entry.altered_at).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          <span style={{ color: '#ef4444' }}>{entry.old_value || '—'}</span>
                          {' → '}
                          <span style={{ color: '#22c55e', fontWeight: 600 }}>{entry.new_value || '—'}</span>
                        </div>
                        {entry.reason && (
                          <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '3px', fontSize: '0.75rem' }}>
                            Reason: {entry.reason}
                          </div>
                        )}
                        <div style={{ color: 'var(--text-secondary)', marginTop: '4px', fontSize: '0.72rem' }}>
                          by <strong>{entry.altered_by}</strong> ({entry.user_role || 'User'})
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
