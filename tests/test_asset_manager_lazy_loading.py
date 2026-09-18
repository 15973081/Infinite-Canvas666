from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]
ASSET_MANAGER_JS = ROOT / "static" / "js" / "asset-manager.js"
CANVAS_ROUTER = ROOT / "app" / "routers" / "canvas.py"


def _function_source(source: str, name: str) -> str:
    marker = f"function {name}("
    start = source.index(marker)
    paren = source.index("(", start)
    paren_depth = 0
    for index in range(paren, len(source)):
        if source[index] == "(":
            paren_depth += 1
        elif source[index] == ")":
            paren_depth -= 1
            if paren_depth == 0:
                brace = source.index("{", index)
                break
    else:
        raise AssertionError(f"Unclosed parameters: {name}")
    depth = 0
    for index in range(brace, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[start : index + 1]
    raise AssertionError(f"Unclosed function: {name}")


class AssetManagerLazyLoadingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = ASSET_MANAGER_JS.read_text(encoding="utf-8")

    def test_initial_load_only_waits_for_asset_library(self):
        initial = _function_source(self.source, "loadInitialAssetManager")

        self.assertIn("await loadManagerData('assets', {reset:true})", initial)
        self.assertNotIn("/api/prompt-libraries", initial)
        self.assertNotIn("/api/canvas-assets", initial)
        self.assertNotIn("loadLocalAssets", initial)
        self.assertLess(initial.index("render()"), initial.index("loadManagerData('providers')"))

    def test_secondary_tabs_are_loaded_on_demand(self):
        loader = _function_source(self.source, "loadManagerData")
        switcher = _function_source(self.source, "switchManagerTab")

        self.assertIn("/api/prompt-libraries", loader)
        self.assertIn("/api/canvas-assets", loader)
        self.assertIn("await loadCanvasAssetPage(0)", loader)
        self.assertNotIn("canvasAssetsData =", loader)
        self.assertIn("await loadManagerData(nextTab)", switcher)
        self.assertIn("managerLoadPromises", loader)

    def test_local_jfif_uses_media_preview(self):
        preview = _function_source(self.source, "assetMediaPreviewUrl")

        self.assertIn("jfif", preview)
        self.assertIn("/api/media-preview", preview)

    def test_virtual_grid_skips_unchanged_ranges(self):
        virtual = _function_source(self.source, "renderAssetVirtualWindow")

        guard = virtual.index("if(rangeKey === assetVirtualRangeKey) return")
        replace = virtual.index("patchVirtualGrid(")
        self.assertLess(guard, replace)

    def test_canvas_asset_scan_runs_off_event_loop(self):
        router = CANVAS_ROUTER.read_text(encoding="utf-8")
        route_start = router.index('async def list_canvas_assets(')
        route_end = router.index('@router.', route_start + 1)
        route = router[route_start:route_end]

        self.assertIn("await asyncio.to_thread(canvas_assets_index, trash=trash, source_state=source_state)", route)


if __name__ == "__main__":
    unittest.main()
