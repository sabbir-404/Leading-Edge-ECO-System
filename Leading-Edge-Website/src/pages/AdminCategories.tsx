import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { Category } from '../types';
import { Plus, Edit, Trash2, Save, X, Image as ImageIcon, CornerDownRight, GripVertical } from 'lucide-react';

const AdminCategories: React.FC = () => {
  const { categories, products, addCategory, updateCategory, deleteCategory, reorderCategories } = useShop();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  
  // Form State
  const initialFormState: Category = {
    id: '',
    name: '',
    slug: '',
    image: '',
    parentId: null,
    isFeatured: false,
    order: 0
  };
  const [formData, setFormData] = useState<Category>(initialFormState);

  const mainCategories = categories.filter(c => !c.parentId).sort((a, b) => (a.order || 0) - (b.order || 0));
  
  const getSubCategories = (parentId: string) => {
    return categories.filter(c => c.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));
  };

  const getProductCount = (categoryName: string) => {
    return products.filter(p => p.categories.includes(categoryName)).length;
  };

  const handleCreate = () => {
    setFormData({
      ...initialFormState,
      id: `cat-${Date.now()}`
    });
    setEditingId('new');
  };

  const handleEdit = (category: Category) => {
    setFormData(category);
    setEditingId(category.id);
  };

  const handleSave = () => {
    if (!formData.name) return;
    
    // Auto-generate slug if empty
    const categoryToSave = {
        ...formData,
        slug: formData.slug || formData.name.toLowerCase().replace(/\s+/g, '-')
    };

    if (editingId === 'new') {
      addCategory(categoryToSave);
    } else {
      updateCategory(categoryToSave);
    }
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure? Subcategories will be detached.')) {
      deleteCategory(id);
    }
  };

  // Drag and Drop Handlers
  const onDragStart = (e: React.DragEvent, id: string) => {
    setDraggedCategoryId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Small timeout to allow the ghost image to be created before we might modify DOM styling
    setTimeout(() => {
        // Optional: add dragging class if needed
    }, 0);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedCategoryId || draggedCategoryId === targetId) {
        setDraggedCategoryId(null);
        return;
    }

    // Get current index of dragged and target in the sorted main categories list
    const sourceIndex = mainCategories.findIndex(c => c.id === draggedCategoryId);
    const targetIndex = mainCategories.findIndex(c => c.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) {
        setDraggedCategoryId(null);
        return;
    }

    // Create new order array
    const newOrder = [...mainCategories];
    const [movedItem] = newOrder.splice(sourceIndex, 1);
    newOrder.splice(targetIndex, 0, movedItem);

    // Map to IDs
    const orderedIds = newOrder.map(c => c.id);
    
    reorderCategories(orderedIds);
    setDraggedCategoryId(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold text-gray-800">Categories</h1>
            <p className="text-gray-500">Manage site navigation, drag to reorder.</p>
        </div>
        <button onClick={handleCreate} className="bg-accent text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold shadow-lg">
          <Plus size={20} /> Add Category
        </button>
      </div>

      {/* Editor Modal/Panel */}
      {editingId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                <h3 className="text-xl font-bold">{editingId === 'new' ? 'New Category' : 'Edit Category'}</h3>
                <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X /></button>
            </div>
            <div className="p-6 space-y-4">
                <div>
                    <label className="block text-sm font-bold mb-1">Name</label>
                    <input 
                        className="w-full border p-2 rounded focus:outline-none focus:border-accent" 
                        value={formData.name} 
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        placeholder="e.g. Living Room"
                    />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold mb-1">Parent Category</label>
                        <select 
                            className="w-full border p-2 rounded bg-white focus:outline-none focus:border-accent" 
                            value={formData.parentId || ''} 
                            onChange={e => setFormData({...formData, parentId: e.target.value || null})}
                        >
                            <option value="">None (Main Category)</option>
                            {mainCategories.filter(c => c.id !== editingId).map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">Order</label>
                        <input 
                            type="number"
                            className="w-full border p-2 rounded focus:outline-none focus:border-accent" 
                            value={formData.order || 0} 
                            onChange={e => setFormData({...formData, order: parseInt(e.target.value) || 0})}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-bold mb-1">Image URL (Optional)</label>
                    <div className="flex gap-2">
                        <div className="w-10 h-10 bg-gray-100 rounded border flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {formData.image ? <img src={formData.image} className="w-full h-full object-cover" /> : <ImageIcon size={16} className="text-gray-400"/>}
                        </div>
                        <input 
                            className="flex-1 border p-2 rounded focus:outline-none focus:border-accent" 
                            value={formData.image || ''} 
                            onChange={e => setFormData({...formData, image: e.target.value})}
                            placeholder="https://..."
                        />
                    </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer bg-gray-50 p-3 rounded border">
                    <input 
                        type="checkbox" 
                        checked={formData.isFeatured || false} 
                        onChange={e => setFormData({...formData, isFeatured: e.target.checked})}
                        className="accent-accent w-5 h-5"
                    />
                    <span className="font-medium text-sm">Feature on Home Page Grid</span>
                </label>

            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                <button onClick={() => setEditingId(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded font-medium">Cancel</button>
                <button onClick={handleSave} className="px-6 py-2 bg-accent text-white rounded font-bold hover:bg-orange-600 flex items-center gap-2">
                    <Save size={18} /> Save
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Categories Table/Tree */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase text-xs font-bold tracking-wider">
                <tr>
                    <th className="p-4 w-10"></th>
                    <th className="p-4">Category Name</th>
                    <th className="p-4 text-center">Featured</th>
                    <th className="p-4 text-center">Products</th>
                    <th className="p-4 text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {mainCategories.map(main => (
                    <React.Fragment key={main.id}>
                        {/* Main Category Row */}
                        <tr 
                            className={`hover:bg-gray-50 group transition-colors ${draggedCategoryId === main.id ? 'bg-gray-100 opacity-50' : ''}`}
                            draggable
                            onDragStart={(e) => onDragStart(e, main.id)}
                            onDragOver={onDragOver}
                            onDrop={(e) => onDrop(e, main.id)}
                        >
                            <td className="p-4 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
                                <GripVertical size={20} />
                            </td>
                            <td className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded bg-gray-100 flex-shrink-0 overflow-hidden">
                                        {main.image && <img src={main.image} className="w-full h-full object-cover" />}
                                    </div>
                                    <div>
                                        <div className="font-bold text-gray-800">{main.name}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="p-4 text-center">
                                {main.isFeatured && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">Yes</span>}
                            </td>
                            <td className="p-4 text-center font-mono text-sm text-gray-600">
                                {getProductCount(main.name)}
                            </td>
                            <td className="p-4 text-right">
                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleEdit(main)} className="p-2 bg-white border rounded hover:bg-gray-50 text-blue-600"><Edit size={16}/></button>
                                    <button onClick={() => handleDelete(main.id)} className="p-2 bg-white border rounded hover:bg-red-50 text-red-600"><Trash2 size={16}/></button>
                                </div>
                            </td>
                        </tr>

                        {/* Subcategories */}
                        {getSubCategories(main.id).map(sub => (
                            <tr key={sub.id} className="hover:bg-gray-50 bg-gray-50/30 group">
                                <td className="p-4"></td>
                                <td className="p-4 pl-12">
                                    <div className="flex items-center gap-2 text-gray-600">
                                        <CornerDownRight size={16} className="text-gray-400" />
                                        <span>{sub.name}</span>
                                    </div>
                                </td>
                                <td className="p-4 text-center">
                                    {sub.isFeatured && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">Yes</span>}
                                </td>
                                <td className="p-4 text-center font-mono text-sm text-gray-600">
                                    {getProductCount(sub.name)}
                                </td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleEdit(sub)} className="p-2 bg-white border rounded hover:bg-gray-50 text-blue-600"><Edit size={16}/></button>
                                        <button onClick={() => handleDelete(sub.id)} className="p-2 bg-white border rounded hover:bg-red-50 text-red-600"><Trash2 size={16}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </React.Fragment>
                ))}
                
                {/* Orphan Categories (if any) */}
                {categories.filter(c => c.parentId && !categories.find(p => p.id === c.parentId)).map(orphan => (
                     <tr key={orphan.id} className="bg-red-50 hover:bg-red-100 group">
                        <td className="p-4"></td>
                        <td className="p-4 pl-12 text-red-600 font-medium">
                            <div className="flex items-center gap-2">
                                <span>{orphan.name}</span>
                                <span className="text-xs bg-red-200 px-2 rounded">Orphaned</span>
                            </div>
                        </td>
                        <td className="p-4 text-center">-</td>
                        <td className="p-4 text-center font-mono text-sm text-gray-600">{getProductCount(orphan.name)}</td>
                        <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                                <button onClick={() => handleEdit(orphan)} className="p-2 bg-white border rounded text-blue-600"><Edit size={16}/></button>
                                <button onClick={() => handleDelete(orphan.id)} className="p-2 bg-white border rounded text-red-600"><Trash2 size={16}/></button>
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

export default AdminCategories;