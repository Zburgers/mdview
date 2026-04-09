from pathlib import Path
import re

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


_MERMAID_CODE_BLOCK_RE = re.compile(
    r'<pre><code class="language-mermaid">(.*?)</code></pre>',
    re.DOTALL,
)


def render_mermaid_blocks(html_body):
    return _MERMAID_CODE_BLOCK_RE.sub(r'<pre class="mermaid">\1</pre>', html_body)


def build_preview_html(
    html_body,
    *,
    is_dark,
    mermaid_script_path=None,
    nonce,
):
    if is_dark:
        bg = "#1e1e1e"
        fg = "#e6e6e6"
        muted = "#b8b8b8"
        code_bg = "#2b2b2b"
        border = "#3a3a3a"
    else:
        bg = "#ffffff"
        fg = "#1f2328"
        muted = "#57606a"
        code_bg = "#f6f8fa"
        border = "#d0d7de"

    mermaid_loader = ""
    if mermaid_script_path:
        mermaid_loader = (
            f'<script src="{mermaid_script_path}"></script>'
            f'<script nonce="{nonce}">'
            "if (window.mermaid) {"
            "mermaid.initialize({"
            "startOnLoad: false,"
            "securityLevel: 'strict',"
            "theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default'"
            "});"
            "mermaid.run({querySelector: 'pre.mermaid'});"
            "}"
            "</script>"
        )

    csp = (
        "default-src 'none'; "
        f"script-src 'self' 'nonce-{nonce}'; "
        "style-src 'unsafe-inline'; "
        "img-src 'self' data:; "
        "font-src 'self' data:; "
        "connect-src 'none'; "
        "media-src 'none'; "
        "frame-src 'none'; "
        "object-src 'none'; "
        "base-uri 'none'; "
        "form-action 'none'"
    )

    return f"""
<!doctype html>
<html data-theme={"dark" if is_dark else "light"}>
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="{csp}">
    <meta name="referrer" content="no-referrer">
    <style>
        :root {{
            color-scheme: {"dark" if is_dark else "light"};
        }}
        html, body {{
            margin: 0;
            padding: 0;
            background: {bg};
            color: {fg};
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            line-height: 1.6;
        }}
        body {{
            padding: 24px;
            max-width: 900px;
        }}
        h1, h2, h3, h4 {{
            margin-top: 1.4em;
            margin-bottom: 0.6em;
        }}
        p, ul, ol, pre, blockquote {{
            margin-top: 0.8em;
            margin-bottom: 0.8em;
        }}
        a {{
            color: #0969da;
        }}
        pre {{
            background: {code_bg};
            border: 1px solid {border};
            padding: 12px;
            border-radius: 8px;
            overflow-x: auto;
        }}
        code {{
            font-family: "JetBrains Mono", "Fira Code", monospace;
            font-size: 0.95em;
        }}
        :not(pre) > code {{
            background: {code_bg};
            border: 1px solid {border};
            padding: 0.15em 0.35em;
            border-radius: 6px;
        }}
        blockquote {{
            border-left: 4px solid {border};
            padding-left: 12px;
            color: {muted};
            margin-left: 0;
        }}
        table {{
            border-collapse: collapse;
            width: 100%;
        }}
        th, td {{
            border: 1px solid {border};
            padding: 8px 10px;
            text-align: left;
        }}
    </style>
</head>
<body>
    {html_body}
    {mermaid_loader}
    <script nonce="{nonce}">
        function setScrollRatio(ratio) {{
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            if (maxScroll <= 0) {{
                return;
            }}
            const clamped = Math.min(1, Math.max(0, ratio));
            window.scrollTo(0, maxScroll * clamped);
        }}

        document.addEventListener('click', function(event) {{
            const anchor = event.target.closest('a[href]');
            if (anchor) {{
                event.preventDefault();
            }}
        }});
    </script>
</body>
</html>
"""
