"""Real assigned-account voice catalog, personal favorites and owned audition audio."""
import os
import io
import json
import zipfile
from unittest.mock import patch
import httpx
import pytest
from test_cloud_audio_tasks import prepared, submit, execute, supplier, KEY, MP3
from test_cloud_member_gateway import operator, world, headers
from test_cloud_management import platform

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def voices():
    return {'base_resp': {'status_code': 0}, 'system_voice': [
        {'voice_id': 'male-qn-qingse', 'voice_name': '青涩青年', 'description': ['清晰男声'], 'gender': 'MALE'},
        {'voice_id': 'English_CalmWoman', 'voice_name': 'Calm Woman', 'description': ['Calm voice'], 'preview_url': 'http://127.0.0.1/private'}],
        'voice_cloning': [{'voice_id': 'clone-private', 'voice_name': '我的音色'}]}


def catalog(world, body, client=None):
    return (client or world['editor']).get('/api/canvas-audio-voices', headers=headers(world['a']), params={
        'provider_id': body['provider_id'], 'model': body['model']})


def reply(calls, change=None):
    async def response(client, url, **kwargs):
        calls.append((url, kwargs))
        if change:
            change()
        return httpx.Response(200, request=httpx.Request('POST', url), json=voices())
    return response


def test_audio_voice_catalog_favorites_and_samples_belong_to_member_and_account(world, platform):
    from app.services import members
    _, _, lease, body, _ = prepared(world, platform)
    assert submit(world, body, lease).status_code == 200
    with patch.object(httpx.AsyncClient, 'post', supplier([])):
        task = execute(world, body['client_task_id'])
    calls = []
    with patch.object(httpx.AsyncClient, 'post', reply(calls)):
        response = catalog(world, body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert calls[0][0].endswith('/v1/get_voice') and calls[0][1]['json'] == {'voice_type': 'all'}
    assert calls[0][1]['headers']['Authorization'] == 'Bearer ' + KEY
    assert KEY not in response.text and 'account_ref' not in response.text
    voice = result['voices'][0]
    assert voice['name'] == '青涩青年' and voice['preview_url'] == task['result']['audios'][0]
    assert world['viewer'].get(voice['preview_url'], headers=headers(world['a'])).content == MP3.read_bytes()
    assert result['voices'][1]['language'] == 'English' and result['voices'][1]['preview_url'] == ''
    favorite = {'provider_id': body['provider_id'], 'model': body['model'], 'catalog_id': result['catalog_id'], 'voice_id': voice['id'], 'favorite': True}
    for _ in range(2):
        assert world['editor'].put('/api/canvas-audio-voices/favorite', headers=headers(world['a']), json=favorite).status_code == 200
    with patch.object(httpx.AsyncClient, 'post', reply([])):
        assert catalog(world, body).json()['voices'][0]['favorite'] is True
    members.assign_roles(world['operator'], world['people'][1]['id'], [world['a']['roles']['editor']], world['a']['id'])
    with patch.object(httpx.AsyncClient, 'post', reply([])):
        assert catalog(world, body, world['viewer']).json()['voices'][0]['favorite'] is False
    assert world['editor'].put('/api/canvas-audio-voices/favorite', headers=headers(world['a']), json={**favorite, 'favorite': False}).status_code == 200
    with patch.object(httpx.AsyncClient, 'post', reply([])):
        assert catalog(world, body).json()['voices'][0]['favorite'] is False


def test_audio_voice_catalog_refuses_unassigned_hidden_and_readonly_without_supplier(world, platform):
    _, _, _, body, config = prepared(world, platform)
    with patch.object(httpx.AsyncClient, 'post', side_effect=AssertionError('unauthorized catalog lookup')):
        assert catalog(world, body, world['viewer']).status_code == 403
        assert catalog(world, {**body, 'provider_id': 'unassigned'}).status_code == 403
        assert catalog(world, {**body, 'model': 'music-2.6'}).status_code == 400
        config['model_policies'] = {'audio:speech-2.8-hd': {'visible': False, 'enabled': True}}
        assert platform['client'].put('/api/providers/' + body['provider_id'], json={
            'config': config, 'expected_version': 1, 'reason': '隐藏语音模型'}).status_code == 200
        assert catalog(world, body).status_code == 403


def test_audio_voice_account_rotation_discards_late_catalog_and_isolates_favorites(world, platform):
    _, _, _, body, config = prepared(world, platform)
    with patch.object(httpx.AsyncClient, 'post', reply([])):
        first = catalog(world, body).json()
    favorite = {'provider_id': body['provider_id'], 'model': body['model'], 'catalog_id': first['catalog_id'], 'voice_id': 'male-qn-qingse', 'favorite': True}
    assert world['editor'].put('/api/canvas-audio-voices/favorite', headers=headers(world['a']), json=favorite).status_code == 200
    def rotate():
        assert platform['client'].put('/api/providers/' + body['provider_id'], json={
            'config': config, 'expected_version': 1, 'secrets': {'api_key': 'other-audio-account'}, 'reason': '更换音频账号'}).status_code == 200
    with patch.object(httpx.AsyncClient, 'post', reply([], rotate)):
        assert catalog(world, body).status_code == 409
    assert world['editor'].put('/api/canvas-audio-voices/favorite', headers=headers(world['a']), json=favorite).status_code == 409
    with patch.object(httpx.AsyncClient, 'post', reply([])):
        second = catalog(world, body).json()
    assert second['catalog_id'] != first['catalog_id'] and second['voices'][0]['favorite'] is False


def test_audio_voice_catalog_failure_does_not_leak_supplier_details_or_generate(world, platform):
    _, _, _, body, _ = prepared(world, platform)
    with patch.object(httpx.AsyncClient, 'post', side_effect=httpx.ReadTimeout('private ' + KEY)) as post:
        response = catalog(world, body)
    assert response.status_code == 502 and KEY not in response.text and post.call_count == 1
    from app.storage.database import connection
    with connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM tasks WHERE provider_id=%s", (body['provider_id'],)).fetchone()['n'] == 0


def test_audio_voice_catalog_filters_deleted_preview_assets(world, platform):
    from app.storage.database import connection
    _, _, lease, body, _ = prepared(world, platform)
    assert submit(world, body, lease).status_code == 200
    with patch.object(httpx.AsyncClient, 'post', supplier([])):
        task = execute(world, body['client_task_id'])
    with connection() as conn:
        conn.execute("UPDATE assets SET deleted_at=now() WHERE id IN (SELECT asset_id FROM generation_outputs WHERE task_id=%s)", (task['id'],))
    with patch.object(httpx.AsyncClient, 'post', reply([])):
        assert catalog(world, body).json()['voices'][0]['preview_url'] == ''


def test_audio_voice_catalog_does_not_offer_a_muted_result_as_an_audition(world, platform):
    _, _, lease, body, _ = prepared(world, platform)
    body['vol'] = 0
    assert submit(world, body, lease).status_code == 200
    with patch.object(httpx.AsyncClient, 'post', supplier([])):
        task = execute(world, body['client_task_id'])
    assert task['status'] == 'succeeded' and task['result']['audio_info']['muted'] is True
    with patch.object(httpx.AsyncClient, 'post', reply([])):
        assert catalog(world, body).json()['voices'][0]['preview_url'] == ''


def test_audio_voice_favorites_export_and_account_closure_remove_only_owner_preferences(world, platform):
    from test_cloud_account_data import closure
    from app.storage.database import connection
    from app.services import members
    _, _, _, body, _ = prepared(world, platform)
    with patch.object(httpx.AsyncClient, 'post', reply([])):
        result = catalog(world, body).json()
    favorite = {'provider_id': body['provider_id'], 'model': body['model'], 'catalog_id': result['catalog_id'], 'voice_id': 'male-qn-qingse', 'favorite': True}
    assert world['editor'].put('/api/canvas-audio-voices/favorite', headers=headers(world['a']), json=favorite).status_code == 200
    members.assign_roles(world['operator'], world['people'][1]['id'], [world['a']['roles']['editor']], world['a']['id'])
    assert world['viewer'].put('/api/canvas-audio-voices/favorite', headers=headers(world['a']), json=favorite).status_code == 200
    exported = world['editor'].post('/api/account/data/export')
    assert exported.status_code == 200, exported.text if exported.status_code != 200 else ''
    with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
        manifest = json.loads(archive.read('manifest.json'))
    assert manifest['audio_voice_favorites'] == [{'workspace_id': world['a']['id'], 'provider_id': body['provider_id'], 'voice_id': favorite['voice_id']}]
    assert 'account_ref' not in json.dumps(manifest) and KEY not in json.dumps(manifest)
    assert closure(world['editor']).status_code == 200
    with connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM audio_voice_favorites WHERE member_id=%s', (world['people'][0]['id'],)).fetchone()['n'] == 0
        assert conn.execute('SELECT count(*) AS n FROM audio_voice_favorites WHERE member_id=%s', (world['people'][1]['id'],)).fetchone()['n'] == 1
