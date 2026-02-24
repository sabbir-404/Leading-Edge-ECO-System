import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Truck, PackageCheck, DollarSign, Package, MapPin, Phone,
    ChevronDown, ChevronUp, Printer, CheckCircle2, Upload, History,
    User, AlertCircle
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

// ── Status metadata ────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, {
    label: string; color: string; bg: string;
    icon: React.ReactNode; role: string; roleLabel: string;
}> = {
    pending_payment:  { label: 'Pending Payment', color: '#d97706', bg: '#fef3c7', icon: <DollarSign size={14} />,  role: 'accounts_manager', roleLabel: 'Accounts Manager' },
    paid:             { label: 'Paid',             color: '#2563eb', bg: '#dbeafe', icon: <CheckCircle2 size={14} />, role: 'store_manager',    roleLabel: 'Store Manager' },
    packaging:        { label: 'Packaging',        color: '#7c3aed', bg: '#ede9fe', icon: <Package size={14} />,     role: 'store_manager',    roleLabel: 'Store Manager' },
    ready_to_ship:    { label: 'Ready to Ship',    color: '#0891b2', bg: '#cffafe', icon: <PackageCheck size={14} />,role: 'logistics',         roleLabel: 'Logistics' },
    out_for_delivery: { label: 'Out for Delivery', color: '#ea580c', bg: '#ffedd5', icon: <Truck size={14} />,      role: 'logistics',         roleLabel: 'Logistics' },
    delivered:        { label: 'Delivered',        color: '#16a34a', bg: '#dcfce7', icon: <CheckCircle2 size={14} />,role: '',                  roleLabel: '' },
};

// who can move each shipment to the NEXT status
const STATUS_FLOW: Record<string, string[]> = {
    pending_payment:  ['paid'],
    paid:             ['packaging'],
    packaging:        ['ready_to_ship'],
    ready_to_ship:    ['out_for_delivery'],
    out_for_delivery: ['delivered'],
    delivered:        [],
};

// which statuses each role is allowed to set
const ROLE_PERMISSIONS: Record<string, string[]> = {
    accounts_manager: ['paid'],
    store_manager:    ['packaging', 'ready_to_ship'],
    logistics:        ['out_for_delivery', 'delivered'],
    admin:            ['paid', 'packaging', 'ready_to_ship', 'out_for_delivery', 'delivered'],
};

// ordered pipeline for the visual stepper
const PIPELINE = ['pending_payment', 'paid', 'packaging', 'ready_to_ship', 'out_for_delivery', 'delivered'];

const userRole = localStorage.getItem('user_role') || 'admin';
const userName = localStorage.getItem('user_name') || 'Admin';
const allowedStatuses = ROLE_PERMISSIONS[userRole] || [];

// ── Helpers ────────────────────────────────────────────────────────────────
function nextActionRole(currentStatus: string): { roleLabel: string; color: string } | null {
    const nextStatuses = STATUS_FLOW[currentStatus] || [];
    if (nextStatuses.length === 0) return null;
    const cfg = STATUS_CONFIG[nextStatuses[0]];
    if (!cfg || !cfg.roleLabel) return null;
    return { roleLabel: cfg.roleLabel, color: cfg.color };
}

