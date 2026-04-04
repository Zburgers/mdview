import unittest

from mdview_utils import compute_scroll_ratio, suggested_pdf_filename


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


if __name__ == "__main__":
    unittest.main()
