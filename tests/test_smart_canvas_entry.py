from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class SmartCanvasEntryTest(unittest.TestCase):
    def test_default_entry_mounts_react_and_preserves_the_original_fallback(self):
        html = (ROOT / "static" / "smart-canvas.html").read_text(encoding="utf-8")

        self.assertIn('id="world"', html)
        self.assertIn('id="composer"', html)
        self.assertIn('class="smart-nav"', html)
        self.assertIn('/static/css/smart-canvas.css', html)
        self.assertIn('/static/css/smart-canvas-classic-compat.css', html)
        self.assertIn('/static/css/smart-canvas-react.css', html)
        self.assertNotIn("'/static/css/canvas.css", html)
        self.assertIn('/static/js/smart-canvas.js', html)
        self.assertIn('id="smartCanvasApp"', html)
        self.assertIn('/static/dist/smart-canvas/smart-canvas-modern.js', html)
        self.assertIn('var reactEnabled = !forceLegacy', html)
        self.assertIn("entryParams.get('smart_canvas_react') === '0'", html)
        self.assertIn("entryParams.get('smart_canvas_legacy') === '1'", html)
        self.assertIn('window.__loadSmartCanvasLegacyFallback', html)

    def test_react_initialization_failure_uses_the_legacy_fallback(self):
        entry = (ROOT / "frontend" / "src" / "pages" / "smart-canvas.tsx").read_text(encoding="utf-8")

        self.assertIn("console.error('[smart-canvas] React entry failed'", entry)
        self.assertIn('await window.__loadSmartCanvasLegacyFallback()', entry)

    def test_smart_canvas_back_navigation_cannot_nest_the_site_shell(self):
        legacy = (ROOT / "static" / "js" / "smart-canvas.js").read_text(encoding="utf-8")
        experimental = (ROOT / "frontend" / "src" / "pages" / "smart-canvas.tsx").read_text(encoding="utf-8")

        self.assertIn("window.location.href = '/static/canvas.html", legacy)
        self.assertIn("managerBackHref: '/static/canvas.html'", experimental)
        self.assertNotIn("managerBackHref: '/static/index.html'", experimental)
        self.assertNotIn('SmartCanvasComposer', experimental)
        self.assertNotIn('editorAddon:', experimental)

    def test_experimental_smart_canvas_has_no_public_entry(self):
        self.assertFalse((ROOT / "static" / "smart-canvas-v2.html").exists())

    def test_site_shell_can_only_mount_at_the_top_level(self):
        entry = (ROOT / "frontend" / "src" / "pages" / "index.tsx").read_text(encoding="utf-8")

        self.assertIn("window.self !== window.top", entry)
        self.assertIn("topLevelUrl.searchParams.set(topLevelMarker, '1')", entry)
        self.assertIn("window.top?.location.replace(topLevelUrl.href)", entry)


if __name__ == "__main__":
    unittest.main()
