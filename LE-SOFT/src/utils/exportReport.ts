import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

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

    // Header
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

    // Table
    const body = [...rows];
    if (footerRow) {
        body.push(footerRow);
    }

    autoTable(doc, {
        head: [columns],
        body,
        startY: subtitle ? 34 : 28,
        theme: 'grid',
        headStyles: {
            fillColor: [99, 102, 241],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 9,
        },
        bodyStyles: {
            fontSize: 8.5,
        },
        footStyles: {
            fillColor: [240, 240, 255],
            textColor: [30, 30, 30],
            fontStyle: 'bold',
        },
        alternateRowStyles: {
            fillColor: [248, 248, 252],
        },
        margin: { top: 10, left: 14, right: 14 },
        didParseCell: (data) => {
            // Bold footer row
            if (footerRow && data.row.index === body.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [235, 235, 248];
            }
        }
    });

    // Footer with date
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


// ─── Excel Export ────────────────────────────────────────

interface ExcelOptions {
    title: string;
    columns: string[];
    rows: (string | number)[][];
    sheetName?: string;
}

export const exportExcel = (options: ExcelOptions) => {
    const { title, columns, rows, sheetName = 'Report' } = options;

    // Build worksheet data: title row, empty row, header, data rows
    const wsData = [
        [title],
        [`Generated: ${new Date().toLocaleString()}`],
        [],
        columns,
        ...rows,
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Style column widths
    ws['!cols'] = columns.map(col => ({ wch: Math.max(col.length + 4, 15) }));

    // Merge title row
    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: columns.length - 1 } },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${title.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
};
