import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Edit2, Barcode } from 'lucide-react';
import { motion } from 'framer-motion';
import BarcodeStickerModal, { StickerSize } from '../../../components/BarcodeStickerModal';
import '../../Accounting/Masters/Masters.css';

const ProductList: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Barcode modal
    const [barcodeProduct, setBarcodeProduct] = useState<any | null>(null);
    const [stickerConfig] = useState(() => ({
        width: (localStorage.getItem('barcode_sticker_size') || '50x30') as StickerSize,
        printer: localStorage.getItem('barcode_printer') || '',
    }));

    const fetchProducts = async () => {
        try {
            // @ts-ignore
            const result = await window.electron.getProducts();
            setProducts(result || []);
        } catch (error) {
            console.error('Failed to fetch products:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchProducts(); }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this product?')) return;
        try {
            // @ts-ignore
            await window.electron.deleteProduct(id);
            fetchProducts();
        } catch (error) {
            alert('Failed to delete product.');
        }
    };

    const filtered = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.category || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="master-list-container">
            <div className="list-header">
                <h2>Products</h2>
                <button className="create-btn" onClick={() => navigate('/masters/products/create')}>
                    <Plus size={18} /> Add Product
                </button>
            </div>

            <div className="search-bar">
                <Search size={18} />
                <input type="text" placeholder="Search products by name, SKU, category..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>

            <div className="table-container">
                <table className="master-table">
                    <thead>
                        <tr>
                            <th style={{ width: '50px' }}>Image</th>
                            <th>Product Name</th>
                            <th>SKU</th>
                            <th>Category</th>
                            <th>Unit</th>
                            <th style={{ textAlign: 'right' }}>Qty</th>
                            <th style={{ textAlign: 'right' }}>Purchase ৳</th>
                            <th style={{ textAlign: 'right' }}>Selling ৳</th>
                            <th style={{ textAlign: 'right' }}>Tax %</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={10} className="empty-state">Loading...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={10} className="empty-state">No products found. Click "Add Product" to create one.</td></tr>
                        ) : (
                            filtered.map((product) => (
                                <motion.tr key={product.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    <td>
                                        {product.image_path ? (
                                            <img src={`file://${product.image_path}`} alt="" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '6px' }} onError={(e: any) => { e.target.style.display = 'none'; }} />
                                        ) : (
                                            <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', opacity: 0.4 }}>N/A</div>
                                        )}
                                    </td>
                                    <td style={{ fontWeight: 500 }}>{product.name}</td>
                                    <td><span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontWeight: 500, fontSize: '0.85rem' }}>{product.sku || '—'}</span></td>
                                    <td>{product.category || '—'}</td>
                                    <td>{product.unit_symbol || product.unit_name || '—'}</td>
                                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{product.quantity ?? 0}</td>
                                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>৳ {(product.purchase_price || 0).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>৳ {(product.selling_price || 0).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right' }}>{product.tax_rate || 0}%</td>
                                    <td>
                                        <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                                            <button
                                                className="edit-btn"
                                                title="Print Barcode Sticker"
                                                onClick={() => setBarcodeProduct(product)}
                                                style={{ color: '#f97316' }}
                                            >
                                                <Barcode size={16} />
                                            </button>
                                            <button className="edit-btn" onClick={() => navigate('/masters/products/create', { state: { editProduct: product } })}><Edit2 size={16} /></button>
                                            <button className="delete-btn" onClick={() => handleDelete(product.id)}><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </motion.tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Barcode Sticker Modal */}
            {barcodeProduct && (
                <BarcodeStickerModal
                    product={{
                        name: barcodeProduct.name,
                        sku: barcodeProduct.sku || '',
                        selling_price: barcodeProduct.selling_price || 0,
                    }}
                    config={stickerConfig}
                    onClose={() => setBarcodeProduct(null)}
                />
            )}
        </div>
    );
};

export default ProductList;
