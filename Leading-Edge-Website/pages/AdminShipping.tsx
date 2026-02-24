import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { Plus, Trash2, Save } from 'lucide-react';
import { ShippingArea, ShippingMethod, ShippingRate } from '../types';

const AdminShipping: React.FC = () => {
  const { shippingAreas, shippingMethods, updateShippingAreas, updateShippingMethods } = useShop();
  const [activeTab, setActiveTab] = useState('areas');

  // Local state to manage changes before save
  const [areas, setAreas] = useState<ShippingArea[]>(shippingAreas);
  const [methods, setMethods] = useState<ShippingMethod[]>(shippingMethods);

  const handleSave = () => {
    updateShippingAreas(areas);
    updateShippingMethods(methods);
    alert('Shipping settings saved!');
  };

  // Areas Logic
  const addArea = () => {
    setAreas([...areas, { id: `area-${Date.now()}`, name: 'New Area' }]);
  };
  const updateArea = (id: string, name: string) => {
    setAreas(areas.map(a => a.id === id ? { ...a, name } : a));
  };
  const removeArea = (id: string) => {
    setAreas(areas.filter(a => a.id !== id));
    // Also remove this area from methods
    setMethods(methods.map(m => ({ ...m, areaIds: m.areaIds.filter(aid => aid !== id) })));
  };

  // Methods Logic
  const addMethod = () => {
    setMethods([...methods, { 
        id: `method-${Date.now()}`, 
        name: 'New Method', 
        areaIds: [], 
        type: 'flat', 
        flatRate: 0, 
        isGlobal: true 
    }]);
  };
  const updateMethod = (id: string, field: keyof ShippingMethod, value: any) => {
    setMethods(methods.map(m => m.id === id ? { ...m, [field]: value } : m));
  };
  const removeMethod = (id: string) => {
    setMethods(methods.filter(m => m.id !== id));
  };

  const addRateRange = (methodId: string) => {
      setMethods(methods.map(m => {
          if (m.id === methodId) {
              return { ...m, weightRates: [...(m.weightRates || []), { minWeight: 0, maxWeight: 0, cost: 0 }] };
          }
          return m;
      }));
  };
  const updateRateRange = (methodId: string, idx: number, field: keyof ShippingRate, value: number) => {
      setMethods(methods.map(m => {
          if (m.id === methodId && m.weightRates) {
              const newRates = [...m.weightRates];
              newRates[idx] = { ...newRates[idx], [field]: value };
              return { ...m, weightRates: newRates };
          }
          return m;
      }));
  };
  const removeRateRange = (methodId: string, idx: number) => {
      setMethods(methods.map(m => {
          if (m.id === methodId && m.weightRates) {
              return { ...m, weightRates: m.weightRates.filter((_, i) => i !== idx) };
          }
          return m;
      }));
  };

  return (
    <>
      <div className="flex justify-between items-center mb-8">
           <h1 className="text-3xl font-bold text-gray-800">Shipping Settings</h1>
           <button 
             onClick={handleSave}
             className="bg-green-600 text-white px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-green-700 font-bold shadow-lg"
           >
             <Save size={20} /> Save Changes
           </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
         <div className="flex border-b bg-gray-50">
            <button 
                onClick={() => setActiveTab('areas')} 
                className={`px-8 py-4 font-bold text-sm uppercase tracking-wide ${activeTab === 'areas' ? 'bg-white border-t-2 border-t-accent text-accent' : 'text-gray-500 hover:bg-gray-100'}`}
            >
                Shipping Areas
            </button>
            <button 
                onClick={() => setActiveTab('methods')} 
                className={`px-8 py-4 font-bold text-sm uppercase tracking-wide ${activeTab === 'methods' ? 'bg-white border-t-2 border-t-accent text-accent' : 'text-gray-500 hover:bg-gray-100'}`}
            >
                Shipping Methods
            </button>
         </div>

         <div className="p-8">
            {activeTab === 'areas' && (
                <div className="max-w-2xl">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold">Define Shipping Areas</h2>
                        <button onClick={addArea} className="text-sm bg-accent text-white px-3 py-1 rounded flex items-center gap-1"><Plus size={14}/> Add Area</button>
                    </div>
                    <div className="space-y-3">
                        {areas.map(area => (
                            <div key={area.id} className="flex gap-4 items-center border p-3 rounded-lg bg-gray-50">
                                <input 
                                    className="flex-1 bg-white border p-2 rounded" 
                                    value={area.name} 
                                    onChange={(e) => updateArea(area.id, e.target.value)}
                                />
                                <button onClick={() => removeArea(area.id)} className="text-red-500 hover:bg-red-50 p-2 rounded"><Trash2 size={18}/></button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'methods' && (
                <div className="space-y-8">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold">Shipping Methods</h2>
                        <button onClick={addMethod} className="text-sm bg-accent text-white px-3 py-1 rounded flex items-center gap-1"><Plus size={14}/> Add Method</button>
                    </div>

                    {methods.map(method => (
                        <div key={method.id} className="border rounded-lg p-6 bg-gray-50">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex-1 mr-4">
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Method Name</label>
                                    <input 
                                        className="w-full border p-2 rounded bg-white font-bold" 
                                        value={method.name} 
                                        onChange={(e) => updateMethod(method.id, 'name', e.target.value)}
                                    />
                                </div>
                                <button onClick={() => removeMethod(method.id)} className="text-red-500 hover:bg-red-50 p-2 rounded"><Trash2 size={18}/></button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-2">Applicable Areas</label>
                                    <div className="flex flex-wrap gap-2">
                                        {areas.map(area => (
                                            <label key={area.id} className="flex items-center gap-1 bg-white border px-2 py-1 rounded text-sm cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={method.areaIds.includes(area.id)}
                                                    onChange={(e) => {
                                                        const newAreas = e.target.checked 
                                                            ? [...method.areaIds, area.id] 
                                                            : method.areaIds.filter(id => id !== area.id);
                                                        updateMethod(method.id, 'areaIds', newAreas);
                                                    }}
                                                />
                                                {area.name}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-2">Calculation Type</label>
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" checked={method.type === 'flat'} onChange={() => updateMethod(method.id, 'type', 'flat')} />
                                            Flat Rate
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" checked={method.type === 'weight'} onChange={() => updateMethod(method.id, 'type', 'weight')} />
                                            Weight Based
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {method.type === 'flat' ? (
                                <div className="max-w-xs">
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Flat Rate Cost ($)</label>
                                    <input 
                                        type="number" 
                                        className="w-full border p-2 rounded bg-white" 
                                        value={method.flatRate || 0}
                                        onChange={(e) => updateMethod(method.id, 'flatRate', Number(e.target.value))}
                                    />
                                </div>
                            ) : (
                                <div className="bg-white border rounded p-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-sm font-bold text-gray-600">Weight Ranges</span>
                                        <button onClick={() => addRateRange(method.id)} className="text-xs text-accent hover:underline">+ Add Range</button>
                                    </div>
                                    <div className="space-y-2">
                                        {method.weightRates?.map((rate, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-sm">
                                                <span>Min (kg):</span>
                                                <input className="w-20 border p-1 rounded" type="number" value={rate.minWeight} onChange={e => updateRateRange(method.id, idx, 'minWeight', Number(e.target.value))} />
                                                <span>Max (kg):</span>
                                                <input className="w-20 border p-1 rounded" type="number" value={rate.maxWeight} onChange={e => updateRateRange(method.id, idx, 'maxWeight', Number(e.target.value))} />
                                                <span>Cost ($):</span>
                                                <input className="w-20 border p-1 rounded" type="number" value={rate.cost} onChange={e => updateRateRange(method.id, idx, 'cost', Number(e.target.value))} />
                                                <button onClick={() => removeRateRange(method.id, idx)} className="text-red-500"><Trash2 size={14}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 pt-4 border-t">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={method.isGlobal} onChange={e => updateMethod(method.id, 'isGlobal', e.target.checked)} />
                                    <span className="text-sm font-bold">Apply globally to all products (default)</span>
                                </label>
                                {!method.isGlobal && <p className="text-xs text-gray-400 ml-6 mt-1">If unchecked, this method must be manually selected for products (Not fully implemented in UI).</p>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
         </div>
      </div>
    </>
  );
};

export default AdminShipping;