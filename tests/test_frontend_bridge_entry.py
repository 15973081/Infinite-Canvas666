from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class FrontendBridgeEntryTest(unittest.TestCase):
    def test_classic_canvas_loads_built_bridge_after_legacy_canvas(self):
        html = (ROOT / "static" / "canvas.html").read_text(encoding="utf-8")
        legacy = '/static/js/canvas.js?v=2026.07.23.4'
        modern = '/static/dist/canvas-modern.js?v=2026.08.14.7'

        self.assertLess(html.index(legacy), html.index(modern))
        self.assertGreater((ROOT / "static" / "dist" / "canvas-modern.js").stat().st_size, 0)

    def test_legacy_bridge_is_read_only(self):
        source = (ROOT / "static" / "js" / "canvas.js").read_text(encoding="utf-8")
        start = source.index("window.CanvasLegacyBridge = Object.freeze({")
        end = source.index("async function saveCanvas()", start)
        bridge = source[start:end]

        self.assertIn("getDocumentSnapshot()", bridge)
        self.assertIn("JSON.parse(JSON.stringify", bridge)
        self.assertIn("computeLegacyCascadeOrder(targetId)", bridge)
        self.assertIn("computeLegacyRetryCascadeOrder(nodeId)", bridge)
        self.assertNotIn("scheduleSave(", bridge)

    def test_graph_order_activation_falls_back_to_legacy_functions(self):
        source = (ROOT / "static" / "js" / "canvas.js").read_text(encoding="utf-8")

        self.assertIn("window.CanvasModernCore?.activeOrder?.(kind, targetId)", source)
        self.assertIn(
            "computeModernGraphOrder('cascade', targetId) ?? computeLegacyCascadeOrder(targetId)",
            source,
        )
        self.assertIn(
            "computeModernGraphOrder('retry', nodeId) ?? computeLegacyRetryCascadeOrder(nodeId)",
            source,
        )

    def test_shadow_observers_run_only_at_execution_entries(self):
        source = (ROOT / "static" / "js" / "canvas.js").read_text(encoding="utf-8")
        self.assertEqual(1, source.count("observeOrder?.('cascade'"))
        self.assertEqual(1, source.count("observeOrder?.('retry'"))

    def test_execution_shadow_observes_lifecycle_without_replacing_executor(self):
        source = (ROOT / "static" / "js" / "canvas.js").read_text(encoding="utf-8")

        self.assertEqual(1, source.count("observeExecution?.({phase:'begin'"))
        self.assertEqual(1, source.count("observeExecution?.({phase:'node-start'"))
        self.assertEqual(1, source.count("observeExecution?.({phase:'node-done'"))
        self.assertIn("ctx?.mode === 'parallel'", source)
        self.assertIn("runOpts.loopContext?.index", source)
        self.assertEqual(1, source.count("observeExecution?.({phase:'stop'"))
        self.assertEqual(1, source.count("observeExecution?.({phase:'finish'"))


if __name__ == "__main__":
    unittest.main()
