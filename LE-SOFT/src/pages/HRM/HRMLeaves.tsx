import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { motion } from 'framer-motion';
import { Calendar, Search, Plus, Check, X, Clock } from 'lucide-react';

export default function HRMLeaves() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  
  const [formData, setFormData] = useState({
    employee_id: '',
    start_date: '',
    end_date: '',
    type: 'Casual',
    reason: ''
  });

  const fetchData = async () => {
    try {
      // @ts-ignore
      const emps = await window.electron.hrmGetEmployees();
      setEmployees(emps.filter((e: any) => e.status === 'Active') || []);
      
      // @ts-ignore
      const data = await window.electron.hrmGetLeaves();
      setLeaves(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employee_id) return alert('Select an employee');
    if (formData.start_date > formData.end_date) return alert('End date must be after start date');

    try {
      // @ts-ignore
      await window.electron.hrmRequestLeave({
        employee_id: parseInt(formData.employee_id),
        start_date: formData.start_date,
        end_date: formData.end_date,
        type: formData.type,
        reason: formData.reason
      });
      setShowModal(false);
      setFormData({ employee_id: '', start_date: '', end_date: '', type: 'Casual', reason: '' });
      fetchData();
    } catch (err) {
      alert('Failed to request leave');
    }
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      // @ts-ignore
      await window.electron.hrmUpdateLeaveStatus({ id, status });
      fetchData();
    } catch (err) {
      alert('Failed to update status');
    }
  };

  const filtered = leaves.filter(l => 
    l.employee?.name?.toLowerCase().includes(search.toLowerCase()) || 
    l.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout title="HRM - Leave Management">
      <div style={{ padding: '1rem 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Calendar size={24} style={{ color: 'var(--accent-color)' }} />
            <h1 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>Leave Requests</h1>
          </div>
          <button onClick={() => setShowModal(true)} className="action-button primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={16} /> Apply Leave
          </button>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by employee or leave type..."
              style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filtered.map((l, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              key={l.id} 
              style={{ background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                <div style={{ width: '200px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1.1rem' }}>{l.employee?.name}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Applied: {new Date(l.created_at).toLocaleDateString()}</div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                      {l.type}
                    </span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.9rem' }}>
                      {new Date(l.start_date).toLocaleDateString()} to {new Date(l.end_date).toLocaleDateString()}
                    </span>
                  </div>
                  {l.reason && <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic' }}>"{l.reason}"</div>}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {l.status === 'Pending' ? (
                  <>
                    <button onClick={() => updateStatus(l.id, 'Approved')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #10b981', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', cursor: 'pointer', fontWeight: 600 }}>
                      <Check size={16} /> Approve
                    </button>
                    <button onClick={() => updateStatus(l.id, 'Rejected')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}>
                      <X size={16} /> Reject
                    </button>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '20px', fontWeight: 600, fontSize: '0.9rem',
                    background: l.status === 'Approved' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    color: l.status === 'Approved' ? '#10b981' : '#ef4444'
                   }}>
                    {l.status === 'Approved' ? <Check size={16} /> : <X size={16} />} {l.status}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No leave requests found.</div>
          )}
        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-primary)', padding: '2rem', borderRadius: '12px', width: '450px', maxWidth: '90vw' }}>
            <h2 style={{ margin: '0 0 1.5rem 0', color: 'var(--text-primary)' }}>Apply for Leave</h2>
            <form onSubmit={handleApply} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Employee *</label>
                <select required value={formData.employee_id} onChange={e => setFormData({ ...formData, employee_id: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}>
                  <option value="">Select Employee...</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.designation})</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Start Date *</label>
                  <input type="date" required value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>End Date *</label>
                  <input type="date" required value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Leave Type *</label>
                <select required value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}>
                  <option value="Casual">Casual Leave</option>
                  <option value="Sick">Sick Leave</option>
                  <option value="Annual">Annual Leave</option>
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Reason</label>
                <textarea rows={3} value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', resize: 'none' }} />
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" className="action-button primary" style={{ padding: '0.5rem 1rem', borderRadius: '6px' }}>Submit Request</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
