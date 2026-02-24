import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, AlertCircle, CheckCircle, ChevronDown } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

const PlaceOrder: React.FC = () => {
  const [furnitureName, setFurnitureName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [priority, setPriority] = useState('Normal');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Autocomplete
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const designerName = localStorage.getItem('user_name') || 'Unknown';

  useEffect(() => {
    // @ts-ignore
    window.electron.getMakeFurnitureNames().then((names: string[]) => {
      setSuggestions(names || []);
    });
  }, []);

  const filtered = suggestions.filter(s => 
    s.toLowerCase().includes(furnitureName.toLowerCase()) && furnitureName.length > 0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!furnitureName.trim()) { setError('Furniture name is required'); return; }
    setLoading(true);
    setError('');
    try {
      // @ts-ignore
      await window.electron.createMakeOrder({
        furniture_name: furnitureName.trim(),
        description,
        quantity,
        designer_name: designerName,
        priority
      });
      setSuccess(true);
      setFurnitureName('');
      setDescription('');
      setQuantity(1);
      setPriority('Normal');
      // Refresh suggestions
      // @ts-ignore
      const names = await window.electron.getMakeFurnitureNames();
      setSuggestions(names || []);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError('Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    background: 'var(--input-bg, #f5f5f5)',
    border: '1px solid var(--border-color, #e0e0e0)',
    borderRadius: '10px',
    color: 'var(--text-primary)',
    fontSize: '0.95rem',
    boxSizing: 'border-box' as const,
    outline: 'none',
    transition: 'border-color 0.2s'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '6px'
  };

  return (
    <DashboardLayout title="Place Order">
      <div style={{ maxWidth: '700px', margin: '2rem auto', padding: '0 1.5rem' }}>
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '2rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={22} color="white" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>New Furniture Order</h2>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Designer: {designerName}</p>
            </div>
          </div>

          <AnimatePresence>
            {success && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '12px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontSize: '0.9rem' }}
              >
                <CheckCircle size={18} /> Order placed successfully!
              </motion.div>
            )}
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '12px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', fontSize: '0.9rem' }}
              >
                <AlertCircle size={18} /> {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Furniture Name with Autocomplete */}
            <div style={{ position: 'relative' }}>
              <label style={labelStyle}>Furniture Name *</label>
              <input
                ref={inputRef}
                type="text"
                placeholder="e.g. Office Chair Frame, Table Leg Set..."
                value={furnitureName}
                onChange={(e) => { setFurnitureName(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                style={inputStyle}
              />
              {showSuggestions && filtered.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: 'var(--card-bg)', border: '1px solid var(--border-color)',
                  borderRadius: '8px', marginTop: '4px', maxHeight: '160px', overflowY: 'auto',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
                }}>
                  {filtered.map((name, i) => (
                    <div key={i}
                      onMouseDown={() => { setFurnitureName(name); setShowSuggestions(false); }}
                      style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-primary)', borderBottom: i < filtered.length - 1 ? '1px solid var(--border-color)' : 'none' }}
                    >
                      {name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>Description / Notes</label>
              <textarea
                placeholder="Material specs, dimensions, finish type..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' as const }}
              />
            </div>

            {/* Quantity & Priority */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Priority</label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    style={{ ...inputStyle, appearance: 'none' as const, paddingRight: '36px' }}
                  >
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
                </div>
              </div>
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              style={{
                padding: '14px',
                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                marginTop: '0.5rem'
              }}
            >
              {loading ? 'Placing Order...' : 'Place Order'}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default PlaceOrder;
