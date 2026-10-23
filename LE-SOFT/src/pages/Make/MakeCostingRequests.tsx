import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle, ClipboardList, FileText, Image, Loader2, Plus, Search, Send, Trash2, Upload } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { MakeDrawingPreview } from '../../components/MakeDrawingPreview';
import { getUserPricingPermissions, isAdmin, isFurnitureDesigner, isFactoryManager, isSuperadmin } from '../../utils/permissions';
import './MakeCostingRequests.css';

type RequestItem = { id: number; item_name: string; quantity: number; remarks?: string; file_urls?: string[]; product_name?: string; product_code?: string; status: string; cost_price?: number; sale_price?: number; blueprint_url?: string; product_drawing_url?: string; product_image?: string; product_id?: number; category_id?: number | null; designer_notes?: string; specifications?: string[]; sizes?: string[]; colors?: string[]; max_discount_type?: 'percent' | 'amount'; max_discount_value?: number };
type CostingRequest = { id: number; request_number: string; requester_name: string; customer_name?: string; customer_phone?: string; remarks?: string; file_urls?: string[]; status: string; items: RequestItem[]; created_at: string };
type RequestDraftItem = { item_name: string; quantity: number; remarks: string; files: File[] };
type GlobalAttribute = { id: number | string; name?: string; spec_name?: string; size_label?: string; color_name?: string; is_active?: boolean };
type GlobalAttributes = { categories: GlobalAttribute[]; specs: GlobalAttribute[]; sizes: GlobalAttribute[]; colors: GlobalAttribute[] };

