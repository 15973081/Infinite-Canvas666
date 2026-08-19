from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class SmartCanvasEntryTest(unittest.TestCase):
    def test_default_entry_preserves_the_original_smart_canvas_shell(self):
        html = (ROOT / "static" / "smart-canvas.html").read_text(encoding="utf-8")

        self.assertIn('id="world"', html)
        self.assertIn('id="composer"', html)
        self.assertIn('class="smart-nav"', html)
        self.assertIn('/static/css/smart-canvas.css', html)
        self.assertIn('/static/js/smart-canvas.js', html)
        self.assertNotIn('id="smartCanvasApp"', html)
        self.assertNotIn('/static/dist/smart-canvas-modern.js', html)

    def test_smart_canvas_back_navigation_cannot_nest_the_site_shell(self):
        legacy = (ROOT / "static" / "js" / "smart-canvas.js").read_text(encoding="utf-8")
        experimental = (ROOT / "frontend" / "src" / "pages" / "smart-canvas.tsx").read_text(encoding="utf-8")

        self.assertIn("window.location.href = '/static/canvas.html", legacy)
        self.assertIn("managerBackHref: '/static/canvas.html'", experimental)
        self.assertNotIn("managerBackHref: '/static/index.html'", experimental)
        self.assertNotIn('SmartCanvasComposer', experimental)
        self.assertNotIn('editorAddon:', experimental)


if __name__ == "__main__":
    unittest.main()
