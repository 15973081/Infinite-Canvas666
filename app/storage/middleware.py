"""Shared entry protection and temporary-file lifetime including streamed responses."""
import base64
import hmac
import os
import re
from urllib.parse import urlsplit
from starlette.responses import JSONResponse
from app.storage.settings import postgres_enabled
from app.storage.media import operation_scope


class CloudStorageMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in {"http", "websocket"} or not postgres_enabled():
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        signed = bool(re.fullmatch(r"/api/media/ast_[a-f0-9]{32}/signed", path)) and scope["type"] == "http" and scope.get("method") in {"GET", "HEAD"}
        if not signed:
            user = os.getenv("CLOUD_ACCESS_USER", "canvas")
            password = os.getenv("CLOUD_ACCESS_PASSWORD", "")
            headers = dict(scope.get("headers", []))
            expected = b"Basic " + base64.b64encode((user + ":" + password).encode())
            if not password or not hmac.compare_digest(headers.get(b"authorization", b""), expected):
                if scope["type"] == "websocket":
                    await send({"type": "websocket.close", "code": 1008})
                    return
                response = JSONResponse({"detail": "请输入共享工作区访问凭证"}, 401,
                                        headers={"WWW-Authenticate": 'Basic realm="Infinite Canvas", charset="UTF-8"', "Cache-Control": "no-store"})
                return await response(scope, receive, send)
            origin = headers.get(b"origin", b"").decode("latin-1")
            public = urlsplit(os.getenv("PUBLIC_BASE_URL", ""))
            expected_origin = public.scheme + "://" + public.netloc
            if origin and origin != expected_origin and (scope["type"] == "websocket" or scope.get("method") not in {"GET", "HEAD", "OPTIONS"}):
                if scope["type"] == "websocket":
                    await send({"type": "websocket.close", "code": 1008})
                    return
                return await JSONResponse({"detail": "请求来源不匹配"}, 403)(scope, receive, send)
        with operation_scope():
            await self.app(scope, receive, send)
