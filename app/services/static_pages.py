"""Local frontend build metadata and cache-safe HTML responses."""

import hashlib
import os
import re
import stat
import threading
import time
import urllib.parse

from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from app.config import APP_VERSION, BASE_DIR, STATIC_DIR


_FRONTEND_EXTENSIONS = {".html", ".js", ".css"}
_FRONTEND_BUILD_LOCK = threading.Lock()
_FRONTEND_BUILD_CACHE = {"snapshot": None, "build_id": ""}


def current_app_version() -> str:
    version_file = os.path.join(BASE_DIR, "VERSION")
    try:
        if os.path.exists(version_file):
            with open(version_file, "r", encoding="utf-8") as file:
                version = (file.read().strip().splitlines() or [""])[0].strip()
                if version:
                    return version
    except Exception:
        pass
    return str(APP_VERSION or time.strftime("%Y.%m.%d", time.localtime()))


def _frontend_file_snapshot():
    entries = []
    for root, dirs, files in os.walk(STATIC_DIR):
        dirs[:] = sorted(name for name in dirs if name != "__pycache__")
        for name in sorted(files):
            if os.path.splitext(name)[1].lower() not in _FRONTEND_EXTENSIONS:
                continue
            path = os.path.join(root, name)
            try:
                file_stat = os.stat(path)
            except OSError:
                continue
            rel = os.path.relpath(path, STATIC_DIR).replace(os.sep, "/")
            entries.append((rel, file_stat.st_mtime_ns, file_stat.st_size, path))
    return tuple(entries)


def frontend_build_id() -> str:
    """Return a stable content fingerprint for every executable frontend file."""
    snapshot = _frontend_file_snapshot()
    with _FRONTEND_BUILD_LOCK:
        if snapshot == _FRONTEND_BUILD_CACHE["snapshot"]:
            return _FRONTEND_BUILD_CACHE["build_id"]
        digest = hashlib.sha256()
        digest.update(current_app_version().encode("utf-8"))
        for rel, _mtime_ns, _size, path in snapshot:
            digest.update(rel.encode("utf-8"))
            digest.update(b"\0")
            try:
                with open(path, "rb") as file:
                    for chunk in iter(lambda: file.read(1024 * 1024), b""):
                        digest.update(chunk)
            except OSError:
                continue
            digest.update(b"\0")
        build_id = digest.hexdigest()[:16]
        _FRONTEND_BUILD_CACHE["snapshot"] = snapshot
        _FRONTEND_BUILD_CACHE["build_id"] = build_id
        return build_id


def versioned_static_html(html: str) -> str:
    build_id = frontend_build_id()
    version = current_app_version()
    safe_version = urllib.parse.quote(f"{version}.{build_id}", safe="._-")
    pattern = re.compile(
        r'(?P<prefix>(?:src|href)=["\']|@import\s+url\(["\'])'
        r'(?P<url>/static/[^"\')?#]+(?:\.(?:js|css|html)))'
        r'(?:\?v=[^"\')#]*)?',
        re.I,
    )

    def replace(match):
        url = match.group("url")
        return f"{match.group('prefix')}{url}?v={safe_version}"

    versioned = pattern.sub(replace, html)
    meta_pattern = re.compile(
        r'(<meta\s+[^>]*name=["\']frontend-build-id["\'][^>]*content=["\'])'
        r'[^"\']*(["\'][^>]*>)',
        re.I,
    )
    if meta_pattern.search(versioned):
        return meta_pattern.sub(rf"\g<1>{build_id}\g<2>", versioned, count=1)
    return re.sub(
        r"(<head(?:\s[^>]*)?>)",
        rf'\1\n    <meta name="frontend-build-id" content="{build_id}">',
        versioned,
        count=1,
        flags=re.I,
    )


def _no_store_html_response(path: str) -> Response:
    with open(path, "r", encoding="utf-8") as file:
        html = file.read()
    return Response(
        versioned_static_html(html),
        media_type="text/html; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


def static_html_response(filename: str) -> Response:
    path = os.path.join(STATIC_DIR, filename)
    return _no_store_html_response(path)


class VersionedStaticFiles(StaticFiles):
    """Serve HTML shells with one aggregate build id and no browser cache."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if not str(path).lower().endswith(".html"):
            return response
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        if scope.get("method") != "GET" or response.status_code != 200:
            return response
        full_path, file_stat = self.lookup_path(path)
        if file_stat is None or not stat.S_ISREG(file_stat.st_mode):
            return response
        return _no_store_html_response(full_path)
