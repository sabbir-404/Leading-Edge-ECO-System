import React, { useEffect, useRef, useCallback } from 'react';
import JsBarcode from 'jsbarcode';
import { X, Printer } from 'lucide-react';

export type StickerSize = '38x25' | '50x30' | '58x40' | '100x50';

interface StickerConfig {
  width: StickerSize;
  printer: string;
}

interface Props {
  product: {
    name: string;
    sku: string;
    selling_price: number;
  };
  config: StickerConfig;
  onClose: () => void;
}

// Dimensions in mm → convert to px at 96dpi (1mm ≈ 3.7795px)
const STICKER_DIMS: Record<StickerSize, { w: number; h: number }> = {
  '38x25': { w: 144, h: 95 },
  '50x30': { w: 189, h: 113 },
  '58x40': { w: 219, h: 151 },
  '100x50': { w: 378, h: 189 },
};

const BarcodeStickerModal: React.FC<Props> = ({ product, config, onClose }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const dims = STICKER_DIMS[config.width];
  const barcodeValue = product.sku || product.name.replace(/\s+/g, '').slice(0, 20) || '000000000';

  const generateBarcode = useCallback(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, barcodeValue, {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        width: 1.5,
        height: dims.h * 0.35,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch (e) {
      console.error('Barcode generation error:', e);
    }
  }, [barcodeValue, dims.h]);

  useEffect(() => { generateBarcode(); }, [generateBarcode]);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=600,height=400');
    if (!printWindow) return;

    const svg = svgRef.current?.outerHTML || '';
    const mmW = config.width.split('x')[0];
    const mmH = config.width.split('x')[1];

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Barcode</title>
        <style>
          @page {
            size: ${mmW}mm ${mmH}mm;
            margin: 0;
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: ${mmW}mm;
            height: ${mmH}mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: Arial, sans-serif;
            padding: 2mm;
            background: white;
          }
          .product-name {
            font-size: ${Number(mmW) < 50 ? '6pt' : '8pt'};
            font-weight: 700;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
            margin-bottom: 1mm;
            letter-spacing: 0.2px;
          }
          .barcode-wrap {
            width: 100%;
            display: flex;
            justify-content: center;
          }
          .barcode-wrap svg {
            width: 100%;
            height: auto;
          }
          .barcode-text {
            font-size: ${Number(mmW) < 50 ? '5pt' : '6pt'};
            letter-spacing: 1px;
            text-align: center;
            margin-top: 0.5mm;
            font-family: monospace;
          }
          .row {
            display: flex;
            justify-content: space-between;
            width: 100%;
            margin-top: 1mm;
          }
          .sku {
            font-size: ${Number(mmW) < 50 ? '5pt' : '6pt'};
            color: #555;
          }
          .price {
            font-size: ${Number(mmW) < 50 ? '7pt' : '9pt'};
            font-weight: 800;
            color: #000;
          }
        </style>
      </head>
      <body>
        <div class="product-name">${product.name}</div>
        <div class="barcode-wrap">${svg}</div>
        <div class="barcode-text">${barcodeValue}</div>
        <div class="row">
          <span class="sku">SKU: ${product.sku || '—'}</span>
          <span class="price">৳ ${product.selling_price?.toLocaleString() || '0'}</span>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--border-color)',
        borderRadius: '16px', padding: '1.5rem', width: '380px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Barcode Sticker</h3>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {config.width}mm &nbsp;|&nbsp; {config.printer || 'Default Printer'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Sticker Preview */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          background: '#f8fafc',
          border: '1px dashed #cbd5e1',
          borderRadius: '10px',
          padding: '1.5rem',
          marginBottom: '1.25rem',
        }}>
          <div style={{
            width: dims.w, height: dims.h,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '6px 8px',
            gap: '3px',
          }}>
            {/* Product Name */}
            <div style={{
              fontSize: `${Math.max(7, dims.w / 25)}px`,
              fontWeight: 700, textAlign: 'center',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: '100%', color: '#000', letterSpacing: '0.3px'
            }}>
              {product.name}
            </div>

            {/* Barcode SVG */}
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              <svg ref={svgRef} style={{ width: '100%', height: 'auto' }} />
            </div>

            {/* Barcode Value */}
            <div style={{
              fontSize: `${Math.max(6, dims.w / 30)}px`,
              fontFamily: 'monospace', letterSpacing: '1px', color: '#000'
            }}>
              {barcodeValue}
            </div>

            {/* SKU + Price row */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', width: '100%',
              marginTop: '2px'
            }}>
              <span style={{ fontSize: `${Math.max(6, dims.w / 32)}px`, color: '#666' }}>
                {product.sku ? `SKU: ${product.sku}` : ''}
              </span>
              <span style={{
                fontSize: `${Math.max(8, dims.w / 20)}px`,
                fontWeight: 800, color: '#000'
              }}>
                ৳ {product.selling_price?.toLocaleString() || '0'}
              </span>
            </div>
          </div>
        </div>

        {/* Print Button */}
        <button
          onClick={handlePrint}
          style={{
            width: '100%', padding: '12px',
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            color: 'white', border: 'none', borderRadius: '10px',
            fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          <Printer size={18} /> Print Sticker
        </button>
      </div>
    </div>
  );
};

export default BarcodeStickerModal;
