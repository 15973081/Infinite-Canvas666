"""Local frontend build metadata and cache-safe HTML responses."""

import gzip
import hashlib
from functools import lru_cache
import mimetypes
import os
import re
import stat
import threading
import time
import urllib.parse

from fastapi import HTTPException
from fastapi.responses import Response, RedirectResponse
from starlette.datastructures import Headers
from fastapi.staticfiles import StaticFiles

from app.config import APP_VERSION, BASE_DIR, STATIC_DIR


_FRONTEND_REWRITE_EXTENSIONS = {".html", ".css"}
_FRONTEND_EXCLUDED_PREFIXES = ("runninghub/thumbnails/",)
_FRONTEND_EXCLUDED_NAMES = {".gitkeep"}
_FRONTEND_BUILD_QUERY = "__frontend_build"
_ASSET_VERSION_QUERY = "__asset_version"
_ASSET_SOURCE_CACHE = {}
_FRONTEND_BUILD_SCAN_INTERVAL_SECONDS = 1.0
_FRONTEND_BUILD_LOCK = threading.Lock()
_FRONTEND_BUILD_CACHE = {"snapshot": None, "build_id": "", "checked_at": 0.0}
_STATIC_URL_PATTERN = re.compile(r"(?<![\w/.:~-])(?P<url>/static/[^\s\"'`<>()]+)", re.I)


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


def _asset_path(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme or parsed.netloc or not _is_versioned_frontend_path(url):
        return None
    relative = urllib.parse.unquote(parsed.path)[len('/static/'):]
    base = os.path.realpath(STATIC_DIR)
    path = os.path.realpath(os.path.join(base, relative))
    try:
        if os.path.commonpath([base, path]) != base or not os.path.isfile(path):
            return None
    except ValueError:
        return None
    return path


def _asset_source(path):
    info = os.stat(path)
    signature = (info.st_mtime_ns, info.st_ctime_ns, info.st_size, info.st_ino)
    cached = _ASSET_SOURCE_CACHE.get(path)
    if cached and cached[0] == signature:
        return cached[1], cached[2]
    with open(path, 'rb') as stream:
        content = stream.read()
    digest = hashlib.sha256(content).hexdigest()[:20]
    # Keep CSS bytes for dependency rewriting; large binary payloads are not retained.
    css = content.decode('utf-8') if path.lower().endswith('.css') else None
    _ASSET_SOURCE_CACHE[path] = (signature, digest, css)
    return digest, css


_CSS_REFERENCE_PATTERN = re.compile(
    r'''url\(\s*(?P<quote>['"]?)(?P<url>[^'"()\s]+)(?P=quote)\s*\)|@import\s+(?P<iq>['"])(?P<import>[^'"]+)(?P=iq)''', re.I)


def _css_references(content, source_url, replace):
    def visit(match):
        raw = match.group('url') or match.group('import')
        parsed = urllib.parse.urlsplit(raw)
        if raw.startswith('#') or parsed.scheme or parsed.netloc:
            return match.group(0)
        absolute = urllib.parse.urljoin(source_url, raw)
        if not _asset_path(absolute):
            return match.group(0)
        value = replace(absolute)
        key = 'url' if match.group('url') is not None else 'import'
        start, end = match.span(key)
        return match.group(0)[:start-match.start()] + value + match.group(0)[end-match.start():]
    return _CSS_REFERENCE_PATTERN.sub(visit, content)


def asset_version(url):
    path = _asset_path(url)
    if path is None or path.lower().endswith('.html'):
        return ''
    own, css = _asset_source(path)
    if css is None:
        return own
    # Hash the dependency closure, not the deployment id. A visited set handles
    # cyclic imports deterministically without recursive version substitution.
    dependencies = {}
    def collect(value):
        target = _asset_path(value)
        if target is None or target in dependencies:
            return value
        digest, nested = _asset_source(target)
        dependencies[target] = digest
        if nested is not None:
            _css_references(nested, urllib.parse.urlsplit(value).path, collect)
        return value
    collect(url)
    content = '\n'.join(os.path.relpath(p, STATIC_DIR).replace(os.sep, '/') + ':' + h
                        for p, h in sorted(dependencies.items()))
    return hashlib.sha256(content.encode('utf-8')).hexdigest()[:20]


def _with_asset_version(url, version):
    parsed = urllib.parse.urlsplit(url)
    query = [(k, v) for k, v in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
             if k.lower() not in {'v', _FRONTEND_BUILD_QUERY, _ASSET_VERSION_QUERY}]
    query.append((_ASSET_VERSION_QUERY, version))
    return urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query)))


