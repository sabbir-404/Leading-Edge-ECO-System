from __future__ import annotations

import os
import re
from pathlib import Path
from textwrap import wrap

BASE_DIR = Path(__file__).resolve().parent
MARKDOWN_FILE = BASE_DIR / 'LE-SOFT_Manuscript.md'
PDF_FILE = BASE_DIR / 'LE-SOFT_Manuscript.pdf'

PAGE_WIDTH = 595  # A4 points
PAGE_HEIGHT = 842
MARGIN_LEFT = 48
MARGIN_RIGHT = 48
MARGIN_TOP = 50
MARGIN_BOTTOM = 48
USABLE_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
LINE_HEIGHT = 13
TITLE_SIZE = 18
HEADING_SIZE = 13
BODY_SIZE = 10


def escape_pdf_text(text: str) -> str:
    return text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def parse_markdown_lines(md: str):
    lines = []
    for raw in md.splitlines():
        if not raw.strip():
            lines.append(("blank", ""))
            continue
        if raw.startswith('# '):
            lines.append(("title", raw[2:].strip()))
            continue
        if raw.startswith('## '):
            lines.append(("heading", raw[3:].strip()))
            continue
        if raw.startswith('- '):
            lines.append(("bullet", raw[2:].rstrip()))
            continue
        lines.append(("body", raw.rstrip()))
    return lines


def wrap_text(text: str, width_chars: int):
    return wrap(text, width=width_chars, break_long_words=False, break_on_hyphens=False) or [""]


def build_pages(md: str):
    content = parse_markdown_lines(md)
    pages = []
    current = []
    y = PAGE_HEIGHT - MARGIN_TOP

    def add_line(kind: str, text: str, font_size: int, indent: int = 0):
        nonlocal y, current
        available_chars = max(30, int((USABLE_WIDTH - indent) / (font_size * 0.55)))
        wrapped = wrap_text(text, available_chars)
        for idx, part in enumerate(wrapped):
            line_y = y
            current.append((kind, part, font_size, indent, line_y))
            y -= LINE_HEIGHT if font_size <= 10 else int(LINE_HEIGHT * 1.2)

    for kind, text in content:
        if kind == "blank":
            y -= LINE_HEIGHT // 2
            if y < MARGIN_BOTTOM:
                pages.append(current)
                current = []
                y = PAGE_HEIGHT - MARGIN_TOP
            continue

        if kind == "title":
            if current:
                pages.append(current)
                current = []
            y = PAGE_HEIGHT - MARGIN_TOP
            add_line(kind, text, TITLE_SIZE)
            y -= LINE_HEIGHT
        elif kind == "heading":
            if y < MARGIN_BOTTOM + 40:
                pages.append(current)
                current = []
                y = PAGE_HEIGHT - MARGIN_TOP
            y -= LINE_HEIGHT // 2
            add_line(kind, text, HEADING_SIZE)
            y -= LINE_HEIGHT // 3
        elif kind == "bullet":
            if y < MARGIN_BOTTOM + 20:
                pages.append(current)
                current = []
                y = PAGE_HEIGHT - MARGIN_TOP
            add_line(kind, f"- {text}", BODY_SIZE, indent=12)
        else:
            if y < MARGIN_BOTTOM + 20:
                pages.append(current)
                current = []
                y = PAGE_HEIGHT - MARGIN_TOP
            add_line(kind, text, BODY_SIZE)

    if current:
        pages.append(current)
    return pages


def make_pdf(md: str) -> bytes:
    pages = build_pages(md)
    page_count = len(pages)
    font_obj_id = 1
    font_bold_obj_id = 2
    content_start_id = 3
    page_start_id = content_start_id + page_count
    pages_obj_id = page_start_id + page_count
    catalog_obj_id = pages_obj_id + 1

    objects = [
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    ]

    content_obj_ids = []
    for page in pages:
        lines = ["BT"]
        current_font = None
        for kind, text, size, indent, line_y in page:
            selected_font_id = font_bold_obj_id if kind in ("title", "heading") else font_obj_id
            font_tag = 'F2' if kind in ("title", "heading") else 'F1'
            if current_font != selected_font_id or kind in ("title", "heading"):
                lines.append(f"/{font_tag} {size} Tf")
                current_font = selected_font_id
            x = MARGIN_LEFT + indent
            lines.append(f"1 0 0 1 {x} {line_y:.2f} Tm")
            lines.append(f"({escape_pdf_text(text)}) Tj")
        lines.append("ET")
        content_stream = "\n".join(lines)
        content_obj_ids.append(len(objects) + 1)
        objects.append(f"<< /Length {len(content_stream.encode('utf-8'))} >>\nstream\n{content_stream}\nendstream")

    page_obj_ids = []
    for content_id in content_obj_ids:
        page_obj_ids.append(len(objects) + 1)
        objects.append(
            f"<< /Type /Page /Parent {pages_obj_id} 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
            f"/Resources << /Font << /F1 {font_obj_id} 0 R /F2 {font_bold_obj_id} 0 R >> >> /Contents {content_id} 0 R >>"
        )

    kids = " ".join(f"{pid} 0 R" for pid in page_obj_ids)
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(page_obj_ids)} >>")
    objects.append(f"<< /Type /Catalog /Pages {pages_obj_id} 0 R >>")

    pdf_parts = ["%PDF-1.4\n"]
    offsets = [0]
    for idx, obj in enumerate(objects, start=1):
        offsets.append(sum(len(part.encode('utf-8')) for part in pdf_parts))
        pdf_parts.append(f"{idx} 0 obj\n{obj}\nendobj\n")

    xref_offset = sum(len(part.encode('utf-8')) for part in pdf_parts)
    xref = [f"xref\n0 {len(objects)+1}\n", "0000000000 65535 f \n"]
    for off in offsets[1:]:
        xref.append(f"{off:010d} 00000 n \n")
    trailer = f"trailer\n<< /Size {len(objects)+1} /Root {catalog_obj_id} 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n"
    pdf_parts.extend(xref)
    pdf_parts.append(trailer)
    return ''.join(pdf_parts).encode('utf-8')


def main() -> None:
    md = MARKDOWN_FILE.read_text(encoding='utf-8')
    PDF_FILE.write_bytes(make_pdf(md))
    print(f'Wrote {PDF_FILE}')


if __name__ == '__main__':
    main()
