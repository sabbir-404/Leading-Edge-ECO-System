import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, X, FileText } from 'lucide-react';
import '../Accounting/Masters/Masters.css';

import DashboardLayout from '../../components/DashboardLayout';

interface CustomPage {
  id: string;
  slug: string;
  title: string;
  content: any[]; // JSON content blocks or html
}

const WebsitePages: React.FC = () => {
  const [pages, setPages] = useState<CustomPage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<CustomPage | null>(null);

  const [formData, setFormData] = useState<CustomPage>({
    id: '',
    slug: '',
    title: '',
    content: []
  });
  
  // Simplified text content state for this demo editor
  const [textContent, setTextContent] = useState('');

  useEffect(() => {
    fetchPages();
  }, []);

  const fetchPages = async () => {
    try {
      const data = await window.electron.websiteGetPages();
      setPages(data);
    } catch (error) { console.error(error); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const contentArray = [{ id: 's1', type: 'text', content: textContent }]; // Simple placeholder structure
      const payload = {
          ...formData,
          id: editingPage ? editingPage.id : `page-${Date.now()}`,
          content: contentArray
      };

      if (editingPage) await window.electron.websiteUpdatePage(payload);
      else await window.electron.websiteCreatePage(payload);
      
      setIsModalOpen(false);
      fetchPages();
      resetForm();
    } catch (error) { console.error(error); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this page?')) return;
    try {
      await window.electron.websiteDeletePage(id);
      fetchPages();
    } catch (error) { console.error(error); }
  };

  const resetForm = () => {
    setEditingPage(null);
    setFormData({ id: '', slug: '', title: '', content: [] });
    setTextContent('');
  };

  const openEdit = (page: CustomPage) => {
      setEditingPage(page);
      setFormData(page);
      // specific logic to extract text from generic content json
      const firstTextSection = page.content?.find((s: any) => s.type === 'text');
      setTextContent(firstTextSection ? firstTextSection.content : '');
      setIsModalOpen(true);
  };

  const filteredPages = pages.filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <DashboardLayout title="Website Pages">
    <div className="masters-container" style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
       {/* ... header ... */}
      <div className="masters-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>Website Pages</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage custom content pages</p>
        </div>
        <button className="create-btn" onClick={() => { resetForm(); setIsModalOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
          <Plus size={20} /> Add Page
        </button>
      </div>

       <div className="search-bar" style={{ marginBottom: '1.5rem', position: 'relative' }}>
        <input
          type="text"
          placeholder="Search pages..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', padding: '1rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', color: 'var(--text-primary)' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
        {filteredPages.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No pages found. Create one to get started.</div>
        ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Title</th>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Slug</th>
                <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Actions</th>
                </tr>
            </thead>
            <tbody>
                {filteredPages.map(page => (
                <tr key={page.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem', fontWeight: 500 }}><div style={{display:'flex', alignItems:'center', gap:'10px'}}><FileText size={18}/> {page.title}</div></td>
                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>/{page.slug}</td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                         <button onClick={() => openEdit(page)} style={{ padding: '6px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', marginRight: '8px' }}><Edit2 size={18} /></button>
                         <button onClick={() => handleDelete(page.id)} style={{ padding: '6px', background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer' }}><Trash2 size={18} /></button>
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ width: '100%', maxWidth: '700px', background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <h2>{editingPage ? 'Edit Page' : 'New Page'}</h2>
                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={24} /></button>
              </div>
              <form onSubmit={handleSave} style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Title</label>
                        <input required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value, slug: e.target.value.toLowerCase().replace(/ /g, '-') })} style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Slug</label>
                        <input required value={formData.slug} onChange={e => setFormData({ ...formData, slug: e.target.value })} style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                    </div>
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Content</label>
                    <textarea 
                        rows={10} 
                        value={textContent}
                        onChange={e => setTextContent(e.target.value)}
                        placeholder="Page content goes here..."
                        style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontFamily: 'monospace' }} 
                    />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
                    <button type="submit" style={{ padding: '0.75rem 1.5rem', background: 'var(--accent-color)', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Save Page</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </DashboardLayout>
  );
};

export default WebsitePages;
