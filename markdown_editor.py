#!/usr/bin/env python3
from pathlib import Path

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
gi.require_version("WebKit", "6.0")

from gi.repository import Gio, Gtk, GLib, Gdk, WebKit

from mdview_utils import (
    build_preview_html,
    compute_scroll_ratio,
    generate_nonce,
    render_mermaid_blocks,
    render_markdown_html,
    should_block_policy_decision,
    suggested_pdf_filename,
)

DEBOUNCE_MS = 150
APP_ID = "dev.example.MarkdownPreview"
APP_ICON_NAME = "mdview"
BASE_DIR = Path(__file__).resolve().parent
MERMAID_BUNDLE_PATH = BASE_DIR / "assets" / "vendor" / "mermaid.min.js"


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

        self.menu_actions = []

        header = Gtk.HeaderBar()
        header.set_title_widget(Gtk.Label(label="mdview"))
        self.set_titlebar(header)

        header.pack_start(self.build_menu_button("File", self.build_file_menu()))
        header.pack_start(self.build_menu_button("Edit", self.build_edit_menu()))
        header.pack_start(self.build_menu_button("About", self.build_about_menu()))

        sync_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        sync_box.append(Gtk.Label(label="Sync Scroll"))
        self.sync_switch = Gtk.Switch()
        self.sync_switch.set_active(True)
        self.sync_switch.connect("state-set", self.on_sync_switch_state_set)
        sync_box.append(self.sync_switch)
        header.pack_end(sync_box)

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
            self.configure_webview_settings(settings)

        self.webview.connect("decide-policy", self.on_webview_decide_policy)

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

    def register_menu_action(self, action):
        self.add_action(action)
        self.menu_actions.append(action)

    def build_menu_button(self, label, menu_model):
        button = Gtk.MenuButton()
        button.set_label(label)
        button.set_menu_model(menu_model)
        return button

    def build_file_menu(self):
        open_action = Gio.SimpleAction.new("open", None)
        open_action.connect("activate", self.on_open_action)
        self.register_menu_action(open_action)

        save_action = Gio.SimpleAction.new("save", None)
        save_action.connect("activate", self.on_save_action)
        self.register_menu_action(save_action)

        save_as_action = Gio.SimpleAction.new("save_as", None)
        save_as_action.connect("activate", self.on_save_as_action)
        self.register_menu_action(save_as_action)

        export_pdf_action = Gio.SimpleAction.new("export_pdf", None)
        export_pdf_action.connect("activate", self.on_export_pdf_action)
        self.register_menu_action(export_pdf_action)

        quit_action = Gio.SimpleAction.new("quit", None)
        quit_action.connect("activate", self.on_quit_action)
        self.register_menu_action(quit_action)

        menu = Gio.Menu.new()
        menu.append("Open", "win.open")
        menu.append("Save", "win.save")
        menu.append("Save As", "win.save_as")
        menu.append("Export PDF", "win.export_pdf")
        menu.append("Quit", "win.quit")
        return menu

    def build_edit_menu(self):
        clear_action = Gio.SimpleAction.new("clear", None)
        clear_action.connect("activate", self.on_clear_action)
        self.register_menu_action(clear_action)

        copy_html_action = Gio.SimpleAction.new("copy_html", None)
        copy_html_action.connect("activate", self.on_copy_html_action)
        self.register_menu_action(copy_html_action)

        dark_action = Gio.SimpleAction.new_stateful(
            "toggle_dark", None, GLib.Variant.new_boolean(False)
        )
        dark_action.connect("change-state", self.on_toggle_dark_action_state)
        self.register_menu_action(dark_action)

        sync_action = Gio.SimpleAction.new_stateful(
            "toggle_sync_scroll", None, GLib.Variant.new_boolean(True)
        )
        sync_action.connect("change-state", self.on_toggle_sync_action_state)
        self.register_menu_action(sync_action)

        menu = Gio.Menu.new()
        menu.append("Clear", "win.clear")
        menu.append("Copy HTML", "win.copy_html")
        menu.append("Dark Mode", "win.toggle_dark")
        menu.append("Sync Scroll", "win.toggle_sync_scroll")
        return menu

    def build_about_menu(self):
        about_action = Gio.SimpleAction.new("about", None)
        about_action.connect("activate", self.on_about_action)
        self.register_menu_action(about_action)

        menu = Gio.Menu.new()
        menu.append("About mdview", "win.about")
        return menu

    def configure_webview_settings(self, settings):
        setting_values = {
            "set_enable_write_console_messages_to_stdout": True,
            "set_enable_javascript": True,
            "set_enable_webgl": False,
            "set_enable_webaudio": False,
            "set_enable_mediasource": False,
            "set_enable_media": False,
            "set_enable_media_capabilities": False,
            "set_enable_back_forward_navigation_gestures": False,
            "set_enable_hyperlink_auditing": False,
        }

        for method_name, value in setting_values.items():
            method = getattr(settings, method_name, None)
            if method is not None:
                method(value)

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

        html_body = render_markdown_html(text)

        html_body = render_mermaid_blocks(html_body)
        mermaid_script_path = None
        if MERMAID_BUNDLE_PATH.exists():
            mermaid_script_path = "assets/vendor/mermaid.min.js"

        return build_preview_html(
            html_body,
            is_dark=self.is_dark,
            mermaid_script_path=mermaid_script_path,
            nonce=generate_nonce(),
        )

    def update_preview(self):
        html = self.build_html()
        self.webview.load_html(html, f"{BASE_DIR.resolve().as_uri()}/")
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

    def on_open_action(self, _action, _parameter):
        self.on_open_file(None)

    def on_save_action(self, _action, _parameter):
        self.on_save_file(None)

    def on_save_as_action(self, _action, _parameter):
        self.on_save_as_file(None)

    def on_export_pdf_action(self, _action, _parameter):
        self.on_export_pdf(None)

    def on_clear_action(self, _action, _parameter):
        self.on_clear_editor(None)

    def on_copy_html_action(self, _action, _parameter):
        self.on_copy_html(None)

    def on_toggle_dark_action_state(self, action, state):
        self.is_dark = state.get_boolean()
        action.set_state(state)
        self.update_preview()

    def on_toggle_sync_action_state(self, action, state):
        self.sync_scroll_enabled = state.get_boolean()
        action.set_state(state)
        self.sync_switch.set_active(self.sync_scroll_enabled)
        if self.sync_scroll_enabled:
            self.schedule_sync_scroll()

    def on_quit_action(self, _action, _parameter):
        app = self.get_application()
        if app is not None:
            app.quit()

    def on_about_action(self, _action, _parameter):
        dialog = Gtk.AboutDialog(transient_for=self, modal=True)
        dialog.set_program_name("mdview")
        dialog.set_comments("Lightweight GTK Markdown editor with live preview")
        dialog.present()

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

    def on_webview_decide_policy(self, _webview, decision, decision_type):
        decision_type_name = decision_type.value_nick

        navigation_type = None
        if decision_type == WebKit.PolicyDecisionType.NAVIGATION_ACTION:
            nav_action = decision.get_navigation_action()
            if nav_action is not None:
                navigation_type = nav_action.get_navigation_type().value_nick

        if should_block_policy_decision(decision_type_name, navigation_type):
            decision.ignore()
            return True
        return False

    def on_sync_switch_state_set(self, _switch, state):
        self.sync_scroll_enabled = bool(state)
        action = self.lookup_action("toggle_sync_scroll")
        if action is not None:
            action.set_state(GLib.Variant.new_boolean(self.sync_scroll_enabled))
        if self.sync_scroll_enabled:
            self.schedule_sync_scroll()
        return False

    def on_toggle_dark(self, _button):
        self.is_dark = not self.is_dark
        action = self.lookup_action("toggle_dark")
        if action is not None:
            action.set_state(GLib.Variant.new_boolean(self.is_dark))
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
