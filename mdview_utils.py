from pathlib import Path

import mistune


_MARKDOWN_RENDERER = mistune.create_markdown(
    escape=False,
    hard_wrap=True,
    plugins=["table", "strikethrough", "task_lists", "footnotes"],
)


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


def render_markdown_html(text):
    return _MARKDOWN_RENDERER(text)
