import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { motion } from 'framer-motion';
import { Plus, Eye, Trash2, FileText } from 'lucide-react';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import './Quotation.css';

export default function QuotationList() {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQuotations = async () => {
    setLoading(true);
    try {
      // @ts-ignore
      const data = await window.electron?.getQuotations?.();
      setQuotations(data || []);
    } catch { } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQuotations(); }, []);

  useAutoRefresh(['quotations'], fetchQuotations);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this quotation? This cannot be undone.')) return;
    try {
      // @ts-ignore
      await window.electron?.deleteQuotation?.(id);
      setQuotations(prev => prev.filter(q => q.id !== id));
    } catch (e: any) { alert('Delete failed: ' + e.message); }
  };

  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

  const statusColors: Record<string, string> = {
    Draft: '#94a3b8',
    Sent: '#3b82f6',
    Accepted: '#10b981',
    Rejected: '#ef4444',
  };

  return (
    <DashboardLayout title="Quotations">
      <div className="quot-page">
        <div className="quot-topbar">
          <h1 className="quot-page-title">Quotations</h1>
          <button className="quot-btn-primary" onClick={() => navigate('/quotations/create')}>
            <Plus size={16} /> New Quotation
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Loading...</div>
        ) : quotations.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              textAlign: 'center', padding: '5rem', background: 'var(--bg-secondary)',
              borderRadius: 16, border: '1px solid var(--border-color)',
            }}
          >
            <FileText size={48} style={{ color: 'var(--text-secondary)', opacity: 0.4, marginBottom: '1rem' }} />
            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem' }}>No Quotations Yet</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Create your first quotation to send to customers.
            </p>
            <button className="quot-btn-primary" onClick={() => navigate('/quotations/create')}>
              <Plus size={16} /> Create Quotation
            </button>
          </motion.div>
        ) : (
          <div className="quot-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg, var(--input-bg))' }}>
                  {['Quote #', 'Customer', 'Date', 'Valid Until', 'Total (৳)', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: '0.85rem 1rem', textAlign: 'left',
                      fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.04em', color: 'var(--text-secondary)',
                      borderBottom: '1px solid var(--border-color)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotations.map((q, i) => (
                  <motion.tr
                    key={q.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.04 }}
                    style={{ borderBottom: '1px solid var(--border-color)' }}
                  >
                    <td style={{ padding: '0.9rem 1rem', fontWeight: 700, color: 'var(--accent-color)' }}>
                      {q.quote_number}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', color: 'var(--text-primary)' }}>
                      <div style={{ fontWeight: 600 }}>{q.customer_name}</div>
                      {q.company_name && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{q.company_name}</div>}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {formatDate(q.quote_date)}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {formatDate(q.valid_until)}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {(q.grand_total || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.9rem 1rem' }}>
                      <span style={{
                        padding: '0.2rem 0.7rem', borderRadius: 20,
                        fontSize: '0.78rem', fontWeight: 700,
                        background: (statusColors[q.status] || '#888') + '22',
                        color: statusColors[q.status] || '#888',
                      }}>
                        {q.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.9rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="quot-btn-secondary"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                          onClick={() => navigate(`/quotations/preview/${q.id}`)}
                          title="Preview / Print"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className="quot-remove-btn"
                          style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.3rem 0.55rem' }}
                          onClick={() => handleDelete(q.id)}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
