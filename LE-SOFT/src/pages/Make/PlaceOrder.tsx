import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, AlertCircle, CheckCircle, ChevronDown, Paperclip, X, FileText, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

interface Part {
  _tempId: string;
  part_name: string;
  length: string;
  width: string;
  height: string;
  notes: string;
}

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

  // PDF Files — staged before order creation
  const [stagedPdfs, setStagedPdfs] = useState<{ name: string; path: string }[]>([]);

  // Parts / Dimensions
  const [parts, setParts] = useState<Part[]>([]);

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

  // ── Parts helpers ──────────────────────────────────────────────────────────
  const addPart = () => {
    setParts(prev => [...prev, { _tempId: String(Date.now()), part_name: '', length: '', width: '', height: '', notes: '' }]);
  };

  const updatePart = (tempId: string, field: keyof Part, value: string) => {
    setParts(prev => prev.map(p => p._tempId === tempId ? { ...p, [field]: value } : p));
  };

  const removePart = (tempId: string) => {
    setParts(prev => prev.filter(p => p._tempId !== tempId));
  };

  const movePart = (index: number, direction: 'up' | 'down') => {
    setParts(prev => {
      const arr = [...prev];
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= arr.length) return arr;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  };

  // ── PDF staging (pick files, show names) ──────────────────────────────────
  const handlePickPdfs = async () => {
    // We pick PDFs locally and store paths; will upload after order creation
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.multiple = true;
    input.onchange = (e: any) => {
      const files: FileList = e.target.files;
      if (!files) return;
      const newFiles = Array.from(files).map(f => ({ name: f.name, path: (f as any).path || f.name }));
      setStagedPdfs(prev => [...prev, ...newFiles]);
    };
    input.click();
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!furnitureName.trim()) { setError('Furniture name is required'); return; }
    setLoading(true);
    setError('');
    try {
      // @ts-ignore
      const order = await window.electron.createMakeOrder({
        furniture_name: furnitureName.trim(),
        description,
        quantity,
        designer_name: designerName,
        priority
      });

      const orderId = order?.id;

      // Upload staged PDFs
      if (orderId && stagedPdfs.length > 0) {
        for (const pdf of stagedPdfs) {
          // @ts-ignore
          await window.electron.makeUploadPdf({ orderId, filePath: pdf.path });
        }
      }

      // Save parts
      if (orderId && parts.length > 0) {
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (!p.part_name.trim()) continue;
          // @ts-ignore
          await window.electron.makeUpsertPart({ order_id: orderId, part_name: p.part_name, length: p.length, width: p.width, height: p.height, notes: p.notes, sort_order: i });
        }
      }

      setSuccess(true);
      setFurnitureName(''); setDescription(''); setQuantity(1); setPriority('Normal');
      setStagedPdfs([]); setParts([]);
      // @ts-ignore
      const names = await window.electron.getMakeFurnitureNames();
      setSuggestions(names || []);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: 'var(--input-bg, #f5f5f5)', border: '1px solid var(--border-color, #e0e0e0)',
    borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.9rem',
    boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s'
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.82rem', fontWeight: 600,
    color: 'var(--text-secondary)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.03em'
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)',
    marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)'
  };

  return (
    <DashboardLayout title="Place Order">
      <div style={{ maxWidth: '780px', margin: '2rem auto', padding: '0 1.5rem' }}>
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '2rem' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.75rem' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={22} color="white" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>New Furniture Order</h2>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Designer: {designerName}</p>
            </div>
          </div>

          <AnimatePresence>
            {success && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '12px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontSize: '0.9rem' }}>
                <CheckCircle size={18} /> Order placed successfully!
              </motion.div>
            )}
            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '12px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', fontSize: '0.9rem' }}>
                <AlertCircle size={18} /> {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* ── Basic Info ─────────────────────────────────────────────── */}
            <div>
              <p style={sectionTitle}>Order Details</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Furniture Name with Autocomplete */}
                <div style={{ position: 'relative' }}>
                  <label style={labelStyle}>Furniture Name *</label>
                  <input ref={inputRef} type="text" placeholder="e.g. Office Chair Frame, Table Leg Set..."
                    value={furnitureName}
                    onChange={(e) => { setFurnitureName(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    style={inputStyle} />
                  {showSuggestions && filtered.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', marginTop: '4px', maxHeight: '160px', overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                      {filtered.map((name, i) => (
                        <div key={i} onMouseDown={() => { setFurnitureName(name); setShowSuggestions(false); }}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-primary)', borderBottom: i < filtered.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                          {name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label style={labelStyle}>Description / Notes</label>
                  <textarea placeholder="Material specs, finish type, special instructions..." value={description}
                    onChange={(e) => setDescription(e.target.value)} rows={3}
                    style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                {/* Quantity & Priority */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Quantity</label>
                    <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Priority</label>
                    <div style={{ position: 'relative' }}>
                      <select value={priority} onChange={(e) => setPriority(e.target.value)}
                        style={{ ...inputStyle, appearance: 'none', paddingRight: '36px' }}>
                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <ChevronDown size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── PDF Attachments ────────────────────────────────────────── */}
            <div>
              <p style={sectionTitle}>PDF Attachments</p>
              <button type="button" onClick={handlePickPdfs}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', background: 'var(--input-bg, #f5f5f5)', border: '1px dashed var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 500 }}>
                <Paperclip size={16} /> Attach PDF Files
              </button>
              {stagedPdfs.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {stagedPdfs.map((pdf, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: '8px' }}>
                      <FileText size={15} color="#f97316" />
                      <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdf.name}</span>
                      <button type="button" onClick={() => setStagedPdfs(prev => prev.filter((_, idx) => idx !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)' }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Parts & Dimensions ─────────────────────────────────────── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                <p style={{ ...sectionTitle, margin: 0, border: 'none', padding: 0 }}>Parts & Dimensions</p>
                <button type="button" onClick={addPart}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                  <Plus size={14} /> Add Part
                </button>
              </div>

              {parts.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '1rem 0', opacity: 0.6 }}>
                  No parts added. Click "Add Part" to specify individual component dimensions.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Column headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr auto', gap: '8px', paddingBottom: '6px' }}>
                    {['Part Name', 'Length', 'Width', 'Height', 'Notes', ''].map((h, i) => (
                      <span key={i} style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
                    ))}
                  </div>

                  {parts.map((part, index) => (
                    <motion.div key={part._tempId} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                      style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr auto', gap: '8px', alignItems: 'center' }}>
                      <input placeholder="e.g. Table Leg" value={part.part_name}
                        onChange={e => updatePart(part._tempId, 'part_name', e.target.value)}
                        style={{ ...inputStyle, padding: '8px 10px', fontSize: '0.85rem' }} />
                      <input placeholder="e.g. 80cm" value={part.length}
                        onChange={e => updatePart(part._tempId, 'length', e.target.value)}
                        style={{ ...inputStyle, padding: '8px 10px', fontSize: '0.85rem' }} />
                      <input placeholder="e.g. 4cm" value={part.width}
                        onChange={e => updatePart(part._tempId, 'width', e.target.value)}
                        style={{ ...inputStyle, padding: '8px 10px', fontSize: '0.85rem' }} />
                      <input placeholder="e.g. 4cm" value={part.height}
                        onChange={e => updatePart(part._tempId, 'height', e.target.value)}
                        style={{ ...inputStyle, padding: '8px 10px', fontSize: '0.85rem' }} />
                      <input placeholder="Notes..." value={part.notes}
                        onChange={e => updatePart(part._tempId, 'notes', e.target.value)}
                        style={{ ...inputStyle, padding: '8px 10px', fontSize: '0.85rem' }} />
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" onClick={() => movePart(index, 'up')} disabled={index === 0}
                          style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', opacity: index === 0 ? 0.3 : 0.6, color: 'var(--text-secondary)' }}>
                          <ArrowUp size={13} />
                        </button>
                        <button type="button" onClick={() => movePart(index, 'down')} disabled={index === parts.length - 1}
                          style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', opacity: index === parts.length - 1 ? 0.3 : 0.6, color: 'var(--text-secondary)' }}>
                          <ArrowDown size={13} />
                        </button>
                        <button type="button" onClick={() => removePart(part._tempId)}
                          style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: '#ef4444' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Submit ─────────────────────────────────────────────────── */}
            <motion.button type="submit" disabled={loading} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              style={{ padding: '14px', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Placing Order...' : 'Place Order'}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default PlaceOrder;
