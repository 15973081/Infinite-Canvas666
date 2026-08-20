from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class SmartCanvasEntryTest(unittest.TestCase):
    def test_default_entry_uses_the_react_vite_smart_canvas(self):
        html = (ROOT / "static" / "smart-canvas.html").read_text(encoding="utf-8")

        self.assertIn('id="smartCanvasApp"', html)
        self.assertIn('/static/dist/smart-canvas-modern.js', html)
        self.assertIn('/static/css/canvas.css', html)
        self.assertNotIn('/static/css/smart-canvas.css', html)
        self.assertNotIn('/static/js/smart-canvas.js', html)
        self.assertNotIn('/static/js/canvas-core.js', html)
        self.assertNotIn('/static/js/canvas-api.js', html)
        self.assertNotIn('id="world"', html)
        self.assertNotIn('id="composer"', html)

    def test_smart_canvas_back_navigation_cannot_nest_the_site_shell(self):
        legacy = (ROOT / "static" / "js" / "smart-canvas.js").read_text(encoding="utf-8")
        production = (ROOT / "frontend" / "src" / "pages" / "smart-canvas.tsx").read_text(encoding="utf-8")

        self.assertIn("window.location.href = '/static/canvas.html", legacy)
        self.assertIn("managerBackHref: '/static/canvas.html'", production)
        self.assertNotIn("managerBackHref: '/static/index.html'", production)
        self.assertNotIn('SmartCanvasComposer', production)
        self.assertNotIn('editorAddon:', production)

    def test_obsolete_experimental_alias_has_no_public_entry(self):
        self.assertFalse((ROOT / "static" / "smart-canvas-v2.html").exists())

    def test_site_shell_can_only_mount_at_the_top_level(self):
        entry = (ROOT / "frontend" / "src" / "pages" / "index.tsx").read_text(encoding="utf-8")

        self.assertIn("window.self !== window.top", entry)
        self.assertIn("topLevelUrl.searchParams.set(topLevelMarker, '1')", entry)
        self.assertIn("window.top?.location.replace(topLevelUrl.href)", entry)


if __name__ == "__main__":
    unittest.main()
