import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { motion } from 'framer-motion';
import { Users, Search, Plus, Edit2, Phone, Mail, Building } from 'lucide-react';

export default function CRMDirectory() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    address: '',
    crm_interested_products: '',
    crm_state: 'Lead',
    crm_next_appointment: '',
    crm_description: ''
  });

  const fetchCustomers = async () => {
    try {
      // @ts-ignore
      const data = await window.electron.crmGetCustomers();
      setCustomers(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // @ts-ignore
      await window.electron.crmUpsertCustomer({ ...formData, id: editingId });
      setShowModal(false);
      fetchCustomers();
    } catch (err) {
      console.error(err);
      alert('Failed to save customer');
    }
  };

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setFormData({
      name: c.name,
      company: c.company || '',
      email: c.email || '',
      phone: c.phone || '',
      address: c.address || '',
      crm_interested_products: c.crm_interested_products || '',
      crm_state: c.crm_state || 'Lead',
      crm_next_appointment: c.crm_next_appointment ? new Date(c.crm_next_appointment).toISOString().split('T')[0] : '',
      crm_description: c.crm_description || ''
    });
    setShowModal(true);
  };

  const openNew = () => {
    setEditingId(null);
    setFormData({ 
      name: '', company: '', email: '', phone: '', address: '',
      crm_interested_products: '', crm_state: 'Lead', crm_next_appointment: '', crm_description: ''
    });
    setShowModal(true);
  };

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.company && c.company.toLowerCase().includes(search.toLowerCase())) ||
    (c.phone && c.phone.includes(search))
  );

  return (
    <DashboardLayout title="CRM - Customer Directory">
      <div style={{ padding: '1rem 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Users size={24} style={{ color: 'var(--accent-color)' }} />
            <h1 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>Customer Directory</h1>
          </div>
          <button onClick={openNew} className="action-button primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={16} /> New Customer
          </button>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, company, or phone..."
              style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {filtered.map((c, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              key={c.id} 
              style={{ background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', position: 'relative' }}
            >
              <button 
                onClick={() => openEdit(c)}
                style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <Edit2 size={16} />
              </button>
              <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 600 }}>{c.name}</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: '12px', background: 'var(--accent-color)', color: 'white' }}>{c.crm_state || 'Lead'}</span>
                {(c.total_bills > 0) && (
                  <span style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: '12px', background: 'var(--success-color, #10b981)', color: 'white' }}>Sale Made</span>
                )}
                {c.crm_next_appointment && (
                  <span style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.2)', color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Next Appt: {new Date(c.crm_next_appointment).toLocaleDateString()}
                  </span>
                )}
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                {c.company && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Building size={14} /> {c.company}</div>}
                {c.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Phone size={14} /> {c.phone}</div>}
                {c.email && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Mail size={14} /> {c.email}</div>}
                {c.crm_interested_products && <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', padding: '0.5rem', background: 'var(--bg-primary)', borderRadius: '6px' }}><strong>Interests</strong>: {c.crm_interested_products}</div>}
              </div>
            </motion.div>
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              No customers found.
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '2rem 0' }}>
          <div style={{ background: 'var(--bg-primary)', padding: '2rem', borderRadius: '12px', width: '500px', maxWidth: '90vw', margin: 'auto' }}>
            <h2 style={{ margin: '0 0 1.5rem 0', color: 'var(--text-primary)' }}>{editingId ? 'Edit Customer' : 'Add Customer'}</h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Full Name *</label>
                <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Company</label>
                <input value={formData.company} onChange={e => setFormData({ ...formData, company: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Phone</label>
                  <input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Email</label>
                  <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Address</label>
                <textarea rows={2} value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', resize: 'none' }} />
              </div>

              {/* NEW CRM FIELDS */}
              <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Current State</label>
                      <select value={formData.crm_state} onChange={e => setFormData({ ...formData, crm_state: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}>
                          <option value="Lead">Lead</option>
                          <option value="Interested">Interested</option>
                          <option value="Will Contact">Will Contact</option>
                          <option value="Converted">Converted</option>
                          <option value="Lost">Lost</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Next Appointment</label>
                      <input type="date" value={formData.crm_next_appointment} onChange={e => setFormData({ ...formData, crm_next_appointment: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
                    </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Interested Products</label>
                  <input placeholder="e.g. Executive Chair, Desk" value={formData.crm_interested_products} onChange={e => setFormData({ ...formData, crm_interested_products: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Brief Description</label>
                  <textarea rows={2} placeholder="Customer requirements..." value={formData.crm_description} onChange={e => setFormData({ ...formData, crm_description: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', resize: 'none' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" className="action-button primary" style={{ padding: '0.5rem 1rem', borderRadius: '6px' }}>Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
