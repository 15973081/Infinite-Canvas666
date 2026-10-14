"""Real member audio admission, paid POST fencing and durable MP3 recovery."""
import asyncio
import copy
import os
import subprocess
from pathlib import Path
import uuid
from unittest.mock import patch

import httpx
import pytest
from test_cloud_member_gateway import operator, world, headers
from test_cloud_canvas_leases import setup_canvas, acquire, proof
from test_cloud_management import platform

pytestmark = pytest.mark.skipif(os.getenv('CLOUD_INTEGRATION_TEST') != '1', reason='Use tools/cloud_test.py')
KEY = 'audio-test-only-secret'
MP3 = Path(__file__).parent / 'fixtures' / 'pixmax-generated-audio.mp3'


def prepared(world, platform, mode='speech', music_mode='CUSTOM', voice_design=False, voice_clone=False):
    pid = 'audio-' + uuid.uuid4().hex[:16]
    config = {'name': '音频验收', 'base_url': 'https://supplier.test/v1', 'protocol': 'minimax', 'enabled': True,
              'audio_models': ['speech-2.8-hd', 'music-2.6'], 'model_prices': [
                  {'kind': 'audio', 'model': 'speech-2.8-hd', 'billing_type': 'per_10k_characters', 'unit_price': '6', 'currency': 'CNY'},
                  {'kind': 'audio', 'model': 'music-2.6', 'billing_type': 'per_call', 'unit_price': '.7', 'currency': 'CNY'}]}
    if voice_design:
        config['audio_models'].append('voice-design')
        config['model_prices'].append({'kind': 'audio', 'model': 'voice-design', 'billing_type': 'per_10k_characters', 'unit_price': '.3', 'currency': 'CNY'})
    if voice_clone:
        config['audio_models'].append('voice-clone')
        config['model_prices'].append({'kind': 'audio', 'model': 'voice-clone', 'billing_type': 'per_call', 'unit_price': '1.2', 'currency': 'CNY'})
    configured = platform['client'].put('/api/providers/' + pid, json={
        'config': config, 'expected_version': 0, 'secrets': {'api_key': KEY}, 'reason': '音频隔离验收'})
    assert configured.status_code == 200, configured.text
    assigned = platform['client'].put('/api/provider-assignments', params={'workspace': world['a']['id']}, json={
        'expected_version': 1, 'provider_ids': [pid], 'primary_provider_id': pid, 'reason': '音频隔离验收'})
    assert assigned.status_code == 200, assigned.text
    path, canvas = setup_canvas(world, 'smart')
    lease = acquire(world, path)
    node = {'id': 'source', 'type': 'smart-audio', 'images': [], 'audioGeneration': {'prompt': '欢迎来到雨夜', 'model': 'speech-2.8-hd'}}
    saved = world['editor'].put(path, headers=proof(world, lease), json={
        'nodes': [node], 'connections': [], 'base_revision': canvas['revision']})
    assert saved.status_code == 200, saved.text
    canvas = saved.json()['canvas']
    body = {'canvas_id': canvas['id'], 'client_task_id': 'canvas_audio_' + uuid.uuid4().hex,
            'canvas_target': {'source_node_id': 'source', 'target_node_id': 'source', 'base_revision': canvas['revision']},
            'provider_id': pid, 'model': 'speech-2.8-hd' if mode == 'speech' else 'music-2.6', 'mode': mode,
            'prompt': '欢迎来到雨夜' if mode == 'speech' else '温暖的电影配乐', 'music_mode': music_mode,
            'lyrics': '[verse]\n雨夜的灯光照亮城市' if music_mode == 'CUSTOM' else '',
            'speed': 1.25, 'vol': 2, 'pitch': -2, 'voice_modify_pitch': 7, 'voice_modify_intensity': -4,
            'voice_modify_timbre': 5, 'voice_modify_sound_effects': 'lofi_telephone'}
    return path, canvas, lease, body, config


def submit(world, body, lease):
    return world['editor'].post('/api/canvas-audio-tasks', headers=proof(world, lease, body['canvas_target']['base_revision']), json=body)


