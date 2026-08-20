from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class FrontendBoundaryEntryTest(unittest.TestCase):
    def test_canvas_bootstrap_owns_the_explicit_legacy_fallback(self):
        html = (ROOT / "static" / "canvas.html").read_text(encoding="utf-8")
        bootstrap = (ROOT / "frontend" / "src" / "bootstrap.ts").read_text(encoding="utf-8")

        self.assertNotIn("/static/js/canvas.js", html)
        self.assertNotIn("/static/js/theme.js", html)
        self.assertNotIn("/static/vendor/js/tailwindcss-cdn.js", html)
        self.assertNotIn("/static/vendor/js/lucide.js", html)
        self.assertNotIn("/static/css/canvas.css", html)
        self.assertIn('/static/dist/canvas-modern.js?v=2026.08.19.35', html)
        self.assertIn('/static/dist/canvas-modern.css?v=2026.08.20.1', html)
        self.assertIn("import './canvas/ui/canvas.css';", bootstrap)
        self.assertIn("'/static/js/canvas.js?v=2026.07.23.4'", bootstrap)
        self.assertIn("'/static/js/theme.js?v=2026.06.10.1.1781494198'", bootstrap)
        self.assertIn("if (!decision.enabled)", bootstrap)

    def test_modern_and_legacy_canvas_no_longer_share_a_global_bridge(self):
        main = (ROOT / "frontend" / "src" / "main.ts").read_text(encoding="utf-8")
        board = (ROOT / "frontend" / "src" / "canvas" / "ui" / "canvas-board-v2.tsx").read_text(encoding="utf-8")
        legacy = (ROOT / "static" / "js" / "canvas.js").read_text(encoding="utf-8")

        self.assertNotIn("CanvasLegacyBridge", main)
        self.assertNotIn("CanvasLegacyBridge", board)
        self.assertNotIn("CanvasLegacyBridge", legacy)
        self.assertNotIn("canvas-legacy-", board)
        self.assertNotIn("canvas-legacy-", legacy)
        self.assertIn("CanvasRuntimeContext.Provider", board)
        self.assertIn("initialDocument: unknown", board)
        self.assertIn("repository: CanvasRepository", board)
        self.assertIn("runtime: CanvasRuntime", board)

    def test_retired_transition_islands_cannot_return_to_the_entry(self):
        html = (ROOT / "static" / "canvas.html").read_text(encoding="utf-8")
        main = (ROOT / "frontend" / "src" / "main.ts").read_text(encoding="utf-8")
        retired_roots = (
            "canvasExecutionIsland",
            "canvasStatusIsland",
            "canvasToolbarIsland",
            "canvasActivityIsland",
            "canvasBoardV2",
        )
        retired_flags = (
            "canvas_react_execution",
            "canvas_react_status",
            "canvas_react_toolbar",
            "canvas_react_activity",
            "canvas_react_islands",
            "canvas_board_v2",
            "canvas_modern_core",
        )

        for marker in retired_roots:
            self.assertNotIn(marker, html)
        for marker in retired_flags:
            self.assertNotIn(marker, main)
        self.assertFalse((ROOT / "frontend" / "src" / "canvas" / "ui" / "react-execution-entry.tsx").exists())

    def test_modern_runtime_owns_execution_repository_and_tasks_directly(self):
        main = (ROOT / "frontend" / "src" / "main.ts").read_text(encoding="utf-8")
        board = (ROOT / "frontend" / "src" / "canvas" / "ui" / "canvas-board-v2.tsx").read_text(encoding="utf-8")

        self.assertIn("createModernCanvasRuntime", main)
        self.assertIn("createTaskClient()", main)
        self.assertIn("createCanvasRepository()", main)
        self.assertIn("runOrderedExecution", main)
        self.assertIn("runParallelExecution", main)
        self.assertIn("modernRuntime.runNode(nodeId, snapshot, mode", board)
        self.assertIn("modernRuntime.prepareVideoMedia", board)
        self.assertIn("store.getState().projectDocument(result)", board)


if __name__ == "__main__":
    unittest.main()
