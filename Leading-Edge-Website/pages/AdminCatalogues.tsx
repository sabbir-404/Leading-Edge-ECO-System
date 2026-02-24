import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { Catalogue } from '../types';
import { Plus, Trash2, Save, Edit, X } from 'lucide-react';

const AdminCatalogues: React.FC = () => {
  const { siteConfig, addCatalogue, updateCatalogue, deleteCatalogue } = useShop();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Catalogue>({ id:'', title:'', season:'', coverImage:'', pdfUrl:'', description:'' });

  const handleCreate = () => {
      setFormData({
          id: `cat-${Date.now()}`,
          title: 'New Catalogue',
          season: '2024',
          coverImage: '',
          pdfUrl: '',
          description: ''
      });
      setEditingId('new');
  };

  const handleEdit = (cat: Catalogue) => {
      setFormData(cat);
      setEditingId(cat.id);
  };

  const handleSave = () => {
      if (editingId === 'new') {
          addCatalogue(formData);
      } else {
          updateCatalogue(formData);
      }
      setEditingId(null);
  };

  return (
    <div className="space-y-8">
        <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-800">Catalogue Management</h1>
            <button onClick={handleCreate} className="bg-accent text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold">
                <Plus size={20} /> Add Catalogue
            </button>
        </div>

        {/* Editor */}
        {editingId && (
            <div className="bg-white p-6 rounded-xl shadow-lg border border-accent mb-8">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold">{editingId === 'new' ? 'New Catalogue' : 'Edit Catalogue'}</h3>
                    <button onClick={() => setEditingId(null)}><X /></button>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-bold mb-1">Title</label>
                        <input className="w-full border p-2 rounded" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">Season</label>
                        <input className="w-full border p-2 rounded" value={formData.season} onChange={e => setFormData({...formData, season: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">Cover Image URL</label>
                        <input className="w-full border p-2 rounded" value={formData.coverImage} onChange={e => setFormData({...formData, coverImage: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">PDF URL</label>
                        <input className="w-full border p-2 rounded" value={formData.pdfUrl} onChange={e => setFormData({...formData, pdfUrl: e.target.value})} />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-sm font-bold mb-1">Description</label>
                        <textarea className="w-full border p-2 rounded h-24" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                    </div>
                </div>
                <div className="flex justify-end">
                    <button onClick={handleSave} className="bg-green-600 text-white px-6 py-2 rounded font-bold flex items-center gap-2">
                        <Save size={18} /> Save Catalogue
                    </button>
                </div>
            </div>
        )}

        {/* List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {siteConfig.catalogues.map(cat => (
                <div key={cat.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden group">
                    <div className="aspect-[3/4] bg-gray-100 relative">
                        {cat.coverImage ? (
                            <img src={cat.coverImage} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">No Cover</div>
                        )}
                        <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEdit(cat)} className="bg-white p-2 rounded shadow hover:text-accent"><Edit size={16} /></button>
                            <button onClick={() => deleteCatalogue(cat.id)} className="bg-white p-2 rounded shadow hover:text-red-500"><Trash2 size={16} /></button>
                        </div>
                    </div>
                    <div className="p-4">
                        <h3 className="font-bold text-lg">{cat.title}</h3>
                        <p className="text-sm text-gray-500 mb-2">{cat.season}</p>
                        <p className="text-xs text-gray-400 line-clamp-2">{cat.description}</p>
                    </div>
                </div>
            ))}
        </div>
    </div>
  );
};

export default AdminCatalogues;