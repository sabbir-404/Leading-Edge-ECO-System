import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { motion } from 'framer-motion';
import { Settings, Search, Plus, DollarSign, CheckCircle } from 'lucide-react';

export default function HRMPayroll() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    employee_id: '',
    basic_salary: 0,
    bonus: 0,
    deductions: 0
  });

  const fetchData = async () => {
    try {
      // @ts-ignore
      const emps = await window.electron.hrmGetEmployees();
      setEmployees(emps.filter((e: any) => e.status === 'Active') || []);
      
      // @ts-ignore
      const data = await window.electron.hrmGetPayroll({ month, year });
      setPayroll(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [month, year]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employee_id) return alert('Select an employee');

    try {
      // @ts-ignore
      await window.electron.hrmGeneratePayroll({
        employee_id: parseInt(formData.employee_id),
        month,
        year,
        basic_salary: formData.basic_salary,
        bonus: formData.bonus,
        deductions: formData.deductions
      });
      setShowModal(false);
      fetchData();
    } catch (err) {
      alert('Failed to generate payroll');
    }
  };

  const handleEmployeeSelect = (id: string) => {
    const emp = employees.find(e => e.id.toString() === id);
    setFormData({
      employee_id: id,
      basic_salary: emp?.basic_salary || 0,
      bonus: 0,
      deductions: 0
    });
  };

  const markPaid = async (id: number) => {
    if (!confirm('Mark this salary as paid?')) return;
    try {
      // @ts-ignore
      await window.electron.hrmMarkPayrollPaid(id);
      fetchData();
    } catch (err) {
      alert('Failed to mark as paid');
    }
  };

  const filtered = payroll.filter(p => 
    p.employee?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout title="HRM - Payroll Management">
      <div style={{ padding: '1rem 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <DollarSign size={24} style={{ color: 'var(--accent-color)' }} />
            <h1 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>Monthly Payroll</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select value={month} onChange={e => setMonth(parseInt(e.target.value))} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('default', { month: 'long' })}</option>
                ))}
              </select>
              <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} style={{ padding: '0.5rem', width: '80px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
            </div>
            <button onClick={() => { setFormData({ employee_id: '', basic_salary: 0, bonus: 0, deductions: 0 }); setShowModal(true); }} className="action-button primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings size={16} /> Generate slip
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ width: '400px', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search employee in payroll..."
              style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
              <tr>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Employee</th>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Basic</th>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Bonus</th>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Deductions</th>
                <th style={{ padding: '1rem', color: 'var(--text-primary)', fontWeight: 700 }}>Net Pay</th>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <motion.tr 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                  key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}
                >
                  <td style={{ padding: '1rem', fontWeight: 500, color: 'var(--text-primary)' }}>{p.employee?.name}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>৳{p.basic_salary?.toLocaleString()}</td>
                  <td style={{ padding: '1rem', color: '#10b981' }}>+ ৳{p.bonus?.toLocaleString()}</td>
                  <td style={{ padding: '1rem', color: '#ef4444' }}>- ৳{p.deductions?.toLocaleString()}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-primary)', fontWeight: 700, fontSize: '1.1rem' }}>৳{p.net_salary?.toLocaleString()}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ 
                      padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600,
                      background: p.status === 'Paid' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                      color: p.status === 'Paid' ? '#10b981' : '#f59e0b'
                    }}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {p.status === 'Pending' && (
                      <button onClick={() => markPaid(p.id)} style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 500 }}>
                        <CheckCircle size={14} /> Pay Now
                      </button>
                    )}
                    {p.status === 'Paid' && <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{new Date(p.payment_date).toLocaleDateString()}</span>}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No payroll generated for this month.</div>
          )}
        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-primary)', padding: '2rem', borderRadius: '12px', width: '450px', maxWidth: '90vw' }}>
            <h2 style={{ margin: '0 0 1.5rem 0', color: 'var(--text-primary)' }}>Generate Payroll</h2>
            <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Employee *</label>
                <select required value={formData.employee_id} onChange={e => handleEmployeeSelect(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}>
                  <option value="">Select Employee...</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Basic Salary (৳)</label>
                <input type="number" required value={formData.basic_salary} onChange={e => setFormData({ ...formData, basic_salary: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Bonus (৳)</label>
                  <input type="number" required value={formData.bonus} onChange={e => setFormData({ ...formData, bonus: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Deductions (৳)</label>
                  <input type="number" required value={formData.deductions} onChange={e => setFormData({ ...formData, deductions: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
                </div>
              </div>

              <div style={{ background: 'var(--input-bg)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Net Payable:</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  ৳{((formData.basic_salary || 0) + (formData.bonus || 0) - (formData.deductions || 0)).toLocaleString()}
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" className="action-button primary" style={{ padding: '0.5rem 1rem', borderRadius: '6px' }}>Generate Pay Slip</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
