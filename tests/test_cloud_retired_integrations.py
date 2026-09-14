"""Retired integrations cannot be restored by old configuration or cached clients."""
import os
import pytest
from fastapi import HTTPException
from test_cloud_member_gateway import operator, world, headers
from test_cloud_management import platform
pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def test_removed_routes_are_absent_from_real_application(world):
    from main import app
    paths = set(app.openapi()['paths'])
    retired = {'/generate', '/api/generate', '/api/ms/generate', '/api/angle/generate', '/api/angle/poll_status', '/api/upload', '/api/comfyui/instances', '/api/workflows', '/api/config/token'}
    assert not paths & retired
    assert {'/api/ai/upload', '/api/online-image', '/api/canvas-image-tasks', '/api/canvas-video-tasks'} <= paths
    for path in retired:
        assert world['editor'].post(path, json={}, headers=headers(world['a'])).status_code in {403,404,405,503}


@pytest.mark.parametrize('pid', ['modelscope', 'comfyui'])
def test_retired_provider_cannot_be_created_or_resolved(platform, monkeypatch, pid):
    from app.providers import registry
    from app.services.media import resolve_chat_provider
    config = {'name':'removed', 'base_url':'https://retired.invalid', 'protocol':'openai'}
    response = platform['client'].put('/api/providers/' + pid, json={'config':config, 'expected_version':0, 'reason':'测试已移除集成'})
    assert response.status_code == 400
    monkeypatch.setattr(registry, 'load_api_providers', lambda: [{'id':'available','enabled':True,'primary':True}])
    for fn in (lambda: registry.get_api_provider(pid), lambda: registry.get_api_provider_exact(pid), lambda: resolve_chat_provider(pid, 'old-model')):
        with pytest.raises(HTTPException) as error:
            fn()
        assert error.value.status_code == 410
    assert not {'modelscope','comfyui'} & {p['id'] for p in registry.default_api_providers()}
    assert registry.get_primary_provider_id([{'id':pid,'enabled':True,'primary':True},{'id':'available','enabled':True}]) == 'available'


def test_historical_managed_provider_and_grants_stay_stored_but_cannot_be_used(world, platform):
    from app.storage.database import connection
    from app.storage.workspace import workspace_scope
    from app.services import provider_control
    from psycopg.types.json import Jsonb
    pid='modelscope'
    config={'id':pid,'name':'旧供应商','enabled':True,'protocol':'openai','base_url':'https://retired.invalid','image_models':['old-model']}
    with connection() as conn:
        conn.execute('INSERT INTO managed_providers(id,config,version,secret_ciphertext,secret_fields,updated_by) VALUES(%s,%s,1,%s,%s,%s)', (pid,Jsonb(config),'',[],world['operator'].member_id))
        conn.execute('INSERT INTO workspace_provider_grants(workspace_id,provider_id) VALUES(%s,%s)',(world['a']['id'],pid))
        conn.execute('UPDATE workspace_provider_sets SET primary_provider_id=%s WHERE workspace_id=%s',(pid,world['a']['id']))
    try:
        assert pid not in {p['id'] for p in platform['client'].get('/api/providers').json()['providers']}
        summary=world['editor'].get('/api/config',headers=headers(world['a'])).json()
        assert pid not in {p['id'] for p in summary['providers']}
        assignments=provider_control.assignments(world['operator'],world['a']['id'])
        assert pid not in assignments['provider_ids'] and assignments['primary_provider_id'] is None
        response=platform['client'].post('/api/providers/'+pid+'/probe',json={'expected_version':1,'reason':'已移除集成禁止请求'})
        assert response.status_code == 410
        with workspace_scope(world['a']['id']),pytest.raises(HTTPException) as error:
            provider_control.credential(pid)
        assert error.value.status_code == 410
        with pytest.raises(HTTPException) as error:
            provider_control.assign(world['operator'],world['a']['id'],[pid],pid,1,reason='拒绝重新分配')
        assert error.value.status_code == 410
        with connection() as conn:
            assert conn.execute('SELECT config FROM managed_providers WHERE id=%s',(pid,)).fetchone()['config']==config
    finally:
        with connection() as conn:
            conn.execute('UPDATE workspace_provider_sets SET primary_provider_id=NULL WHERE workspace_id=%s',(world['a']['id'],))
            conn.execute('DELETE FROM workspace_provider_grants WHERE provider_id=%s',(pid,))
            conn.execute('DELETE FROM managed_providers WHERE id=%s',(pid,))