def execute(world, task_id):
    from app.storage import tasks, database, worker
    from app.storage.workspace import workspace_scope
    with workspace_scope(world['a']['id']):
        with database.connection() as conn:
            conn.execute("UPDATE tasks SET available_at='2000-01-01' WHERE id=%s", (task_id,))
        row = tasks.claim('audio-acceptance')
        assert row and row['id'] == task_id
        asyncio.run(worker.execute(row))
        return tasks.get(task_id)


def supplier(calls, *, invalid=False):
    async def response(client, url, **kwargs):
        calls.append({'url': url, 'body': copy.deepcopy(kwargs['json'])})
        return httpx.Response(200, request=httpx.Request('POST', url), json={
            'base_resp': {'status_code': 0}, 'data': {'status': 2, 'audio': b'invalid mp3'.hex() if invalid else MP3.read_bytes().hex()},
            'extra_info': {'audio_length': 400, 'music_duration': 400, 'usage_characters': 12}, 'trace_id': 'test-trace'})
    return response


def test_audio_task_keeps_voice_controls_owned_results_attribution_and_character_cost(world, platform):
    from app.storage.database import connection
    from app.storage.workspace import workspace_scope
    path, canvas, lease, body, _ = prepared(world, platform)
    public = world['editor'].get('/api/config', headers=headers(world['a'])).json()
    assert public['audio_models'] == ['speech-2.8-hd', 'music-2.6'] and KEY not in str(public)
    receipt = submit(world, body, lease)
    assert receipt.status_code == 200, receipt.text
    assert receipt.json()['canvas_binding']['version'] == 3
    assert submit(world, body, lease).json()['task_id'] == body['client_task_id']
    pending_node = {**canvas['nodes'][0], 'pendingTasks': [{'taskId': body['client_task_id'], 'type': 'audio'}], 'pending': 1}
    pending = world['editor'].put(path, headers=proof(world, lease, canvas['revision']), json={
        'nodes': [pending_node], 'connections': [], 'base_revision': canvas['revision']})
    assert pending.status_code == 200, pending.text
    calls = []
    with patch.object(httpx.AsyncClient, 'post', supplier(calls)):
        task = execute(world, body['client_task_id'])
    assert task['status'] == 'succeeded', task
    assert len(calls) == 1 and calls[0]['url'].endswith('/v1/t2a_v2')
    assert calls[0]['body']['voice_setting'] == {'voice_id': 'male-qn-qingse', 'speed': 1.25, 'vol': 2, 'pitch': -2}
    assert calls[0]['body']['voice_modify'] == {'pitch': 7, 'intensity': -4, 'timbre': 5, 'sound_effects': 'lofi_telephone'}
    result = task['result']['audios'][0]
    assert world['viewer'].get(result, headers=headers(world['a'])).content == MP3.read_bytes()
    document = world['viewer'].get(path, headers=headers(world['a'])).json()['canvas']
    assert len(document['nodes']) == 1 and document['nodes'][0]['type'] == 'smart-audio'
    assert document['nodes'][0]['images'][0]['kind'] == 'audio'
    assert document['nodes'][0]['audioGeneration'] == canvas['nodes'][0]['audioGeneration']
    with workspace_scope(world['a']['id']), connection() as conn:
        attribution = conn.execute('SELECT media_kind,member_id FROM generation_outputs WHERE task_id=%s', (task['id'],)).fetchone()
        assert attribution['media_kind'] == 'audio' and attribution['member_id'] == world['people'][0]['id']
        cost = conn.execute("SELECT cost_json FROM ledger_entries WHERE canvas_id=%s AND log_json->>'canvas_task_id'=%s", (canvas['id'], task['id'])).fetchone()['cost_json']
        assert cost['kind'] == 'audio' and cost['amount_micros'] == 7200 and cost['quantity'] == .0012
    assert KEY not in str(task) and not task['result']['audios'][0].startswith('data:')


