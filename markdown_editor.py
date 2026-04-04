#!/usr/bin/env python3
from pathlib import Path

import gi
import markdown

gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
gi.require_version("WebKit", "6.0")

from gi.repository import Gio, Gtk, GLib, Gdk, WebKit

from mdview_utils import compute_scroll_ratio, suggested_pdf_filename

DEBOUNCE_MS = 150
APP_ID = "dev.example.MarkdownPreview"
APP_ICON_NAME = "mdview"


class MarkdownEditorWindow(Gtk.ApplicationWindow):
    def __init__(self, app):
        super().__init__(application=app)
        self.set_default_size(1200, 700)
        self.set_icon_name(APP_ICON_NAME)

        self._update_source_id = None
        self._sync_scroll_source_id = None
        self.is_dark = False
        self.sync_scroll_enabled = True
        self.current_file = None

        self.file_dialog = Gtk.FileDialog()
        self.file_dialog.set_title("Open Markdown File")
        self.file_dialog.set_filters(self.build_markdown_filters())

        self.save_dialog = Gtk.FileDialog()
        self.save_dialog.set_title("Save Markdown File")
        self.save_dialog.set_filters(self.build_markdown_filters())

        header = Gtk.HeaderBar()
        header.set_title_widget(Gtk.Label(label="mdview"))
        self.set_titlebar(header)

        copy_button = Gtk.Button(label="Copy HTML")
        copy_button.connect("clicked", self.on_copy_html)
        header.pack_start(copy_button)

        open_button = Gtk.Button(label="Open")
        open_button.connect("clicked", self.on_open_file)
        header.pack_start(open_button)

        save_button = Gtk.Button(label="Save")
        save_button.connect("clicked", self.on_save_file)
        header.pack_start(save_button)

        save_as_button = Gtk.Button(label="Save As")
        save_as_button.connect("clicked", self.on_save_as_file)
        header.pack_start(save_as_button)

        clear_button = Gtk.Button(label="Clear")
        clear_button.connect("clicked", self.on_clear_editor)
        header.pack_start(clear_button)

        pdf_button = Gtk.Button(label="Export PDF")
        pdf_button.connect("clicked", self.on_export_pdf)
        header.pack_start(pdf_button)

        sync_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        sync_box.append(Gtk.Label(label="Sync Scroll"))
        self.sync_switch = Gtk.Switch()
        self.sync_switch.set_active(True)
        self.sync_switch.connect("state-set", self.on_sync_switch_state_set)
        sync_box.append(self.sync_switch)
        header.pack_end(sync_box)

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
        self.editor_adjustment = self.editor_scroll.get_vadjustment()
        self.editor_adjustment.connect("value-changed", self.on_editor_scroll_changed)

        self.webview = WebKit.WebView()
        self.webview.set_hexpand(True)
        self.webview.set_vexpand(True)
        self.webview.set_size_request(320, -1)

        settings = self.webview.get_settings()
        if settings is not None:
            settings.set_enable_write_console_messages_to_stdout(True)

        paned.set_end_child(self.webview)

        self.textbuffer.connect("changed", self.on_textbuffer_changed)
        self.webview.connect("load-changed", self.on_webview_load_changed)

        self.update_window_title()
        self.update_preview()

    def build_markdown_filters(self):
        filters = Gio.ListStore.new(Gtk.FileFilter)

        markdown_filter = Gtk.FileFilter()
        markdown_filter.set_name("Markdown files")
        markdown_filter.add_suffix("md")
        markdown_filter.add_suffix("markdown")
        markdown_filter.add_mime_type("text/markdown")
        markdown_filter.add_mime_type("text/plain")
        filters.append(markdown_filter)

        all_files_filter = Gtk.FileFilter()
        all_files_filter.set_name("All files")
        all_files_filter.add_pattern("*")
        filters.append(all_files_filter)

        return filters

    def update_window_title(self):
        if self.current_file is None:
            self.set_title("mdview - Untitled")
            return
        basename = self.current_file.get_basename() or "Untitled"
        self.set_title(f"mdview - {basename}")

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
    <script>
        function setScrollRatio(ratio) {{
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            if (maxScroll <= 0) {{
                return;
            }}
            const clamped = Math.min(1, Math.max(0, ratio));
            window.scrollTo(0, maxScroll * clamped);
        }}
    </script>
