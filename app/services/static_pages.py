"""Local build metadata and no-cache HTML responses.

This module deliberately has no remote version or self-update capability.
"""

import os
import re
import time
import urllib.parse

from fastapi.responses import Response

from app.config import APP_VERSION, BASE_DIR, STATIC_DIR


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


def versioned_static_html(html: str) -> str:
    version = current_app_version()
    if not version:
        return html
    safe_version = urllib.parse.quote(version, safe="._-")
    pattern = re.compile(
        r'(?P<prefix>(?:src|href)=["\']|@import\s+url\(["\'])'
        r'(?P<url>/static/[^"\')?#]+(?:\.(?:js|css|html)))'
        r'(?:\?v=[^"\')#]*)?',
        re.I,
    )

    def replace(match):
        url = match.group("url")
        cache_version = safe_version
        try:
            rel = urllib.parse.unquote(url[len("/static/"):]).replace("/", os.sep)
            path = os.path.abspath(os.path.join(STATIC_DIR, rel))
            static_root = os.path.abspath(STATIC_DIR)
            if path.startswith(static_root + os.sep) and os.path.isfile(path):
                cache_version = f"{safe_version}.{int(os.path.getmtime(path))}"
        except Exception:
            pass
        return f"{match.group('prefix')}{url}?v={cache_version}"

    return pattern.sub(replace, html)


def static_html_response(filename: str) -> Response:
    path = os.path.join(STATIC_DIR, filename)
    with open(path, "r", encoding="utf-8") as file:
        html = file.read()
    return Response(
        versioned_static_html(html),
        media_type="text/html; charset=utf-8",
        headers={"Cache-Control": "no-cache"},
    )
