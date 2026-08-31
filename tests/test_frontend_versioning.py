from pathlib import Path
import os
import re
import sys
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from app.services import static_pages


STATIC_PAGES = (ROOT / "app" / "services" / "static_pages.py").read_text(encoding="utf-8")
MAINTENANCE_ROUTER = (ROOT / "app" / "routers" / "maintenance.py").read_text(encoding="utf-8")
MAIN = (ROOT / "main.py").read_text(encoding="utf-8")
VERSION_CLIENT = (ROOT / "static" / "js" / "frontend-version.js").read_text(encoding="utf-8")
CLASSIC_CLIENT = (ROOT / "static" / "js" / "canvas.js").read_text(encoding="utf-8")
SMART_CLIENT = (ROOT / "static" / "js" / "smart-canvas.js").read_text(encoding="utf-8")


class FrontendVersioningTests(unittest.TestCase):
    def test_server_uses_one_content_fingerprint_for_all_frontend_assets(self):
        self.assertIn("def frontend_build_id()", STATIC_PAGES)
        self.assertIn("hashlib.sha256()", STATIC_PAGES)
        self.assertIn('_FRONTEND_REWRITE_EXTENSIONS = {".html", ".css"}', STATIC_PAGES)
        self.assertIn('_FRONTEND_EXCLUDED_PREFIXES = ("runninghub/thumbnails/",)', STATIC_PAGES)
        self.assertNotIn("os.path.splitext(name)[1].lower() not in", STATIC_PAGES)
        self.assertNotIn('int(os.path.getmtime(path))', STATIC_PAGES)

    def test_images_fonts_json_and_future_extensions_change_the_build_id(self):
        with tempfile.TemporaryDirectory() as directory:
            static_dir = Path(directory)
            asset = static_dir / "asset.future-format"
            asset.write_bytes(b"first")
            with mock.patch.object(static_pages, "STATIC_DIR", directory):
                static_pages._FRONTEND_BUILD_CACHE.update(snapshot=None, build_id="", checked_at=0.0)
                first = static_pages.frontend_build_id()
                asset.write_bytes(b"second-version")
                os.utime(asset, None)
                static_pages._FRONTEND_BUILD_CACHE["checked_at"] = 0.0
                second = static_pages.frontend_build_id()
        static_pages._FRONTEND_BUILD_CACHE.update(snapshot=None, build_id="", checked_at=0.0)
        self.assertNotEqual(first, second)

    def test_every_static_html_shell_is_versioned_and_never_cached(self):
        self.assertIn("class VersionedStaticFiles(StaticFiles)", STATIC_PAGES)
        self.assertIn('"Cache-Control": "no-cache, no-store, must-revalidate"', STATIC_PAGES)
        self.assertIn('app.mount("/static", VersionedStaticFiles(', MAIN)
        build_id = static_pages.frontend_build_id()
        for path in sorted((ROOT / "static").glob("*.html")):
            page = static_pages.versioned_static_html(path.read_text(encoding="utf-8"))
            self.assertIn(f'name="frontend-build-id" content="{build_id}"', page, path.name)
            self.assertIn(
                f'/static/js/frontend-version.js?__frontend_build={build_id}',
                page,
                path.name,
            )
            self.assertNotRegex(page, r"/static/[^\"']+[?&]v=", path.name)

    def test_html_css_javascript_importmaps_and_lazy_urls_share_one_rewriter(self):
        source = """
            <iframe data-src="/static/canvas.html?id=abc&v=old"></iframe>
            <script type="importmap">{"imports":{"three":"/static/vendor/three.js?v=old"}}</script>
            @import url('/static/vendor/fonts.css?v=old');
            const module = import('/static/js/module.js?v=old');
            const thumbnail = '/static/runninghub/thumbnails/live.jpg';
            const staticRoot = '/static/runninghub/';
        """
        result = static_pages.versioned_static_references(source, "build-123")
        self.assertIn('/static/canvas.html?id=abc&__frontend_build=build-123', result)
        self.assertIn('/static/vendor/three.js?__frontend_build=build-123', result)
        self.assertIn('/static/vendor/fonts.css?__frontend_build=build-123', result)
        self.assertIn('/static/js/module.js?__frontend_build=build-123', result)
        self.assertIn('/static/runninghub/thumbnails/live.jpg', result)
        self.assertNotIn('thumbnails/live.jpg?__frontend_build', result)
        self.assertIn("'/static/runninghub/'", result)

    def test_unversioned_assets_revalidate_and_current_build_assets_are_immutable(self):
        build_id = static_pages.frontend_build_id()
        unversioned = static_pages._static_cache_headers({"query_string": b""}, build_id)
        current = static_pages._static_cache_headers(
            {"query_string": f"__frontend_build={build_id}".encode()},
            build_id,
        )
        stale = static_pages._static_cache_headers(
            {"query_string": b"__frontend_build=stale"},
            build_id,
        )
        self.assertEqual("no-cache, must-revalidate", unversioned["Cache-Control"])
        self.assertEqual("no-cache, must-revalidate", stale["Cache-Control"])
        self.assertEqual("public, max-age=31536000, immutable", current["Cache-Control"])

    def test_runtime_checks_on_load_focus_visibility_and_interval(self):
        self.assertIn("fetch('/api/frontend/version'", VERSION_CLIENT)
        self.assertIn("cache:'no-store'", VERSION_CLIENT)
        self.assertIn("window.addEventListener('focus', checkForUpdate)", VERSION_CLIENT)
        self.assertIn("window.addEventListener('pageshow'", VERSION_CLIENT)
        self.assertIn("document.addEventListener('visibilitychange'", VERSION_CLIENT)
        self.assertIn("window.setInterval(checkForUpdate, CHECK_INTERVAL_MS)", VERSION_CLIENT)
        self.assertIn("parentVersionController()", VERSION_CLIENT)
        self.assertIn("parentController.checkForUpdate()", VERSION_CLIENT)
        self.assertIn("url.searchParams.set('__frontend_build', latestBuildId)", VERSION_CLIENT)
        self.assertIn('@router.get("/api/frontend/version")', MAINTENANCE_ROUTER)

    def test_canvas_navigation_never_reuses_hardcoded_page_versions(self):
        self.assertIn("window.FrontendVersion?.versionedUrl(target)", CLASSIC_CLIENT)
        self.assertIn("window.FrontendVersion?.versionedUrl(target)", SMART_CLIENT)
        self.assertIn("await window.FrontendVersion?.checkForUpdate?.()", CLASSIC_CLIENT)
        self.assertIn("await window.FrontendVersion?.checkForUpdate?.()", SMART_CLIENT)
        self.assertNotRegex(CLASSIC_CLIENT, r"smart-canvas\.html\?id=\$\{encodeURIComponent\(id\)\}&v=")
        self.assertNotIn("/static/canvas.html?v=2026.08.27.2", SMART_CLIENT)
        self.assertIn("url.searchParams.delete('v')", VERSION_CLIENT)
        self.assertIn("url.searchParams.set('__frontend_build'", VERSION_CLIENT)
        self.assertIn("window.FrontendVersion?.versionedUrl(threeModulePath)", SMART_CLIENT)
        self.assertIn("import(threeModuleUrl)", SMART_CLIENT)

    def test_reload_waits_for_canvas_saves(self):
        self.assertIn("frontend:before-reload", VERSION_CLIENT)
        self.assertIn("Promise.allSettled(pending)", VERSION_CLIENT)
        self.assertIn("flushClassicCanvasBeforeFrontendReload", CLASSIC_CLIENT)
        self.assertIn("event.detail.waitUntil(flushClassicCanvasBeforeFrontendReload())", CLASSIC_CLIENT)
        self.assertIn("saveCanvas({force:true})", SMART_CLIENT)
        self.assertRegex(
            SMART_CLIENT,
            re.compile(r"frontend:before-reload[\s\S]+?event\.detail\.waitUntil", re.M),
        )


if __name__ == "__main__":
    unittest.main()