@pytest.mark.parametrize('mode', ['CUSTOM', 'ADAPTIVE', 'INSTRUMENTAL'])
def test_audio_music_modes_use_the_native_lyrics_contract(world, platform, mode):
    _, _, lease, body, _ = prepared(world, platform, 'music', mode)
    created = submit(world, body, lease)
    assert created.status_code == 200, created.text
    calls = []
    with patch.object(httpx.AsyncClient, 'post', supplier(calls)):
        task = execute(world, body['client_task_id'])
    assert task['status'] == 'succeeded', task
    wire = calls[0]['body']
    assert len(calls) == 1 and calls[0]['url'].endswith('/v1/music_generation')
    assert wire['lyrics_optimizer'] == (mode == 'ADAPTIVE')
    assert wire['is_instrumental'] == (mode == 'INSTRUMENTAL')
    assert ('lyrics' in wire) == (mode == 'CUSTOM') and 'voice_setting' not in wire


def test_audio_submission_refuses_readonly_unassigned_and_changed_inputs(world, platform):
    path, canvas, lease, body, _ = prepared(world, platform)
    assert world['viewer'].post('/api/canvas-audio-tasks', headers=headers(world['a']), json=body).status_code == 403
    wrong = {**body, 'provider_id': 'unassigned'}
    assert submit(world, wrong, lease).status_code in {400, 403}
    assert submit(world, {**body, 'model': 'not-opened'}, lease).status_code == 403
    assert submit(world, {**body, 'speed': 0}, lease).status_code == 422
    assert submit(world, {**body, 'api_key': 'client-secret'}, lease).status_code == 422
    changed = world['editor'].put(path, headers=proof(world, lease, canvas['revision']), json={
        'nodes': [{'id': 'source', 'type': 'smart-audio', 'images': [], 'audioGeneration': {'prompt': 'changed'}}],
        'connections': [], 'base_revision': canvas['revision']})
    assert changed.status_code == 200
    assert submit(world, body, lease).status_code == 409


def test_audio_result_publication_recovers_without_another_paid_submission(world, platform):
    from app.storage import media
    from app.storage.workspace import workspace_scope
    _, _, lease, body, config = prepared(world, platform)
    assert submit(world, body, lease).status_code == 200
    calls, original = [], media.publish
    def fail_output(*args, **kwargs):
        if kwargs.get('role') == 'generated':
            raise RuntimeError('simulated object publication failure')
        return original(*args, **kwargs)
    with patch.object(httpx.AsyncClient, 'post', supplier(calls)), patch.object(media, 'publish', fail_output):
        pending = execute(world, body['client_task_id'])
    assert pending['status'] == 'finalizing', pending
    assert platform['client'].put('/api/providers/' + body['provider_id'], json={
        'config': config, 'expected_version': 1, 'secrets': {'api_key': 'rotated-test-account'}, 'reason': '恢复已保存音频'}).status_code == 200
    with patch.object(httpx.AsyncClient, 'post', side_effect=AssertionError('second paid request')):
        completed = execute(world, body['client_task_id'])
    assert completed['status'] == 'succeeded' and len(calls) == 1
    with workspace_scope(world['a']['id']):
        assert media.get_asset(completed['result']['audios'][0])['kind'] == 'audio'


def test_audio_invalid_media_is_retained_for_review_and_cannot_be_published(world, platform):
    from app.storage import finalization, media
    from app.storage.workspace import workspace_scope
    _, _, lease, body, _ = prepared(world, platform)
    assert submit(world, body, lease).status_code == 200
    calls = []
    with patch.object(httpx.AsyncClient, 'post', supplier(calls, invalid=True)):
        task = execute(world, body['client_task_id'])
    assert task['status'] == 'finalizing' and len(calls) == 1
    with workspace_scope(world['a']['id']):
        assert finalization.has_source(task['id'])
        assert not media.get_asset(finalization.output_id(task['id'], 0), ready=False)


def test_audio_zero_volume_publishes_decodable_silence(world, platform):
    _, _, lease, body, _ = prepared(world, platform)
    body['vol'] = 0
    assert submit(world, body, lease).status_code == 200
    calls = []
    with patch.object(httpx.AsyncClient, 'post', supplier(calls)):
        task = execute(world, body['client_task_id'])
    assert task['status'] == 'succeeded', task
    assert calls[0]['body']['voice_setting']['vol'] == 1
    assert task['result']['audio_info']['muted'] is True
    content = world['viewer'].get(task['result']['audios'][0], headers=headers(world['a'])).content
    decoded = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', 'pipe:1'],
                             input=content, capture_output=True, timeout=30,
                             creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    assert decoded.returncode == 0 and len(decoded.stdout) > 1000
    assert not any(decoded.stdout), 'Zero volume must contain silent PCM samples'


