#!/usr/bin/env python3
from pathlib import Path

import gi
import markdown

gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
gi.require_version("WebKit", "6.0")

from gi.repository import Gtk, GLib, Gdk, WebKit

DEBOUNCE_MS = 150
APP_ID = "dev.example.MarkdownPreview"
APP_ICON_NAME = "mdview"


class MarkdownEditorWindow(Gtk.ApplicationWindow):
    def __init__(self, app):
        super().__init__(application=app)
        self.set_title("mdview")
        self.set_default_size(1200, 700)
        self.set_icon_name(APP_ICON_NAME)

        self._update_source_id = None
        self.is_dark = False

        header = Gtk.HeaderBar()
        header.set_title_widget(Gtk.Label(label="mdview"))
        self.set_titlebar(header)

        copy_button = Gtk.Button(label="Copy HTML")
        copy_button.connect("clicked", self.on_copy_html)
        header.pack_start(copy_button)

        pdf_button = Gtk.Button(label="Export PDF")
        pdf_button.connect("clicked", self.on_export_pdf)
        header.pack_start(pdf_button)

        theme_button = Gtk.Button(label="Toggle Dark")
        theme_button.connect("clicked", self.on_toggle_dark)
        header.pack_end(theme_button)

        paned = Gtk.Paned.new(Gtk.Orientation.HORIZONTAL)
        paned.set_resize_start_child(True)
        paned.set_resize_end_child(True)
        paned.set_shrink_start_child(False)
        paned.set_shrink_end_child(False)
        paned.set_position(600)
        self.set_child(paned)

        self.textbuffer = Gtk.TextBuffer()
        self.textbuffer.set_text(
            "# Hello Markdown\n\n"
            "Type *Markdown* on the left, and see **HTML preview** on the right.\n\n"
            "- Item 1\n"
            "- Item 2\n\n"
            "```python\n"
            "print('Hello from code block')\n"
            "```"
        )

        self.textview = Gtk.TextView.new_with_buffer(self.textbuffer)
        self.textview.set_wrap_mode(Gtk.WrapMode.WORD)
        self.textview.set_monospace(True)

        self.editor_scroll = Gtk.ScrolledWindow()
        self.editor_scroll.set_child(self.textview)
        self.editor_scroll.set_hexpand(True)
        self.editor_scroll.set_vexpand(True)
        self.editor_scroll.set_min_content_width(320)
        paned.set_start_child(self.editor_scroll)

        self.webview = WebKit.WebView()
        self.webview.set_hexpand(True)
        self.webview.set_vexpand(True)
        self.webview.set_size_request(320, -1)

        settings = self.webview.get_settings()
        if settings is not None:
            settings.set_enable_write_console_messages_to_stdout(True)

        paned.set_end_child(self.webview)

        self.textbuffer.connect("changed", self.on_textbuffer_changed)

        self.update_preview()

    def on_textbuffer_changed(self, _buffer):
        if self._update_source_id is not None:
            GLib.source_remove(self._update_source_id)
        self._update_source_id = GLib.timeout_add(DEBOUNCE_MS, self.update_preview)

    def get_markdown_text(self):
        start = self.textbuffer.get_start_iter()
        end = self.textbuffer.get_end_iter()
        return self.textbuffer.get_text(start, end, False)

    def build_html(self):
        text = self.get_markdown_text()

        html_body = markdown.markdown(
            text, extensions=["fenced_code", "tables", "nl2br"]
        )

        if self.is_dark:
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

        return f"""
<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        :root {{
            color-scheme: {"dark" if self.is_dark else "light"};
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
</body>
</html>
"""

    def update_preview(self):
        html = self.build_html()
        self.webview.load_html(html, None)
        self._update_source_id = None
        return False

    def on_copy_html(self, _button):
        html = self.build_html()
        clipboard = Gdk.Display.get_default().get_clipboard()
        clipboard.set(html)

    def on_export_pdf(self, _button):
        print("Export PDF not implemented yet")

    def on_toggle_dark(self, _button):
        self.is_dark = not self.is_dark
        self.update_preview()


class MarkdownEditorApp(Gtk.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID)
        self._setup_icon_theme_search_path()
        self.connect("activate", self.on_activate)

    def _setup_icon_theme_search_path(self):
        display = Gdk.Display.get_default()
        if display is None:
            return

        icon_theme = Gtk.IconTheme.get_for_display(display)
        icons_dir = Path(__file__).resolve().parent / "icons"
        icon_theme.add_search_path(str(icons_dir))

    def on_activate(self, app):
        win = MarkdownEditorWindow(app)
        win.present()


def main():
    app = MarkdownEditorApp()
    app.run()


if __name__ == "__main__":
    main()
