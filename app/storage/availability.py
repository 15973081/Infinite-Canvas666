"""Report temporary database outages, including failures during authentication."""
from psycopg import OperationalError
from psycopg_pool import PoolTimeout
from starlette.responses import JSONResponse


class DatabaseAvailabilityMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] not in {'http', 'websocket'}:
            return await self.app(scope, receive, send)
        started = False

        async def tracked_send(message):
            nonlocal started
            if message['type'] in {'http.response.start', 'websocket.accept', 'websocket.close'}:
                started = True
            await send(message)

        try:
            await self.app(scope, receive, tracked_send)
        except (PoolTimeout, OperationalError) as exc:
            state = getattr(exc, 'sqlstate', None)
            if started or (state and not state.startswith('08') and state not in {'57P01', '57P02', '57P03'}):
                raise
            if scope['type'] == 'websocket':
                return await send({'type': 'websocket.close', 'code': 1013})
            await JSONResponse(
                {'code': 'database_unavailable', 'detail': '数据库暂时不可用，请稍后刷新重试。'},
                status_code=503, headers={'Retry-After': '3', 'Cache-Control': 'no-store'},
            )(scope, receive, send)
