"""Temporary-file lifetime including streamed responses. Auth is enforced globally."""
from app.storage.settings import postgres_enabled
from app.storage.media import operation_scope


class CloudStorageMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in {"http", "websocket"} or not postgres_enabled():
            return await self.app(scope, receive, send)
        with operation_scope():
            await self.app(scope, receive, send)
