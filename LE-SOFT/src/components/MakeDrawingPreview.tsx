import React, { useEffect, useRef, useState } from 'react';
import { Download, Expand, FileText, Loader2, Maximize2, X } from 'lucide-react';
import { mountMakeDxfViewer, type MakeDxfViewerInstance } from './MakeCadViewer';
import { resolveImageSrc } from '../utils/imageSrc';

type Props = { url?: string | null; label: string; compact?: boolean };

function extensionOf(url: string): string {
  try { return new URL(url, window.location.href).pathname.split('.').pop()?.toLowerCase() || ''; }
  catch { return url.split('?')[0].split('.').pop()?.toLowerCase() || ''; }
}

export const MakeDrawingPreview: React.FC<Props> = ({ url, label, compact = false }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<MakeDxfViewerInstance | null>(null);
  const ext = url ? extensionOf(url) : '';
  const supportedDxf = ext === 'dxf';

  useEffect(() => {
    if (!open || !url || !supportedDxf || !hostRef.current) return;
    let active = true;
    setLoading(true);
    setError('');
    void mountMakeDxfViewer(hostRef.current, url).then(instance => {
      if (!active) instance.destroy();
      else viewerRef.current = instance;
    }).catch((e: any) => setError(e?.message || 'This DXF drawing could not be displayed.')).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; viewerRef.current?.destroy(); viewerRef.current = null; };
  }, [open, url, supportedDxf]);

  if (!url) return null;
  const previewUrl = resolveImageSrc(url);
  return <>
    <button type="button" onClick={() => setOpen(true)} title={`View ${label}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-color)', borderRadius: 7, padding: '6px 10px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: compact ? 11 : 12, fontWeight: 700 }}>
      <Expand size={14} /> View {label}
    </button>
    {open && <div role="dialog" aria-modal="true" aria-label={`${label} preview`} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(8,12,20,.78)', display: 'grid', placeItems: 'center', padding: 18 }}>
      <div style={{ width: 'min(1100px, 96vw)', height: 'min(760px, 92vh)', background: 'var(--card-bg, #fff)', border: '1px solid var(--border-color, #ddd)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border-color, #ddd)' }}><FileText size={17} /><strong style={{ flex: 1 }}>{label}</strong>
          {supportedDxf && <button type="button" title="Fit drawing" onClick={() => viewerRef.current?.fit()}><Maximize2 size={16} /></button>}
          <a href={previewUrl} download style={{ display: 'inline-flex' }} title="Download drawing"><Download size={17} /></a>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close preview"><X size={18} /></button></div>
        <div style={{ position: 'relative', flex: 1, minHeight: 0, background: supportedDxf ? '#fff' : '#f5f6f8' }}>
          {supportedDxf ? <div ref={hostRef} style={{ width: '100%', height: '100%' }} /> : ext === 'pdf' ? <iframe title={label} src={previewUrl} style={{ width: '100%', height: '100%', border: 0 }} /> : ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext) ? <img src={previewUrl} alt={label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div style={{ padding: 22 }}>This file type is available to download. The built-in open-source preview currently handles DXF drawings; DWG files require a separately licensed decoder to render in the app.</div>}
          {loading && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.8)' }}><Loader2 className="upload-spinner" /> Loading drawing…</div>}
          {error && <div role="alert" style={{ padding: 16, color: '#b91c1c' }}>{error}</div>}
        </div>
      </div>
    </div>}
  </>;
};

export default MakeDrawingPreview;
