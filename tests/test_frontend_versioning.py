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
    def test_server_keeps_deployment_fingerprint_for_update_detection(self):
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
                f'/static/js/frontend-version.js?__asset_version={static_pages.asset_version("/static/js/frontend-version.js")}',
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
        with mock.patch.object(static_pages, "asset_version", side_effect=lambda url: "file-123" if static_pages._is_versioned_frontend_path(url) else ""):
            result = static_pages.versioned_static_references(source, "build-123")
        self.assertIn('/static/canvas.html?id=abc&__frontend_build=build-123', result)
        self.assertIn('/static/vendor/three.js?__asset_version=file-123', result)
        self.assertIn('/static/vendor/fonts.css?__asset_version=file-123', result)
        self.assertIn('/static/js/module.js?__asset_version=file-123', result)
        self.assertIn('/static/runninghub/thumbnails/live.jpg', result)
        self.assertNotIn('thumbnails/live.jpg?__frontend_build', result)
        self.assertIn("'/static/runninghub/'", result)

    def test_unversioned_assets_revalidate_and_current_build_assets_are_immutable(self):
        build_id = static_pages.frontend_build_id()
        unversioned = static_pages._static_cache_headers({"query_string": b""}, build_id)
        current = static_pages._static_cache_headers(
            {"query_string": f"__asset_version={build_id}".encode()},
            build_id,
        )
        stale = static_pages._static_cache_headers(
            {"query_string": b"__asset_version=stale"},
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


def test_member_canvas_pages_load_binding_protocol_before_business_scripts():
    with mock.patch('app.storage.settings.member_auth_enabled', return_value=True):
        for filename, business in [('canvas.html', 'canvas.js'), ('smart-canvas.html', 'smart-canvas.js')]:
            page = static_pages.versioned_static_html((ROOT / 'static' / filename).read_text(encoding='utf-8'))
            scripts = re.findall(r'<script\b[^>]*src="([^"]+)"[^>]*>', page)
            names = [url.split('?')[0] for url in scripts]
            binding = names.index('/static/js/canvas-task-bindings.js')
            assert names.index('/static/js/canvas-task-results.js') < binding < names.index('/static/js/' + business)
            assert names.count('/static/js/canvas-task-bindings.js') == 1
            assert '__asset_version=' in scripts[binding]
            assert 'defer' not in re.search(r'<script[^>]*canvas-task-bindings.js[^>]*>', page).group()
        login = static_pages.versioned_static_html('<html><head></head><body><form id="login-form"></form></body></html>')
        assert 'canvas-task-bindings.js' not in login


class IndependentAssetCacheTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.base = Path(self.directory.name)
        self.patch = mock.patch.object(static_pages, 'STATIC_DIR', self.directory.name)
        self.patch.start()
        self.addCleanup(self.directory.cleanup)
        self.addCleanup(self.patch.stop)
        self.addCleanup(static_pages._ASSET_SOURCE_CACHE.clear)
        self.write('app.js', 'console.log(1)')
        self.write('other.js', 'console.log(2)')
        self.write('font.woff2', 'font-one')
        self.write('fonts.css', "@font-face{src:url('./font.woff2')}")
        self.write('app.css', '@import "fonts.css";body{color:red}')

    def write(self, name, content):
        (self.base / name).write_text(content, encoding='utf-8')

    def url(self, name):
        return static_pages.versioned_static_references('/static/' + name)

    def test_only_changed_js_changes_its_url_even_across_deployments(self):
        names = ['app.js', 'other.js', 'app.css', 'fonts.css', 'font.woff2']
        before = {name:self.url(name) for name in names}
        self.write('app.js', 'console.log(100)')
        after = {name:self.url(name) for name in names}
        self.assertNotEqual(before.pop('app.js'), after.pop('app.js'))
        self.assertEqual(before, after)
        self.assertEqual(static_pages.versioned_static_references('/static/other.js','deploy-a'),
                         static_pages.versioned_static_references('/static/other.js','deploy-b'))
        os.utime(self.base / 'other.js', None)
        self.assertEqual(before['other.js'], self.url('other.js'))

    def test_font_update_invalidates_only_dependent_css(self):
        names=['font.woff2','fonts.css','app.css','app.js']
        before={n:self.url(n) for n in names}
        self.write('font.woff2','font-two')
        for n in names[:3]: self.assertNotEqual(before[n],self.url(n))
        self.assertEqual(before['app.js'],self.url('app.js'))

    def test_css_cycles_are_stable_and_external_urls_are_untouched(self):
        self.write('fonts.css','@import "app.css";')
        self.assertEqual(self.url('app.css'), self.url('app.css'))
        source='https://cdn.example/static/app.js /static/../secret.js /static/missing.js'
        self.assertEqual(source, static_pages.versioned_static_references(source))
        self.assertIsNone(static_pages._asset_path('/static/%2e%2e/secret.js'))

    def test_http_caching_etags_head_and_legacy_urls(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        app=FastAPI()
        app.mount('/static', static_pages.VersionedStaticFiles(directory=self.directory.name))
        with TestClient(app) as client:
            url=self.url('app.css')
            response=client.get(url)
            self.assertEqual(response.status_code,200)
            self.assertIn('immutable',response.headers['cache-control'])
            self.assertIn(self.url('fonts.css'),response.text)
            font_css=client.get(self.url('fonts.css'))
            self.assertIn(self.url('font.woff2'),font_css.text)
            cached=client.get(url,headers={'If-None-Match':response.headers['etag']})
            self.assertEqual(cached.status_code,304)
            self.assertEqual(cached.content,b'')
            self.assertIn('immutable',cached.headers['cache-control'])
            head=client.head(url)
            self.assertEqual(head.content,b'')
            self.assertEqual(head.headers['content-length'],response.headers['content-length'])
            js=client.get(self.url('app.js'))
            self.assertEqual(client.get(self.url('app.js'),headers={'If-None-Match':js.headers['etag']}).status_code,304)
            for legacy in ['/static/app.js','/static/app.js?v=old&__frontend_build=old']:
                redirect=client.get(legacy,follow_redirects=False)
                self.assertEqual(redirect.status_code,307)
                self.assertEqual(redirect.headers['location'],self.url('app.js'))
                self.assertNotIn('immutable',redirect.headers['cache-control'])
            self.write('font.woff2','new-font-version')
            stale=client.get(url,headers={'If-None-Match':response.headers['etag']},follow_redirects=False)
            self.assertEqual(stale.status_code,307)
            current=client.get(stale.headers['location'],headers={'If-None-Match':response.headers['etag']})
            self.assertEqual(current.status_code,200)
            self.assertNotEqual(current.headers['etag'],response.headers['etag'])

    def test_query_and_fragment_preserved_without_global_version(self):
        value=static_pages.versioned_static_references('/static/app.js?v=old&member=one#section')
        self.assertIn('member=one',value)
        self.assertTrue(value.endswith('#section'))
        self.assertNotIn('__frontend_build',value)
        self.assertIn('__asset_version=',value)