const MakeCostingRequests: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const processOnly = location.pathname.endsWith('/process');
  const [requests, setRequests] = useState<CostingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [remarks, setRemarks] = useState('');
  const [requestFiles, setRequestFiles] = useState<File[]>([]);
  const [items, setItems] = useState<RequestDraftItem[]>([{ item_name: '', quantity: 1, remarks: '', files: [] }]);
  const [drafts, setDrafts] = useState<Record<number, any>>({});
  const [globalAttributes, setGlobalAttributes] = useState<GlobalAttributes>({ categories: [], specs: [], sizes: [], colors: [] });
  const [attributesLoading, setAttributesLoading] = useState(true);
  const [attributesError, setAttributesError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeUploadOperationId, setActiveUploadOperationId] = useState('');
  const [uploadProgress, setUploadProgress] = useState<{ percent: number; uploadedBytes: number; totalBytes: number; fileName?: string; phase: string } | null>(null);
  const perms = getUserPricingPermissions();
  const designer = isAdmin() || isSuperadmin() || isFurnitureDesigner();
  const factory = isFactoryManager();
  const canRequest = !factory;

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await window.electron.makeGetCostingRequests?.();
      if (result?.error) throw new Error(result.error);
      const rows = Array.isArray(result) ? result : [];
      setRequests(rows);
      setDrafts(prev => {
        const next = { ...prev };
        for (const request of rows) for (const item of request.items || []) {
          next[item.id] = { ...next[item.id], product_name: item.product_name ?? next[item.id]?.product_name ?? item.item_name, product_code: item.product_code ?? next[item.id]?.product_code ?? `RQ-${request.id}-${item.id}`, cost_price: item.cost_price ?? next[item.id]?.cost_price ?? '', sale_price: item.sale_price ?? next[item.id]?.sale_price ?? '', blueprint_url: item.blueprint_url ?? next[item.id]?.blueprint_url ?? '', product_drawing_url: item.product_drawing_url ?? next[item.id]?.product_drawing_url ?? '', product_image: item.product_image ?? next[item.id]?.product_image ?? '', category_id: item.category_id ?? next[item.id]?.category_id ?? '', designer_notes: item.designer_notes ?? next[item.id]?.designer_notes ?? '', specifications: item.specifications ?? next[item.id]?.specifications ?? [], sizes: item.sizes ?? next[item.id]?.sizes ?? [], colors: item.colors ?? next[item.id]?.colors ?? [], max_discount_type: item.max_discount_type ?? next[item.id]?.max_discount_type ?? 'percent', max_discount_value: item.max_discount_value ?? next[item.id]?.max_discount_value ?? '' };
        }
        return next;
      });
    } catch (e: any) {
      setError(e?.message || 'Could not load costing requests.');
    } finally { setLoading(false); }
  }, []);

  const loadGlobalAttributes = useCallback(async () => {
    setAttributesLoading(true);
    setAttributesError('');
    try {
      const result = await window.electron.makeGetGlobalAttributes?.();
      if (!result || !Array.isArray(result.categories)) throw new Error('Global product attributes are unavailable.');
      setGlobalAttributes({
        categories: result.categories,
        specs: (result.specs || []).filter((row: GlobalAttribute) => row.is_active !== false),
        sizes: (result.sizes || []).filter((row: GlobalAttribute) => row.is_active !== false),
        colors: (result.colors || []).filter((row: GlobalAttribute) => row.is_active !== false)
      });
    } catch (e: any) {
      setAttributesError(e?.message || 'Could not load global product attributes.');
    } finally { setAttributesLoading(false); }
  }, []);

  useEffect(() => { void loadRequests(); void loadGlobalAttributes(); }, [loadRequests, loadGlobalAttributes]);

  useEffect(() => window.electron.onMakeUploadProgress?.(progress => {
    if (progress.operationId !== activeUploadOperationId) return;
    setUploadProgress(progress);
  }), [activeUploadOperationId]);

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const validItems = items.map(item => ({ item_name: item.item_name.trim(), quantity: Number(item.quantity), remarks: item.remarks?.trim() || '', files: item.files })).filter(item => item.item_name);
    if (!validItems.length) { setError('Add at least one furniture item.'); return; }
    const allFiles = [...requestFiles, ...validItems.flatMap(item => item.files)];
    if (allFiles.reduce((total, file) => total + file.size, 0) > 50 * 1024 * 1024) { setError('Reference files must total 50 MB or less per request.'); return; }
    const uploadOperationId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `rq-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setActiveUploadOperationId(uploadOperationId);
    setUploadProgress({ percent: 0, uploadedBytes: 0, totalBytes: allFiles.reduce((sum, file) => sum + file.size, 0), phase: 'preparing' });
    setSubmitting(true);
    try {
      const serializeFiles = async (files: File[]) => Promise.all(files.map(async file => ({ name: file.name, mimeType: file.type, buffer: new Uint8Array(await file.arrayBuffer()) })));
      const result = await window.electron.makeCreateCostingRequest?.({ uploadOperationId, customer_name: customerName, customer_phone: customerPhone, remarks, request_files: await serializeFiles(requestFiles), items: await Promise.all(validItems.map(async item => ({ ...item, files: await serializeFiles(item.files) }))) });
      if (!result?.success) throw new Error(result?.error || 'Request could not be submitted.');
      setCustomerName(''); setCustomerPhone(''); setRemarks(''); setRequestFiles([]); setItems([{ item_name: '', quantity: 1, remarks: '', files: [] }]);
      await loadRequests();
      if (result.warning) setError(`Request ${result.request?.request_number || ''} was submitted, but one or more files need to be attached again: ${result.warning}`);
      else alert(`Costing request ${result.request?.request_number || ''} submitted.`);
    } catch (e: any) { setError(e?.message || 'Failed to submit request.'); }
    finally { setSubmitting(false); window.setTimeout(() => setUploadProgress(null), 5000); }
  };

  const attachItemFile = async (requestId: number, itemId: number) => {
    const key = `item-file-${itemId}`; setBusy(key);
    try {
      const result = await window.electron.makeUploadCostingRequestItemFile?.({ requestId, itemId });
      if (result?.error) throw new Error(result.error);
      if (!result?.canceled && !result?.success) throw new Error('File was not saved.');
      if (result?.success) await loadRequests();
    } catch (e: any) { setError(e?.message || 'File upload failed.'); }
    finally { setBusy(null); }
  };

  const deleteRequest = async (request: CostingRequest) => {
    if (!window.confirm(`Delete requestion ${request.request_number}? Its request items will be removed; linked catalog products will remain.`)) return;
    setBusy(`delete-${request.id}`); setError('');
    try {
      const result = await window.electron.makeDeleteCostingRequest?.({ requestId: request.id });
      if (!result?.success) throw new Error(result?.error || 'Requestion could not be deleted.');
      await loadRequests();
    } catch (e: any) { setError(e?.message || 'Could not delete requestion.'); }
    finally { setBusy(null); }
  };

  const attachRequestFile = async (requestId: number) => {
    const key = `request-file-${requestId}`; setBusy(key);
    try {
      const result = await window.electron.makeUploadCostingRequestFile?.({ requestId });
      if (result?.error) throw new Error(result.error);
      if (!result?.canceled && !result?.success) throw new Error('File was not saved.');
      if (result?.success) await loadRequests();
    } catch (e: any) { setError(e?.message || 'File upload failed.'); }
    finally { setBusy(null); }
  };

  const pickAsset = async (item: RequestItem, kind: 'image' | 'blueprint' | 'product_drawing') => {
    const key = `${kind}-${item.id}`; setBusy(key);
    try {
      const result = await window.electron.makePickCostingProductAsset?.({ kind, requestId: Number(requests.find(r => r.items.some(i => i.id === item.id))?.id), itemId: item.id });
      if (result?.error) throw new Error(result.error);
      if (result?.success) setDrafts(prev => ({ ...prev, [item.id]: { ...prev[item.id], [kind === 'image' ? 'product_image' : kind === 'blueprint' ? 'blueprint_url' : 'product_drawing_url']: result.ref } }));
    } catch (e: any) { setError(e?.message || `Could not upload ${kind}.`); }
    finally { setBusy(null); }
  };

  const completePricing = async (item: RequestItem) => {
    const draft = drafts[item.id] || {};
    setBusy(`price-${item.id}`); setError('');
    try {
      const result = await window.electron.makeCompleteCostingRequestItem?.({ itemId: item.id, product_name: draft.product_name, product_code: draft.product_code, cost_price: Number(draft.cost_price), sale_price: Number(draft.sale_price), category_id: draft.category_id ? Number(draft.category_id) : null, blueprint_url: draft.blueprint_url, product_drawing_url: draft.product_drawing_url, product_image: draft.product_image, designer_notes: draft.designer_notes, specifications: Array.isArray(draft.specifications) ? draft.specifications : [], sizes: Array.isArray(draft.sizes) ? draft.sizes : [], colors: Array.isArray(draft.colors) ? draft.colors : [], max_discount_type: draft.max_discount_type || 'percent', max_discount_value: draft.max_discount_value === '' ? null : Number(draft.max_discount_value) });
      if (!result?.success) throw new Error(result?.error || 'Costing could not be saved.');
      await loadRequests();
    } catch (e: any) { setError(e?.message || 'Could not save costing.'); }
    finally { setBusy(null); }
  };

  const toggleAttribute = (itemId: number, attribute: 'specifications' | 'sizes' | 'colors', value: string) => {
    setDrafts(prev => {
      const current = Array.isArray(prev[itemId]?.[attribute]) ? prev[itemId][attribute] as string[] : [];
      const selected = current.includes(value) ? current.filter(entry => entry !== value) : [...current, value];
      return { ...prev, [itemId]: { ...prev[itemId], [attribute]: selected } };
    });
  };

  const renderAttributePicker = (itemId: number, attribute: 'specifications' | 'sizes' | 'colors', label: string, options: GlobalAttribute[], valueKey: 'spec_name' | 'size_label' | 'color_name') => {
    const selected = Array.isArray(drafts[itemId]?.[attribute]) ? drafts[itemId][attribute] as string[] : [];
    const values = [...new Set(options.filter(option => option.is_active !== false).map(option => String(option[valueKey] || '').trim()).filter(Boolean))];
    return <fieldset className="requestion-attribute-fieldset" key={attribute}>
      <legend>{label}<span>{selected.length ? `${selected.length} selected` : 'Optional'}</span></legend>
      {attributesLoading ? <p className="requestion-attribute-empty">Loading shared options…</p> : values.length ? <div className="requestion-attribute-options">
        {values.map(value => <label className={`requestion-attribute-option${selected.includes(value) ? ' is-selected' : ''}`} key={value}>
          <input type="checkbox" checked={selected.includes(value)} onChange={() => toggleAttribute(itemId, attribute, value)} />
          <span>{value}</span>
        </label>)}
      </div> : <p className="requestion-attribute-empty">No active global {label.toLowerCase()} available. Add options in MAKE Product Catalog settings.</p>}
    </fieldset>;
  };

  const placeOrder = async (request: CostingRequest) => {
    setBusy(`order-${request.id}`);
    try {
      const result = await window.electron.makeOrderFromCostingRequest?.({ requestId: request.id });
      if (!result?.success) throw new Error(result?.error || 'Could not prepare order.');
      navigate('/make/place-order', { state: { requestion: result } });
    } catch (e: any) { setError(e?.message || 'Could not prepare order.'); }
    finally { setBusy(null); }
  };

  const panel: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 18, marginBottom: 14 };
  const field: React.CSSProperties = { background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px', width: '100%', boxSizing: 'border-box', font: 'inherit' };
  const button: React.CSSProperties = { background: 'var(--accent-color)', color: '#fff', border: 0, borderRadius: 8, padding: '10px 14px', display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 700, cursor: 'pointer' };

  return <DashboardLayout title={processOnly ? 'MAKE Requestions to Process' : 'MAKE Requestion'}>
    <div className="make-requestion-page">
      <div className="requestion-page-heading"><div className="requestion-heading-icon"><ClipboardList size={22} /></div><div><span className="requestion-eyebrow">MAKE · CUSTOM COSTING</span><h1>Requestion</h1><p>Submit custom furniture requirements for designer review and pricing.</p></div></div>
      {error && <div className="requestion-alert"><AlertCircle size={17} />{error}</div>}

      {!processOnly && canRequest && <form onSubmit={submitRequest} className="requestion-form-card">
        <div className="requestion-section-heading"><div><h2>New costing request</h2><p>Provide customer details, item specifications, and reference files.</p></div><span className="requestion-step-badge">REQUEST DETAILS</span></div>
        <section className="requestion-form-section">
          <h3>Customer <span>Optional</span></h3>
          <div className="requestion-customer-grid">
            <label className="requestion-field">Customer name<input style={field} placeholder="Enter customer name" value={customerName} onChange={e => setCustomerName(e.target.value)} /></label>
            <label className="requestion-field">Phone number<input style={field} type="tel" placeholder="Enter contact number" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} /></label>
          </div>
        </section>
        <section className="requestion-form-section">
          <div className="requestion-section-heading requestion-items-heading"><div><h3>Furniture items <span>Required</span></h3><p>Add each item separately to receive individual costing.</p></div><span className="requestion-item-count">{items.length} {items.length === 1 ? 'item' : 'items'}</span></div>
          <div className="requestion-draft-list">
            {items.map((item, index) => <div key={index} className="requestion-draft-item">
              <div className="requestion-draft-top"><span className="requestion-index">{String(index + 1).padStart(2, '0')}</span><strong>Item {index + 1}</strong>{items.length > 1 && <button className="requestion-remove" type="button" onClick={() => setItems(prev => prev.filter((_, i) => i !== index))}><Trash2 size={14} />Remove</button>}</div>
              <div className="requestion-item-fields">
                <label className="requestion-field requestion-item-name">Furniture item name<input style={field} placeholder="e.g. Reception desk, dining table" value={item.item_name} onChange={e => setItems(prev => prev.map((row, i) => i === index ? { ...row, item_name: e.target.value } : row))} /></label>
                <label className="requestion-field">Quantity<input style={field} type="number" min="0.01" step="0.01" value={item.quantity} onChange={e => setItems(prev => prev.map((row, i) => i === index ? { ...row, quantity: Number(e.target.value) } : row))} /></label>
              </div>
              <label className="requestion-field">Item-specific remarks<textarea style={{ ...field, minHeight: 64, resize: 'vertical' }} placeholder="Dimensions, materials, finish, or other requirements" value={item.remarks || ''} onChange={e => setItems(prev => prev.map((row, i) => i === index ? { ...row, remarks: e.target.value } : row))} /></label>
              <label className="requestion-field">Item reference files <span className="requestion-field-note">Images, PDF, drawings, and other supporting files</span><input className="requestion-file-input" type="file" multiple onChange={e => setItems(prev => prev.map((row, i) => i === index ? { ...row, files: Array.from(e.target.files || []) } : row))} />{!!item.files.length && <span className="requestion-file-list">{item.files.map(file => file.name).join(' · ')}</span>}</label>
            </div>)}
          </div>
          <button type="button" className="requestion-secondary-button" onClick={() => setItems(prev => [...prev, { item_name: '', quantity: 1, remarks: '', files: [] }])}><Plus size={16} />Add another item</button>
        </section>
        <section className="requestion-form-section requestion-form-bottom">
          <label className="requestion-field">Request-wide remarks <span className="requestion-field-note">Applies to all items in this costing request</span><textarea style={{ ...field, minHeight: 76, resize: 'vertical' }} placeholder="Add shared delivery, finish, or project requirements" value={remarks} onChange={e => setRemarks(e.target.value)} /></label>
          <label className="requestion-field">Request reference files <span className="requestion-field-note">Files that apply to the complete request</span><input className="requestion-file-input" type="file" multiple onChange={e => setRequestFiles(Array.from(e.target.files || []))} />{!!requestFiles.length && <span className="requestion-file-list">{requestFiles.map(file => file.name).join(' · ')}</span>}</label>
          <div className="requestion-upload-hint"><FileText size={15} />Up to 50 MB per request. Executable and active-content files are blocked.</div>
        </section>
        {submitting && uploadProgress && uploadProgress.totalBytes > 0 && <div style={{ margin: '0 22px 12px', padding: 12, border: '1px solid var(--border-color)', borderRadius: 9, background: 'var(--input-bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}><span>{uploadProgress.fileName ? `Saved ${uploadProgress.fileName}` : 'Uploading request files'} · {Math.round(uploadProgress.uploadedBytes / (1024 * 1024) * 10) / 10} / {Math.round(uploadProgress.totalBytes / (1024 * 1024) * 10) / 10} MB</span><strong>{uploadProgress.percent}%</strong></div>
          <div style={{ height: 6, marginTop: 7, borderRadius: 99, overflow: 'hidden', background: 'var(--border-color)' }}><div style={{ height: '100%', width: `${uploadProgress.percent}%`, background: 'var(--accent-color)', transition: 'width .2s ease' }} /></div>
          <div style={{ marginTop: 5, color: 'var(--text-secondary)', fontSize: 11 }}>Progress counts file data saved to the durable upload queue; background replication may continue afterward.</div>
        </div>}
        <div className="requestion-form-footer"><span>Customer contact fields are optional.</span><button type="submit" disabled={submitting} style={{ ...button, opacity: submitting ? .7 : 1 }}>{submitting ? <Loader2 className="upload-spinner" size={16} /> : <Send size={15} />}{submitting ? 'Submitting and uploading files…' : 'Submit costing request'}</button></div>
      </form>}

      <h2 style={{ fontSize: 17, margin: '20px 0 10px' }}>{designer ? 'Requests for costing' : factory ? 'Priced custom products' : 'My costing requests'}</h2>
      <div style={{ ...panel, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Search size={17} /><input style={{ ...field, border: 0, background: 'transparent' }} placeholder="Search request number, customer, product, remarks, or code…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      {designer && <div style={{ ...panel, marginTop: 14 }}><strong>{processOnly ? 'Designer work queue' : 'Requestions made and costing status'}</strong><p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>{processOnly ? 'Requests needing designer pricing appear first. Completed requests remain available below.' : 'Track submitted requests, review costing progress, and find prior requests.'}</p></div>}
      {loading ? <div style={panel}>Loading requestion records…</div> : !requests.length ? <div style={panel}>No costing requests found.</div> : requests.filter(request => !search.trim() || [request.request_number, request.requester_name, request.customer_name, request.customer_phone, request.remarks, ...(request.items || []).flatMap(item => [item.item_name, item.remarks, item.product_name, item.product_code, item.designer_notes])].some(value => String(value || '').toLowerCase().includes(search.trim().toLowerCase()))).sort((a,b) => Number((a.status || '').toLowerCase() === 'priced') - Number((b.status || '').toLowerCase() === 'priced')).map(request => <section key={request.id} style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><strong>{request.request_number || `RQ-${request.id}`}</strong><span style={{ marginLeft: 9, color: 'var(--text-secondary)', fontSize: 12 }}>{request.status} · {new Date(request.created_at).toLocaleString()}</span><div style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: 13 }}>Requested by {request.requester_name}{request.customer_name ? ` · Customer ${request.customer_name}` : ''}{request.customer_phone ? ` · ${request.customer_phone}` : ''}</div>{request.remarks && <div style={{ marginTop: 8 }}><b>Request remarks:</b> {request.remarks}</div>}{!designer && !factory && request.items.length > 0 && request.items.every(i => i.status === 'priced') && <button style={{ ...button, marginTop: 9 }} disabled={busy === `order-${request.id}`} onClick={() => void placeOrder(request)}>{busy === `order-${request.id}` ? <Loader2 size={15} className="upload-spinner" /> : <Send size={15} />}Place order for all requestion items</button>}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>{!factory && <button style={{ ...button, background: '#475569' }} disabled={busy === `request-file-${request.id}`} onClick={() => void attachRequestFile(request.id)}>{busy === `request-file-${request.id}` ? <Loader2 size={15} className="upload-spinner" /> : <Upload size={15} />}Attach request file</button>}{designer && <button style={{ ...button, background: '#b91c1c' }} disabled={busy === `delete-${request.id}`} onClick={() => void deleteRequest(request)}>{busy === `delete-${request.id}` ? <Loader2 size={15} className="upload-spinner" /> : <Trash2 size={15} />}Delete</button>}</div>
        </div>
        {!!request.file_urls?.length && <div style={{ marginTop: 9, fontSize: 12, color: 'var(--text-secondary)' }}>Attached files: {request.file_urls.map((url, i) => <span key={url + i} style={{ marginRight: 8 }}>{url.split('/').pop()}</span>)}</div>}
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>{request.items.map(item => {
          const draft = drafts[item.id] || {};
          const priced = item.status === 'priced' || item.status === 'ordered';
          const itemCategoryName = globalAttributes.categories.find(category => Number(category.id) === Number(item.category_id))?.name;
          return <article key={item.id} className="requestion-request-item-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><strong>{item.product_name || item.item_name}</strong><span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Qty {item.quantity} · {item.status}</span></div>
            {itemCategoryName && <div className="requestion-item-category"><b>Category:</b> {itemCategoryName}</div>}
            {item.remarks && <div style={{ marginTop: 7, fontSize: 13 }}><b>Product remarks:</b> {item.remarks}</div>}
            {!!item.file_urls?.length && <div style={{ marginTop: 7, fontSize: 12, color: 'var(--text-secondary)' }}>Product reference files: {item.file_urls.map((url, i) => <span key={url + i} style={{ marginRight: 8 }}>{url.split('/').pop()}</span>)}</div>}
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
              <MakeDrawingPreview url={item.blueprint_url} label="Production Blueprint" compact />
              <MakeDrawingPreview url={item.product_drawing_url} label="Product Drawing" compact />
            </div>
            {!factory && <button style={{ ...button, background: '#475569', marginTop: 7 }} disabled={busy === `item-file-${item.id}`} onClick={() => void attachItemFile(request.id, item.id)}>{busy === `item-file-${item.id}` ? <Loader2 size={15} className="upload-spinner" /> : <Upload size={15} />}Attach product file</button>}
            {designer && <section className="requestion-costing-panel">
              <header className="requestion-costing-heading"><div><span className="requestion-costing-eyebrow">DESIGNER WORKSHEET</span><h3>Product costing</h3><p>Set the catalog identity, global attributes, pricing, and supporting drawings.</p></div><span className={`requestion-costing-status${priced ? ' is-complete' : ''}`}>{priced ? 'COSTING COMPLETE' : 'AWAITING COSTING'}</span></header>
              <div className="requestion-costing-body">
                {attributesError && <div className="requestion-attribute-error" role="status"><span>{attributesError}</span><button type="button" onClick={() => void loadGlobalAttributes()}>Retry</button></div>}
                <div className="requestion-costing-grid">
                  <label className="requestion-field">Product name<input style={field} maxLength={255} value={draft.product_name ?? ''} onChange={e => setDrafts(prev => ({ ...prev, [item.id]: { ...prev[item.id], product_name: e.target.value } }))} /></label>
                  <label className="requestion-field">Product code<input style={field} maxLength={100} value={draft.product_code ?? ''} onChange={e => setDrafts(prev => ({ ...prev, [item.id]: { ...prev[item.id], product_code: e.target.value } }))} /></label>
                  <label className="requestion-field">Cost price (BDT)<input style={field} type="number" min="0" step="0.01" value={draft.cost_price ?? ''} onChange={e => setDrafts(prev => ({ ...prev, [item.id]: { ...prev[item.id], cost_price: e.target.value } }))} /></label>
                  <label className="requestion-field">Sale price (BDT)<input style={field} type="number" min="0" step="0.01" value={draft.sale_price ?? ''} onChange={e => setDrafts(prev => ({ ...prev, [item.id]: { ...prev[item.id], sale_price: e.target.value } }))} /></label>
                  <label className="requestion-field requestion-costing-category">Product category <span className="requestion-field-note">Options from global categories</span><select style={field} value={draft.category_id ?? ''} onChange={e => setDrafts(prev => ({ ...prev, [item.id]: { ...prev[item.id], category_id: e.target.value } }))}><option value="">Select a category</option>{globalAttributes.categories.filter(category => category.is_active !== false).map(category => <option key={category.id} value={category.id}>{category.name || `Category ${category.id}`}</option>)}</select></label>
                </div>
                <div className="requestion-attribute-grid">
                  {renderAttributePicker(item.id, 'specifications', 'Specifications', globalAttributes.specs, 'spec_name')}
                  {renderAttributePicker(item.id, 'sizes', 'Sizes', globalAttributes.sizes, 'size_label')}
                  {renderAttributePicker(item.id, 'colors', 'Colors and finishes', globalAttributes.colors, 'color_name')}
                </div>
                <div className="requestion-discount-grid">
                  <label className="requestion-field">Maximum discount type<select style={field} value={draft.max_discount_type || 'percent'} onChange={e => setDrafts(prev => ({ ...prev, [item.id]: { ...prev[item.id], max_discount_type: e.target.value } }))}><option value="percent">Percentage</option><option value="amount">Fixed amount</option></select></label>
                  <label className="requestion-field">Maximum discount value<input style={field} type="number" min="0" step="0.01" value={draft.max_discount_value ?? ''} onChange={e => setDrafts(prev => ({ ...prev, [item.id]: { ...prev[item.id], max_discount_value: e.target.value } }))} /></label>
                </div>
                <div className="requestion-costing-assets">
                <button style={{ ...button, background: '#475569' }} disabled={busy === `image-${item.id}`} onClick={() => void pickAsset(item, 'image')}>{busy === `image-${item.id}` ? <Loader2 size={15} className="upload-spinner" /> : <Image size={15} />}{draft.product_image ? 'Change product image' : 'Upload product image'}</button>
                <button style={{ ...button, background: '#475569' }} disabled={busy === `blueprint-${item.id}`} onClick={() => void pickAsset(item, 'blueprint')}>{busy === `blueprint-${item.id}` ? <Loader2 size={15} className="upload-spinner" /> : <Upload size={15} />}{draft.blueprint_url ? 'Change blueprint' : 'Upload blueprint'}</button>
                <button style={{ ...button, background: '#475569' }} disabled={busy === `product_drawing-${item.id}`} onClick={() => void pickAsset(item, 'product_drawing')}>{busy === `product_drawing-${item.id}` ? <Loader2 size={15} className="upload-spinner" /> : <Upload size={15} />}{draft.product_drawing_url ? 'Change product drawing' : 'Upload product drawing'}</button>
                <span className="requestion-costing-asset-status">{draft.product_image ? 'Product image attached' : 'Product image optional'} · {draft.blueprint_url ? 'Production blueprint attached' : 'Blueprint optional'} · {draft.product_drawing_url ? 'Product drawing attached' : 'Product drawing optional'}</span>
                </div>
                <label className="requestion-field">Designer notes <span className="requestion-field-note">Optional information for the requester and production team</span><textarea style={{ ...field, minHeight: 68, resize: 'vertical' }} placeholder="Add costing assumptions, material notes, or design guidance" value={draft.designer_notes ?? ''} onChange={e => setDrafts(prev => ({ ...prev, [item.id]: { ...prev[item.id], designer_notes: e.target.value } }))} /></label>
                <footer className="requestion-costing-footer"><span>Price is required. Images and drawings are optional.</span><button style={button} disabled={busy === `price-${item.id}`} onClick={() => void completePricing(item)}>{busy === `price-${item.id}` ? <Loader2 size={15} className="upload-spinner" /> : <CheckCircle size={15} />}{priced ? 'Update costing and product' : 'Complete costing and create product'}</button></footer>
              </div>
            </section>}
            {!designer && <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap', marginTop: 8 }}>
              {!factory && item.sale_price != null && <span>Sale price: ৳{Number(item.sale_price).toLocaleString()}</span>}
              {(perms.canViewCostPrice || factory) && item.cost_price != null && <span>Cost price: ৳{Number(item.cost_price).toLocaleString()}</span>}
              {item.product_id && <span style={{ color: '#059669' }}>Catalog product #{item.product_id}</span>}
            </div>}
            {item.designer_notes && <p style={{ margin: '8px 0', color: 'var(--text-secondary)', fontSize: 13 }}>{item.designer_notes}</p>}
          </article>;
        })}</div>
      </section>)}
    </div>
  </DashboardLayout>;
};

export default MakeCostingRequests;
