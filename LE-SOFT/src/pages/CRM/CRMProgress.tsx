import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { motion } from 'framer-motion';
import { Target, Search, Plus, Calendar, Clock, User, MessageSquare } from 'lucide-react';

const STAGES = ['Lead', 'Contacted', 'Proposal', 'Negotiation', 'Converted', 'Lost'];

export default function CRMProgress() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  
  const [showLogModal, setShowLogModal] = useState(false);
  const [formData, setFormData] = useState({
    stage: 'Contacted',
    notes: '',
    next_follow_up: ''
  });

  const userId = parseInt(localStorage.getItem('user_id') || '0');

  useEffect(() => {
    // @ts-ignore
    window.electron.crmGetCustomers().then(data => setCustomers(data || []));
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      // @ts-ignore
      window.electron.crmGetTrackingLogs({ customerId: selectedCustomerId }).then(data => setLogs(data || []));
    } else {
      setLogs([]);
    }
  }, [selectedCustomerId]);

  const handleSaveLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    try {
      // @ts-ignore
      await window.electron.crmAddTrackingLog({
        customer_id: selectedCustomerId,
        user_id: userId,
        ...formData
      });
      setShowLogModal(false);
      setFormData({ stage: 'Contacted', notes: '', next_follow_up: '' });
      // Refresh logs
      // @ts-ignore
      const newLogs = await window.electron.crmGetTrackingLogs({ customerId: selectedCustomerId });
      setLogs(newLogs);
    } catch (err) {
      console.error(err);
      alert('Failed to save log');
    }
  };

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.company && c.company.toLowerCase().includes(search.toLowerCase()))
  );

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  return (
    <DashboardLayout title="CRM - Progress Tracking">
      <div style={{ padding: '1rem 2rem', display: 'flex', gap: '2rem', height: 'calc(100vh - 100px)' }}>
        
        {/* Left Sidebar: Customer List */}
        <div style={{ width: '350px', display: 'flex', flexDirection: 'column', gap: '1rem', borderRight: '1px solid var(--border-color)', paddingRight: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <Target size={24} style={{ color: 'var(--accent-color)' }} />
            <h1 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>Tracking</h1>
          </div>
          
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search customers..."
              style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
            />
          </div>

          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.5rem' }}>
            {filtered.map(c => (
              <div 
                key={c.id} 
                onClick={() => setSelectedCustomerId(c.id)}
                style={{ 
                  padding: '1rem', borderRadius: '8px', cursor: 'pointer',
                  background: selectedCustomerId === c.id ? 'var(--hover-bg)' : 'transparent',
                  border: `1px solid ${selectedCustomerId === c.id ? 'var(--accent-color)' : 'var(--border-color)'}`
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                {c.company && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{c.company}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Right Content: Customer Logs */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {selectedCustomer ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <h2 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>{selectedCustomer.name}</h2>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Tracking interactions and deal progress.</div>
                </div>
                <button onClick={() => setShowLogModal(true)} className="action-button primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Plus size={16} /> Log Interaction
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '1rem' }}>
                {logs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>No interactions logged yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {logs.map((log, i) => (
                      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} key={log.id} style={{ display: 'flex', gap: '1.5rem' }}>
                        
                        {/* Timeline node */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--accent-color)', marginTop: '0.4rem' }}></div>
                          {i !== logs.length - 1 && <div style={{ width: '2px', flex: 1, background: 'var(--border-color)', margin: '0.5rem 0' }}></div>}
                        </div>
                        
                        {/* Log Content */}
                        <div style={{ flex: 1, background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              <span style={{ padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                                {log.stage}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                <User size={14} /> {log.user?.full_name || 'System'}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              <Clock size={14} /> {new Date(log.created_at).toLocaleString()}
                            </div>
                          </div>
                          
                          {log.notes && (
                            <div style={{ color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1rem', whiteSpace: 'pre-wrap' }}>
                              {log.notes}
                            </div>
                          )}

                          {log.next_follow_up && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', fontSize: '0.85rem', fontWeight: 500 }}>
                              <Calendar size={14} /> Next Follow-up: {new Date(log.next_follow_up).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              Select a customer from the left to view their tracking timeline.
            </div>
          )}
        </div>
      </div>

      {showLogModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-primary)', padding: '2rem', borderRadius: '12px', width: '500px', maxWidth: '90vw' }}>
            <h2 style={{ margin: '0 0 1.5rem 0', color: 'var(--text-primary)' }}>Log Interaction</h2>
            <form onSubmit={handleSaveLog} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Current Stage</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {STAGES.map(s => (
                    <div 
                      key={s} onClick={() => setFormData({ ...formData, stage: s })}
                      style={{ 
                        padding: '0.5rem 1rem', borderRadius: '20px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500,
                        background: formData.stage === s ? 'var(--accent-color)' : 'var(--input-bg)',
                        color: formData.stage === s ? 'white' : 'var(--text-primary)',
                        border: `1px solid ${formData.stage === s ? 'var(--accent-color)' : 'var(--border-color)'}`
                      }}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><MessageSquare size={16} />Interaction Notes</div>
                </label>
                <textarea 
                  required rows={4} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} 
                  placeholder="What was discussed? What are the next steps?"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', resize: 'vertical' }} 
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Calendar size={16} />Next Follow-up Date (Optional)</div>
                </label>
                <input 
                  type="date" value={formData.next_follow_up} onChange={e => setFormData({ ...formData, next_follow_up: e.target.value })} 
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setShowLogModal(false)} style={{ padding: '0.5rem 1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
                <button type="submit" className="action-button primary" style={{ padding: '0.5rem 1.5rem', borderRadius: '8px', fontWeight: 500 }}>Save Log</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
