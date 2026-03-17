import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Search, X, Eye, Save, Upload } from 'lucide-react';
import './Quotation.css';

// ── Default Terms ─────────────────────────────────────────────────────────────
const DEFAULT_TERMS = [
  '100% of the payment must be completed before delivery. <b>No dues will be accepted.</b>',
  'The order is subject to <b>stock availability</b> at the time of placement.',
  'Cash on delivery is available only within <b>Dhaka</b>. However, the customer must pay <b>80%</b> in advance. If fitting service is required, <b>full payment</b> must be made before our workers fit the product.',
  'Exchanges can be made within <b>7 days</b> of purchase with the <b>original invoice</b>. The product <b>must be intact, unused, and in its original packaging</b>. Exchanges can only be done once.',
  'Please note that we <b>do not provide cash returns</b> for exchanges. You must select a product of <b>equal or higher value</b> than the exchanged item.',
  'Product booking is not valid without payment. At least <b>30% of the product price</b> is required to book the product.',
  'Goods must be collected within <b>one month</b> of placing the order. We are not liable for any damage after one month.',
  '<b>Delivery, fitting, lifting, customization</b>, and <b>other charges</b> will be applied based on the customer\'s requirements.',
  'The product prices are <b>excluded</b> from <b>VAT & TAX</b>.',
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface QuoteItem {
  id: string;
  imagePath: string;
  imagePreview: string;
  specification: string;
  unit: string;
  quantity: number;
  rate: number;
}

export default function QuotationCreate() {
  const navigate = useNavigate();

  // Header
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 5); return d.toISOString().split('T')[0];
  });

  // Customer
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('N/A');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerEmail, setCustomerEmail] = useState('N/A');

  // Concerned Person
  const [concernedName, setConcernedName] = useState('X');
  const [concernedPhone, setConcernedPhone] = useState('+880 1959 902 550');
  const [concernedEmail, setConcernedEmail] = useState('@leadingedge.com.bd');

  // Items
  const [items, setItems] = useState<QuoteItem[]>([
    { id: '1', imagePath: '', imagePreview: '', specification: '', unit: 'pcs', quantity: 1, rate: 0 },
    { id: '2', imagePath: '', imagePreview: '', specification: '', unit: 'pcs', quantity: 1, rate: 0 },
    { id: '3', imagePath: '', imagePreview: '', specification: '', unit: 'pcs', quantity: 1, rate: 0 },
    { id: '4', imagePath: '', imagePreview: '', specification: '', unit: 'pcs', quantity: 1, rate: 0 },
  ]);

  // Charges
  const [fittingCharge, setFittingCharge] = useState(0);
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [discount, setDiscount] = useState(0);

  // Terms
  const [terms, setTerms] = useState<string[]>(DEFAULT_TERMS);

  // Prepared By (from localStorage)
  const preparedBy = localStorage.getItem('user_name') || 'Staff';
  const preparedByRole = localStorage.getItem('user_role') || '';

  const [saving, setSaving] = useState(false);

  // ── Customer search ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!customerSearch.trim()) { setCustomerSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        // @ts-ignore
        const results = await window.electron?.searchBillingCustomers?.(customerSearch);
        setCustomerSuggestions(results || []);
        setShowSuggestions(true);
      } catch { }
    }, 250);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  const selectCustomer = (c: any) => {
    setCustomerName(c.name || '');
    setCustomerMobile(c.phone || '');
    setCustomerEmail(c.email || 'N/A');
    setCustomerAddress(c.address || 'N/A');
    setCustomerSearch(c.name || '');
    setShowSuggestions(false);
  };

  // ── Items helpers ────────────────────────────────────────────────────────────
  const addItem = () => {
    setItems(prev => [...prev, {
      id: Date.now().toString(),
      imagePath: '', imagePreview: '',
      specification: '', unit: 'pcs', quantity: 1, rate: 0,
    }]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const updateItem = (id: string, field: keyof QuoteItem, value: any) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleImagePick = async (id: string) => {
    try {
      // @ts-ignore
      const result = await window.electron.pickImage() as any;
      if (result?.path) {
        updateItem(id, 'imagePath', result.path);
        updateItem(id, 'imagePreview', result.dataUrl || result.path);
      }
    } catch { }
  };

  // ── Totals ───────────────────────────────────────────────────────────────────
  const subtotal = items.reduce((s, i) => s + (i.quantity * i.rate), 0);
  const grandTotal = subtotal + fittingCharge + deliveryCharge - discount;

  // ── Terms helpers ─────────────────────────────────────────────────────────────
  const updateTerm = (idx: number, val: string) => {
    setTerms(prev => prev.map((t, i) => i === idx ? val : t));
  };
  const addTerm = () => setTerms(prev => [...prev, '']);
  const removeTerm = (idx: number) => setTerms(prev => prev.filter((_, i) => i !== idx));
  const resetTerms = () => setTerms(DEFAULT_TERMS);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        quoteDate, validUntil,
        companyName, customerName, customerAddress, customerMobile, customerEmail,
        concernedName, concernedPhone, concernedEmail,
        fittingCharge, deliveryCharge, discount, grandTotal,
        preparedBy, preparedByRole,
        termsJson: terms,
        items: items.map((item, i) => ({
          sl_no: i + 1,
          image_path: item.imagePath,
          specification: item.specification,
          unit: item.unit,
          quantity: item.quantity,
          rate: item.rate,
        })),
      };
      // @ts-ignore
      const result = await window.electron?.createQuotation?.(payload);
      if (result && result.id) {
        navigate(`/quotations/preview/${result.id}`);
      }
    } catch (e: any) {
      alert('Failed to save quotation: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = () => {
    // Build a temp state to pass to preview via sessionStorage
    const data = {
      quoteNumber: 'PREVIEW',
      quoteDate, validUntil,
      companyName, customerName, customerAddress, customerMobile, customerEmail,
      concernedName, concernedPhone, concernedEmail,
      fittingCharge, deliveryCharge, discount, grandTotal,
      preparedBy, preparedByRole,
      terms,
      items: items.map((item, i) => ({
        sl_no: i + 1, image_path: item.imagePath, imagePreview: item.imagePreview,
        specification: item.specification, unit: item.unit,
        quantity: item.quantity, rate: item.rate,
      })),
    };
    sessionStorage.setItem('quotation_preview', JSON.stringify(data));
    navigate('/quotations/preview');
  };

  return (
    <DashboardLayout title="New Quotation">
      <div className="quot-page">
        {/* ── Top Action Bar ─────────────────────────────────────── */}
        <div className="quot-topbar">
          <h1 className="quot-page-title">Create Quotation</h1>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="quot-btn-secondary" onClick={() => navigate('/quotations')}>Cancel</button>
            <button className="quot-btn-secondary" onClick={handlePreview}><Eye size={16} /> Preview</button>
            <button className="quot-btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save Quotation'}
            </button>
          </div>
        </div>

        <div className="quot-form">
          {/* ── Date Row ───────────────────────────────────────────── */}
          <div className="quot-card">
            <h3 className="quot-section-title">Quotation Details</h3>
            <div className="quot-grid-3">
              <div className="quot-field">
                <label>Date</label>
                <input type="date" value={quoteDate} onChange={e => setQuoteDate(e.target.value)} />
              </div>
              <div className="quot-field">
                <label>Valid Until</label>
                <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── Customer + Concerned Person ─────────────────────────── */}
          <div className="quot-two-col">
            {/* Customer */}
            <div className="quot-card">
              <h3 className="quot-section-title">Customer Info</h3>
              {/* Search */}
              <div className="quot-field" style={{ position: 'relative' }}>
                <label>Search Customer (from DB)</label>
                <div style={{ position: 'relative' }}>
                  <Search size={16} className="quot-search-icon" />
                  <input
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    placeholder="Type name or phone..."
                    onFocus={() => customerSuggestions.length && setShowSuggestions(true)}
                  />
                </div>
                {showSuggestions && customerSuggestions.length > 0 && (
                  <div className="quot-suggestions">
                    {customerSuggestions.map(c => (
                      <div key={c.id || c.phone} className="quot-suggestion-item" onClick={() => selectCustomer(c)}>
                        <strong>{c.name}</strong>
                        {c.phone && <span> · {c.phone}</span>}
                      </div>
                    ))}
                    <div className="quot-suggestion-close" onClick={() => setShowSuggestions(false)}>Close</div>
                  </div>
                )}
              </div>
              <div className="quot-field">
                <label>Company Name</label>
                <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Company name (optional)" />
              </div>
              <div className="quot-field">
                <label>Customer Name *</label>
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Full name" />
              </div>
              <div className="quot-field">
                <label>Address</label>
                <input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="N/A" />
              </div>
              <div className="quot-field">
                <label>Mobile</label>
                <input value={customerMobile} onChange={e => setCustomerMobile(e.target.value)} placeholder="Phone number" />
              </div>
              <div className="quot-field">
                <label>Email</label>
                <input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="N/A" />
              </div>
            </div>

            {/* Concerned Person */}
            <div className="quot-card">
              <h3 className="quot-section-title">Concerned Person</h3>
              <div className="quot-field">
                <label>Name</label>
                <input value={concernedName} onChange={e => setConcernedName(e.target.value)} placeholder="Staff name" />
              </div>
              <div className="quot-field">
                <label>Phone</label>
                <input value={concernedPhone} onChange={e => setConcernedPhone(e.target.value)} />
              </div>
              <div className="quot-field">
                <label>Email</label>
                <input value={concernedEmail} onChange={e => setConcernedEmail(e.target.value)} />
              </div>
              <div className="quot-field">
                <label>Prepared By</label>
                <input value={preparedBy} disabled style={{ opacity: 0.6 }} />
              </div>
              <div className="quot-field">
                <label>Role</label>
                <input value={preparedByRole} disabled style={{ opacity: 0.6 }} />
              </div>
            </div>
          </div>

          {/* ── Product Rows ─────────────────────────────────────────── */}
          <div className="quot-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 className="quot-section-title" style={{ margin: 0 }}>Products</h3>
              <button className="quot-btn-primary" onClick={addItem}><Plus size={16} /> Add Row</button>
            </div>

            <div className="quot-items-table">
              {/* Header */}
              <div className="quot-item-header">
                <span style={{ width: 36 }}>SL</span>
                <span style={{ width: 120 }}>Picture</span>
                <span style={{ flex: 1 }}>Specification</span>
                <span style={{ width: 70 }}>Unit</span>
                <span style={{ width: 70 }}>Qty</span>
                <span style={{ width: 90 }}>Rate (৳)</span>
                <span style={{ width: 90 }}>Amount (৳)</span>
                <span style={{ width: 36 }}></span>
              </div>

              <AnimatePresence>
                {items.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    className="quot-item-row"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* SL */}
                    <span className="quot-sl">{idx + 1}</span>

                    {/* Image */}
                    <div className="quot-img-cell">
                      {item.imagePreview ? (
                        <div className="quot-img-preview" onClick={() => handleImagePick(item.id)}>
                          <img src={item.imagePreview.startsWith('data:') ? item.imagePreview : `file://${item.imagePreview}`} alt="" />
                        </div>
                      ) : (
                        <button className="quot-img-placeholder" onClick={() => handleImagePick(item.id)}>
                          <Upload size={18} />
                          <span>Add Image</span>
                        </button>
                      )}
                    </div>

                    {/* Specification */}
                    <textarea
                      className="quot-spec-input"
                      value={item.specification}
                      onChange={e => updateItem(item.id, 'specification', e.target.value)}
                      placeholder={`Item Name: \nModel No: \nStyle: \nMaterial: \nColor: `}
                      rows={5}
                    />

                    {/* Unit */}
                    <select
                      className="quot-select"
                      value={item.unit}
                      onChange={e => updateItem(item.id, 'unit', e.target.value)}
                    >
                      {['pcs', 'set', 'pair', 'meter', 'sqft', 'kg', 'unit'].map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>

                    {/* Qty */}
                    <input
                      type="number" min="1"
                      className="quot-num-input"
                      value={item.quantity}
                      onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                    />

                    {/* Rate */}
                    <input
                      type="number" min="0"
                      className="quot-num-input"
                      value={item.rate}
                      onChange={e => updateItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                    />

                    {/* Amount */}
                    <span className="quot-amount">
                      {(item.quantity * item.rate).toLocaleString()}
                    </span>

                    {/* Remove */}
                    <button
                      className="quot-remove-btn"
                      onClick={() => removeItem(item.id)}
                      title="Remove row"
                    >
                      <Trash2 size={15} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Totals */}
            <div className="quot-totals">
              <div className="quot-total-row">
                <label>Fitting Charge (৳)</label>
                <input type="number" min="0" value={fittingCharge} onChange={e => setFittingCharge(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="quot-total-row">
                <label>Delivery Charge (৳)</label>
                <input type="number" min="0" value={deliveryCharge} onChange={e => setDeliveryCharge(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="quot-total-row">
                <label>Discount (৳)</label>
                <input type="number" min="0" value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="quot-total-row quot-grand-total">
                <label>Total Cost</label>
                <span>৳ {grandTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* ── Terms & Conditions ─────────────────────────────────── */}
          <div className="quot-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 className="quot-section-title" style={{ margin: 0 }}>Terms &amp; Conditions</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="quot-btn-secondary" onClick={resetTerms}>Reset to Default</button>
                <button className="quot-btn-primary" onClick={addTerm}><Plus size={14} /> Add Term</button>
              </div>
            </div>
            <div className="quot-terms-list">
              {terms.map((term, idx) => (
                <div key={idx} className="quot-term-row">
                  <span className="quot-term-num">{idx + 1}.</span>
                  <textarea
                    className="quot-term-input"
                    value={term}
                    onChange={e => updateTerm(idx, e.target.value)}
                    rows={2}
                  />
                  <button className="quot-remove-btn" onClick={() => removeTerm(idx)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <p className="quot-terms-hint">You can use HTML tags like &lt;b&gt; for bold text in terms.</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
