import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from psycopg import OperationalError
from psycopg_pool import PoolTimeout

from app.storage import database
from app.storage.availability import DatabaseAvailabilityMiddleware


def test_exhausted_pool_is_replaced_on_next_request(monkeypatch):
    class Pool:
        closed = False

        def getconn(self):
            raise PoolTimeout('private connection details')

        def close(self):
            self.closed = True

    failed = Pool()
    monkeypatch.setattr(database, '_pool', failed)
    with pytest.raises(PoolTimeout):
        with database.pooled_connection():
            pytest.fail('No connection should be yielded')
    assert failed.closed
    assert database._pool is None
    replacement = object()
    monkeypatch.setattr(database, '_pool', replacement)
    assert database.pool() is replacement


def test_transaction_failure_is_not_replayed(monkeypatch):
    class Pool:
        acquired = 0
        returned = 0

        def getconn(self):
            self.acquired += 1
            return object()

        def putconn(self, conn):
            self.returned += 1

    current = Pool()
    monkeypatch.setattr(database, '_pool', current)
    with pytest.raises(OperationalError):
        with database.pooled_connection():
            raise OperationalError('connection lost after write')
    assert current.acquired == current.returned == 1
    assert database._pool is current


def test_concurrent_timeout_does_not_retire_replacement(monkeypatch):
    replacement = object()

    class Pool:
        def getconn(self):
            database._pool = replacement
            raise PoolTimeout()

        def close(self):
            pass

    monkeypatch.setattr(database, '_pool', Pool())
    with pytest.raises(PoolTimeout):
        with database.pooled_connection():
            pass
    assert database._pool is replacement


@pytest.mark.parametrize('failure', [PoolTimeout, OperationalError])
def test_authentication_outage_returns_503_then_recovers(failure):
    unavailable = True

    class Admission:
        def __init__(self, app):
            self.app = app

        async def __call__(self, scope, receive, send):
            if scope['type'] == 'http' and unavailable:
                raise failure('secret database credentials')
            await self.app(scope, receive, send)

    app = FastAPI()

    @app.get('/')
    def home():
        return {'ok': True}

    app.add_middleware(Admission)
    app.add_middleware(DatabaseAvailabilityMiddleware)
    with TestClient(app) as client:
        response = client.get('/')
        assert response.status_code == 503
        assert response.json()['code'] == 'database_unavailable'
        assert response.headers['retry-after'] == '3'
        assert response.headers['cache-control'] == 'no-store'
        assert 'secret' not in response.text
        unavailable = False
        assert client.get('/').status_code == 200


def test_started_response_is_not_replaced():
    import asyncio
    messages = []

    async def app(scope, receive, send):
        await send({'type': 'http.response.start', 'status': 200, 'headers': []})
        raise OperationalError('stream interrupted')

    async def send(message):
        messages.append(message)

    with pytest.raises(OperationalError):
        asyncio.run(DatabaseAvailabilityMiddleware(app)({'type': 'http'}, None, send))
    assert len(messages) == 1


def test_websocket_outage_requests_reconnect():
    import asyncio
    messages = []

    async def app(scope, receive, send):
        raise PoolTimeout('private connection details')

    async def send(message):
        messages.append(message)

    asyncio.run(DatabaseAvailabilityMiddleware(app)({'type': 'websocket'}, None, send))
    assert messages == [{'type': 'websocket.close', 'code': 1013}]
