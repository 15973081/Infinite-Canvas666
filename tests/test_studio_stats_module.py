from pathlib import Path
import tempfile
import sys
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
sys.path.insert(0, str(Path(__file__).parents[1]))
from app.services import static_pages


def test_native_module_mime_revalidation_and_module_only_build_update():
    with tempfile.TemporaryDirectory() as directory:
        base = Path(directory)
        (base / "js").mkdir()
        codec = base / "js" / "studio-stats-codec.mjs"
        bridge = base / "js" / "studio-stats-connection.js"
        codec.write_text('export const version = "one";', encoding="utf-8")
        bridge.write_text('const bridge = "unchanged";', encoding="utf-8")
        app = FastAPI()
        app.mount("/static", static_pages.VersionedStaticFiles(directory=directory), name="static")
        with mock.patch.object(static_pages, "STATIC_DIR", directory), TestClient(app) as client:
            static_pages._FRONTEND_BUILD_CACHE.update(snapshot=None, build_id="", checked_at=0.0)
            first_build = static_pages.frontend_build_id()
            bridge_hash = static_pages.asset_version("/static/js/studio-stats-connection.js")
            first = client.get(f"/static/js/studio-stats-codec.mjs?__frontend_build={first_build}")
            assert first.status_code == 200
            assert "javascript" in first.headers["content-type"]
            assert first.history[0].status_code == 307
            assert "no-cache" in first.history[0].headers["cache-control"]
            assert "immutable" in first.headers["cache-control"]
            assert client.get("/static/js/studio-stats-codec.mjs", headers={"If-None-Match": first.headers["etag"]}).status_code == 304
            codec.write_text('export const version = "two";', encoding="utf-8")
            static_pages._FRONTEND_BUILD_CACHE["checked_at"] = 0.0
            second_build = static_pages.frontend_build_id()
            assert second_build != first_build
            assert static_pages.asset_version("/static/js/studio-stats-connection.js") == bridge_hash
            second = client.get(f"/static/js/studio-stats-codec.mjs?__frontend_build={second_build}", headers={"If-None-Match": first.headers["etag"]})
            assert second.status_code == 200
            assert second.headers["etag"] != first.headers["etag"]
            assert '"two"' in second.text
    static_pages._FRONTEND_BUILD_CACHE.update(snapshot=None, build_id="", checked_at=0.0)
