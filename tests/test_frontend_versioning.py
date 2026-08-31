from pathlib import Path
import re
import unittest


ROOT = Path(__file__).parents[1]
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
        self.assertIn('_FRONTEND_EXTENSIONS = {".html", ".js", ".css"}', STATIC_PAGES)
        self.assertIn('safe_version = urllib.parse.quote(f"{version}.{build_id}"', STATIC_PAGES)
        self.assertNotIn('int(os.path.getmtime(path))', STATIC_PAGES)

    def test_every_static_html_shell_is_versioned_and_never_cached(self):
        self.assertIn("class VersionedStaticFiles(StaticFiles)", STATIC_PAGES)
        self.assertIn('"Cache-Control": "no-cache, no-store, must-revalidate"', STATIC_PAGES)
        self.assertIn('app.mount("/static", VersionedStaticFiles(', MAIN)
        for filename in ("index.html", "canvas.html", "smart-canvas.html"):
            page = (ROOT / "static" / filename).read_text(encoding="utf-8")
            self.assertIn('name="frontend-build-id"', page, filename)
            self.assertIn('/static/js/frontend-version.js', page, filename)

    def test_runtime_checks_on_load_focus_visibility_and_interval(self):
        self.assertIn("fetch('/api/frontend/version'", VERSION_CLIENT)
        self.assertIn("cache:'no-store'", VERSION_CLIENT)
        self.assertIn("window.addEventListener('focus', checkForUpdate)", VERSION_CLIENT)
        self.assertIn("document.addEventListener('visibilitychange'", VERSION_CLIENT)
        self.assertIn("window.setInterval(checkForUpdate, CHECK_INTERVAL_MS)", VERSION_CLIENT)
        self.assertIn("url.searchParams.set('__frontend_build', latestBuildId)", VERSION_CLIENT)
        self.assertIn('@router.get("/api/frontend/version")', MAINTENANCE_ROUTER)

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
