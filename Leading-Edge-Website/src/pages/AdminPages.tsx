import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { CustomPage, PageSection } from '../types';
import { Plus, Trash2, Edit, Save, ArrowLeft, Layout } from 'lucide-react';

const AdminPages: React.FC = () => {
  const { customPages, addPage, updatePage, deletePage } = useShop();
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<CustomPage>({
    id: '', title: '', slug: '', hasHero: false, sections: [], placement: 'none'
  });

  const handleEdit = (page: CustomPage) => {
    setFormData(JSON.parse(JSON.stringify(page)));
    setEditingId(page.id);
  };

  const handleCreate = () => {
    const newPage: CustomPage = {
      id: `page-${Date.now()}`,
      title: 'New Page',
      slug: 'new-page',
      hasHero: false,
      sections: [],
      placement: 'none'
    };
    setFormData(newPage);
    setEditingId(newPage.id);
  };

  const handleSave = () => {
    if (customPages.find(p => p.id === formData.id)) {
      updatePage(formData);
    } else {
      addPage(formData);
    }
    setEditingId(null);
  };

  // Section Management
  const addSection = () => {
    setFormData(prev => ({
      ...prev,
      sections: [...prev.sections, { id: `s-${Date.now()}`, type: 'text', content: 'New section content...' }]
    }));
  };

  const updateSection = (idx: number, field: keyof PageSection, value: any) => {
    const updated = [...formData.sections];
    updated[idx] = { ...updated[idx], [field]: value };
    setFormData(prev => ({ ...prev, sections: updated }));
  };

  const removeSection = (idx: number) => {
    setFormData(prev => ({ ...prev, sections: prev.sections.filter((_, i) => i !== idx) }));
  };

  if (editingId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button onClick={() => setEditingId(null)} className="flex items-center text-gray-500 hover:text-gray-800">
            <ArrowLeft size={20} className="mr-2" /> Back
          </button>
          <button onClick={handleSave} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2">
            <Save size={18} /> Save Page
          </button>
        </div>

        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold mb-1">Page Title</label>
            <input className="w-full border p-2 rounded" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">URL Slug</label>
            <input className="w-full border p-2 rounded" value={formData.slug} onChange={e => setFormData({ ...formData, slug: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">Menu Placement</label>
            <select className="w-full border p-2 rounded" value={formData.placement} onChange={e => setFormData({ ...formData, placement: e.target.value as any })}>
              <option value="none">None (Link manually)</option>
              <option value="navbar">Navbar</option>
              <option value="footer">Footer</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
             <label className="flex items-center gap-2 font-bold cursor-pointer">
                <input type="checkbox" checked={formData.hasHero} onChange={e => setFormData({...formData, hasHero: e.target.checked})} />
                Include Hero Header
             </label>
          </div>
          {formData.hasHero && (
            <div className="col-span-2">
               <label className="block text-sm font-bold mb-1">Hero Image URL</label>
               <input className="w-full border p-2 rounded" value={formData.heroImage || ''} onChange={e => setFormData({...formData, heroImage: e.target.value})} />
            </div>
          )}
        </div>

        <div className="space-y-4">
           <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">Content Sections</h3>
              <button onClick={addSection} className="text-sm bg-accent text-white px-3 py-1 rounded flex items-center gap-1"><Plus size={14}/> Add Row</button>
           </div>
           
           {formData.sections.map((section, idx) => (
             <div key={section.id} className="bg-white p-6 rounded-xl border border-gray-200 relative">
                <button onClick={() => removeSection(idx)} className="absolute top-4 right-4 text-red-500 hover:bg-red-50 p-2 rounded"><Trash2 size={16}/></button>
                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-500 mb-1">Row Type</label>
                  <select className="border p-2 rounded bg-gray-50" value={section.type} onChange={e => updateSection(idx, 'type', e.target.value)}>
                    <option value="text">Simple Text</option>
                    <option value="columns">Columns (Not implemented fully in view)</option>
                  </select>
                </div>
                <textarea 
                  className="w-full border p-3 rounded h-32" 
                  value={section.content} 
                  onChange={e => updateSection(idx, 'content', e.target.value)} 
                  placeholder="Enter page content here..."
                />
             </div>
           ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Pages</h1>
        <button onClick={handleCreate} className="bg-accent text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold">
          <Plus size={20} /> Create Page
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 font-bold text-gray-600">Title</th>
              <th className="p-4 font-bold text-gray-600">Slug</th>
              <th className="p-4 font-bold text-gray-600">Placement</th>
              <th className="p-4 font-bold text-gray-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {customPages.map(page => (
              <tr key={page.id} className="hover:bg-gray-50">
                <td className="p-4 font-medium">{page.title}</td>
                <td className="p-4 text-gray-500">/{page.slug}</td>
                <td className="p-4 capitalize">{page.placement}</td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => handleEdit(page)} className="text-blue-600 hover:bg-blue-50 p-2 rounded"><Edit size={18}/></button>
                    {!page.isSystem && (
                      <button onClick={() => deletePage(page.id)} className="text-red-600 hover:bg-red-50 p-2 rounded"><Trash2 size={18}/></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminPages;