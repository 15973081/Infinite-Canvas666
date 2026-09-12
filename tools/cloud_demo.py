"""Create a small, repeatable demo in the local simulation database only."""
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("STORAGE_ENV_FILE", str(ROOT / ".local/cloud/storage.env"))
from app.storage.settings import load_storage_env
load_storage_env()


def main():
    from urllib.parse import urlsplit
    target = urlsplit(os.environ["DATABASE_URL"])
    if target.hostname != "127.0.0.1" or target.path != "/canvas_cloud_dev" or os.getenv("MEDIA_BACKEND") != "filesystem":
        raise SystemExit("Demo seed is restricted to the isolated local simulation")
    from PIL import Image, ImageDraw
    from app.storage import database, canvases, media
    from fastapi import HTTPException
    database.migrate()
    with media.operation_scope() as folder:
        path = folder / "storage-demo.png"
        image = Image.new("RGB", (640, 360), "#162b42")
        draw = ImageDraw.Draw(image)
        draw.rectangle((30, 30, 610, 330), outline="#58d8c7", width=5)
        draw.text((70, 120), "PostgreSQL + private object storage", fill="white")
        draw.text((70, 165), "Stable media IDs / versioned files / temporary downloads", fill="#58d8c7")
        image.save(path)
        asset = media.publish(path, "storage-demo.png", asset_id="ast_" + "0" * 31 + "1")
        for kind in ("classic", "smart"):
            cid = "cloud_demo_" + kind
            try:
                canvases.get(cid, include_deleted=True)
                continue
            except HTTPException as exc:
                if exc.status_code != 404:
                    raise
            value = {"id": cid, "title": "云存储模拟 · " + ("普通画布" if kind == "classic" else "智能画布"), "kind": kind, "icon": "layers", "nodes": [
                {"id": "demo-image", "type": "image", "name": "对象存储测试图", "url": media.stable_url(asset), "media_asset_id": asset["id"], "x": 120, "y": 120, "w": 640, "h": 360, "width": 640, "height": 360}
            ], "connections": [], "viewport": {"x": 0, "y": 0, "scale": 1}}
            canvases.save(value)
    database.close()
    print("Demo canvases ready; no model API was called and no original project data was imported.")


if __name__ == "__main__":
    main()
