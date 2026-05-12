import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';

// ─── PDF Export ──────────────────────────────────────────

interface PDFOptions {
    title: string;
    subtitle?: string;
    columns: string[];
    rows: (string | number)[][];
    footerRow?: (string | number)[];
    orientation?: 'portrait' | 'landscape';
}

export const exportPDF = (options: PDFOptions) => {
    const { title, subtitle, columns, rows, footerRow, orientation = 'portrait' } = options;
    const doc = new jsPDF({ orientation });

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, 20);

    if (subtitle) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120);
        doc.text(subtitle, 14, 28);
        doc.setTextColor(0);
    }

    const body = [...rows];
    if (footerRow) body.push(footerRow);

    autoTable(doc, {
        head: [columns],
        body,
        startY: subtitle ? 34 : 28,
        theme: 'grid',
        headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 8.5 },
        footStyles: { fillColor: [240, 240, 255], textColor: [30, 30, 30], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 252] },
        margin: { top: 10, left: 14, right: 14 },
        didParseCell: (data) => {
            if (footerRow && data.row.index === body.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [235, 235, 248];
            }
        },
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.text(`Generated on ${new Date().toLocaleString()} — LE-SOFT`, 14, pageHeight - 10);
        doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() - 40, pageHeight - 10);
    }

    doc.save(`${title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
};


// ─── Excel Export (exceljs — replaces vulnerable xlsx) ───

interface ExcelOptions {
    title: string;
    columns: string[];
    rows: (string | number)[][];
    sheetName?: string;
}

export const exportExcel = async (options: ExcelOptions): Promise<void> => {
    const { title, columns, rows, sheetName = 'Report' } = options;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'LE-SOFT';
    wb.created = new Date();

    const ws = wb.addWorksheet(sheetName);

    // Title row
    const titleRow = ws.addRow([title]);
    titleRow.font = { bold: true, size: 14 };
    ws.mergeCells(1, 1, 1, columns.length);

    // Generated timestamp row
    const genRow = ws.addRow([`Generated: ${new Date().toLocaleString()}`]);
    genRow.font = { italic: true, size: 9, color: { argb: 'FF888888' } };
    ws.mergeCells(2, 1, 2, columns.length);

    ws.addRow([]); // spacer

    // Header row
    const headerRow = ws.addRow(columns);
    headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF4F46E5' } } };
    });

    // Data rows with alternating background
    rows.forEach((dataRow, i) => {
        const row = ws.addRow(dataRow);
        if (i % 2 === 1) {
            row.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8FC' } };
            });
        }
    });

    // Auto column widths
    ws.columns = columns.map(col => ({ width: Math.max(col.length + 4, 15) }));

    // Write buffer and trigger browser download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
