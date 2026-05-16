import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    Edit2,
    ImageIcon,
    Package,
    Truck,
    ClipboardList,
    ShoppingCart,
    SlidersHorizontal,
    Images,
    History,
    Tag,
    ReceiptText,
    PackageMinus,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { resolveImageSrc } from '../../../utils/imageSrc';
import '../../Accounting/Masters/Masters.css';

const money = (value: any) => `৳${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const date = (value?: string) => value ? new Date(value).toLocaleDateString() : '—';

const ProductLedger: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('purchases');

    useEffect(() => {
        const fetchLedger = async () => {
            if (!id) return;
            setLoading(true);
            try {
                // @ts-ignore
                const result = await window.electron.getProductLedgerDetail(Number(id));
                setData(result);
            } catch (error) {
                console.error('Failed to load product ledger:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchLedger();
    }, [id]);

    const product = data?.product;
    const gallery = useMemo(() => {
        if (!product) return [];
        const extra = Array.isArray(product.image_gallery) ? product.image_gallery : [];
        return [product.image_path, ...extra].filter(Boolean);
    }, [product]);

    if (loading) return <div className="master-list-container"><div className="empty-state">Loading product ledger...</div></div>;
    if (!product) return <div className="master-list-container"><div className="empty-state">Product not found.</div></div>;

    const lastPurchase = data.lastPurchase;
    const lastSupplier = product.supplier_name || lastPurchase?.purchase_bill?.supplier?.name || '—';
    const totalPurchased = (data.purchaseItems || []).reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0);
    const totalSold = (data.salesItems || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);

    const tabs = [
        { id: 'purchases', label: 'Purchases', icon: <ReceiptText size={16} />, count: data.purchaseItems.length },
        { id: 'suppliers', label: 'Suppliers', icon: <Truck size={16} />, count: data.suppliers.length },
        { id: 'requisitions', label: 'Requisitions', icon: <ClipboardList size={16} />, count: data.requisitionItems.length },
        { id: 'sales', label: 'Sales', icon: <ShoppingCart size={16} />, count: data.salesItems.length },
        { id: 'specs', label: 'Specs', icon: <SlidersHorizontal size={16} />, count: data.attributes.length },
        { id: 'gallery', label: 'Gallery', icon: <Images size={16} />, count: gallery.length },
        { id: 'damaged', label: 'Damaged Goods', icon: <PackageMinus size={16} />, count: data.damagedGoods?.length || 0 },
        { id: 'priceHistory', label: 'Price History', icon: <History size={16} />, count: data.priceHistory.length },
    ];

    return (
        <motion.div className="product-ledger-shell" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="product-ledger-toolbar">
                <button className="back-btn" onClick={() => navigate('/masters/products')}><ArrowLeft size={18} /> Back</button>
                <button className="create-btn" onClick={() => navigate('/masters/products/create', { state: { editProduct: product } })}>
                    <Edit2 size={18} /> Edit Product
                </button>
            </div>

            <section className="product-ledger-profile">
                <div className="product-ledger-avatar">
                    {product.image_path ? <img src={resolveImageSrc(product.image_path)} alt={product.name} /> : <ImageIcon size={42} />}
                </div>
                <div className="product-ledger-title">
                    <h1>{product.name}</h1>
                    <div className="product-ledger-subline">
                        <span><Tag size={14} /> {product.product_code || product.model_number || product.sku || 'No product ID'}</span>
                        <span><Package size={14} /> {product.group_name || 'No stock group'}</span>
                        <span>{product.origin_type || 'LOCAL'}</span>
                    </div>
                    <p>{product.description || 'No description provided.'}</p>
                </div>
                <div className="product-ledger-balance">
                    <span>Current Stock</span>
                    <strong>{product.quantity || 0} {product.unit_symbol || product.unit_name || ''}</strong>
                    {Number(data.activeDamagedQuantity || 0) > 0 && (
                        <small style={{ color: '#ef4444' }}>{Number(data.activeDamagedQuantity || 0).toLocaleString()} damaged separately</small>
                    )}
                    <small>Last price: {lastPurchase ? money(lastPurchase.rate) : '—'}</small>
                </div>
            </section>

            <section className="product-ledger-summary">
                <div><span>Supplier</span><strong>{lastSupplier}</strong></div>
                <div><span>Last Purchased</span><strong>{lastPurchase ? date(lastPurchase.purchase_bill?.bill_date) : '—'}</strong></div>
                <div><span>Total Purchased</span><strong>{totalPurchased}</strong></div>
                <div><span>Total Sold</span><strong>{totalSold}</strong></div>
                <div><span>Batch</span><strong>{product.batch_code || '—'}</strong></div>
            </section>

            <nav className="product-ledger-tabs">
                {tabs.map(tab => (
                    <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
                        {tab.icon}
                        {tab.label}
                        <span>{tab.count}</span>
                    </button>
                ))}
            </nav>

            <section className="product-ledger-content">
                {activeTab === 'purchases' && (
                    <LedgerTable
                        empty="No purchase history found."
                        headers={['Date', 'Bill Number', 'Supplier', 'Quantity', 'Rate', 'Amount']}
                        rows={data.purchaseItems.map((item: any) => [
                            date(item.purchase_bill?.bill_date),
                            item.purchase_bill?.bill_number || '—',
                            item.purchase_bill?.supplier?.name || '—',
                            item.qty,
                            money(item.rate),
                            money(item.amount),
                        ])}
                    />
                )}

                {activeTab === 'suppliers' && (
                    <LedgerTable
                        empty="No supplier record found."
                        headers={['Supplier', 'Store', 'Contact Person', 'Phone']}
                        rows={data.suppliers.map((supplier: any) => [
                            supplier.name || '—',
                            supplier.store_name || '—',
                            supplier.contact_person || '—',
                            supplier.contact_number || '—',
                        ])}
                    />
                )}

                {activeTab === 'requisitions' && (
                    <LedgerTable
                        empty="No requisition record found."
                        headers={['Requisition #', 'Status', 'Quantity', 'Delivery Date', 'Created']}
                        rows={data.requisitionItems.map((item: any) => [
                            item.requisition?.requisition_number || '—',
                            item.requisition?.status || '—',
                            `${item.quantity || 0} ${item.quantity_unit || ''}`,
                            date(item.requisition?.required_delivery_date),
                            date(item.requisition?.created_at),
                        ])}
                    />
                )}

                {activeTab === 'sales' && (
                    <LedgerTable
                        empty="No sales/billing record found."
                        headers={['Date', 'Invoice', 'Customer', 'Billed By', 'Quantity', 'Amount']}
                        rows={data.salesItems.map((item: any) => [
                            date(item.bill?.created_at),
                            item.bill?.invoice_number || '—',
                            item.bill?.customer_name || '—',
                            item.bill?.billed_by || '—',
                            item.quantity || 0,
                            money(item.price),
                        ])}
                    />
                )}

                {activeTab === 'specs' && (
                    <div className="product-ledger-specs">
                        <div><span>Unit</span><strong>{product.unit_name || product.unit_symbol || '—'}</strong></div>
                        <div><span>Category</span><strong>{product.category || '—'}</strong></div>
                        <div><span>Import Country</span><strong>{product.import_country || '—'}</strong></div>
                        <div><span>Import Reference</span><strong>{product.import_reference || '—'}</strong></div>
                        <div><span>Imported Supplier</span><strong>{product.imported_supplier_name || '—'}</strong></div>
                        {data.attributes.map((entry: any) => (
                            <div key={entry.id}><span>{entry.attribute?.name || 'Attribute'}</span><strong>{entry.value || '—'}</strong></div>
                        ))}
                    </div>
                )}

                {activeTab === 'gallery' && (
                    gallery.length === 0 ? <div className="empty-state">No product pictures uploaded.</div> : (
                        <div className="product-ledger-gallery">
                            {gallery.map((image: string, index: number) => (
                                <img key={`${image}-${index}`} src={resolveImageSrc(image)} alt={`${product.name} ${index + 1}`} />
                            ))}
                        </div>
                    )
                )}

                {activeTab === 'damaged' && (
                    <div>
                        <section className="product-ledger-summary" style={{ marginBottom: '1rem' }}>
                            <div>
                                <span>Active Damaged</span>
                                <strong>{Number(data.activeDamagedQuantity || 0).toLocaleString()} {product.unit_symbol || product.unit_name || ''}</strong>
                            </div>
                            <div>
                                <span>Damage Records</span>
                                <strong>{(data.damagedGoods || []).length}</strong>
                            </div>
                            <div>
                                <span>Repaired</span>
                                <strong>{(data.damagedGoods || []).filter((row: any) => row.status === 'REPAIRED').length}</strong>
                            </div>
                            <div>
                                <span>Written Off</span>
                                <strong>{(data.damagedGoods || []).filter((row: any) => row.status === 'WRITTEN_OFF').length}</strong>
                            </div>
                        </section>
                        <LedgerTable
                            empty="This product has never been recorded in damaged goods."
                            headers={['Reported', 'Source', 'Quantity', 'Status', 'Resolved', 'Notes']}
                            rows={(data.damagedGoods || []).map((row: any) => [
                                date(row.reported_at),
                                row.source_type === 'PURCHASE_RECEIPT' ? 'Purchase receipt' : 'Manual transfer',
                                `${row.quantity || 0} ${product.unit_symbol || product.unit_name || ''}`,
                                row.status?.replace(/_/g, ' '),
                                row.status === 'REPAIRED' ? date(row.repaired_at) : row.status === 'WRITTEN_OFF' ? date(row.written_off_at) : '—',
                                row.damage_notes || row.repair_notes || row.write_off_notes || '—',
                            ])}
                        />
                    </div>
                )}

                {activeTab === 'priceHistory' && (
                    <LedgerTable
                        empty="No price change history found."
                        headers={['Date', 'Purchase Price', 'Selling Price', 'Changed By']}
                        rows={data.priceHistory.map((entry: any) => [
                            date(entry.created_at),
                            `${money(entry.old_purchase_price)} → ${money(entry.new_purchase_price)}`,
                            `${money(entry.old_selling_price)} → ${money(entry.new_selling_price)}`,
                            entry.changed_by || '—',
                        ])}
                    />
                )}
            </section>
        </motion.div>
    );
};

const LedgerTable = ({ headers, rows, empty }: { headers: string[]; rows: any[][]; empty: string }) => (
    <div className="product-ledger-table-wrap">
        <table className="product-ledger-table">
            <thead>
                <tr>{headers.map(header => <th key={header}>{header}</th>)}</tr>
            </thead>
            <tbody>
                {rows.length === 0 ? (
                    <tr><td colSpan={headers.length} className="empty-state">{empty}</td></tr>
                ) : rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

export default ProductLedger;
