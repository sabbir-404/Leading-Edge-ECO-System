import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import './Quotation.css';

// ── Number to words (Bangladeshi) ─────────────────────────────────────────────
const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
               'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
               'Seventeen','Eighteen','Nineteen'];
const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];

function numToWords(n: number): string {
  if (n === 0) return 'Zero';
  n = Math.round(n);
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh  = Math.floor(n / 100000);  n %= 100000;
  const thou  = Math.floor(n / 1000);    n %= 1000;
  const hund  = Math.floor(n / 100);     n %= 100;

  const twoDigit = (x: number) =>
    x < 20 ? ones[x] : tens[Math.floor(x/10)] + (x%10 ? ' ' + ones[x%10] : '');

   let result = '';
  if (crore) result += twoDigit(crore) + ' Crore ';
  if (lakh)  result += twoDigit(lakh)  + ' Lakh ';
  if (thou)  result += twoDigit(thou)  + ' Thousand ';
  if (hund)  result += ones[hund]       + ' Hundred ';
  if (n > 0) result += twoDigit(n);
  return result.trim();
}

// ── Bold formatter ─────────────────────────────────────────────────────────────
function renderBold(html: string) {
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function QuotationPreview() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (id && id !== 'preview') {
      // Load from DB
      (window as any).electron.getQuotation(Number(id)).then((q: any) => setData(q)).catch(console.error);
    } else {
      // Load from sessionStorage (preview mode)
      const raw = sessionStorage.getItem('quotation_preview');
      if (raw) setData(JSON.parse(raw));
    }
  }, [id]);

  if (!data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888' }}>
      Loading preview...
    </div>
  );

  const items = data.items || data.quotation_items || [];
  const terms = data.terms || data.terms_json || [];
  const grandTotal = data.grandTotal ?? data.grand_total ?? 0;
  const fittingCharge = data.fittingCharge ?? data.fitting_charge ?? 0;
  const deliveryCharge = data.deliveryCharge ?? data.delivery_charge ?? 0;
  const discount = data.discount ?? 0;

  const formatDate = (d?: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.');
  };

  return (
    <div className="quot-preview-page" style={{ background: '#e5e7eb', minHeight: '100vh', padding: '1.5rem' }}>
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="quot-preview-topbar">
        <button className="quot-btn-secondary" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {id && id !== 'preview' && (
            <button className="quot-btn-secondary" onClick={() => navigate(`/quotations/edit/${id}`)}>
              Edit
            </button>
          )}
          <button className="quot-btn-primary" onClick={() => window.print()}>
            <Printer size={16} /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════
           PAGE 1
         ══════════════════════════════════════ */}
      <div className="quot-sheet" id="quot-page-1">
        {/* Header */}
        <div className="qs-header">
          <div className="qs-logo-area">
            <h2>LE<span style={{ color: '#d1d5db' }}>ADING</span></h2>
            <div className="qs-logo-sub">E &nbsp;&nbsp; D &nbsp;&nbsp; G &nbsp;&nbsp; E</div>
          </div>

          <div className="qs-title-area">
            <span className="qs-title">QUOTATION</span>
            <table className="qs-meta-table">
              <tbody>
                <tr>
                  <td>QUOTE</td>
                  <td>{data.quoteNumber || data.quote_number || '—'}</td>
                </tr>
                <tr>
                  <td>DATE</td>
                  <td>{formatDate(data.quoteDate || data.quote_date)}</td>
                </tr>
                <tr>
                  <td>VALID UNTIL</td>
                  <td>{formatDate(data.validUntil || data.valid_until)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Customer + Concerned */}
        <div className="qs-customer-block">
          <div className="qs-cust-col">
            <div className="qs-cust-header">CUSTOMER INFO</div>
            <div className="qs-cust-body">
              {(data.companyName || data.company_name) && <div>Company Name: <strong>{data.companyName || data.company_name}</strong></div>}
              <div>Name: <strong>{data.customerName || data.customer_name}</strong></div>
              <div>Address: {data.customerAddress || data.customer_address || 'N/A'}</div>
              <div>Mobile: <strong>{data.customerMobile || data.customer_mobile}</strong></div>
              <div>Email: {data.customerEmail || data.customer_email || 'N/A'}</div>
            </div>
          </div>
          <div className="qs-concern-col">
            <div className="qs-concern-header">CONCERNED PERSON</div>
            <div className="qs-concern-body" style={{ textAlign: 'right' }}>
              <div>{data.concernedName || data.concerned_name || 'X'}</div>
              <div>{data.concernedPhone || data.concerned_phone}</div>
              <div>{data.concernedEmail || data.concerned_email}</div>
            </div>
          </div>
        </div>

        {/* Product Table */}
        <table className="qs-product-table">
          <thead>
            <tr>
              <th style={{ width: '6mm' }}>SL</th>
              <th style={{ width: '33mm' }}>Picture</th>
              <th>Specification</th>
              <th style={{ width: '13mm' }}>Unit</th>
              <th style={{ width: '13mm' }}>Quantity</th>
              <th style={{ width: '16mm' }}>Rate</th>
              <th style={{ width: '18mm' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => {
              const imgSrc = item.imagePreview || (item.image_path ? `file://${item.image_path}` : '');
              const qty = item.quantity || item.qty || 0;
              const rate = item.rate || 0;
              const amt = qty * rate;
              return (
                <tr key={idx} style={{ height: '32mm' }}>
                  <td className="sl-cell">{item.sl_no || idx + 1}</td>
                  <td className="pic-cell">
                    {imgSrc ? <img src={imgSrc} alt="" /> : null}
                  </td>
                  <td className="spec-cell">
                    {(item.specification || '').split('\n').map((line: string, li: number) => (
                      <div key={li} dangerouslySetInnerHTML={{ __html: line.replace(/\*(.*?)\*/g, '<strong>$1</strong>') || '&nbsp;' }} />
                    ))}
                  </td>
                  <td>{item.unit || 'pcs'}</td>
                  <td>{qty || ''}</td>
                  <td>{rate ? rate.toLocaleString() : ''}</td>
                  <td>{amt ? amt.toLocaleString() : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Summary */}
        <table className="qs-summary-table">
          <tbody>
            <tr>
              <td style={{ border: 'none', flex: 1 }}></td>
              <td className="label-cell">Fitting charge</td>
              <td className="value-cell">{fittingCharge.toLocaleString()}</td>
            </tr>
            <tr>
              <td style={{ border: 'none' }}></td>
              <td className="label-cell">Delivery charge</td>
              <td className="value-cell">{deliveryCharge.toLocaleString()}</td>
            </tr>
            <tr>
              <td style={{ border: 'none' }}></td>
              <td className="label-cell">Discount</td>
              <td className="value-cell">{discount.toLocaleString()}</td>
            </tr>
            <tr className="qs-total-row">
              <td style={{ border: 'none' }}></td>
              <td className="label-cell">Total Cost</td>
              <td className="value-cell">{grandTotal.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
        <div className="qs-total-words">
          <strong>Total (In Word):</strong> {numToWords(grandTotal)} taka only
        </div>

        <div className="qs-page-num">Page 1 of 2</div>
      </div>

      {/* ══════════════════════════════════════
           PAGE 2 (Terms)
         ══════════════════════════════════════ */}
      <div className="quot-sheet" id="quot-page-2" style={{ marginTop: '1rem', pageBreakBefore: 'always' }}>
        {/* Terms */}
        <div className="qs-terms-section">
          <div className="qs-terms-title">Terms &amp; Condition:</div>
          <ol className="qs-terms-list">
            {terms.map((t: string, i: number) => (
              <li key={i}>{renderBold(t)}</li>
            ))}
          </ol>
        </div>

        {/* Prepared By */}
        <div className="qs-prepared-by">
          <div className="qs-pb-label">Prepared by</div>
          <div className="qs-pb-name">{data.preparedBy || data.prepared_by}</div>
          <div style={{ fontSize: '8pt' }}>{data.preparedByRole || data.prepared_by_role}</div>
        </div>

        {/* Electronic note */}
        <div className="qs-electronic-note">
          *THIS QUOTATION HAS BEEN ELECTRONICALLY GENERATED AND DOES NOT REQUIRE A SIGNATURE FOR AUTHENTICATION
        </div>

        {/* Footer */}
        <div className="qs-footer">
          © <strong>LEADING EDGE 2021</strong> | 78/1 Amtoli Chairman Bari Road, Mohakhali, Dhaka-1212. 01959 902 550-55. sales@leadingedge.com.bd<br />
          Facebook: facebook.com/leadingedgebd &nbsp;||&nbsp; For Web: www.leadingedge.com.bd
        </div>

        <div className="qs-page-num">Page 2 of 2</div>
      </div>
    </div>
  );
}