</body>
</html>
"""

    def update_preview(self):
        html = self.build_html()
        self.webview.load_html(html, None)
        self._update_source_id = None
        return False

    def schedule_sync_scroll(self):
        if not self.sync_scroll_enabled:
            return
        if self._sync_scroll_source_id is not None:
            GLib.source_remove(self._sync_scroll_source_id)
        self._sync_scroll_source_id = GLib.timeout_add(20, self.apply_sync_scroll)

    def apply_sync_scroll(self):
        ratio = compute_scroll_ratio(
            self.editor_adjustment.get_upper(),
            self.editor_adjustment.get_page_size(),
            self.editor_adjustment.get_value(),
        )
        self.webview.evaluate_javascript(f"setScrollRatio({ratio});", -1)
        self._sync_scroll_source_id = None
        return False

    def on_copy_html(self, _button):
        html = self.build_html()
        clipboard = Gdk.Display.get_default().get_clipboard()
        clipboard.set(html)

    def on_open_file(self, _button):
        self.file_dialog.open(self, None, self.on_open_file_finish)

    def on_open_file_finish(self, dialog, result):
        try:
            file = dialog.open_finish(result)
        except GLib.Error:
            return

        try:
            success, contents, _etag = file.load_contents(None)
            if not success:
                return
            text = contents.decode("utf-8")
        except (GLib.Error, UnicodeDecodeError):
            return

        self.textbuffer.set_text(text)
        self.current_file = file
        self.update_window_title()

    def on_save_file(self, _button):
        if self.current_file is None:
            self.on_save_as_file(_button)
            return
        self.write_markdown_to_file(self.current_file)

    def on_save_as_file(self, _button):
        if self.current_file is not None:
            self.save_dialog.set_initial_file(self.current_file)
        else:
            self.save_dialog.set_initial_name("untitled.md")
        self.save_dialog.save(self, None, self.on_save_as_file_finish)

    def on_save_as_file_finish(self, dialog, result):
        try:
            file = dialog.save_finish(result)
        except GLib.Error:
            return

        self.write_markdown_to_file(file)
        self.current_file = file
        self.update_window_title()

    def write_markdown_to_file(self, file):
        text = self.get_markdown_text().encode("utf-8")
        try:
            file.replace_contents(
                text,
                None,
                False,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                None,
            )
        except GLib.Error:
            return

    def on_clear_editor(self, _button):
        self.textbuffer.set_text("")

    def on_export_pdf(self, _button):
        export_dialog = Gtk.FileDialog()
        export_dialog.set_title("Export PDF")
        suggested_name = suggested_pdf_filename(
            None if self.current_file is None else self.current_file.get_basename()
        )
        export_dialog.set_initial_name(suggested_name)
        export_dialog.save(self, None, self.on_export_pdf_finish)

    def on_export_pdf_finish(self, dialog, result):
        try:
            file = dialog.save_finish(result)
        except GLib.Error:
            return

        settings = Gtk.PrintSettings()
        settings.set(Gtk.PRINT_SETTINGS_OUTPUT_URI, file.get_uri())
        settings.set(Gtk.PRINT_SETTINGS_OUTPUT_FILE_FORMAT, "pdf")

        operation = WebKit.PrintOperation.new(self.webview)
        operation.set_print_settings(settings)
        operation.print_()

    def on_editor_scroll_changed(self, _adjustment):
        self.schedule_sync_scroll()

    def on_webview_load_changed(self, _webview, load_event):
        if load_event == WebKit.LoadEvent.FINISHED:
            self.schedule_sync_scroll()

    def on_sync_switch_state_set(self, _switch, state):
        self.sync_scroll_enabled = bool(state)
        if self.sync_scroll_enabled:
            self.schedule_sync_scroll()
        return False

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