def versioned_static_references(content: str, build_id: str | None = None) -> str:
    def rewrite(match):
        url = match.group('url')
        if urllib.parse.urlsplit(url).path.lower().endswith('.html'):
            return _with_frontend_build(url, build_id or frontend_build_id())
        version = asset_version(url)
        return _with_asset_version(url, version) if version else url
    return _STATIC_URL_PATTERN.sub(rewrite, content)


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
    from app.storage.settings import member_auth_enabled
    if member_auth_enabled() and 'id="login-form"' not in versioned and '/static/js/member-session.js' not in versioned:
        # Blocking script installs the request gate before inline scripts or
        # iframes can start business requests without a selected workspace.
        directory = '<meta name="canvas-page-role" content="directory">' in html
        workbench = '<meta name="canvas-page-role" content="workbench">' in html
        styles = ['member-session']
        scripts = ['member-session', 'member-media']
        if not workbench:
            scripts += ['canvas-edit-lease', 'canvas-directory-writes']
        if not directory and not workbench:
            styles += ['member-canvas-edit']
            scripts += ['canvas-subscription', 'canvas-task-results', 'canvas-task-bindings',
                        'canvas-llm-tasks', 'member-canvas-edit']
        injected = ''.join(f'\n<link rel="stylesheet" href="/static/css/{name}.css">' for name in styles)
        injected += ''.join(f'\n<script src="/static/js/{name}.js"></script>' for name in scripts)
        versioned = re.sub(r'(<head(?:\s[^>]*)?>)',
            lambda match: match[1] + injected,
            versioned, count=1, flags=re.I)
    return versioned_static_references(versioned, build_id)


def _static_cache_headers(scope, asset_id: str) -> dict[str, str]:
    raw_query = scope.get("query_string", b"") or b""
    query = urllib.parse.parse_qs(raw_query.decode("utf-8", errors="replace"))
    requested_asset = str((query.get(_ASSET_VERSION_QUERY) or [""])[0])
    if requested_asset and requested_asset == asset_id:
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


def _accepts_gzip(value: str) -> bool:
    qualities = {}
    for item in value.lower().split(','):
        coding, *parameters = item.strip().split(';')
        quality = 1.0
        for parameter in parameters:
            key, _, raw = parameter.strip().partition('=')
            if key == 'q':
                try:
                    quality = float(raw)
                except ValueError:
                    quality = 0.0
        qualities[coding] = quality
    return 0 < qualities.get('gzip', qualities.get('*', 0)) <= 1


@lru_cache(maxsize=128)
def _compressed_static_asset(path: str, version: str) -> bytes:
    # The content version includes CSS dependencies, so rewritten font/import
    # URLs invalidate this bounded cache as well as the browser cache.
    with open(path, 'rb') as stream:
        content = stream.read()
    if path.lower().endswith('.css'):
        url = '/static/' + os.path.relpath(path, STATIC_DIR).replace('\\', '/')
        content = _css_references(content.decode('utf-8'), url,
            lambda ref: _with_asset_version(ref, asset_version(ref))).encode('utf-8')
    return gzip.compress(content, compresslevel=6, mtime=0)


class VersionedStaticFiles(StaticFiles):
    """Content-addressed assets; HTML remains fresh and carries deployment metadata."""

    async def get_response(self, path, scope):
        if str(path).replace('\\','/').rsplit('/',1)[-1].lower() in {'api-settings.html','api-settings.js','api-settings.css'}:
            raise HTTPException(404)
        full_path, file_stat = self.lookup_path(path)
        if file_stat is None or not stat.S_ISREG(file_stat.st_mode) or scope.get('method') not in {'GET', 'HEAD'}:
            return await super().get_response(path, scope)
        suffix = os.path.splitext(str(path))[1].lower()
        if suffix == '.html':
            response = _no_store_html_response(full_path)
            if scope.get('method') == 'HEAD': response.body = b''
            return response
        url = '/static/' + str(path).replace('\\', '/')
        version = asset_version(url)
        if not version:
            return await super().get_response(path, scope)
        query = scope.get('query_string', b'').decode('utf-8', errors='replace')
        canonical = _with_asset_version(url + ('?' + query if query else ''), version)
        requested = urllib.parse.parse_qs(query)
        if requested.get(_ASSET_VERSION_QUERY) != [version] or _FRONTEND_BUILD_QUERY in requested or 'v' in requested:
            return RedirectResponse(canonical, status_code=307, headers={'Cache-Control':'no-cache'})
        request_headers = Headers(scope=scope)
        compressible = suffix in {'.js', '.css'} and file_stat.st_size >= 1024
        compressed = compressible and not request_headers.get('range') and _accepts_gzip(request_headers.get('accept-encoding', ''))
        etag = version + ('-gzip' if compressed else '')
        headers = {**_static_cache_headers(scope, version), 'ETag': '"' + etag + '"'}
        if compressible:
            headers['Vary'] = 'Accept-Encoding'
        if self.is_not_modified(Headers(headers), request_headers):
            return Response(status_code=304, headers=headers)
        if compressed:
            content = _compressed_static_asset(full_path, version)
            response = Response(content, media_type='text/css' if suffix == '.css' else 'text/javascript',
                headers={**headers, 'Content-Encoding': 'gzip'})
            if scope.get('method') == 'HEAD': response.body = b''
            return response
        if suffix == '.css':
            _, content = _asset_source(full_path)
            content = _css_references(content, url,
                lambda ref: _with_asset_version(ref, asset_version(ref)))
            response = Response(content, media_type='text/css', headers=headers)
            if scope.get('method') == 'HEAD': response.body = b''
            return response
        # Conditional handling above uses the content ETag, not file timestamps.
        clean_scope = dict(scope, headers=[(k,v) for k,v in scope.get('headers', [])
                           if k.lower() not in {b'if-none-match', b'if-modified-since'}])
        response = await super().get_response(path, clean_scope)
        response.headers.update(headers)
        return response
