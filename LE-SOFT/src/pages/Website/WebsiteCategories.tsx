import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Edit2, Trash2, X, Image as ImageIcon } from 'lucide-react';
import '../Accounting/Masters/Masters.css';

import DashboardLayout from '../../components/DashboardLayout';

interface Category {
  id: string;
  name: string;
  slug: string;
  image?: string;
  parentId?: string;
  isFeatured?: boolean;
  sortOrder?: number;
}

const WebsiteCategories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Category>({
    id: '',
    name: '',
    slug: '',
    image: '',
    parentId: '',
    isFeatured: false,
    sortOrder: 0
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const data = await window.electron.websiteGetCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        id: editingCategory ? editingCategory.id : `cat-${Date.now()}`,
        sortOrder: Number(formData.sortOrder)
      };

      if (editingCategory) {
        await window.electron.websiteUpdateCategory(payload);
      } else {
        await window.electron.websiteCreateCategory(payload);
      }
      
      setIsModalOpen(false);
      fetchCategories();
      resetForm();
    } catch (error) {
      console.error('Failed to save category:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      await window.electron.websiteDeleteCategory(id);
      fetchCategories();
    } catch (error) {
      console.error('Failed to delete category:', error);
    }
  };

  const resetForm = () => {
    setEditingCategory(null);
    setFormData({
      id: '',
      name: '',
      slug: '',
      image: '',
      parentId: '',
      isFeatured: false,
      sortOrder: 0
    });
  };

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setFormData(cat);
    setIsModalOpen(true);
  };

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout title="Website Categories">
    <div className="masters-container" style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <div className="masters-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Website Categories</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage product categories for the online store</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="create-btn"
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
        >
          <Plus size={20} />
          Add Category
        </motion.button>
      </div>

      <div className="search-bar" style={{ marginBottom: '1.5rem', position: 'relative' }}>
        <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        <input
          type="text"
          placeholder="Search categories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '1rem 1rem 1rem 3rem',
            background: 'var(--card-bg)', // changed from bg-secondary
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            color: 'var(--text-primary)',
            fontSize: '1rem'
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
         {isLoading && <div style={{padding:'2rem', textAlign:'center'}}>Loading...</div>}
         {!isLoading && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Image</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Name</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Slug</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Parent</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Order</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCategories.map(cat => (
              <tr key={cat.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem' }}>
                  {cat.image ? (
                    <img src={cat.image} alt={cat.name} style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                      <ImageIcon size={16} />
                    </div>
                  )}
                </td>
                <td style={{ padding: '1rem', fontWeight: 500 }}>{cat.name} {cat.isFeatured && <span style={{ fontSize: '0.7rem', background: 'var(--accent-color)', color: 'white', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>Featured</span>}</td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{cat.slug}</td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{categories.find(p => p.id === cat.parentId)?.name || '-'}</td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{cat.sortOrder}</td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <button onClick={() => openEdit(cat)} style={{ padding: '6px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', marginRight: '8px' }}><Edit2 size={18} /></button>
                  <button onClick={() => handleDelete(cat.id)} style={{ padding: '6px', background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer' }}><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
            {filteredCategories.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No categories found</td>
              </tr>
            )}
          </tbody>
        </table>
         )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                width: '100%', maxWidth: '500px',
                background: 'var(--card-bg)', borderRadius: '16px',
                border: '1px solid var(--border-color)',
                overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
              }}
            >
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{editingCategory ? 'Edit Category' : 'New Category'}</h2>
                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleSave} style={{ padding: '1.5rem' }}>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Name</label>
                    <input
                      required
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value, slug: e.target.value.toLowerCase().replace(/ /g, '-') })}
                      style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Slug</label>
                    <input
                      required
                      value={formData.slug}
                      onChange={e => setFormData({ ...formData, slug: e.target.value })}
                      style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Parent Category</label>
                    <select
                      value={formData.parentId || ''}
                      onChange={e => setFormData({ ...formData, parentId: e.target.value })}
                      style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                    >
                      <option value="">None</option>
                      {categories.filter(c => c.id !== editingCategory?.id).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Image URL</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        value={formData.image}
                        onChange={e => setFormData({ ...formData, image: e.target.value })}
                        style={{ flex: 1, padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                      />
                      {/* Placeholder for Image Picker Integration */}
                      <button type="button" style={{ padding: '0 1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer' }} title="Pick Image">
                        <ImageIcon size={18} />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Sort Order</label>
                        <input
                        type="number"
                        value={formData.sortOrder}
                        onChange={e => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                        style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                        />
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                             <input 
                                type="checkbox" 
                                checked={formData.isFeatured} 
                                onChange={e => setFormData({...formData, isFeatured: e.target.checked})}
                                style={{ width: '18px', height: '18px' }}
                             />
                             <span style={{ color: 'var(--text-primary)' }}>Featured Category</span>
                         </label>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                  <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ padding: '0.75rem 1.5rem', background: 'var(--accent-color)', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Save Category</button>
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

export default WebsiteCategories;
