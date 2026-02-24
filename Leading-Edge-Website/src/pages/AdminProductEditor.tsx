
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useShop } from '../context/ShopContext';
import { Product, ProductVariation, ProductSpecification, ProductTab, SpecificShippingCharge } from '../types';
import { Save, Eye, ArrowLeft, Plus, Trash2, CheckSquare, Square, Search, X, Link as LinkIcon, Upload, Star } from 'lucide-react';
import { CURRENCY } from '../constants';
import { api } from '../services/api';

const generateId = () => Math.random().toString(36).substr(2, 9);

const AdminProductEditor: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products, categories, addProduct, updateProduct, shippingAreas, showToast } = useShop();
  const [activeTab, setActiveTab] = useState('general');
  const [showPreview, setShowPreview] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Related Products Search State
  const [relatedSearch, setRelatedSearch] = useState('');
  const [isRelatedSearchFocused, setIsRelatedSearchFocused] = useState(false);

  // Initial State
  const initialFormData: Product = {
    id: `PROD-${Date.now()}`,
    name: '',
    categories: ['Furniture'],
    price: 0,
    shortDescription: '',
    description: '',
    modelNumber: '',
    image: '',
    images: [],
    rating: 5,
    features: [],
    isVisible: true,
    variations: [],
    specifications: [],
    customTabs: [],
    weight: 0,
    specificShippingCharges: [],
    relatedProducts: [] 
  };

  const [formData, setFormData] = useState<Product>(initialFormData);
  const [newVarType, setNewVarType] = useState('Color');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (id && id !== 'new') {
      const found = products.find(p => p.id === id);
      if (found) {
        setFormData(JSON.parse(JSON.stringify(found)));
      }
    }
  }, [id, products]);

  const handleChange = (field: keyof Product, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCategoryChange = (categoryName: string) => {
    setFormData(prev => {
        const cats = prev.categories || [];
        if (cats.includes(categoryName)) {
            return { ...prev, categories: cats.filter(c => c !== categoryName) };
        } else {
            return { ...prev, categories: [...cats, categoryName] };
        }
    });
  };

  // Image Upload Handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!formData.name) {
          showToast('Please enter a product name before uploading images', 'error');
          return;
      }
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setUploading(true);
      try {
          const promises = Array.from(files).map(file => api.uploadImage(file, 'product', formData.name));
          const responses = await Promise.all(promises);
          
          const newImageUrls = responses.map(r => r.url);
          
          setFormData(prev => {
              // If main image is empty, set first uploaded as main
              const currentMain = prev.image;
              const newMain = currentMain ? currentMain : newImageUrls[0];
              
              // Add all to gallery
              const currentGallery = prev.images || [];
              
              return {
                  ...prev,
                  image: newMain,
                  images: [...currentGallery, ...newImageUrls]
              };
          });

          showToast(`${files.length} images uploaded successfully`, 'success');
      } catch (err: any) {
          showToast(`Upload failed: ${err.message}`, 'error');
      } finally {
          setUploading(false);
          // Reset input
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  const setMainImage = (url: string) => {
      setFormData(prev => ({ ...prev, image: url }));
  };

  const removeGalleryImage = (idx: number) => {
      setFormData(prev => {
          const newImages = prev.images.filter((_, i) => i !== idx);
          // If we removed the main image, try to set a new one
          let newMain = prev.image;
          if (prev.images[idx] === prev.image) {
              newMain = newImages.length > 0 ? newImages[0] : '';
          }
          return { ...prev, images: newImages, image: newMain };
      });
  };

  const handleSave = () => {
    if (formData.categories.length === 0) {
        showToast('Please select at least one category', 'error');
        return;
    }
    if (!formData.name) {
        showToast('Product name is required', 'error');
        return;
    }
    
    if (id === 'new') {
      addProduct(formData);
      setLastSavedId(formData.id);
    } else {
      updateProduct(formData);
    }
  };

  const handleAddNew = () => {
      setFormData({
          ...initialFormData,
          id: `PROD-${Date.now()}`
      });
      setLastSavedId(null);
      navigate('/admin/product/new', { replace: true });
  };

  // ... [Other Handlers - Keep as is] ...
  const getUniqueTypes = () => Array.from(new Set(formData.variations.map(v => v.type)));
  const addVariation = (type: string) => setFormData(prev => ({ ...prev, variations: [...prev.variations, { id: generateId(), type, value: 'New Option', price: formData.price }] }));
  const updateVariation = (id: string, field: keyof ProductVariation, value: any) => setFormData(prev => ({ ...prev, variations: prev.variations.map(v => v.id === id ? { ...v, [field]: value } : v) }));
  const removeVariation = (id: string) => setFormData(prev => ({ ...prev, variations: prev.variations.filter(v => v.id !== id) }));
  const addSpec = () => setFormData(prev => ({ ...prev, specifications: [...prev.specifications, { key: '', value: '' }] }));
  const updateSpec = (idx: number, field: 'key' | 'value', value: string) => { const u = [...formData.specifications]; u[idx][field] = value; setFormData(prev => ({ ...prev, specifications: u })); };
  const removeSpec = (idx: number) => setFormData(prev => ({ ...prev, specifications: prev.specifications.filter((_, i) => i !== idx) }));
  const addCustomTab = () => setFormData(prev => ({ ...prev, customTabs: [...prev.customTabs, { id: generateId(), title: 'New Tab', content: '' }] }));
  const updateCustomTab = (idx: number, field: keyof ProductTab, value: string) => { const u = [...formData.customTabs]; u[idx] = { ...u[idx], [field]: value }; setFormData(prev => ({ ...prev, customTabs: u })); };
  const removeCustomTab = (idx: number) => setFormData(prev => ({ ...prev, customTabs: prev.customTabs.filter((_, i) => i !== idx) }));
  const addShippingCharge = () => setFormData(prev => ({ ...prev, specificShippingCharges: [...(prev.specificShippingCharges || []), { areaId: shippingAreas[0]?.id || '', charge: 0 }] }));
  const updateShippingCharge = (idx: number, field: keyof SpecificShippingCharge, value: any) => { const u = [...(formData.specificShippingCharges || [])]; u[idx] = { ...u[idx], [field]: value }; setFormData(prev => ({ ...prev, specificShippingCharges: u })); };
  const removeShippingCharge = (idx: number) => setFormData(prev => ({ ...prev, specificShippingCharges: prev.specificShippingCharges?.filter((_, i) => i !== idx) }));
  const displayCategories = categories.map(c => c.name);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
          <button onClick={() => navigate('/admin/products')} className="flex items-center text-gray-500 hover:text-gray-800">
            <ArrowLeft size={20} className="mr-2" /> Back to Products
          </button>
          <div className="flex gap-4">
             {lastSavedId && (
                 <button onClick={handleAddNew} className="px-4 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg font-bold hover:bg-blue-100 flex items-center gap-2">
                    <Plus size={18} /> Add Another Product
                 </button>
             )}
             <button onClick={() => setShowPreview(true)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 flex items-center gap-2">
               <Eye size={18} /> Preview
             </button>
             <button onClick={handleSave} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 flex items-center gap-2 shadow-lg">
               <Save size={18} /> {id === 'new' ? 'Create' : 'Update'}
             </button>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1">
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden sticky top-24">
                {['general', 'images', 'variations', 'specs', 'tabs', 'shipping'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`w-full text-left px-6 py-4 font-medium border-l-4 capitalize ${activeTab === tab ? 'border-accent bg-orange-50 text-accent' : 'border-transparent hover:bg-gray-50'}`}>
                        {tab === 'specs' ? 'Specifications' : tab === 'tabs' ? 'Custom Tabs' : tab}
                    </button>
                ))}
             </div>
          </div>

          <div className="lg:col-span-3">
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                
                {activeTab === 'general' && (
                   <div className="space-y-6">
                      <div className="flex justify-between">
                         <h2 className="text-xl font-bold">General Information</h2>
                         <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={formData.isVisible} onChange={(e) => handleChange('isVisible', e.target.checked)} className="w-5 h-5 accent-accent" />
                            <span className="font-medium">Product Visible</span>
                         </label>
                      </div>
                      <div><label className="block text-sm font-bold mb-2">Name</label><input className="w-full border p-3 rounded" value={formData.name} onChange={e => handleChange('name', e.target.value)} /></div>
                      
                      <div className="grid grid-cols-2 gap-6">
                         <div>
                            <label className="block text-sm font-bold mb-2">Categories</label>
                            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto bg-gray-50">
                                {displayCategories.map(c => (
                                    <label key={c} className="flex items-center gap-2 mb-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                        <div onClick={(e) => { e.preventDefault(); handleCategoryChange(c); }}>
                                            {formData.categories.includes(c) ? <CheckSquare size={18} className="text-accent"/> : <Square size={18} className="text-gray-400"/>}
                                        </div>
                                        <span>{c}</span>
                                    </label>
                                ))}
                            </div>
                         </div>
                         <div><label className="block text-sm font-bold mb-2">Model Number</label><input className="w-full border p-3 rounded" value={formData.modelNumber} onChange={e => handleChange('modelNumber', e.target.value)} /></div>
                      </div>
                      <div className="grid grid-cols-3 gap-6">
                         <div><label className="block text-sm font-bold mb-2">Price ({CURRENCY})</label><input type="number" className="w-full border p-3 rounded" value={formData.price} onChange={e => handleChange('price', Number(e.target.value))} /></div>
                         <div className="flex items-end pb-3"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={formData.onSale} onChange={e => handleChange('onSale', e.target.checked)} className="w-5 h-5 accent-red-600" /><span className="font-bold text-red-600">On Sale</span></label></div>
                         <div><label className="block text-sm font-bold mb-2">Sale Price ({CURRENCY})</label><input type="number" disabled={!formData.onSale} className="w-full border p-3 rounded disabled:bg-gray-100" value={formData.salePrice || ''} onChange={e => handleChange('salePrice', Number(e.target.value))} /></div>
                      </div>
                      <div><label className="block text-sm font-bold mb-2">Short Desc</label><input className="w-full border p-3 rounded" value={formData.shortDescription} onChange={e => handleChange('shortDescription', e.target.value)} /></div>
                      <div><label className="block text-sm font-bold mb-2">Long Desc</label><textarea className="w-full border p-3 rounded h-32" value={formData.description} onChange={e => handleChange('description', e.target.value)} /></div>
                   </div>
                )}

                {activeTab === 'images' && (
                  <div className="space-y-8">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold">Image Gallery</h2>
                        <label className={`cursor-pointer bg-blue-50 text-blue-600 px-4 py-2 rounded font-bold flex items-center gap-2 hover:bg-blue-100 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                            {uploading ? 'Uploading...' : <><Upload size={18} /> Upload Images</>}
                            <input 
                                type="file" 
                                className="hidden" 
                                multiple 
                                accept="image/*"
                                onChange={handleImageUpload} 
                                ref={fileInputRef}
                            />
                        </label>
                    </div>

                    {/* Main Image Preview */}
                    <div className="bg-gray-50 p-4 rounded-lg border border-blue-100">
                        <h3 className="font-bold text-sm text-gray-700 mb-3 flex items-center gap-2"><Star size={16} fill="currentColor" className="text-accent" /> Main Product Image</h3>
                        <div className="flex gap-4 items-center">
                            {formData.image ? (
                                <div className="h-32 w-32 bg-white p-1 border rounded overflow-hidden">
                                    <img src={formData.image} className="w-full h-full object-contain" />
                                </div>
                            ) : (
                                <div className="h-32 w-32 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-sm border">No Main Image</div>
                            )}
                            <div className="text-sm text-gray-500">
                                This image will be shown on product cards and as the default view.
                            </div>
                        </div>
                    </div>
                    
                    <div>
                       <label className="block text-sm font-bold mb-4">Gallery Grid</label>
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                           {formData.images?.map((img, idx) => (
                              <div key={idx} className={`relative group border rounded-lg overflow-hidden bg-white ${img === formData.image ? 'ring-2 ring-accent' : ''}`}>
                                 <div className="aspect-square">
                                     <img src={img} className="w-full h-full object-cover" />
                                 </div>
                                 <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                     {img !== formData.image && (
                                         <button 
                                            onClick={() => setMainImage(img)}
                                            className="bg-white text-gray-800 text-xs px-3 py-1 rounded-full font-bold hover:bg-accent hover:text-white"
                                         >
                                             Make Primary
                                         </button>
                                     )}
                                     <button 
                                        onClick={() => removeGalleryImage(idx)} 
                                        className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                                        title="Remove"
                                     >
                                         <Trash2 size={16} />
                                     </button>
                                 </div>
                                 {img === formData.image && (
                                     <div className="absolute top-2 left-2 bg-accent text-white text-[10px] font-bold px-2 py-1 rounded">Primary</div>
                                 )}
                              </div>
                           ))}
                       </div>
                       {(!formData.images || formData.images.length === 0) && (
                           <div className="text-center py-10 border-2 border-dashed rounded-lg text-gray-400">
                               No images uploaded yet.
                           </div>
                       )}
                    </div>
                  </div>
                )}

                {/* Other tabs remain largely identical, omitted for brevity but should be included in full file */}
                {activeTab === 'variations' && (<div><h2 className="text-xl font-bold mb-6">Variations</h2><div className="bg-gray-50 p-4 rounded-lg mb-8 flex items-center gap-4"><span className="font-bold text-sm">Create Group:</span><input className="border p-2 rounded w-40" placeholder="e.g. Color" value={newVarType} onChange={e => setNewVarType(e.target.value)} /><button onClick={() => addVariation(newVarType)} className="bg-accent text-white px-3 py-2 rounded text-sm font-bold">Start</button></div>{getUniqueTypes().map(type => (<div key={type} className="border rounded-xl p-6 mb-6"><h3 className="font-bold text-lg mb-4">{type}</h3>{formData.variations.filter(v => v.type === type).map(v => (<div key={v.id} className="flex gap-3 items-center bg-gray-50 p-3 rounded mb-2"><input className="border p-1 rounded" value={v.value} onChange={e => updateVariation(v.id, 'value', e.target.value)} /><input type="number" className="w-20 border p-1 rounded" value={v.price} onChange={e => updateVariation(v.id, 'price', Number(e.target.value))} /><button onClick={() => removeVariation(v.id)}><Trash2 size={16} className="text-red-500"/></button></div>))}</div>))}</div>)}
                {activeTab === 'specs' && (<div><div className="flex justify-between mb-4"><h2 className="text-xl font-bold">Specifications</h2><button onClick={addSpec} className="bg-gray-100 px-3 py-1 rounded text-sm font-bold">+ Row</button></div>{formData.specifications.map((s, i) => (<div key={i} className="flex gap-2 mb-2"><input className="border p-2 rounded w-1/3" value={s.key} onChange={e => updateSpec(i, 'key', e.target.value)}/><input className="border p-2 rounded flex-1" value={s.value} onChange={e => updateSpec(i, 'value', e.target.value)}/><button onClick={() => removeSpec(i)}><Trash2 className="text-red-500"/></button></div>))}</div>)}
                {activeTab === 'tabs' && (<div><div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold">Custom Tabs</h2><button onClick={addCustomTab} className="bg-gray-100 px-3 py-1 rounded text-sm font-bold">+ Add Tab</button></div>{formData.customTabs.map((tab, idx) => (<div key={tab.id} className="border p-4 rounded mb-4 relative"><button onClick={() => removeCustomTab(idx)} className="absolute top-2 right-2 text-red-500"><Trash2 size={16}/></button><input className="border-b w-full font-bold mb-2" value={tab.title} onChange={e => updateCustomTab(idx, 'title', e.target.value)}/><textarea className="w-full border p-2" value={tab.content} onChange={e => updateCustomTab(idx, 'content', e.target.value)}/></div>))}</div>)}
                {activeTab === 'shipping' && (<div><h2 className="text-xl font-bold mb-4">Weight</h2><input type="number" className="border p-2 rounded mb-4" value={formData.weight} onChange={e => handleChange('weight', Number(e.target.value))} /><div className="border-t pt-4"><h3 className="font-bold mb-2">Specific Charges</h3><button onClick={addShippingCharge} className="bg-gray-100 px-3 py-1 rounded text-sm mb-2">+ Add</button>{formData.specificShippingCharges?.map((c, i) => (<div key={i} className="flex gap-2 mb-2"><select className="border p-2" value={c.areaId} onChange={e => updateShippingCharge(i, 'areaId', e.target.value)}>{shippingAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><input type="number" className="border p-2 w-24" value={c.charge} onChange={e => updateShippingCharge(i, 'charge', Number(e.target.value))} /><button onClick={() => removeShippingCharge(i)}><Trash2 className="text-red-500"/></button></div>))}</div></div>)}
             </div>
          </div>
      </div>
      
      {showPreview && (
         <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white p-8 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
               <div className="flex justify-between items-center mb-6">
                   <h3 className="font-bold text-xl">Preview</h3>
                   <button onClick={() => setShowPreview(false)}><X size={20}/></button>
               </div>
               <div className="grid grid-cols-2 gap-8">
                   <img src={formData.image} className="w-full rounded-lg" />
                   <div><h1 className="text-3xl font-bold">{formData.name}</h1><p className="text-primary text-2xl font-bold mt-2">{CURRENCY}{formData.price}</p></div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default AdminProductEditor;
