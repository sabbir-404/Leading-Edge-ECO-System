'use strict';
const fs = require('fs');

// ─── Brand palette (PDF RGB 0–1 floats) ────────────────────────────────────
const C = {
  ORANGE : '0.976 0.451 0.086',   // #F97316
  ORANGE2: '0.796 0.337 0.024',   // #CB5606 darker
  OR_LT  : '0.996 0.871 0.800',   // #FEE0CC light tint
  NAVY   : '0.118 0.161 0.231',   // #1E293B
  NAVY2  : '0.184 0.247 0.353',   // #2F3F5A lighter navy
  SLATE  : '0.392 0.455 0.545',   // #64748B
  SILVER : '0.824 0.851 0.882',   // #D2D9E1
  LIGHT  : '0.945 0.961 0.976',   // #F1F5F9
  WHITE  : '1 1 1',
};

function esc(s) {
  return s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}

function wrapText(text, maxChars) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

// ─── Cover page stream ─────────────────────────────────────────────────────
function makeCoverStream(totalScreenshots) {
  const A4W = 595, A4H = 842, ML = 40;
  const date = new Date().toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'});
  return [
    // Full dark navy background
    `${C.NAVY} rg  0 0 ${A4W} ${A4H} re f`,

    // Top accent bar
    `${C.ORANGE} rg  0 ${A4H-8} ${A4W} 8 re f`,
    // Bottom accent bar
    `0 0 ${A4W} 8 re f`,

    // Top-right decorative squares
    `${C.NAVY2} rg  ${A4W-140} ${A4H-140} 130 130 re f`,
    `${C.ORANGE} rg  ${A4W-125} ${A4H-125} 80 80 re f`,
    `${C.OR_LT} rg   ${A4W-80}  ${A4H-80}  30 30 re f`,

    // Three orange dots above divider
    `${C.ORANGE} rg`,
    `${ML} 430 12 12 re f`,
    `${ML+20} 430 12 12 re f`,
    `${ML+40} 430 12 12 re f`,

    // Horizontal rule
    `${C.ORANGE} RG  1.5 w  ${ML} 420 ${A4W-ML-ML} 0 re S`,

    // Bottom-left corner accent
    `${C.NAVY2} rg  0 0 70 70 re f`,
    `${C.ORANGE} rg  0 0 35 35 re f`,

    // ── Typography ──
    'BT',
    // "LE-SOFT" mega title
    `${C.WHITE} rg  /F2 54 Tf  1 0 0 1 ${ML} 600 Tm (LE-SOFT) Tj`,
    // Orange subtitle
    `${C.ORANGE} rg  /F2 18 Tf  1 0 0 1 ${ML} 558 Tm (Software Manuscript) Tj`,
    // Product line (silver)
    `0.780 0.820 0.878 rg  /F1 11 Tf  1 0 0 1 ${ML} 532 Tm (Leading Edge ECO-System \\226 Desktop Application) Tj`,
    // Version + date
    `/F1 9.5 Tf  1 0 0 1 ${ML} 503 Tm (Version 1.3.8   |   ${esc(date)}) Tj`,

    // Description block (below rule)
    `0.780 0.820 0.878 rg  /F1 9.5 Tf`,
    `1 0 0 1 ${ML} 396 Tm (This document is an automated visual walkthrough of every module) Tj`,
    `1 0 0 1 ${ML} 381 Tm (and page in LE-SOFT. Screenshots were taken live from the running) Tj`,
    `1 0 0 1 ${ML} 366 Tm (Electron application using Playwright automation.) Tj`,

    // Stats row
    `${C.ORANGE} rg  /F2 28 Tf  1 0 0 1 ${ML} 316 Tm (${totalScreenshots + 1}) Tj`,
    `0.780 0.820 0.878 rg  /F1 9 Tf  1 0 0 1 ${ML+40} 322 Tm (Total pages) Tj`,
    `${C.ORANGE} rg  /F2 28 Tf  1 0 0 1 ${ML+150} 316 Tm (${totalScreenshots}) Tj`,
    `0.780 0.820 0.878 rg  /F1 9 Tf  1 0 0 1 ${ML+190} 322 Tm (Screenshots) Tj`,

    // Confidential footer
    `0.392 0.455 0.545 rg  /F1 7.5 Tf  1 0 0 1 ${ML} 20 Tm (CONFIDENTIAL \\226 Leading Edge ECO-System \\226 Internal Distribution Only) Tj`,
    'ET',
  ].join('\n');
}

