"""Native text-to-voice preview and registration; no live supplier calls."""
import io
import json
import os
import uuid
import zipfile
from unittest.mock import patch
import httpx
import pytest
from test_cloud_audio_tasks import prepared, submit, execute, supplier as speech_supplier, MP3
from test_cloud_member_gateway import operator, world, headers
from test_cloud_management import platform

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')


def design_body(body):
    return {**body, 'model': 'voice-design', 'mode': 'design', 'voice_catalog_id': '0' * 64, 'prompt': '沉稳、温暖的纪录片旁白', 'preview_text': '欢迎来到这座城市。'}


def directory(voice_ids=()):
    async def response(client, url, **kwargs):
        assert url.endswith('/get_voice')
        return httpx.Response(200, request=httpx.Request('POST', url), json={'base_resp': {'status_code': 0}, 'system_voice': [], 'voice_generation': [{'voice_id': voice_id, 'voice_name': voice_id} for voice_id in voice_ids]})
    return response


def test_audio_voice_design_queues_once_registers_owned_preview_and_preserves_canvas(world, platform):
    from app.storage import database, tasks, media
    from app.storage.workspace import workspace_scope
    path, canvas, lease, original, _ = prepared(world, platform, voice_design=True)
    body = design_body(original);calls = []
    params = {'provider_id': body['provider_id'], 'model': original['model']}
    with patch.object(httpx.AsyncClient, 'post', directory()):
        catalog = world['editor'].get('/api/canvas-audio-voices', params=params, headers=headers(world['a'])).json()
    body['voice_catalog_id'] = catalog['catalog_id']
    receipt = submit(world, body, lease);assert receipt.status_code == 200, receipt.text
    assert submit(world, body, lease).json()['task_id'] == body['client_task_id']
    async def supplier(client, url, **kwargs):
        calls.append(kwargs['json']);assert url.endswith('/voice_design')
        assert set(kwargs['json']) == {'voice_id', 'prompt', 'preview_text'}
        return httpx.Response(200, request=httpx.Request('POST', url), json={'base_resp': {'status_code': 0}, 'voice_id': kwargs['json']['voice_id'], 'trial_audio': MP3.read_bytes().hex()})
    with patch.object(httpx.AsyncClient, 'post', supplier):
        result = execute(world, body['client_task_id'])
    assert result['status'] == 'succeeded' and len(calls) == 1
    assert result['result']['audio_info']['mode'] == 'design'
    voice_id = result['result']['audio_info']['voice_id'];assert voice_id.startswith('canvas-voice-')
    assert 'usage_characters' not in result['result']['audio_info']
    assert world['editor'].get(path, headers=headers(world['a'])).json()['canvas']['nodes'] == canvas['nodes']
    assert world['viewer'].get(path + '/task-results', headers=headers(world['a'])).json()['results'] == []
    assert world['viewer'].get('/api/canvas-generation-history', headers=headers(world['a'])).json()['items'] == []
    params = {'provider_id': body['provider_id'], 'model': original['model']}
    with patch.object(httpx.AsyncClient, 'post', directory([voice_id, 'canvas-voice-foreign-workspace'])):
        catalog = world['editor'].get('/api/canvas-audio-voices', params=params, headers=headers(world['a'])).json()
    assert catalog['can_design'] is True
    assert catalog['voices'] == [] and catalog['has_design_tasks'] is True
    assert submit(world, {**original, 'client_task_id': 'canvas_audio_' + uuid.uuid4().hex, 'timbre_id': voice_id}, lease).status_code == 403
    assert submit(world, {**original, 'client_task_id': 'canvas_audio_' + uuid.uuid4().hex, 'timbre_id': 'canvas-voice-foreign-workspace'}, lease).status_code == 403
    registration = {**params, 'catalog_id': catalog['catalog_id'], 'task_id': body['client_task_id'], 'name': '城市旁白', 'language': 'Chinese', 'accent': 'CHINESE_NORTHERN', 'gender': 'MALE', 'age': 'ADULT', 'description': '温暖而清晰'}
    saved = world['editor'].put('/api/canvas-audio-voices/registration', json=registration, headers=headers(world['a']));assert saved.status_code == 200, saved.text
    assert saved.json()['voice_id'] == voice_id
    renamed = world['editor'].put('/api/canvas-audio-voices/registration', json={**registration, 'name': '纪录片旁白'}, headers=headers(world['a']));assert renamed.status_code == 200, renamed.text
    with patch.object(httpx.AsyncClient, 'post', directory([voice_id, 'canvas-voice-foreign-workspace'])):
        listed = world['editor'].get('/api/canvas-audio-voices', params=params, headers=headers(world['a'])).json()
    assert len(listed['voices']) == 1
    voice = listed['voices'][0];assert voice['id'] == voice_id and voice['name'] == '纪录片旁白'
    assert voice['task_id'] == body['client_task_id'] and voice['category'] == 'clone' and voice['source'] == 'design'
    content = world['viewer'].get(voice['preview_url'], headers=headers(world['a']));assert content.status_code == 200 and content.content == MP3.read_bytes()
    jobs = world['editor'].get('/api/canvas-audio-voices/design-tasks', params={**params, 'canvas_id': canvas['id'], 'node_id': 'source'}, headers=headers(world['a']));assert jobs.status_code == 200, jobs.text
    assert jobs.json()['tasks'][0]['task_id'] == body['client_task_id']
    assert jobs.json()['tasks'][0]['preview_text'] == body['preview_text']
    assert world['viewer'].put('/api/canvas-audio-voices/registration', json=registration, headers=headers(world['a'])).status_code == 403
    assert world['outsider'].put('/api/canvas-audio-voices/registration', json=registration, headers=headers(world['b'])).status_code in {403,404}
    exported = world['editor'].post('/api/account/data/export');assert exported.status_code == 200
    with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
        manifest = json.loads(archive.read('manifest.json'))
    assert manifest['audio_voice_registrations'][0]['name'] == '纪录片旁白'
    assert 'account_ref' not in json.dumps(manifest)
    with workspace_scope(world['a']['id']), database.connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s', (body['client_task_id'],)).fetchone()['n'] == 1
        assert conn.execute('SELECT count(*) AS n FROM ledger_entries WHERE canvas_id=%s', (canvas['id'],)).fetchone()['n'] == 1
        assert conn.execute('SELECT count(*) AS n FROM audio_voice_registrations WHERE task_id=%s', (body['client_task_id'],)).fetchone()['n'] == 1
        cost = conn.execute("SELECT cost_json FROM ledger_entries WHERE log_json->>'canvas_task_id'=%s", (body['client_task_id'],)).fetchone()['cost_json']
        assert cost['status'] == 'unknown' and not cost.get('amount_micros')
        assert result['billing_price']['model'] == 'voice-design' and result['billing_price']['billing_type'] == 'per_10k_characters'
    speech = {**original, 'client_task_id': 'canvas_audio_' + uuid.uuid4().hex, 'timbre_id': voice_id}
    admitted = submit(world, speech, lease);assert admitted.status_code == 200, admitted.text
    speech_calls = []
    with patch.object(httpx.AsyncClient, 'post', speech_supplier(speech_calls)):
        spoken = execute(world, speech['client_task_id'])
    assert spoken['status'] == 'succeeded'
    assert speech_calls[0]['body']['voice_setting']['voice_id'] == voice_id
    document = world['editor'].get(path, headers=headers(world['a'])).json()['canvas']
    assert len(document['nodes'][0]['images']) == 1
    assert document['nodes'][0]['images'][0]['media_asset_id'] != media.id_from_ref(result['result']['audios'][0])
    with workspace_scope(world['a']['id']), database.connection() as conn:
        conn.execute('UPDATE assets SET deleted_at=now() WHERE id=%s', (media.id_from_ref(result['result']['audios'][0]),))
    with patch.object(httpx.AsyncClient, 'post', directory([voice_id])):
        after_delete = world['editor'].get('/api/canvas-audio-voices', params=params, headers=headers(world['a'])).json()
    assert after_delete['voices'][0]['name'] == '纪录片旁白'
    assert after_delete['voices'][0]['preview_url'] == spoken['result']['audios'][0]
    from test_cloud_account_data import closure
    closed = closure(world['editor']);assert closed.status_code == 200, closed.text
    with workspace_scope(world['a']['id']), database.connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM audio_voice_registrations WHERE member_id=%s', (world['people'][0]['id'],)).fetchone()['n'] == 0


