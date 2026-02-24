import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { useNavigate } from 'react-router-dom';
import { Trash2, Edit, Plus, Eye, EyeOff, Search, CheckSquare, Square } from 'lucide-react';
import { Product } from '../types';
import { CURRENCY } from '../constants';

const Admin: React.FC = () => {
  const { user, products, deleteProduct, updateProduct, deleteProductsBulk, updateProductsStatusBulk } = useShop();
  const navigate = useNavigate();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Derived Products
  const [filteredProducts, setFilteredProducts] = useState<Product[]>(products);

  useEffect(() => {
    if (!user || !user.email.includes('admin')) {
      navigate('/admin/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    let result = products;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.modelNumber.toLowerCase().includes(q));
    }

    if (filterCategory !== 'All') {
      result = result.filter(p => p.categories.includes(filterCategory));
    }

    if (filterStatus !== 'All') {
      const isVisible = filterStatus === 'Visible';
      result = result.filter(p => p.isVisible === isVisible);
    }

    setFilteredProducts(result);
  }, [products, searchQuery, filterCategory, filterStatus]);

  const toggleVisibility = (product: Product) => {
    updateProduct({ ...product, isVisible: !product.isVisible });
  };

  // Bulk Actions
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map(p => p.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedIds.length} products?`)) {
      deleteProductsBulk(selectedIds);
      setSelectedIds([]);
    }
  };

  const handleBulkStatus = (visible: boolean) => {
    updateProductsStatusBulk(selectedIds, visible);
    setSelectedIds([]);
  };

  if (!user || !user.email.includes('admin')) return null;

  const categories = ['All', ...Array.from(new Set(products.flatMap(p => p.categories)))];

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Products Inventory</h1>
          <p className="text-gray-500">Manage catalogue, pricing, and availability.</p>
        </div>
        <button 
          onClick={() => navigate('/admin/product/new')}
          className="bg-accent text-white px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-orange-600 font-bold shadow-lg shadow-orange-200"
        >
          <Plus size={20} /> Add Product
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-96">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by name, ID, or model..." 
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-accent"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <select 
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-accent bg-white"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            {categories.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
          </select>
          <select 
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-accent bg-white"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="All">All Status</option>
            <option value="Visible">Visible</option>
            <option value="Hidden">Hidden</option>
          </select>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg mb-4 flex items-center justify-between">
           <span className="font-bold text-blue-800 ml-2">{selectedIds.length} Products Selected</span>
           <div className="flex gap-2">
              <button onClick={() => handleBulkStatus(true)} className="px-3 py-1 bg-white border border-blue-200 text-blue-600 rounded hover:bg-blue-100 text-sm font-medium">Show Selected</button>
              <button onClick={() => handleBulkStatus(false)} className="px-3 py-1 bg-white border border-blue-200 text-blue-600 rounded hover:bg-blue-100 text-sm font-medium">Hide Selected</button>
              <button onClick={handleBulkDelete} className="px-3 py-1 bg-red-100 border border-red-200 text-red-600 rounded hover:bg-red-200 text-sm font-medium">Delete Selected</button>
           </div>
        </div>
      )}

      {/* Product Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="p-4 w-12 text-center">
                 <button onClick={toggleSelectAll} className="text-gray-400 hover:text-gray-600">
                    {selectedIds.length === filteredProducts.length && filteredProducts.length > 0 ? <CheckSquare size={20} className="text-accent" /> : <Square size={20} />}
                 </button>
              </th>
              <th className="p-4 font-bold text-gray-600">ID</th>
              <th className="p-4 font-bold text-gray-600">Image</th>
              <th className="p-4 font-bold text-gray-600">Name / Model</th>
              <th className="p-4 font-bold text-gray-600">Status</th>
              <th className="p-4 font-bold text-gray-600">Price</th>
              <th className="p-4 font-bold text-gray-600">Category</th>
              <th className="p-4 font-bold text-gray-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredProducts.map(p => (
              <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.includes(p.id) ? 'bg-orange-50/30' : ''}`}>
                <td className="p-4 text-center">
                   <button onClick={() => toggleSelect(p.id)} className="text-gray-400 hover:text-gray-600">
                      {selectedIds.includes(p.id) ? <CheckSquare size={20} className="text-accent" /> : <Square size={20} />}
                   </button>
                </td>
                <td className="p-4 text-xs font-mono text-gray-400">{p.id}</td>
                <td className="p-4">
                  <img src={p.image} className="w-12 h-12 rounded object-cover bg-gray-100" />
                </td>
                <td className="p-4">
                   <div className="font-bold text-gray-800">{p.name}</div>
                   <div className="text-xs text-gray-400">{p.modelNumber}</div>
                </td>
                <td className="p-4">
                  <button 
                    onClick={() => toggleVisibility(p)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold ${p.isVisible ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}
                  >
                    {p.isVisible ? <><Eye size={12} /> Visible</> : <><EyeOff size={12} /> Hidden</>}
                  </button>
                </td>
                <td className="p-4">
                  {p.onSale ? (
                    <div>
                      <span className="text-red-600 font-bold">{CURRENCY}{p.salePrice}</span>
                      <br/>
                      <span className="text-gray-400 text-xs line-through">{CURRENCY}{p.price}</span>
                    </div>
                  ) : (
                    <span className="font-medium">{CURRENCY}{p.price}</span>
                  )}
                </td>
                <td className="p-4 text-sm">
                  <span className="bg-gray-100 rounded-full px-3 py-1 inline-block text-gray-600">{p.categories[0]}</span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => navigate(`/admin/product/${p.id}`)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded border border-transparent hover:border-blue-100 transition-all"
                      title="Edit"
                    >
                      <Edit size={18} />
                    </button>
                    <button 
                      onClick={() => deleteProduct(p.id)} 
                      className="p-2 text-red-600 hover:bg-red-50 rounded border border-transparent hover:border-red-100 transition-all"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredProducts.length === 0 && <div className="p-8 text-center text-gray-500">No products match your filters.</div>}
      </div>
    </>
  );
};

export default Admin;