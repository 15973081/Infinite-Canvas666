from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class FrontendBridgeEntryTest(unittest.TestCase):
    def test_classic_canvas_loads_built_bridge_after_legacy_canvas(self):
        html = (ROOT / "static" / "canvas.html").read_text(encoding="utf-8")
        legacy = '/static/js/canvas.js?v=2026.07.23.4'
        modern = '/static/dist/canvas-modern.js?v=2026.08.18.20'

        self.assertLess(html.index(legacy), html.index(modern))
        self.assertGreater((ROOT / "static" / "dist" / "canvas-modern.js").stat().st_size, 0)
        react_chunks = list((ROOT / "static" / "dist").glob("react-execution-entry-*.js"))
        self.assertEqual(1, len(react_chunks))
        self.assertGreater(react_chunks[0].stat().st_size, 0)

    def test_legacy_bridge_exposes_detached_snapshots_and_whitelisted_commands(self):
        source = (ROOT / "static" / "js" / "canvas.js").read_text(encoding="utf-8")
        snapshot_start = source.index("function legacyDocumentSnapshot(){")
        start = source.index("window.CanvasLegacyBridge = Object.freeze({")
        end = source.index("async function saveCanvas()", start)
        bridge = source[start:end]
        snapshot = source[snapshot_start:start]

        self.assertIn("getDocumentSnapshot()", bridge)
        self.assertIn("getActivitySnapshot()", bridge)
        self.assertIn("getStatusSnapshot()", bridge)
        self.assertIn("JSON.parse(JSON.stringify", snapshot)
        self.assertIn("computeLegacyCascadeOrder(targetId)", bridge)
        self.assertIn("computeLegacyRetryCascadeOrder(nodeId)", bridge)
        self.assertIn("command === 'stop-execution'", bridge)
        self.assertIn("command === 'retry-execution'", bridge)
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

    def test_stage_four_and_five_features_are_independently_opt_in(self):
        source = (ROOT / "frontend" / "src" / "main.ts").read_text(encoding="utf-8")

        self.assertIn("canvas_execution_engine", source)
        self.assertIn("canvas_task_client", source)
        self.assertIn("canvas_repository", source)
        self.assertIn("canvas_m2", source)
        self.assertIn("canvas_react_execution", source)
        self.assertIn("canvas_react_islands", source)
        self.assertIn("executionEngineEnabled", source)
        self.assertIn("taskClientEnabled", source)
        self.assertIn("canvasRepositoryEnabled", source)
        self.assertIn("runOrderedExecution", source)
        self.assertIn("runParallelExecution", source)
        self.assertIn("createTaskClient()", source)
        self.assertIn("createCanvasRepository()", source)
        self.assertIn("getM2Report", source)

    def test_react_execution_island_has_an_independent_fallback(self):
        html = (ROOT / "static" / "canvas.html").read_text(encoding="utf-8")
        source = (ROOT / "frontend" / "src" / "main.ts").read_text(encoding="utf-8")

        self.assertIn('id="canvasExecutionIsland"', html)
        self.assertIn('hidden', html[html.index('id="canvasExecutionIsland"'):][:100])
        self.assertIn("reactExecutionIslandEnabled", source)
        self.assertIn("import('./canvas/ui/react-execution-entry')", source)

    def test_react_status_island_has_one_legacy_event_source_and_fallback(self):
        html = (ROOT / "static" / "canvas.html").read_text(encoding="utf-8")
        legacy = (ROOT / "static" / "js" / "canvas.js").read_text(encoding="utf-8")
        source = (ROOT / "frontend" / "src" / "main.ts").read_text(encoding="utf-8")

        self.assertEqual(1, legacy.count("new CustomEvent('canvas-legacy-status'"))
        self.assertIn("canvasStatusSnapshot = {kind:canvasStatusKind(text)", legacy)
        self.assertIn('id="canvasStatusIsland" hidden', html)
        self.assertIn("canvas_react_status", source)
        self.assertIn("mountReactStatusIsland", source)

    def test_react_toolbar_uses_bridge_commands_and_keeps_legacy_fallback(self):
        html = (ROOT / "static" / "canvas.html").read_text(encoding="utf-8")
        legacy = (ROOT / "static" / "js" / "canvas.js").read_text(encoding="utf-8")
        source = (ROOT / "frontend" / "src" / "main.ts").read_text(encoding="utf-8")

        self.assertIn('id="canvasToolbarIsland" hidden', html)
        self.assertIn("runCommand(command, payload={})", legacy)
        self.assertIn("command === 'open-cost'", legacy)
        self.assertIn("command === 'open-log'", legacy)
        self.assertIn("command === 'open-backups'", legacy)
        self.assertIn("canvas_react_toolbar", source)
        self.assertIn("mountReactToolbarIsland", source)

    def test_document_and_activity_stores_have_single_legacy_event_sources(self):
        html = (ROOT / "static" / "canvas.html").read_text(encoding="utf-8")
        legacy = (ROOT / "static" / "js" / "canvas.js").read_text(encoding="utf-8")
        source = (ROOT / "frontend" / "src" / "main.ts").read_text(encoding="utf-8")

        self.assertEqual(1, legacy.count("new CustomEvent('canvas-legacy-document'"))
        self.assertEqual(1, legacy.count("new CustomEvent('canvas-legacy-activity'"))
        self.assertIn('id="canvasActivityIsland" hidden', html)
        self.assertIn("canvas_react_activity", source)
        self.assertIn("canvas_react_islands", source)
        self.assertIn("mountReactActivityIsland", source)


if __name__ == "__main__":
    unittest.main()
