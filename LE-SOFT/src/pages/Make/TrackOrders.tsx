import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardList, ChevronDown, ChevronUp, CheckCircle, Trash2, Send, FileText, Download, Eye, X, Edit2, Ruler } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import AlterOrder from './AlterOrder';

const STATUSES = ['Placed', 'In Production', 'Welding', 'Painting', 'Ready for Dispatch', 'Delivered'];

const statusColors: Record<string, string> = {
  'Placed': '#6b7280', 'In Production': '#3b82f6', 'Welding': '#f59e0b',
  'Painting': '#8b5cf6', 'Ready for Dispatch': '#10b981', 'Delivered': '#059669',
};
const priorityColors: Record<string, string> = {
  'Low': '#6b7280', 'Normal': '#3b82f6', 'High': '#f59e0b', 'Urgent': '#ef4444',
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
interface StatusUpdate { id: number; order_id: number; status: string; note: string; updated_by: string; created_at: string; }
interface PdfEntry { path: string; name: string; url: string; }
interface Part { id: number; part_name: string; length: string; width: string; height: string; notes: string; sort_order: number; }

const TrackOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [updates, setUpdates] = useState<StatusUpdate[]>([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [newStatus, setNewStatus] = useState('');
  const [updateNote, setUpdateNote] = useState('');
  const [updating, setUpdating] = useState(false);

  // PDFs
  const [pdfs, setPdfs] = useState<PdfEntry[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfViewer, setPdfViewer] = useState<PdfEntry | null>(null);

  // Parts
  const [parts, setParts] = useState<Part[]>([]);

  // Alter
  const [alterOrder, setAlterOrder] = useState<Order | null>(null);

  const userRole = localStorage.getItem('user_role') || '';
  const userName = localStorage.getItem('user_name') || 'Unknown';

  const fetchOrders = async () => {
    try {
      // @ts-ignore
      const data = await window.electron.getMakeOrders();
      setOrders(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchOrders(); }, []);

  const loadExpanded = async (orderId: number) => {
    if (expandedId === orderId) { setExpandedId(null); return; }
    setExpandedId(orderId);
    setPdfs([]); setParts([]);
    try {
      // @ts-ignore
      const [data, pdfData, partsData] = await Promise.all([
        // @ts-ignore
        window.electron.getMakeOrderUpdates(orderId),
        // @ts-ignore
        window.electron.makeGetPdfUrls(orderId),
        // @ts-ignore
        window.electron.makeGetOrderParts(orderId),
      ]);
      setUpdates(data || []);
      setPdfs(pdfData || []);
      setParts(partsData || []);
      const order = orders.find(o => o.id === orderId);
      if (order) {
        const currentIdx = STATUSES.indexOf(order.status);
        setNewStatus(currentIdx < STATUSES.length - 1 ? STATUSES[currentIdx + 1] : order.status);
      }
    } catch (e) { console.error(e); }
  };

  const handleUpdateStatus = async (orderId: number) => {
    if (!newStatus) return;
    setUpdating(true);
    try {
      // @ts-ignore
      await window.electron.updateMakeOrderStatus({ orderId, status: newStatus, note: updateNote, updatedBy: userName });
      setUpdateNote('');
      await fetchOrders();
      // @ts-ignore
      const data = await window.electron.getMakeOrderUpdates(orderId);
      setUpdates(data || []);
      const nextIdx = STATUSES.indexOf(newStatus);
      if (nextIdx < STATUSES.length - 1) setNewStatus(STATUSES[nextIdx + 1]);
    } catch (e) { console.error(e); }
    finally { setUpdating(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this order permanently?')) return;
    try {
      // @ts-ignore
      await window.electron.deleteMakeOrder(id);
      fetchOrders();
      if (expandedId === id) setExpandedId(null);
    } catch (e) { console.error(e); }
  };

  const handleUploadPdf = async (orderId: number) => {
    setPdfLoading(true);
    try {
      // @ts-ignore
      const res = await window.electron.makeUploadPdf({ orderId });
      if (!res?.canceled) {
        // @ts-ignore
        const pdfData = await window.electron.makeGetPdfUrls(orderId);
        setPdfs(pdfData || []);
      }
    } catch (e) { console.error(e); }
    finally { setPdfLoading(false); }
  };

  const handleDeletePdf = async (orderId: number, storagePath: string) => {
    if (!confirm('Remove this PDF?')) return;
    // @ts-ignore
    await window.electron.makeDeletePdf({ orderId, storagePath });
    // @ts-ignore
    const pdfData = await window.electron.makeGetPdfUrls(orderId);
    setPdfs(pdfData || []);
  };

  const handleDownloadPdf = async (pdf: PdfEntry) => {
    // @ts-ignore
    await window.electron.makeDownloadPdf({ url: pdf.url, fileName: pdf.name });
  };

  const canAlter = (order: Order) => {
    if (userRole === 'admin') return true;
    return ['Placed', 'In Production'].includes(order.status);
  };

  const filtered = statusFilter === 'All' ? orders : orders.filter(o => o.status === statusFilter);

  const chipStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    padding: '4px 10px', borderRadius: '20px', background: `${color}18`, color,
    fontSize: '0.75rem', fontWeight: 600,
  });

  const smallBtn = (color?: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px',
    background: color ? `${color}15` : 'var(--input-bg)', border: `1px solid ${color ? `${color}30` : 'var(--border-color)'}`,
    borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
    color: color || 'var(--text-secondary)',
  });

  return (
    <DashboardLayout title="Track Orders">
      <div style={{ padding: '1.5rem', maxWidth: '1050px', margin: '0 auto' }}>
        {/* Filter Bar */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {['All', ...STATUSES].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 600,
              background: statusFilter === s ? 'var(--accent-color)' : 'var(--input-bg, #f0f0f0)',
              color: statusFilter === s ? 'white' : 'var(--text-secondary)', transition: 'all 0.15s'
            }}>
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
              <motion.div key={order.id} layout
                style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                {/* Order Row */}
                <div onClick={() => loadExpanded(order.id)}
                  style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', transition: 'background 0.15s' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{order.furniture_name}</span>
                      <span style={chipStyle(statusColors[order.status] || '#6b7280')}>{order.status}</span>
                      <span style={chipStyle(priorityColors[order.priority] || '#6b7280')}>{order.priority}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '16px' }}>
                      <span>Qty: {order.quantity}</span>
                      <span>By: {order.designer_name}</span>
                      <span>{new Date(order.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                    {canAlter(order) && (
                      <button onClick={() => setAlterOrder(order)} style={smallBtn('#f97316')}>
                        <Edit2 size={13} /> Alter
                      </button>
                    )}
                    {userRole === 'admin' && (
                      <button onClick={() => handleDelete(order.id)} style={smallBtn('#ef4444')}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  {expandedId === order.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>

                {/* Expanded */}
                <AnimatePresence>
                  {expandedId === order.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden', borderTop: '1px solid var(--border-color)' }}>
                      <div style={{ padding: '20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

                          {/* Left: Timeline */}
                          <div>
                            <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 700 }}>Status Timeline</h4>
                            {order.description && (
                              <div style={{ background: 'var(--input-bg)', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {order.description}
                              </div>
                            )}
                            <div style={{ position: 'relative', paddingLeft: '20px' }}>
                              {updates.map((upd, i) => (
                                <div key={upd.id} style={{ position: 'relative', paddingBottom: i < updates.length - 1 ? '16px' : '0' }}>
                                  {i < updates.length - 1 && <div style={{ position: 'absolute', left: '-14px', top: '18px', width: '2px', height: 'calc(100%)', background: 'var(--border-color)' }} />}
                                  <div style={{ position: 'absolute', left: '-18px', top: '4px', width: '10px', height: '10px', borderRadius: '50%', background: statusColors[upd.status] || '#6b7280', border: '2px solid var(--card-bg)' }} />
                                  <div>
                                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: statusColors[upd.status] || 'var(--text-primary)' }}>{upd.status}</span>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{upd.updated_by} • {new Date(upd.created_at).toLocaleString()}</div>
                                    {upd.note && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px', fontStyle: 'italic' }}>{upd.note}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Right: Update Status */}
                          <div>
                            <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 700 }}>Update Status</h4>
                            {order.status === 'Delivered' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', fontSize: '0.9rem', padding: '12px', background: 'rgba(5,150,105,0.08)', borderRadius: '10px' }}>
                                <CheckCircle size={18} /> Order completed
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ position: 'relative' }}>
                                  <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                                    style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.9rem', appearance: 'none', outline: 'none' }}>
                                    {STATUSES.filter(s => STATUSES.indexOf(s) > STATUSES.indexOf(order.status)).map(s => (
                                      <option key={s} value={s}>{s}</option>
                                    ))}
                                  </select>
                                  <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                                </div>
                                <textarea placeholder="Add a note (optional)..." value={updateNote} onChange={(e) => setUpdateNote(e.target.value)} rows={2}
                                  style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
                                <motion.button onClick={() => handleUpdateStatus(order.id)} disabled={updating} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: statusColors[newStatus] || '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.85rem', cursor: updating ? 'not-allowed' : 'pointer', opacity: updating ? 0.7 : 1 }}>
                                  <Send size={14} /> {updating ? 'Updating...' : `Mark as ${newStatus}`}
                                </motion.button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Parts / Dimensions */}
                        {parts.length > 0 && (
                          <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                            <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Ruler size={15} /> Parts &amp; Dimensions
                            </h4>
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                  <tr style={{ background: 'var(--bg-secondary)' }}>
                                    {['Part Name', 'Length', 'Width', 'Height', 'Notes'].map(h => (
                                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {parts.map((p, i) => (
                                    <tr key={p.id} style={{ borderTop: '1px solid var(--border-color)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                                      <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{p.part_name}</td>
                                      <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{p.length || '—'}</td>
                                      <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{p.width || '—'}</td>
                                      <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{p.height || '—'}</td>
                                      <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontStyle: p.notes ? 'normal' : 'italic', opacity: p.notes ? 1 : 0.5 }}>{p.notes || 'No notes'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* PDF Attachments */}
                        <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <FileText size={15} /> PDF Attachments ({pdfs.length})
                            </h4>
                            <button onClick={() => handleUploadPdf(order.id)} disabled={pdfLoading}
                              style={{ ...smallBtn(), display: 'flex', alignItems: 'center', gap: '5px' }}>
                              {pdfLoading ? 'Uploading...' : '+ Attach PDF'}
                            </button>
                          </div>
                          {pdfs.length === 0 ? (
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', opacity: 0.6 }}>No PDFs attached to this order.</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {pdfs.map(pdf => (
                                <div key={pdf.path} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.18)', borderRadius: '8px' }}>
                                  <FileText size={15} color="#f97316" />
                                  <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdf.name}</span>
                                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                    <button onClick={() => setPdfViewer(pdf)} style={smallBtn('#3b82f6')} title="View PDF">
                                      <Eye size={13} /> View
                                    </button>
                                    <button onClick={() => handleDownloadPdf(pdf)} style={smallBtn('#10b981')} title="Download PDF">
                                      <Download size={13} /> Download
                                    </button>
                                    {userRole === 'admin' && (
                                      <button onClick={() => handleDeletePdf(order.id, pdf.path)} style={smallBtn('#ef4444')} title="Delete PDF">
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
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

      {/* PDF Viewer Modal */}
      <AnimatePresence>
        {pdfViewer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div style={{ width: '100%', maxWidth: '900px', background: 'var(--card-bg)', borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '90vh' }}>
              {/* Viewer header */}
              <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} color="#f97316" />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{pdfViewer.name}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleDownloadPdf(pdfViewer)} style={smallBtn('#10b981')}>
                    <Download size={14} /> Download
                  </button>
                  <button onClick={() => setPdfViewer(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)' }}>
                    <X size={20} />
                  </button>
                </div>
              </div>
              {/* PDF embed */}
              <iframe src={pdfViewer.url} title={pdfViewer.name}
                style={{ flex: 1, border: 'none', width: '100%', background: '#525659' }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AlterOrder Modal */}
      <AnimatePresence>
        {alterOrder && (
          <AlterOrder key={alterOrder.id} order={alterOrder} onClose={() => setAlterOrder(null)} onSaved={fetchOrders} />
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
};

export default TrackOrders;
