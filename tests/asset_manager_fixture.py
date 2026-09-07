"""Read-only browser fixture: python tests/asset_manager_fixture.py (localhost:6017).

Serves the real static UI with synthetic lists; never reads or modifies business data.
"""
import http.server
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


def items(prefix, count=1000, **extra):
    return [dict(id=f"{prefix}-{i}", name=f"Review {i:04}",
                 url=f"/assets/review-{prefix}-{i}.png", created_at=1788825600000,
                 **extra) for i in range(count)]


ASSETS = {"library": {"libraries": [
    {"id": "default", "name": "Review Library", "categories": [
        {"id": "images", "name": "Images", "type": "image", "items": items("image")},
        {"id": "more", "name": "More Images", "type": "image", "items": items("more")},
        {"id": "workflows", "name": "Workflows", "type": "workflow", "items": items("workflow", kind="workflow")}]},
    {"id": "second", "name": "Second Library", "categories": [
        {"id": "second-images", "name": "Second Images", "type": "image", "items": items("second", 50)}]}]}}
LOCAL = {"items": [dict(item, file=f"{item['id']}.png", folder="") for item in items("local")],
         "tree": {"path": "", "name": "Uploads", "count": 1000, "children": []}}
PROMPTS = {"library": {"libraries": [{"id": "custom", "name": "Review Prompts", "categories": [{"id": "custom", "name": "Custom"}],
             "items": [dict(item, title=item["name"], category="custom", content="Review prompt text") for item in items("prompt", 100)]}]}}
CANVAS = {"categories": [{"id": "smart", "name": "Smart", "count": 1000, "canvas_count": 4}],
          "canvases": [{"id": f"canvas-{g}", "kind": "smart", "title": f"Canvas {g}"} for g in range(4)],
          "items": [item for g in range(4) for item in items(f"canvas-{g}", 250, canvas_id=f"canvas-{g}", canvas_kind="smart", canvas_title=f"Canvas {g}")]}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *_args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        route = urlsplit(self.path).path
        payloads = {"/api/asset-library": ASSETS, "/api/providers": {"providers": []},
                    "/api/local-assets": LOCAL, "/api/shared-folders": {"folders": []},
                    "/api/prompt-libraries": PROMPTS, "/api/canvas-assets": CANVAS}
        if route in payloads:
            self.respond(json.dumps(payloads[route]).encode(), "application/json")
        elif route.startswith("/assets/review-") or route == "/api/media-preview":
            self.respond(b'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#a8bacc"/></svg>', "image/svg+xml")
        elif route == "/static/asset-manager.html":
            html = (ROOT / route.lstrip("/")).read_text(encoding="utf-8")
            # Real browsers can retain resources from a previous fixture run.
            version = (ROOT / "static/js/asset-manager.js").stat().st_mtime_ns
            html = html.replace("?v=", f"?fixture={version}&v=")
            self.respond(html.encode(), "text/html; charset=utf-8")
        elif route.startswith("/static/") and (ROOT / unquote(route).lstrip("/")).resolve().is_relative_to(ROOT / "static"):
            super().do_GET()
        else:
            self.send_error(404)

    def respond(self, body, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("127.0.0.1", 6017), Handler).serve_forever()