// ─── Content page stream ───────────────────────────────────────────────────
function makePageStream(entry, imgId, pageNum, totalPages) {
  const A4W = 595, A4H = 842, ML = 36, MR = 36;
  const IW   = A4W - ML - MR;        // image width
  const IH   = 332;                   // image height
  const HDR  = 40;                    // header bar height
  const FOOT = 22;                    // footer bar height
  const IMG_Y   = A4H - HDR - IH - 4;
  const descLines = wrapText(entry.description, 87);
  const CARD_H  = Math.min(descLines.length * 13 + 32, 120);
  const CARD_Y  = IMG_Y - 8 - CARD_H;

  return [
    // White background
    `${C.WHITE} rg  0 0 ${A4W} ${A4H} re f`,

    // Orange header
    `${C.ORANGE} rg  0 ${A4H-HDR} ${A4W} ${HDR} re f`,
    // Navy left accent on header
    `${C.NAVY} rg  0 ${A4H-HDR} 5 ${HDR} re f`,
    // Corner dot top-right
    `${C.ORANGE} rg  ${A4W-13} ${A4H-13} 13 13 re f`,

    // Header title
    'BT',
    `${C.WHITE} rg  /F2 11.5 Tf  1 0 0 1 ${ML} ${A4H-HDR+14} Tm (${esc(entry.title)}) Tj`,
    // Page number in header (right-aligned)
    `0.996 0.871 0.800 rg  /F1 8 Tf  1 0 0 1 ${A4W-MR-55} ${A4H-HDR+15} Tm (${pageNum} / ${totalPages}) Tj`,
    'ET',

    // Screenshot
    `q ${IW} 0 0 ${IH} ${ML} ${IMG_Y} cm /Im${imgId} Do Q`,

    // Subtle silver border around screenshot
    `${C.SILVER} RG  0.5 w  ${ML} ${IMG_Y} ${IW} ${IH} re S`,

    // Shadow strip below image
    `0.878 0.906 0.933 rg  ${ML} ${IMG_Y-4} ${IW} 4 re f`,

    // Description card background
    `${C.LIGHT} rg  ${ML} ${CARD_Y} ${IW} ${CARD_H} re f`,
    // Orange left stripe on card
    `${C.ORANGE} rg  ${ML} ${CARD_Y} 4 ${CARD_H} re f`,
    // Top border on card
    `${C.SILVER} RG  0.4 w  ${ML} ${CARD_Y+CARD_H} ${IW} 0 re S`,

    // Description text
    'BT',
    `${C.NAVY} rg  /F2 7.5 Tf  1 0 0 1 ${ML+12} ${CARD_Y+CARD_H-14} Tm (DESCRIPTION) Tj`,
    `${C.SLATE} rg  /F1 8.5 Tf`,
    ...descLines.map((l, i) =>
      `1 0 0 1 ${ML+12} ${CARD_Y+CARD_H-27-i*13} Tm (${esc(l)}) Tj`
    ),
    'ET',

    // Footer
    `${C.NAVY} rg  0 0 ${A4W} ${FOOT} re f`,
    `${C.ORANGE} rg  0 0 4 ${FOOT} re f`,
    'BT',
    `${C.ORANGE} rg  /F2 7 Tf  1 0 0 1 ${ML} 7 Tm (LE-SOFT  |  Leading Edge ECO-System) Tj`,
    `0.780 0.820 0.878 rg  /F1 7 Tf  1 0 0 1 ${A4W-MR-80} 7 Tm (${esc(entry.title.split('\u2014')[0].trim())}) Tj`,
    'ET',
  ].join('\n');
}

// ─── Main builder ──────────────────────────────────────────────────────────
function buildPDF(entries) {
  const A4W = 595, A4H = 842;
  const objects = [];
  const addObj  = body => { objects.push(body); return objects.length; };

  const F_REG  = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const F_BOLD = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  const totalPages = entries.length + 1;

  // ── Cover ─────────────────────────────────────────────────────────────────
  const coverStream = makeCoverStream(entries.length);
  const coverCId = addObj(`<< /Length ${Buffer.byteLength(coverStream)} >>\nstream\n${coverStream}\nendstream`);
  const coverPId = addObj(
    `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${A4W} ${A4H}] ` +
    `/Resources << /Font << /F1 ${F_REG} 0 R /F2 ${F_BOLD} 0 R >> >> /Contents ${coverCId} 0 R >>`
  );
  const pageIds = [coverPId];

  // ── Content pages ─────────────────────────────────────────────────────────
  for (let i = 0; i < entries.length; i++) {
    const entry    = entries[i];
    const imgBytes = fs.readFileSync(entry.imagePath);
    const imgId    = objects.length + 1;
    objects.push({ type: 'image', bytes: imgBytes, w: 1440, h: 900 });

    const stream = makePageStream(entry, imgId, i + 2, totalPages);
    const cId    = addObj(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    const pId    = addObj(
      `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${A4W} ${A4H}] ` +
      `/Resources << /Font << /F1 ${F_REG} 0 R /F2 ${F_BOLD} 0 R >> /XObject << /Im${imgId} ${imgId} 0 R >> >> ` +
      `/Contents ${cId} 0 R >>`
    );
    pageIds.push(pId);
  }

  // ── Catalog ───────────────────────────────────────────────────────────────
  const pagesId   = addObj(`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  for (let i = 0; i < objects.length; i++) {
    if (typeof objects[i] === 'string')
      objects[i] = objects[i].replace(/PAGES_REF/g, `${pagesId} 0 R`);
  }

  // ── Serialise ─────────────────────────────────────────────────────────────
  const parts   = [Buffer.from('%PDF-1.4\n%\xff\xff\xff\xff\n')];
  const offsets = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(parts.reduce((s, b) => s + b.length, 0));
    const o = objects[i];
    if (o && o.type === 'image') {
      const dict = `<< /Type /XObject /Subtype /Image /Width ${o.w} /Height ${o.h}` +
        ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${o.bytes.length} >>`;
      parts.push(
        Buffer.from(`${i+1} 0 obj\n`),
        Buffer.from(dict + '\nstream\n'),
        o.bytes,
        Buffer.from('\nendstream\nendobj\n')
      );
    } else {
      parts.push(Buffer.from(`${i+1} 0 obj\n${String(o)}\nendobj\n`));
    }
  }
  const xrefOff = parts.reduce((s, b) => s + b.length, 0);
  let xref = `xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10,'0')} 00000 n \n`;
  parts.push(Buffer.from(
    xref +
    `trailer\n<< /Size ${objects.length+1} /Root ${catalogId} 0 R >>\n` +
    `startxref\n${xrefOff}\n%%EOF\n`
  ));
  return Buffer.concat(parts);
}

module.exports = { buildPDF };