// ── Label printer (with JsBarcode via CDN) ────────────────────────────────
function printShippingLabel(s: any) {
    const printW = window.open('', '_blank', 'width=520,height=700');
    if (!printW) return;
    printW.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Shipping Label — ${s.invoice_number}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  @page { size: 4in 6in; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; padding: 18px; width: 4in; height: 6in; margin: 0; }
  .label { border: 2px solid #000; border-radius: 8px; padding: 14px; height: 100%;
           display: flex; flex-direction: column; justify-content: space-between; }
  .badge { font-size: 8pt; background:#000; color:#fff; padding:2px 7px; border-radius:3px;
           display:inline-block; margin-bottom:5px; letter-spacing:1px; font-weight:700; }
  .name { font-size: 13pt; font-weight: 800; margin: 0 0 3px; }
  .addr { font-size: 9.5pt; color:#333; margin:0; line-height:1.4; }
  .phone { font-size: 8.5pt; color:#555; margin:3px 0 0; }
  hr { border:none; border-top:1px dashed #aaa; margin:9px 0; }
  .footer { text-align:center; }
  .inv { font-size:8pt; color:#555; text-align:right; margin-bottom:6px; }
  svg { width:100%; height:60px; }
  .barcode-text { font-size:8pt; letter-spacing:1px; margin-top:3px; color:#333; }
</style>
</head>
<body>
<div class="label">
  <div>
    <div style="margin-bottom:12px">
      <div class="badge">TO</div>
      <p class="name">${s.ship_to_name}</p>
      <p class="addr">${s.ship_to_address}</p>
      ${s.ship_to_phone ? `<p class="phone">&#128222; ${s.ship_to_phone}</p>` : ''}
    </div>
    <hr/>
    <div>
      <div class="badge">FROM</div>
      <p class="name">${s.ship_from_name || 'Leading Edge'}</p>
      <p class="addr">${s.ship_from_address || 'Dhaka, Bangladesh'}</p>
    </div>
  </div>
  <div class="footer">
    <hr/>
    <p class="inv">Invoice: ${s.invoice_number} &nbsp;|&nbsp; &#2547;${parseFloat(s.grand_total || '0').toLocaleString()}</p>
    <svg id="barcode"></svg>
    <div class="barcode-text">${s.invoice_number}</div>
  </div>
</div>
<script>
  window.onload = function() {
    try {
      JsBarcode('#barcode', '${s.invoice_number}', {
        format: 'CODE128',
        displayValue: false,
        height: 55,
        margin: 4,
        background: '#ffffff',
        lineColor: '#000000',
        width: 2
      });
    } catch(e) {}
    setTimeout(function(){ window.print(); window.close(); }, 600);
  };
<\/script>
</body>
</html>`);
    printW.document.close();
}

// ── Component ──────────────────────────────────────────────────────────────
const ShippingDashboard: React.FC = () => {
    const [shipments, setShipments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [expanded, setExpanded] = useState<number | null>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [note, setNote] = useState('');
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [imgPreview, setImgPreview] = useState<string | null>(null);
    const [imgFile, setImgFile] = useState<string | null>(null);

    const showMsg = (text: string, ok = true) => {
        setMsg({ text, ok });
        setTimeout(() => setMsg(null), 3500);
    };

    const load = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            const rows = await window.electron.getAllShipments(filter !== 'all' ? { status: filter } : {});
            setShipments(rows || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    useEffect(() => { load(); }, [filter]);

    const loadHistory = async (shipmentId: number) => {
        setHistoryLoading(true);
        try {
            // @ts-ignore
            const rows = await window.electron.getShipmentHistory(shipmentId);
            setHistory(rows || []);
        } catch (e) { }
        setHistoryLoading(false);
    };

    const handleExpand = (s: any) => {
        if (expanded === s.id) { setExpanded(null); return; }
        setExpanded(s.id);
        setNote('');
        setImgPreview(null);
        setImgFile(null);
        loadHistory(s.id);
    };

    const handleStatusUpdate = async (shipment: any, newStatus: string) => {
        if (!allowedStatuses.includes(newStatus)) {
            showMsg('You do not have permission for this action.', false);
            return;
        }
        try {
            // @ts-ignore
            await window.electron.updateShipmentStatus({
                shipmentId: shipment.id,
                billId: shipment.bill_id,
                status: newStatus,
                note,
                updatedBy: userName,
                userRole,
            });
            showMsg(`✓ Status updated to "${STATUS_CONFIG[newStatus]?.label}"`);
            setNote('');
            load();
            loadHistory(shipment.id);
        } catch (e) { showMsg('Failed to update status.', false); }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const b64 = ev.target?.result as string;
            setImgPreview(b64);
            setImgFile(b64);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmitPackagingImage = async (shipment: any) => {
        if (!imgFile) { showMsg('Select an image first.', false); return; }
        try {
            // @ts-ignore
            const res = await window.electron.uploadPackagingImage({
                shipmentId: shipment.id,
                billId: shipment.bill_id,
                imageBase64: imgFile,
                updatedBy: userName,
                userRole,
            });
            if (res.success) {
                showMsg('📸 Photo uploaded — Status → Ready to Ship');
                setImgPreview(null); setImgFile(null);
                load(); loadHistory(shipment.id);
            } else showMsg(res.error || 'Upload failed', false);
        } catch (e) { showMsg('Upload failed', false); }
    };

    const filterStatuses = ['all', ...Object.keys(STATUS_CONFIG)];

    // ── PIPELINE STEPPER (visual) ────────────────────────────────────────
    const PipelineStepper = ({ currentStatus }: { currentStatus: string }) => {
        const currentIdx = PIPELINE.indexOf(currentStatus);
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '1rem', overflowX: 'auto', paddingBottom: '4px' }}>
                {PIPELINE.map((st, i) => {
                    const cfg = STATUS_CONFIG[st];
                    const done = i < currentIdx;
                    const active = i === currentIdx;
                    return (
                        <React.Fragment key={st}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px' }}>
                                <div style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    background: done ? cfg.color : active ? cfg.bg : 'var(--input-bg)',
                                    border: `2px solid ${done || active ? cfg.color : 'var(--border-color)'}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: done ? '#fff' : cfg.color,
                                    fontSize: '10px', flexShrink: 0,
                                }}>
                                    {done ? <CheckCircle2 size={14} /> : cfg.icon}
                                </div>
                                <div style={{
                                    fontSize: '0.6rem', marginTop: '3px', textAlign: 'center', lineHeight: 1.2,
                                    color: done || active ? cfg.color : 'var(--text-secondary)',
                                    fontWeight: active ? 700 : 400,
                                }}>
                                    {cfg.label}
                                </div>
                                {cfg.roleLabel && (
                                    <div style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '1px' }}>
                                        {cfg.roleLabel}
                                    </div>
                                )}
                            </div>
                            {i < PIPELINE.length - 1 && (
                                <div style={{
                                    flex: 1, height: '2px', minWidth: '10px',
                                    background: i < currentIdx ? cfg.color : 'var(--border-color)',
                                    marginBottom: '18px',
                                }} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        );
    };

    return (
        <DashboardLayout title="Shipping">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                {/* Msg banner */}
                <AnimatePresence>
                    {msg && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            style={{
                                padding: '0.75rem 1rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.9rem',
                                background: msg.ok ? '#dcfce7' : '#fef2f2',
                                color: msg.ok ? '#16a34a' : '#dc2626',
                                border: `1px solid ${msg.ok ? '#bbf7d0' : '#fecaca'}`,
                            }}>
                            {msg.text}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Filter tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {filterStatuses.map(st => {
                        const cfg = STATUS_CONFIG[st];
                        const isActive = filter === st;
                        return (
                            <button key={st} onClick={() => setFilter(st)} style={{
                                padding: '6px 14px', borderRadius: '100px', border: '1.5px solid',
                                borderColor: isActive ? (cfg?.color || 'var(--accent-color)') : 'var(--border-color)',
                                background: isActive ? (cfg?.bg || 'rgba(249,115,22,0.1)') : 'var(--card-bg)',
                                color: isActive ? (cfg?.color || 'var(--accent-color)') : 'var(--text-secondary)',
                                fontWeight: isActive ? 700 : 500, fontSize: '0.82rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '5px',
                            }}>
                                {cfg?.icon} {cfg?.label || 'All Shipments'}
                            </button>
                        );
                    })}
                </div>

                {/* Cards */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading shipments…</div>
                ) : shipments.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                        <Truck size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                        <p>No shipments {filter !== 'all' ? `in "${STATUS_CONFIG[filter]?.label}"` : 'found'}.</p>
                    </div>
                ) : (
                    shipments.map(s => {
                        const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG['pending_payment'];
                        const isExpanded = expanded === s.id;
                        const nextStatuses = STATUS_FLOW[s.status] || [];
                        const canAct = nextStatuses.some(ns => allowedStatuses.includes(ns));
                        const nextActor = nextActionRole(s.status);

                        return (
                            <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                style={{
                                    background: 'var(--card-bg)', borderRadius: '14px',
                                    border: `1px solid ${canAct ? cfg.color + '55' : 'var(--border-color)'}`,
                                    overflow: 'hidden',
                                    boxShadow: canAct ? `0 0 0 1px ${cfg.color}22` : 'none',
                                }}>

                                {/* Card header */}
                                <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1, minWidth: '200px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '5px' }}>
                                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{s.invoice_number}</span>
                                            {/* Current status badge */}
                                            <span style={{ padding: '2px 10px', borderRadius: '100px', background: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                {cfg.icon} {cfg.label}
                                            </span>
                                            {/* Next action by badge */}
                                            {nextActor && (
                                                <span style={{ padding: '2px 8px', borderRadius: '100px', background: 'var(--input-bg)', color: nextActor.color, fontWeight: 600, fontSize: '0.7rem', border: `1px solid ${nextActor.color}44`, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    <User size={10} /> Awaiting: {nextActor.roleLabel}
                                                </span>
                                            )}
                                            {s.status === 'delivered' && (
                                                <span style={{ padding: '2px 8px', borderRadius: '100px', background: '#dcfce7', color: '#16a34a', fontWeight: 600, fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    <CheckCircle2 size={10} /> Complete
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                            <span><strong>{s.customer_name}</strong>{s.customer_phone && ` · ${s.customer_phone}`}</span>
                                            <span><MapPin size={12} style={{ verticalAlign: 'middle' }} /> {s.ship_to_address?.substring(0, 45)}{s.ship_to_address?.length > 45 ? '…' : ''}</span>
                                            <span>৳{parseFloat(s.shipping_charge || '0').toLocaleString()} shipping</span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                                        <button onClick={() => printShippingLabel(s)} title="Print Shipping Label"
                                            style={{ padding: '7px 12px', borderRadius: '7px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem' }}>
                                            <Printer size={15} /> Label
                                        </button>
                                        <button onClick={() => handleExpand(s)}
                                            style={{ padding: '7px 14px', borderRadius: '7px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', border: `1px solid ${canAct ? cfg.color : 'var(--border-color)'}`, background: canAct ? cfg.bg : 'var(--input-bg)', color: canAct ? cfg.color : 'var(--text-secondary)' }}>
                                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                            {canAct ? 'Update' : 'View'}
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded panel */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                            style={{ overflow: 'hidden', borderTop: '1px solid var(--border-color)' }}>
                                            <div style={{ padding: '1.25rem' }}>

                                                {/* Pipeline stepper */}
                                                <PipelineStepper currentStatus={s.status} />

                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

                                                    {/* LEFT: actions + address */}
                                                    <div>
                                                        <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
                                                            Update Status
                                                        </h4>

                                                        {nextStatuses.length === 0 ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#16a34a', fontWeight: 600, fontSize: '0.9rem', padding: '0.75rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                                                <CheckCircle2 size={18} /> Order delivered successfully.
                                                            </div>
                                                        ) : !canAct ? (
                                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem', background: 'var(--input-bg)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                                                                <AlertCircle size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: '1px' }} />
                                                                <span style={{ color: 'var(--text-secondary)' }}>
                                                                    This shipment is currently waiting for action from the <strong style={{ color: nextActor?.color }}>{nextActor?.roleLabel || 'next responsible team'}</strong>.
                                                                    Your role ({userRole.replace(/_/g, ' ')}) cannot update it at this stage.
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <textarea value={note} onChange={e => setNote(e.target.value)}
                                                                    placeholder="Add a note (optional)…"
                                                                    rows={2}
                                                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.88rem', resize: 'vertical', marginBottom: '0.75rem', boxSizing: 'border-box' }} />

                                                                {/* Packaging photo (store_manager at packaging stage only) */}
                                                                {(userRole === 'store_manager' || userRole === 'admin') && s.status === 'packaging' && (
                                                                    <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px' }}>
                                                                        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 700, fontSize: '0.82rem', color: '#7c3aed' }}>
                                                                            <Upload size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                                                            Upload Packaging Photo (required to mark Ready to Ship)
                                                                        </label>
                                                                        <input type="file" accept="image/*" onChange={handleImageUpload} style={{ fontSize: '0.82rem' }} />
                                                                        {imgPreview && (
                                                                            <>
                                                                                <img src={imgPreview} alt="Preview" style={{ marginTop: '8px', width: '100%', maxHeight: '130px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e9d5ff' }} />
                                                                                <button onClick={() => handleSubmitPackagingImage(s)}
                                                                                    style={{ marginTop: '8px', width: '100%', padding: '9px', borderRadius: '7px', border: 'none', background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}>
                                                                                    📦 Upload & Mark Ready to Ship
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* Action buttons */}
                                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                                    {nextStatuses.filter(ns => allowedStatuses.includes(ns)).map(ns => {
                                                                        const ncfg = STATUS_CONFIG[ns];
                                                                        return (
                                                                            <button key={ns} onClick={() => handleStatusUpdate(s, ns)}
                                                                                style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: ncfg?.color, color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem' }}>
                                                                                {ncfg?.icon} Mark as {ncfg?.label}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </>
                                                        )}

                                                        {/* Address box */}
                                                        <div style={{ marginTop: '1.25rem', padding: '0.85rem', borderRadius: '10px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', fontSize: '0.82rem' }}>
                                                            <div style={{ marginBottom: '5px' }}><strong>TO:</strong> {s.ship_to_name}</div>
                                                            <div style={{ color: 'var(--text-secondary)' }}>{s.ship_to_address}</div>
                                                            {s.ship_to_phone && <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}><Phone size={11} style={{ verticalAlign: 'middle' }} /> {s.ship_to_phone}</div>}
                                                            {s.ship_from_name && <>
                                                                <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px dashed var(--border-color)' }} />
                                                                <div style={{ marginBottom: '3px' }}><strong>FROM:</strong> {s.ship_from_name}</div>
                                                                <div style={{ color: 'var(--text-secondary)' }}>{s.ship_from_address}</div>
                                                            </>}
                                                        </div>

                                                        {s.packaging_image_path && (
                                                            <div style={{ marginTop: '0.75rem' }}>
                                                                <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px', color: '#7c3aed' }}>📸 Packaging Photo:</div>
                                                                <img src={`file://${s.packaging_image_path}`} alt="Packaging" style={{ width: '100%', maxHeight: '110px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* RIGHT: timeline */}
                                                    <div>
                                                        <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <History size={14} /> Status History
                                                        </h4>
                                                        {historyLoading ? (
                                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>
                                                        ) : history.length === 0 ? (
                                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No history yet.</div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                                                                {history.map((h, i) => {
                                                                    const hcfg = STATUS_CONFIG[h.status] || STATUS_CONFIG['pending_payment'];
                                                                    return (
                                                                        <div key={h.id} style={{ display: 'flex', gap: '0.75rem', position: 'relative' }}>
                                                                            {i < history.length - 1 && (
                                                                                <div style={{ position: 'absolute', left: '11px', top: '24px', bottom: 0, width: '2px', background: 'var(--border-color)' }} />
                                                                            )}
                                                                            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: hcfg.bg, border: `2px solid ${hcfg.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px', zIndex: 1 }}>
                                                                                <span style={{ color: hcfg.color }}>{hcfg.icon}</span>
                                                                            </div>
                                                                            <div style={{ paddingBottom: '12px', flex: 1 }}>
                                                                                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: hcfg.color }}>{hcfg.label}</div>
                                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                                    <strong>{h.updated_by}</strong> · <em>{h.updated_by_role?.replace(/_/g, ' ')}</em>
                                                                                </div>
                                                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{new Date(h.created_at).toLocaleString()}</div>
                                                                                {h.note && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '2px' }}>"{h.note}"</div>}
                                                                                {h.image_path && <div style={{ fontSize: '0.72rem', color: '#7c3aed', marginTop: '2px' }}>📸 Packaging photo attached</div>}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })
                )}
            </div>
        </DashboardLayout>
    );
};

export default ShippingDashboard;
