import unittest

from mdview_utils import (
    build_preview_html,
    compute_scroll_ratio,
    render_mermaid_blocks,
    render_markdown_html,
    suggested_pdf_filename,
)


class ComputeScrollRatioTests(unittest.TestCase):
    def test_returns_zero_when_not_scrollable(self):
        self.assertEqual(compute_scroll_ratio(100.0, 100.0, 50.0), 0.0)

    def test_returns_ratio_for_middle_position(self):
        self.assertEqual(compute_scroll_ratio(200.0, 100.0, 25.0), 0.25)

    def test_clamps_to_zero_for_negative_value(self):
        self.assertEqual(compute_scroll_ratio(200.0, 100.0, -10.0), 0.0)

    def test_clamps_to_one_for_overflow_value(self):
        self.assertEqual(compute_scroll_ratio(200.0, 100.0, 500.0), 1.0)


class SuggestedPdfFilenameTests(unittest.TestCase):
    def test_uses_default_for_missing_name(self):
        self.assertEqual(suggested_pdf_filename(None), "document.pdf")

    def test_reuses_stem_for_markdown_name(self):
        self.assertEqual(suggested_pdf_filename("notes.md"), "notes.pdf")

    def test_reuses_stem_for_non_markdown_name(self):
        self.assertEqual(suggested_pdf_filename("draft.txt"), "draft.pdf")


class RenderMarkdownHtmlTests(unittest.TestCase):
    def test_renders_strikethrough_plugin(self):
        html = render_markdown_html("~~removed~~")
        self.assertIn("<del>removed</del>", html)

    def test_renders_table_plugin(self):
        html = render_markdown_html("|a|\n|-|\n|b|")
        self.assertIn("<table>", html)

    def test_renders_task_lists_plugin(self):
        html = render_markdown_html("- [x] done")
        self.assertIn("task-list-item", html)

    def test_renders_footnotes_plugin(self):
        html = render_markdown_html("a[^1]\n\n[^1]: note")
        self.assertIn("footnotes", html)

    def test_renders_mermaid_code_fence_with_language_class(self):
        html = render_markdown_html("```mermaid\nflowchart TD\nA-->B\n```")
        self.assertIn('class="language-mermaid"', html)


class RenderMermaidBlocksTests(unittest.TestCase):
    def test_converts_mermaid_code_block_to_mermaid_pre(self):
        html = (
            '<p>Pipeline</p><pre><code class="language-mermaid">'
            "flowchart TD\nA--&gt;B\n"
            "</code></pre>"
        )

        rendered = render_mermaid_blocks(html)

        self.assertIn('<pre class="mermaid">flowchart TD\nA--&gt;B\n</pre>', rendered)

    def test_leaves_non_mermaid_code_blocks_untouched(self):
        html = '<pre><code class="language-python">print("ok")</code></pre>'
        rendered = render_mermaid_blocks(html)
        self.assertEqual(rendered, html)


class BuildPreviewHtmlTests(unittest.TestCase):
    def test_embeds_csp_and_sandbox_restrictions(self):
        html = build_preview_html("<p>Hello</p>", is_dark=False, nonce="fixed")

        self.assertIn("Content-Security-Policy", html)
        self.assertIn("default-src 'none'", html)
        self.assertIn("connect-src 'none'", html)
        self.assertIn("object-src 'none'", html)
        self.assertIn("script-src 'self' 'nonce-fixed'", html)

    def test_includes_mermaid_bootstrap_when_script_path_set(self):
        html = build_preview_html(
            '<pre class="mermaid">flowchart TD\nA--&gt;B\n</pre>',
            is_dark=False,
            mermaid_script_path="assets/vendor/mermaid.min.js",
            nonce="fixed",
        )

        self.assertIn('<script src="assets/vendor/mermaid.min.js"></script>', html)
        self.assertIn("if (window.mermaid)", html)
        self.assertIn("securityLevel: 'strict'", html)


if __name__ == "__main__":
    unittest.main()
