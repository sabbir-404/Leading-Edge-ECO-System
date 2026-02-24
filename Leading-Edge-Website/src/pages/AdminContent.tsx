import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { Save, Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import { Brand } from '../types';

const AdminContent: React.FC = () => {
  const { siteConfig, updateSiteConfig, categories } = useShop();
  const [config, setConfig] = useState(siteConfig);
  const [activeSubTab, setActiveSubTab] = useState('hero');

  // Sync with context if it changes externally
  useEffect(() => {
      setConfig(siteConfig);
  }, [siteConfig]);

  const handleSave = () => {
    updateSiteConfig(config);
    alert('Site content updated successfully!');
  };

  // Hero Logic
  const updateHero = (index: number, field: string, value: any) => {
    const updated = [...config.heroSlides];
    updated[index] = { ...updated[index], [field]: value };
    setConfig(prev => ({ ...prev, heroSlides: updated }));
  };

  // Home Sections Logic
  const toggleSectionVisibility = (id: string) => {
      const updated = config.homeSections.map(s => s.id === id ? { ...s, isVisible: !s.isVisible } : s);
      setConfig(prev => ({ ...prev, homeSections: updated }));
  };

  const addSection = () => {
      const newId = `sec-${Date.now()}`;
      setConfig(prev => ({
          ...prev,
          homeSections: [...prev.homeSections, { id: newId, title: 'New Collection', type: 'category', value: 'Furniture', isVisible: true }]
      }));
  };

  const updateSection = (id: string, field: string, value: any) => {
      const updated = config.homeSections.map(s => s.id === id ? { ...s, [field]: value } : s);
      setConfig(prev => ({ ...prev, homeSections: updated }));
  };

  const removeSection = (id: string) => {
      setConfig(prev => ({ ...prev, homeSections: prev.homeSections.filter(s => s.id !== id) }));
  };

  // Brands Logic
  const addBrand = () => {
      const newBrand: Brand = { id: `brand-${Date.now()}`, name: 'New Brand', logo: '' };
      setConfig(prev => ({ ...prev, brands: [...(prev.brands || []), newBrand] }));
  };

  const updateBrand = (id: string, field: keyof Brand, value: string) => {
      const updated = (config.brands || []).map(b => b.id === id ? { ...b, [field]: value } : b);
      setConfig(prev => ({ ...prev, brands: updated }));
  };

  const removeBrand = (id: string) => {
      setConfig(prev => ({ ...prev, brands: (prev.brands || []).filter(b => b.id !== id) }));
  };

  const handleBrandUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              updateBrand(id, 'logo', reader.result as string);
          };
          reader.readAsDataURL(file);
      }
  };

  return (
    <>
      <div className="flex justify-between items-center mb-8">
           <h1 className="text-3xl font-bold text-gray-800">Home Page Content</h1>
           <button 
             onClick={handleSave}
             className="bg-green-600 text-white px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-green-700 font-bold shadow-lg"
           >
             <Save size={20} /> Save Changes
           </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="flex border-b mb-6 overflow-x-auto">
            <button onClick={() => setActiveSubTab('hero')} className={`px-4 py-2 border-b-2 font-medium whitespace-nowrap ${activeSubTab === 'hero' ? 'border-accent text-accent' : 'border-transparent text-gray-500'}`}>Hero Slider</button>
            <button onClick={() => setActiveSubTab('sections')} className={`px-4 py-2 border-b-2 font-medium whitespace-nowrap ${activeSubTab === 'sections' ? 'border-accent text-accent' : 'border-transparent text-gray-500'}`}>Product Sections</button>
            <button onClick={() => setActiveSubTab('brands')} className={`px-4 py-2 border-b-2 font-medium whitespace-nowrap ${activeSubTab === 'brands' ? 'border-accent text-accent' : 'border-transparent text-gray-500'}`}>Partnered Brands</button>
            <button onClick={() => setActiveSubTab('layout')} className={`px-4 py-2 border-b-2 font-medium whitespace-nowrap ${activeSubTab === 'layout' ? 'border-accent text-accent' : 'border-transparent text-gray-500'}`}>Layout Visibility</button>
        </div>

        {activeSubTab === 'hero' && (
            <div className="space-y-8">
                {config.heroSlides.map((slide, idx) => (
                    <div key={slide.id} className="border p-6 rounded-lg bg-gray-50">
                        <h4 className="font-bold text-gray-700 mb-4 border-b pb-2">Slide #{idx + 1}</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-xs font-bold mb-1">Image URL</label>
                                <input className="w-full border p-2 rounded" value={slide.image} onChange={e => updateHero(idx, 'image', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold mb-1">Title</label>
                                <input className="w-full border p-2 rounded" value={slide.title} onChange={e => updateHero(idx, 'title', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold mb-1">Subtitle</label>
                                <input className="w-full border p-2 rounded" value={slide.subtitle} onChange={e => updateHero(idx, 'subtitle', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold mb-1">Text Alignment</label>
                                <select className="w-full border p-2 rounded" value={slide.alignment || 'center'} onChange={e => updateHero(idx, 'alignment', e.target.value)}>
                                    <option value="center">Center</option>
                                    <option value="left-top">Top Left</option>
                                    <option value="left-bottom">Bottom Left</option>
                                    <option value="right-top">Top Right</option>
                                    <option value="right-bottom">Bottom Right</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold mb-1">Button Text (Optional)</label>
                                <input className="w-full border p-2 rounded" value={slide.buttonText || ''} onChange={e => updateHero(idx, 'buttonText', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold mb-1">Button Link (Optional)</label>
                                <input className="w-full border p-2 rounded" value={slide.buttonLink || ''} onChange={e => updateHero(idx, 'buttonLink', e.target.value)} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {activeSubTab === 'sections' && (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold">Product Sliders</h3>
                    <button onClick={addSection} className="text-sm bg-accent text-white px-3 py-1 rounded flex items-center gap-1"><Plus size={14}/> Add Section</button>
                </div>
                {config.homeSections.map((section) => (
                    <div key={section.id} className="border p-4 rounded-lg flex flex-col gap-4 bg-gray-50">
                        <div className="flex justify-between items-center">
                            <input 
                                className="font-bold bg-transparent border-b border-gray-300 focus:border-accent outline-none" 
                                value={section.title} 
                                onChange={e => updateSection(section.id, 'title', e.target.value)}
                            />
                            <div className="flex gap-2">
                                <button onClick={() => toggleSectionVisibility(section.id)} className={`text-xs px-2 py-1 rounded font-bold ${section.isVisible ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                                    {section.isVisible ? 'Visible' : 'Hidden'}
                                </button>
                                <button onClick={() => removeSection(section.id)} className="text-red-500 p-1 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold mb-1">Content Type</label>
                                <select className="w-full border p-2 rounded bg-white" value={section.type} onChange={e => updateSection(section.id, 'type', e.target.value)}>
                                    <option value="category">Category</option>
                                    <option value="ids">Specific Product IDs</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold mb-1">Value</label>
                                {section.type === 'category' ? (
                                    <select className="w-full border p-2 rounded bg-white" value={section.value as string} onChange={e => updateSection(section.id, 'value', e.target.value)}>
                                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    </select>
                                ) : (
                                    <input 
                                        className="w-full border p-2 rounded bg-white" 
                                        placeholder="comma,separated,ids" 
                                        value={Array.isArray(section.value) ? section.value.join(',') : section.value} 
                                        onChange={e => updateSection(section.id, 'value', e.target.value.split(','))}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {activeSubTab === 'brands' && (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold">Partnered Brands Logos</h3>
                    <button onClick={addBrand} className="text-sm bg-accent text-white px-3 py-1 rounded flex items-center gap-1"><Plus size={14}/> Add Brand</button>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {config.brands?.map((brand) => (
                        <div key={brand.id} className="border p-4 rounded-lg bg-gray-50 flex flex-col gap-3 relative group">
                            <button onClick={() => removeBrand(brand.id)} className="absolute top-2 right-2 text-red-500 hover:bg-red-50 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
                            
                            <div className="w-full h-24 bg-white rounded border flex items-center justify-center overflow-hidden">
                                {brand.logo ? <img src={brand.logo} className="max-w-full max-h-full p-2 object-contain" /> : <ImageIcon className="text-gray-300" />}
                            </div>
                            
                            <input 
                                type="file" 
                                className="text-xs" 
                                onChange={(e) => handleBrandUpload(brand.id, e)}
                            />
                            <input 
                                className="w-full border p-1 rounded text-sm text-center" 
                                placeholder="Brand Name" 
                                value={brand.name} 
                                onChange={(e) => updateBrand(brand.id, 'name', e.target.value)}
                            />
                        </div>
                    ))}
                </div>
            </div>
        )}

        {activeSubTab === 'layout' && (
            <div className="space-y-6">
                <h3 className="font-bold">Home Page Visibility</h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                        <div>
                            <h4 className="font-bold">Completed Projects Section</h4>
                            <p className="text-sm text-gray-500">Show the "Our Completed Projects" slider above the brands section.</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={config.showProjectsSection} 
                                onChange={(e) => setConfig(prev => ({...prev, showProjectsSection: e.target.checked}))} 
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                        <div>
                            <h4 className="font-bold">Partnered Brands Section</h4>
                            <p className="text-sm text-gray-500">Show the scrolling list of brand logos.</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={config.showBrandsSection} 
                                onChange={(e) => setConfig(prev => ({...prev, showBrandsSection: e.target.checked}))} 
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                        </label>
                    </div>
                </div>
            </div>
        )}
      </div>
    </>
  );
};

export default AdminContent;