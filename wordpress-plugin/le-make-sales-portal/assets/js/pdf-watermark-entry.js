import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

window.LEMakePdfWatermark = async function watermarkProductDrawing(file) {
  if (!file || file.type !== 'application/pdf') return file;
  const document = await PDFDocument.load(await file.arrayBuffer());
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  for (const page of document.getPages()) {
    const { width, height } = page.getSize();
    const text = 'LEADING EDGE';
    const size = Math.max(26, Math.min(48, width / 13));
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: Math.max(20, (width - textWidth) / 2),
      y: Math.max(30, height / 2),
      size,
      font,
      color: rgb(0.38, 0.42, 0.48),
      opacity: 0.16,
      rotate: degrees(-28),
    });
  }
  const output = await document.save();
  return new File([output], file.name, { type: 'application/pdf', lastModified: file.lastModified });
};
