import React, { useState, useEffect } from 'react';
import { 
    Search, Plus, Trash2, ExternalLink, RefreshCw, BarChart2, 
    Globe, Info, 
    Zap, TrendingUp, TrendingDown
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useToast } from '../../context/ToastContext';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

const MarketAnalysis: React.FC = () => {
    const { showToast } = useToast();
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [competitorUrls, setCompetitorUrls] = useState<any[]>([]);
    const [analysisHistory, setAnalysisHistory] = useState<any[]>([]);
    const [scanning, setScanning] = useState<number | null>(null); // Product ID being scanned

    // New Competitor URL state
    const [newCompName, setNewCompName] = useState('');
    const [newCompUrl, setNewCompUrl] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    useEffect(() => {
        loadProducts();
    }, []);

    const loadProducts = async () => {
        setLoading(true);
        try {
            const data = await window.electron.getProducts?.();
            setProducts(data || []);
        } catch (err) {
            showToast('Failed to load products', 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadProductDetails = async (product: any) => {
        setSelectedProduct(product);
        try {
            const urls = await window.electron.getCompetitorUrls?.(product.id);
            const history = await window.electron.getMarketAnalysisHistory?.(product.id);
            setCompetitorUrls(urls || []);
            setAnalysisHistory(history || []);
        } catch (err) {
            showToast('Failed to load competitor details', 'error');
        }
    };

    useAutoRefresh(['products'], loadProducts);
    useAutoRefresh(['market_analysis', 'competitor_urls'], () => {
        if (selectedProduct) loadProductDetails(selectedProduct);
    });

    const handleAddUrl = async () => {
        if (!newCompName || !newCompUrl) return showToast('Fill all fields', 'error');
        if (!selectedProduct) return;

        setIsAdding(true);
        try {
            const res = await window.electron.addCompetitorUrl?.({
                product_id: selectedProduct.id,
                competitor_name: newCompName,
                url: newCompUrl
            });
            if (res.success) {
                showToast('URL added!', 'success');
                setNewCompName('');
                setNewCompUrl('');
                loadProductDetails(selectedProduct);
            }
        } catch (err) {
            showToast('Failed to add URL', 'error');
        } finally {
            setIsAdding(false);
        }
    };

    const handleDeleteUrl = async (id: number) => {
        if (!confirm('Remove this competitor link?')) return;
        try {
            await window.electron.deleteCompetitorUrl?.(id);
            showToast('URL removed', 'success');
            loadProductDetails(selectedProduct);
        } catch (err) {
            showToast('Failed to delete', 'error');
        }
    };

    const handleRunScan = async (productId: number) => {
        setScanning(productId);
        showToast('AI Market Analysis started...', 'info');
        try {
            const res = await window.electron.runAutoPriceScan?.(productId);
            if (res.success) {
                showToast(`Scan complete! Analyzed ${res.count} web pages.`, 'success');
                if (selectedProduct?.id === productId) {
                    loadProductDetails(selectedProduct);
                }
            } else {
                showToast(res.error || 'Scan failed', 'error');
            }
        } catch (err) {
            showToast('AI Scan Error', 'error');
        } finally {
            setScanning(null);
        }
    };

    const filteredProducts = products.filter(p => 
        p.item_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Styles
    const cardStyle: React.CSSProperties = {
        background: 'var(--card-bg)',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        padding: '1.5rem',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
    };

    const inputStyle: React.CSSProperties = {
        padding: '0.75rem 1rem',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        background: 'var(--input-bg)',
        color: 'var(--text-primary)',
        width: '100%',
        outline: 'none',
        fontSize: '0.9rem'
    };

    const getPriceDiff = (compPrice: number, ourPrice: number) => {
        if (!compPrice || !ourPrice) return null;
        const diff = ((compPrice - ourPrice) / ourPrice) * 100;
        return {
            value: diff.toFixed(1),
            ishigher: diff > 0,
            isLower: diff < 0
        };
    };

    return (
        <div style={{ padding: '1rem', height: 'calc(100vh - 120px)', display: 'grid', gridTemplateColumns: '350px 1fr', gap: '1.5rem' }}>
            
            {/* Left: Product List */}
            <div style={cardStyle}>
                <div style={{ marginBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <BarChart2 size={20} className="text-accent" />
                        Products
                    </h2>
                    <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                        <input 
                            placeholder="Filter products..." 
                            style={{ ...inputStyle, paddingLeft: '2.5rem' }}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>
                    ) : filteredProducts.length === 0 ? (
                        <div style={{ textAlign: 'center', opacity: 0.5, marginTop: '2rem' }}>No products found</div>
                    ) : (
                        filteredProducts.map(p => (
                            <div 
                                key={p.id}
                                onClick={() => loadProductDetails(p)}
                                style={{
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    marginBottom: '0.5rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    background: selectedProduct?.id === p.id ? 'var(--accent-color-light)' : 'transparent',
                                    border: selectedProduct?.id === p.id ? '1px solid var(--accent-color)' : '1px solid transparent'
                                }}
                            >
                                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{p.item_name}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.8rem', opacity: 0.6 }}>
                                    <span>{p.sku || 'No SKU'}</span>
                                    <span>৳ {p.selling_price || 0}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Right: Analysis & Competitor URLs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
                {!selectedProduct ? (
                    <div style={{ ...cardStyle, justifyContent: 'center', alignItems: 'center', opacity: 0.5 }}>
                        <Zap size={48} style={{ marginBottom: '1rem' }} />
                        <p>Select a product to view market analysis</p>
                    </div>
                ) : (
                    <>
                        {/* Summary Header */}
                        <motion.div 
                            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                            style={{ ...cardStyle, background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--input-bg) 100%)' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{selectedProduct.item_name}</h1>
                                    <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>Market Analysis & AI Competitive Intelligence</p>
                                </div>
                                <button 
                                    onClick={() => handleRunScan(selectedProduct.id)}
                                    disabled={scanning === selectedProduct.id || competitorUrls.length === 0}
                                    style={{
                                        padding: '0.8rem 1.5rem',
                                        borderRadius: '12px',
                                        background: 'var(--accent-color)',
                                        color: 'white',
                                        border: 'none',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.6rem',
                                        boxShadow: '0 4px 15px var(--accent-color-light)',
                                        opacity: competitorUrls.length === 0 ? 0.5 : 1
                                    }}
                                >
                                    <RefreshCw size={18} className={scanning === selectedProduct.id ? 'animate-spin' : ''} />
                                    {scanning === selectedProduct.id ? 'AI Analyzing...' : 'Run New AI Scan'}
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginTop: '2rem' }}>
                                <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(0,0,0,0.05)', borderRadius: '12px' }}>
                                    <div style={{ opacity: 0.5, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Our Price</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>৳ {selectedProduct.selling_price}</div>
                                </div>
                                <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(0,0,0,0.05)', borderRadius: '12px' }}>
                                    <div style={{ opacity: 0.5, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Avg Competitor</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                                        {analysisHistory.length > 0 
                                            ? `৳ ${(analysisHistory.reduce((acc, h) => acc + h.competitor_price, 0) / analysisHistory.length).toFixed(0)}`
                                            : '---'}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(0,0,0,0.05)', borderRadius: '12px' }}>
                                    <div style={{ opacity: 0.5, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Status</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-color)' }}>
                                        {competitorUrls.length} Active URLs
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* URLs & Management */}
                        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '1.5rem' }}>
                            <div style={cardStyle}>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Globe size={18} className="text-secondary" />
                                    Competitor URLs
                                </h3>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '1.5rem' }}>
                                    <input placeholder="Competitor Name (e.g. Daraz)" style={inputStyle} value={newCompName} onChange={e => setNewCompName(e.target.value)} />
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input placeholder="Target Webpage URL" style={inputStyle} value={newCompUrl} onChange={e => setNewCompUrl(e.target.value)} />
                                        <button 
                                            onClick={handleAddUrl} disabled={isAdding}
                                            style={{ padding: '0.75rem', borderRadius: '10px', background: 'var(--accent-color)', color: 'white', border: 'none', cursor: 'pointer' }}
                                        >
                                            <Plus size={20} />
                                        </button>
                                    </div>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto' }}>
                                    {competitorUrls.map(url => (
                                        <div 
                                            key={url.id}
                                            style={{ 
                                                padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', 
                                                marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                            }}
                                        >
                                            <div style={{ overflow: 'hidden' }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{url.competitor_name}</div>
                                                <div style={{ fontSize: '0.75rem', opacity: 0.5, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{url.url}</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                <button onClick={() => window.open(url.url, '_blank')} style={{ padding: '0.4rem', borderRadius: '6px', border: 'none', background: 'transparent', cursor: 'pointer', opacity: 0.6 }}><ExternalLink size={16} /></button>
                                                <button onClick={() => handleDeleteUrl(url.id)} style={{ padding: '0.4rem', borderRadius: '6px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', opacity: 0.6 }}><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    ))}
                                    {competitorUrls.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.4, fontStyle: 'italic', fontSize: '0.9rem' }}>
                                            No competitor URLs linked yet.<br/>Add one to start AI scanning.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Analysis History */}
                            <div style={cardStyle}>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Zap size={18} style={{ color: '#8b5cf6' }} />
                                    AI Comparison Insights
                                </h3>

                                <div style={{ flex: 1, overflowY: 'auto' }}>
                                    {analysisHistory.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '4rem', opacity: 0.4 }}>
                                            <Info size={32} style={{ marginBottom: '1rem' }} />
                                            <p>Run an AI Scan to see comparisons</p>
                                        </div>
                                    ) : (
                                        analysisHistory.map(history => {
                                            const diff = getPriceDiff(history.competitor_price, selectedProduct.selling_price);
                                            return (
                                                <motion.div 
                                                    key={history.id}
                                                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                                    style={{ 
                                                        padding: '1.25rem', borderRadius: '16px', background: 'var(--input-bg)',
                                                        border: '1px solid var(--border-color)', marginBottom: '1.5rem'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                            <div style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', background: 'var(--accent-color)', color: 'white', fontSize: '0.8rem', fontWeight: 800 }}>
                                                                {history.competitor_name}
                                                            </div>
                                                            <span style={{ fontSize: '0.75rem', opacity: 0.4 }}>
                                                                {new Date(history.recorded_at).toLocaleString()}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                            <div style={{ textAlign: 'right' }}>
                                                                <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>৳ {history.competitor_price}</div>
                                                                {diff && (
                                                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: diff.isLower ? '#ef4444' : '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                                                        {diff.isLower ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                                                                        {Math.abs(Number(diff.value))}% {diff.isLower ? 'Cheaper' : 'More expensive'}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', opacity: 0.6, textTransform: 'uppercase' }}>Competitor Features</div>
                                                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                                            {history.competitor_features}
                                                        </div>
                                                    </div>

                                                    <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.08)', borderLeft: '4px solid #8b5cf6' }}>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                            <Zap size={14} /> AI Analysis Insight
                                                        </div>
                                                        <p style={{ fontSize: '0.92rem', fontStyle: 'italic', margin: 0, lineHeight: 1.6 }}>
                                                            "{history.ai_comparison_insights}"
                                                        </p>
                                                    </div>
                                                </motion.div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default MarketAnalysis;