def test_audio_voice_design_rejects_unassigned_model_and_invalid_preview_without_tasks(world, platform):
    from app.storage import database
    from app.storage.workspace import workspace_scope
    _, _, lease, original, _ = prepared(world, platform)
    body = design_body(original)
    assert submit(world, body, lease).status_code in {400,403}
    assert submit(world, {**body, 'preview_text': 'x' * 501}, lease).status_code == 422
    assert submit(world, {**body, 'preview_text': ''}, lease).status_code == 422
    with workspace_scope(world['a']['id']), database.connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM tasks WHERE id=%s', (body['client_task_id'],)).fetchone()['n'] == 0


def test_audio_voice_design_catalog_proof_and_active_node_reservation_prevent_duplicates(world, platform):
    from app.storage import database
    from app.storage.workspace import workspace_scope
    _, canvas, lease, original, _ = prepared(world, platform, voice_design=True)
    body = design_body(original)
    assert submit(world, body, lease).status_code == 409
    params = {'provider_id': body['provider_id'], 'model': original['model']}
    with patch.object(httpx.AsyncClient, 'post', directory()):
        catalog = world['editor'].get('/api/canvas-audio-voices', params=params, headers=headers(world['a'])).json()
    body['voice_catalog_id'] = catalog['catalog_id']
    accepted = submit(world, body, lease);assert accepted.status_code == 200, accepted.text
    duplicate = {**body, 'client_task_id': 'canvas_audio_' + uuid.uuid4().hex}
    blocked = submit(world, duplicate, lease);assert blocked.status_code == 409 and 'voice_design_task_pending' in blocked.text
    assert submit(world, body, lease).json()['task_id'] == body['client_task_id']
    with workspace_scope(world['a']['id']), database.connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM tasks WHERE canvas_id=%s', (canvas['id'],)).fetchone()['n'] == 1
        assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s', (body['client_task_id'],)).fetchone()['n'] == 0