def test_audio_revoked_assignment_prevents_supplier_calls(world, platform):
    from app.storage.database import connection
    _, _, lease, body, _ = prepared(world, platform)
    assert submit(world, body, lease).status_code == 200
    assert platform['client'].put('/api/provider-assignments', params={'workspace': world['a']['id']}, json={
        'expected_version': 2, 'provider_ids': [], 'primary_provider_id': None, 'reason': '撤销测试供应商'}).status_code == 200
    with patch.object(httpx.AsyncClient, 'post', side_effect=AssertionError('revoked assignment submitted')):
        task = execute(world, body['client_task_id'])
    assert task['status'] == 'needs_review', task
    with connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM task_submissions WHERE task_id=%s', (task['id'],)).fetchone()['n'] == 0


def test_audio_music_timeout_retains_unknown_cost_without_resubmission(world, platform):
    from app.storage.database import connection
    _, _, lease, body, _ = prepared(world, platform, 'music')
    assert submit(world, body, lease).status_code == 200
    with patch.object(httpx.AsyncClient, 'post', side_effect=httpx.ReadTimeout('test response lost')) as post:
        task = execute(world, body['client_task_id'])
    assert task['status'] == 'needs_review' and post.call_count == 1
    with connection() as conn:
        cost = conn.execute("SELECT cost_json FROM ledger_entries WHERE log_json->>'canvas_task_id'=%s", (task['id'],)).fetchone()['cost_json']
        assert cost['status'] == 'unknown' and cost['reason'] == 'billing_outcome_uncertain'
        assert not cost.get('amount_micros')


def test_audio_price_snapshot_and_deleted_target_result_join(world, platform):
    from app.storage.database import connection
    path, canvas, lease, body, config = prepared(world, platform)
    assert submit(world, body, lease).status_code == 200
    config['model_prices'][0]['unit_price'] = '99'
    assert platform['client'].put('/api/providers/' + body['provider_id'], json={
        'config': config, 'expected_version': 1, 'reason': '改变新任务单价'}).status_code == 200
    with patch.object(httpx.AsyncClient, 'post', supplier([])):
        task = execute(world, body['client_task_id'])
    assert task['status'] == 'succeeded', task
    with connection() as conn:
        fees = conn.execute('SELECT * FROM ledger_entries WHERE canvas_id=%s ORDER BY id', (canvas['id'],)).fetchall()
        assert fees[0]['cost_json']['amount_micros'] == 7200
    catalog = world['viewer'].get(path + '/task-results', headers=headers(world['a'])).json()
    assert catalog['results'][0]['kind'] == 'audio' and catalog['results'][0]['state'] == 'in_canvas'
    latest = world['editor'].get(path, headers=headers(world['a'])).json()['canvas']
    saved = world['editor'].put(path, headers=proof(world, lease, canvas['revision']), json={
        'nodes': [], 'connections': [], 'base_revision': canvas['revision'], 'task_result_version': latest['task_result_version']})
    assert saved.status_code == 200, saved.text
    revision = saved.json()['canvas']['revision']
    assert world['viewer'].get(path + '/task-results', headers=headers(world['a'])).json()['results'][0]['state'] == 'ready'
    joined = world['editor'].post(path + '/task-results/' + task['id'] + '/join', headers=proof(world, lease, revision))
    assert joined.status_code == 200, joined.text
    result = joined.json()['canvas']
    assert result['nodes'][0]['images'][0]['kind'] == 'audio'
    assert world['viewer'].get(result['nodes'][0]['images'][0]['url'], headers=headers(world['a'])).content == MP3.read_bytes()
    repeat = world['editor'].post(path + '/task-results/' + task['id'] + '/join', headers=proof(world, lease, result['revision']))
    assert repeat.status_code == 200 and repeat.json()['already_in_canvas']
    with connection() as conn:
        assert conn.execute('SELECT * FROM ledger_entries WHERE canvas_id=%s ORDER BY id', (canvas['id'],)).fetchall() == fees
