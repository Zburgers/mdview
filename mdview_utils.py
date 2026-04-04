from pathlib import Path


def compute_scroll_ratio(upper, page_size, value):
    max_scroll = upper - page_size
    if max_scroll <= 0:
        return 0.0
    ratio = value / max_scroll
    return max(0.0, min(1.0, ratio))


def suggested_pdf_filename(current_basename):
    if not current_basename:
        return "document.pdf"
    return f"{Path(current_basename).stem}.pdf"
