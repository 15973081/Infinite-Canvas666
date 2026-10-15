"""Exercise parameter loading through member admission and versioned static serving."""
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.routing import Mount

from app.services import member_gateway
from app.services.static_pages import VersionedStaticFiles


@pytest.fixture
def schema_client(monkeypatch):
    root = Path(__file__).resolve().parents[1]
    static = Starlette(routes=[Mount('/static', VersionedStaticFiles(directory=root / 'static'))])
    actor = SimpleNamespace(member_id='schema-viewer')
    monkeypatch.setattr(member_gateway, 'principal', lambda scope: actor)

    async def admitted(scope, receive, send):
        if scope['type'] == 'http':
            return await member_gateway.dispatch(static, scope, receive, send)
        return await static(scope, receive, send)

    with TestClient(admitted) as client:
        yield client


@pytest.mark.parametrize('filename', ['generation-schema.json', 'reshoot-schema.json'])
def test_authenticated_parameter_schema_loads_as_json(schema_client, filename):
    path = '/static/vendor/pixmax/' + filename
    response = schema_client.get(path)
    assert response.status_code == 200, response.text[:200]
    assert 'application/json' in response.headers['content-type']
    value = response.json()
    if filename == 'generation-schema.json':
        assert any(model['modelCode'] == 'PIXDANCE_2_5' for model in value['models'])
    else:
        assert value['modelCode'] == 'PIXDANCE_2_5'
        assert len(value['fields']) == 5
    assert schema_client.head(path).status_code == 200


@pytest.mark.parametrize('filename', ['generation-schema.json', 'reshoot-schema.json'])
def test_parameter_schemas_still_require_login(schema_client, monkeypatch, filename):
    monkeypatch.setattr(member_gateway, 'principal', lambda scope: None)
    assert schema_client.get('/static/vendor/pixmax/' + filename).status_code == 401


@pytest.mark.parametrize('path', ['/static/private.json', '/static/vendor/pixmax/private.json',
                                  '/static/vendor/pixmax/manifest.json'])
def test_other_json_files_remain_blocked(schema_client, path):
    response = schema_client.get(path)
    assert response.status_code == 403
    assert response.json()['detail']['code'] == 'static_resource_forbidden'
