"""Local frontend build metadata and cache-safe HTML responses."""

import hashlib
import mimetypes
import os
import re
import stat
import threading
import time
import urllib.parse

from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from app.config import APP_VERSION, BASE_DIR, STATIC_DIR


_FRONTEND_REWRITE_EXTENSIONS = {".html", ".css"}
_FRONTEND_EXCLUDED_PREFIXES = ("runninghub/thumbnails/",)
_FRONTEND_EXCLUDED_NAMES = {".gitkeep"}
_FRONTEND_BUILD_QUERY = "__frontend_build"
_FRONTEND_BUILD_SCAN_INTERVAL_SECONDS = 1.0
_FRONTEND_BUILD_LOCK = threading.Lock()
_FRONTEND_BUILD_CACHE = {"snapshot": None, "build_id": "", "checked_at": 0.0}
_STATIC_URL_PATTERN = re.compile(r"(?P<url>/static/[^\s\"'`<>()]+)", re.I)


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
            path = os.path.join(root, name)
            try:
                file_stat = os.stat(path)
            except OSError:
                continue
            rel = os.path.relpath(path, STATIC_DIR).replace(os.sep, "/")
            if name in _FRONTEND_EXCLUDED_NAMES or rel.startswith(_FRONTEND_EXCLUDED_PREFIXES):
                continue
            entries.append((rel, file_stat.st_mtime_ns, file_stat.st_size, path))
    return tuple(entries)


def frontend_build_id() -> str:
    """Return a stable content fingerprint for every app-owned frontend file."""
    checked_at = time.monotonic()
    with _FRONTEND_BUILD_LOCK:
        if (
            _FRONTEND_BUILD_CACHE["build_id"]
            and checked_at - _FRONTEND_BUILD_CACHE["checked_at"] < _FRONTEND_BUILD_SCAN_INTERVAL_SECONDS
        ):
            return _FRONTEND_BUILD_CACHE["build_id"]
        snapshot = _frontend_file_snapshot()
        if snapshot == _FRONTEND_BUILD_CACHE["snapshot"]:
            _FRONTEND_BUILD_CACHE["checked_at"] = checked_at
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
        _FRONTEND_BUILD_CACHE["checked_at"] = checked_at
        return build_id


def _is_versioned_frontend_path(url: str) -> bool:
    path = urllib.parse.unquote(urllib.parse.urlsplit(url).path)
    if not path.lower().startswith("/static/"):
        return False
    relative_path = path[len("/static/"):].lstrip("/")
    filename = relative_path.rsplit("/", 1)[-1]
    return (
        bool(relative_path)
        and "." in filename
        and not relative_path.startswith(_FRONTEND_EXCLUDED_PREFIXES)
    )


def _with_frontend_build(url: str, build_id: str) -> str:
    if not _is_versioned_frontend_path(url):
        return url
    before_fragment, marker, fragment = url.partition("#")
    path, query_marker, query = before_fragment.partition("?")
    query_parts = []
    if query_marker:
        for part in query.split("&"):
            key = urllib.parse.unquote_plus(part.split("=", 1)[0]).lower()
            if key not in {"v", _FRONTEND_BUILD_QUERY}:
                query_parts.append(part)
    query_parts.append(f"{_FRONTEND_BUILD_QUERY}={urllib.parse.quote(build_id, safe='._-')}")
    result = f"{path}?{'&'.join(query_parts)}"
    return f"{result}{marker}{fragment}" if marker else result


def versioned_static_references(content: str, build_id: str | None = None) -> str:
    """Attach the current aggregate build id to every app-owned /static URL."""
    active_build_id = build_id or frontend_build_id()
    return _STATIC_URL_PATTERN.sub(
        lambda match: _with_frontend_build(match.group("url"), active_build_id),
        content,
    )


def versioned_static_html(html: str) -> str:
    build_id = frontend_build_id()
    meta_pattern = re.compile(
        r'(<meta\s+[^>]*name=["\']frontend-build-id["\'][^>]*content=["\'])'
        r'[^"\']*(["\'][^>]*>)',
        re.I,
    )
    if meta_pattern.search(html):
        versioned = meta_pattern.sub(rf"\g<1>{build_id}\g<2>", html, count=1)
    else:
        versioned = re.sub(
            r"(<head(?:\s[^>]*)?>)",
            rf'\1\n    <meta name="frontend-build-id" content="{build_id}">',
            html,
            count=1,
            flags=re.I,
        )
    if "/static/js/frontend-version.js" not in versioned:
        versioned = re.sub(
            r"(</head\s*>)",
            r'    <script src="/static/js/frontend-version.js" defer></script>\n\1',
            versioned,
            count=1,
            flags=re.I,
        )
    if "/static/js/auth-session.js" not in versioned and 'id="login-form"' not in versioned:
        versioned = versioned.replace("</head>", '<script src="/static/js/auth-session.js" defer></script>\n</head>', 1)
    return versioned_static_references(versioned, build_id)


def _static_cache_headers(scope, build_id: str) -> dict[str, str]:
    raw_query = scope.get("query_string", b"") or b""
    query = urllib.parse.parse_qs(raw_query.decode("utf-8", errors="replace"))
    requested_build = str((query.get(_FRONTEND_BUILD_QUERY) or [""])[0])
    if requested_build and requested_build == build_id:
        return {"Cache-Control": "public, max-age=31536000, immutable"}
    return {
        "Cache-Control": "no-cache, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    }


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
    """Serve every app-owned static dependency through one build fingerprint."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if response.status_code != 200:
            return response
        suffix = os.path.splitext(str(path))[1].lower()
        build_id = frontend_build_id()
        if suffix == ".html":
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        else:
            response.headers.update(_static_cache_headers(scope, build_id))
        if scope.get("method") != "GET" or suffix not in _FRONTEND_REWRITE_EXTENSIONS:
            return response
        full_path, file_stat = self.lookup_path(path)
        if file_stat is None or not stat.S_ISREG(file_stat.st_mode):
            return response
        if suffix == ".html":
            return _no_store_html_response(full_path)
        with open(full_path, "r", encoding="utf-8") as file:
            content = versioned_static_references(file.read(), build_id)
        media_type = mimetypes.guess_type(full_path)[0] or "text/plain"
        return Response(
            content,
            media_type=media_type,
            headers=_static_cache_headers(scope, build_id),
        )
